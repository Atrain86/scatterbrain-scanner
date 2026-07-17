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
    // v3: index paymentMethod for fast toggle filtering. Existing rows have
    // paymentMethod undefined (treated as null by the filter) — no backfill needed.
    this.version(3).stores({
      receipts: '++id, uuid, receiptDate, category, storeName, clientName, paymentMethod',
    });
    // v4: index last4 so backfillByLast4 can query all receipts for a given card
    // without a full table scan. Existing rows have last4 undefined — no backfill needed.
    this.version(4).stores({
      receipts: '++id, uuid, receiptDate, category, storeName, clientName, paymentMethod, last4',
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

// Legacy shared-DB migration. The pre-v0.5.2 code used a single un-namespaced
// Dexie DB called "scatterbrain". Whoever signed in first on a device would
// pull ALL of that legacy DB's receipts into their per-user DB.
//
// account-safety-v2 hardens this: after any single user successfully migrates,
// the legacy DB is DELETED. No subsequent user can inherit stale data from it.
// The GLOBAL_MIGRATION_MARKER prevents even a re-attempt.
export async function migrateUnnamedDb(userId: string): Promise<void> {
  const GLOBAL_MIGRATION_MARKER = 'sb_legacy_db_purged';
  const USER_MIGRATION_KEY = `sb_u${userId}_migrated_v1`;

  // If any user has already claimed / purged the legacy DB, we're done — no
  // subsequent user pulls from it. This is the key safety property.
  if (localStorage.getItem(GLOBAL_MIGRATION_MARKER)) return;

  // If THIS user already migrated (leftover from pre-safety-v2 flow), no-op.
  if (localStorage.getItem(USER_MIGRATION_KEY)) {
    const existingCount = await getDb(userId).receipts.count();
    if (existingCount > 0) {
      // Belt-and-suspenders: mark the legacy DB as claimed even though we did
      // not run the copy this time. Prevents any future user from claiming it.
      try { await Dexie.delete('scatterbrain'); } catch { /* non-fatal */ }
      localStorage.setItem(GLOBAL_MIGRATION_MARKER, '1');
      return;
    }
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
    // Delete the legacy DB so no future user inherits it. This is the
    // structural fix: even a bug that skips the migration marker cannot
    // re-copy legacy data because the source is gone.
    try { await Dexie.delete('scatterbrain'); } catch { /* non-fatal */ }
  } catch {
    // Old DB doesn't exist — fine, mark globally purged anyway.
  }
  localStorage.setItem(USER_MIGRATION_KEY, '1');
  localStorage.setItem(GLOBAL_MIGRATION_MARKER, '1');
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

// ── Category tombstones ───────────────────────────────────────────────────────
// Tracks category names deleted by the user so metadata sync doesn't resurrect
// them. Names are lowercased for case-insensitive matching.

const catTombstoneKey = (userId: string) => `sb_u${userId}_deleted_categories`;

export function getDeletedCategories(userId: string): string[] {
  try { return JSON.parse(localStorage.getItem(catTombstoneKey(userId)) || '[]'); } catch { return []; }
}

export function addDeletedCategory(userId: string, name: string): void {
  const existing = getDeletedCategories(userId);
  const lower = name.toLowerCase();
  if (!existing.includes(lower)) {
    localStorage.setItem(catTombstoneKey(userId), JSON.stringify([...existing, lower]));
  }
}

export function clearDeletedCategory(userId: string, name: string): void {
  const existing = getDeletedCategories(userId);
  localStorage.setItem(catTombstoneKey(userId), JSON.stringify(existing.filter(n => n !== name.toLowerCase())));
}

// ── Client tombstones ─────────────────────────────────────────────────────────

const clientTombstoneKey = (userId: string) => `sb_u${userId}_deleted_clients`;

export function getDeletedClients(userId: string): string[] {
  try { return JSON.parse(localStorage.getItem(clientTombstoneKey(userId)) || '[]'); } catch { return []; }
}

export function addDeletedClient(userId: string, name: string): void {
  const existing = getDeletedClients(userId);
  const lower = name.toLowerCase();
  if (!existing.includes(lower)) {
    localStorage.setItem(clientTombstoneKey(userId), JSON.stringify([...existing, lower]));
  }
}

export function clearDeletedClient(userId: string, name: string): void {
  const existing = getDeletedClients(userId);
  localStorage.setItem(clientTombstoneKey(userId), JSON.stringify(existing.filter(n => n !== name.toLowerCase())));
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

// ── Local dedupe: preview + execute ───────────────────────────────────────────
// For each UUID that appears more than once, keep the row with the latest
// updatedAt (preserves any edits made after duplication) and mark the rest
// for deletion. Preview returns the plan without mutating; execute runs it.

export interface DedupePlanEntry {
  uuid: string;
  keep: {
    id: number;
    updatedAt: string;
    createdAt: string;
    storeName: string;
    total: number;
    receiptDate: string;
  };
  drop: {
    id: number;
    updatedAt: string;
    createdAt: string;
    storeName: string;
    total: number;
    receiptDate: string;
  }[];
  // Warning flag: rows under the same UUID have different store/total.
  // Should never happen (same UUID = same receipt) but if it does, surface it.
  divergent: boolean;
}

export interface DedupePlan {
  entries: DedupePlanEntry[];
  totalRowsToDelete: number;
}

// Read-only — builds a dedupe plan without touching the database. Use this
// to render a preview before asking the user to confirm the destructive action.
export async function previewLocalDedupe(userId: string): Promise<DedupePlan> {
  const rows = await getDb(userId).receipts.toArray();

  // Group by uuid
  const byUuid = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.uuid) continue;
    const list = byUuid.get(r.uuid) || [];
    list.push(r);
    byUuid.set(r.uuid, list);
  }

  const entries: DedupePlanEntry[] = [];
  let totalRowsToDelete = 0;

  for (const [uuid, group] of byUuid) {
    if (group.length <= 1) continue;

    // Sort by updatedAt descending — [0] is the keeper
    const sorted = [...group].sort((a, b) => {
      const au = a.updatedAt || '';
      const bu = b.updatedAt || '';
      return bu.localeCompare(au);
    });
    const keeper = sorted[0];
    const droppers = sorted.slice(1);

    // Divergence check — do any rows in this group have a different store or total?
    const divergent = group.some(r =>
      r.storeName !== keeper.storeName || Math.abs((r.total ?? 0) - (keeper.total ?? 0)) > 0.005
    );

    entries.push({
      uuid,
      keep: {
        id: keeper.id!,
        updatedAt: keeper.updatedAt || '',
        createdAt: keeper.createdAt || '',
        storeName: keeper.storeName || '',
        total: keeper.total ?? 0,
        receiptDate: keeper.receiptDate || '',
      },
      drop: droppers.map(d => ({
        id: d.id!,
        updatedAt: d.updatedAt || '',
        createdAt: d.createdAt || '',
        storeName: d.storeName || '',
        total: d.total ?? 0,
        receiptDate: d.receiptDate || '',
      })),
      divergent,
    });
    totalRowsToDelete += droppers.length;
  }

  entries.sort((a, b) => a.uuid.localeCompare(b.uuid));
  return { entries, totalRowsToDelete };
}

// Destructive — deletes the drop rows from the plan. Does NOT tombstone (that
// would trigger deletion from Drive, but the duplicates were never on Drive to
// begin with — Drive already has one copy per UUID). Uses raw db.delete rather
// than deleteReceipt to skip the tombstone side effect.
export interface DedupeResult {
  deleted: number;
  errors: string[];
}

export async function executeLocalDedupe(userId: string, plan: DedupePlan): Promise<DedupeResult> {
  const result: DedupeResult = { deleted: 0, errors: [] };
  const db = getDb(userId);
  for (const entry of plan.entries) {
    for (const dropRow of entry.drop) {
      try {
        await db.receipts.delete(dropRow.id);
        result.deleted += 1;
      } catch (err) {
        result.errors.push(`Delete ${entry.uuid.slice(0, 8)}#${dropRow.id}: ${(err as Error).message}`);
      }
    }
  }
  return result;
}

// ── Year-scoped bulk cleanup: preview + execute ───────────────────────────────
// Deletes all receipts whose receiptDate year is NOT in the keep-list. Unlike
// dedupe, this uses deleteReceipt (which tombstones) so backgroundSync will
// propagate the deletes to Drive. Preview is read-only; execute is destructive
// but only against local IndexedDB + tombstone list (Drive is cleaned up on
// the next sync).

export interface YearCleanupPlanRow {
  id: number;
  uuid: string;
  receiptDate: string;
  storeName: string;
  total: number;
  category: string;
  year: string;
}

export interface YearCleanupPlan {
  keepYears: string[];
  rowsToDelete: YearCleanupPlanRow[];
  yearBreakdown: { year: string; count: number; totalDollars: number }[];
  totalRowsToDelete: number;
  totalDollarsToDelete: number;
}

// Read-only — builds a plan without mutating. `keepYears` is the whitelist:
// any receipt whose year is in this list is preserved.
export async function previewYearCleanup(userId: string, keepYears: string[]): Promise<YearCleanupPlan> {
  const rows = await getDb(userId).receipts.toArray();
  const keepSet = new Set(keepYears);

  const rowsToDelete: YearCleanupPlanRow[] = [];
  const yearAgg = new Map<string, { count: number; totalDollars: number }>();

  for (const r of rows) {
    const yearMatch = typeof r.receiptDate === 'string' ? r.receiptDate.match(/^(\d{4})-\d{2}-\d{2}/) : null;
    const year = yearMatch ? yearMatch[1] : 'unknown';
    if (keepSet.has(year)) continue;
    if (!r.id || !r.uuid) continue; // defensive — shouldn't happen post-dedupe

    rowsToDelete.push({
      id: r.id,
      uuid: r.uuid,
      receiptDate: r.receiptDate || '',
      storeName: r.storeName || '',
      total: r.total ?? 0,
      category: r.category || '',
      year,
    });

    const cur = yearAgg.get(year) || { count: 0, totalDollars: 0 };
    cur.count += 1;
    cur.totalDollars += r.total ?? 0;
    yearAgg.set(year, cur);
  }

  rowsToDelete.sort((a, b) => a.receiptDate.localeCompare(b.receiptDate));
  const yearBreakdown = Array.from(yearAgg.entries())
    .map(([year, agg]) => ({ year, count: agg.count, totalDollars: agg.totalDollars }))
    .sort((a, b) => b.year.localeCompare(a.year));

  return {
    keepYears,
    rowsToDelete,
    yearBreakdown,
    totalRowsToDelete: rowsToDelete.length,
    totalDollarsToDelete: rowsToDelete.reduce((s, r) => s + r.total, 0),
  };
}

// Destructive — deletes each row via deleteReceipt so the UUID is tombstoned;
// the next backgroundSync will propagate the deletes to Drive.
export interface YearCleanupResult {
  deleted: number;
  errors: string[];
}

export async function executeYearCleanup(userId: string, plan: YearCleanupPlan): Promise<YearCleanupResult> {
  const result: YearCleanupResult = { deleted: 0, errors: [] };
  for (const row of plan.rowsToDelete) {
    try {
      await deleteReceipt(userId, row.id);
      result.deleted += 1;
    } catch (err) {
      result.errors.push(`Delete ${row.uuid.slice(0, 8)}#${row.id}: ${(err as Error).message}`);
    }
  }
  return result;
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
