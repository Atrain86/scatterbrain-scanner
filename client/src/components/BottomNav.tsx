import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Receipt, BarChart2, FileSpreadsheet, Settings, ScanLine } from 'lucide-react';
import ScanModal from './ScanModal';
import { useQueryClient } from '@tanstack/react-query';
import SyncHealthDot from './SyncHealthDot';

const TABS = [
  { to: '/receipts',  icon: Receipt,        label: 'Receipts',  activeColor: '#4ade80' },
  { to: '/export',    icon: FileSpreadsheet, label: 'Export',    activeColor: '#f97316' },
  { to: '/dashboard', icon: BarChart2,       label: 'Dashboard', activeColor: '#60a5fa' },
  { to: '/settings',  icon: Settings,        label: 'Settings',  activeColor: '#94a3b8' },
] as const;

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
        <div className="flex items-center justify-around px-1 py-1.5 max-w-2xl mx-auto w-full">
          {/* Scan button — first */}
          <button
            onClick={() => setScanOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
          >
            <ScanLine size={20} strokeWidth={1.8} style={{ color: '#ec4899' }} />
            <span className="text-[9px] font-medium tracking-wide text-white">Scan</span>
          </button>

          {TABS.map(({ to, icon: Icon, label, activeColor }) => (
            <NavLink
              key={to}
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
                    {/* Ambient sync-health indicator lives on the Settings tab —
                        Settings is where the pill / diagnostics / reconnect all live,
                        so the dot naturally points users to the fix if it turns red. */}
                    {to === '/settings' && <SyncHealthDot />}
                  </span>
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
