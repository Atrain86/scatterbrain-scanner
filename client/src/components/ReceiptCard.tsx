import { useState, useRef, useEffect } from 'react';
import { Trash2, Check, Pencil, Image as ImageIcon, X, Plus, ZoomIn, ZoomOut, ChevronDown, CreditCard } from 'lucide-react';
import type { Receipt } from '../utils/types';
import { getAllCategories, getCategoryColorDynamic } from '../utils/types';
import { isTaxLine, computeReceiptTotals, fmt } from '../utils/taxCalc';
import { loadClients, addClient, setLastClient } from '../utils/clients';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from './ShareModal';
import { addReceipt } from '../lib/db';
import { pushReceiptNow } from '../lib/cloudSync';
import { getPaymentMethods, getStoreDefaults, saveStoreDefaults, normalizeStoreName } from '../lib/paymentStorage';
import CardNameSheet from './CardNameSheet';
import BottomSheet from './BottomSheet';
import {
  CategoryRenameSheet,
  ClientRenameSheet,
  CategoryDeleteSheet,
  ClientDeleteSheet,
} from './RenameDeleteSheets';

interface ReEditUpdates {
  storeName: string;
  lineItems: string;
  taxLines: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  clientName: string | null;
  category: string;
  receiptDate?: string;
}

interface Props {
  receipt: Receipt;
  onDelete: (id: number) => void;
  onUpdateCategory: (id: number, category: string) => void;
  onUpdatePayment?: (id: number, paymentMethod: string | null, source: 'manual' | null) => void;
  onReEdit: (id: number, updates: ReEditUpdates) => void;
  onNewReceipt?: (r: Receipt) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  // Deep-link support (from Dashboard scoped list). When true, the card
  // expands on mount and scrolls itself into view. One-shot — the parent
  // clears this flag after the URL param is consumed.
  autoExpand?: boolean;
}

