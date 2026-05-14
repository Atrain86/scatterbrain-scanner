import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ReceiptLibrary from './pages/ReceiptLibrary';
import DashboardPage from './pages/DashboardPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import BottomNav from './components/BottomNav';
import { processCloudSyncQueue } from './lib/cloudSync';

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
