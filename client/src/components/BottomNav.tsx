import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, BarChart2, FileSpreadsheet, Settings, Camera, Funnel } from 'lucide-react';
import ScanModal from './ScanModal';
import { useQueryClient } from '@tanstack/react-query';
import SyncHealthDot from './SyncHealthDot';
import { useFilter, type PaymentFilter } from '../contexts/FilterContext';
import { useAuth } from '../contexts/AuthContext';
import { getAllCategories } from '../utils/types';

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

const PILL_STYLES: Record<PaymentFilter, { border: string; bg: string }> = {
  All:   { border: '#b0aabf', bg: 'rgba(176,170,191,0.13)' },
  Debit: { border: '#6ea882', bg: 'rgba(110,168,130,0.15)' },
  Visa:  { border: '#5a7fc4', bg: 'rgba(90,127,196,0.15)'  },
};
const PAYMENT_OPTIONS: PaymentFilter[] = ['All', 'Debit', 'Visa'];

export default function BottomNav() {
  const [scanOpen, setScanOpen] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const queryClient = useQueryClient();
  const location = useLocation();

  const showFilterRow = location.pathname === '/receipts' || location.pathname === '/dashboard';

  const { search, setSearch, categoryFilter, setCategoryFilter, paymentFilter, setPaymentFilter } = useFilter();
  const { user } = useAuth();
  const categories = user ? getAllCategories(user.id) : [];

  const [showCatPicker, setShowCatPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCatPicker) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowCatPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showCatPicker]);

  const funnelColor = categoryFilter
    ? (categories.find(c => c.name === categoryFilter)?.color ?? '#d9c15c')
    : '#d9c15c';

  function onSaved() {
    setScanOpen(false);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  function handleScanTap() {
    setPulseKey(k => k + 1);
    setTimeout(() => setScanOpen(true), 90);
  }

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
            <div className="relative flex-1 min-w-0" ref={pickerRef}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search store, client…"
                className="w-full text-white placeholder-white/35 focus:outline-none"
                style={{
                  background: '#1c1c30',
                  borderRadius: 11,
                  padding: '7px 32px 7px 12px',
                  fontSize: 11.5,
                  border: 'none',
                }}
              />
              {/* Mustard funnel inside the field */}
              <button
                onClick={() => setShowCatPicker(p => !p)}
                aria-label={categoryFilter ? `Filtered by ${categoryFilter}` : 'Filter by category'}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center transition active:scale-90"
                style={{ width: 24, height: 24 }}
              >
                <Funnel
                  size={14}
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
                    style={{ bottom: '100%', left: 0, marginBottom: 8, minWidth: 180, maxHeight: '50vh', overflowY: 'auto' }}
                  >
                    <button
                      onClick={() => { setCategoryFilter(null); setShowCatPicker(false); }}
                      className={`w-full px-3 py-2.5 text-[13px] text-left transition hover:bg-white/5 flex items-center gap-2 ${!categoryFilter ? 'text-sb-green' : 'text-white'}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />
                      All categories
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
                      </button>
                    ))}
                    {categories.length === 0 && (
                      <p className="px-3 py-2.5 text-[11px] text-white/40 italic">No categories yet.</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Payment toggle pills */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {PAYMENT_OPTIONS.map(opt => {
                const active = paymentFilter === opt;
                const s = PILL_STYLES[opt];
                return (
                  <button
                    key={opt}
                    onClick={() => setPaymentFilter(opt)}
                    className="transition active:scale-95"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: '#ffffff',
                      padding: '5px 9px',
                      borderRadius: 7,
                      border: `1.3px solid ${active ? s.border : 'rgba(255,255,255,0.13)'}`,
                      background: active ? s.bg : 'transparent',
                      lineHeight: 1,
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
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
