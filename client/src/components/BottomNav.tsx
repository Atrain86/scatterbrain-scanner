import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Receipt, BarChart2, FileSpreadsheet, Settings, ScanLine, Home, FolderOpen } from 'lucide-react';
import ScanModal from './ScanModal';
import { useQueryClient } from '@tanstack/react-query';

// nav-restructure branch: always ON. Old code kept below for reference until merge.
// After merge to main, the old nav block will be deleted.
const NEW_NAV = true;

// ─── Old nav (4 route tabs + Scan at far left) ────────────────────────────────
const OLD_TABS = [
  { to: '/receipts',  icon: Receipt,        label: 'Receipts',  activeColor: '#4ade80' },
  { to: '/export',    icon: FileSpreadsheet, label: 'Export',    activeColor: '#f97316' },
  { to: '/dashboard', icon: BarChart2,       label: 'Dashboard', activeColor: '#60a5fa' },
  { to: '/settings',  icon: Settings,        label: 'Settings',  activeColor: '#94a3b8' },
] as const;

// ─── New nav — Home · Library · Scan · Export · Settings ──────────────────────
const NEW_LEFT_TABS = [
  { to: '/home',    icon: Home,       label: 'Home',    activeColor: '#4ade80' },
  { to: '/library', icon: FolderOpen, label: 'Library', activeColor: '#4ade80' },
] as const;
const NEW_RIGHT_TABS = [
  { to: '/export',   icon: FileSpreadsheet, label: 'Export',   activeColor: '#f97316' },
  { to: '/settings', icon: Settings,        label: 'Settings', activeColor: '#94a3b8' },
] as const;

const SCAN_COLOR = '#e05a7d';

export default function BottomNav() {
  const [scanOpen, setScanOpen] = useState(false);
  const queryClient = useQueryClient();

  function onSaved() {
    setScanOpen(false);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }

  if (NEW_NAV) {
    return (
      <>
        <nav className="fixed bottom-0 left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border safe-bottom">
          <div className="flex items-end justify-around px-1 py-1.5 max-w-2xl mx-auto w-full">
            {NEW_LEFT_TABS.map(({ to, icon: Icon, label, activeColor }) => (
              <NavLink
                key={to}
                to={to}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={22}
                      strokeWidth={isActive ? 2.5 : 1.8}
                      style={{ color: isActive ? activeColor : '#888888' }}
                    />
                    <span className="text-[9px] font-medium tracking-wide text-white">{label}</span>
                  </>
                )}
              </NavLink>
            ))}

            {/* Center Scan — larger icon, muted pink, plain tab (no FAB/circle) */}
            <button
              onClick={() => setScanOpen(true)}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
            >
              <ScanLine size={30} strokeWidth={1.8} style={{ color: SCAN_COLOR }} />
              <span className="text-[9px] font-medium tracking-wide text-white">Scan</span>
            </button>

            {NEW_RIGHT_TABS.map(({ to, icon: Icon, label, activeColor }) => (
              <NavLink
                key={to}
                to={to}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={22}
                      strokeWidth={isActive ? 2.5 : 1.8}
                      style={{ color: isActive ? activeColor : '#888888' }}
                    />
                    <span className="text-[9px] font-medium tracking-wide text-white">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {scanOpen && <ScanModal onClose={() => setScanOpen(false)} onSaved={onSaved} />}
      </>
    );
  }

  // ─── Old nav (default) ──────────────────────────────────────────────────────
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border safe-bottom">
        <div className="flex items-center justify-around px-1 py-1.5 max-w-2xl mx-auto w-full">
          <button
            onClick={() => setScanOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
          >
            <ScanLine size={20} strokeWidth={1.8} style={{ color: '#ec4899' }} />
            <span className="text-[9px] font-medium tracking-wide text-white">Scan</span>
          </button>

          {OLD_TABS.map(({ to, icon: Icon, label, activeColor }) => (
            <NavLink
              key={to}
              to={to}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    style={{ color: isActive ? activeColor : '#888888' }}
                  />
                  <span className="text-[9px] font-medium tracking-wide text-white">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {scanOpen && (
        <ScanModal onClose={() => setScanOpen(false)} onSaved={onSaved} />
      )}
    </>
  );
}
