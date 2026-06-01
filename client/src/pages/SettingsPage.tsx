import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, FileSpreadsheet, Cloud, Info, MapPin, Activity, ChevronDown, DownloadCloud, Users, LogOut, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAllReceipts } from '../lib/db';
import { useCloudAuth } from '../hooks/useCloudAuth';
import { backgroundSync, restoreFromGoogleDrive, cleanupDriveDuplicates, type RestoreResult, type SyncResult, type CleanupResult } from '../lib/cloudSync';
import { loadClients, addClient, removeClient } from '../utils/clients';
import { useAuth } from '../contexts/AuthContext';
import React from 'react';

export const APP_VERSION = '0.8.1';

interface CustomCategory {
  name: string;
  color: string;
}

// Full-spectrum color palette — displayed as visual circles
const PALETTE_COLORS: string[] = [
  // Reds
  '#DC143C', '#F44747', '#FF4500', '#E8405A',
  // Oranges
  '#E67E22', '#FF8C00', '#F28500', '#E34234',
  // Yellows
  '#F5C518', '#eab308', '#FDE047', '#FBBF24',
  // Yellow-Greens
  '#7FBA00', '#84CC16', '#6DBF4A', '#A3E635',
  // Greens
  '#4ade80', '#10B981', '#16A34A', '#22C55E',
  // Teals / Cyans
  '#14B8A6', '#4ECDC4', '#2DD4BF', '#06B6D4',
  // Blues
  '#0C87C1', '#3B82F6', '#4169E1', '#0047AB',
  '#6A7FDB', '#4682B4',
  // Indigos / Violets
  '#6366F1', '#7C3AED', '#8B9FE8',
  // Purples
  '#a855f7', '#9B4DCA', '#C084FC', '#B57BEA',
  // Pinks / Magentas
  '#D946EF', '#EC4899', '#F472B6', '#C0296D',
  // Neutrals
  '#64748B', '#6B7280', '#888888', '#9CA3AF', '#4B5563',
];

const DEFAULT_CATEGORIES: CustomCategory[] = [
  { name: 'Comm',                color: '#2DD4BF' },
  { name: 'Loan/Interest',       color: '#F44747' },
  { name: 'Meals',               color: '#4ade80' },
  { name: 'Medical',             color: '#60a5fa' },
  { name: 'Postage',             color: '#E67E22' },
  { name: 'Supplies & Hardware', color: '#eab308' },
  { name: 'AI Services',         color: '#a855f7' },
  { name: 'Insurance',           color: '#888888' },
  { name: 'Rent',                color: '#0C87C1' },
  { name: 'Travel',              color: '#4ECDC4' },
  { name: 'Subscriptions',       color: '#f472b6' },
];

function catStorageKey(userId: string)        { return `sb_u${userId}_custom_categories`; }
function catVersionKey(userId: string)        { return `sb_u${userId}_category_version`; }
function taxStorageKey(userId: string)        { return `sb_u${userId}_tax_region`; }
const CURRENT_CATEGORY_VERSION = '2';

function loadCustomCategories(userId: string): CustomCategory[] {
  try {
    const storedVersion = localStorage.getItem(catVersionKey(userId));
    if (storedVersion !== CURRENT_CATEGORY_VERSION) {
      localStorage.setItem(catStorageKey(userId), JSON.stringify(DEFAULT_CATEGORIES));
      localStorage.setItem(catVersionKey(userId), CURRENT_CATEGORY_VERSION);
      return DEFAULT_CATEGORIES;
    }
    const raw = localStorage.getItem(catStorageKey(userId));
    if (!raw) {
      localStorage.setItem(catStorageKey(userId), JSON.stringify(DEFAULT_CATEGORIES));
      return DEFAULT_CATEGORIES;
    }
    return JSON.parse(raw) as CustomCategory[];
  } catch { return DEFAULT_CATEGORIES; }
}

interface TaxRegion {
  province: string;
  gst: number;
  pst: number;
  hst: number;
  qst: number;
  vat: number;
}

