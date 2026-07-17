import { useMemo, useState, useEffect, useRef } from 'react';
import { Tag, Download, ChevronDown, ChevronRight, Check, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { useReceipts } from '../hooks/useReceipts';
import { useAuth } from '../contexts/AuthContext';
import { useUserPref } from '../lib/userStorage';
import { getCategoryColorDynamic } from '../utils/types';
import type { Receipt } from '../utils/types';
import MonthRangeSlider from '../components/MonthRangeSlider';
import { buildReceiptWorkbook, downloadWorkbook, workbookToFile } from '../lib/xlsxExport';
import { useFilter } from '../contexts/FilterContext';

const MONTH_ABBR_TOP = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthAbbrev(i: number): string { return MONTH_ABBR_TOP[i] ?? ''; }

export default function DashboardPage() {
  const navigate = useNavigate();
  const { receipts, isLoading } = useReceipts();
  const { user } = useAuth();
  const userId = user?.id;

  const { search, categoryFilter, paymentFilter } = useFilter();

  const thisYear = new Date().getFullYear();

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
    userId, 'dashboard_selected_year', thisYear,
  );
  const [range, setRange] = useUserPref<[number, number]>(
    userId, 'dashboard_month_range', [0, 11],
  );
  const [rangeStart, rangeEnd] = range;
  const isFullYear = rangeStart === 0 && rangeEnd === 11;

  const effectiveYear = availableYears.includes(selectedYear) ? selectedYear : thisYear;
  const yearStr = String(effectiveYear);

  // Select mode
  const [selectMode,      setSelectMode]      = useState(false);
  const [deselectedUuids, setDeselectedUuids] = useState<Set<string>>(new Set());
  function enterSelectMode() { setSelectMode(true); setDeselectedUuids(new Set()); }
  function exitSelectMode()  { setSelectMode(false); setDeselectedUuids(new Set()); }
  function toggleSelection(uuid: string) {
    setDeselectedUuids(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
      return next;
    });
  }
  function selectAllInScope()               { setDeselectedUuids(new Set()); }
  function selectNoneInScope(uuids: string[]) { setDeselectedUuids(new Set(uuids)); }

  const stats = useMemo(() => {
    const q = search.trim().toLowerCase();

    // Stage 1: year + month range
    const inRange = (r: Receipt) => {
      const d = r.receiptDate || '';
      if (!d.startsWith(yearStr)) return false;
      const m = Number(d.slice(5, 7)) - 1;
      return m >= rangeStart && m <= rangeEnd;
    };

    // Stage 2: search text + payment filter — applies everywhere (chart, list, total)
    const matchesSearch = (r: Receipt) => {
      if (paymentFilter === 'Debit' && r.paymentMethod !== 'Debit') return false;
      if (paymentFilter === 'Visa'  && r.paymentMethod !== 'Visa')  return false;
      if (!q) return true;
      if ((r.storeName  || '').toLowerCase().includes(q)) return true;
      if ((r.clientName || '').toLowerCase().includes(q)) return true;
      try {
        const items = JSON.parse(r.lineItems || '[]') as { description: string }[];
        if (items.some(i => i.description.toLowerCase().includes(q))) return true;
      } catch {}
      return false;
    };

    // rangeScoped: range + search + payment. Drives the CHART (ignores category
    // so multi-bar chart is meaningful when drilling by category).
    const rangeScoped = receipts.filter(r => inRange(r) && matchesSearch(r));

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

    // listScoped: also applies category filter — drives list, total, stat cards
    const listScoped = categoryFilter
      ? rangeScoped.filter(r => (r.category || 'Uncategorized') === categoryFilter)
      : rangeScoped;

    const total = listScoped.reduce((s, r) => s + r.total, 0);

    const topCategory = categoryFilter
      ? categoryData.find(c => c.name === categoryFilter) ?? null
      : categoryData[0] ?? null;

    const scopedSorted = [...listScoped].sort((a, b) =>
      (b.receiptDate || '').localeCompare(a.receiptDate || '')
    );

    return { total, count: listScoped.length, categoryData, topCategory, scopedReceipts: scopedSorted };
  }, [receipts, yearStr, userId, rangeStart, rangeEnd, categoryFilter, search, paymentFilter]);

  const selectedReceipts = useMemo(
    () => stats.scopedReceipts.filter(r => !!r.uuid && !deselectedUuids.has(r.uuid)),
    [stats.scopedReceipts, deselectedUuids],
  );
  const selectedTotal = selectedReceipts.reduce((s, r) => s + r.total, 0);

  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  async function handleShareSelected() {
    if (selectedReceipts.length === 0) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const scopeLabel = isFullYear
        ? `${effectiveYear}`
        : `${effectiveYear} ${monthAbbrev(rangeStart)}–${monthAbbrev(rangeEnd)}`;
      const title = `Expense Summary — ${scopeLabel}`;
      const wb = buildReceiptWorkbook({ rows: selectedReceipts, title, clientLabel: categoryFilter });
      const fileBase = `Expenses_${effectiveYear}${!isFullYear ? `_${monthAbbrev(rangeStart)}-${monthAbbrev(rangeEnd)}` : ''}${categoryFilter ? `_${categoryFilter.replace(/[^a-z0-9]/gi, '_')}` : ''}`;
      const file = workbookToFile(wb, fileBase);
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file], title,
            text: `${selectedReceipts.length} receipt${selectedReceipts.length === 1 ? '' : 's'} · $${selectedTotal.toFixed(2)}`,
          });
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
        }
      }
      downloadWorkbook(wb, fileBase);
    } catch (err) {
      setShareError((err as Error).message || 'Share failed');
    } finally {
      setShareBusy(false);
    }
  }

  // Range readout text (shown above slider when narrowed)
  const MONTH_NAMES_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const rangeReadout = rangeStart === rangeEnd
    ? MONTH_NAMES_LONG[rangeStart]
    : `${MONTH_NAMES_LONG[rangeStart]} – ${MONTH_NAMES_LONG[rangeEnd]}`;

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="flex items-baseline justify-between px-5 pt-12 pb-3 safe-top max-w-2xl mx-auto w-full">
        <h1 className="text-white text-2xl font-bold tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Dashboard
        </h1>
      </header>

      <main className="flex-1 px-4 pt-1 pb-40 overflow-y-auto max-w-2xl mx-auto w-full space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Chart card ── */}
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

              {/* ── Range readout + count — sits between header and chart ── */}
              <div className="text-center leading-none mb-1">
                {!isFullYear && (
                  <p className="text-white text-[13px] font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {rangeReadout}
                  </p>
                )}
                <p className="text-[10px]" style={{ color: '#b0aabf', marginTop: 2 }}>
                  {stats.count} receipt{stats.count !== 1 ? 's' : ''}{!isFullYear ? ' · scoped' : ''}
                </p>
              </div>

              {/* Fixed-height chart area */}
              <div style={{ height: 240 }} className="flex items-center justify-center">
                {stats.categoryData.length === 0 ? (
                  <div className="text-center">
                    <p className="text-white/40 text-sm">
                      {isFullYear ? `No receipts in ${effectiveYear}` : 'No receipts match this filter'}
                    </p>
                    {(search || categoryFilter || paymentFilter !== 'All') && (
                      <p className="text-white/25 text-xs mt-1">Try clearing search or changing the range</p>
                    )}
                  </div>
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

              {/* ── Month range slider ── */}
              <div className="mt-1 border-t border-white/[0.06]">
                <MonthRangeSlider
                  start={rangeStart}
                  end={rangeEnd}
                  onChange={(s, e) => setRange([s, e])}
                />
              </div>
            </div>

            {/* ── Scoped receipt list ── */}
            {(stats.scopedReceipts.length > 0 || categoryFilter) && (
              <ScopedReceiptList
                receipts={stats.scopedReceipts}
                userId={userId}
                isFullYear={isFullYear}
                categoryFilter={categoryFilter}
                selectMode={selectMode}
                onEnterSelectMode={enterSelectMode}
                onExitSelectMode={exitSelectMode}
                deselectedUuids={deselectedUuids}
                onToggleSelection={toggleSelection}
                onSelectAll={selectAllInScope}
                onSelectNone={() => selectNoneInScope(stats.scopedReceipts.map(r => r.uuid).filter(Boolean) as string[])}
                selectedCount={selectedReceipts.length}
                selectedTotal={selectedTotal}
                onOpenOnHome={uuid => navigate(`/receipts?receipt=${encodeURIComponent(uuid)}`)}
                onShareSelected={handleShareSelected}
                shareBusy={shareBusy}
                shareError={shareError}
              />
            )}

            {/* Export button */}
            <button
              onClick={() => navigate('/export')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-sb-green/40 text-sb-green hover:bg-sb-green/5 transition text-sm font-semibold"
            >
              <Download size={15} />
              Export {effectiveYear}
            </button>
          </>
        )}
      </main>
    </div>
  );
}

