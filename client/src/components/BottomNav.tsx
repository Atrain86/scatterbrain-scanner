import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, BarChart2, FileSpreadsheet, Settings, Camera, Funnel, CreditCard } from 'lucide-react';
import ScanModal from './ScanModal';
import { useQueryClient } from '@tanstack/react-query';
import SyncHealthDot from './SyncHealthDot';
import { useFilter } from '../contexts/FilterContext';
import { useAuth } from '../contexts/AuthContext';
import { getAllCategories } from '../utils/types';
import { getPaymentMethods } from '../lib/paymentStorage';
import { getDb } from '../lib/db';
import CardNameSheet from './CardNameSheet';
import type { PaymentMethod } from '../utils/types';

const TABS_LEFT = [
  { to: '/receipts',  icon: Home,      label: 'Home',      activeColor: '#60a5fa' },
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard', activeColor: '#a855f7' },
] as const;

const TABS_RIGHT = [
  { to: '/export',   icon: FileSpreadsheet, label: 'Export',   activeColor: '#4ade80' },
  { to: '/settings', icon: Settings,        label: 'Settings', activeColor: '#94a3b8' },
] as const;

const SCAN_RING = '#4ade80';
const SCAN_FILL = 'rgba(74,222,128,0.14)';
const SCAN_GLOW = '0 0 14px rgba(74,222,128,0.4)';

const YELLOW = '#d9c15c';

