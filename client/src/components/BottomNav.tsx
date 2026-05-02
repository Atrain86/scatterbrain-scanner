import { NavLink } from 'react-router-dom';
import { Receipt, BarChart2, FileSpreadsheet, Settings } from 'lucide-react';

const TABS = [
  { to: '/receipts',  icon: Receipt,        label: 'Receipts'  },
  { to: '/dashboard', icon: BarChart2,       label: 'Dashboard' },
  { to: '/export',    icon: FileSpreadsheet, label: 'Export'    },
  { to: '/settings',  icon: Settings,        label: 'Settings'  },
] as const;

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-sb-bg/95 backdrop-blur-sm border-t border-sb-border safe-bottom">
      <div className="flex items-center justify-around px-1 py-1.5">
        {TABS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-5 py-1 rounded-lg transition-all ${
                isActive ? 'text-sb-green' : 'text-sb-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[9px] font-medium tracking-wide">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
