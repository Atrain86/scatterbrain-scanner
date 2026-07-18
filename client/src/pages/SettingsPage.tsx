import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, Pencil, Cloud, Info, Activity, ChevronDown, DownloadCloud, Download, Users, LogOut, Shield, Archive, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAllReceipts, getDb, addDeletedCategory, addDeletedClient } from '../lib/db';
import { useCloudAuth } from '../hooks/useCloudAuth';
import { backgroundSync, restoreFromGoogleDrive, cleanupDriveDuplicates, type RestoreResult, type SyncResult, type CleanupResult } from '../lib/cloudSync';
import { loadSyncStatus } from '../lib/syncStatus';
import { loadClients, saveClients, addClient, removeClient } from '../utils/clients';
import { useAuth } from '../contexts/AuthContext';
import { previewPaletteMigration, applyPaletteMigration, CURATED_PALETTE } from '../utils/palette';
import { getAllCategories, saveUserCategories, ensureCategoryExists } from '../utils/types';
import { getPaymentMethods, savePaymentMethods, saveDeletedPaymentMethods, getDeletedPaymentMethods } from '../lib/paymentStorage';
import type { PaymentMethod } from '../utils/types';
import React from 'react';
import {
  CategoryRenameSheet,
  ClientRenameSheet,
  CategoryDeleteSheet,
  ClientDeleteSheet,
} from '../components/RenameDeleteSheets';

export const APP_VERSION = '0.25.9';

interface CustomCategory {
  name: string;
  color: string;
}

// Category color picker — uses the curated 12-hue palette from the Phase 1
// redesign spec (see utils/palette.ts). Constant saturation/lightness,
// hue-walked. Any category color assigned through this picker is guaranteed
// to be on the curated palette, so no drift away from the palette can happen
// through create/edit flows. The migration utility handles pre-existing
// non-curated categories.
const PALETTE_COLORS: readonly string[] = CURATED_PALETTE;

// New users start with a BLANK CANVAS. Categories are personal — one user's
// curated list is theirs, not something to seed onto strangers. Previously
// this file hardcoded 11 defaults (Comm, Meals, Travel, etc.) that seeded
// for every new account, which made brand-new users think another user's
// list had bled through when it was really just the app's built-in seed.
//
// Existing users already have their entries persisted in localStorage — we
// do NOT wipe those. We only change what happens when the storage key is
// empty (fresh user): return [], let the user build their list from scratch.
const DEFAULT_CATEGORIES: CustomCategory[] = [];

function catStorageKey(userId: string)        { return `sb_u${userId}_custom_categories`; }
function catVersionKey(userId: string)        { return `sb_u${userId}_category_version`; }
// Bumped to '3' when the blank-canvas change shipped. Version-bump path
// PRESERVES existing entries instead of overwriting them — nobody loses
// their customs on a version bump. The marker is now just proof that a
// user has been through the current-schema code once.
const CURRENT_CATEGORY_VERSION = '3';

function loadCustomCategories(userId: string): CustomCategory[] {
  try {
    const storedVersion = localStorage.getItem(catVersionKey(userId));
    const raw = localStorage.getItem(catStorageKey(userId));

    // Fresh user — no storage yet. Seed empty (blank canvas) + mark version.
    if (raw === null) {
      localStorage.setItem(catStorageKey(userId), JSON.stringify(DEFAULT_CATEGORIES));
      localStorage.setItem(catVersionKey(userId), CURRENT_CATEGORY_VERSION);
      return DEFAULT_CATEGORIES;
    }

    // Existing user, version changed — DO NOT overwrite their existing
    // categories. Just bump the marker. Preserves anyone who already built
    // a curated set.
    if (storedVersion !== CURRENT_CATEGORY_VERSION) {
      localStorage.setItem(catVersionKey(userId), CURRENT_CATEGORY_VERSION);
    }

    return JSON.parse(raw) as CustomCategory[];
  } catch { return DEFAULT_CATEGORIES; }
}

