import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, BarChart2, FileSpreadsheet, Settings, ScanLine } from 'lucide-react';
import ScanModal from './ScanModal';
import { useQueryClient } from '@tanstack/react-query';
import SyncHealthDot from './SyncHealthDot';

// Phase 2 nav (redesign spec):
//   Order: Home · Dashboard · Scan · Export · Settings
//   Scan is the CENTER TAB (not a FAB). Icon ~2x the others, vertically
//   centered so it BREAKS the baseline — pokes above AND below the bar edge.
//   Muted red/pink. Must not clip against the top/bottom of the bar.
//
// Home tab points at /receipts today because that's still where the receipt
// list lives; Phase 3 will restyle that page as the real Home. Route stays
// the same so nothing else has to change.

const TABS_LEFT = [
  { to: '/receipts',  icon: Home,            label: 'Home',      activeColor: '#4ade80' },
  { to: '/dashboard', icon: BarChart2,       label: 'Dashboard', activeColor: '#60a5fa' },
] as const;

const TABS_RIGHT = [
  { to: '/export',   icon: FileSpreadsheet, label: 'Export',    activeColor: '#f97316' },
  { to: '/settings', icon: Settings,        label: 'Settings',  activeColor: '#94a3b8' },
] as const;

const SCAN_COLOR = '#e05a7d'; // muted red/pink per spec

export default function BottomNav() {
  const [scanOpen, setScanOpen] = useState(false);
  const queryClient = useQueryClient();

  function onSaved() {
    setScanOpen(false);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  return (
    <>
      {/* Bar itself. `overflow-visible` is critical — the oversized Scan
          icon needs to poke ABOVE the top edge without being clipped. */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border safe-bottom overflow-visible">
        <div className="relative flex items-end justify-around px-1 py-1.5 max-w-2xl mx-auto w-full">

          {TABS_LEFT.map(tab => <TabItem key={tab.to} {...tab} />)}

          {/* Center Scan tab — supersized, baseline-breaking.
              Wrapper is `items-end` in the parent flex so labels line up,
              but the icon uses negative margin-top to poke above the bar. */}
          <button
            onClick={() => setScanOpen(true)}
            aria-label="Scan receipt"
            className="flex flex-col items-center gap-0.5 rounded-lg transition-all -mt-6 pb-1"
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 56,
                height: 56,
                backgroundColor: `${SCAN_COLOR}22`,
                border: `1.5px solid ${SCAN_COLOR}88`,
              }}
            >
              <ScanLine size={30} strokeWidth={2} style={{ color: SCAN_COLOR }} />
            </span>
            <span className="text-[9px] font-medium tracking-wide text-white">Scan</span>
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
    <NavLink
      to={to}
      className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
    >
      {({ isActive }) => (
        <>
          <span className="relative inline-flex">
            <Icon
              size={20}
              strokeWidth={isActive ? 2.5 : 1.8}
              style={{ color: isActive ? activeColor : '#888888' }}
            />
            {/* Ambient sync-health dot lives on the Settings tab — Settings
                is where the pill / diagnostics / reconnect all live, so the
                dot naturally points users to the fix if it turns red. */}
            {to === '/settings' && <SyncHealthDot />}
          </span>
          <span className="text-[9px] font-medium tracking-wide text-white">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
