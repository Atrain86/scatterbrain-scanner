import { useCallback, useEffect, useState } from 'react';
import type { CloudProvider, CloudProviderState, CloudSettings } from '../utils/types';
import { resetSyncCaches } from '../lib/cloudSync';

const CLOUD_KEY = 'cloud_settings';

const DEFAULT_PROVIDER_STATE: CloudProviderState = {
  connected: false,
  email: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  scope: null,
  tokenType: null,
};

const DEFAULT_SETTINGS: CloudSettings = {
  googleDrive: { ...DEFAULT_PROVIDER_STATE },
  dropbox: { ...DEFAULT_PROVIDER_STATE },
  primaryProvider: null,
  autoSync: true,
};

function cloudStorageKey(userId?: string): string {
  return userId ? `sb_u${userId}_${CLOUD_KEY}` : `sb_${CLOUD_KEY}`;
}

export function loadCloudSettings(userId?: string): CloudSettings {
  try {
    const raw = localStorage.getItem(cloudStorageKey(userId));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as CloudSettings;
    return {
      googleDrive: { ...DEFAULT_PROVIDER_STATE, ...parsed.googleDrive },
      dropbox: { ...DEFAULT_PROVIDER_STATE, ...parsed.dropbox },
      primaryProvider: parsed.primaryProvider ?? null,
      autoSync: parsed.autoSync ?? true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveCloudSettings(settings: CloudSettings, userId?: string) {
  localStorage.setItem(cloudStorageKey(userId), JSON.stringify(settings));
}

export function useCloudAuth(userId?: string) {
  const [settings, setSettings] = useState<CloudSettings>(() => loadCloudSettings(userId));

  useEffect(() => {
    setSettings(loadCloudSettings(userId));
  }, [userId]);

  useEffect(() => {
    saveCloudSettings(settings, userId);
  }, [settings, userId]);

  const connectToProvider = useCallback((provider: CloudProvider) => {
    const base = 'https://scatterbrain-scanner.onrender.com';
    const endpoint = provider === 'google-drive' ? `${base}/api/auth/google/init` : `${base}/api/auth/dropbox/init`;
    const url = new URL(endpoint);
    url.searchParams.set('clientOrigin', window.location.origin);
    window.location.href = url.toString();
  }, []);

  const disconnectProvider = useCallback((provider: CloudProvider) => {
    resetSyncCaches(userId);
    // Also clear the unnamespaced fallback so a reconnect starts fully clean
    try {
      const fb = loadCloudSettings(undefined);
      saveCloudSettings({
        ...fb,
        [provider === 'google-drive' ? 'googleDrive' : 'dropbox']: { ...DEFAULT_PROVIDER_STATE },
      } as CloudSettings, undefined);
    } catch { /* non-fatal */ }
    setSettings(current => {
      const next = {
        ...current,
        [provider === 'google-drive' ? 'googleDrive' : 'dropbox']: { ...DEFAULT_PROVIDER_STATE },
      } as CloudSettings;
      if (current.primaryProvider === provider) next.primaryProvider = null;
      return next;
    });
  }, []);

  const setPrimaryProvider = useCallback((provider: CloudProvider | null) => {
    setSettings(current => ({ ...current, primaryProvider: provider }));
  }, []);

  const toggleAutoSync = useCallback(() => {
    setSettings(current => ({ ...current, autoSync: !current.autoSync }));
  }, []);

  return { settings, connectToProvider, disconnectProvider, setPrimaryProvider, toggleAutoSync };
}
