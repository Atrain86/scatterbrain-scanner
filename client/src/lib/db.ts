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
  }
}

// Cache one DB instance per userId — avoids reopening on every call
const dbCache = new Map<string, ScatterbrainDB>();

export function getDb(userId: string): ScatterbrainDB {
  if (!dbCache.has(userId)) {
    dbCache.set(userId, new ScatterbrainDB(userId));
  }
  return dbCache.get(userId)!;
}

// One-time migration: copy existing unnamespaced 'scatterbrain' DB into the
// user's namespaced DB, then mark migration done so it never runs again.
export async function migrateUnnamedDb(userId: string): Promise<void> {
  const MIGRATION_KEY = `sb_u${userId}_migrated_v1`;
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    const oldDb = new Dexie('scatterbrain');
    oldDb.version(1).stores({ receipts: '++id, receiptDate, category, storeName, clientName' });
    const rows = await (oldDb.table('receipts') as Table<StoredReceipt, number>).toArray();
    if (rows.length > 0) {
      const newDb = getDb(userId);
      await newDb.receipts.bulkAdd(rows.map(r => {
        const { id: _id, ...rest } = r as StoredReceipt & { id: number };
        return rest;
      }));
    }
    oldDb.close();
  } catch {
    // Old DB doesn't exist or is empty — that's fine, nothing to migrate
  }

  localStorage.setItem(MIGRATION_KEY, '1');
}

// ── CRUD helpers — all require userId ────────────────────────────────────────

export async function addReceipt(userId: string, data: StoredReceipt): Promise<Receipt> {
  const id = await getDb(userId).receipts.add(data);
  return { ...data, id } as Receipt;
}

export async function getAllReceipts(userId: string): Promise<Receipt[]> {
  const rows = await getDb(userId).receipts.orderBy('receiptDate').reverse().toArray();
  return rows as Receipt[];
}

export async function getReceiptById(userId: string, id: number): Promise<Receipt | undefined> {
  return getDb(userId).receipts.get(id) as Promise<Receipt | undefined>;
}

export async function updateReceipt(userId: string, id: number, changes: Partial<StoredReceipt>): Promise<Receipt> {
  await getDb(userId).receipts.update(id, { ...changes, updatedAt: new Date().toISOString() });
  const updated = await getDb(userId).receipts.get(id);
  if (!updated) throw new Error(`Receipt ${id} not found`);
  return updated as Receipt;
}

export async function deleteReceipt(userId: string, id: number): Promise<void> {
  await getDb(userId).receipts.delete(id);
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
