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

export async function migrateUnnamedDb(userId: string): Promise<void> {
  const MIGRATION_KEY = `sb_u${userId}_migrated_v1`;
  if (localStorage.getItem(MIGRATION_KEY)) {
    const existingCount = await getDb(userId).receipts.count();
    if (existingCount > 0) return;
  }
  try {
    const oldDb = new Dexie('scatterbrain');
    oldDb.version(1).stores({ receipts: '++id, receiptDate, category, storeName, clientName' });
    const rows = await (oldDb.table('receipts') as Table<StoredReceipt, number>).toArray();
    if (rows.length > 0) {
      const newDb = getDb(userId);
      await newDb.receipts.bulkAdd(rows.map(r => {
        const { id: _id, ...rest } = r as StoredReceipt & { id: number };
        return { ...rest, uuid: crypto.randomUUID() };
      }));
    }
    oldDb.close();
  } catch {
    // Old DB doesn't exist — fine
  }
  localStorage.setItem(MIGRATION_KEY, '1');
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

// ── Local diagnostic: reconciles storage count vs monthly-view count ──────────
// Read-only breakdown of the local receipt set. Answers "what IS my data?" so
// Task #5 (conditional wipe on logout) has a clear target for what to protect.

export interface LocalReceiptsAudit {
  totalRows: number;
  uniqueUuids: number;
  duplicateUuids: { uuid: string; count: number }[];    // UUIDs with >1 row
  missingUuid: number;                                   // rows with no uuid at all
  demoRows: number;                                      // uuid starts with "demo-" or "seed-"
  invalidDate: number;                                   // missing or malformed receiptDate
  yearDistribution: Record<string, number>;              // "2026" → count, "unknown" for invalid
  tombstonedCount: number;                               // localStorage deleted_uuids list length
  displayableInCurrentYear: number;                      // valid rows in the current calendar year
  displayableAllYears: number;                           // valid rows with a parseable receiptDate
}

export async function auditLocalReceipts(userId: string): Promise<LocalReceiptsAudit> {
  const rows = await getDb(userId).receipts.toArray();

  const uuidCounts = new Map<string, number>();
  let missingUuid = 0;
  let demoRows = 0;
  let invalidDate = 0;
  let displayableAllYears = 0;
  let displayableInCurrentYear = 0;
  const yearDist: Record<string, number> = {};
  const currentYear = String(new Date().getFullYear());

  for (const r of rows) {
    // UUID accounting
    if (!r.uuid) {
      missingUuid += 1;
    } else {
      uuidCounts.set(r.uuid, (uuidCounts.get(r.uuid) || 0) + 1);
      if (/^(demo|seed)-/i.test(r.uuid)) demoRows += 1;
    }

    // Date accounting — matches how Library groups receipts (needs YYYY-MM-DD-parseable prefix)
    const date = r.receiptDate;
    const yearMatch = typeof date === 'string' ? date.match(/^(\d{4})-\d{2}-\d{2}/) : null;
    if (!yearMatch) {
      invalidDate += 1;
      yearDist['unknown'] = (yearDist['unknown'] || 0) + 1;
    } else {
      const year = yearMatch[1];
      yearDist[year] = (yearDist[year] || 0) + 1;
      displayableAllYears += 1;
      if (year === currentYear) displayableInCurrentYear += 1;
    }
  }

  const duplicateUuids: { uuid: string; count: number }[] = [];
  for (const [uuid, count] of uuidCounts) {
    if (count > 1) duplicateUuids.push({ uuid, count });
  }
  duplicateUuids.sort((a, b) => b.count - a.count);

  const tombstoneRaw = localStorage.getItem(`sb_u${userId}_deleted_uuids`) || '[]';
  const tombstonedCount = (JSON.parse(tombstoneRaw) as string[]).length;

  return {
    totalRows: rows.length,
    uniqueUuids: uuidCounts.size,
    duplicateUuids: duplicateUuids.slice(0, 30),
    missingUuid,
    demoRows,
    invalidDate,
    yearDistribution: yearDist,
    tombstonedCount,
    displayableInCurrentYear,
    displayableAllYears,
  };
}
