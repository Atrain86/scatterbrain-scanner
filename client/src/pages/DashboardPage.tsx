import { useMemo, useState, useEffect, useRef } from 'react';
import { Tag, Receipt as ReceiptIcon, Download, ChevronDown, Check } from 'lucide-react';
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

    const scoped   = receipts.filter(inRange);
    const total    = scoped.reduce((s, r) => s + r.total, 0);

    const byCat: Record<string, number> = {};
    scoped.forEach(r => {
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

    const topCategory = categoryData[0] ?? null;

    // Also return the scoped receipt list itself (sorted by date desc) so
    // downstream sections can render a read-only list without recomputing
    // the range filter. Stage 1 of the Dashboard "Scoped Share" feature.
    const scopedSorted = [...scoped].sort((a, b) =>
      (b.receiptDate || '').localeCompare(a.receiptDate || '')
    );

    return {
      total,
      count: scoped.length,
      categoryData,
      topCategory,
      scopedReceipts: scopedSorted,
    };
  }, [receipts, yearStr, userId, rangeStart, rangeEnd]);

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
            {stats.scopedReceipts.length > 0 && (
              <ScopedReceiptList
                receipts={stats.scopedReceipts}
                userId={userId}
                isFullYear={isFullYear}
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
  onOpenOnHome,
}: {
  receipts: Receipt[];
  userId: string | undefined;
  isFullYear: boolean;
  onOpenOnHome: (uuid: string) => void;
}) {
  return (
    <div className="bg-sb-card border border-sb-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-baseline justify-between">
        <p className="text-white/70 text-[11px] uppercase tracking-wider font-medium">
          {isFullYear ? 'Receipts this year' : 'Receipts in range'}
        </p>
        <p className="text-white/40 text-[11px]">
          {receipts.length} · read-only
        </p>
      </div>

      <div>
        {receipts.map(r => {
          const catColor = userId ? getCategoryColorDynamic(r.category || '', userId) : '#6B7280';
          return (
            <button
              key={r.id}
              onClick={() => r.uuid && onOpenOnHome(r.uuid)}
              className="w-full flex items-stretch text-left border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] active:bg-white/[0.04] transition"
            >
              <div className="flex-1 min-w-0 px-3 py-2.5">
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
              <div className="flex items-center pr-3 pl-2 flex-shrink-0">
                <span className="text-sb-green font-bold text-[15px] leading-tight">
                  ${r.total.toFixed(2)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
