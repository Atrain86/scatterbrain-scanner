import Dexie, { type Table } from 'dexie';
import type { Receipt } from '../utils/types';

export type StoredReceipt = Omit<Receipt, 'id'> & { id?: number };

class ScatterbrainDB extends Dexie {
  receipts!: Table<StoredReceipt, number>;

  constructor(userId: string) {
    super(`scatterbrain_u${userId}`);
    this.version(1).stores({
      receipts: '++id, receiptDate, category, storeName, clientName',
    });
    this.version(2).stores({
      receipts: '++id, uuid, receiptDate, category, storeName, clientName',
    }).upgrade(async tx => {
      // Backfill uuid for all existing receipts that don't have one
      const all = await tx.table('receipts').toArray();
      for (const r of all) {
        if (!r.uuid) {
          await tx.table('receipts').update(r.id, {
            uuid: crypto.randomUUID(),
          });
        }
      }
    });
  }
}

const dbCache = new Map<string, ScatterbrainDB>();

export function getDb(userId: string): ScatterbrainDB {
  if (!dbCache.has(userId)) {
    dbCache.set(userId, new ScatterbrainDB(userId));
  }
  return dbCache.get(userId)!;
}

/**
 * Delete the legacy shared Dexie database (`scatterbrain`, no userId) that
 * existed briefly between v0.4.0 (May 14) and v0.5.2 (May 26), before we
 * introduced per-user database namespacing.
 *
 * This REPLACES the old migrateUnnamedDb(). See account-freshness audit
 * Finding 2: the old migration would copy the shared DB's contents into
 * whichever user signed in first on a given browser, causing cross-user
 * receipt leaks. The pre-namespacing app has been dead for over 10 months,
 * so any user still running that version has already migrated their data
 * via the old flow on any subsequent login. It's safe to unconditionally
 * delete the shared DB now.
 *
 * Safe to call unconditionally — if the legacy DB doesn't exist, this is a
 * no-op. If it does, Dexie removes it and no further copies happen.
 */
export async function purgeLegacyDexieDb(): Promise<void> {
  try {
    await Dexie.delete('scatterbrain');
  } catch {
    // No legacy DB, or already deleted — fine.
  }
}

/**
 * Delete a specific user's Dexie database and drop it from the module cache.
 * Used by sign-out flush (account-freshness audit Finding 3). Best-effort —
 * failure to delete on-disk shouldn't block sign-out.
 */
export async function deleteUserDb(userId: string): Promise<void> {
  dbCache.delete(userId);
  try {
    await Dexie.delete(`scatterbrain_u${userId}`);
  } catch { /* best-effort */ }
}

/**
 * Delete every Dexie database on this device EXCEPT the given user's. Used
 * defensively on sign-in to clean up any residue from previous users who
 * closed the tab without logging out.
 *
 * Uses the browser's databases() API where available (Chromium, Safari 15+).
 * On older browsers it's a no-op — sign-out flushing catches the common case.
 */
export async function deleteAllOtherUserDbs(keepUserId: string): Promise<void> {
  const keepName = `scatterbrain_u${keepUserId}`;
  try {
    // indexedDB.databases() is a modern API; may be undefined on older Safari.
    const list = await (indexedDB as unknown as {
      databases?: () => Promise<{ name?: string }[]>;
    }).databases?.();
    if (!list) return;
    for (const db of list) {
      const name = db.name;
      if (!name) continue;
      // Match our namespaced Dexie DBs (and the legacy shared one — belt & suspenders)
      if (name === keepName) continue;
      if (name !== 'scatterbrain' && !name.startsWith('scatterbrain_u')) continue;
      try { await Dexie.delete(name); } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function addReceipt(userId: string, data: StoredReceipt): Promise<Receipt> {
  const record = { ...data, uuid: data.uuid || crypto.randomUUID() };
  const id = await getDb(userId).receipts.add(record);
  return { ...record, id } as Receipt;
}

export async function getAllReceipts(userId: string): Promise<Receipt[]> {
  const rows = await getDb(userId).receipts.orderBy('receiptDate').reverse().toArray();
  return rows as Receipt[];
}

export async function getReceiptById(userId: string, id: number): Promise<Receipt | undefined> {
  return getDb(userId).receipts.get(id) as Promise<Receipt | undefined>;
}

export async function getReceiptByUuid(userId: string, uuid: string): Promise<Receipt | undefined> {
  return getDb(userId).receipts.where('uuid').equals(uuid).first() as Promise<Receipt | undefined>;
}

export async function updateReceipt(userId: string, id: number, changes: Partial<StoredReceipt>): Promise<Receipt> {
  await getDb(userId).receipts.update(id, { ...changes, updatedAt: new Date().toISOString() });
  const updated = await getDb(userId).receipts.get(id);
  if (!updated) throw new Error(`Receipt ${id} not found`);
  return updated as Receipt;
}

export async function deleteReceipt(userId: string, id: number): Promise<void> {
  const receipt = await getDb(userId).receipts.get(id);
  if (receipt?.uuid) {
    const key = `sb_u${userId}_deleted_uuids`;
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    if (!existing.includes(receipt.uuid)) {
      existing.push(receipt.uuid);
      localStorage.setItem(key, JSON.stringify(existing));
    }
  }
  await getDb(userId).receipts.delete(id);
}

export function getDeletedUuids(userId: string): string[] {
  return JSON.parse(localStorage.getItem(`sb_u${userId}_deleted_uuids`) || '[]');
}

export function clearDeletedUuid(userId: string, uuid: string): void {
  const key = `sb_u${userId}_deleted_uuids`;
  const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
  localStorage.setItem(key, JSON.stringify(existing.filter(u => u !== uuid)));
}

export async function getReceiptsByYear(userId: string, year: number): Promise<Receipt[]> {
  const prefix = String(year);
  const rows = await getDb(userId).receipts
    .where('receiptDate')
    .startsWith(prefix)
    .reverse()
    .sortBy('receiptDate');
  return rows as Receipt[];
}