interface ScanStats {
  totalScans: number;
  successScans: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUSD: number;
  receiptCount: number;
  // Legacy fields kept for type compat — not displayed
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const userId = user!.id;
  // Admin-gated UI. Kept as an allowlist of my emails so I can debug/support
  // from either account. Server-side ADMIN_EMAILS in auth.ts is the actual
  // authorization boundary; this is UI-visibility only.
  const ADMIN_EMAILS = ['cortespainter@gmail.com', 'alankohl@hotmail.com'];
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
  const { settings: cloudSettings, connectToProvider, disconnectProvider, setPrimaryProvider, toggleAutoSync } = useCloudAuth(userId);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [scanStats, setScanStats] = useState<ScanStats | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [isBackingUp,  setIsBackingUp]  = useState(false);
  const [backupError,  setBackupError]  = useState<string | null>(null);
  const [isImporting,  setIsImporting]  = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; malformed: number } | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);
  const [isBackfilling,   setIsBackfilling]   = useState(false);
  const [backfillResult,  setBackfillResult]  = useState<{ updated: number } | null>(null);
  const importFileRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllReceipts(userId).then(rows => {
      setScanStats({
        totalScans: rows.length,
        successScans: rows.length,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        estimatedCostUSD: 0,
        receiptCount: rows.length,
      });
    });
  }, []);

  async function handleSyncNow() {
    if (!cloudSettings.primaryProvider) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await backgroundSync(userId);
      setSyncResult(result);
      const rows = await getAllReceipts(userId);
      setScanStats(prev => prev ? { ...prev, receiptCount: rows.length, totalScans: rows.length, successScans: rows.length } : prev);
    } catch (error) {
      setSyncResult({ pushed: 0, pulled: 0, errors: [(error as Error).message] });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleRestoreFromDrive() {
    setIsRestoring(true);
    setRestoreResult(null);
    setRestoreError(null);
    try {
      const result = await restoreFromGoogleDrive(null, userId);
      setRestoreResult(result);
      const rows = await getAllReceipts(userId);
      setScanStats(prev => prev ? { ...prev, receiptCount: rows.length, totalScans: rows.length, successScans: rows.length } : prev);
    } catch (err) {
      setRestoreError((err as Error).message);
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleCleanupDuplicates() {
    setIsCleaningUp(true);
    setCleanupResult(null);
    try {
      const result = await cleanupDriveDuplicates(userId);
      setCleanupResult(result);
    } catch (err) {
      setCleanupResult({ scanned: 0, deleted: 0, errors: [(err as Error).message] });
    } finally {
      setIsCleaningUp(false);
    }
  }

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() => loadCustomCategories(userId));
  const [newCatName, setNewCatName]   = useState('');
  const [newCatColor, setNewCatColor] = useState(PALETTE_COLORS[0]);
  const [catError, setCatError]       = useState('');
  // Rename / delete sheet targets for Settings list
  const [settingsCatRenameTarget,   setSettingsCatRenameTarget]   = useState<string | null>(null);
  const [settingsCatDeleteTarget,   setSettingsCatDeleteTarget]   = useState<string | null>(null);
  const [settingsClientRenameTarget, setSettingsClientRenameTarget] = useState<string | null>(null);
  const [settingsClientDeleteTarget, setSettingsClientDeleteTarget] = useState<string | null>(null);

  const [clients, setClients]         = useState<string[]>(() => loadClients(userId));
  const [newClientName, setNewClientName] = useState('');
  const [clientError, setClientError] = useState('');

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(() => getPaymentMethods(userId));
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardLabel, setEditingCardLabel] = useState('');


  function saveCustomCategories(cats: CustomCategory[]) {
    setCustomCategories(cats);
    localStorage.setItem(catStorageKey(userId), JSON.stringify(cats));
  }

  function addCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) { setCatError('Enter a category name'); return; }
    if (customCategories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setCatError('That category already exists');
      return;
    }
    setCatError('');
    saveCustomCategories([...customCategories, { name: trimmed, color: newCatColor }]);
    setNewCatName('');
  }

  // Category delete is now handled by CategoryDeleteSheet (opened from the UI).
  // This stub is kept so nothing referencing it breaks during transition.
  function removeCategory(_name: string) {
    // no-op — delete is triggered via setSettingsCatDeleteTarget in the JSX
  }

  function handleAddClient() {
    const trimmed = newClientName.trim();
    if (!trimmed) { setClientError('Enter a client name'); return; }
    if (clients.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setClientError('That client already exists'); return;
    }
    setClientError('');
    setClients(addClient(userId, trimmed));
    setNewClientName('');
  }

  function handleRemoveClient(name: string) {
    addDeletedClient(userId, name);
    setClients(removeClient(userId, name));
  }

  // Complete Backup — full snapshot: receipts (data + photos) + categories +
  // clients. Use the share sheet to save to iCloud, email, Dropbox, or a
  // computer. Restore it via "Restore from Backup File" on any device.
  async function handleFullBackup() {
    setBackupError(null);
    setIsBackingUp(true);
    try {
      const rows = await getAllReceipts(userId);
      const categories = loadCustomCategories(userId);
      const clientList = loadClients(userId);
      const payload = {
        exportVersion: 2,
        exportedAt: new Date().toISOString(),
        totalReceipts: rows.length,
        receipts: rows,
        categories,
        clients: clientList,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `scatterbrain-full-backup_${stamp}_${rows.length}-receipts.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setBackupError((err as Error).message || 'Backup failed');
    } finally {
      setIsBackingUp(false);
    }
  }

  // Restore from JSON backup file — merge-by-UUID into current user's DB only.
  // Validates the full file before writing anything. Writes in batches of 20
  // to reduce peak memory on mobile (avoids holding the full parsed array +
  // the full Dexie write buffer simultaneously). Idempotent: re-running after
  // a partial failure (e.g. tab kill) skips already-written UUIDs.
  async function handleBackfillPayment() {
    if (!userId) return;
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const db = getDb(userId);
      const all = await db.receipts.toArray();
      let updated = 0;
      const KEYWORDS: [RegExp, string][] = [
        [/\b(debit sale|interac|interac debit)\b/i, 'Debit'],
        [/\bvisa\b/i,       'Visa'],
        [/\bmastercard\b/i, 'Mastercard'],
        [/\bamex\b|\bamerican express\b/i, 'Amex'],
        [/\bcash\b/i,       'Cash'],
      ];
      for (const r of all) {
        if (r.paymentMethod) continue; // already set, don't overwrite
        // Combine all text fields to search
        const haystack = [
          r.storeName ?? '',
          r.notes ?? '',
          // rawLineItems descriptions
          ...((() => { try { return (JSON.parse(r.rawLineItems ?? '[]') as { description?: string }[]).map(i => i.description ?? ''); } catch { return []; } })()),
          // lineItems descriptions
          ...((() => { try { return (JSON.parse(r.lineItems ?? '[]') as { description?: string }[]).map(i => i.description ?? ''); } catch { return []; } })()),
        ].join(' ');
        let detected: string | null = null;
        for (const [re, method] of KEYWORDS) {
          if (re.test(haystack)) { detected = method; break; }
        }
        if (detected) {
          await db.receipts.update(r.id!, { paymentMethod: detected });
          updated++;
        }
      }
      setBackfillResult({ updated });
      window.dispatchEvent(new CustomEvent('receipts-updated'));
    } catch (err) {
      console.error('Backfill failed:', err);
    } finally {
      setIsBackfilling(false);
    }
  }

  async function handleRestoreFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected after a partial run
    e.target.value = '';

    setImportError(null);
    setImportResult(null);
    setIsImporting(true);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('File is not valid JSON. Is this the right file?');
      }

      const p = parsed as Record<string, unknown>;
      const exportVersion = p.exportVersion;
      if (
        typeof parsed !== 'object' || parsed === null ||
        (exportVersion !== 1 && exportVersion !== 2) ||
        !Array.isArray(p.receipts)
      ) {
        throw new Error('File doesn\'t look like a Scatterbrain backup (missing exportVersion or receipts array).');
      }

      const records = (parsed as { receipts: unknown[] }).receipts;

      // v2 backup includes categories and clients — extract them for restore below
      const backupCategories = (exportVersion === 2 && Array.isArray(p.categories))
        ? (p.categories as unknown[]).filter(
            (c): c is { name: string; color: string } =>
              typeof c === 'object' && c !== null &&
              typeof (c as Record<string, unknown>).name === 'string' &&
              typeof (c as Record<string, unknown>).color === 'string'
          )
        : null;
      const backupClients = (exportVersion === 2 && Array.isArray(p.clients))
        ? (p.clients as unknown[]).filter((c): c is string => typeof c === 'string')
        : null;

      // Validate each record — require the fields the app depends on.
      // Collect valid ones; count malformed separately rather than aborting.
      type ValidRecord = { uuid: string; storeName: string; receiptDate: string; total: number; [key: string]: unknown };
      const valid: ValidRecord[] = [];
      let malformed = 0;
      for (const r of records) {
        if (
          typeof r === 'object' && r !== null &&
          typeof (r as Record<string, unknown>).uuid === 'string' &&
          typeof (r as Record<string, unknown>).storeName === 'string' &&
          typeof (r as Record<string, unknown>).receiptDate === 'string' &&
          typeof (r as Record<string, unknown>).total === 'number'
        ) {
          valid.push(r as ValidRecord);
        } else {
          malformed++;
        }
      }

      if (valid.length === 0 && malformed > 0) {
        throw new Error(`All ${malformed} records in this file are malformed — nothing was imported.`);
      }

      // Fetch existing UUIDs for dedup — keyed to THIS user's DB only
      const db = getDb(userId);
      const existing = await db.receipts.toCollection().primaryKeys();
      const existingRows = await db.receipts.toArray();
      const existingUuids = new Set(existingRows.map(r => r.uuid).filter(Boolean));

      let imported = 0;
      let skipped = 0;

      // Batch writes — 20 at a time to limit peak memory pressure on mobile
      const BATCH = 20;
      for (let i = 0; i < valid.length; i += BATCH) {
        const chunk = valid.slice(i, i + BATCH);
        const toWrite = chunk.filter(r => !existingUuids.has(r.uuid));
        const toSkip  = chunk.length - toWrite.length;
        skipped += toSkip;

        if (toWrite.length > 0) {
          // Strip any numeric `id` from the export so Dexie auto-assigns a new one
          const rows = toWrite.map(({ id: _id, ...rest }) => rest);
          await db.receipts.bulkAdd(rows as unknown as Parameters<typeof db.receipts.bulkAdd>[0]);
          toWrite.forEach(r => existingUuids.add(r.uuid));
          imported += toWrite.length;
        }
      }

      // Restore categories — exact colours from v2 backup, algorithmic for v1.
      if (backupCategories) {
        // v2: merge backup category list (name + exact colour) into current user's list
        const existing = getAllCategories(userId);
        const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
        const toAdd = backupCategories.filter(c => !existingNames.has(c.name.toLowerCase()));
        if (toAdd.length > 0) {
          saveUserCategories(userId, [...existing, ...toAdd]);
        }
      } else {
        // v1: no colour info — seed algorithmically from receipt category names
        const receiptCategories = new Set(
          valid
            .map(r => (r as Record<string, unknown>).category)
            .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        );
        receiptCategories.forEach(name => ensureCategoryExists(userId, name));
      }

      // Restore clients from v2 backup — merge, don't overwrite
      if (backupClients) {
        const existingClients = loadClients(userId);
        const existingSet = new Set(existingClients.map(c => c.toLowerCase()));
        const toAdd = backupClients.filter(c => !existingSet.has(c.toLowerCase()));
        if (toAdd.length > 0) {
          saveClients(userId, [...existingClients, ...toAdd]);
        }
      }

      setImportResult({ imported, skipped, malformed });
    } catch (err) {
      setImportError((err as Error).message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="flex items-center justify-between px-5 pt-12 pb-3 safe-top max-w-2xl mx-auto w-full">
        <h1 className="text-white text-2xl font-bold tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Settings
        </h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 space-y-4 max-w-2xl mx-auto w-full">

        {/* Receipts — all-years total, glanceable count on the collapsed header */}
        <Section
          icon={<Activity size={16} />}
          title="Receipts"
          defaultOpen={false}
          headerMeta={scanStats ? String(scanStats.receiptCount) : undefined}
        >
          {scanStats === null ? (
            <p className="text-sb-muted text-xs">Loading…</p>
          ) : scanStats.receiptCount === 0 ? (
            <p className="text-xs text-sb-muted">No receipts yet. Scan your first receipt to start tracking expenses.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <StatRow label="Receipts stored" value={String(scanStats.receiptCount)} />
              <p className="text-[11px] text-sb-muted pt-1 opacity-70">
                Stored locally in your browser (IndexedDB). Back up via Google Drive or Dropbox below.
              </p>
            </div>
          )}
        </Section>

        {/* Categories */}
        <Section icon={<Tag size={16} />} title="Categories" defaultOpen={false}>
          <div className="space-y-1.5 mb-4">
            {customCategories.length === 0 ? (
              <p className="text-xs text-sb-muted italic">No categories yet. Categories are added automatically as you scan receipts, or add one below.</p>
            ) : (
              customCategories.map(cat => (
                <div key={cat.name} className="flex items-center justify-between bg-sb-card2 border border-sb-border rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-white text-sm truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setSettingsCatRenameTarget(cat.name)} className="text-white/30 hover:text-white/70 transition p-1" title="Rename">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setSettingsCatDeleteTarget(cat.name)} className="text-sb-muted hover:text-red-400 transition p-1" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border border-sb-border rounded-xl p-3 space-y-3">
            <p className="text-xs text-sb-muted font-medium">Add category</p>
            <input
              value={newCatName}
              onChange={e => { setNewCatName(e.target.value); setCatError(''); }}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="Category name"
              className="sb-input"
            />
            <div>
              <p className="text-xs text-sb-muted mb-2">
                Color
                <span className="ml-2 inline-block w-4 h-4 rounded-full align-middle border border-white/20" style={{ backgroundColor: newCatColor }} />
              </p>
              <div className="flex flex-wrap gap-2">
                {PALETTE_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewCatColor(color)}
                    title={color}
                    className="w-8 h-8 rounded-full transition hover:scale-110 active:scale-95 flex-shrink-0"
                    style={{
                      backgroundColor: color,
                      outline: newCatColor === color ? '2px solid white' : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
            </div>
            {catError && <p className="text-red-400 text-xs">{catError}</p>}
            <button
              onClick={addCategory}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-sb-border text-white text-sm hover:border-sb-muted transition"
            >
              <Plus size={15} /> {newCatName.trim() ? 'Save Category' : 'Add Category'}
            </button>
          </div>
        </Section>

        {/* Clients */}
        <Section icon={<Users size={16} />} title="Clients" defaultOpen={false}>
          <div className="space-y-1.5 mb-4">
            {clients.length === 0 ? (
              <p className="text-xs text-sb-muted italic">No clients yet. Add one below.</p>
            ) : (
              clients.map(client => (
                <div key={client} className="flex items-center justify-between bg-sb-card2 border border-sb-border rounded-xl px-3 py-2">
                  <span className="text-white text-sm flex-1 truncate">{client}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setSettingsClientRenameTarget(client)} className="text-white/30 hover:text-white/70 transition p-1" title="Rename">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setSettingsClientDeleteTarget(client)} className="text-sb-muted hover:text-red-400 transition p-1" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border border-sb-border rounded-xl p-3 space-y-2">
            <p className="text-xs text-sb-muted font-medium">Add client</p>
            <input
              value={newClientName}
              onChange={e => { setNewClientName(e.target.value); setClientError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAddClient()}
              placeholder="Client name"
              className="sb-input"
            />
            {clientError && <p className="text-red-400 text-xs">{clientError}</p>}
            <button
              onClick={handleAddClient}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-sb-border text-white text-sm hover:border-sb-muted transition"
            >
              <Plus size={15} /> Add Client
            </button>
          </div>
        </Section>

        {/* Payment Methods */}
        <Section icon={<CreditCard size={16} />} title="Payment Methods" defaultOpen={false}>
          {paymentMethods.length === 0 ? (
            <p className="text-xs text-sb-muted italic mb-4">
              No named cards yet. Cards are added automatically when you scan a receipt with a card number.
            </p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {paymentMethods.map(card => (
                <div key={card.id} className="flex items-center justify-between bg-sb-card2 border border-sb-border rounded-xl px-3 py-2 gap-2">
                  <div className="flex-1 min-w-0">
                    {editingCardId === card.id ? (
                      <input
                        autoFocus
                        value={editingCardLabel}
                        onChange={e => setEditingCardLabel(e.target.value)}
                        onBlur={() => {
                          const trimmed = editingCardLabel.trim();
                          if (trimmed && trimmed !== card.label) {
                            const updated = paymentMethods.map(m =>
                              m.id === card.id ? { ...m, label: trimmed } : m
                            );
                            savePaymentMethods(userId, updated);
                            setPaymentMethods(updated);
                          }
                          setEditingCardId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditingCardId(null);
                        }}
                        className="bg-transparent border-b border-sb-green text-white text-sm focus:outline-none w-full"
                      />
                    ) : (
                      <button
                        className="text-white text-sm text-left w-full hover:text-sb-green transition"
                        onClick={() => { setEditingCardId(card.id); setEditingCardLabel(card.label); }}
                      >
                        {card.label}
                      </button>
                    )}
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {card.last4 ? `•••${card.last4}` : 'no card number'}
                      {card.network ? ` · ${card.network}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Remove "${card.label}"? This won't change existing receipts.`)) return;
                      const updated = paymentMethods.filter(m => m.id !== card.id);
                      savePaymentMethods(userId, updated);
                      const tombstones = getDeletedPaymentMethods(userId);
                      if (!tombstones.includes(card.id)) {
                        saveDeletedPaymentMethods(userId, [...tombstones, card.id]);
                      }
                      setPaymentMethods(updated);
                    }}
                    className="text-sb-muted hover:text-red-400 transition p-1 flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-sb-muted/70">
            Tap a card name to rename it. Cards are named automatically when you scan a receipt with a recognizable card number (•••XXXX).
          </p>
        </Section>

        {/* Cloud backup */}
        <Section icon={<Cloud size={16} />} title="Cloud Backup" defaultOpen={false}>
          <div className="space-y-3">
            <CloudRow
              label="Google Drive"
              description="Upload directly to your Drive"
              status={cloudSettings.googleDrive.connected ? `Connected: ${cloudSettings.googleDrive.email ?? 'Drive'}` : 'Not connected'}
              actionLabel={cloudSettings.googleDrive.connected ? 'Disconnect' : 'Connect'}
              connectHref={!cloudSettings.googleDrive.connected ? `https://scatterbrain-scanner.onrender.com/api/auth/google/init?clientOrigin=${encodeURIComponent(window.location.origin)}` : undefined}
              onAction={cloudSettings.googleDrive.connected ? () => disconnectProvider('google-drive') : undefined}
            />

            {cloudSettings.googleDrive.connected && (
              <div className="rounded-2xl border border-sb-border bg-sb-card2 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white text-sm">Restore from Drive</p>
                    <p className="text-xs text-sb-muted">Import receipts backed up to your Google Drive on another device.</p>
                  </div>
                  <button
                    onClick={handleRestoreFromDrive}
                    disabled={isRestoring}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition flex-shrink-0 ${isRestoring ? 'bg-sb-border text-white cursor-not-allowed' : 'bg-sb-purple text-white hover:brightness-110'}`}
                  >
                    <DownloadCloud size={13} />
                    {isRestoring ? 'Restoring…' : 'Restore'}
                  </button>
                </div>

                {isRestoring && (
                  <div className="flex items-center gap-2 text-xs text-sb-muted">
                    <div className="w-3 h-3 border border-sb-purple border-t-transparent rounded-full animate-spin" />
                    Scanning your Drive for receipts…
                  </div>
                )}

                {restoreResult && !isRestoring && (
                  <div className="rounded-xl bg-sb-card px-3 py-2.5 space-y-1 text-xs">
                    <p className="text-sb-green font-semibold">
                      {restoreResult.imported === 0
                        ? 'Nothing new — already up to date.'
                        : `Imported ${restoreResult.imported} receipt${restoreResult.imported !== 1 ? 's' : ''}.`}
                    </p>
                    {restoreResult.skipped > 0 && (
                      <p className="text-sb-muted">{restoreResult.skipped} already on this device — skipped.</p>
                    )}
                    {restoreResult.failed > 0 && (
                      <p className="text-red-400">{restoreResult.failed} failed to import.</p>
                    )}
                  </div>
                )}

                {restoreError && !isRestoring && (
                  <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2">
                    {restoreError}
                  </p>
                )}
              </div>
            )}
            <CloudRow
              label="Dropbox"
              description="Upload to your app folder"
              status={cloudSettings.dropbox.connected ? `Connected: ${cloudSettings.dropbox.email ?? 'Dropbox'}` : 'Not connected'}
              actionLabel={cloudSettings.dropbox.connected ? 'Disconnect' : 'Connect'}
              connectHref={!cloudSettings.dropbox.connected ? `https://scatterbrain-scanner.onrender.com/api/auth/dropbox/init?clientOrigin=${encodeURIComponent(window.location.origin)}` : undefined}
              onAction={cloudSettings.dropbox.connected ? () => disconnectProvider('dropbox') : undefined}
            />
            <div className="rounded-2xl border border-sb-border bg-sb-card2 p-3 space-y-3">
              <SyncStatusIndicator userId={userId} />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-white text-sm">Sync</p>
                  <p className="text-xs text-sb-muted">Push new receipts to Drive and pull any missing ones down.</p>
                </div>
                <button
                  onClick={handleSyncNow}
                  disabled={isSyncing || !cloudSettings.primaryProvider || !(cloudSettings.primaryProvider === 'google-drive' ? cloudSettings.googleDrive.connected : cloudSettings.dropbox.connected)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${isSyncing ? 'bg-sb-border text-white cursor-not-allowed' : 'bg-sb-green text-black'} ${!cloudSettings.primaryProvider ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSyncing ? 'Syncing…' : 'Sync now'}
                </button>
              </div>

              {syncResult && (
                <div className="rounded-xl bg-sb-card px-3 py-2.5 text-xs space-y-1">
                  {syncResult.errors.length === 0 ? (
                    <p className="text-sb-green font-semibold">
                      {syncResult.pushed === 0 && syncResult.pulled === 0
                        ? 'Already up to date.'
                        : `↑ ${syncResult.pushed} uploaded · ↓ ${syncResult.pulled} downloaded`}
                    </p>
                  ) : (
                    <>
                      <p className="text-sb-green font-semibold">↑ {syncResult.pushed} uploaded · ↓ {syncResult.pulled} downloaded</p>
                      <p className="text-red-400">{syncResult.errors[0]}</p>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* Troubleshooting — user-facing tools only.
                Raw diagnostics live under Administrator (admin-gated). */}
            <details className="rounded-2xl border border-sb-border bg-sb-card2 p-3 group">
              <summary className="flex items-center justify-between cursor-pointer text-sm text-white/80 list-none">
                <span>Troubleshooting</span>
                <ChevronDown size={14} className="text-sb-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="pt-3 space-y-3">
                <DriveAuditButton userId={userId} label="Check backup status" />
                <div className="rounded-2xl border border-sb-border bg-sb-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-white text-sm">Clean up duplicates</p>
                      <p className="text-xs text-sb-muted">Remove duplicate receipt files created by earlier sync bugs.</p>
                    </div>
                    <button
                      onClick={handleCleanupDuplicates}
                      disabled={isCleaningUp}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${isCleaningUp ? 'bg-sb-border text-white cursor-not-allowed' : 'bg-sb-purple text-white'}`}
                    >
                      {isCleaningUp ? 'Cleaning…' : 'Clean up'}
                    </button>
                  </div>
                  {cleanupResult && !isCleaningUp && (
                    <p className="text-xs text-sb-green">
                      {cleanupResult.deleted === 0
                        ? `Scanned ${cleanupResult.scanned} files — no duplicates found.`
                        : `Deleted ${cleanupResult.deleted} duplicate${cleanupResult.deleted !== 1 ? 's' : ''} from ${cleanupResult.scanned} files.`}
                      {cleanupResult.errors.length > 0 && ` (${cleanupResult.errors.length} errors)`}
                    </p>
                  )}
                </div>
              </div>
            </details>
            {cloudSettings.googleDrive.connected && cloudSettings.dropbox.connected && (
              <div className="space-y-2 rounded-2xl border border-sb-border bg-sb-card2 p-3 text-sm text-sb-muted">
                <p className="text-white font-medium">Primary provider</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setPrimaryProvider('google-drive')}
                    className={`rounded-full px-3 py-1.5 transition ${cloudSettings.primaryProvider === 'google-drive' ? 'bg-sb-green text-black' : 'bg-sb-card border border-sb-border text-white'}`}
                  >
                    Google Drive
                  </button>
                  <button
                    onClick={() => setPrimaryProvider('dropbox')}
                    className={`rounded-full px-3 py-1.5 transition ${cloudSettings.primaryProvider === 'dropbox' ? 'bg-sb-green text-black' : 'bg-sb-card border border-sb-border text-white'}`}
                  >
                    Dropbox
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-sb-muted pt-1">
              Use cloud backup for extra persistence. This connects your receipts to your own Drive or Dropbox account.
            </p>
          </div>
        </Section>

        {/* Complete Backup — full snapshot: receipts + categories + clients. */}
        <Section icon={<Archive size={16} />} title="Complete Backup" defaultOpen={false}>
          <div className="space-y-4">
            <p className="text-white text-sm">
              Export receipts, categories, and clients as a single JSON file. Use your share
              sheet to save it to iCloud, email it, or copy it to a computer. Restore it
              here on any device.
            </p>
            <p className="text-sb-muted text-xs leading-snug">
              The file will be large (~1&nbsp;MB per 10&nbsp;receipts with photos). Restore
              merges by UUID — importing the same file twice won't create duplicates.
            </p>

            {/* Export */}
            <button
              onClick={handleFullBackup}
              disabled={isBackingUp}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-sb-border text-white text-sm hover:border-sb-muted disabled:opacity-40 transition"
            >
              <Download size={15} />
              {isBackingUp ? 'Preparing…' : 'Download Backup (.json)'}
            </button>
            {backupError && (
              <p className="text-red-400 text-xs">{backupError}</p>
            )}

            {/* Divider */}
            <div className="border-t border-sb-border" />

            {/* Import */}
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleRestoreFromFile}
            />
            <button
              onClick={() => { setImportResult(null); setImportError(null); importFileRef.current?.click(); }}
              disabled={isImporting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-sb-border text-white text-sm hover:border-sb-muted disabled:opacity-40 transition"
            >
              <DownloadCloud size={15} />
              {isImporting ? 'Importing…' : 'Restore from Backup File (.json)'}
            </button>
            {importResult && (
              <p className="text-sb-green text-xs">
                Imported {importResult.imported} receipt{importResult.imported !== 1 ? 's' : ''}.
                {importResult.skipped > 0 ? ` Skipped ${importResult.skipped} already present.` : ''}
                {importResult.malformed > 0 ? ` ${importResult.malformed} record${importResult.malformed !== 1 ? 's' : ''} were malformed and skipped.` : ''}
              </p>
            )}
            {importError && (
              <p className="text-red-400 text-xs">{importError}</p>
            )}

            <div className="border-t border-sb-border pt-3 mt-1">
              <p className="text-xs text-white/50 mb-2">Detect payment method (Visa / Debit / etc.) from existing receipts. Only fills receipts that don't already have a payment method set.</p>
              <button
                onClick={handleBackfillPayment}
                disabled={isBackfilling}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-sb-border text-white text-sm hover:border-sb-muted disabled:opacity-40 transition"
              >
                {isBackfilling ? 'Detecting…' : 'Detect Payment Methods'}
              </button>
              {backfillResult && (
                <p className="text-sb-green text-xs mt-1">{backfillResult.updated} receipt{backfillResult.updated !== 1 ? 's' : ''} updated.</p>
              )}
            </div>
          </div>
        </Section>

        {/* Administrator — admin allowlist only. Raw diagnostics + one-time
            migrations kept for support/debugging. Hidden from normal users. */}
        {isAdmin && <AdminPanel userId={userId} />}

        {/* About — version, account, Sign Out. Sits LAST so the footer of
            Settings is the identity + exit action, and admin tools (when
            visible) don't push it further down. */}
        <Section icon={<Info size={16} />} title="About" defaultOpen={false}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-sb-muted">Version</span>
              <span className="text-white">{APP_VERSION}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sb-muted">Account</span>
              <span className="text-white text-xs truncate max-w-[180px]">{user?.email}</span>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-sb-border text-sb-muted hover:text-red-400 hover:border-red-900/50 transition text-sm mt-2"
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </Section>

      </main>

      {/* ── Settings rename / delete sheets ── */}
      {settingsCatRenameTarget !== null && (
        <CategoryRenameSheet
          userId={userId}
          oldName={settingsCatRenameTarget}
          onClose={() => setSettingsCatRenameTarget(null)}
          onDone={() => {
            setSettingsCatRenameTarget(null);
            setCustomCategories(loadCustomCategories(userId));
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}
      {settingsCatDeleteTarget !== null && (
        <CategoryDeleteSheet
          userId={userId}
          name={settingsCatDeleteTarget}
          onClose={() => setSettingsCatDeleteTarget(null)}
          onDone={() => {
            setSettingsCatDeleteTarget(null);
            setCustomCategories(loadCustomCategories(userId));
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}
      {settingsClientRenameTarget !== null && (
        <ClientRenameSheet
          userId={userId}
          oldName={settingsClientRenameTarget}
          onClose={() => setSettingsClientRenameTarget(null)}
          onDone={() => {
            setSettingsClientRenameTarget(null);
            setClients(loadClients(userId));
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}
      {settingsClientDeleteTarget !== null && (
        <ClientDeleteSheet
          userId={userId}
          name={settingsClientDeleteTarget}
          onClose={() => setSettingsClientDeleteTarget(null)}
          onDone={() => {
            setSettingsClientDeleteTarget(null);
            setClients(loadClients(userId));
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}
    </div>
  );
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function AdminPanel({ userId }: { userId: string }) {
  const [users, setUsers] = useState<{ id: string; email: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const token = localStorage.getItem('sb_auth_token');
  // Same allowlist as auth.ts. Kept client-side only for UI decisions; the
  // server enforces the real gate on the DELETE endpoint.
  const ADMIN_EMAILS_LOWER = ['cortespainter@gmail.com', 'alankohl@hotmail.com'];

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/user/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(data.users || []);
      setLoaded(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(u: { id: string; email: string }) {
    if (!confirm(`Delete account ${u.email}?\n\nThis frees the email for re-signup. It does NOT delete their local receipts on their own device or their Drive backup.`)) return;
    setDeletingId(u.id);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE}/api/user/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (err) {
      setDeleteError((err as Error).message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Section icon={<Shield size={16} />} title="Administrator" defaultOpen={false}>
      <div className="space-y-3">

        {/* Beta users */}
        {!loaded ? (
          <button
            onClick={loadUsers}
            disabled={loading}
            className="w-full py-2 rounded-lg bg-sb-card2 border border-sb-border text-sm text-sb-muted hover:text-white transition disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Load Beta Users'}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-sb-muted">{users.length} user{users.length !== 1 ? 's' : ''} registered</p>
            {deleteError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-2.5 py-1.5">{deleteError}</p>
            )}
            <div className="divide-y divide-sb-border rounded-xl overflow-hidden border border-sb-border">
              {users.map(u => {
                const isSelf  = u.id === userId;
                const isAdmin = ADMIN_EMAILS_LOWER.includes(u.email.toLowerCase());
                const canDelete = !isSelf && !isAdmin;
                return (
                  <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-sb-card2">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{u.email}</p>
                      <p className="text-sb-muted text-xs">{new Date(u.createdAt).toLocaleDateString()}</p>
                    </div>
                    {canDelete ? (
                      <button
                        onClick={() => deleteUser(u)}
                        disabled={deletingId === u.id}
                        className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] text-red-300 border border-red-900/50 hover:bg-red-950/40 transition disabled:opacity-50"
                      >
                        {deletingId === u.id ? 'Removing…' : 'Delete'}
                      </button>
                    ) : (
                      <span className="shrink-0 text-[10px] text-sb-muted italic">
                        {isSelf ? 'you' : 'admin'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Raw diagnostics — moved here from Cloud Backup + About.
            Order intentionally matches the debugging workflow: token copy →
            cloud state → refresh test → drive audit → local audits →
            migrations. */}
        <ServerTokenCopier userId={userId} />
        <CloudDiagnostic userId={userId} />
        <RefreshTokenTester userId={userId} />
        <DriveAuditButton userId={userId} label="Audit Drive vs local" />
        <LocalReceiptsAuditButton userId={userId} />
        <LocalDedupeButton userId={userId} />
        <YearCleanupButton userId={userId} />
        <PaletteMigrationButton userId={userId} />
        <LocalAccountsCleanupButton currentUserId={userId} />
        <TagAllDebitButton userId={userId} />
      </div>
    </Section>
  );
}

function TagAllDebitButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const db = getDb(userId);
      const all = await db.receipts.toArray();
      let updated = 0;
      for (const r of all) {
        if (r.paymentMethod) continue;
        await db.receipts.update(r.id!, { paymentMethod: 'Debit' });
        updated++;
      }
      setResult(updated);
      window.dispatchEvent(new CustomEvent('receipts-updated'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-sb-border pt-3 mt-1">
      <p className="text-xs text-white/50 mb-2">Tag all untagged receipts as Debit (one-time backfill for accounts that predate payment method extraction).</p>
      <button
        onClick={run}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm disabled:opacity-40 transition"
        style={{ borderColor: '#6ea882', color: '#6ea882' }}
      >
        {busy ? 'Tagging…' : 'Tag All Receipts as Debit'}
      </button>
      {result !== null && (
        <p className="text-sb-green text-xs mt-1">{result} receipt{result !== 1 ? 's' : ''} tagged as Debit.</p>
      )}
    </div>
  );
}

function ServerTokenCopier({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);
  const key = `sb_u${userId}_cloud_settings`;
  const settings = (() => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } })();
  const token = settings?.googleDrive?.refreshToken;
  if (!token) return null;

  function copy() {
    navigator.clipboard.writeText(token).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  return (
    <div className="pt-2 border-t border-sb-border mt-2">
      <p className="text-xs text-sb-muted mb-2">Render setup — copy server backup token:</p>
      <button
        onClick={copy}
        className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition"
      >
        {copied ? '✓ Copied to clipboard' : 'Copy GOOGLE_USERS_REFRESH_TOKEN'}
      </button>
    </div>
  );
}

// Sync health indicator — surfaces the actual last push/failure state from syncStatus.
// This is the answer to why the June 7 revocation went unnoticed for a month:
// silent failure is now visible on the Settings page, keyed off real Drive responses.
function SyncStatusIndicator({ userId }: { userId: string }) {
  const [status, setStatus] = useState(() => loadSyncStatus(userId));

  useEffect(() => {
    setStatus(loadSyncStatus(userId));
    const iv = setInterval(() => setStatus(loadSyncStatus(userId)), 10 * 1000);
    return () => clearInterval(iv);
  }, [userId]);

  function ago(iso: string | null): string {
    if (!iso) return 'never';
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  const hasAnyActivity = status.lastPushAt || status.lastFailureAt || status.lastBackgroundSyncAt;
  if (!hasAnyActivity) {
    return (
      <div className="rounded-xl bg-sb-card px-3 py-2 text-xs text-sb-muted">
        <span className="inline-block w-2 h-2 rounded-full bg-sb-muted mr-2 align-middle" />
        No sync activity recorded yet.
      </div>
    );
  }

  // Determine the "headline" state: is the most recent event a failure or a success?
  const lastSuccessTime = status.lastPushAt || status.lastBackgroundSyncAt;
  const lastSuccessMs = lastSuccessTime ? new Date(lastSuccessTime).getTime() : 0;
  const lastFailureMs = status.lastFailureAt ? new Date(status.lastFailureAt).getTime() : 0;
  const isFailing = lastFailureMs > lastSuccessMs;

  if (isFailing) {
    return (
      <div className="rounded-xl bg-red-950/40 border border-red-900/60 px-3 py-2 text-xs space-y-1">
        <p className="text-red-300 font-semibold">
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-2 align-middle" />
          Sync FAILING — {status.consecutiveFailures} consecutive failure{status.consecutiveFailures === 1 ? '' : 's'}
        </p>
        <p className="text-red-200/80">
          Last failure ({status.lastFailureOp}) {ago(status.lastFailureAt)}:
        </p>
        <p className="text-red-100 font-mono text-[10px] break-words">{status.lastFailureReason}</p>
        {status.lastPushAt && (
          <p className="text-sb-muted pt-1">Last successful push: {ago(status.lastPushAt)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-emerald-950/40 border border-emerald-900/60 px-3 py-2 text-xs space-y-1">
      <p className="text-sb-green font-semibold">
        <span className="inline-block w-2 h-2 rounded-full bg-sb-green mr-2 align-middle" />
        Sync healthy
      </p>
      {status.lastPushAt && (
        <p className="text-sb-muted">Last push: {ago(status.lastPushAt)}</p>
      )}
      {status.lastBackgroundSyncAt && (
        <p className="text-sb-muted">Last background sync: {ago(status.lastBackgroundSyncAt)}</p>
      )}
    </div>
  );
}

// Read-only diagnostic — dumps both cloud_settings localStorage keys with secrets redacted.
// Purpose: determine whether the user-namespaced key and the unnamespaced fallback agree,
// whether refresh tokens are present, and whether the current access token is expired,
// without exposing token values or calling any external service.
function CloudDiagnostic({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);

  function shortHash(s: string): string {
    // Non-cryptographic — just enough to compare "is this the same token" across keys.
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function summarizeProvider(p: unknown): Record<string, unknown> {
    const s = (p ?? {}) as Record<string, unknown>;
    const accessToken = typeof s.accessToken === 'string' ? s.accessToken : null;
    const refreshToken = typeof s.refreshToken === 'string' ? s.refreshToken : null;
    const expiresAt = typeof s.expiresAt === 'number' ? s.expiresAt : null;
    return {
      connected: s.connected === true,
      email: s.email ?? null,
      accessTokenPresent: !!accessToken,
      accessTokenHash: accessToken ? shortHash(accessToken) : null,
      accessTokenLen: accessToken?.length ?? 0,
      refreshTokenPresent: !!refreshToken,
      refreshTokenHash: refreshToken ? shortHash(refreshToken) : null,
      refreshTokenLen: refreshToken?.length ?? 0,
      expiresAt: expiresAt,
      expiresAtIso: expiresAt ? new Date(expiresAt).toISOString() : null,
      accessTokenExpired: expiresAt ? expiresAt <= Date.now() : null,
      scope: s.scope ?? null,
      tokenType: s.tokenType ?? null,
    };
  }

  function readKey(key: string): Record<string, unknown> | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return { _parseError: true }; }
  }

  function build(): string {
    const nsKey = `sb_u${userId}_cloud_settings`;
    const fbKey = `sb_cloud_settings`;
    const ns = readKey(nsKey);
    const fb = readKey(fbKey);

    const nsGoogle = ns ? summarizeProvider((ns as Record<string, unknown>).googleDrive) : null;
    const fbGoogle = fb ? summarizeProvider((fb as Record<string, unknown>).googleDrive) : null;

    const refreshMatch =
      nsGoogle && fbGoogle && nsGoogle.refreshTokenPresent && fbGoogle.refreshTokenPresent
        ? nsGoogle.refreshTokenHash === fbGoogle.refreshTokenHash
        : null;
    const accessMatch =
      nsGoogle && fbGoogle && nsGoogle.accessTokenPresent && fbGoogle.accessTokenPresent
        ? nsGoogle.accessTokenHash === fbGoogle.accessTokenHash
        : null;

    const report = {
      timestamp: new Date().toISOString(),
      userId,
      namespacedKey: nsKey,
      fallbackKey: fbKey,
      namespaced: ns ? {
        primaryProvider: ns.primaryProvider ?? null,
        autoSync: ns.autoSync ?? null,
        googleDrive: nsGoogle,
      } : null,
      fallback: fb ? {
        primaryProvider: fb.primaryProvider ?? null,
        autoSync: fb.autoSync ?? null,
        googleDrive: fbGoogle,
      } : null,
      comparison: {
        bothKeysExist: !!ns && !!fb,
        namespacedKeyExists: !!ns,
        fallbackKeyExists: !!fb,
        refreshTokensMatch: refreshMatch,
        accessTokensMatch: accessMatch,
        namespacedConnected: nsGoogle?.connected ?? null,
        fallbackConnected: fbGoogle?.connected ?? null,
        namespacedEmail: nsGoogle?.email ?? null,
        fallbackEmail: fbGoogle?.email ?? null,
      },
    };
    return JSON.stringify(report, null, 2);
  }

  function copy() {
    const text = build();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="pt-2 border-t border-sb-border mt-2">
      <p className="text-xs text-sb-muted mb-2">Sync diagnostic — read-only, no Drive calls, tokens redacted:</p>
      <button
        onClick={copy}
        className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition"
      >
        {copied ? '✓ Copied cloud state to clipboard' : 'Copy cloud state to clipboard'}
      </button>
    </div>
  );
}

// Isolated refresh-token test — POSTs the stored Google refresh token to the existing
// /api/auth/google/refresh endpoint and displays the response verbatim (new access token
// hashed if success, error object shown as-is on failure). Does NOT touch Drive, does NOT
// list/read/write any file, does NOT persist the new access token to localStorage.
// Purpose: distinguish "token valid, client-code bug" from "token revoked, must reconnect".
function RefreshTokenTester({ userId }: { userId: string }) {
  const [state, setState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  function shortHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  async function runTest() {
    setState('testing');
    setMessage('');

    const key = `sb_u${userId}_cloud_settings`;
    let refreshToken: string | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { googleDrive?: { refreshToken?: string } };
        refreshToken = parsed.googleDrive?.refreshToken ?? null;
      }
    } catch {
      setState('error');
      setMessage('Could not read cloud_settings from localStorage.');
      return;
    }

    if (!refreshToken) {
      setState('error');
      setMessage('No refresh token found in namespaced key. Reconnect Drive.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/google/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { _raw: text }; }

      if (res.ok) {
        const newAccess = typeof body.access_token === 'string' ? body.access_token : null;
        const expiresIn = body.expires_in;
        setState('success');
        setMessage(
          `HTTP ${res.status} — refresh SUCCEEDED\n` +
          `new access token: ${newAccess ? `hash=${shortHash(newAccess)}, len=${newAccess.length}` : 'MISSING FROM RESPONSE'}\n` +
          `expires_in: ${expiresIn ?? 'missing'}\n` +
          `scope: ${body.scope ?? 'missing'}\n` +
          `token_type: ${body.token_type ?? 'missing'}\n\n` +
          `→ Refresh token is VALID and Google honors it. Bug is in the client code path, not the credential.\n` +
          `Note: this new access token was NOT written to localStorage — stuck expiresAt is preserved.`
        );
      } else {
        // Sanitize: strip any tokens the server might echo back
        const sanitized = { ...body };
        delete sanitized.access_token;
        delete sanitized.refresh_token;
        setState('error');
        setMessage(
          `HTTP ${res.status} — refresh FAILED\n` +
          JSON.stringify(sanitized, null, 2) +
          `\n\n→ Interpret:\n` +
          `  • "invalid_grant" = refresh token REVOKED — must disconnect + reconnect Drive.\n` +
          `  • 500 or missing-secret error = server misconfig (Render env vars).\n` +
          `  • anything else = paste back for diagnosis.`
        );
      }
    } catch (err) {
      setState('error');
      setMessage(`Network error: ${(err as Error).message}`);
    }
  }

  return (
    <div className="pt-2 border-t border-sb-border mt-2">
      <p className="text-xs text-sb-muted mb-2">Test refresh token — asks Google if the stored refresh token still works. No Drive calls, no writes.</p>
      <button
        onClick={runTest}
        disabled={state === 'testing'}
        className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition disabled:opacity-50"
      >
        {state === 'testing' ? 'Testing…' : 'Test refresh token'}
      </button>
      {message && (
        <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug ${state === 'success' ? 'bg-sb-card text-sb-green' : 'bg-sb-card text-red-300'}`}>
          {message}
        </pre>
      )}
    </div>
  );
}

// Read-only audit — enumerates Drive folder, groups files by UUID, compares to
// local IndexedDB, reports duplicates + missing UUIDs. No writes, no deletes.
// Purpose: before archiving the current dirty folder, confirm every local UUID
// is represented at least once so we KNOW the archive is a complete superset.
function DriveAuditButton({ userId, label = 'Audit Drive vs local' }: { userId: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'auditing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  async function runAudit() {
    setState('auditing');
    setMessage('');
    try {
      const { auditDriveVsLocal } = await import('../lib/cloudSync');
      const result = await auditDriveVsLocal(userId);
      setState('done');
      const dupSummary = result.duplicateUuids.length === 0
        ? 'none'
        : `${result.duplicateUuids.length} UUIDs with dups (${result.totalDuplicateFiles} extra files)`;
      const missingSummary = result.missingFromDrive.length === 0
        ? 'none — every local UUID is present on Drive'
        : `${result.missingFromDrive.length} local UUIDs NOT on Drive`;
      setMessage(
        `Folder: ${result.folderName}\n` +
        `Folder ID: ${result.folderId}\n\n` +
        `LOCAL: ${result.localReceiptCount} receipts (${result.uniqueUuidsLocal} unique UUIDs)\n` +
        `DRIVE: ${result.totalFiles} files total, ${result.uniqueUuidsOnDrive} unique UUIDs\n\n` +
        `Missing from Drive: ${missingSummary}\n` +
        `Extra on Drive (no local match): ${result.extraOnDrive.length}\n` +
        `Duplicates: ${dupSummary}\n\n` +
        `Superset check: ${result.localSupersetOnDrive ? '✓ Drive contains every local UUID (safe to archive)' : '✗ INCOMPLETE — do not archive yet'}\n` +
        (result.duplicateUuids.length > 0
          ? `\nTop duplicated UUIDs:\n` + result.duplicateUuids.slice(0, 5).map(d => `  ${d.uuid.slice(0, 8)}… json×${d.jsonCount} jpg×${d.jpgCount}`).join('\n')
          : '')
      );
    } catch (err) {
      setState('error');
      setMessage(`Audit failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="rounded-2xl border border-sb-border bg-sb-card p-3">
      <p className="text-xs text-sb-muted mb-2">Compares your Drive folder to what's on this device. Read-only, no writes.</p>
      <button
        onClick={runAudit}
        disabled={state === 'auditing'}
        className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition disabled:opacity-50"
      >
        {state === 'auditing' ? 'Checking…' : label}
      </button>
      {message && (
        <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug ${state === 'done' ? 'bg-sb-card text-sb-green' : 'bg-sb-card text-red-300'}`}>
          {message}
        </pre>
      )}
    </div>
  );
}

// Year-scoped bulk cleanup — deletes receipts NOT in the current calendar year.
// Same shape as LocalDedupeButton: preview → confirm → cancel. Uses deleteReceipt
// (which tombstones), so backgroundSync propagates deletes to Drive.
function YearCleanupButton({ userId }: { userId: string }) {
  const [state, setState] = useState<'idle' | 'previewing' | 'preview-ready' | 'executing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [plan, setPlan] = useState<null | Awaited<ReturnType<typeof import('../lib/db').previewYearCleanup>>>(null);

  const currentYear = String(new Date().getFullYear());

  async function runPreview() {
    setState('previewing');
    setMessage('');
    setPlan(null);
    try {
      const { previewYearCleanup } = await import('../lib/db');
      const p = await previewYearCleanup(userId, [currentYear]);
      setPlan(p);
      if (p.totalRowsToDelete === 0) {
        setState('done');
        setMessage(`No receipts outside ${currentYear} — nothing to clean.`);
        return;
      }
      setState('preview-ready');
      const lines: string[] = [];
      lines.push(`KEEP: ${currentYear} only`);
      lines.push(`DELETE: ${p.totalRowsToDelete} receipts totaling $${p.totalDollarsToDelete.toFixed(2)}`);
      lines.push('');
      lines.push('By year:');
      for (const y of p.yearBreakdown) {
        lines.push(`  ${y.year}: ${y.count} receipts · $${y.totalDollars.toFixed(2)}`);
      }
      lines.push('');
      lines.push('Receipts to delete:');
      for (const r of p.rowsToDelete) {
        lines.push(`  ${r.receiptDate}  ${r.storeName}  $${r.total.toFixed(2)}  [${r.category}]`);
      }
      lines.push('');
      lines.push('After confirm: rows deleted from IndexedDB, tombstoned for Drive sync.');
      lines.push('Next backgroundSync will delete them from Drive.');
      setMessage(lines.join('\n'));
    } catch (err) {
      setState('error');
      setMessage(`Preview failed: ${(err as Error).message}`);
    }
  }

  async function runConfirm() {
    if (!plan) return;
    setState('executing');
    try {
      const { executeYearCleanup } = await import('../lib/db');
      const result = await executeYearCleanup(userId, plan);
      setState('done');
      const suffix = result.errors.length > 0 ? `\n\n${result.errors.length} error${result.errors.length === 1 ? '' : 's'}:\n${result.errors.join('\n')}` : '';
      setMessage(
        `✓ Deleted ${result.deleted} receipts from IndexedDB and tombstoned for Drive sync.\n` +
        `Tap "Sync now" (or wait for next background sync) to propagate deletes to Drive.\n` +
        `Then rerun "Audit local receipts" and "Audit Drive vs local" to verify clean state.${suffix}`
      );
      setPlan(null);
      window.dispatchEvent(new CustomEvent('receipts-updated'));
    } catch (err) {
      setState('error');
      setMessage(`Delete failed: ${(err as Error).message}`);
    }
  }

  function cancel() {
    setState('idle');
    setPlan(null);
    setMessage('');
  }

  return (
    <div className="pt-2 border-t border-sb-border mt-2">
      <p className="text-xs text-sb-muted mb-2">Year cleanup — deletes all receipts NOT in {currentYear}. Preview first, then confirm. Tombstones so Drive is cleaned on next sync.</p>
      {state !== 'preview-ready' && (
        <button
          onClick={runPreview}
          disabled={state === 'previewing' || state === 'executing'}
          className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition disabled:opacity-50"
        >
          {state === 'previewing' ? 'Building preview…' : state === 'executing' ? 'Deleting…' : `Preview year cleanup (keep ${currentYear})`}
        </button>
      )}
      {state === 'preview-ready' && (
        <div className="flex gap-2">
          <button
            onClick={runConfirm}
            className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:brightness-110 transition"
          >
            Confirm delete
          </button>
          <button
            onClick={cancel}
            className="flex-1 py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      )}
      {message && (
        <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug ${state === 'error' ? 'bg-sb-card text-red-300' : 'bg-sb-card text-sb-green'}`}>
          {message}
        </pre>
      )}
    </div>
  );
}

// Palette migration — preview + confirm re-map of category colors onto the
// curated 12-hue palette (Phase 1 of the redesign spec). Reads the user's
// custom_categories from localStorage, computes nearest curated color for
// each non-curated entry, shows the plan, then applies on confirm.
function PaletteMigrationButton({ userId }: { userId: string }) {
  const [state, setState] = useState<'idle' | 'previewing' | 'preview-ready' | 'executing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [plan, setPlan] = useState<ReturnType<typeof previewPaletteMigration> | null>(null);

  const key = `sb_u${userId}_custom_categories`;

  function loadCurrent(): { name: string; color: string }[] {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (c): c is { name: string; color: string } =>
          typeof c === 'object' && c !== null && typeof (c as { name: unknown }).name === 'string' && typeof (c as { color: unknown }).color === 'string'
      );
    } catch { return []; }
  }

  function runPreview() {
    setState('previewing');
    setMessage('');
    setPlan(null);
    try {
      const categories = loadCurrent();
      if (categories.length === 0) {
        setState('done');
        setMessage('No custom categories found. (Built-in category colors will update on the next release regardless.)');
        return;
      }
      const p = previewPaletteMigration(categories);
      setPlan(p);
      if (p.remaps.length === 0) {
        setState('done');
        setMessage(`All ${p.totalCategories} categories are already on the curated palette. Nothing to migrate.`);
        return;
      }
      setState('preview-ready');
      const lines: string[] = [];
      lines.push(`Plan: re-map ${p.remaps.length} of ${p.totalCategories} categories to the curated palette.`);
      lines.push('');
      lines.push('WILL CHANGE:');
      for (const r of p.remaps) {
        lines.push(`  ${r.name}`);
        lines.push(`    ${r.from}  →  ${r.to}`);
      }
      if (p.alreadyCurated.length > 0) {
        lines.push('');
        lines.push(`UNCHANGED (already on curated palette): ${p.alreadyCurated.length}`);
        for (const n of p.alreadyCurated) lines.push(`  ${n}`);
      }
      setMessage(lines.join('\n'));
    } catch (err) {
      setState('error');
      setMessage(`Preview failed: ${(err as Error).message}`);
    }
  }

  function runConfirm() {
    if (!plan) return;
    setState('executing');
    try {
      const current = loadCurrent();
      const migrated = applyPaletteMigration(current, plan);
      localStorage.setItem(key, JSON.stringify(migrated));
      setState('done');
      setMessage(`✓ Re-mapped ${plan.remaps.length} category color${plan.remaps.length === 1 ? '' : 's'}. Reload to see the new colors on receipts and category badges.`);
      setPlan(null);
    } catch (err) {
      setState('error');
      setMessage(`Apply failed: ${(err as Error).message}`);
    }
  }

  function cancel() {
    setState('idle');
    setPlan(null);
    setMessage('');
  }

  return (
    <div className="pt-2 border-t border-sb-border mt-2">
      <p className="text-xs text-sb-muted mb-2">Palette migration — re-maps custom category colors to the 12-hue curated palette. Preview first, then confirm.</p>
      {state !== 'preview-ready' && (
        <button
          onClick={runPreview}
          disabled={state === 'previewing' || state === 'executing'}
          className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition disabled:opacity-50"
        >
          {state === 'previewing' ? 'Building preview…' : state === 'executing' ? 'Applying…' : 'Preview palette migration'}
        </button>
      )}
      {state === 'preview-ready' && (
        <div className="flex gap-2">
          <button
            onClick={runConfirm}
            className="flex-1 py-2 rounded-lg bg-sb-green text-black text-xs font-semibold hover:brightness-110 transition"
          >
            Confirm re-map
          </button>
          <button
            onClick={cancel}
            className="flex-1 py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      )}
      {message && (
        <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug ${state === 'error' ? 'bg-sb-card text-red-300' : 'bg-sb-card text-sb-green'}`}>
          {message}
        </pre>
      )}
    </div>
  );
}

// Dedupe local receipts — two-stage: preview the plan (read-only), then confirm
// to execute the deletes. Keeps the row with the latest updatedAt per UUID.
// Warns per-UUID if any dropped rows have different store/total from the keeper
// (divergent — should never happen since UUID = same receipt, but surfaces it).
function LocalDedupeButton({ userId }: { userId: string }) {
  const [state, setState] = useState<'idle' | 'previewing' | 'preview-ready' | 'executing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [plan, setPlan] = useState<null | Awaited<ReturnType<typeof import('../lib/db').previewLocalDedupe>>>(null);

  async function runPreview() {
    setState('previewing');
    setMessage('');
    setPlan(null);
    try {
      const { previewLocalDedupe } = await import('../lib/db');
      const p = await previewLocalDedupe(userId);
      setPlan(p);
      if (p.entries.length === 0) {
        setState('done');
        setMessage('No duplicates found — local receipts are already clean.');
        return;
      }
      setState('preview-ready');
      const divergentCount = p.entries.filter(e => e.divergent).length;
      const lines: string[] = [];
      lines.push(`Plan: delete ${p.totalRowsToDelete} row${p.totalRowsToDelete === 1 ? '' : 's'} across ${p.entries.length} UUID${p.entries.length === 1 ? '' : 's'}.`);
      if (divergentCount > 0) {
        lines.push(`⚠ ${divergentCount} UUID${divergentCount === 1 ? ' has' : 's have'} DIVERGENT rows (different store/total under the same UUID) — review before confirming.`);
      }
      lines.push('');
      for (const e of p.entries) {
        lines.push(`UUID ${e.uuid.slice(0, 8)}…${e.divergent ? '  ⚠ DIVERGENT' : ''}`);
        lines.push(`  KEEP  id=${e.keep.id}  ${e.keep.receiptDate}  ${e.keep.storeName}  $${e.keep.total.toFixed(2)}  upd=${e.keep.updatedAt.slice(0, 19)}`);
        for (const d of e.drop) {
          lines.push(`  DROP  id=${d.id}  ${d.receiptDate}  ${d.storeName}  $${d.total.toFixed(2)}  upd=${d.updatedAt.slice(0, 19)}`);
        }
        lines.push('');
      }
      setMessage(lines.join('\n'));
    } catch (err) {
      setState('error');
      setMessage(`Preview failed: ${(err as Error).message}`);
    }
  }

  async function runConfirm() {
    if (!plan) return;
    setState('executing');
    try {
      const { executeLocalDedupe } = await import('../lib/db');
      const result = await executeLocalDedupe(userId, plan);
      setState('done');
      const suffix = result.errors.length > 0 ? `\n\n${result.errors.length} error${result.errors.length === 1 ? '' : 's'}:\n${result.errors.join('\n')}` : '';
      setMessage(`✓ Deleted ${result.deleted} duplicate row${result.deleted === 1 ? '' : 's'}. Rerun "Audit local receipts" to verify.${suffix}`);
      setPlan(null);
      window.dispatchEvent(new CustomEvent('receipts-updated'));
    } catch (err) {
      setState('error');
      setMessage(`Delete failed: ${(err as Error).message}`);
    }
  }

  function cancel() {
    setState('idle');
    setPlan(null);
    setMessage('');
  }

  return (
    <div className="pt-2 border-t border-sb-border mt-2">
      <p className="text-xs text-sb-muted mb-2">Dedupe local receipts — preview then confirm. Deletes only duplicate rows (same UUID), keeps the one with the latest updatedAt.</p>
      {state !== 'preview-ready' && (
        <button
          onClick={runPreview}
          disabled={state === 'previewing' || state === 'executing'}
          className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition disabled:opacity-50"
        >
          {state === 'previewing' ? 'Building preview…' : state === 'executing' ? 'Deleting…' : 'Preview local dedupe'}
        </button>
      )}
      {state === 'preview-ready' && (
        <div className="flex gap-2">
          <button
            onClick={runConfirm}
            className="flex-1 py-2 rounded-lg bg-sb-green text-black text-xs font-semibold hover:brightness-110 transition"
          >
            Confirm delete
          </button>
          <button
            onClick={cancel}
            className="flex-1 py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      )}
      {message && (
        <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug ${state === 'error' ? 'bg-sb-card text-red-300' : 'bg-sb-card text-sb-green'}`}>
          {message}
        </pre>
      )}
    </div>
  );
}

// Read-only local receipts audit — breaks down the local IndexedDB so we can
// reconcile "app says 93 stored" vs "monthly view shows ~50". Read-only, no
// changes, no deletes. Answers: what is my real data, what's duplicates,
// what's year-filtered out of view, what's malformed.
function LocalReceiptsAuditButton({ userId }: { userId: string }) {
  const [state, setState] = useState<'idle' | 'auditing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  async function runAudit() {
    setState('auditing');
    setMessage('');
    try {
      const { auditLocalReceipts } = await import('../lib/db');
      const r = await auditLocalReceipts(userId);
      setState('done');
      const yearLines = Object.entries(r.yearDistribution)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, count]) => `  ${year}: ${count}`)
        .join('\n');
      const dupSummary = r.duplicateUuids.length === 0
        ? 'none'
        : `${r.duplicateUuids.length} UUIDs duplicated (${r.duplicateUuids.reduce((s, d) => s + d.count - 1, 0)} extra rows)`;
      setMessage(
        `TOTAL rows in IndexedDB: ${r.totalRows}\n` +
        `Unique UUIDs: ${r.uniqueUuids}\n\n` +
        `Duplicates: ${dupSummary}\n` +
        `Missing UUID: ${r.missingUuid}\n` +
        `Demo/seed rows: ${r.demoRows}\n` +
        `Invalid/missing date: ${r.invalidDate}\n` +
        `Tombstones (deleted, awaiting Drive sync): ${r.tombstonedCount}\n\n` +
        `Year distribution:\n${yearLines}\n\n` +
        `Displayable in current year: ${r.displayableInCurrentYear}\n` +
        `Displayable across all years: ${r.displayableAllYears}\n\n` +
        (r.duplicateUuids.length > 0
          ? `Top duplicate UUIDs:\n` + r.duplicateUuids.slice(0, 5).map(d => `  ${d.uuid.slice(0, 8)}… ×${d.count}`).join('\n')
          : '')
      );
    } catch (err) {
      setState('error');
      setMessage(`Audit failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="pt-2 border-t border-sb-border mt-2">
      <p className="text-xs text-sb-muted mb-2">Audit local receipts — breaks down the phone IndexedDB by count, UUID, year, and validity. Read-only.</p>
      <button
        onClick={runAudit}
        disabled={state === 'auditing'}
        className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition disabled:opacity-50"
      >
        {state === 'auditing' ? 'Auditing…' : 'Audit local receipts'}
      </button>
      {message && (
        <pre className={`mt-2 whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug ${state === 'done' ? 'bg-sb-card text-sb-green' : 'bg-sb-card text-red-300'}`}>
          {message}
        </pre>
      )}
    </div>
  );
}

// Admin-only tool: list every account with local data on this browser
// (Dexie DB + localStorage keys), let the admin remove leftover test-account
// data without going through the handover consent flow. Safe by design:
// only removes accounts other than the currently-signed-in user, and each
// removal is a deliberate per-account button (no bulk "remove all").
function LocalAccountsCleanupButton({ currentUserId }: { currentUserId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [snapshots, setSnapshots] = useState<{ userId: string; receiptCount: number }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadSnapshots() {
    setState('loading');
    try {
      const { listUserIdsWithLocalData } = await import('../lib/userStorage');
      const ids = listUserIdsWithLocalData().filter(id => id !== currentUserId);
      const out: { userId: string; receiptCount: number }[] = [];
      for (const id of ids) {
        let count = 0;
        try {
          const { getDb } = await import('../lib/db');
          count = await getDb(id).receipts.count();
        } catch { /* DB may not exist for that userId; count = 0 */ }
        out.push({ userId: id, receiptCount: count });
      }
      setSnapshots(out.sort((a, b) => b.receiptCount - a.receiptCount));
      setState('ready');
    } catch {
      setState('idle');
    }
  }

  async function removeOne(userId: string) {
    if (!confirm(`Remove all local data for account ${userId.slice(0, 8)}…?\nThis deletes the local Dexie DB and localStorage keys for that account on THIS browser only. Data on other devices / in Drive is untouched.`)) return;
    setBusy(userId);
    try {
      const { deletePriorUserDb } = await import('../lib/deviceHandover');
      const { clearUserStorage, unmarkUserEstablished } = await import('../lib/userStorage');
      await deletePriorUserDb(userId);
      clearUserStorage(userId);
      unmarkUserEstablished(userId);
      setSnapshots(prev => prev.filter(s => s.userId !== userId));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-sb-border bg-sb-card p-3">
      <p className="text-xs text-sb-muted mb-2">
        Leftover local account data on this browser. Removing an account here
        deletes ONLY the data on this browser — other devices and Drive backups
        are untouched.
      </p>
      {state === 'idle' && (
        <button
          onClick={loadSnapshots}
          className="w-full py-2 rounded-lg border border-sb-border text-xs text-sb-muted hover:text-white hover:border-sb-green transition"
        >
          List local accounts
        </button>
      )}
      {state === 'loading' && (
        <p className="text-xs text-sb-muted text-center py-2">Scanning…</p>
      )}
      {state === 'ready' && (
        snapshots.length === 0 ? (
          <p className="text-xs text-sb-green text-center py-2">No other account data on this browser.</p>
        ) : (
          <div className="space-y-1.5">
            {snapshots.map(s => (
              <div key={s.userId} className="flex items-center justify-between gap-2 rounded-lg bg-sb-card2 border border-sb-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-white text-xs font-mono truncate">{s.userId.slice(0, 12)}…</p>
                  <p className="text-[10px] text-sb-muted">{s.receiptCount} receipt{s.receiptCount === 1 ? '' : 's'}</p>
                </div>
                <button
                  onClick={() => removeOne(s.userId)}
                  disabled={busy === s.userId}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] text-red-300 border border-red-900/50 hover:bg-red-950/40 transition disabled:opacity-50"
                >
                  {busy === s.userId ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Section({
  icon, title, children, defaultOpen = true, headerMeta,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  headerMeta?: React.ReactNode;   // Optional glanceable value shown on collapsed header (e.g. "86")
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-sb-card border border-sb-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-sb-green">{icon}</span>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {headerMeta && <span className="text-white/60 text-sm font-semibold">{headerMeta}</span>}
          <ChevronDown size={16} className={`text-sb-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sb-muted">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function CloudRow({ label, description, status, actionLabel, onAction, connectHref }: { label: string; description: string; status?: string; actionLabel?: string; onAction?: () => void; connectHref?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-sb-border last:border-0">
      <div>
        <p className="text-white text-sm">{label}</p>
        <p className="text-sb-muted text-xs">{description}</p>
        {status && <p className="text-[11px] text-sb-green mt-1">{status}</p>}
      </div>
      {connectHref ? (
        <a
          href={connectHref}
          className="rounded-full border border-sb-border bg-sb-card2 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-sb-green"
        >
          {actionLabel}
        </a>
      ) : actionLabel ? (
        <button
          onClick={onAction}
          className="rounded-full border border-sb-border bg-sb-card2 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-sb-green"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
