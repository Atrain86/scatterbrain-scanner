import { useCallback, useEffect, useState } from 'react';
import type { CloudProvider, CloudProviderState, CloudSettings } from '../utils/types';
import { resetSyncCaches } from '../lib/cloudSync';

// Cloud settings are ALWAYS per-user. There is no unnamespaced fallback bucket
// (previously `sb_cloud_settings`). Cross-user credential leak was the most
// severe bug in the account-freshness audit — this file is the enforcement point.

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

function cloudStorageKey(userId: string): string {
  return `sb_u${userId}_${CLOUD_KEY}`;
}

// userId is REQUIRED. Callers without a resolved user must not read cloud
// settings — the concept of "the cloud settings" outside a user session is
// exactly what created the leak.
export function loadCloudSettings(userId: string): CloudSettings {
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

export function saveCloudSettings(settings: CloudSettings, userId: string): void {
  localStorage.setItem(cloudStorageKey(userId), JSON.stringify(settings));
}

export function useCloudAuth(userId: string) {
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
    setSettings(current => {
      const next = {
        ...current,
        [provider === 'google-drive' ? 'googleDrive' : 'dropbox']: { ...DEFAULT_PROVIDER_STATE },
      } as CloudSettings;
      if (current.primaryProvider === provider) next.primaryProvider = null;
      return next;
    });
  }, [userId]);

  const setPrimaryProvider = useCallback((provider: CloudProvider | null) => {
    setSettings(current => ({ ...current, primaryProvider: provider }));
  }, []);

  const toggleAutoSync = useCallback(() => {
    setSettings(current => ({ ...current, autoSync: !current.autoSync }));
  }, []);

  return { settings, connectToProvider, disconnectProvider, setPrimaryProvider, toggleAutoSync };
}