const PROVINCES: { name: string; gst: number; pst: number; hst: number; qst: number }[] = [
  { name: 'Alberta',              gst: 5,    pst: 0,     hst: 0,  qst: 0      },
  { name: 'British Columbia',     gst: 5,    pst: 7,     hst: 0,  qst: 0      },
  { name: 'Manitoba',             gst: 5,    pst: 7,     hst: 0,  qst: 0      },
  { name: 'New Brunswick',        gst: 0,    pst: 0,     hst: 15, qst: 0      },
  { name: 'Newfoundland',         gst: 0,    pst: 0,     hst: 15, qst: 0      },
  { name: 'Nova Scotia',          gst: 0,    pst: 0,     hst: 15, qst: 0      },
  { name: 'Ontario',              gst: 0,    pst: 0,     hst: 13, qst: 0      },
  { name: 'Prince Edward Island', gst: 0,    pst: 0,     hst: 15, qst: 0      },
  { name: 'Quebec',               gst: 5,    pst: 0,     hst: 0,  qst: 9.975  },
  { name: 'Saskatchewan',         gst: 5,    pst: 6,     hst: 0,  qst: 0      },
  { name: 'Northwest Territories',gst: 5,    pst: 0,     hst: 0,  qst: 0      },
  { name: 'Nunavut',              gst: 5,    pst: 0,     hst: 0,  qst: 0      },
  { name: 'Yukon',                gst: 5,    pst: 0,     hst: 0,  qst: 0      },
  { name: 'Other/International',  gst: 0,    pst: 0,     hst: 0,  qst: 0      },
];

