import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ReceiptLibrary from './pages/ReceiptLibrary';
import DashboardPage from './pages/DashboardPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import BottomNav from './components/BottomNav';
import { processCloudSyncQueue } from './lib/cloudSync';
import { loadCloudSettings, saveCloudSettings } from './hooks/useCloudAuth';
import type { CloudProvider } from './utils/types';

function CloudAuthHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('cloud_auth') as CloudProvider | null;
    if (!provider) return;

    const payload: Record<string, string> = {};
    for (const key of ['access_token', 'refresh_token', 'expires_in', 'token_type', 'scope', 'email']) {
      const val = params.get(key);
      if (val) payload[key] = val;
    }

    const expiresIn = payload.expires_in;
    const settings = loadCloudSettings();
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
    });

    // Strip params and navigate to settings
    navigate('/settings', { replace: true });
  }, [navigate]);

  return null;
}

export default function App() {
  useEffect(() => {
    void processCloudSyncQueue();
    const handleFocus = () => {
      void processCloudSyncQueue();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <CloudAuthHandler />
        <Routes>
          <Route path="/"          element={<Navigate to="/receipts" replace />} />
          <Route path="/receipts"  element={<ReceiptLibrary />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/export"    element={<ExportPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
          <Route path="*"          element={<Navigate to="/receipts" replace />} />
        </Routes>
        <BottomNav />
      </AuthProvider>
    </BrowserRouter>
  );
}
