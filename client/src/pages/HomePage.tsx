import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Receipt, Search, X, ChevronDown, ChevronRight, ChevronUp, Trash2, CheckSquare, Check, Filter } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { useReceipts } from '../hooks/useReceipts';
import ScanModal from '../components/ScanModal';
import ReceiptCard from '../components/ReceiptCard';
import type { Receipt as ReceiptType } from '../utils/types';
import { getAllCategories, getCategoryColorDynamic } from '../utils/types';
import { useAuth } from '../contexts/AuthContext';
import { seedDemoReceipts, clearDemoReceipts } from '../lib/demoSeed';

// Show demo seed controls ONLY on branch preview / localhost — never production
const IS_PREVIEW = typeof window !== 'undefined'
  && (window.location.hostname.includes('nav-restructure') || window.location.hostname === 'localhost' || window.location.hostname.startsWith('127.'));

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthKey(receiptDate: string) { return receiptDate.slice(0, 7); }
function monthLabel(key: string) {
  const [, m] = key.split('-');
  return MONTH_NAMES[Number(m) - 1];
}

const CHART_COLLAPSED_KEY = 'sb_home_chart_collapsed';

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `$${Math.round(n)}`;
}

export default function HomePage() {
  const { user } = useAuth();
  const userId = user!.id;
  const { receipts, isLoading, reload, remove, update, add } = useReceipts();

  const [scanOpen,     setScanOpen]     = useState(false);
  const [search,       setSearch]       = useState('');
  const [selectMode,   setSelectMode]   = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [chartCollapsed, setChartCollapsed] = useState<boolean>(() => localStorage.getItem(CHART_COLLAPSED_KEY) === '1');
  const [monthsBack, setMonthsBack] = useState<number>(12);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showCatMenu, setShowCatMenu] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    setSeeding(true);
    try {
      const created = await seedDemoReceipts(userId, 24);
      created.forEach(add);
    } finally {
      setSeeding(false);
    }
  }

  async function handleClearDemo() {
    if (!confirm('Delete all demo receipts?')) return;
    await clearDemoReceipts(userId, receipts);
    void reload();
  }

  const hasDemoData = IS_PREVIEW && receipts.some(r => r.uuid?.startsWith('demo-'));

  useEffect(() => {
    localStorage.setItem(CHART_COLLAPSED_KEY, chartCollapsed ? '1' : '0');
  }, [chartCollapsed]);

  const now = new Date();
  const thisYear = now.getFullYear();

  // Calendar-month window: monthsBack=1 → current calendar month only.
  //                       monthsBack=12 → current + 11 previous full calendar months (i.e. last 12).
  const rangeStart = useMemo(() => {
    const d = new Date(thisYear, now.getMonth() - (monthsBack - 1), 1);
    return d;
  }, [monthsBack, thisYear, now]);

  const inRange = useCallback((r: ReceiptType) => {
    const d = new Date(r.receiptDate + 'T00:00:00');
    return d >= rangeStart && d <= now;
  }, [rangeStart, now]);

  // ── Range-scoped receipts (for chart + list scope) ─────────────────────────
  const rangeReceipts = useMemo(() => receipts.filter(inRange), [receipts, inRange]);
  const rangeTotal = useMemo(() => rangeReceipts.reduce((s, r) => s + r.total, 0), [rangeReceipts]);

  // ── Chart data: bars sorted by total, only non-zero categories ─────────────
  const chartData = useMemo(() => {
    const byCat: Record<string, number> = {};
    rangeReceipts.forEach(r => {
      byCat[r.category] = (byCat[r.category] ?? 0) + r.total;
    });
    return Object.entries(byCat)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({
        name,
        short: name.split(/[\s/&]/)[0], // "Supplies & Hardware" → "Supplies"
        total: Math.round(total),
        color: getCategoryColorDynamic(name, userId),
      }));
  }, [rangeReceipts, userId]);

  // ── List filter: search + category on top of range-scoped receipts ─────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rangeReceipts.filter(r => {
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (!q) return true;
      if ((r.storeName || '').toLowerCase().includes(q)) return true;
      if ((r.clientName || '').toLowerCase().includes(q)) return true;
      try {
        const items = JSON.parse(r.lineItems || '[]') as { description: string }[];
        if (items.some(i => i.description.toLowerCase().includes(q))) return true;
      } catch {}
      return false;
    });
  }, [rangeReceipts, search, categoryFilter]);

  // ── Group filtered by month ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, ReceiptType[]>();
    filtered.forEach(r => {
      const k = monthKey(r.receiptDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    map.forEach(arr => arr.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate)));
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  function onSaved(receipt: ReceiptType) {
    add(receipt);
    setScanOpen(false);
    void reload();
  }
  async function onDelete(id: number) {
    if (!confirm('Delete this receipt?')) return;
    await remove(id);
  }
  async function onUpdateCategory(id: number, category: string) {
    await update(id, { category });
  }
  async function onReEdit(id: number, updates: {
    storeName: string; lineItems: string; taxLines: string;
    subtotal: number; taxAmount: number; total: number;
    clientName: string | null; category: string; receiptDate?: string;
  }) {
    await update(id, updates);
  }
  const enterSelectMode = useCallback(() => { setSelectMode(true); setSelectedIds(new Set()); }, []);
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
  }, []);
  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);
  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} receipt${selectedIds.size !== 1 ? 's' : ''}?`)) return;
    for (const id of selectedIds) await remove(id);
    exitSelectMode();
  }

  const rangeLabel = monthsBack === 12 ? 'Last 12 months' : `Last ${monthsBack} month${monthsBack === 1 ? '' : 's'}`;

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col font-sans">

      {/* ── Header ── */}
      <header className="safe-top">
        <div className="px-4 pt-3 pb-3 flex items-center justify-between max-w-2xl mx-auto w-full">
          <h1 className="text-white text-xl font-semibold">Home</h1>
          <div className="flex items-center gap-3">
            {hasDemoData && (
              <button
                onClick={handleClearDemo}
                className="text-[10px] px-2 py-0.5 rounded-full border border-sb-purple/40 text-sb-purple hover:bg-sb-purple/10 transition"
                title="Clear demo receipts (preview only)"
              >
                Clear demo
              </button>
            )}
            <span className="text-sb-muted text-sm">{thisYear}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 pb-24 overflow-y-auto max-w-2xl mx-auto w-full">

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState onSeed={IS_PREVIEW ? handleSeed : undefined} seeding={seeding} />
        ) : (
          <>
            {/* ── By category panel ── */}
            <div className="bg-sb-card rounded-xl overflow-hidden mb-3">
              <button
                onClick={() => setChartCollapsed(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="text-sb-muted text-xs">By category</span>
                <span className="flex items-center gap-2">
                  <span className="text-sb-green text-sm font-semibold tabular-nums">
                    ${rangeTotal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {chartCollapsed
                    ? <ChevronDown size={14} className="text-sb-muted" />
                    : <ChevronUp size={14} className="text-sb-muted" />
                  }
                </span>
              </button>

              {!chartCollapsed && (
                <div className="px-3 pb-4">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={chartData} margin={{ left: -20, right: 8, top: 22, bottom: 0 }}>
                        <XAxis
                          dataKey="short"
                          tick={{ fill: '#888', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis hide />
                        <Bar dataKey="total" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={180}>
                          <LabelList
                            dataKey="total"
                            position="top"
                            fill="#ffffff"
                            fontSize={11}
                            fontWeight={600}
                            formatter={(v: number) => fmtMoney(v)}
                          />
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sb-muted text-xs text-center py-8">No spending in this range.</p>
                  )}

                  {/* ── Month slider ── */}
                  <MonthSlider value={monthsBack} onChange={setMonthsBack} label={rangeLabel} />
                </div>
              )}
            </div>

            {/* ── Search + category filter (combined) ── */}
            <SearchWithFilter
              value={search}
              onChange={setSearch}
              category={categoryFilter}
              onCategoryChange={setCategoryFilter}
              catOpen={showCatMenu}
              setCatOpen={setShowCatMenu}
              userId={userId}
              chartCategories={chartData.map(c => c.name)}
            />

            {/* ── Receipt list ── */}
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                <Search size={22} className="text-white opacity-30 mb-3" />
                <p className="text-white font-semibold text-sm mb-1">No receipts match</p>
                <p className="text-sb-muted text-xs">Try adjusting your search, filter, or range.</p>
              </div>
            ) : (
              <div className="space-y-1 mt-3">
                {grouped.map(([key, items]) => (
                  <MonthGroup
                    key={key}
                    label={`${monthLabel(key)} ${key.slice(0,4)}`}
                    receipts={items}
                    collapsed={collapsedMonths.has(key)}
                    onToggle={() => {
                      setCollapsedMonths(prev => {
                        const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
                      });
                    }}
                    onDelete={onDelete}
                    onUpdateCategory={onUpdateCategory}
                    onReEdit={onReEdit}
                    onNewReceipt={r => add(r)}
                    selectMode={selectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onEnterSelectMode={enterSelectMode}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Select mode action bar */}
      {selectMode && (
        <div
          className="fixed left-0 right-0 z-30 bg-sb-card2 border-t border-sb-border animate-fade-in"
          style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
        >
          <div className="px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto">
            <button onClick={exitSelectMode} className="p-2 text-sb-muted hover:text-white transition">
              <X size={18} />
            </button>
            <span className="flex-1 text-white text-sm font-semibold">{selectedIds.size} selected</span>
            <button
              onClick={() => setSelectedIds(new Set(filtered.map(r => r.id)))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sb-border text-xs text-white hover:bg-white/5 transition"
            >
              <CheckSquare size={13} />
              All
            </button>
            <button
              onClick={deleteSelected}
              disabled={selectedIds.size === 0}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition ${selectedIds.size === 0 ? 'bg-sb-border text-sb-muted cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-500'}`}
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        </div>
      )}

      {scanOpen && <ScanModal onClose={() => setScanOpen(false)} onSaved={onSaved} />}
    </div>
  );
}

