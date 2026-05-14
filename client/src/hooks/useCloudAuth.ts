import { useCallback, useEffect, useState } from 'react';
import type { CloudProvider, CloudProviderState, CloudSettings } from '../utils/types';

const STORAGE_KEY = 'sb_cloud_settings';

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

export function loadCloudSettings(): CloudSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

export function saveCloudSettings(settings: CloudSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function normalizeProviderState(payload: Record<string, any>): CloudProviderState {
  const expiresIn = payload.expires_in ?? payload.expiresIn;
  return {
    connected: true,
    email: payload.email ?? null,
    accessToken: payload.access_token ?? payload.accessToken ?? null,
    refreshToken: payload.refresh_token ?? payload.refreshToken ?? null,
    expiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : null,
    scope: payload.scope ?? null,
    tokenType: payload.token_type ?? payload.tokenType ?? null,
  };
}

export function useCloudAuth() {
  const [settings, setSettings] = useState<CloudSettings>(() => loadCloudSettings());

  useEffect(() => {
    saveCloudSettings(settings);
  }, [settings]);


  const connectToProvider = useCallback((provider: CloudProvider) => {
    const endpoint = provider === 'google-drive' ? '/api/auth/google/init' : '/api/auth/dropbox/init';
    const clientOrigin = encodeURIComponent(window.location.origin);
    // Use _blank so OAuth opens in Safari browser, not inside the PWA shell.
    // When Google redirects back to /settings?cloud_auth=..., iOS opens it in the PWA.
    window.open(`${endpoint}?clientOrigin=${clientOrigin}`, '_blank');
  }, []);

  const disconnectProvider = useCallback((provider: CloudProvider) => {
    setSettings(current => {
      const next = {
        ...current,
        [provider === 'google-drive' ? 'googleDrive' : 'dropbox']: { ...DEFAULT_PROVIDER_STATE },
      } as CloudSettings;
      if (current.primaryProvider === provider) {
        next.primaryProvider = null;
      }
      return next;
    });
  }, []);

  const setPrimaryProvider = useCallback((provider: CloudProvider | null) => {
    setSettings(current => ({ ...current, primaryProvider: provider }));
  }, []);

  const toggleAutoSync = useCallback(() => {
    setSettings(current => ({ ...current, autoSync: !current.autoSync }));
  }, []);

  return {
    settings,
    connectToProvider,
    disconnectProvider,
    setPrimaryProvider,
    toggleAutoSync,
  };
}
