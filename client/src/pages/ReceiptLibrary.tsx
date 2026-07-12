import { useState, useMemo, useCallback } from 'react';
import { Receipt, Search, X, ChevronDown, ChevronRight, Trash2, CheckSquare, Funnel } from 'lucide-react';
import { useReceipts } from '../hooks/useReceipts';
import { useAuth } from '../contexts/AuthContext';
import ScanModal from '../components/ScanModal';
import ReceiptCard from '../components/ReceiptCard';
import { APP_VERSION } from './SettingsPage';
import type { Receipt as ReceiptType } from '../utils/types';
import { getAllCategories } from '../utils/types';

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

  const [scanOpen,      setScanOpen]      = useState(false);
  const [search,        setSearch]        = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [selectMode,    setSelectMode]    = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<number>>(new Set());

  // Home is hard-scoped to CURRENT calendar year per redesign spec Phase 3.
  // Archive / prior-year drilldown lives on Dashboard, not here.
  const thisYear = String(new Date().getFullYear());

  // current year months: collapsed set (month key → collapsed)
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const categories = useMemo(() => (user ? getAllCategories(user.id) : []), [user]);

  // ── Search + category filter (current year only) ───────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(r => {
      // Current-year scope
      if ((r.receiptDate || '').slice(0, 4) !== thisYear) return false;

      // Category filter (from funnel)
      if (categoryFilter && (r.category || '') !== categoryFilter) return false;

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
  }, [receipts, search, categoryFilter, thisYear]);

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

  const isSearching   = search.trim() !== '';
  const filteredTotal = filtered.reduce((s, r) => s + r.total, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">

      {/* Home header — "Home" + current year, per Phase 3 spec */}
      <header className="flex items-baseline justify-between px-5 pt-12 pb-3 safe-top max-w-2xl mx-auto w-full">
        <div className="flex items-baseline gap-2">
          <h1 className="text-white text-2xl font-bold tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>Home</h1>
          <span className="text-white/40 text-lg font-medium select-none">{thisYear}</span>
        </div>
        <span className="text-[13px] text-white tracking-wider select-none">v{APP_VERSION}</span>
      </header>

      <main className="flex-1 px-3 pt-1 pb-40 overflow-y-auto max-w-2xl mx-auto w-full">
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
                  {isSearching || categoryFilter ? 'No receipts match' : `No receipts in ${thisYear} yet`}
                </p>
                {(isSearching || categoryFilter) && (
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
                  onReEdit={onReEdit}
                  onNewReceipt={r => add(r)}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onEnterSelectMode={enterSelectMode}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/*
        Bottom search bar — single input; silver funnel icon INSIDE on the right
        (no container box). Positioned above the nav with a CLEAR GAP: bottom
        offset = nav height (~72px) + safe area + gap so the two form distinct
        bands. No top border on this bar — it's not glued to the nav.
      */}
      <div
        className="fixed left-0 right-0 z-20 px-4 pointer-events-none"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      >
        <div className="relative max-w-2xl mx-auto w-full pointer-events-auto">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search store, client, items…"
            className="w-full bg-sb-card/95 backdrop-blur-sm border border-sb-border rounded-2xl pl-11 pr-11 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/25 transition"
          />
          {/* Silver bare funnel — no box, opens category picker */}
          <button
            onClick={() => setShowCatPicker(p => !p)}
            aria-label={categoryFilter ? `Filtered by ${categoryFilter} — tap to change` : 'Filter by category'}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition active:scale-90"
            style={{ width: 28, height: 28 }}
          >
            <Funnel
              size={18}
              strokeWidth={1.75}
              style={{
                color: categoryFilter ? (categories.find(c => c.name === categoryFilter)?.color ?? '#b0aabf') : '#b0aabf',
                fill:  categoryFilter ? (categories.find(c => c.name === categoryFilter)?.color ?? 'transparent') : 'transparent',
              }}
            />
          </button>

          {/* Category picker popover */}
          {showCatPicker && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowCatPicker(false)} />
              <div className="absolute bottom-full right-0 mb-2 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl min-w-[180px] max-h-[50vh] overflow-y-auto animate-fade-in">
                <button
                  onClick={() => { setCategoryFilter(null); setShowCatPicker(false); }}
                  className={`w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2 ${!categoryFilter ? 'text-sb-green' : 'text-white'}`}
                >
                  <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />
                  All categories
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => { setCategoryFilter(cat.name); setShowCatPicker(false); }}
                    className={`w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2 ${categoryFilter === cat.name ? 'text-sb-green' : 'text-white'}`}
                  >
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active filter/search summary — sits just above the search bar, right-aligned */}
      {(isSearching || categoryFilter) && (
        <div
          className="fixed left-0 right-0 z-10 px-5 pointer-events-none"
          style={{ bottom: 'calc(148px + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-end gap-3 max-w-2xl mx-auto w-full pointer-events-auto">
            {filteredTotal > 0 && (
              <span className="text-sb-green text-xs font-bold">${filteredTotal.toFixed(2)}</span>
            )}
            <button
              onClick={() => { setSearch(''); setCategoryFilter(null); }}
              className="text-[11px] text-white/60 hover:text-white flex items-center gap-0.5"
            >
              <X size={11} /> Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Select mode action bar ── */}
      {selectMode && (
        <div
          className="fixed left-0 right-0 z-30 bg-sb-card2 border-t border-sb-border px-4 py-3 flex items-center gap-3 animate-fade-in max-w-2xl mx-auto"
          style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
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
