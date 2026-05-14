import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, FileSpreadsheet, Cloud, Info, MapPin, Activity, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAllReceipts } from '../lib/db';
import { useCloudAuth } from '../hooks/useCloudAuth';
import { getCloudSyncQueue, getCloudSyncSummary, processCloudSyncQueue } from '../lib/cloudSync';
import React from 'react';

export const APP_VERSION = '0.3.7';

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

const STORAGE_KEY = 'sb_custom_categories';
const CATEGORY_VERSION_KEY = 'sb_category_version';
const CURRENT_CATEGORY_VERSION = '2';
const TAX_STORAGE_KEY = 'sb_tax_region';

function loadCustomCategories(): CustomCategory[] {
  try {
    // Version stamp — if version doesn't match, reset to current defaults
    const storedVersion = localStorage.getItem(CATEGORY_VERSION_KEY);
    if (storedVersion !== CURRENT_CATEGORY_VERSION) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CATEGORIES));
      localStorage.setItem(CATEGORY_VERSION_KEY, CURRENT_CATEGORY_VERSION);
      return DEFAULT_CATEGORIES;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CATEGORIES));
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

function loadTaxRegion(): TaxRegion {
  try {
    const raw = localStorage.getItem(TAX_STORAGE_KEY);
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
  const { settings: cloudSettings, connectToProvider, disconnectProvider, setPrimaryProvider, toggleAutoSync } = useCloudAuth();

  const [syncStatus, setSyncStatus] = useState(() => getCloudSyncSummary(cloudSettings.primaryProvider));
  const [syncQueue, setSyncQueue] = useState(() => getCloudSyncQueue());
  const [isSyncing, setIsSyncing] = useState(false);
  const [scanStats, setScanStats] = useState<ScanStats | null>(null);

  useEffect(() => {
    getAllReceipts().then(rows => {
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

  useEffect(() => {
    setSyncStatus(getCloudSyncSummary(cloudSettings.primaryProvider));
    setSyncQueue(getCloudSyncQueue());

    if (!cloudSettings.autoSync || !cloudSettings.primaryProvider) return;
    if (cloudSettings.primaryProvider === 'google-drive' && !cloudSettings.googleDrive.connected) return;
    if (cloudSettings.primaryProvider === 'dropbox' && !cloudSettings.dropbox.connected) return;

    void processCloudSyncQueue().then(status => {
      setSyncStatus(status);
      setSyncQueue(getCloudSyncQueue());
    });
  }, [cloudSettings]);

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      const status = await processCloudSyncQueue();
      setSyncStatus(status);
      setSyncQueue(getCloudSyncQueue());
    } catch (error) {
      setSyncStatus(prev => ({
        ...prev,
        lastResult: 'Manual sync failed',
        errorMessage: (error as Error).message,
      }));
    } finally {
      setIsSyncing(false);
    }
  }

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(loadCustomCategories);
  const [newCatName, setNewCatName]   = useState('');
  const [newCatColor, setNewCatColor] = useState(PALETTE_COLORS[0]);
  const [catError, setCatError]       = useState('');

  const [taxRegion, setTaxRegion] = useState<TaxRegion>(loadTaxRegion);
  const [manualVat, setManualVat] = useState(taxRegion.vat > 0 ? String(taxRegion.vat) : '');

  function saveCustomCategories(cats: CustomCategory[]) {
    setCustomCategories(cats);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
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
    localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(updated));
  }

  function handleVatChange(value: string) {
    setManualVat(value);
    const updated: TaxRegion = { ...taxRegion, vat: parseFloat(value) || 0 };
    setTaxRegion(updated);
    localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(updated));
  }

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border px-4 py-3 safe-top">
        <h1 className="text-base font-bold text-white text-center">Settings</h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 space-y-4 max-w-lg mx-auto w-full">

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
              <Plus size={15} /> Add Category
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
              onAction={() => cloudSettings.googleDrive.connected ? disconnectProvider('google-drive') : connectToProvider('google-drive')}
            />
            <CloudRow
              label="Dropbox"
              description="Upload to your app folder"
              status={cloudSettings.dropbox.connected ? `Connected: ${cloudSettings.dropbox.email ?? 'Dropbox'}` : 'Not connected'}
              actionLabel={cloudSettings.dropbox.connected ? 'Disconnect' : 'Connect'}
              onAction={() => cloudSettings.dropbox.connected ? disconnectProvider('dropbox') : connectToProvider('dropbox')}
            />
            <div className="rounded-2xl border border-sb-border bg-sb-card2 p-3 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-white text-sm">Sync status</p>
                  <p className="text-xs text-sb-muted">Pending uploads and retry state for your selected cloud provider.</p>
                </div>
                <button
                  onClick={handleSyncNow}
                  disabled={isSyncing || !cloudSettings.primaryProvider || !(cloudSettings.primaryProvider === 'google-drive' ? cloudSettings.googleDrive.connected : cloudSettings.dropbox.connected)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${isSyncing ? 'bg-sb-border text-white cursor-not-allowed' : 'bg-sb-green text-black'} ${!cloudSettings.primaryProvider ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSyncing ? 'Syncing…' : 'Sync now'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-sb-card px-3 py-2">
                  <p className="text-sb-muted">Pending</p>
                  <p className="text-white font-semibold">{syncStatus.pendingCount}</p>
                </div>
                <div className="rounded-xl bg-sb-card px-3 py-2">
                  <p className="text-sb-muted">Failed</p>
                  <p className="text-white font-semibold">{syncStatus.failedCount}</p>
                </div>
                <div className="rounded-xl bg-sb-card px-3 py-2">
                  <p className="text-sb-muted">Last synced</p>
                  <p className="text-white font-semibold">
                    {syncStatus.lastRunAt ? new Date(syncStatus.lastRunAt).toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>

              {syncStatus.lastResult && (
                <p className="text-xs text-sb-muted">{syncStatus.lastResult}</p>
              )}

              {syncStatus.errorMessage && (
                <p className="text-xs text-red-400">Error: {syncStatus.errorMessage}</p>
              )}

              {syncQueue.length > 0 && (
                <div className="rounded-xl bg-sb-card px-3 py-3 text-xs space-y-2">
                  <p className="text-sb-muted">Queued receipts ({syncQueue.length})</p>
                  <div className="space-y-1">
                    {syncQueue.slice(0, 3).map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span>{item.metadata.storeName || 'Receipt'} </span>
                        <span className="text-sb-green">{item.provider === 'google-drive' ? 'Drive' : 'Dropbox'}</span>
                      </div>
                    ))}
                    {syncQueue.length > 3 && (
                      <p className="text-sb-muted">and {syncQueue.length - 3} more...</p>
                    )}
                  </div>
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
          </div>
        </Section>

      </main>
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

function CloudRow({ label, description, status, actionLabel, onAction }: { label: string; description: string; status?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-sb-border last:border-0">
      <div>
        <p className="text-white text-sm">{label}</p>
        <p className="text-sb-muted text-xs">{description}</p>
        {status && <p className="text-[11px] text-sb-green mt-1">{status}</p>}
      </div>
      {actionLabel ? (
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
