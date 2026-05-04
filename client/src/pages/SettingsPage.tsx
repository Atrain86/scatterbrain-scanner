import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, FileSpreadsheet, Cloud, Info, MapPin, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthFetch } from '../contexts/AuthContext';
import React from 'react';

export const APP_VERSION = '0.3.1';

interface CustomCategory {
  name: string;
  color: string;
}

// Full-spectrum color palette (LAB-distributed across all hues)
const PALETTE_COLORS: { label: string; color: string }[] = [
  // Reds
  { label: 'Crimson',      color: '#DC143C' },
  { label: 'Red',          color: '#F44747' },
  { label: 'Coral Red',    color: '#FF4500' },
  { label: 'Rose',         color: '#E8405A' },
  // Oranges
  { label: 'Vermilion',    color: '#E34234' },
  { label: 'Orange',       color: '#E67E22' },
  { label: 'Amber',        color: '#FF8C00' },
  { label: 'Tangerine',    color: '#F28500' },
  // Yellows
  { label: 'Gold',         color: '#F5C518' },
  { label: 'Yellow',       color: '#eab308' },
  { label: 'Lemon',        color: '#FDE047' },
  { label: 'Butter',       color: '#FBBF24' },
  // Yellow-Greens
  { label: 'Chartreuse',   color: '#7FBA00' },
  { label: 'Lime',         color: '#84CC16' },
  { label: 'Yellow-Green', color: '#6DBF4A' },
  // Greens
  { label: 'Mint',         color: '#4ade80' },
  { label: 'Emerald',      color: '#10B981' },
  { label: 'Forest',       color: '#16A34A' },
  { label: 'Sage',         color: '#6B8F71' },
  { label: 'Olive',        color: '#7C8C3A' },
  // Teals / Cyans
  { label: 'Teal',         color: '#14B8A6' },
  { label: 'Cyan',         color: '#4ECDC4' },
  { label: 'Aqua',         color: '#2DD4BF' },
  { label: 'Dark Teal',    color: '#0D9488' },
  { label: 'Sky',          color: '#06B6D4' },
  // Blues
  { label: 'Cerulean',     color: '#0C87C1' },
  { label: 'Cobalt',       color: '#0047AB' },
  { label: 'Royal Blue',   color: '#4169E1' },
  { label: 'Blue',         color: '#3B82F6' },
  { label: 'Steel Blue',   color: '#4682B4' },
  { label: 'Slate Blue',   color: '#6A7FDB' },
  // Indigos / Violets
  { label: 'Indigo',       color: '#6366F1' },
  { label: 'Periwinkle',   color: '#8B9FE8' },
  { label: 'Violet',       color: '#7C3AED' },
  // Purples
  { label: 'Purple',       color: '#a855f7' },
  { label: 'Plum',         color: '#9B4DCA' },
  { label: 'Lavender',     color: '#C084FC' },
  { label: 'Mauve',        color: '#B57BEA' },
  // Pinks / Magentas
  { label: 'Fuchsia',      color: '#D946EF' },
  { label: 'Hot Pink',     color: '#EC4899' },
  { label: 'Pink',         color: '#F472B6' },
  { label: 'Raspberry',    color: '#C0296D' },
  { label: 'Magenta',      color: '#FF00FF' },
  // Neutrals
  { label: 'Slate',        color: '#64748B' },
  { label: 'Gray',         color: '#6B7280' },
  { label: 'Cool Gray',    color: '#888888' },
  { label: 'Warm Gray',    color: '#9CA3AF' },
  { label: 'Charcoal',     color: '#4B5563' },
  { label: 'Silver',       color: '#A0AEC0' },
];

const STORAGE_KEY = 'sb_custom_categories';
const TAX_STORAGE_KEY = 'sb_tax_region';

function loadCustomCategories(): CustomCategory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
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
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const authFetch = useAuthFetch();

  const [scanStats, setScanStats] = useState<ScanStats | null>(null);

  useEffect(() => {
    authFetch('/api/stats').then(r => r.ok ? r.json() : null).then(d => d && setScanStats(d));
  }, []);

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(loadCustomCategories);
  const [newCatName, setNewCatName]   = useState('');
  const [newCatColor, setNewCatColor] = useState(PALETTE_COLORS[0].color);
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
        <Section icon={<Tag size={16} />} title="Categories">
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
            {/* Color dropdown with swatch preview */}
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-full flex-shrink-0 border border-white/20"
                style={{ backgroundColor: newCatColor }}
              />
              <select
                value={newCatColor}
                onChange={e => setNewCatColor(e.target.value)}
                className="flex-1 bg-sb-card2 border border-sb-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-sb-green transition"
              >
                {PALETTE_COLORS.map(({ label, color }) => (
                  <option key={color} value={color}>{label}</option>
                ))}
              </select>
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

        {/* Cloud stubs */}
        <Section icon={<Cloud size={16} />} title="Cloud Export">
          <div className="space-y-3">
            <CloudRow label="Google Drive" description="Upload directly to your Drive" comingSoon />
            <CloudRow label="Dropbox" description="Upload to your app folder" comingSoon />
            <p className="text-xs text-sb-muted pt-1">Coming after beta.</p>
          </div>
        </Section>

        {/* API Usage */}
        <Section icon={<Activity size={16} />} title="API Usage">
          {scanStats === null ? (
            <p className="text-sb-muted text-xs">Loading…</p>
          ) : scanStats.totalScans === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-sb-muted">No scans logged yet. Scan your first receipt to start tracking usage.</p>
              <StatRow label="Receipts in DB" value={String(scanStats.receiptCount)} />
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <StatRow label="Receipts in DB"   value={String(scanStats.receiptCount)} />
              <StatRow label="Total scans"       value={String(scanStats.totalScans)} />
              <StatRow label="Successful scans"  value={String(scanStats.successScans)} />
              <StatRow label="Total tokens used" value={scanStats.totalTokens.toLocaleString()} />
              <StatRow label="Input tokens"      value={scanStats.promptTokens.toLocaleString()} />
              <StatRow label="Output tokens"     value={scanStats.completionTokens.toLocaleString()} />
              <div className="flex justify-between border-t border-sb-border pt-2 mt-1">
                <span className="text-sb-muted">Est. API cost</span>
                <span className="text-sb-green font-semibold">
                  ${scanStats.estimatedCostUSD.toFixed(4)} USD
                </span>
              </div>
              <p className="text-[11px] text-sb-muted pt-1 opacity-70">
                gpt-4o: $2.50/1M input · $10/1M output tokens
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

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sb-green">{icon}</span>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
      </div>
      {children}
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

function CloudRow({ label, description, comingSoon }: { label: string; description: string; comingSoon?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-sb-border last:border-0">
      <div>
        <p className="text-white text-sm">{label}</p>
        <p className="text-sb-muted text-xs">{description}</p>
      </div>
      {comingSoon && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-sb-card2 border border-sb-border text-sb-muted">Soon</span>
      )}
    </div>
  );
}
