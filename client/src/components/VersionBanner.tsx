import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION } from '../pages/SettingsPage';
import { RefreshCw } from 'lucide-react';

export default function VersionBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      // Poll for updates every 60 seconds while app is open
      if (r) setInterval(() => r.update(), 60_000);
    },
  });

  if (needRefresh) {
    return (
      <button
        onClick={() => updateServiceWorker(true)}
        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-sb-green/10 border border-sb-green/30 text-sb-green text-xs font-medium rounded-xl transition hover:bg-sb-green/20 active:scale-95"
      >
        <RefreshCw size={13} />
        Update available — tap to reload
      </button>
    );
  }

  return (
    <p className="text-center text-[10px] text-white/20 tracking-wider select-none">
      v{APP_VERSION} beta
    </p>
  );
}
