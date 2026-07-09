// Device handover — the conditional-wipe-on-different-user-signin flow.
//
// Context: sign-out is safe (only clears JWT). It leaves the outgoing user's
// receipts and tokens on the device so they can sign back in instantly. That's
// the right default for a single-user device.
//
// But when a DIFFERENT user signs in on the same device, we have a decision:
//   - We must NOT show User A's data to User B (obvious privacy violation).
//   - We must NOT silently wipe User A's data if it isn't safely backed up
//     (that would repeat exactly the class of catastrophe this whole audit
//      was built to prevent).
//
// So on sign-in as a different user, we run a live Drive audit against the
// PRIOR user's stored tokens. If Drive contains a complete backup of the
// prior user's local data → safe to wipe silently, proceed with new sign-in.
// If not → block the sign-in and surface a consent modal offering:
//   1. Download JSON backup of prior user's data
//   2. Sign in as prior user instead
//   3. Wipe anyway (explicit override)
//
// This is Task #5 from the recovery lorespec. Referenced also as the "sign-in
// safety gate."

import Dexie from 'dexie';
import { getDb } from './db';
import { listUserIdsWithLocalData } from './userStorage';
import { loadCloudSettings } from '../hooks/useCloudAuth';
import { auditDriveVsLocal } from './cloudSync';

export interface PriorUserSnapshot {
  userId: string;
  localReceiptCount: number;
  driveConnected: boolean;
  backupVerified: boolean;   // true only if a live Drive audit confirmed superset
  backupReason: string;      // human-readable summary for the warning modal
}

// Look at every userId with data on this device, filter out the incoming user,
// and return a snapshot of each. The caller (AuthContext) uses this to decide
// whether to prompt for handover consent.
export async function getPriorUserSnapshots(incomingUserId: string): Promise<PriorUserSnapshot[]> {
  const otherIds = listUserIdsWithLocalData().filter(id => id !== incomingUserId);
  const snapshots: PriorUserSnapshot[] = [];

  for (const priorId of otherIds) {
    let localReceiptCount = 0;
    try {
      localReceiptCount = await getDb(priorId).receipts.count();
    } catch { /* DB doesn't exist yet — that's fine, count stays 0 */ }

    const settings = loadCloudSettings(priorId);
    const driveConnected = settings.googleDrive?.connected === true;

    // A prior user with no local receipts is trivially safe to wipe — nothing
    // to lose. Only skip the audit; still return the snapshot so the caller
    // knows this userId exists and needs cleanup.
    if (localReceiptCount === 0) {
      snapshots.push({
        userId: priorId,
        localReceiptCount: 0,
        driveConnected,
        backupVerified: true,
        backupReason: 'No local receipts — nothing to back up.',
      });
      continue;
    }

    if (!driveConnected) {
      snapshots.push({
        userId: priorId,
        localReceiptCount,
        driveConnected: false,
        backupVerified: false,
        backupReason: 'Google Drive not connected — no backup exists.',
      });
      continue;
    }

    // Live Drive audit — the whole point. Backup is "verified" only if Drive
    // contains every local UUID for this user.
    try {
      const audit = await auditDriveVsLocal(priorId);
      snapshots.push({
        userId: priorId,
        localReceiptCount,
        driveConnected: true,
        backupVerified: audit.localSupersetOnDrive,
        backupReason: audit.localSupersetOnDrive
          ? `Drive has all ${audit.uniqueUuidsLocal} unique receipts. Safe to wipe.`
          : `${audit.missingFromDrive.length} of ${audit.uniqueUuidsLocal} local receipts are NOT on Drive. Wiping would lose them.`,
      });
    } catch (err) {
      // Audit couldn't run — token revoked, offline, quota, etc. Do NOT assume
      // safe. This is the exact class of "silent trust" that caused the
      // original crisis. Better to prompt than to wipe on an unknown state.
      snapshots.push({
        userId: priorId,
        localReceiptCount,
        driveConnected: true,
        backupVerified: false,
        backupReason: `Could not verify Drive backup — ${(err as Error).message}. Not safe to wipe without confirmation.`,
      });
    }
  }

  return snapshots;
}

// Build a JSON backup blob for a specific user's data. Same shape as the
// existing "Complete Backup" download — receipts + base64 images inline.
// Used by the handover consent modal's "Download backup" action.
export async function buildUserBackupJson(userId: string): Promise<Blob> {
  const rows = await getDb(userId).receipts.toArray();
  const backup = {
    version: 1,
    generatedAt: new Date().toISOString(),
    userId,
    totalReceipts: rows.length,
    receipts: rows,
  };
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

// Delete the specified user's Dexie DB. Called by the handover flow after
// backup verification (or explicit override). Called sequentially for each
// prior user being wiped.
export async function deletePriorUserDb(userId: string): Promise<void> {
  try {
    await Dexie.delete(`scatterbrain_u${userId}`);
  } catch { /* non-fatal — if DB doesn't exist there's nothing to delete */ }
}