// Standard iOS-style share arrow: box with upward arrow
function ShareArrow({ size = 16, color = '#3b82f6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// Inline client picker dropdown (reusable for split mode)
function ClientPicker({
  value, userId, onChange,
}: { value: string | null; userId: string; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState(() => loadClients(userId));
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function pick(name: string | null) { onChange(name); setOpen(false); setInput(''); }

  function addNew() {
    const t = input.trim(); if (!t) return;
    const updated = addClient(userId, t); setClients(updated); pick(t);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(p => !p); }}
        className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border whitespace-nowrap transition hover:brightness-125"
        style={value
          ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)' }
          : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#6b7280', borderColor: 'rgba(255,255,255,0.1)' }
        }
      >
        {value || '+ client'}<ChevronDown size={7} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-50 shadow-2xl">
          <button onClick={() => pick(null)} className="w-full px-3 py-2 text-xs text-left text-sb-muted hover:bg-white/5 flex items-center gap-2">
            <X size={9} /> No client
          </button>
          {clients.length > 0 && <div className="border-t border-sb-border" />}
          <div className="max-h-32 overflow-y-auto">
            {clients.map(c => (
              <button key={c} onClick={() => pick(c)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/5 ${c === value ? 'bg-white/5' : ''}`}>
                <span className="text-white">{c}</span>
                {c === value && <Check size={9} className="text-sb-green" />}
              </button>
            ))}
          </div>
          <div className="border-t border-sb-border px-2 py-1.5 flex gap-1">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addNew(); }}
              onClick={e => e.stopPropagation()}
              placeholder="+ new client"
              className="flex-1 bg-transparent border-b border-sb-border text-[10px] text-white placeholder-white/30 focus:outline-none focus:border-sb-green py-0.5" />
            <button onClick={e => { e.stopPropagation(); addNew(); }} disabled={!input.trim()}
              className="text-sb-green disabled:opacity-30"><Plus size={11} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline category picker dropdown (reusable for split mode)
function CatPicker({
  value, userId, onChange,
}: { value: string; userId: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const color = getCategoryColorDynamic(value, userId);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function pick(name: string) { onChange(name); setOpen(false); setInput(''); }

  function addNew() {
    const t = input.trim(); if (!t) return;
    const all = getAllCategories(userId);
    const existing = all.find(c => c.name.toLowerCase() === t.toLowerCase());
    if (existing) { pick(existing.name); return; }
    const key = `sb_u${userId}_custom_categories`;
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([...stored, { name: t, color: '#6B7280' }]));
    pick(t);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(p => !p); }}
        className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap transition hover:brightness-125"
        style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
      >
        {value || '+ cat'}<ChevronDown size={7} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-50 shadow-2xl">
          <div className="max-h-44 overflow-y-auto">
            {getAllCategories(userId).map(cat => (
              <button key={cat.name} onClick={() => pick(cat.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/5 ${cat.name === value ? 'bg-white/5' : ''}`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-white flex-1">{cat.name}</span>
                {cat.name === value && <Check size={9} className="text-sb-green" />}
              </button>
            ))}
          </div>
          <div className="border-t border-sb-border px-2 py-1.5 flex gap-1">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addNew(); }}
              onClick={e => e.stopPropagation()}
              placeholder="+ new category"
              className="flex-1 bg-transparent border-b border-sb-border text-[10px] text-white placeholder-white/30 focus:outline-none focus:border-sb-green py-0.5" />
            <button onClick={e => { e.stopPropagation(); addNew(); }} disabled={!input.trim()}
              className="text-sb-green disabled:opacity-30"><Plus size={11} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReceiptCard({ receipt, onDelete, onUpdateCategory, onUpdatePayment, onReEdit, onNewReceipt, selectMode, selected, onToggleSelect, autoExpand }: Props) {
  const { user } = useAuth();
  const userId = user!.id;

  const [expanded,         setExpanded]         = useState(!!autoExpand);
  const rootRef                                  = useRef<HTMLDivElement>(null);
  // One-shot deep-link: scroll into view when the parent hands us autoExpand.
  useEffect(() => {
    if (!autoExpand) return;
    setExpanded(true);
    const t = setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => clearTimeout(t);
  }, [autoExpand]);
  const [editingStore,     setEditingStore]     = useState(false);
  const [editStore,        setEditStore]        = useState(receipt.storeName);
  const [editingItems,     setEditingItems]     = useState(false);
  const [splitMode,        setSplitMode]        = useState(false);
  const [imgFullscreen,    setImgFullscreen]    = useState(false);
  const [shareOpen,        setShareOpen]        = useState(false);
  const [confirmDelete,    setConfirmDelete]    = useState(false);
  const [showCatPicker,     setShowCatPicker]     = useState(false);
  const [showClientPicker,  setShowClientPicker]  = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showCardSheet,     setShowCardSheet]     = useState(false);
  // Context for the card sheet: whether to pre-fill with receipt.last4
  const [cardSheetLast4,    setCardSheetLast4]    = useState<string | null>(null);
  const [cardSheetNetwork,  setCardSheetNetwork]  = useState<string | null>(null);
  // Store default checkbox — only show when source is null (no last4 from OCR)
  const [storeDefaultLabel, setStoreDefaultLabel] = useState<string | null>(null);
  const [clients,          setClients]          = useState<string[]>(() => loadClients(userId));
  const [newClientInput,   setNewClientInput]   = useState('');
  const [newCatInput,      setNewCatInput]      = useState('');
  const [showNewClientSheet, setShowNewClientSheet] = useState(false);
  const [showNewCatSheet,    setShowNewCatSheet]    = useState(false);

  // Rename / delete sheet targets
  const [clientRenameTarget, setClientRenameTarget] = useState<string | null>(null);
  const [catRenameTarget,    setCatRenameTarget]    = useState<string | null>(null);
  const [clientDeleteTarget, setClientDeleteTarget] = useState<string | null>(null);
  const [catDeleteTarget,    setCatDeleteTarget]    = useState<string | null>(null);

  const allLineItems: { description: string; amount: number }[] = receipt.lineItems
    ? JSON.parse(receipt.lineItems) : [];

  // Pencil mode — all non-tax items checked by default
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => {
    const saved: { description: string; amount: number }[] = receipt.lineItems
      ? JSON.parse(receipt.lineItems) : [];
    const savedDescs = new Set(saved.filter(i => !isTaxLine(i.description)).map(i => i.description));
    const s = new Set<number>();
    allLineItems.forEach((item, i) => {
      if (!isTaxLine(item.description) && savedDescs.has(item.description)) s.add(i);
    });
    return s;
  });

  // Split mode — per-item client + category assignments
  const [splitChecked,   setSplitChecked]   = useState<Set<number>>(new Set());
  const [splitClients,   setSplitClients]   = useState<Record<number, string | null>>({});
  const [splitCats,      setSplitCats]      = useState<Record<number, string>>({});

  const catPickerRef    = useRef<HTMLDivElement>(null);
  const clientPickerRef = useRef<HTMLDivElement>(null);
  const storeInputRef   = useRef<HTMLInputElement>(null);

  const catColor     = getCategoryColorDynamic(receipt.category, userId);
  const productItems = allLineItems.filter(i => !isTaxLine(i.description));
  const taxItems     = allLineItems.filter(i =>  isTaxLine(i.description));

  const liveTotals   = computeReceiptTotals(allLineItems, checkedItems);

  // Split totals: items assigned to new receipt
  const splitIndices = new Set(
    [...splitChecked].filter(i => !isTaxLine(allLineItems[i]?.description ?? ''))
  );
  const splitTotals  = computeReceiptTotals(allLineItems, splitIndices);
  // Remaining (original) indices = all product items NOT in split
  const remainIndices = new Set(
    allLineItems.map((_, i) => i).filter(i => !isTaxLine(allLineItems[i].description) && !splitChecked.has(i))
  );
  const remainTotals  = computeReceiptTotals(allLineItems, remainIndices);

  const dateDisplay = new Date(receipt.receiptDate + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const anyPickerOpen = showCatPicker || showClientPicker || showPaymentPicker;
  const anyEditActive = editingStore || editingItems || splitMode || anyPickerOpen;

  useEffect(() => {
    if (editingStore) {
      setEditStore(receipt.storeName);
      setTimeout(() => storeInputRef.current?.focus(), 50);
    }
  }, [editingStore, receipt.storeName]);

  useEffect(() => {
    // Use `click` (fires after the tap sequence completes, and after any
    // React state updates from the option button's own click handler have
    // already been queued) instead of `mousedown` (which on iOS Safari fires
    // DURING the tap sequence and the state change it triggers can cancel
    // the subsequent click on a picker option before it reaches React).
    //
    // The trade-off: `click` fires slightly later, so there's a small window
    // where the outside-click handler runs after the option's click handler.
    // That's fine — option handlers already call setShowXPicker(false), and
    // idempotent state updates are cheap.
    function handleOutsideClick(e: MouseEvent) {
      if (showCatPicker && catPickerRef.current && !catPickerRef.current.contains(e.target as Node))
        setShowCatPicker(false);
      if (showClientPicker && clientPickerRef.current && !clientPickerRef.current.contains(e.target as Node))
        setShowClientPicker(false);
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [showCatPicker, showClientPicker]);

  function saveStoreName() {
    const trimmed = editStore.trim();
    if (trimmed && trimmed !== receipt.storeName) {
      onReEdit(receipt.id, {
        storeName: trimmed, lineItems: receipt.lineItems ?? '[]',
        taxLines: receipt.taxLines ?? '[]', subtotal: receipt.subtotal,
        taxAmount: receipt.taxAmount, total: receipt.total,
        clientName: receipt.clientName, category: receipt.category,
      });
    }
    setEditingStore(false);
  }

  function pickCategory(name: string) {
    onUpdateCategory(receipt.id, name);
    setShowCatPicker(false);
    setNewCatInput('');
  }

  function addNewCategory() {
    const trimmed = newCatInput.trim(); if (!trimmed) return;
    const all = getAllCategories(userId);
    if (all.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      pickCategory(all.find(c => c.name.toLowerCase() === trimmed.toLowerCase())!.name); return;
    }
    const key = `sb_u${userId}_custom_categories`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([...existing, { name: trimmed, color: '#6B7280' }]));
    pickCategory(trimmed);
  }

  function pickClient(name: string) {
    setLastClient(userId, name);
    onReEdit(receipt.id, {
      storeName: receipt.storeName, lineItems: receipt.lineItems ?? '[]',
      taxLines: receipt.taxLines ?? '[]', subtotal: receipt.subtotal,
      taxAmount: receipt.taxAmount, total: receipt.total,
      clientName: name || null, category: receipt.category,
    });
    setShowClientPicker(false);
    setNewClientInput('');
  }

  function addNewClient() {
    const trimmed = newClientInput.trim(); if (!trimmed) return;
    const updated = addClient(userId, trimmed);
    setClients(updated);
    pickClient(trimmed);
  }

  function saveItems() {
    const selectedProducts = allLineItems.filter((item, i) =>
      !isTaxLine(item.description) && checkedItems.has(i)
    );
    onReEdit(receipt.id, {
      storeName: receipt.storeName,
      lineItems: JSON.stringify([...selectedProducts, ...taxItems]),
      taxLines: JSON.stringify(liveTotals.proportionalTaxes),
      subtotal: liveTotals.selectedSubtotal,
      taxAmount: liveTotals.totalTax,
      total: liveTotals.total,
      clientName: receipt.clientName,
      category: receipt.category,
    });
    setEditingItems(false);
  }

  function enterPencilMode() {
    // Reset checked to current saved items
    const saved: { description: string; amount: number }[] = receipt.lineItems
      ? JSON.parse(receipt.lineItems) : [];
    const savedDescs = new Set(saved.filter(i => !isTaxLine(i.description)).map(i => i.description));
    const s = new Set<number>();
    allLineItems.forEach((item, idx) => {
      if (!isTaxLine(item.description) && savedDescs.has(item.description)) s.add(idx);
    });
    setCheckedItems(s);
    setEditingItems(true);
    setEditingStore(true);
  }

  function enterSplitMode() {
    setSplitChecked(new Set());
    setSplitClients({});
    // Default split items to same category as receipt
    const defaults: Record<number, string> = {};
    allLineItems.forEach((item, i) => { if (!isTaxLine(item.description)) defaults[i] = receipt.category; });
    setSplitCats(defaults);
    setSplitMode(true);
    setEditingItems(false);
  }

  async function saveSplit() {
    if (splitChecked.size === 0) { setSplitMode(false); return; }

    // Determine the primary client/category for the new receipt
    // Use the most common assigned client among split items, or receipt default
    const splitClientCounts: Record<string, number> = {};
    splitChecked.forEach(i => {
      const c = splitClients[i] ?? receipt.clientName ?? '';
      splitClientCounts[c] = (splitClientCounts[c] || 0) + 1;
    });
    const newClient = Object.entries(splitClientCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const splitCatCounts: Record<string, number> = {};
    splitChecked.forEach(i => {
      const c = splitCats[i] ?? receipt.category;
      splitCatCounts[c] = (splitCatCounts[c] || 0) + 1;
    });
    const newCat = Object.entries(splitCatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || receipt.category;

    const splitProducts = allLineItems.filter((item, i) =>
      !isTaxLine(item.description) && splitChecked.has(i)
    );

    // 1. Update original receipt — remove split items
    const remainProducts = allLineItems.filter((item, i) =>
      !isTaxLine(item.description) && !splitChecked.has(i)
    );
    onReEdit(receipt.id, {
      storeName: receipt.storeName,
      lineItems: JSON.stringify([...remainProducts, ...taxItems]),
      taxLines: JSON.stringify(remainTotals.proportionalTaxes),
      subtotal: remainTotals.selectedSubtotal,
      taxAmount: remainTotals.totalTax,
      total: remainTotals.total,
      clientName: receipt.clientName,
      category: receipt.category,
    });

    // 2. Create new receipt for split items
    const newReceipt = await addReceipt(userId, {
      storeName: receipt.storeName,
      receiptDate: receipt.receiptDate,
      lineItems: JSON.stringify([...splitProducts, ...taxItems]),
      rawLineItems: receipt.rawLineItems ?? null,
      taxLines: JSON.stringify(splitTotals.proportionalTaxes),
      subtotal: splitTotals.selectedSubtotal,
      taxAmount: splitTotals.totalTax,
      total: splitTotals.total,
      clientName: newClient || null,
      category: newCat,
      imagePath:           receipt.imagePath ?? null,
      imageUrl:            receipt.imageUrl ?? null,
      notes:               receipt.notes ?? null,
      paymentMethod:       receipt.paymentMethod ?? null,
      last4:               receipt.last4 ?? null,
      paymentMethodSource: receipt.paymentMethodSource ?? null,
      uuid:          crypto.randomUUID(),
      updatedAt:     new Date().toISOString(),
      createdAt:     new Date().toISOString(),
    });

    pushReceiptNow(newReceipt, userId).catch(err => {
      console.error('[Drive push split] failed:', err);
    });
    onNewReceipt?.(newReceipt);
    setSplitMode(false);
  }

  // ── Collapsed row body — calm, flat style ────────────────────────────────
  // Line 1: category dot · store name · (dim silver) category name
  // Line 2: (dim) client · date
  // No filled pills, no colored client badge — just a small dot and quiet text.
  function CollapsedBadges() {
    return (
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: catColor }}
            aria-hidden="true"
          />
          <p
            className="text-white font-semibold text-[15px] leading-tight truncate"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            {receipt.storeName || 'Unknown Store'}
          </p>
          {receipt.category && (
            <span className="text-[11px] text-white/45 leading-none truncate">
              {receipt.category}
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/40 leading-snug mt-1 truncate" style={{ paddingLeft: 16 }}>
          {receipt.clientName ? `${receipt.clientName}  ·  ${dateDisplay}` : dateDisplay}
        </p>
      </div>
    );
  }

  return (
    <>
      <div ref={rootRef} className={`transition-colors border-b border-white/[0.05] ${expanded ? 'bg-sb-card rounded-xl border border-sb-border mb-1' : selected ? 'bg-sb-green/5' : ''} overflow-visible`}>

        {/* ── Collapsed row — flat, calm ── */}
        {!expanded && (
          <div
            className="flex items-stretch gap-0 cursor-pointer active:bg-white/[0.04] hover:bg-white/[0.02] transition"
            onClick={() => selectMode ? onToggleSelect?.(receipt.id) : setExpanded(true)}
          >
            <div className={`flex items-center justify-center transition-all duration-200 overflow-hidden ${selectMode ? 'w-9 opacity-100' : 'w-0 opacity-0'}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-sb-green border-sb-green' : 'border-sb-muted bg-transparent'}`}>
                {selected && <Check size={11} className="text-black" strokeWidth={3} />}
              </div>
            </div>
            <CollapsedBadges />
            <div className="flex flex-col items-end justify-between pr-3 pl-2 py-2.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <span className="text-sb-green font-bold text-[15px] leading-tight">${receipt.total.toFixed(2)}</span>
              <div className="flex items-center gap-1.5 mt-1">
                {receipt.paymentMethod && (
                  <span
                    className="text-[11px] flex-shrink-0"
                    style={{ color: '#b0aabf', maxWidth: '12ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {receipt.paymentMethod}
                  </span>
                )}
                {confirmDelete ? (
                  <button onClick={() => { onDelete(receipt.id); setConfirmDelete(false); }} onBlur={() => setConfirmDelete(false)}
                    className="text-red-400 bg-red-950/30 rounded p-0.5 transition"><Trash2 size={16} /></button>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                    className="text-white hover:text-red-400 transition p-0.5"><Trash2 size={16} /></button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Expanded detail ──
            Background tap = smart close. Any tap on inert padding/background
            (via handleBgTap on the currentTarget) FIRST exits pencil/split/
            picker modes if active; if none, collapses the card. Only fires
            when the tap TARGET IS the padded background element itself, not
            a bubbled click from a button — so buttons don't need per-button
            stopPropagation calls.
        */}
        {expanded && (() => {
          // Smart background tap. Fires ONLY if the tap didn't land on (or
          // inside) an interactive element (button, input, textarea, or
          // anything with data-interactive="true"). This is more permissive
          // than e.target === e.currentTarget — a tap on plain <span> text
          // in a row correctly counts as a background tap.
          const handleBgTap = (e: React.MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('button, input, textarea, [data-interactive="true"]')) return;
            if (editingStore)   { setEditingStore(false); return; }
            if (editingItems)   { setEditingItems(false); return; }
            if (splitMode)      { setSplitMode(false); return; }
            if (showClientPicker)  { setShowClientPicker(false);  return; }
            if (showCatPicker)     { setShowCatPicker(false);     return; }
            if (showPaymentPicker) { setShowPaymentPicker(false); return; }
            setExpanded(false);
          };
        return (
          <div className="animate-fade-in" onClick={handleBgTap}>

            {/* Tap-to-close strip at top — also smart-close on the strip itself */}
            <div className="flex justify-center pt-2 pb-0 cursor-pointer" onClick={handleBgTap}>
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* ── Header ──
                Both wrappers (the outer padded div AND the flex row) attach
                handleBgTap so taps on the empty gap between store name and
                client/category badges close/exit-edit. Buttons inside handle
                their own clicks — because e.target !== e.currentTarget, the
                tap won't fall through.
            */}
            <div className="px-3 pt-2 pb-2.5" onClick={handleBgTap}>

              {/* Line 1: store name · client · category · trash */}
              <div className="flex items-center gap-1.5 min-w-0 mb-1.5" onClick={handleBgTap}>
                <div className="flex-1 min-w-0">
                  {editingStore ? (
                    <input ref={storeInputRef} value={editStore}
                      onChange={e => setEditStore(e.target.value)}
                      onBlur={saveStoreName}
                      onKeyDown={e => { if (e.key === 'Enter') saveStoreName(); if (e.key === 'Escape') setEditingStore(false); }}
                      className="w-full bg-transparent border-b border-sb-green text-white font-bold text-sm focus:outline-none pb-0.5"
                      style={{ fontFamily: "'Poppins', sans-serif" }} />
                  ) : (
                    <span className="text-white font-bold text-sm leading-tight truncate block"
                      style={{ fontFamily: "'Poppins', sans-serif" }}>
                      {receipt.storeName || 'Unknown Store'}
                    </span>
                  )}
                </div>

                {/* Payment method badge */}
                {(() => {
                  const cards = getPaymentMethods(userId);
                  // Check if receipt.last4 has an unrecognised card (for "Name card" option)
                  const unknownLast4 =
                    receipt.last4 &&
                    !cards.some(c => c.last4 === receipt.last4);

                  // Store default checkbox logic: show when source is null AND a method selected
                  const showStoreDefault =
                    !receipt.last4 &&
                    (receipt.paymentMethodSource == null || receipt.paymentMethodSource !== 'manual') &&
                    !!storeDefaultLabel;

                  return (
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); setShowPaymentPicker(p => !p); setStoreDefaultLabel(receipt.paymentMethod); }}
                        className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap transition hover:brightness-125"
                        style={{ backgroundColor: 'rgba(74,222,128,0.08)', color: '#ffffff', border: '1px solid rgba(74,222,128,0.35)' }}
                      >
                        <CreditCard size={13} strokeWidth={1.75} color="#ffffff" />
                        {receipt.paymentMethod && (
                          <span style={{ maxWidth: '10ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {receipt.paymentMethod}
                          </span>
                        )}
                        <ChevronDown size={8} />
                      </button>

                      {showPaymentPicker && (
                        <div
                          className="absolute top-full left-0 mt-1 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl"
                          style={{ minWidth: 160, maxHeight: '55vh', overflowY: 'auto' }}
                          onClick={e => e.stopPropagation()}
                        >
                          {/* None */}
                          <button
                            onClick={() => { onUpdatePayment?.(receipt.id, null, null); setShowPaymentPicker(false); setStoreDefaultLabel(null); }}
                            className={`w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition ${receipt.paymentMethod === null ? 'text-sb-green' : 'text-white/50'}`}
                          >
                            None
                            {receipt.paymentMethod === null && <Check size={10} className="text-sb-green ml-auto" />}
                          </button>

                          {/* Named cards */}
                          {cards.map(card => (
                            <button
                              key={card.id}
                              onClick={() => {
                                onUpdatePayment?.(receipt.id, card.label, 'manual');
                                setStoreDefaultLabel(card.label);
                                setShowPaymentPicker(false);
                              }}
                              className={`w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition ${receipt.paymentMethod === card.label ? 'text-sb-green' : 'text-white'}`}
                            >
                              <span className="flex-1">{card.label}</span>
                              {card.last4 && <span className="text-white/35 text-[10px]">•••{card.last4}</span>}
                              {receipt.paymentMethod === card.label && <Check size={10} className="text-sb-green" />}
                            </button>
                          ))}

                          {/* Cash */}
                          <button
                            onClick={() => { onUpdatePayment?.(receipt.id, 'Cash', 'manual'); setStoreDefaultLabel('Cash'); setShowPaymentPicker(false); }}
                            className={`w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition ${receipt.paymentMethod === 'Cash' ? 'text-sb-green' : 'text-white'}`}
                          >
                            Cash
                            {receipt.paymentMethod === 'Cash' && <Check size={10} className="text-sb-green ml-auto" />}
                          </button>

                          {/* Other */}
                          <button
                            onClick={() => { onUpdatePayment?.(receipt.id, 'Other', 'manual'); setStoreDefaultLabel('Other'); setShowPaymentPicker(false); }}
                            className={`w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition ${receipt.paymentMethod === 'Other' ? 'text-sb-green' : 'text-white'}`}
                          >
                            Other
                            {receipt.paymentMethod === 'Other' && <Check size={10} className="text-sb-green ml-auto" />}
                          </button>

                          {/* Name card •••XXXX — if receipt has unknown last4 */}
                          {unknownLast4 && (
                            <>
                              <div className="border-t border-sb-border/50" />
                              <button
                                onClick={() => {
                                  setCardSheetLast4(receipt.last4 ?? null);
                                  setCardSheetNetwork(receipt.paymentMethod);
                                  setShowPaymentPicker(false);
                                  setShowCardSheet(true);
                                }}
                                className="w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition text-sb-purple"
                              >
                                + Name card •••{receipt.last4}
                              </button>
                            </>
                          )}

                          {/* + New card… */}
                          <div className="border-t border-sb-border/50" />
                          <button
                            onClick={() => {
                              setCardSheetLast4(unknownLast4 ? (receipt.last4 ?? null) : null);
                              setCardSheetNetwork(unknownLast4 ? receipt.paymentMethod : null);
                              setShowPaymentPicker(false);
                              setShowCardSheet(true);
                            }}
                            className="w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition text-sb-green"
                          >
                            ＋ New card…
                          </button>

                          {/* Store default checkbox — only when no last4 on receipt */}
                          {showStoreDefault && receipt.storeName && (
                            <div
                              className="border-t border-sb-border/50 px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-white/5"
                              onClick={() => {
                                const defaults = getStoreDefaults(userId);
                                const storeKey = normalizeStoreName(receipt.storeName);
                                const matchedCard = cards.find(c => c.label === storeDefaultLabel);
                                if (matchedCard) {
                                  saveStoreDefaults(userId, { ...defaults, [storeKey]: matchedCard.id });
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                readOnly
                                checked={(() => {
                                  const defaults = getStoreDefaults(userId);
                                  const storeKey = normalizeStoreName(receipt.storeName);
                                  const cardId = defaults[storeKey];
                                  return !!cardId && cards.some(c => c.id === cardId && c.label === storeDefaultLabel);
                                })()}
                                className="w-3 h-3 accent-sb-purple flex-shrink-0"
                              />
                              <span className="text-[10px] text-white/55 leading-tight">
                                Always use {storeDefaultLabel} for {receipt.storeName}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Client badge */}
                <div className="relative flex-shrink-0" ref={clientPickerRef}>
                  <button onClick={() => setShowClientPicker(p => !p)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap transition hover:brightness-125"
                    style={receipt.clientName
                      ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)' }
                      : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#6b7280', borderColor: 'rgba(255,255,255,0.1)' }
                    }>
                    {receipt.clientName || '+ client'}<ChevronDown size={8} />
                  </button>
                  {showClientPicker && (
                    <div className="absolute top-full left-0 mt-1 w-44 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl" onClick={e => e.stopPropagation()}>
                      <button onClick={e => { e.stopPropagation(); pickClient(''); }} className="w-full px-3 py-2.5 text-xs text-left text-sb-muted hover:bg-white/5 flex items-center gap-2">
                        <X size={10} /> No client
                      </button>
                      {clients.length > 0 && <div className="border-t border-sb-border" />}
                      <div className="max-h-36 overflow-y-auto">
                        {clients.map(c => (
                          <div key={c} className={`flex items-center transition ${c === receipt.clientName ? 'bg-white/5' : ''}`}>
                            <button
                              onClick={e => { e.stopPropagation(); pickClient(c); }}
                              className="flex-1 px-3 py-2.5 text-xs text-left flex items-center gap-2"
                            >
                              <span className={c === receipt.clientName ? 'text-white font-medium' : 'text-white'}>{c}</span>
                              {c === receipt.clientName && <Check size={10} className="text-sb-green" />}
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setShowClientPicker(false); setClientRenameTarget(c); }}
                              className="px-1.5 py-2.5 text-white/25 hover:text-white/70 transition flex-shrink-0"
                              title="Rename"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setShowClientPicker(false); setClientDeleteTarget(c); }}
                              className="px-1.5 py-2.5 text-white/25 hover:text-red-400 transition flex-shrink-0"
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setShowClientPicker(false); setShowNewClientSheet(true); }}
                        className="w-full border-t border-sb-border px-3 py-2.5 text-xs text-sb-green hover:brightness-110 text-left transition"
                      >
                        ＋ New client
                      </button>
                    </div>
                  )}
                </div>

                {/* Category badge */}
                <div className="relative flex-shrink-0" ref={catPickerRef}>
                  <button onClick={() => setShowCatPicker(p => !p)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition hover:brightness-125"
                    style={{ backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}>
                    {receipt.category || '+ cat'}<ChevronDown size={8} />
                  </button>
                  {showCatPicker && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl" onClick={e => e.stopPropagation()}>
                      <div className="max-h-48 overflow-y-auto">
                        {getAllCategories(userId).map(cat => (
                          <div key={cat.name} className={`flex items-center transition ${cat.name === receipt.category ? 'bg-white/5' : ''}`}>
                            <button
                              onClick={e => { e.stopPropagation(); pickCategory(cat.name); }}
                              className="flex-1 px-3 py-2.5 text-xs text-left flex items-center gap-2"
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className={cat.name === receipt.category ? 'text-white font-medium flex-1' : 'text-white flex-1'}>{cat.name}</span>
                              {cat.name === receipt.category && <Check size={10} className="text-sb-green" />}
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setShowCatPicker(false); setCatRenameTarget(cat.name); }}
                              className="px-1.5 py-2.5 text-white/25 hover:text-white/70 transition flex-shrink-0"
                              title="Rename"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setShowCatPicker(false); setCatDeleteTarget(cat.name); }}
                              className="px-1.5 py-2.5 text-white/25 hover:text-red-400 transition flex-shrink-0"
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setShowCatPicker(false); setShowNewCatSheet(true); }}
                        className="w-full border-t border-sb-border px-3 py-2.5 text-xs text-sb-green hover:brightness-110 text-left transition"
                      >
                        ＋ New category
                      </button>
                    </div>
                  )}
                </div>

                {/* Trash */}
                <button
                  onClick={() => confirmDelete ? (onDelete(receipt.id), setConfirmDelete(false)) : setConfirmDelete(true)}
                  onBlur={() => setConfirmDelete(false)}
                  className={`p-2 rounded-lg transition ml-auto flex-shrink-0 ${confirmDelete ? 'bg-red-950/40' : 'hover:bg-white/5'}`}>
                  <Trash2 size={15} color={confirmDelete ? '#f87171' : '#ef4444'} />
                </button>
              </div>

              {/* Line 2: date · [Split] · pencil · share · total */}
              <div className="flex items-center gap-2" onClick={handleBgTap}>
                <span className="text-[11px] text-sb-muted flex-shrink-0">{dateDisplay}</span>

                {/* Split — wide muted green, centered between date and right icons */}
                {productItems.length > 1 && !editingItems && (
                  <button
                    onClick={() => splitMode ? setSplitMode(false) : enterSplitMode()}
                    className={`flex-1 mx-1 py-1 rounded-lg text-[11px] font-semibold transition ${
                      splitMode
                        ? 'bg-green-900/60 text-green-400 border border-green-700/50'
                        : 'bg-green-900/30 text-green-500 border border-green-800/40 hover:bg-green-900/50'
                    }`}>
                    Split
                  </button>
                )}
                {/* Spacer when no split button */}
                {(productItems.length <= 1 || editingItems) && <div className="flex-1" />}

                {/* Pencil — yellow */}
                {!splitMode && (
                  <button
                    onClick={() => editingItems ? saveItems() : enterPencilMode()}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition flex-shrink-0"
                    title={editingItems ? 'Save' : 'Edit items'}>
                    {editingItems
                      ? <Check size={14} color="#4ade80" strokeWidth={2.5} />
                      : <Pencil size={14} color="#eab308" />
                    }
                  </button>
                )}

                {/* Share */}
                <button onClick={() => setShareOpen(true)}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition flex-shrink-0" title="Share">
                  <ShareArrow size={15} color="#3b82f6" />
                </button>

                {/* Total */}
                <span className="text-sb-green font-bold text-sm flex-shrink-0">
                  ${(editingItems ? liveTotals.total : receipt.total).toFixed(2)}
                </span>
              </div>
            </div>

            {/* ── Line items (pencil mode) ──
                Taps on the padded background around/below the items call
                handleBgTap so this area also closes the card / exits edit.
                Row clicks (checkbox toggles in editingItems mode) fire on
                inner elements — e.target !== currentTarget so bg tap skips.
            */}
            {!splitMode && (
              <div className="px-4 pb-3 border-t border-sb-border pt-3 space-y-0.5"
                onClick={handleBgTap}>
                {productItems.map((item, i) => {
                  const originalIndex = allLineItems.indexOf(item);
                  const checked = checkedItems.has(originalIndex);
                  return (
                    <div key={i}
                      {...(editingItems ? { 'data-interactive': 'true' } : {})}
                      onClick={e => {
                        if (!editingItems) return;
                        e.stopPropagation();
                        setCheckedItems(prev => {
                          const next = new Set(prev);
                          next.has(originalIndex) ? next.delete(originalIndex) : next.add(originalIndex);
                          return next;
                        });
                      }}
                      className={`flex items-center gap-2 py-1 rounded transition ${editingItems ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}`}>
                      <div className={`transition-all duration-150 overflow-hidden flex-shrink-0 ${editingItems ? 'w-5 opacity-100' : 'w-0 opacity-0'}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-sb-green border-sb-green' : 'border-sb-muted bg-transparent'}`}>
                          {checked && <Check size={9} className="text-black" strokeWidth={3} />}
                        </div>
                      </div>
                      <span className={`flex-1 text-xs leading-snug transition-colors ${editingItems && !checked ? 'text-white/30 line-through' : 'text-sb-muted'}`}>
                        {item.description}
                      </span>
                      <span className={`text-xs flex-shrink-0 transition-colors ${editingItems && !checked ? 'text-white/30' : 'text-white'}`}>
                        ${item.amount.toFixed(2)}
                      </span>
                    </div>
                  );
                })}

                {taxItems.length > 0 && (
                  <div className="border-t border-sb-border mt-2 pt-2 space-y-0.5">
                    {(editingItems
                      ? liveTotals.proportionalTaxes.map(t => ({ description: t.label, amount: t.amount }))
                      : taxItems
                    ).map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-sb-muted">{item.description}</span>
                        <span className="text-sb-muted">${item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-sb-border mt-2 pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-white">Total</span>
                  <span className="text-sb-green">${(editingItems ? liveTotals.total : receipt.total).toFixed(2)}</span>
                </div>

                {receipt.notes && (
                  <p className="text-sb-muted text-xs italic border-t border-sb-border pt-2">{receipt.notes}</p>
                )}
              </div>
            )}

            {/* ── Split mode ──
                Removed the outer stopPropagation so background taps in
                split area exit split mode (handleBgTap's priority chain).
                Interactive rows/buttons inside protect themselves via
                data-interactive="true" or e.stopPropagation() in onClick.
            */}
            {splitMode && (
              <div className="border-t border-sb-border" onClick={handleBgTap}>
                <div className="px-3 py-2 bg-sb-green/5 border-b border-sb-border">
                  <p className="text-[11px] text-sb-green font-medium">Select items to split into a new receipt</p>
                </div>

                <div className="px-3 pt-2 pb-1 space-y-1">
                  {productItems.map((item, i) => {
                    const originalIndex = allLineItems.indexOf(item);
                    const checked = splitChecked.has(originalIndex);
                    return (
                      <div key={i} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/5 rounded-lg px-1 active:bg-white/10"
                        data-interactive="true"
                        onClick={e => {
                          e.stopPropagation();
                          setSplitChecked(prev => {
                            const next = new Set(prev);
                            next.has(originalIndex) ? next.delete(originalIndex) : next.add(originalIndex);
                            return next;
                          });
                        }}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-sb-green border-sb-green' : 'border-sb-muted bg-transparent'}`}>
                          {checked && <Check size={9} className="text-black" strokeWidth={3} />}
                        </div>
                        <span className="flex-1 text-xs text-sb-muted leading-snug">{item.description}</span>
                        <span className="text-xs text-white flex-shrink-0">${item.amount.toFixed(2)}</span>
                        {/* Per-item client + category — only show when checked */}
                        {checked && (
                          <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
                            <ClientPicker
                              value={splitClients[originalIndex] ?? null}
                              userId={userId}
                              onChange={v => setSplitClients(prev => ({ ...prev, [originalIndex]: v }))}
                            />
                            <CatPicker
                              value={splitCats[originalIndex] ?? receipt.category}
                              userId={userId}
                              onChange={v => setSplitCats(prev => ({ ...prev, [originalIndex]: v }))}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Tax lines */}
                {taxItems.length > 0 && (
                  <div className="px-4 pb-2 space-y-0.5">
                    <div className="border-t border-sb-border pt-2 space-y-0.5">
                      {taxItems.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-sb-muted">{item.description}</span>
                          <span className="text-sb-muted">${item.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Split preview — two receipt totals */}
                {splitChecked.size > 0 && (
                  <div className="mx-3 mb-2 mt-1 rounded-xl border border-sb-border overflow-hidden">
                    <div className="flex divide-x divide-sb-border">
                      <div className="flex-1 px-3 py-2.5 text-center">
                        <p className="text-[10px] text-sb-muted mb-0.5">Original</p>
                        <p className="text-sm font-bold text-white">${remainTotals.total.toFixed(2)}</p>
                        <p className="text-[10px] text-sb-muted">{productItems.length - splitChecked.size} items</p>
                      </div>
                      <div className="flex-1 px-3 py-2.5 text-center">
                        <p className="text-[10px] text-sb-green mb-0.5">New receipt</p>
                        <p className="text-sm font-bold text-sb-green">${splitTotals.total.toFixed(2)}</p>
                        <p className="text-[10px] text-sb-muted">{splitChecked.size} items</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save split button */}
                <div className="px-3 pb-3">
                  <button
                    onClick={saveSplit}
                    disabled={splitChecked.size === 0}
                    className="w-full py-2.5 rounded-xl bg-sb-green text-black text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition active:scale-[0.98]">
                    {splitChecked.size > 0 ? 'Save' : 'Select items to split'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Receipt photo ── */}
            {receipt.imageUrl ? (
              <div className="cursor-zoom-in border-t border-sb-border bg-black"
                onClick={e => { e.stopPropagation(); setImgFullscreen(true); }}>
                <img src={receipt.imageUrl} alt="Receipt" className="w-full max-h-56 object-contain" />
                <p className="text-center text-[10px] text-sb-muted py-1">Tap to enlarge</p>
              </div>
            ) : (
              <div className="border-t border-sb-border flex items-center justify-center gap-2 py-4 text-sb-muted"
                onClick={e => e.stopPropagation()}>
                <ImageIcon size={16} />
                <span className="text-xs">No receipt image</span>
              </div>
            )}
          </div>
        );
        })()}
      </div>

      {shareOpen && <ShareModal receipt={receipt} onClose={() => setShareOpen(false)} />}
      {imgFullscreen && receipt.imageUrl && (
        <ZoomableImage src={receipt.imageUrl} onClose={() => setImgFullscreen(false)} />
      )}
      {showCardSheet && (
        <CardNameSheet
          last4={cardSheetLast4}
          network={cardSheetNetwork}
          onSave={method => {
            // Update this receipt to use the new card label
            onUpdatePayment?.(receipt.id, method.label, 'manual');
            setShowCardSheet(false);
          }}
          onClose={() => setShowCardSheet(false)}
        />
      )}

      {clientRenameTarget !== null && (
        <ClientRenameSheet
          userId={userId}
          oldName={clientRenameTarget}
          onClose={() => setClientRenameTarget(null)}
          onDone={() => {
            setClientRenameTarget(null);
            setClients(loadClients(userId));
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}

      {catRenameTarget !== null && (
        <CategoryRenameSheet
          userId={userId}
          oldName={catRenameTarget}
          onClose={() => setCatRenameTarget(null)}
          onDone={() => {
            setCatRenameTarget(null);
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}

      {clientDeleteTarget !== null && (
        <ClientDeleteSheet
          userId={userId}
          name={clientDeleteTarget}
          onClose={() => setClientDeleteTarget(null)}
          onDone={() => {
            setClientDeleteTarget(null);
            setClients(loadClients(userId));
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}

      {catDeleteTarget !== null && (
        <CategoryDeleteSheet
          userId={userId}
          name={catDeleteTarget}
          onClose={() => setCatDeleteTarget(null)}
          onDone={() => {
            setCatDeleteTarget(null);
            window.dispatchEvent(new CustomEvent('receipts-updated'));
          }}
        />
      )}

      {showNewClientSheet && (
        <BottomSheet
          title="New client"
          onClose={() => { setShowNewClientSheet(false); setNewClientInput(''); }}
          onPrimary={() => { addNewClient(); setShowNewClientSheet(false); }}
          primaryDisabled={!newClientInput.trim()}
        >
          <input
            autoFocus
            value={newClientInput}
            onChange={e => setNewClientInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newClientInput.trim()) { addNewClient(); setShowNewClientSheet(false); } }}
            placeholder="Client name"
            className="w-full bg-sb-card border border-sb-green rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none"
          />
        </BottomSheet>
      )}

      {showNewCatSheet && (
        <BottomSheet
          title="New category"
          onClose={() => { setShowNewCatSheet(false); setNewCatInput(''); }}
          onPrimary={() => { addNewCategory(); setShowNewCatSheet(false); }}
          primaryDisabled={!newCatInput.trim()}
        >
          <input
            autoFocus
            value={newCatInput}
            onChange={e => setNewCatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newCatInput.trim()) { addNewCategory(); setShowNewCatSheet(false); } }}
            placeholder="Category name"
            className="w-full bg-sb-card border border-sb-green rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none"
          />
        </BottomSheet>
      )}
    </>
  );
}

/* ── Zoomable fullscreen image ── */
function ZoomableImage({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const dragStart     = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  function getTouchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      lastTouchDist.current = getTouchDist(e.touches);
    } else if (e.touches.length === 1 && scale > 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const newDist = getTouchDist(e.touches);
      setScale(s => Math.min(Math.max(s * (newDist / lastTouchDist.current!), 1), 5));
      lastTouchDist.current = newDist;
    } else if (e.touches.length === 1 && dragStart.current && scale > 1) {
      setOffset({ x: dragStart.current.ox + (e.touches[0].clientX - dragStart.current.x), y: dragStart.current.oy + (e.touches[0].clientY - dragStart.current.y) });
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) lastTouchDist.current = null;
    if (e.touches.length === 0) dragStart.current = null;
    if (scale <= 1) setOffset({ x: 0, y: 0 });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center" style={{ touchAction: 'none' }}>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 safe-top z-10">
        <button onClick={onClose} className="text-white/70 hover:text-white transition p-1"><X size={22} /></button>
        <div className="flex items-center gap-3">
          <button onClick={() => { setScale(s => Math.max(s - 0.5, 1)); if (scale - 0.5 <= 1) setOffset({ x: 0, y: 0 }); }}
            className="text-white/70 hover:text-white transition p-1" disabled={scale <= 1}><ZoomOut size={20} /></button>
          <span className="text-white/50 text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(s + 0.5, 5))}
            className="text-white/70 hover:text-white transition p-1" disabled={scale >= 5}><ZoomIn size={20} /></button>
        </div>
      </div>
      <div className="w-full h-full flex items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={() => { if (scale === 1) onClose(); }}>
        <img src={src} alt="Receipt" draggable={false}
          style={{
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transformOrigin: 'center',
            transition: lastTouchDist.current ? 'none' : 'transform 0.1s ease-out',
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none',
          }} />
      </div>
      {scale === 1 && <p className="absolute bottom-8 text-white/30 text-xs">Tap to close · Pinch to zoom</p>}
    </div>
  );
}
