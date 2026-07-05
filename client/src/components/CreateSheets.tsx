import { useEffect, useRef, useState } from 'react';
import BottomSheet from './BottomSheet';
import { toast } from './Toast';
import { addClient } from '../utils/clients';
import { addCategory } from '../utils/categories';

// Category color palette — mirrors the Settings palette but pared down to a
// clean 6-across grid, spec-driven size.
const PALETTE: string[] = [
  '#4ECDC4', '#F44747', '#4ade80', '#60a5fa', '#eab308', '#a855f7',
  '#EC4899', '#7C3AED', '#2DD4BF', '#DC143C', '#84CC16', '#0C87C1',
];

// ─── New Client sheet ────────────────────────────────────────────────────────
interface ClientSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  /** Called with the created client name so caller can also select it. */
  onCreated?: (name: string) => void;
}

export function CreateClientSheet({ open, onClose, userId, onCreated }: ClientSheetProps) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(''); setErr('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Give your client a name'); return; }
    addClient(userId, trimmed);
    toast('Client created');
    onCreated?.(trimmed);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-6 pt-2 pb-6">
        <h2 className="text-white text-lg font-semibold mb-1">New client</h2>
        <p className="text-sb-muted text-sm mb-5">Give your client a name.</p>

        <label className="block text-[10px] uppercase tracking-wider text-sb-muted mb-2">Name</label>
        <input
          ref={inputRef}
          value={name}
          onChange={e => { setName(e.target.value); if (err) setErr(''); }}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          placeholder="Client name"
          className="w-full bg-sb-card2 border border-sb-border rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-sb-green transition"
        />
        {err && <p className="text-red-400 text-xs mt-2">{err}</p>}

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl border border-white/15 text-sb-muted hover:text-white hover:bg-white/5 text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={commit}
            className="flex-1 py-3 rounded-xl bg-sb-green text-black text-sm font-semibold hover:brightness-110 transition active:scale-[0.98]"
          >
            Create
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── New Category sheet ──────────────────────────────────────────────────────
interface CategorySheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  onCreated?: (name: string) => void;
}

export function CreateCategorySheet({ open, onClose, userId, onCreated }: CategorySheetProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(''); setErr(''); setColor(PALETTE[0]);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Name it something'); return; }
    addCategory(userId, trimmed, color);
    toast('Category created');
    onCreated?.(trimmed);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-6 pt-2 pb-6">
        <h2 className="text-white text-lg font-semibold mb-1">New category</h2>
        <p className="text-sb-muted text-sm mb-5">Name it and pick a color.</p>

        <label className="block text-[10px] uppercase tracking-wider text-sb-muted mb-2">Name</label>
        <input
          ref={inputRef}
          value={name}
          onChange={e => { setName(e.target.value); if (err) setErr(''); }}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          placeholder="Category name"
          className="w-full bg-sb-card2 border border-sb-border rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-sb-green transition"
        />
        {err && <p className="text-red-400 text-xs mt-2">{err}</p>}

        <div className="flex items-center justify-between mt-6 mb-2">
          <label className="block text-[10px] uppercase tracking-wider text-sb-muted">Color</label>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-sb-muted">Selected</span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          {PALETTE.map(c => {
            const active = c === color;
            return (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="rounded-full flex items-center justify-center transition"
                style={{ width: 44, height: 44 }}
                aria-label={`Pick color ${c}`}
              >
                <span
                  className={`rounded-full transition ${active ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-sb-card' : ''}`}
                  style={{ backgroundColor: c, width: 36, height: 36 }}
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl border border-white/15 text-sb-muted hover:text-white hover:bg-white/5 text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={commit}
            className="flex-1 py-3 rounded-xl bg-sb-green text-black text-sm font-semibold hover:brightness-110 transition active:scale-[0.98]"
          >
            Create
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
