import { useState, useMemo } from 'react';
import { Receipt, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useReceipts } from '../hooks/useReceipts';
import ScanModal from '../components/ScanModal';
import ReceiptCard from '../components/ReceiptCard';
import { APP_VERSION } from './SettingsPage';
import type { Receipt as ReceiptType } from '../utils/types';

type SearchMode = 'all' | 'store' | 'client' | 'item';

const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  all:    'All',
  store:  'Store',
  client: 'Client',
  item:   'Item',
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function monthKey(receiptDate: string) { return receiptDate.slice(0, 7); }
function yearOf(receiptDate: string)   { return receiptDate.slice(0, 4); }
function monthLabel(key: string) {
  const [, m] = key.split('-');
  return MONTH_NAMES[Number(m) - 1];
}

export default function ReceiptLibrary() {
  const { receipts, isLoading, reload, remove, update, add } = useReceipts();

  const [scanOpen,     setScanOpen]     = useState(false);
  const [search,       setSearch]       = useState('');
  const [searchMode,   setSearchMode]   = useState<SearchMode>('all');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showArchive,  setShowArchive]  = useState(false);

  // Archive threshold: years strictly before current year are "archive"
  const thisYear = String(new Date().getFullYear());

  // current year months: collapsed set (month key → collapsed)
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  // archive years: expanded set (year → expanded)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  // archive year months: expanded set ("year-month" → expanded)
  const [expandedArchiveMonths, setExpandedArchiveMonths] = useState<Set<string>>(new Set());

  // ── Search filter ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter(r => {
      if (searchMode === 'store' || searchMode === 'all') {
        if ((r.storeName || '').toLowerCase().includes(q)) return true;
      }
      if (searchMode === 'client' || searchMode === 'all') {
        if ((r.clientName || '').toLowerCase().includes(q)) return true;
      }
      if (searchMode === 'item' || searchMode === 'all') {
        try {
          const items = JSON.parse(r.lineItems || '[]') as { description: string }[];
          if (items.some(i => i.description.toLowerCase().includes(q))) return true;
        } catch {}
      }
      return false;
    });
  }, [receipts, search, searchMode]);

  // ── Group receipts ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    // Receipts with missing/bad dates get today's year so they're always visible
    const safeYear = (r: ReceiptType) => yearOf(r.receiptDate) || thisYear;
    const thisYearList = filtered.filter(r => safeYear(r) === thisYear);
    // Archive = any year before current year; only shown when toggle is on
    const archiveList  = showArchive
      ? filtered.filter(r => safeYear(r) !== thisYear)
      : [];

    // Group by month, sort receipts within each month by date desc
    function byMonth(list: ReceiptType[]): [string, ReceiptType[]][] {
      const map = new Map<string, ReceiptType[]>();
      list.forEach(r => {
        const k = monthKey(r.receiptDate);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      });
      // Sort receipts within month by date descending
      map.forEach(arr => arr.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate)));
      // Sort months descending
      return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    }

    // Group archive by year → month
    const archiveYears: [string, [string, ReceiptType[]][]][] = [];
    const archiveYearList = Array.from(new Set(archiveList.map(r => safeYear(r)))).sort((a, b) => b.localeCompare(a));
    archiveYearList.forEach(y => {
      const yearReceipts = archiveList.filter(r => safeYear(r) === y);
      archiveYears.push([y, byMonth(yearReceipts)]);
    });

    const archiveCount = filtered.filter(r => safeYear(r) !== thisYear).length;

    return {
      thisYearMonths: byMonth(thisYearList),
      thisYearTotal: thisYearList.reduce((s, r) => s + r.total, 0),
      archiveYears,
      archiveCount,
    };
  }, [filtered, thisYear, showArchive]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  function onSaved(receipt: import('../utils/types').Receipt) {
    setScanOpen(false);
    add(receipt);
    // If the receipt date is from a prior year, reveal archive so it's visible
    if (receipt.receiptDate.slice(0, 4) !== thisYear) {
      setShowArchive(true);
    }
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
    clientName: string | null; category: string;
  }) {
    await update(id, updates);
  }

  const isSearching   = search.trim() !== '';
  const filteredTotal = filtered.reduce((s, r) => s + r.total, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">

      <header className="flex items-center justify-between px-4 pt-12 pb-2 safe-top">
        <img
          src="/logo.png"
          alt="Scatterbrain"
          className="h-10 w-auto"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span className="text-[10px] text-white/50 tracking-wider select-none">v{APP_VERSION} beta</span>
      </header>

      <main className="flex-1 px-3 pt-1 pb-56 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>

        ) : receipts.length === 0 ? (
          <EmptyState onScan={() => setScanOpen(true)} />

        ) : isSearching ? (
          <div className="animate-fade-in space-y-2">
            <div className="flex items-center justify-between px-1 mb-2">
              <p className="text-white text-[11px] opacity-60">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-3">
                {filteredTotal > 0 && (
                  <span className="text-sb-green text-sm font-bold">${filteredTotal.toFixed(2)}</span>
                )}
                <button onClick={() => setSearch('')} className="text-[11px] text-white flex items-center gap-0.5 opacity-60 hover:opacity-100">
                  <X size={11} /> Clear
                </button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                <Search size={24} className="text-white opacity-30 mb-3" />
                <p className="text-white font-semibold text-sm mb-1">No receipts match</p>
                <p className="text-white text-xs opacity-50">Try a different search or mode.</p>
              </div>
            ) : (
              filtered.map(r => (
                <ReceiptCard key={r.id} receipt={r} onDelete={onDelete} onUpdateCategory={onUpdateCategory} onReEdit={onReEdit} />
              ))
            )}
          </div>

        ) : (
          <div className="space-y-0.5">

            {/* ── Current year header ── */}
            <div className="flex items-center justify-between px-2 pt-1 pb-3">
              <p className="text-white text-base font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>{thisYear}</p>
              <span className="text-sb-green text-sm font-bold">${grouped.thisYearTotal.toFixed(2)}</span>
            </div>

            {grouped.thisYearMonths.length === 0 && (
              <p className="text-sb-muted text-xs px-2 pb-4">No receipts this year yet.</p>
            )}

            {grouped.thisYearMonths.map(([key, items]) => (
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
              />
            ))}

            {/* ── Archive years ── */}
            {grouped.archiveYears.length > 0 && (
              <div className="pt-4">
                <p className="text-sb-muted text-[11px] uppercase tracking-wider font-medium px-2 pb-2">Archive</p>
                {grouped.archiveYears.map(([year, months]) => {
                  const yearTotal = months.flatMap(([, r]) => r).reduce((s, r) => s + r.total, 0);
                  const yearOpen  = expandedYears.has(year);
                  return (
                    <div key={year} className="mb-1">
                      {/* Year header */}
                      <button
                        onClick={() => {
                          setExpandedYears(prev => {
                            const next = new Set(prev);
                            next.has(year) ? next.delete(year) : next.add(year);
                            return next;
                          });
                        }}
                        className="w-full flex items-center gap-2 px-2 py-2.5 rounded-xl hover:bg-white/5 transition active:bg-white/10"
                      >
                        <span className="text-sb-muted" style={{ width: 14 }}>
                          {yearOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <span className="flex-1 text-white text-sm font-bold text-left">{year}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sb-card border border-sb-border text-sb-muted mr-1">
                          {months.flatMap(([, r]) => r).length} receipts
                        </span>
                        <span className="text-sb-green text-sm font-bold">${yearTotal.toFixed(2)}</span>
                      </button>

                      {/* Months within year */}
                      {yearOpen && (
                        <div className="pl-3 space-y-0.5 animate-fade-in">
                          {months.map(([mKey, mItems]) => {
                            const archiveKey = `${year}-${mKey}`;
                            const monthOpen  = expandedArchiveMonths.has(archiveKey);
                            return (
                              <MonthGroup
                                key={mKey}
                                label={monthLabel(mKey)}
                                receipts={mItems}
                                collapsed={!monthOpen}
                                onToggle={() => {
                                  setExpandedArchiveMonths(prev => {
                                    const next = new Set(prev);
                                    next.has(archiveKey) ? next.delete(archiveKey) : next.add(archiveKey);
                                    return next;
                                  });
                                }}
                                onDelete={onDelete}
                                onUpdateCategory={onUpdateCategory}
                                onReEdit={onReEdit}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom search bar */}
      <div
        className="fixed left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border px-3 py-2"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowModeMenu(p => !p)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-sb-border text-[11px] text-white opacity-60 hover:opacity-100 transition flex-shrink-0"
            >
              {SEARCH_MODE_LABELS[searchMode]}
              <ChevronDown size={10} />
            </button>
            {showModeMenu && (
              <div className="absolute bottom-full mb-1 left-0 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-30 shadow-2xl min-w-[90px]">
                {(Object.keys(SEARCH_MODE_LABELS) as SearchMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => { setSearchMode(mode); setShowModeMenu(false); }}
                    className={`w-full px-3 py-2.5 text-[12px] text-left transition hover:bg-white/5 ${searchMode === mode ? 'text-sb-green' : 'text-white'}`}
                  >
                    {SEARCH_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white opacity-40" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={
                searchMode === 'store'  ? 'Search store name…' :
                searchMode === 'client' ? 'Search client name…' :
                searchMode === 'item'   ? 'Search item description…' :
                'Search store, client, items…'
              }
              className="w-full bg-sb-card border border-sb-border rounded-xl pl-8 pr-8 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sb-green transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white opacity-50">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

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
  onReEdit: (id: number, updates: { storeName: string; lineItems: string; taxLines: string; subtotal: number; taxAmount: number; total: number; clientName: string | null; category: string }) => void;
}

function MonthGroup({ label, receipts, collapsed, onToggle, onDelete, onUpdateCategory, onReEdit }: MonthGroupProps) {
  const total = receipts.reduce((s, r) => s + r.total, 0);
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5 transition active:bg-white/10"
      >
        <span className="text-sb-muted" style={{ width: 14 }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <span className="flex-1 text-white text-sm font-semibold text-left">{label}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sb-card border border-sb-border text-sb-muted mr-1">
          {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
        </span>
        <span className="text-sb-green text-sm font-bold">${total.toFixed(2)}</span>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 pl-1 animate-fade-in">
          {receipts.map(r => (
            <ReceiptCard
              key={r.id}
              receipt={r}
              onDelete={onDelete}
              onUpdateCategory={onUpdateCategory}
              onReEdit={onReEdit}
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
