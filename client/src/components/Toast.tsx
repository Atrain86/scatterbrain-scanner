import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

/**
 * Small centered pill that fires on commit and auto-dismisses ~1.4s.
 * Positioned around 40% down from the top so it lands near the working area
 * (receipt card / sheet) rather than covering the tab bar.
 *
 * Usage: import { toast } and call toast('Saved') from anywhere.
 */

type ToastKind = 'success';

interface ToastPayload {
  id: number;
  message: string;
  kind: ToastKind;
}

let nextId = 1;
const listeners = new Set<(t: ToastPayload) => void>();

export function toast(message: string): void {
  const payload: ToastPayload = { id: nextId++, message, kind: 'success' };
  listeners.forEach(l => l(payload));
}

const DISPLAY_MS = 1400;
const FADE_MS = 180;

export function ToastHost() {
  const [items, setItems] = useState<(ToastPayload & { leaving?: boolean })[]>([]);

  useEffect(() => {
    function handler(t: ToastPayload) {
      setItems(prev => [...prev, t]);
      setTimeout(() => {
        setItems(prev => prev.map(it => it.id === t.id ? { ...it, leaving: true } : it));
      }, DISPLAY_MS);
      setTimeout(() => {
        setItems(prev => prev.filter(it => it.id !== t.id));
      }, DISPLAY_MS + FADE_MS);
    }
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (items.length === 0) return null;

  return createPortal(
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-none flex flex-col items-center gap-2"
      style={{ top: '40%' }}
    >
      {items.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-2 bg-sb-card border border-sb-green/40 text-white px-4 py-2 rounded-full shadow-2xl transition-all"
          style={{
            opacity: t.leaving ? 0 : 1,
            transform: t.leaving ? 'translateY(-4px)' : 'translateY(0)',
            transitionDuration: `${FADE_MS}ms`,
          }}
        >
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-sb-green/20">
            <Check size={10} className="text-sb-green" strokeWidth={3} />
          </span>
          <span className="text-sm">{t.message}</span>
        </div>
      ))}
    </div>,
    document.body
  );
}
