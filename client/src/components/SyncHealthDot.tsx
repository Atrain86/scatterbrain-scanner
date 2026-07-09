// Ambient sync-health indicator — small dot rendered as an overlay on an icon
// (typically the Settings tab in BottomNav). Reflects the same syncStatus that
// drives the Settings health pill, but visible on every page without the user
// having to navigate anywhere.
//
// Design principle (from the sync-resilience lorespec): no background operation
// fails silently. Healthy is visibly affirmed; broken announces itself. This dot
// is the "healthy is visibly affirmed" half. The takeover banner (Rung 2) and
// server-side email alert (Rung 3) cover "broken announces itself" for the
// harder cases — see project spec.
//
// States:
//   - green:  sync is healthy (last successful sync/push is more recent than any failure)
//   - red:    sync is failing (last failure is more recent than any success)
//   - grey:   no activity recorded yet, OR Drive not connected — nothing to affirm
//
// The dot polls loadSyncStatus every 10s while mounted so it stays fresh.

import { useEffect, useState } from 'react';
import { loadSyncStatus } from '../lib/syncStatus';
import { loadCloudSettings } from '../hooks/useCloudAuth';
import { useAuth } from '../contexts/AuthContext';

type Health = 'green' | 'red' | 'grey';

function computeHealth(userId: string): Health {
  const settings = loadCloudSettings(userId);
  const drive = settings.googleDrive;
  const dropbox = settings.dropbox;
  // If no cloud provider is connected, there's nothing to report on — grey (not red).
  // Red only means "a connected provider is actively failing." Not-connected is a
  // valid state the user chose; showing red would be a false alarm.
  if (!drive?.connected && !dropbox?.connected) return 'grey';

  const status = loadSyncStatus(userId);
  const lastSuccessMs = Math.max(
    status.lastPushAt ? new Date(status.lastPushAt).getTime() : 0,
    status.lastBackgroundSyncAt ? new Date(status.lastBackgroundSyncAt).getTime() : 0,
  );
  const lastFailureMs = status.lastFailureAt ? new Date(status.lastFailureAt).getTime() : 0;

  if (lastSuccessMs === 0 && lastFailureMs === 0) return 'grey';
  return lastFailureMs > lastSuccessMs ? 'red' : 'green';
}

export default function SyncHealthDot() {
  const { user } = useAuth();
  const [health, setHealth] = useState<Health>('grey');

  useEffect(() => {
    if (!user) return;
    const tick = () => setHealth(computeHealth(user.id));
    tick();
    const iv = setInterval(tick, 10 * 1000);
    // Also re-check on focus — user might have returned from Settings after
    // fixing an auth issue and expects the dot to reflect the new state promptly.
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  if (!user || health === 'grey') return null;

  const color =
    health === 'green' ? '#4ade80' :
    health === 'red'   ? '#ef4444' :
                         '#6b7280';

  return (
    <span
      aria-label={health === 'green' ? 'Cloud backup healthy' : 'Cloud backup needs attention'}
      className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full ring-2 ring-sb-bg pointer-events-none"
      style={{ backgroundColor: color }}
    />
  );
}
