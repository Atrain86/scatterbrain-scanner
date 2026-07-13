// Handover consent modal — shown when a genuinely NEW user is signing in on
// a device that already has ANOTHER user's UNBACKED-UP receipts. Established
// users bypass this entirely (see AuthContext.reconcilePriorUsers).
//
// Design principle (post-alpha-blocker fix):
//   - The DEFAULT action is "keep everything & sign in." Nothing gets
//     deleted unless the user explicitly opts in. The whole point is to
//     tell them the data is here, not to threaten deletion.
//   - Wipe is available but demoted to a small secondary link. Explicit
//     confirmation via typing "DELETE" is still required, so the safety
//     net stays intact for cases where the user actually wants to clean up.
//   - Copy is informational, not alarming. "Other accounts on this device"
//     is a fact; "existing data on this device will be replaced" was a
//     threat.

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { buildUserBackupJson } from '../lib/deviceHandover';

export default function HandoverConsentModal() {
  const { pendingHandover } = useAuth();
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [showCleanup, setShowCleanup] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!pendingHandover) return null;
  const { pendingUser, priorUsers, onKeepAndProceed, onApproveWipe, onCancel } = pendingHandover;

  const allDownloaded = priorUsers.every(p => downloaded.has(p.userId));
  const canWipe = allDownloaded || confirmText.trim().toUpperCase() === 'DELETE';

  async function downloadFor(priorUserId: string) {
    setDownloading(priorUserId);
    try {
      const blob = await buildUserBackupJson(priorUserId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scatterbrain-backup_${priorUserId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(prev => new Set(prev).add(priorUserId));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-sb-card border border-sb-border rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-sb-border">
          <h2 className="text-white text-lg font-semibold">Other accounts on this device</h2>
          <p className="text-sb-muted text-xs mt-1">
            Signing in as <span className="text-white">{pendingUser.email}</span>. Some receipts
            from other accounts are stored on this browser. Signing in will keep them, unless you
            choose to clean up.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {priorUsers.map(p => (
            <div
              key={p.userId}
              className="rounded-xl p-3 border border-sb-border bg-sb-card2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    Account {p.userId.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-sb-muted mt-0.5">
                    {p.localReceiptCount} receipt{p.localReceiptCount === 1 ? '' : 's'} on this device
                  </p>
                  <p className="text-[11px] mt-1 text-sb-muted">
                    Not verified to Drive on this browser
                  </p>
                </div>
                <button
                  onClick={() => downloadFor(p.userId)}
                  disabled={downloading === p.userId}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    downloaded.has(p.userId)
                      ? 'bg-sb-green/15 text-sb-green border border-sb-green/30'
                      : 'border border-sb-border text-white/70 hover:text-white hover:border-sb-muted'
                  } disabled:opacity-50`}
                >
                  {downloading === p.userId ? 'Saving…' : downloaded.has(p.userId) ? '✓ Backed up' : 'Download backup'}
                </button>
              </div>
            </div>
          ))}

          {/* Secondary opt-in: clean up prior accounts. Hidden by default. */}
          {!showCleanup ? (
            <button
              onClick={() => setShowCleanup(true)}
              className="text-[12px] text-white/40 hover:text-white/70 transition underline"
            >
              Clean up these accounts instead
            </button>
          ) : (
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 space-y-2">
              <p className="text-xs text-red-300/90">
                Cleaning up will permanently remove these accounts' data from this browser.
                Download backups first if you want to preserve any of it.
              </p>
              <p className="text-xs text-sb-muted">
                Type <span className="text-white font-mono">DELETE</span> to confirm (or download all
                backups above):
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="w-full bg-sb-card border border-sb-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-red-500 outline-none"
                placeholder="Type DELETE to confirm"
                autoCapitalize="characters"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCleanup(false); setConfirmText(''); }}
                  className="flex-1 py-2 rounded-lg border border-sb-border text-white/70 text-xs hover:text-white transition"
                >
                  Back
                </button>
                <button
                  onClick={onApproveWipe}
                  disabled={!canWipe}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                    canWipe
                      ? 'bg-red-500/80 text-white hover:brightness-110'
                      : 'bg-sb-card2 text-sb-muted cursor-not-allowed'
                  }`}
                >
                  Clean up & sign in
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-sb-border flex gap-2">
          <button
            onClick={onCancel}
            className="py-2.5 px-4 rounded-xl border border-sb-border text-white/70 text-sm hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={onKeepAndProceed}
            className="flex-1 py-2.5 rounded-xl bg-sb-green text-black text-sm font-semibold hover:brightness-110 transition"
          >
            Keep everything & sign in
          </button>
        </div>
      </div>
    </div>
  );
}
