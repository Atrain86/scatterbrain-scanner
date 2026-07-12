import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, BarChart2, FileSpreadsheet, Settings, Camera } from 'lucide-react';
import ScanModal from './ScanModal';
import { useQueryClient } from '@tanstack/react-query';
import SyncHealthDot from './SyncHealthDot';

// Phase 2 nav (redesign spec — updated per Alan's device feedback):
//
//   Order:   Home · Dashboard · Scan · Export · Settings
//   Colors:  blue · purple · pink (scan) · green · silver
//   Scan =   semi-transparent pink circle, ~56px (roughly 2.5× the side icons).
//            The word "Scan" in silver (matching other tab icon color), 500wt,
//            centered inside the circle. No icon, no separate label beneath.
//   Scan is VERTICALLY CENTERED on the nav baseline — a horizontal line
//            through the centers of the other four tab icons passes through
//            the center of the Scan circle. It sits ON the baseline, not
//            poking up like a FAB. Extends equally above and below.
//
// Home tab still points at /receipts today — the route stays the same;
// Phase 3 will restyle that page as the real Home.

const TABS_LEFT = [
  { to: '/receipts',  icon: Home,      label: 'Home',      activeColor: '#60a5fa' }, // blue
  { to: '/dashboard', icon: BarChart2, label: 'Dashboard', activeColor: '#a855f7' }, // purple
] as const;

const TABS_RIGHT = [
  { to: '/export',   icon: FileSpreadsheet, label: 'Export',   activeColor: '#4ade80' }, // green
  { to: '/settings', icon: Settings,        label: 'Settings', activeColor: '#94a3b8' }, // silver
] as const;

// Scan circle — soft green fill (matches Alan's iOS-style reference),
// deep-green perimeter, subtle outer halo. Camera icon in white.
const SCAN_BORDER   = '#2f6e3f'; // deep forest green — distinct edge vs fill
const SCAN_FILL     = 'rgba(126,199,132,0.70)'; // #7ec784 @ 70%
const SCAN_LABEL    = '#ffffff';
const SCAN_HALO     = 'rgba(126,199,132,0.35)';

export default function BottomNav() {
  const [scanOpen, setScanOpen] = useState(false);
  const queryClient = useQueryClient();

  function onSaved() {
    setScanOpen(false);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border safe-bottom">
        {/*
          items-center on the flex row aligns the icons (20px), the labels
          (9px), and the Scan circle (56px) all to the row's vertical mid-line.
          The other tabs are column-flex; their icon sits at their top and the
          label below. The Scan tab is NOT column-flex — the whole tab IS the
          circle, so it centers cleanly on the same mid-line as the other
          icons.
        */}
        <div className="relative flex items-center justify-around px-1 py-2.5 max-w-2xl mx-auto w-full">

          {TABS_LEFT.map(tab => <TabItem key={tab.to} {...tab} />)}

          {/* Center Scan tab — baseline-centered pink circle with silver "Scan" text. */}
          <button
            onClick={() => setScanOpen(true)}
            aria-label="Scan receipt"
            className="flex items-center justify-center rounded-full transition-all active:scale-95"
            style={{
              width: 56,
              height: 56,
              backgroundColor: SCAN_FILL,
              border: `2.5px solid ${SCAN_BORDER}`,
              boxShadow: `0 0 14px 2px ${SCAN_HALO}`,
            }}
          >
            <Camera size={24} strokeWidth={2} style={{ color: SCAN_LABEL }} />
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
              size={22}
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
