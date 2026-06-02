import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ReceiptLibrary from './pages/ReceiptLibrary';
import DashboardPage from './pages/DashboardPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import BottomNav from './components/BottomNav';
import { backgroundSync } from './lib/cloudSync';
import { loadCloudSettings, saveCloudSettings } from './hooks/useCloudAuth';
import type { CloudProvider } from './utils/types';

function CloudAuthHandler() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('cloud_auth') as CloudProvider | null;
    if (!provider) return;

    // Wait until auth state is resolved before saving and navigating
    if (isLoading) return;

    const payload: Record<string, string> = {};
    for (const key of ['access_token', 'refresh_token', 'expires_in', 'token_type', 'scope', 'email']) {
      const val = params.get(key);
      if (val) payload[key] = val;
    }

    const expiresIn = payload.expires_in;
    const userId = user?.id;
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

    // Always save to unnamespaced key as fallback (iOS PWA loses userId on redirect)
    const fallbackSettings = loadCloudSettings(undefined);
    saveCloudSettings({
      ...fallbackSettings,
      [providerKey]: providerData,
      primaryProvider: fallbackSettings.primaryProvider || provider,
    }, undefined);

    // Also save to user-namespaced key if we have a userId
    if (userId) {
      const userSettings = loadCloudSettings(userId);
      saveCloudSettings({
        ...userSettings,
        [providerKey]: providerData,
        primaryProvider: userSettings.primaryProvider || provider,
      }, userId);
    }

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
    void backgroundSync(user.id);
    const handleFocus = () => { void backgroundSync(user.id); };
    window.addEventListener('focus', handleFocus);
    // Periodic sync every 30 minutes for background/desktop use
    const interval = setInterval(() => { void backgroundSync(user.id); }, 30 * 60 * 1000);
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
      </AuthProvider>
    </BrowserRouter>
  );
}
