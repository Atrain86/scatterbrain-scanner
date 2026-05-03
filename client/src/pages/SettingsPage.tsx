import { useState } from 'react';
import { Tag, Plus, Trash2, Check, FileSpreadsheet, Cloud, Info, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../utils/types';
import React from 'react';

interface CustomCategory {
  name: string;
  color: string;
}

const PRESET_COLORS = [
  '#E67E22', '#F44747', '#0C87C1', '#eab308',
  '#4ade80', '#a855f7', '#4ECDC4', '#888888',
  '#2DD4BF', '#6B7280', '#EC4899', '#14B8A6',
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

export default function SettingsPage() {
  const navigate = useNavigate();

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(loadCustomCategories);
  const [newCatName, setNewCatName]   = useState('');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
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
    const allNames = [...CATEGORIES.map(c => c.name), ...customCategories.map(c => c.name)];
    if (allNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
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
          <div className="space-y-1 mb-4">
            <p className="text-xs text-sb-muted mb-2">Built-in</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <span key={cat.name} className="text-xs px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: cat.color + '22', color: cat.color, border: `1px solid ${cat.color}44` }}>
                  {cat.name}
                </span>
              ))}
            </div>
          </div>

          {customCategories.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-sb-muted mb-2">Custom</p>
              <div className="space-y-2">
                {customCategories.map(cat => (
                  <div key={cat.name} className="flex items-center justify-between bg-sb-card2 border border-sb-border rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-white text-sm">{cat.name}</span>
                    </div>
                    <button onClick={() => removeCategory(cat.name)} className="text-sb-muted hover:text-sb-red transition p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border border-sb-border rounded-xl p-3 space-y-3">
            <p className="text-xs text-sb-muted font-medium">Add custom category</p>
            <input value={newCatName} onChange={e => { setNewCatName(e.target.value); setCatError(''); }}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="Category name" className="sb-input" />
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(color => (
                <button key={color} onClick={() => setNewCatColor(color)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition hover:scale-110"
                  style={{ backgroundColor: color }}>
                  {newCatColor === color && <Check size={12} color="white" strokeWidth={3} />}
                </button>
              ))}
            </div>
            {catError && <p className="text-sb-red text-xs">{catError}</p>}
            <button onClick={addCategory}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-sb-border text-white text-sm hover:border-sb-muted transition">
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

        {/* About */}
        <Section icon={<Info size={16} />} title="About">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-sb-muted">Version</span>
              <span className="text-white">0.1 Beta</span>
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