function loadTaxRegion(userId: string): TaxRegion {
  try {
    const raw = localStorage.getItem(taxStorageKey(userId));
    return raw ? JSON.parse(raw) : { province: '', gst: 0, pst: 0, hst: 0, qst: 0, vat: 0 };
  } catch { return { province: '', gst: 0, pst: 0, hst: 0, qst: 0, vat: 0 }; }
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
  const { settings: cloudSettings, connectToProvider, disconnectProvider, setPrimaryProvider, toggleAutoSync } = useCloudAuth(userId);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [scanStats, setScanStats] = useState<ScanStats | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);

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

  const [clients, setClients]         = useState<string[]>(() => loadClients(userId));
  const [newClientName, setNewClientName] = useState('');
  const [clientError, setClientError] = useState('');

  const [taxRegion, setTaxRegion] = useState<TaxRegion>(() => loadTaxRegion(userId));
  const [manualVat, setManualVat] = useState(() => { const t = loadTaxRegion(userId); return t.vat > 0 ? String(t.vat) : ''; });

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

  function removeCategory(name: string) {
    saveCustomCategories(customCategories.filter(c => c.name !== name));
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
    setClients(removeClient(userId, name));
  }

  function handleProvinceChange(provinceName: string) {
    const p = PROVINCES.find(pr => pr.name === provinceName);
    if (!p) return;
    const updated: TaxRegion = {
      province: provinceName,
      gst: p.gst,
      pst: p.pst,
      hst: p.hst,
      qst: p.qst,
      vat: provinceName === 'Other/International' ? (parseFloat(manualVat) || 0) : 0,
    };
    setTaxRegion(updated);
    localStorage.setItem(taxStorageKey(userId), JSON.stringify(updated));
  }

  function handleVatChange(value: string) {
    setManualVat(value);
    const updated: TaxRegion = { ...taxRegion, vat: parseFloat(value) || 0 };
    setTaxRegion(updated);
    localStorage.setItem(taxStorageKey(userId), JSON.stringify(updated));
  }

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border px-4 py-3 safe-top">
        <h1 className="text-base font-bold text-white text-center">Settings</h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 space-y-4 max-w-lg mx-auto w-full">

        {/* Clients */}
        <Section icon={<Users size={16} />} title="Clients" defaultOpen={false}>
          <div className="space-y-1.5 mb-4">
            {clients.length === 0 ? (
              <p className="text-xs text-sb-muted italic">No clients yet. Add one below.</p>
            ) : (
              clients.map(client => (
                <div key={client} className="flex items-center justify-between bg-sb-card2 border border-sb-border rounded-xl px-3 py-2">
                  <span className="text-white text-sm">{client}</span>
                  <button onClick={() => handleRemoveClient(client)} className="text-sb-muted hover:text-red-400 transition p-1">
                    <Trash2 size={14} />
                  </button>
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

        {/* Categories */}
        <Section icon={<Tag size={16} />} title="Categories" defaultOpen={false}>
          {/* All categories — custom ones are deletable */}
          <div className="space-y-1.5 mb-4">
            {customCategories.length === 0 ? (
              <p className="text-xs text-sb-muted italic">No categories yet. Add one below.</p>
            ) : (
              customCategories.map(cat => (
                <div key={cat.name} className="flex items-center justify-between bg-sb-card2 border border-sb-border rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-white text-sm">{cat.name}</span>
                  </div>
                  <button onClick={() => removeCategory(cat.name)} className="text-sb-muted hover:text-red-400 transition p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add category form */}
          <div className="border border-sb-border rounded-xl p-3 space-y-3">
            <p className="text-xs text-sb-muted font-medium">Add category</p>
            <input
              value={newCatName}
              onChange={e => { setNewCatName(e.target.value); setCatError(''); }}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="Category name"
              className="sb-input"
            />
            {/* Visual color grid */}
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

        {/* Tax Settings */}
        <Section icon={<MapPin size={16} />} title="Tax Settings">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-sb-muted mb-1.5">Province / Region</label>
              <select
                value={taxRegion.province}
                onChange={e => handleProvinceChange(e.target.value)}
                className="w-full bg-sb-card2 border border-sb-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-sb-green transition"
              >
                <option value="" disabled>Select province…</option>
                {PROVINCES.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            {taxRegion.province && taxRegion.province !== 'Other/International' && (
              <div className="bg-sb-card2 border border-sb-border rounded-xl px-3 py-3 space-y-1.5">
                <p className="text-xs text-sb-muted font-medium mb-2">Tax rates for {taxRegion.province}</p>
                {taxRegion.hst > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-sb-muted">HST</span>
                    <span className="text-white font-medium">{taxRegion.hst}%</span>
                  </div>
                )}
                {taxRegion.gst > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-sb-muted">GST</span>
                    <span className="text-white font-medium">{taxRegion.gst}%</span>
                  </div>
                )}
                {taxRegion.pst > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-sb-muted">PST</span>
                    <span className="text-white font-medium">{taxRegion.pst}%</span>
                  </div>
                )}
                {taxRegion.qst > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-sb-muted">QST</span>
                    <span className="text-white font-medium">{taxRegion.qst}%</span>
                  </div>
                )}
              </div>
            )}

            {taxRegion.province === 'Other/International' && (
              <div>
                <label className="block text-xs text-sb-muted mb-1.5">VAT / Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={manualVat}
                  onChange={e => handleVatChange(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full bg-sb-card2 border border-sb-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-sb-green transition"
                />
              </div>
            )}

            <p className="text-xs text-sb-muted">
              For reference only — proportional tax is calculated from scanned receipt line items.
            </p>
          </div>
        </Section>

        {/* Export */}
        <Section icon={<FileSpreadsheet size={16} />} title="Export">
          <p className="text-xs text-sb-muted">
            Download your expense spreadsheet from the{' '}
            <button onClick={() => navigate('/export')} className="text-sb-green hover:underline">
              Export page
            </button>
            . Excel (.xlsx) with a summary sheet and one sheet per category.
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

                {/* One-time cleanup for legacy duplicate files */}
                <div className="rounded-2xl border border-sb-border bg-sb-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-white text-sm">Clean up Drive duplicates</p>
                      <p className="text-xs text-sb-muted">Remove duplicate receipt files created by earlier sync bugs. Run once.</p>
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

        {/* Receipt Stats */}
        <Section icon={<Activity size={16} />} title="Receipts">
          {scanStats === null ? (
            <p className="text-sb-muted text-xs">Loading…</p>
          ) : scanStats.receiptCount === 0 ? (
            <p className="text-xs text-sb-muted">No receipts yet. Scan your first receipt to start tracking expenses.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <StatRow label="Receipts stored" value={String(scanStats.receiptCount)} />
              <p className="text-[11px] text-sb-muted pt-1 opacity-70">
                Stored locally in your browser (IndexedDB). Back up via Google Drive or Dropbox above.
              </p>
            </div>
          )}
        </Section>

        {/* About */}
        <Section icon={<Info size={16} />} title="About">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-sb-muted">Version</span>
              <span className="text-white">{APP_VERSION}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sb-muted">Account</span>
              <span className="text-white text-xs truncate max-w-[180px]">{user?.email}</span>
            </div>
            {/* Temp: copy Google refresh token for Render GOOGLE_USERS_REFRESH_TOKEN setup */}
            <ServerTokenCopier userId={userId} />
          </div>
        </Section>

        {/* Admin — only visible to admin account */}
        {user?.email?.toLowerCase() === 'cortespainter@gmail.com' && (
          <AdminPanel />
        )}

        {/* Sign out */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-sb-border text-sb-muted hover:text-red-400 hover:border-red-900/50 transition text-sm"
        >
          <LogOut size={15} />
          Sign Out
        </button>

      </main>
    </div>
  );
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function AdminPanel() {
  const [users, setUsers] = useState<{ id: string; email: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const token = localStorage.getItem('sb_auth_token');

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

  return (
    <Section icon={<Shield size={16} />} title="Admin" defaultOpen={false}>
      <div className="space-y-3">
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
            <div className="divide-y divide-sb-border rounded-xl overflow-hidden border border-sb-border">
              {users.map(u => (
                <div key={u.id} className="px-3 py-2.5 bg-sb-card2">
                  <p className="text-white text-sm">{u.email}</p>
                  <p className="text-sb-muted text-xs">{new Date(u.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
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

function Section({ icon, title, children, defaultOpen = true }: { icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
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
        <ChevronDown size={16} className={`text-sb-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
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
