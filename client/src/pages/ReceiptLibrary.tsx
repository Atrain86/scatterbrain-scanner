import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Search, X, SlidersHorizontal } from 'lucide-react';
import { useAuthFetch } from '../contexts/AuthContext';
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
  const isSearching = search.trim() !== '';

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

      {/* ── Logo header ── */}
      <header className="flex flex-col items-center pt-6 pb-2 safe-top">
        <img
          src="/logo.png"
          alt="Scatterbrain"
          className="h-24 w-auto"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 px-3 pt-2 pb-36 space-y-2 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState onScan={() => setScanOpen(true)} />
        ) : isSearching || hasActiveFilter ? (
          /* ── Spotlight-style results when searching ── */
          <div className="animate-fade-in">
            <div className="flex items-center justify-between px-1 mb-2">
              <p className="text-white text-[11px]">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-3">
                {filteredTotal > 0 && (
                  <span className="text-sb-green text-sm font-bold">${filteredTotal.toFixed(2)}</span>
                )}
                <button onClick={clearFilters} className="text-[11px] text-white flex items-center gap-0.5 opacity-60 hover:opacity-100">
                  <X size={11} /> Clear
                </button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                <Search size={24} className="text-white opacity-30 mb-3" />
                <p className="text-white font-semibold text-sm mb-1">No receipts match</p>
                <p className="text-white text-xs opacity-50 mb-5">Try a different search term.</p>
              </div>
            ) : (
              filtered.map(receipt => (
                <ReceiptCard key={receipt.id} receipt={receipt} onDelete={onDelete} onUpdateCategory={onUpdateCategory} />
              ))
            )}
          </div>
        ) : (
          /* ── Full list ── */
          <>
            <div className="flex items-center justify-between px-1 mb-1">
              <p className="text-white text-[11px] opacity-50">
                {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
              </p>
              <span className="text-sb-green text-sm font-bold">
                ${receipts.reduce((s, r) => s + r.total, 0).toFixed(2)}
              </span>
            </div>
            {receipts.map(receipt => (
              <ReceiptCard key={receipt.id} receipt={receipt} onDelete={onDelete} onUpdateCategory={onUpdateCategory} />
            ))}
          </>
        )}
      </main>

      {/* ── Bottom search bar — sits above nav ── */}
      <div className="fixed bottom-[52px] left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border px-3 py-2">
        {/* Filter pills — shown when filters active or panel open */}
        {showFilters && (
          <div className="space-y-2 mb-2 animate-fade-in">
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
              {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`flex-shrink-0 text-[11px] px-3 py-1 rounded-full border transition ${
                    dateFilter === f
                      ? 'border-sb-green text-white bg-green-950/40'
                      : 'border-sb-border text-white opacity-50 hover:opacity-80'
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
                        color: active ? cat.color : '#ffffff',
                        opacity: active ? 1 : 0.5,
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

        {/* Search row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#ffffff', opacity: 0.4 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search store or items…"
              className="w-full bg-sb-card border border-sb-border rounded-xl pl-8 pr-8 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sb-green transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#ffffff', opacity: 0.5 }}>
                <X size={12} />
              </button>
            )}
          </div>
          {receipts.length > 0 && (
            <button
              onClick={() => setShowFilters(p => !p)}
              className="p-2 rounded-xl flex-shrink-0 transition"
              style={{ color: showFilters ? '#4ade80' : '#ffffff', opacity: showFilters ? 1 : 0.4 }}
            >
              <SlidersHorizontal size={17} />
            </button>
          )}
        </div>
      </div>

      {scanOpen && (
        <ScanModal onClose={() => setScanOpen(false)} onSaved={onSaved} />
      )}
    </div>
  );
}

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-sb-card border border-sb-border flex items-center justify-center mb-5">
        <Receipt size={28} style={{ color: '#ffffff', opacity: 0.3 }} />
      </div>
      <h2 className="text-white font-bold text-lg mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
        No receipts yet
      </h2>
      <p className="text-white text-sm mb-8 opacity-50">
        Tap Scan to add your first receipt.
      </p>
      <button
        onClick={onScan}
        className="px-10 py-3 rounded-xl bg-sb-green text-black font-semibold text-sm hover:brightness-110 transition active:scale-95"
      >
        Scan
      </button>
    </div>
  );
}
