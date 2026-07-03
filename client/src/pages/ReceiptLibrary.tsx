import { useState, useMemo, useCallback } from 'react';
import { Receipt, Search, X, ChevronDown, ChevronRight, Trash2, CheckSquare } from 'lucide-react';
import { useReceipts } from '../hooks/useReceipts';
import ScanModal from '../components/ScanModal';
import ReceiptCard from '../components/ReceiptCard';
import SearchWithFilter from '../components/SearchWithFilter';
import { useAuth } from '../contexts/AuthContext';
import type { Receipt as ReceiptType } from '../utils/types';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function monthKey(receiptDate: string) { return receiptDate.slice(0, 7); }
function yearOf(receiptDate: string)   { return receiptDate.slice(0, 4); }
function monthLabel(key: string) {
  const [, m] = key.split('-');
  return MONTH_NAMES[Number(m) - 1];
}

export default function ReceiptLibrary() {
  const { user } = useAuth();
  const userId = user!.id;
  const { receipts, isLoading, reload, remove, update, add } = useReceipts();

  const [scanOpen,    setScanOpen]    = useState(false);
  const [search,      setSearch]      = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showCatMenu, setShowCatMenu] = useState(false);
  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const thisYear = String(new Date().getFullYear());

  // Month-collapse state, keyed by year-month
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  // ── Filter: search + category, across ALL years ──────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(r => {
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
  }, [receipts, search, categoryFilter]);

  // ── Group filtered by month (year-month key), most recent first ──────────
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

  // ── Totals ───────────────────────────────────────────────────────────────
  const thisYearTotal = useMemo(
    () => receipts.filter(r => yearOf(r.receiptDate) === thisYear).reduce((s, r) => s + r.total, 0),
    [receipts, thisYear]
  );
  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + r.total, 0), [filtered]);

  // Are we in "filtered" mode (search or category active)?
  const isFiltered = search.trim() !== '' || categoryFilter !== null;

  // ── Mutations ────────────────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col font-sans">

      {/* ── Header ── */}
      <header className="safe-top">
        <div className="px-4 pt-3 pb-3 flex items-center justify-between max-w-2xl mx-auto w-full">
          <h1 className="text-white text-xl font-semibold">Library</h1>
          <span className="text-sb-green text-sm font-semibold tabular-nums">
            ${(isFiltered ? filteredTotal : thisYearTotal).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </header>

      <main className="flex-1 px-3 pb-24 overflow-y-auto max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Search + filter */}
            <SearchWithFilter
              value={search}
              onChange={setSearch}
              category={categoryFilter}
              onCategoryChange={setCategoryFilter}
              catOpen={showCatMenu}
              setCatOpen={setShowCatMenu}
              userId={userId}
            />

            {/* Filtered summary chip */}
            {isFiltered && (
              <div className="flex items-center justify-between px-1 mt-3 mb-1">
                <p className="text-white text-[11px] opacity-60">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => { setSearch(''); setCategoryFilter(null); }}
                  className="text-[11px] text-white flex items-center gap-0.5 opacity-60 hover:opacity-100"
                >
                  <X size={11} /> Clear
                </button>
              </div>
            )}

            {/* Receipt list */}
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                <Search size={22} className="text-white opacity-30 mb-3" />
                <p className="text-white font-semibold text-sm mb-1">No receipts match</p>
                <p className="text-sb-muted text-xs">Try adjusting your search or filter.</p>
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

// ── Month group ───────────────────────────────────────────────────────────────
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
          <span className="text-white text-sm font-semibold text-left">{label}</span>
          <span className="text-[10px] text-sb-muted">
            {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
          </span>
          <span className="flex-1" />
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

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-sb-card border border-sb-border flex items-center justify-center mb-5">
        <Receipt size={28} style={{ color: '#ffffff', opacity: 0.3 }} />
      </div>
      <h2 className="text-white font-semibold text-lg mb-2">No receipts yet</h2>
      <p className="text-sb-muted text-sm">Tap Scan below to add your first receipt.</p>
    </div>
  );
}
