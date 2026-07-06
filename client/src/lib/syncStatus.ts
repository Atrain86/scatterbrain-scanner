// Sync status recorder — observes actual Drive push/delete/sync outcomes so we can
// surface "last push succeeded / failed (reason)" in Settings. Purely observational:
// callers still throw as before; this only records what happened.
//
// The whole point of this file: making silent sync failure impossible to miss.
// It's the answer to why the June 7 revocation went unnoticed for a month.

export type SyncOp = 'push' | 'delete' | 'backgroundSync';

export interface SyncStatus {
  lastPushAt: string | null;         // ISO — last time push SUCCEEDED (file landed)
  lastPushUuid: string | null;
  lastFailureAt: string | null;      // ISO — last time any sync op FAILED
  lastFailureOp: SyncOp | null;
  lastFailureReason: string | null;
  lastBackgroundSyncAt: string | null; // ISO — last time backgroundSync completed cleanly
  consecutiveFailures: number;
}

const DEFAULT_STATUS: SyncStatus = {
  lastPushAt: null,
  lastPushUuid: null,
  lastFailureAt: null,
  lastFailureOp: null,
  lastFailureReason: null,
  lastBackgroundSyncAt: null,
  consecutiveFailures: 0,
};

function key(userId: string): string {
  return `sb_u${userId}_sync_status`;
}

export function loadSyncStatus(userId: string): SyncStatus {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { ...DEFAULT_STATUS };
    return { ...DEFAULT_STATUS, ...(JSON.parse(raw) as Partial<SyncStatus>) };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

function save(userId: string, next: SyncStatus): void {
  try { localStorage.setItem(key(userId), JSON.stringify(next)); } catch { /* localStorage full — non-fatal */ }
}

export function recordPushSuccess(userId: string, receiptUuid: string): void {
  const cur = loadSyncStatus(userId);
  save(userId, { ...cur, lastPushAt: new Date().toISOString(), lastPushUuid: receiptUuid, consecutiveFailures: 0 });
}

export function recordBackgroundSyncSuccess(userId: string): void {
  const cur = loadSyncStatus(userId);
  save(userId, { ...cur, lastBackgroundSyncAt: new Date().toISOString(), consecutiveFailures: 0 });
}

export function recordFailure(userId: string, op: SyncOp, reason: string): void {
  const cur = loadSyncStatus(userId);
  save(userId, {
    ...cur,
    lastFailureAt: new Date().toISOString(),
    lastFailureOp: op,
    lastFailureReason: reason.slice(0, 500),
    consecutiveFailures: cur.consecutiveFailures + 1,
  });
}
