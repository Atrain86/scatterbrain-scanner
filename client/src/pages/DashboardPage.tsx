import { useMemo, useState, useEffect, useRef } from 'react';
import { Tag, Receipt as ReceiptIcon, Download, ChevronDown, ChevronRight, Check, Funnel } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { useReceipts } from '../hooks/useReceipts';
import { useAuth } from '../contexts/AuthContext';
import { useUserPref } from '../lib/userStorage';
import { getCategoryColorDynamic, getAllCategories } from '../utils/types';
import type { Receipt } from '../utils/types';
import MonthRangeSlider from '../components/MonthRangeSlider';

// Phase 6 Stage 1 — Dashboard (analysis lens; NO writes, read-only)
// Absorbs the prior-year drilldown that got removed from Home in Phase 3.
// Year selector top-left, period total top-right, per-year stats under it,
// category bars, two stat cards, Export button. Range slider is Stage 2.

export default function DashboardPage() {
  const navigate = useNavigate();
  const { receipts, isLoading } = useReceipts();
  const { user } = useAuth();
  const userId = user?.id;

  const thisYear = new Date().getFullYear();

  // Available years present in data, sorted desc. Always includes thisYear
  // even if no receipts yet so the selector isn't empty on a fresh account.
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    set.add(thisYear);
    receipts.forEach(r => {
      const y = Number((r.receiptDate || '').slice(0, 4));
      if (Number.isFinite(y) && y > 1970) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [receipts, thisYear]);

  const [selectedYear, setSelectedYear] = useUserPref<number>(
    userId,
    'dashboard_selected_year',
    thisYear,
  );
  // Persist month range so users don't lose their scope on reload.
  // Stored as [start,end] month indices 0..11. Default = full year [0,11].
  const [range, setRange] = useUserPref<[number, number]>(
    userId,
    'dashboard_month_range',
    [0, 11],
  );
  const [rangeStart, rangeEnd] = range;
  const isFullYear = rangeStart === 0 && rangeEnd === 11;

  // Category filter for the scoped receipt list. NOT persisted per-user via
  // useUserPref because it's an active drill-down action, not a preference —
  // the user picks it in the moment ("show me just Auto/Gas") and expects it
  // to clear when they move away.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const categories = useMemo(() => (userId ? getAllCategories(userId) : []), [userId]);

  // Selection for Stage 2 (scoped share). Default: everything currently in
  // scope is selected; the user unchecks the ones they want to EXCLUDE from
  // the share. Storing exclusions (not inclusions) means that when a scope
  // change reveals a new receipt, it's automatically selected — which
  // matches user intent ("share everything I'm looking at").
  const [deselectedUuids, setDeselectedUuids] = useState<Set<string>>(new Set());
  function toggleSelection(uuid: string) {
    setDeselectedUuids(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
      return next;
    });
  }
  function selectAllInScope() { setDeselectedUuids(new Set()); }
  function selectNoneInScope(uuids: string[]) { setDeselectedUuids(new Set(uuids)); }

  // NOTE: no auto-reset when year/range changes. The user's category filter
  // is intentional — e.g. narrowing to Q1 while filtered on Auto/Gas SHOULD
  // hold the filter, not silently clear it. If the new scope has zero
  // matches, the empty state ("No receipts match this filter" + Clear
  // button) makes the situation legible without dropping the user's intent.

  // Clamp: if the stored year isn't in the available set (e.g. that year's
  // receipts were all deleted), fall back to thisYear so we don't show empty.
  const effectiveYear = availableYears.includes(selectedYear) ? selectedYear : thisYear;

  const yearStr = String(effectiveYear);

  const stats = useMemo(() => {
    // Range filter: receiptDate is 'YYYY-MM-DD'. Month component is chars 5-6
    // as 1-based, so subtract 1 to get 0..11.
    const inRange = (r: { receiptDate: string | null }) => {
      const d = r.receiptDate || '';
      if (!d.startsWith(yearStr)) return false;
      const m = Number(d.slice(5, 7)) - 1;
      return m >= rangeStart && m <= rangeEnd;
    };

    // Range-only set — drives the CHART. Kept unfiltered by category so the
    // chart stays useful as "here's the mix; tap the funnel to drill down."
    // Filtering the chart to one bar wastes the visualization.
    const rangeScoped = receipts.filter(inRange);

    const byCat: Record<string, number> = {};
    rangeScoped.forEach(r => {
      const name = r.category || 'Uncategorized';
      byCat[name] = (byCat[name] ?? 0) + r.total;
    });

    const categoryData = Object.entries(byCat)
      .filter(([, t]) => t > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, t]) => ({
        name,
        total: t,
        color: userId ? getCategoryColorDynamic(name, userId) : '#6B7280',
        shortName: name.split(/[\s/&]/)[0],
      }));

    // Category-scoped set — drives the LIST, TOTAL, and STAT CARDS. Everything
    // downstream of the funnel reflects the drilldown.
    const listScoped = categoryFilter
      ? rangeScoped.filter(r => (r.category || 'Uncategorized') === categoryFilter)
      : rangeScoped;

    const total = listScoped.reduce((s, r) => s + r.total, 0);

    // Top category is meaningless once a filter has picked a single category —
    // fall back to the range-scoped top so the stat card stays informative.
    const topCategory = categoryFilter
      ? categoryData.find(c => c.name === categoryFilter) ?? null
      : categoryData[0] ?? null;

    const scopedSorted = [...listScoped].sort((a, b) =>
      (b.receiptDate || '').localeCompare(a.receiptDate || '')
    );

    return {
      total,
      count: listScoped.length,
      categoryData,
      topCategory,
      scopedReceipts: scopedSorted,
    };
  }, [receipts, yearStr, userId, rangeStart, rangeEnd, categoryFilter]);

  // Selected subset of the scoped list — everything not in deselectedUuids.
  // Drives the Stage 3 share action + the header "N selected · $total".
  const selectedReceipts = useMemo(
    () => stats.scopedReceipts.filter(r => !!r.uuid && !deselectedUuids.has(r.uuid)),
    [stats.scopedReceipts, deselectedUuids],
  );
  const selectedTotal = selectedReceipts.reduce((s, r) => s + r.total, 0);

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="flex items-baseline justify-between px-5 pt-12 pb-3 safe-top max-w-2xl mx-auto w-full">
        <h1 className="text-white text-2xl font-bold tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Dashboard
        </h1>
      </header>

      <main className="flex-1 px-4 pt-1 pb-32 overflow-y-auto max-w-2xl mx-auto w-full space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Chart card — year selector, period total, category bars, range slider ── */}
            <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
              <div className="flex items-start justify-between mb-1">
                <YearSelector
                  years={availableYears}
                  value={effectiveYear}
                  onChange={y => { setSelectedYear(y); setRange([0, 11]); }}
                />
                <span className="text-sb-green text-xl font-bold leading-tight">
                  ${stats.total.toFixed(2)}
                </span>
              </div>
              <p className="text-white/50 text-xs mb-4">
                {stats.count} receipt{stats.count !== 1 ? 's' : ''}
                {!isFullYear && ' · scoped'}
              </p>

              {/* Fixed-height chart area so container doesn't jump between
                  data / no-data states while user scopes the range. */}
              <div style={{ height: 240 }} className="flex items-center justify-center">
              {stats.categoryData.length === 0 ? (
                <p className="text-white/40 text-sm text-center">
                  {isFullYear ? `No receipts in ${effectiveYear}` : 'No receipts in this range'}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={stats.categoryData}
                    margin={{ left: -14, right: 8, top: 20, bottom: 0 }}
                    barCategoryGap="20%"
                  >
                    <XAxis
                      dataKey="shortName"
                      tick={{ fill: '#a1a1aa', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 10 }}
                      tickFormatter={v => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
                      axisLine={false}
                      tickLine={false}
                      width={38}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a2e',
                        border: '1px solid #333',
                        borderRadius: 12,
                        color: '#fff',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={450}>
                      {stats.categoryData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                      <LabelList
                        dataKey="total"
                        position="top"
                        fill="#ffffff"
                        fontSize={11}
                        formatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              </div>

              {/* ── Month range slider — sits inside chart card, below bars ── */}
              <div className="mt-3 pt-1 border-t border-white/[0.06]">
                <MonthRangeSlider
                  start={rangeStart}
                  end={rangeEnd}
                  onChange={(s, e) => setRange([s, e])}
                />
              </div>
            </div>

            {/* ── Two stat cards: top category · receipts count ── */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={<Tag size={15} />}
                label="Top category"
                value={stats.topCategory?.name ?? '—'}
                sub={stats.topCategory ? `$${stats.topCategory.total.toFixed(2)}` : 'No spend yet'}
                accentColor={stats.topCategory?.color ?? '#6B7280'}
              />
              <StatCard
                icon={<ReceiptIcon size={15} />}
                label="Receipts"
                value={String(stats.count)}
                sub={`$${stats.total.toFixed(2)}`}
                accentColor="#4ade80"
              />
            </div>

            {/* ── Scoped receipt list ─────────────────────────────────────
                Read-only view of the receipts behind the current scope
                (year + month range). Same visual language as Home rows so
                users read them without re-learning. Editing still lives on
                Home — this is analysis + share only. Stage 1 of scoped-share.
            */}
            {(stats.scopedReceipts.length > 0 || categoryFilter) && (
              <ScopedReceiptList
                receipts={stats.scopedReceipts}
                userId={userId}
                isFullYear={isFullYear}
                availableCategories={stats.categoryData.map(c => ({ name: c.name, color: c.color }))}
                allCategories={categories}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                deselectedUuids={deselectedUuids}
                onToggleSelection={toggleSelection}
                onSelectAll={selectAllInScope}
                onSelectNone={() => selectNoneInScope(stats.scopedReceipts.map(r => r.uuid).filter(Boolean) as string[])}
                selectedCount={selectedReceipts.length}
                selectedTotal={selectedTotal}
                onOpenOnHome={uuid => navigate(`/receipts?receipt=${encodeURIComponent(uuid)}`)}
              />
            )}

            {/* ── Export button (full-year; partial-period export deferred) ── */}
            <button
              onClick={() => navigate('/export')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-sb-green/40 text-sb-green hover:bg-sb-green/5 transition text-sm font-semibold"
            >
              <Download size={15} />
              Export {effectiveYear}
            </button>

            {/* Placeholder for future views (category share, vendors, trends) —
                per spec: reserve space, don't build. */}
          </>
        )}
      </main>
    </div>
  );
}

// ── Year selector — tappable "2025 ▾" dropdown ─────────────────────────────

function YearSelector({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (y: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 text-white text-xl font-bold hover:text-white/80 transition"
        style={{ fontFamily: "'Poppins', sans-serif" }}
      >
        {value}
        <ChevronDown size={16} className="text-white/50" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl min-w-[110px] animate-fade-in">
          {years.map(y => (
            <button
              key={y}
              onClick={() => { onChange(y); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition hover:bg-white/5 ${y === value ? 'text-sb-green' : 'text-white'}`}
            >
              {y}
              {y === value && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Compact stat card ──────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accentColor: string;
}) {
  return (
    <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-[11px] text-white/50 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-white font-bold text-base leading-tight truncate">{value}</p>
      <p className="text-white/50 text-xs mt-0.5 truncate">{sub}</p>
    </div>
  );
}

// ── Scoped receipt list ────────────────────────────────────────────────────
// Read-only flat list of receipts in the current Dashboard scope. Same visual
// language as Home's collapsed rows (category dot + store + dim category text
// on line 1; client + date on line 2; green price right; silver trash omitted
// since this is read-only). Tapping a row deep-links to that receipt on Home
// where it IS editable — Dashboard doesn't own the edit surface.

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatShortDate(iso: string): string {
  // 'YYYY-MM-DD' → 'MMM D'
  if (!iso || iso.length < 10) return iso;
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  return `${MONTH_ABBR[m] ?? ''} ${d}`;
}

function ScopedReceiptList({
  receipts,
  userId,
  isFullYear,
  availableCategories,
  allCategories,
  categoryFilter,
  onCategoryFilterChange,
  deselectedUuids,
  onToggleSelection,
  onSelectAll,
  onSelectNone,
  selectedCount,
  selectedTotal,
  onOpenOnHome,
}: {
  receipts: Receipt[];
  userId: string | undefined;
  isFullYear: boolean;
  availableCategories: { name: string; color: string }[];
  allCategories: { name: string; color: string }[];
  categoryFilter: string | null;
  onCategoryFilterChange: (next: string | null) => void;
  deselectedUuids: Set<string>;
  onToggleSelection: (uuid: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  selectedCount: number;
  selectedTotal: number;
  onOpenOnHome: (uuid: string) => void;
}) {
  const [showCatPicker, setShowCatPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // Close picker on outside click.
  useEffect(() => {
    if (!showCatPicker) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowCatPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showCatPicker]);

  const activeColor = categoryFilter
    ? (allCategories.find(c => c.name === categoryFilter)?.color ?? '#b0aabf')
    : '#b0aabf';

  return (
    <div className="bg-sb-card border border-sb-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <p className="text-white/70 text-[11px] uppercase tracking-wider font-medium truncate">
            {categoryFilter
              ? categoryFilter
              : isFullYear
                ? 'Receipts this year'
                : 'Receipts in range'}
          </p>
          <p className="text-white/70 text-[12px] mt-0.5 truncate">
            <span className="text-sb-green font-semibold">{selectedCount}</span>
            <span className="text-white/50"> of {receipts.length} selected · </span>
            <span className="text-sb-green font-semibold">${selectedTotal.toFixed(2)}</span>
          </p>
          {receipts.length > 0 && (
            <div className="flex gap-3 mt-1 text-[11px]">
              <button onClick={onSelectAll}  className="text-white/50 hover:text-white transition">All</button>
              <button onClick={onSelectNone} className="text-white/50 hover:text-white transition">None</button>
            </div>
          )}
        </div>

        {/* Silver funnel — same visual pattern as Home's search-bar filter.
            Tint fills with the category color when a filter is active. */}
        <div className="relative flex-shrink-0" ref={pickerRef}>
          <button
            onClick={() => setShowCatPicker(p => !p)}
            aria-label={categoryFilter ? `Filtered by ${categoryFilter} — tap to change` : 'Filter by category'}
            className="flex items-center justify-center transition active:scale-90"
            style={{ width: 32, height: 32 }}
          >
            <Funnel
              size={18}
              strokeWidth={1.75}
              style={{
                color: activeColor,
                fill: categoryFilter ? activeColor : 'transparent',
              }}
            />
          </button>
          {showCatPicker && (
            <div className="absolute top-full right-0 mt-2 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl min-w-[200px] max-h-[60vh] overflow-y-auto animate-fade-in">
              <button
                onClick={() => { onCategoryFilterChange(null); setShowCatPicker(false); }}
                className={`w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2 ${!categoryFilter ? 'text-sb-green' : 'text-white'}`}
              >
                <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />
                All categories
              </button>
              {availableCategories.length > 0 && (
                <div className="border-t border-white/[0.06]" />
              )}
              {availableCategories.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => { onCategoryFilterChange(cat.name); setShowCatPicker(false); }}
                  className={`w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2 ${categoryFilter === cat.name ? 'text-sb-green' : 'text-white'}`}
                >
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </button>
              ))}
              {availableCategories.length === 0 && (
                <p className="px-3 py-2.5 text-[11px] text-white/40 italic">No categories in this range.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {receipts.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-white/40 text-sm">No receipts match this filter</p>
          <button
            onClick={() => onCategoryFilterChange(null)}
            className="mt-3 text-[11px] text-sb-green hover:underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
      <div>
        {receipts.map(r => {
          const catColor = userId ? getCategoryColorDynamic(r.category || '', userId) : '#6B7280';
          const uuid = r.uuid || '';
          const isDeselected = !!uuid && deselectedUuids.has(uuid);
          const isSelected   = !isDeselected;
          return (
            <div
              key={r.id}
              className={`w-full flex items-stretch border-b border-white/[0.05] last:border-0 transition ${isDeselected ? 'opacity-50' : ''}`}
            >
              {/* Whole-body tap = toggle selection. Primary action for this
                  surface since Dashboard is about picking WHAT TO SHARE. */}
              <button
                onClick={() => uuid && onToggleSelection(uuid)}
                className="flex-1 min-w-0 flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.02] active:bg-white/[0.04] transition"
              >
                {/* Checkbox */}
                <span
                  aria-hidden="true"
                  className={`mt-0.5 w-[18px] h-[18px] rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-sb-green border-sb-green' : 'border-white/25 bg-transparent'}`}
                >
                  {isSelected && <Check size={11} className="text-black" strokeWidth={3} />}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: catColor }}
                      aria-hidden="true"
                    />
                    <p
                      className="text-white font-semibold text-[15px] leading-tight truncate"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    >
                      {r.storeName || 'Unknown Store'}
                    </p>
                    {r.category && (
                      <span className="text-[11px] text-white/45 leading-none truncate">
                        {r.category}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/40 leading-snug mt-1 truncate">
                    {r.clientName
                      ? `${r.clientName}  ·  ${formatShortDate(r.receiptDate)}`
                      : formatShortDate(r.receiptDate)}
                  </p>
                </div>
                <span className="text-sb-green font-bold text-[15px] leading-tight flex-shrink-0 pl-2">
                  ${r.total.toFixed(2)}
                </span>
              </button>

              {/* Secondary action: chevron → deep-link to Home for editing.
                  Deliberately small so it doesn't compete with the whole-row
                  select tap. */}
              <button
                onClick={() => uuid && onOpenOnHome(uuid)}
                aria-label="Open on Home"
                className="flex items-center justify-center pr-3 pl-1 text-white/30 hover:text-white/70 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
