import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Search, X, SlidersHorizontal } from 'lucide-react';
import { useAuth, useAuthFetch } from '../contexts/AuthContext';
import ScanModal from '../components/ScanModal';
import ReceiptCard from '../components/ReceiptCard';
import type { Receipt as ReceiptType } from '../utils/types';
import { CATEGORIES } from '../utils/types';

type DateFilter = 'all' | 'this-month' | 'last-month' | 'this-year';

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  'all':        'All time',
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-year':  'This year',
};

export default function ReceiptLibrary() {
  const { user } = useAuth();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  const [scanOpen, setScanOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: receipts = [], isLoading } = useQuery<ReceiptType[]>({
    queryKey: ['receipts'],
    queryFn: async () => {
      const res = await authFetch('/api/receipts');
      if (!res.ok) throw new Error('Failed to load receipts');
      return res.json();
    },
  });

  const usedCategories = useMemo(() => {
    const seen = new Set<string>();
    receipts.forEach(r => seen.add(r.category));
    return CATEGORIES.filter(c => seen.has(c.name));
  }, [receipts]);

  const filtered = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear  = now.getFullYear();

    return receipts.filter(r => {
      if (activeCategory && r.category !== activeCategory) return false;

      if (dateFilter !== 'all') {
        const d = new Date(r.receiptDate + 'T00:00:00');
        if (dateFilter === 'this-month' && (d.getMonth() !== thisMonth || d.getFullYear() !== thisYear)) return false;
        if (dateFilter === 'last-month') {
          const lm = thisMonth === 0 ? 11 : thisMonth - 1;
          const ly = thisMonth === 0 ? thisYear - 1 : thisYear;
          if (d.getMonth() !== lm || d.getFullYear() !== ly) return false;
        }
        if (dateFilter === 'this-year' && d.getFullYear() !== thisYear) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const inStore = r.storeName.toLowerCase().includes(q);
        const inItems = r.lineItems
          ? (JSON.parse(r.lineItems) as { description: string }[]).some(i =>
              i.description.toLowerCase().includes(q)
            )
          : false;
        if (!inStore && !inItems) return false;
      }

      return true;
    });
  }, [receipts, activeCategory, dateFilter, search]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.total, 0),
    [filtered]
  );

  const hasActiveFilter = activeCategory !== null || dateFilter !== 'all' || search.trim() !== '';

  function clearFilters() {
    setActiveCategory(null);
    setDateFilter('all');
    setSearch('');
  }

  function onSaved() {
    setScanOpen(false);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  async function onDelete(id: number) {
    if (!confirm('Delete this receipt?')) return;
    await authFetch(`/api/receipts/${id}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  async function onUpdateCategory(id: number, category: string) {
    await authFetch(`/api/receipts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border safe-top">
        {/* Centered logo + wordmark */}
        <div className="flex flex-col items-center pt-2 pb-1">
          <img
            src="/logo.png"
            alt="Scatterbrain"
            className="h-48 w-auto -mb-8"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <p className="text-white font-semibold text-sm leading-none"
             style={{ fontFamily: "'Poppins', sans-serif", letterSpacing: '0.08em' }}>
            Scatterbrain
          </p>
        </div>

        {/* Search + filter toggle row */}
        <div className="flex items-center gap-2 px-4 pb-2.5">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-sb-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search store or items…"
              className="w-full bg-sb-card border border-sb-border rounded-xl pl-8 pr-8 py-1.5 text-sm text-white placeholder-sb-muted focus:outline-none focus:border-sb-green transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-sb-muted hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(p => !p)}
            className={`p-2 rounded-xl flex-shrink-0 transition ${showFilters ? 'text-sb-green bg-green-950/30' : 'text-sb-muted hover:text-white'}`}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="px-4 pb-3 space-y-2 border-t border-sb-border pt-2 animate-fade-in">
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
              {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`flex-shrink-0 text-[11px] px-3 py-1 rounded-full border transition ${
                    dateFilter === f
                      ? 'border-sb-green text-sb-green bg-green-950/30'
                      : 'border-sb-border text-sb-muted hover:border-sb-muted'
                  }`}
                >
                  {DATE_FILTER_LABELS[f]}
                </button>
              ))}
            </div>

            {usedCategories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                {usedCategories.map(cat => {
                  const active = activeCategory === cat.name;
                  return (
                    <button
                      key={cat.name}
                      onClick={() => setActiveCategory(active ? null : cat.name)}
                      className="flex-shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition"
                      style={{
                        borderColor: active ? cat.color : '#333333',
                        backgroundColor: active ? cat.color + '22' : 'transparent',
                        color: active ? cat.color : '#888888',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── Content ── */}
      <main className="flex-1 px-3 py-3 pb-36 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState onScan={() => setScanOpen(true)} />
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex items-center justify-between px-1 mb-1">
              <p className="text-sb-muted text-[11px]">
                {filtered.length} receipt{filtered.length !== 1 ? 's' : ''}
                {hasActiveFilter && receipts.length !== filtered.length && ` of ${receipts.length}`}
              </p>
              <div className="flex items-center gap-3">
                {filteredTotal > 0 && (
                  <span className="text-sb-green text-sm font-bold">
                    ${filteredTotal.toFixed(2)}
                  </span>
                )}
                {hasActiveFilter && (
                  <button onClick={clearFilters} className="text-[11px] text-sb-muted hover:text-white flex items-center gap-0.5">
                    <X size={11} /> Clear
                  </button>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <FilteredEmptyState onClear={clearFilters} />
            ) : (
              filtered.map(receipt => (
                <ReceiptCard
                  key={receipt.id}
                  receipt={receipt}
                  onDelete={onDelete}
                  onUpdateCategory={onUpdateCategory}
                />
              ))
            )}
          </>
        )}
      </main>

      {/* FAB — above bottom nav */}
      <div className="fixed bottom-24 right-4 z-30">
        <button
          onClick={() => setScanOpen(true)}
          className="w-14 h-14 rounded-full bg-sb-green text-black shadow-lg shadow-green-900/40 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      </div>

      {scanOpen && (
        <ScanModal onClose={() => setScanOpen(false)} onSaved={onSaved} />
      )}
    </div>
  );
}

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-sb-card border border-sb-border flex items-center justify-center mb-5">
        <Receipt size={28} className="text-sb-muted" />
      </div>
      <h2 className="text-white font-bold text-lg mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
        No receipts yet
      </h2>
      <p className="text-sb-muted text-sm mb-7">
        Tap + to scan your first receipt. Camera or photo library.
      </p>
      <button
        onClick={onScan}
        className="px-6 py-2.5 rounded-xl bg-sb-green text-black font-semibold text-sm hover:brightness-110 transition"
      >
        Scan First Receipt
      </button>
    </div>
  );
}

function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <Search size={28} className="text-sb-muted mb-3" />
      <p className="text-white font-semibold text-sm mb-1">No receipts match</p>
      <p className="text-sb-muted text-xs mb-5">Try a different filter or search term.</p>
      <button
        onClick={onClear}
        className="px-4 py-2 rounded-xl border border-sb-border text-sb-muted hover:text-white text-sm transition"
      >
        Clear filters
      </button>
    </div>
  );
}
