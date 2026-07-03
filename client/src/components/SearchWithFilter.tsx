import { useEffect, useRef } from 'react';
import { Search, X, Filter, Check } from 'lucide-react';
import { getAllCategories } from '../utils/types';

interface Props {
  value: string;
  onChange: (v: string) => void;
  category: string | null;
  onCategoryChange: (v: string | null) => void;
  catOpen: boolean;
  setCatOpen: (v: boolean) => void;
  userId: string;
  /** Optional: categories with recent activity, shown first in the picker. */
  prioritizedCategories?: string[];
  /** Optional placeholder text (default: "Search…") */
  placeholder?: string;
}

/**
 * Unified search + category filter input used across Home and Library.
 * Search icon left, "Search…" input middle, funnel + category chip right,
 * dropdown category picker anchored to the chip.
 */
export default function SearchWithFilter({
  value, onChange, category, onCategoryChange, catOpen, setCatOpen, userId,
  prioritizedCategories = [], placeholder = 'Search…',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setCatOpen(false);
    }
    if (catOpen) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [catOpen, setCatOpen]);

  const allCats = getAllCategories(userId);
  const orderedCats = [
    ...prioritizedCategories,
    ...allCats.map(c => c.name).filter(n => !prioritizedCategories.includes(n)),
  ];

  return (
    <div ref={ref} className="relative bg-sb-card2 border border-sb-border rounded-xl h-11 flex items-center">
      <Search size={15} className="ml-3 text-white/40 flex-shrink-0" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent px-3 text-sm text-white placeholder-white/40 focus:outline-none h-full"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-white/40 hover:text-white p-1 mr-1">
          <X size={14} />
        </button>
      )}
      <button
        onClick={() => setCatOpen(!catOpen)}
        className={`flex items-center gap-1 mr-1.5 px-2.5 h-8 rounded-lg text-[12px] transition ${category ? 'bg-sb-green/15 text-sb-green' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
      >
        <Filter size={12} />
        {category ?? 'All'}
      </button>

      {catOpen && (
        <div className="absolute right-1 top-full mt-1 w-52 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-30 shadow-2xl">
          <button
            onClick={() => { onCategoryChange(null); setCatOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-white/5 ${!category ? 'text-sb-green' : 'text-white'}`}
          >
            <Filter size={11} /> All categories
            {!category && <Check size={11} className="ml-auto text-sb-green" />}
          </button>
          <div className="border-t border-sb-border max-h-64 overflow-y-auto">
            {orderedCats.map(name => {
              const c = allCats.find(a => a.name === name);
              const color = c?.color ?? '#6B7280';
              return (
                <button
                  key={name}
                  onClick={() => { onCategoryChange(name); setCatOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-white/5 ${category === name ? 'bg-white/5' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="flex-1 text-white">{name}</span>
                  {category === name && <Check size={11} className="text-sb-green" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
