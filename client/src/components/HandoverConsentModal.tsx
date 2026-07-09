// Handover consent modal — appears when someone signs in on a device that
// already has ANOTHER user's data, AND that data isn't confirmed backed up
// to Drive. Blocks the sign-in until the incoming user (or the device owner
// interceding for the prior user) makes a deliberate choice.
//
// Three ways out:
//   1. Download JSON backup — offers the prior user's data as a file so it's
//      preserved off-device, then unlocks the "Wipe and continue" button.
//   2. Cancel — aborts the sign-in, prior data stays untouched. User can now
//      sign in as the prior user and resolve their backup situation first.
//   3. Wipe anyway — explicit override. Requires typing the word "DELETE"
//      to confirm.
//
// The whole point is: no destructive action against a user's data without
// their (or an owner's) explicit deliberate consent.

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { buildUserBackupJson } from '../lib/deviceHandover';

export default function HandoverConsentModal() {
  const { pendingHandover } = useAuth();
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!pendingHandover) return null;
  const { pendingUser, priorUsers, onApproveWipe, onCancel } = pendingHandover;

  const unverifiedUsers = priorUsers.filter(p => !p.backupVerified && p.localReceiptCount > 0);
  const allDownloaded = unverifiedUsers.every(p => downloaded.has(p.userId));
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
          <h2 className="text-white text-lg font-semibold">Existing data on this device</h2>
          <p className="text-sb-muted text-xs mt-1">
            Signing in as <span className="text-white">{pendingUser.email}</span> will replace the
            data from a previous account on this device. Some of that data may not be backed up.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {priorUsers.map(p => (
            <div
              key={p.userId}
              className={`rounded-xl p-3 border ${p.backupVerified ? 'border-sb-border bg-sb-card2' : 'border-red-900/60 bg-red-950/30'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    Account {p.userId.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-sb-muted mt-0.5">
                    {p.localReceiptCount} receipt{p.localReceiptCount === 1 ? '' : 's'} on this device
                  </p>
                  <p className={`text-[11px] mt-1 ${p.backupVerified ? 'text-sb-green' : 'text-red-300'}`}>
                    {p.backupVerified ? '✓' : '⚠'} {p.backupReason}
                  </p>
                </div>
                {!p.backupVerified && p.localReceiptCount > 0 && (
                  <button
                    onClick={() => downloadFor(p.userId)}
                    disabled={downloading === p.userId}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      downloaded.has(p.userId)
                        ? 'bg-sb-green/20 text-sb-green border border-sb-green/40'
                        : 'bg-sb-green text-black hover:brightness-110'
                    } disabled:opacity-50`}
                  >
                    {downloading === p.userId ? 'Saving…' : downloaded.has(p.userId) ? '✓ Downloaded' : 'Download backup'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {unverifiedUsers.length > 0 && !allDownloaded && (
            <div className="rounded-xl border border-sb-border bg-sb-card2 p-3">
              <p className="text-xs text-sb-muted mb-2">
                Or type <span className="text-white font-mono">DELETE</span> to override without downloading:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="w-full bg-sb-card border border-sb-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-red-500 outline-none"
                placeholder="Type DELETE to confirm"
                autoCapitalize="characters"
              />
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-sb-border flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-sb-border text-sb-muted text-sm font-medium hover:text-white transition"
          >
            Cancel sign-in
          </button>
          <button
            onClick={onApproveWipe}
            disabled={!canWipe}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
              canWipe
                ? 'bg-red-500 text-white hover:brightness-110'
                : 'bg-sb-card2 text-sb-muted cursor-not-allowed'
            }`}
          >
            Wipe and continue
          </button>
        </div>
      </div>
    </div>
  );
}
