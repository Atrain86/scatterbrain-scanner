import { useState, useMemo, useCallback, useEffect } from 'react';
import { Receipt, Search, X, ChevronDown, ChevronRight, Trash2, CheckSquare } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReceipts } from '../hooks/useReceipts';
import { useAuth } from '../contexts/AuthContext';
import { useUserPref } from '../lib/userStorage';
import ScanModal from '../components/ScanModal';
import ReceiptCard from '../components/ReceiptCard';
import { APP_VERSION } from './SettingsPage';
import type { Receipt as ReceiptType } from '../utils/types';
import { useFilter } from '../contexts/FilterContext';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function monthKey(receiptDate: string) { return receiptDate.slice(0, 7); }
function yearOf(receiptDate: string)   { return receiptDate.slice(0, 4); }
function monthLabel(key: string) {
  const [, m] = key.split('-');
  return MONTH_NAMES[Number(m) - 1];
}

export default function ReceiptLibrary() {
  const { receipts, isLoading, reload, remove, update, add } = useReceipts();
  const { user } = useAuth();

  const [scanOpen,    setScanOpen]    = useState(false);
  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { search, categoryFilter, paymentFilter } = useFilter();

  // Home is scoped to ONE year at a time. The year picker in the header
  // lets users browse past years too (Dashboard is still analysis-only).
  // Selection persists per-user via useUserPref so refresh preserves scope.
  const thisYear = String(new Date().getFullYear());

  // Only offer years that actually have receipts. Always include current year
  // so a brand-new account still sees a valid picker with the current year.
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    set.add(thisYear);
    receipts.forEach(r => {
      const y = (r.receiptDate || '').slice(0, 4);
      if (y.length === 4) set.add(y);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [receipts, thisYear]);

  const [storedYear, setStoredYear] = useUserPref<string>(user?.id, 'home_selected_year', thisYear);
  // Clamp: if the stored year no longer has any receipts (e.g. deleted all),
  // fall back to current year so we don't show an empty picker option.
  const selectedYear = availableYears.includes(storedYear) ? storedYear : thisYear;

  // current year months: collapsed set (month key → collapsed)
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  // Deep-link from Dashboard: /receipts?receipt=<uuid> auto-expands + scrolls
  // to that receipt. We capture the UUID, scope the year to the receipt's
  // year so it's actually rendered, un-collapse its month, then strip the
  // param so a refresh doesn't re-trigger.
  const location = useLocation();
  const navigate = useNavigate();
  const [autoExpandUuid, setAutoExpandUuid] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const uuid = params.get('receipt');
    if (!uuid) return;
    const target = receipts.find(r => r.uuid === uuid);
    if (!target) return;

    setAutoExpandUuid(uuid);
    const y = (target.receiptDate || '').slice(0, 4);
    if (y && availableYears.includes(y)) setStoredYear(y);
    const mk = (target.receiptDate || '').slice(0, 7);
    if (mk) setCollapsedMonths(prev => {
      if (!prev.has(mk)) return prev;
      const next = new Set(prev); next.delete(mk); return next;
    });

    navigate('/receipts', { replace: true });
    // Clear the autoExpand flag after enough time for ReceiptCard to react
    // and scroll — otherwise a subsequent Home visit would re-trigger.
    const t = setTimeout(() => setAutoExpandUuid(null), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, receipts]);

  // ── Search + category filter (current year only) ───────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(r => {
      // Selected-year scope
      if ((r.receiptDate || '').slice(0, 4) !== selectedYear) return false;

      // Category filter
      if (categoryFilter && (r.category || '') !== categoryFilter) return false;

      // Payment filter — strict match on any selected method.
      if (paymentFilter !== 'All' && r.paymentMethod !== paymentFilter) return false;

      if (!q) return true;

      // Combined free-text search: store, client, items
      if ((r.storeName || '').toLowerCase().includes(q)) return true;
      if ((r.clientName || '').toLowerCase().includes(q)) return true;
      try {
        const items = JSON.parse(r.lineItems || '[]') as { description: string }[];
        if (items.some(i => i.description.toLowerCase().includes(q))) return true;
      } catch {}
      return false;
    });
  }, [receipts, search, categoryFilter, paymentFilter, selectedYear]);

  // ── Group receipts ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    // Group by month, sort receipts within each month by date desc
    const map = new Map<string, ReceiptType[]>();
    filtered.forEach(r => {
      const k = monthKey(r.receiptDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    map.forEach(arr => arr.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate)));
    const months = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    const total  = filtered.reduce((s, r) => s + r.total, 0);
    return { months, total };
  }, [filtered]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  function onSaved(receipt: import('../utils/types').Receipt) {
    // Prior-year receipts still save, but Home only shows current year;
    // they'll appear on the Dashboard year switcher.
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

  async function onUpdatePayment(id: number, paymentMethod: string | null) {
    await update(id, { paymentMethod });
  }

  async function onReEdit(id: number, updates: {
    storeName: string; lineItems: string; taxLines: string;
    subtotal: number; taxAmount: number; total: number;
    clientName: string | null; category: string; receiptDate?: string;
  }) {
    await update(id, updates);
  }

  const enterSelectMode = useCallback(() => {
    setSelectMode(true);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map(r => r.id)));
  }, [filtered]);

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} receipt${selectedIds.size !== 1 ? 's' : ''}?`)) return;
    for (const id of selectedIds) {
      await remove(id);
    }
    exitSelectMode();
  }

  const isSearching   = search.trim() !== '' || categoryFilter !== null || paymentFilter !== 'All';
  const filteredTotal = filtered.reduce((s, r) => s + r.total, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">

      {/* Home header — bold year picker (native select) sitting above the
          receipt list. Replaces the "Home 2026" text. Picker options are
          data-driven (only years with receipts, current year always shown).
          Same Poppins 2xl bold as Dashboard for visual consistency. */}
      <header className="flex items-center justify-between px-5 pt-12 pb-3 safe-top max-w-2xl mx-auto w-full">
        <div className="relative">
          <select
            value={selectedYear}
            onChange={e => setStoredYear(e.target.value)}
            aria-label="Select year"
            className="appearance-none bg-transparent text-white text-2xl font-bold tracking-tight pr-6 pl-0 focus:outline-none cursor-pointer"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            {availableYears.map(y => (
              <option key={y} value={y} className="bg-sb-card2 text-white">{y}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-0 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
        </div>
        <span className="text-[13px] text-white tracking-wider select-none">v{APP_VERSION}</span>
      </header>

      <main className="flex-1 px-3 pt-1 pb-52 overflow-y-auto max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>

        ) : receipts.length === 0 ? (
          <EmptyState onScan={() => setScanOpen(true)} />

        ) : (
          <div className="space-y-0.5">
            {grouped.months.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                <Search size={24} className="text-white opacity-30 mb-3" />
                <p className="text-white font-semibold text-sm mb-1">
                  {isSearching ? 'No receipts match' : `No receipts in ${selectedYear} yet`}
                </p>
                {isSearching && (
                  <p className="text-white text-xs opacity-50">Try clearing your search or filter.</p>
                )}
              </div>
            ) : (
              grouped.months.map(([key, items]) => (
                <MonthGroup
                  key={key}
                  label={monthLabel(key)}
                  receipts={items}
                  collapsed={collapsedMonths.has(key)}
                  onToggle={() => {
                    setCollapsedMonths(prev => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    });
                  }}
                  onDelete={onDelete}
                  onUpdateCategory={onUpdateCategory}
                  onUpdatePayment={onUpdatePayment}
                  onReEdit={onReEdit}
                  onNewReceipt={r => add(r)}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onEnterSelectMode={enterSelectMode}
                  autoExpandUuid={autoExpandUuid}
                />
              ))
            )}
          </div>
        )}
      </main>


      {/* ── Select mode action bar — sits above the nav ── */}
      {selectMode && (
        <div
          className="fixed left-0 right-0 z-30 bg-sb-card2 border-t border-sb-border px-4 py-3 flex items-center gap-3 animate-fade-in max-w-2xl mx-auto"
          style={{ bottom: 'calc(148px + env(safe-area-inset-bottom))' }}
        >
          <button onClick={exitSelectMode} className="p-2 text-sb-muted hover:text-white transition">
            <X size={18} />
          </button>
          <span className="flex-1 text-white text-sm font-semibold">
            {selectedIds.size} selected
          </span>
          <button
            onClick={selectAll}
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
      )}

      {scanOpen && (
        <ScanModal onClose={() => setScanOpen(false)} onSaved={onSaved} />
      )}
    </div>
  );
}

// ── MonthGroup ──────────────────────────────────────────────────────────────────

interface MonthGroupProps {
  label: string;
  receipts: ReceiptType[];
  collapsed: boolean;
  onToggle: () => void;
  onDelete: (id: number) => void;
  onUpdateCategory: (id: number, cat: string) => void;
  onUpdatePayment: (id: number, paymentMethod: string | null) => void;
  onReEdit: (id: number, updates: { storeName: string; lineItems: string; taxLines: string; subtotal: number; taxAmount: number; total: number; clientName: string | null; category: string; receiptDate?: string }) => void;
  onNewReceipt?: (r: ReceiptType) => void;
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onEnterSelectMode?: () => void;
  autoExpandUuid?: string | null;
}

function MonthGroup({ label, receipts, collapsed, onToggle, onDelete, onUpdateCategory, onUpdatePayment, onReEdit, onNewReceipt, selectMode, selectedIds, onToggleSelect, onEnterSelectMode, autoExpandUuid }: MonthGroupProps) {
  const total = receipts.reduce((s, r) => s + r.total, 0);
  return (
    <div className="mb-3">
      {/*
        Header layout per Phase 3 spec:
          LEFT cluster  = month name + green total + silver count
          RIGHT         = "Select" alone
        Whole left cluster is one toggle button; Select is a separate button
        so a small tap area doesn't accidentally collapse the group.
      */}
      <div className="flex items-baseline justify-between gap-2 px-2 pt-2 pb-1">
        <button
          onClick={onToggle}
          className="flex items-baseline gap-2.5 min-w-0 text-left group"
        >
          <span className="text-white/40 group-hover:text-white/60 transition" style={{ width: 12 }}>
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <span className="text-white text-[17px] font-bold leading-none tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>{label}</span>
          <span className="text-sb-green text-[15px] font-bold leading-none">${total.toFixed(2)}</span>
          <span className="text-white/40 text-[11px] leading-none">
            {receipts.length}
          </span>
        </button>
        {!selectMode && onEnterSelectMode && (
          <button
            onClick={onEnterSelectMode}
            className="text-[12px] text-white/50 hover:text-white transition flex-shrink-0"
          >
            Select
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="animate-fade-in">
          {receipts.map(r => (
            <ReceiptCard
              key={r.id}
              receipt={r}
              onDelete={onDelete}
              onUpdateCategory={onUpdateCategory}
              onUpdatePayment={onUpdatePayment}
              onReEdit={onReEdit}
              onNewReceipt={onNewReceipt}
              selectMode={selectMode}
              selected={selectedIds?.has(r.id)}
              onToggleSelect={onToggleSelect}
              autoExpand={!!autoExpandUuid && r.uuid === autoExpandUuid}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────────

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-sb-card border border-sb-border flex items-center justify-center mb-5">
        <Receipt size={28} style={{ color: '#ffffff', opacity: 0.3 }} />
      </div>
      <h2 className="text-white font-bold text-lg mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
        No receipts yet
      </h2>
      <p className="text-white text-sm mb-8 opacity-50">Tap Scan to add your first receipt.</p>
      <button
        onClick={onScan}
        className="px-10 py-3 rounded-xl bg-sb-green text-black font-semibold text-sm hover:brightness-110 transition active:scale-95"
      >
        Scan
      </button>
    </div>
  );
}