export default function BottomNav() {
  const [scanOpen, setScanOpen] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const queryClient = useQueryClient();
  const location = useLocation();

  const showFilterRow = location.pathname === '/receipts' || location.pathname === '/dashboard';

  const { search, setSearch, categoryFilter, setCategoryFilter, paymentFilter, setPaymentFilter } = useFilter();
  const { user } = useAuth();
  const categories = user ? getAllCategories(user.id) : [];
  const namedCards = user ? getPaymentMethods(user.id) : [];
  const [extraPaymentOptions, setExtraPaymentOptions] = useState<string[]>([]);
  const [showCardSheet, setShowCardSheet] = useState(false);

  // Options: All, named cards, orphan tags found in receipts, Cash
  const paymentOptions: string[] = ['All', ...namedCards.map(m => m.label), ...extraPaymentOptions, 'Cash'];

  const [showCatPicker,     setShowCatPicker]     = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const pickerRef        = useRef<HTMLDivElement>(null);
  const paymentPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCatPicker) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowCatPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showCatPicker]);

  useEffect(() => {
    if (!showPaymentPicker) return;
    function onDown(e: MouseEvent) {
      if (paymentPickerRef.current && !paymentPickerRef.current.contains(e.target as Node)) setShowPaymentPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showPaymentPicker]);

  // When picker opens, collect any paymentMethod values on receipts that aren't
  // already covered by named cards (e.g. old "Visa" tags before naming was added).
  useEffect(() => {
    if (!showPaymentPicker || !user) return;
    const namedLabels = new Set(getPaymentMethods(user.id).map(m => m.label));
    namedLabels.add('Cash');
    namedLabels.add('Other');
    getDb(user.id).receipts.toArray().then(rows => {
      const seen = new Set<string>();
      rows.forEach(r => {
        const pm = (r as { paymentMethod?: string | null }).paymentMethod;
        if (pm && !namedLabels.has(pm)) seen.add(pm);
      });
      setExtraPaymentOptions(Array.from(seen).sort());
    }).catch(() => {});
  }, [showPaymentPicker, user]);

  const funnelColor = categoryFilter
    ? (categories.find(c => c.name === categoryFilter)?.color ?? YELLOW)
    : YELLOW;

  function onSaved() {
    setScanOpen(false);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  function handleScanTap() {
    setPulseKey(k => k + 1);
    setTimeout(() => setScanOpen(true), 90);
  }

  const paymentActive = paymentFilter !== 'All';

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border safe-bottom">

        {/* ── Filter row — only on Home + Dashboard ── */}
        {showFilterRow && (
          <div
            className="flex items-center gap-2 px-3 max-w-2xl mx-auto w-full"
            style={{ paddingTop: 9, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            {/* Search field */}
            <div className="relative flex-1 min-w-0">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search store, client…"
                className="w-full text-white placeholder-white/35 focus:outline-none"
                style={{
                  background: '#1c1c30',
                  borderRadius: 11,
                  padding: '7px 80px 7px 12px',
                  fontSize: 11.5,
                  border: 'none',
                }}
              />
              {/* Filters pill — right side of search bar */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2" ref={pickerRef}>
                <button
                  onClick={() => setShowCatPicker(p => !p)}
                  aria-label={categoryFilter ? `Filtered by ${categoryFilter}` : 'Filter by category'}
                  className="flex items-center gap-1 transition active:scale-95"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 999,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    color: '#ffffff',
                    border: `1.3px solid ${categoryFilter ? funnelColor : YELLOW}`,
                    background: categoryFilter ? `${funnelColor}18` : 'transparent',
                  }}
                >
                  Filters
                  <Funnel
                    size={11}
                    strokeWidth={1.75}
                    style={{ color: funnelColor, fill: categoryFilter ? funnelColor : 'transparent' }}
                  />
                </button>

                {/* Category picker — opens upward */}
                {showCatPicker && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowCatPicker(false)} />
                    <div
                      className="absolute z-40 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden shadow-2xl animate-fade-in"
                      style={{ bottom: '100%', right: 0, marginBottom: 8, minWidth: 180, maxHeight: '50vh', overflowY: 'auto' }}
                    >
                      <button
                        onClick={() => { setCategoryFilter(null); setShowCatPicker(false); }}
                        className={`w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2 ${!categoryFilter ? 'text-sb-green' : 'text-white'}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />
                        All categories
                        {!categoryFilter && (
                          <svg className="ml-auto" width="10" height="10" viewBox="0 0 10 10">
                            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      {categories.length > 0 && <div className="border-t border-white/[0.06]" />}
                      {categories.map(cat => (
                        <button
                          key={cat.name}
                          onClick={() => { setCategoryFilter(cat.name); setShowCatPicker(false); }}
                          className={`w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2 ${categoryFilter === cat.name ? 'text-sb-green' : 'text-white'}`}
                        >
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                          {categoryFilter === cat.name && (
                            <svg className="ml-auto" width="10" height="10" viewBox="0 0 10 10">
                              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      ))}
                      {categories.length === 0 && (
                        <p className="px-3 py-2.5 text-[11px] text-white/40 italic">No categories yet.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Payment filter dropdown */}
            <div className="relative flex-shrink-0" ref={paymentPickerRef}>
              <button
                onClick={() => setShowPaymentPicker(p => !p)}
                className="flex items-center gap-1.5 transition active:scale-95"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '5px 10px',
                  borderRadius: 999,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  color: '#ffffff',
                  border: paymentActive ? '1.3px solid rgba(74,222,128,0.6)' : '1.3px solid rgba(74,222,128,0.35)',
                  background: paymentActive ? 'rgba(74,222,128,0.1)' : 'transparent',
                }}
              >
                <CreditCard size={17} strokeWidth={1.75} color="#ffffff" />
                {paymentActive && (
                  <span style={{ maxWidth: '10ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                    {paymentFilter}
                  </span>
                )}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5, flexShrink: 0 }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {showPaymentPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowPaymentPicker(false)} />
                  <div
                    className="absolute z-40 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden shadow-2xl animate-fade-in"
                    style={{ bottom: '100%', right: 0, marginBottom: 8, minWidth: 160, maxHeight: '50vh', overflowY: 'auto' }}
                  >
                    {paymentOptions.map(opt => {
                      const active = paymentFilter === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => { setPaymentFilter(opt); setShowPaymentPicker(false); }}
                          className="w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2"
                          style={{ color: active ? '#4ade80' : '#ffffff' }}
                        >
                          {opt}
                          {active && (
                            <svg className="ml-auto" width="10" height="10" viewBox="0 0 10 10">
                              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                    {/* + New card */}
                    <div className="border-t border-sb-border/50" />
                    <button
                      onClick={() => { setShowPaymentPicker(false); setShowCardSheet(true); }}
                      className="w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2"
                      style={{ color: '#4ade80' }}
                    >
                      ＋ New card…
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Tab row ── */}
        <div className="relative flex items-center justify-around px-1 py-2.5 max-w-2xl mx-auto w-full">
          {TABS_LEFT.map(tab => <TabItem key={tab.to} {...tab} />)}

          <button
            key={pulseKey}
            onClick={handleScanTap}
            aria-label="Scan receipt"
            className={`flex items-center justify-center rounded-full transition-transform will-change-transform ${pulseKey > 0 ? 'animate-scan-pulse' : ''}`}
            style={{
              width: 76, height: 76,
              backgroundColor: SCAN_FILL,
              border: `2px solid ${SCAN_RING}`,
              boxShadow: SCAN_GLOW,
            }}
          >
            <Camera size={32} strokeWidth={2} style={{ color: SCAN_RING }} />
          </button>

          {TABS_RIGHT.map(tab => <TabItem key={tab.to} {...tab} />)}
        </div>
      </nav>

      {scanOpen && (
        <ScanModal onClose={() => setScanOpen(false)} onSaved={onSaved} />
      )}

      {showCardSheet && (
        <CardNameSheet
          last4={null}
          network={null}
          onSave={(_method: PaymentMethod) => {
            setShowCardSheet(false);
            // Refresh namedCards on next render — getPaymentMethods reads localStorage
            queryClient.invalidateQueries({ queryKey: ['receipts'] });
          }}
          onClose={() => setShowCardSheet(false)}
        />
      )}
    </>
  );
}

interface TabItemProps {
  to: string;
  icon: typeof Home;
  label: string;
  activeColor: string;
}

function TabItem({ to, icon: Icon, label, activeColor }: TabItemProps) {
  return (
    <NavLink to={to} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all">
      {({ isActive }) => (
        <>
          <span className="relative inline-flex">
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} style={{ color: isActive ? activeColor : '#888888' }} />
            {to === '/settings' && <SyncHealthDot />}
          </span>
          <span className="text-[9px] font-medium tracking-wide text-white">{label}</span>
        </>
      )}
    </NavLink>
  );
}