// ── Month slider ───────────────────────────────────────────────────────────────
function MonthSlider({ value, onChange, label }: {
  value: number; onChange: (v: number) => void; label: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const percent = ((value - 1) / 11) * 100;

  const setFromClientX = useCallback((clientX: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, raw));
    const detent = Math.round(clamped * 11) + 1; // 1..12
    onChange(detent);
  }, [onChange]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setFromClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, setFromClientX]);

  return (
    <div className="mt-2 select-none">
      <div
        ref={railRef}
        className="relative h-8 cursor-pointer touch-none"
        onPointerDown={e => { setDragging(true); setFromClientX(e.clientX); }}
      >
        {/* Rail */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-white/10" />
        {/* Filled portion */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-sb-green"
          style={{ width: `${percent}%` }}
        />
        {/* Detents */}
        {Array.from({ length: 12 }).map((_, i) => {
          const p = (i / 11) * 100;
          const filled = i + 1 <= value;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-[2px] h-2 rounded"
              style={{
                left: `${p}%`,
                transform: 'translate(-50%, -50%)',
                backgroundColor: filled ? '#4ade80' : 'rgba(255,255,255,0.15)',
              }}
            />
          );
        })}
        {/* Thumb */}
        <div
          className="absolute top-1/2 rounded-full border-[3px] border-sb-green bg-black shadow-[0_0_10px_rgba(74,222,128,0.5)]"
          style={{
            width: 22, height: 22,
            left: `${percent}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Endpoint labels row */}
      <div className="flex justify-between px-1 mt-0.5">
        <span className="text-[10px] text-sb-muted">1 mo</span>
        <span className="text-[10px] text-sb-muted">12 / all</span>
      </div>

      {/* Range readout */}
      <p className="text-center text-sb-green text-[13px] font-semibold mt-1">
        {label}
      </p>
    </div>
  );
}

// ── Search + Filter combined input ─────────────────────────────────────────────
function SearchWithFilter({
  value, onChange, category, onCategoryChange, catOpen, setCatOpen, userId, chartCategories,
}: {
  value: string;
  onChange: (v: string) => void;
  category: string | null;
  onCategoryChange: (v: string | null) => void;
  catOpen: boolean;
  setCatOpen: (v: boolean) => void;
  userId: string;
  chartCategories: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setCatOpen(false);
    }
    if (catOpen) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [catOpen, setCatOpen]);

  const allCats = getAllCategories(userId);
  // Order: categories with spend in range first, then the rest
  const orderedCats = [
    ...chartCategories,
    ...allCats.map(c => c.name).filter(n => !chartCategories.includes(n)),
  ];

  return (
    <div ref={ref} className="relative bg-sb-card2 border border-sb-border rounded-xl h-11 flex items-center">
      <Search size={15} className="ml-3 text-white/40 flex-shrink-0" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search…"
        className="flex-1 bg-transparent px-3 text-sm text-white placeholder-white/40 focus:outline-none h-full"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-white/40 hover:text-white p-1 mr-1">
          <X size={14} />
        </button>
      )}
      {/* Filter chip inside input */}
      <button
        onClick={() => setCatOpen(!catOpen)}
        className={`flex items-center gap-1 mr-1.5 px-2.5 h-8 rounded-lg text-[12px] transition ${category ? 'bg-sb-green/15 text-sb-green' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
      >
        <Filter size={12} />
        {category ?? 'All'}
      </button>

      {catOpen && (
        <div className="absolute right-1 top-full mt-1 w-52 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-30 shadow-2xl">
          <button
            onClick={() => { onCategoryChange(null); setCatOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-white/5 ${!category ? 'text-sb-green' : 'text-white'}`}
          >
            <Filter size={11} /> All categories
            {!category && <Check size={11} className="ml-auto text-sb-green" />}
          </button>
          <div className="border-t border-sb-border max-h-64 overflow-y-auto">
            {orderedCats.map(name => {
              const c = allCats.find(a => a.name === name);
              const color = c?.color ?? '#6B7280';
              return (
                <button
                  key={name}
                  onClick={() => { onCategoryChange(name); setCatOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-white/5 ${category === name ? 'bg-white/5' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="flex-1 text-white">{name}</span>
                  {category === name && <Check size={11} className="text-sb-green" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Month group ────────────────────────────────────────────────────────────────
interface MonthGroupProps {
  label: string;
  receipts: ReceiptType[];
  collapsed: boolean;
  onToggle: () => void;
  onDelete: (id: number) => void;
  onUpdateCategory: (id: number, cat: string) => void;
  onReEdit: (id: number, updates: { storeName: string; lineItems: string; taxLines: string; subtotal: number; taxAmount: number; total: number; clientName: string | null; category: string; receiptDate?: string }) => void;
  onNewReceipt?: (r: ReceiptType) => void;
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onEnterSelectMode?: () => void;
}

function MonthGroup({ label, receipts, collapsed, onToggle, onDelete, onUpdateCategory, onReEdit, onNewReceipt, selectMode, selectedIds, onToggleSelect, onEnterSelectMode }: MonthGroupProps) {
  const total = receipts.reduce((s, r) => s + r.total, 0);
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5 transition active:bg-white/10"
        >
          <span className="text-sb-muted" style={{ width: 14 }}>
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
          <span className="flex-1 text-white text-sm font-semibold text-left">{label}</span>
          <span className="text-[10px] text-sb-muted mr-2">
            {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
          </span>
          <span className="text-sb-green text-sm font-semibold tabular-nums">${total.toFixed(2)}</span>
        </button>
        {!selectMode && onEnterSelectMode && (
          <button
            onClick={onEnterSelectMode}
            className="px-2.5 py-1 rounded-lg text-[11px] text-sb-muted hover:text-white border border-transparent hover:border-sb-border transition flex-shrink-0"
          >
            Select
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-1.5 pl-1 animate-fade-in">
          {receipts.map(r => (
            <ReceiptCard
              key={r.id}
              receipt={r}
              onDelete={onDelete}
              onUpdateCategory={onUpdateCategory}
              onReEdit={onReEdit}
              onNewReceipt={onNewReceipt}
              selectMode={selectMode}
              selected={selectedIds?.has(r.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ onSeed, seeding }: { onSeed?: () => void; seeding?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-sb-card border border-sb-border flex items-center justify-center mb-5">
        <Receipt size={28} style={{ color: '#ffffff', opacity: 0.3 }} />
      </div>
      <h2 className="text-white font-semibold text-lg mb-2">No receipts yet</h2>
      <p className="text-sb-muted text-sm">Tap Scan below to add your first receipt.</p>

      {IS_PREVIEW && onSeed && (
        <div className="mt-8 pt-6 border-t border-sb-border/40 w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-wider text-sb-muted mb-2">Preview only</p>
          <button
            onClick={onSeed}
            disabled={seeding}
            className="w-full px-4 py-2.5 rounded-xl bg-sb-purple/20 border border-sb-purple/40 text-sb-purple text-xs font-semibold hover:bg-sb-purple/30 transition disabled:opacity-50"
          >
            {seeding ? 'Seeding…' : 'Seed 24 demo receipts'}
          </button>
        </div>
      )}
    </div>
  );
}
