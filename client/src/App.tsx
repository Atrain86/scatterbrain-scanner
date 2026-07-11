import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ReceiptLibrary from './pages/ReceiptLibrary';
import DashboardPage from './pages/DashboardPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import BottomNav from './components/BottomNav';
import HandoverConsentModal from './components/HandoverConsentModal';
import { backgroundSync } from './lib/cloudSync';
import { loadCloudSettings, saveCloudSettings } from './hooks/useCloudAuth';
import type { CloudProvider } from './utils/types';

function CloudAuthHandler() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('cloud_auth') as CloudProvider | null;
    console.log('[CloudAuthHandler] effect fired', { provider, isLoading, userId: user?.id, hasToken: !!params.get('access_token') });
    if (!provider) return;

    // Wait until auth state is resolved before saving and navigating
    if (isLoading) { console.log('[CloudAuthHandler] waiting for auth'); return; }

    const payload: Record<string, string> = {};
    for (const key of ['access_token', 'refresh_token', 'expires_in', 'token_type', 'scope', 'email']) {
      const val = params.get(key);
      if (val) payload[key] = val;
    }

    const userId = user?.id;

    // No authenticated user? Refuse to store the tokens. This can only happen
    // if OAuth returned to a signed-out session — treating the tokens as
    // orphan credentials and dropping them prevents them from binding to
    // whoever signs in next. Bounce to login without persisting anything.
    if (!userId) {
      console.warn('[CloudAuthHandler] NO USER — dropping tokens');
      navigate('/', { replace: true });
      return;
    }
    console.log('[CloudAuthHandler] saving tokens for user', userId);

    const expiresIn = payload.expires_in;
    const providerKey = provider === 'google-drive' ? 'googleDrive' : 'dropbox';
    const providerData = {
      connected: true,
      email: payload.email ?? null,
      accessToken: payload.access_token ?? null,
      refreshToken: payload.refresh_token ?? null,
      expiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : null,
      scope: payload.scope ?? null,
      tokenType: payload.token_type ?? null,
    };

    // Save to user-namespaced key ONLY. No unnamespaced fallback bucket —
    // that was the credential-leak vector eliminated in account-safety-v2.
    const userSettings = loadCloudSettings(userId);
    saveCloudSettings({
      ...userSettings,
      [providerKey]: providerData,
      primaryProvider: userSettings.primaryProvider || provider,
    }, userId);

    // Verify write actually landed
    const verify = loadCloudSettings(userId);
    console.log('[CloudAuthHandler] post-save read:', verify.googleDrive.connected, 'accessToken?', !!verify.googleDrive.accessToken);

    // Nudge useCloudAuth hooks to reload — otherwise their stale in-memory
    // state stomps what we just wrote on the next render.
    window.dispatchEvent(new Event('cloud_settings_updated'));

    navigate('/settings', { replace: true });
  }, [navigate, user, isLoading]);

  return null;
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Wake Render server immediately — runs before user taps Scan
    fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/health`).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const runSync = () => {
      backgroundSync(user.id).catch(err => {
        console.error('[backgroundSync] threw:', err);
      });
    };
    runSync();
    const handleFocus = () => { runSync(); };
    window.addEventListener('focus', handleFocus);
    // Periodic sync every 30 minutes for background/desktop use
    const interval = setInterval(runSync, 30 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [user]);

  if (isLoading) return null; // only true for <5ms now (local JWT decode)
  if (!user) return <LoginPage />;

  return (
    <>
      <Routes>
        <Route path="/"          element={<Navigate to="/receipts" replace />} />
        <Route path="/receipts"  element={<ReceiptLibrary />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/export"    element={<ExportPage />} />
        <Route path="/settings"  element={<SettingsPage />} />
        <Route path="*"          element={<Navigate to="/receipts" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CloudAuthHandler />
        <AuthenticatedApp />
        {/* Rendered outside AuthenticatedApp so it can appear during sign-in
            (when user is null and LoginPage is shown) — the whole point of
            the handover consent gate. */}
        <HandoverConsentModal />
      </AuthProvider>
    </BrowserRouter>
  );
}
