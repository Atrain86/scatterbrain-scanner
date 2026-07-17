import { useState, useRef, useEffect } from 'react';
import { Funnel } from 'lucide-react';
import { useFilter, type PaymentFilter } from '../contexts/FilterContext';
import { useAuth } from '../contexts/AuthContext';
import { getAllCategories } from '../utils/types';

// Payment pill colours — muted, not money-lime. Each segment is its own
// pill: inactive = dim border, no fill. Active = coloured border + faint tint.
const PILL_STYLES: Record<PaymentFilter, { border: string; bg: string }> = {
  All:   { border: '#b0aabf', bg: 'rgba(176,170,191,0.13)' },
  Debit: { border: '#6ea882', bg: 'rgba(110,168,130,0.15)' },
  Visa:  { border: '#5a7fc4', bg: 'rgba(90,127,196,0.15)'  },
};

const PAYMENT_OPTIONS: PaymentFilter[] = ['All', 'Debit', 'Visa'];

export default function FilterBand() {
  const { search, setSearch, categoryFilter, setCategoryFilter, paymentFilter, setPaymentFilter } = useFilter();
  const { user } = useAuth();
  const [showCatPicker, setShowCatPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const categories = user ? getAllCategories(user.id) : [];

  // Close picker on outside tap
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
    : '#d9c15c'; // mustard

  return (
    <div
      className="fixed left-0 right-0 z-20"
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: '#000',
        padding: '9px 10px 8px',
      }}
    >
      <div className="flex items-center gap-2 max-w-2xl mx-auto w-full">

        {/* Search field — flex-1 */}
        <div className="relative flex-1 min-w-0">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search store, client, items…"
            className="w-full text-white placeholder-white/35 focus:outline-none"
            style={{
              background: '#1c1c30',
              borderRadius: 11,
              padding: '7px 36px 7px 12px',
              fontSize: 11.5,
              border: 'none',
            }}
          />
          {/* Mustard funnel inside field at right edge */}
          <div className="relative flex-shrink-0" ref={pickerRef}>
            <button
              onClick={() => setShowCatPicker(p => !p)}
              aria-label={categoryFilter ? `Filtered by ${categoryFilter}` : 'Filter by category'}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center transition active:scale-90"
              style={{ width: 26, height: 26 }}
            >
              <Funnel
                size={14}
                strokeWidth={1.75}
                style={{
                  color: funnelColor,
                  fill: categoryFilter ? funnelColor : 'transparent',
                }}
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
        </div>

        {/* Payment toggle — three separate pills */}
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
    </div>
  );
}