// ── Year selector ─────────────────────────────────────────────────────────────

function YearSelector({ years, value, onChange }: { years: number[]; value: number; onChange: (y: number) => void }) {
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

// ── Scoped receipt list ───────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatShortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  return `${MONTH_ABBR[m] ?? ''} ${d}`;
}

function ScopedReceiptList({
  receipts,
  userId,
  isFullYear,
  categoryFilter,
  selectMode,
  onEnterSelectMode,
  onExitSelectMode,
  deselectedUuids,
  onToggleSelection,
  onSelectAll,
  onSelectNone,
  selectedCount,
  selectedTotal,
  onOpenOnHome,
  onShareSelected,
  shareBusy,
  shareError,
}: {
  receipts: Receipt[];
  userId: string | undefined;
  isFullYear: boolean;
  categoryFilter: string | null;
  selectMode: boolean;
  onEnterSelectMode: () => void;
  onExitSelectMode: () => void;
  deselectedUuids: Set<string>;
  onToggleSelection: (uuid: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  selectedCount: number;
  selectedTotal: number;
  onOpenOnHome: (uuid: string) => void;
  onShareSelected: () => void;
  shareBusy: boolean;
  shareError: string | null;
}) {
  const filteredTotal = receipts.reduce((s, r) => s + r.total, 0);

  return (
    <div className="bg-sb-card border border-sb-border rounded-2xl overflow-hidden">
      {/* Header — Select/Done on right; funnel removed (band handles it) */}
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          {categoryFilter ? (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <Tag size={15} style={{ color: '#e0a35f' }} />
                <span className="text-[11px] text-white/50 uppercase tracking-wider">Filtered</span>
              </div>
              <p className="text-white text-lg font-bold leading-tight truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {categoryFilter}
              </p>
              <p className="text-sb-green text-sm font-semibold mt-0.5">${filteredTotal.toFixed(2)}</p>
              {selectMode && (
                <>
                  <p className="text-white/70 text-[12px] mt-2 truncate">
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
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-white/70 text-[11px] uppercase tracking-wider font-medium truncate">
                {isFullYear ? 'Receipts this year' : 'Receipts in range'}
              </p>
              {selectMode ? (
                <>
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
                </>
              ) : (
                <p className="text-white/40 text-[11px] mt-0.5">{receipts.length} · read-only</p>
              )}
            </>
          )}
        </div>

        {/* Right cluster: Select/Done + Share */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {receipts.length > 0 && (
            selectMode ? (
              <button onClick={onExitSelectMode} className="text-[12px] text-sb-green hover:brightness-110 transition px-2 py-1">
                Done
              </button>
            ) : (
              <button onClick={onEnterSelectMode} className="text-[12px] text-white/60 hover:text-white transition px-2 py-1">
                Select
              </button>
            )
          )}
          {selectMode && selectedCount > 0 && (
            <button
              onClick={onShareSelected}
              disabled={shareBusy}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-sb-green text-black text-[12px] font-bold hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Share2 size={13} strokeWidth={2.5} />
              {shareBusy ? 'Preparing…' : 'Share'}
            </button>
          )}
        </div>
      </div>

      {shareError && (
        <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/40 text-red-300 text-[11px]">
          {shareError}
        </div>
      )}

      {receipts.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-white/40 text-sm">No receipts match this filter</p>
        </div>
      ) : (
        <div>
          {receipts.map(r => {
            const catColor = userId ? getCategoryColorDynamic(r.category || '', userId) : '#6B7280';
            const uuid = r.uuid || '';
            const isDeselected = selectMode && !!uuid && deselectedUuids.has(uuid);
            const isSelected   = !isDeselected;
            const onRowClick = () => {
              if (!uuid) return;
              if (selectMode) onToggleSelection(uuid);
              else onOpenOnHome(uuid);
            };
            return (
              <div
                key={r.id}
                className={`w-full flex items-stretch border-b border-white/[0.05] last:border-0 transition ${isDeselected ? 'opacity-50' : ''}`}
              >
                <button
                  onClick={onRowClick}
                  className="flex-1 min-w-0 flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.02] active:bg-white/[0.04] transition"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex-shrink-0 flex items-center justify-center transition-all overflow-hidden ${selectMode ? 'w-[18px] opacity-100 mr-0' : 'w-0 opacity-0 mr-[-10px]'}`}
                  >
                    <span className={`w-[18px] h-[18px] rounded-md flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-sb-green border-sb-green' : 'border-white/25 bg-transparent'}`}>
                      {isSelected && <Check size={11} className="text-black" strokeWidth={3} />}
                    </span>
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} aria-hidden="true" />
                      <p className="text-white font-semibold text-[15px] leading-tight truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        {r.storeName || 'Unknown Store'}
                      </p>
                      {r.category && (
                        <span className="text-[11px] text-white/45 leading-none truncate">{r.category}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/40 leading-snug mt-1 truncate">
                      {r.clientName ? `${r.clientName}  ·  ${formatShortDate(r.receiptDate)}` : formatShortDate(r.receiptDate)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-between pl-2 flex-shrink-0">
                    <span className="text-sb-green font-bold text-[15px] leading-tight">
                      ${r.total.toFixed(2)}
                    </span>
                    {r.paymentMethod && (
                      <span
                        aria-label={r.paymentMethod}
                        className="rounded-full mt-1"
                        style={{
                          width: 11, height: 11, display: 'inline-block',
                          backgroundColor:
                            r.paymentMethod === 'Debit'      ? '#6ea882' :
                            r.paymentMethod === 'Visa'       ? '#5a7fc4' :
                            r.paymentMethod === 'Mastercard' ? '#d97c4a' :
                            r.paymentMethod === 'Amex'       ? '#8b83d9' :
                            r.paymentMethod === 'Cash'       ? '#6bc48a' :
                            '#71717a',
                        }}
                      />
                    )}
                  </div>
                </button>

                {selectMode && (
                  <button
                    onClick={() => uuid && onOpenOnHome(uuid)}
                    aria-label="Open on Home"
                    className="flex items-center justify-center pr-3 pl-1 text-white/30 hover:text-white/70 transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
