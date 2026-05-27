import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ReceiptLibrary from './pages/ReceiptLibrary';
import DashboardPage from './pages/DashboardPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import BottomNav from './components/BottomNav';
import { processCloudSyncQueue } from './lib/cloudSync';
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
    const settings = loadCloudSettings(userId);
    const providerKey = provider === 'google-drive' ? 'googleDrive' : 'dropbox';
    saveCloudSettings({
      ...settings,
      [providerKey]: {
        connected: true,
        email: payload.email ?? null,
        accessToken: payload.access_token ?? null,
        refreshToken: payload.refresh_token ?? null,
        expiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : null,
        scope: payload.scope ?? null,
        tokenType: payload.token_type ?? null,
      },
      primaryProvider: settings.primaryProvider || provider,
    }, userId);

    navigate('/settings', { replace: true });
  }, [navigate, user, isLoading]);

  return null;
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!user) return;
    void processCloudSyncQueue(user.id);
    const handleFocus = () => { void processCloudSyncQueue(user.id); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  if (isLoading) return null;
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
