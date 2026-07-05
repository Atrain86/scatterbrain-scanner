import { useState, useRef, useEffect } from 'react';
import { Trash2, Check, Pencil, Image as ImageIcon, X, ZoomIn, ZoomOut, ChevronDown, Plus } from 'lucide-react';
import type { Receipt } from '../utils/types';
import { getCategoryColorDynamic } from '../utils/types';
import { loadCategories } from '../utils/categories';
import { isTaxLine, computeReceiptTotals, fmt } from '../utils/taxCalc';
import { loadClients, setLastClient } from '../utils/clients';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from './ShareModal';
import { CreateClientSheet, CreateCategorySheet } from './CreateSheets';
import { toast } from './Toast';
import { addReceipt } from '../lib/db';
import { pushReceiptNow } from '../lib/cloudSync';

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
  onReEdit: (id: number, updates: ReEditUpdates) => void;
  onNewReceipt?: (r: Receipt) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
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

// ─── ClientPicker — working-surface variant (expanded card + split mode) ─────
// Larger tap target, "CLIENT" descriptor above, blue chevron cue, pinned green
// "+ New client" row at the bottom that opens the shared BottomSheet.
function ClientPicker({
  value, userId, onChange, size = 'large',
}: {
  value: string | null;
  userId: string;
  onChange: (v: string | null) => void;
  /** 'large' = expanded receipt (with descriptor). 'small' = split-mode per-item row. */
  size?: 'large' | 'small';
}) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<string[]>(() => loadClients(userId));
  const [sheetOpen, setSheetOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Refresh list when the sheet commits or when any other surface changes clients.
  useEffect(() => {
    function refresh() { setClients(loadClients(userId)); }
    window.addEventListener('clients-updated', refresh);
    return () => window.removeEventListener('clients-updated', refresh);
  }, [userId]);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function pick(name: string | null) { onChange(name); setOpen(false); }

  const large = size === 'large';

  return (
    <div className="relative" ref={ref}>
      {large && (
        <label className="block text-[10px] uppercase tracking-wider text-sb-muted mb-1">Client</label>
      )}
      <button
        onClick={e => { e.stopPropagation(); setOpen(p => !p); }}
        className={
          large
            ? `w-full flex items-center justify-between rounded-xl border transition hover:bg-white/5 px-3 h-9`
            : `flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap transition hover:brightness-125`
        }
        style={value
          ? { backgroundColor: 'rgba(59,130,246,0.10)', color: '#ffffff', borderColor: 'rgba(59,130,246,0.45)' }
          : { backgroundColor: 'rgba(255,255,255,0.03)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.12)' }
        }
      >
        <span className={large ? 'text-sm font-medium' : 'text-[10px]'}>
          {value || (large ? 'Choose client' : '+ client')}
        </span>
        <ChevronDown size={large ? 14 : 8} color="#60a5fa" />
      </button>

      {open && (
        <div className={`absolute top-full mt-1 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-50 shadow-2xl ${large ? 'left-0 right-0 min-w-[220px]' : 'left-0 w-44'}`}>
          <div className="max-h-64 overflow-y-auto">
            <button onClick={() => pick(null)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left text-sb-muted hover:bg-white/5">
              <X size={11} /> No client
            </button>
            {clients.length > 0 && <div className="border-t border-sb-border" />}
            {clients.map(c => (
              <button key={c} onClick={() => pick(c)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-left hover:bg-white/5 transition ${c === value ? 'bg-white/5' : ''}`}>
                <span className="text-white">{c}</span>
                {c === value && <Check size={11} className="text-sb-green" />}
              </button>
            ))}
          </div>
          {/* Pinned "New client" — never scrolls away */}
          <div className="border-t border-sb-border">
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); setSheetOpen(true); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left text-sb-green hover:bg-sb-green/10 transition font-medium">
              <Plus size={12} /> New client
            </button>
          </div>
        </div>
      )}

      <CreateClientSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        userId={userId}
        onCreated={name => { pick(name); window.dispatchEvent(new CustomEvent('clients-updated')); }}
      />
    </div>
  );
}

// ─── CatPicker — working-surface variant (expanded card + split mode) ────────
// Larger tap target, "CATEGORY" descriptor above, pink chevron cue, pinned
// green "+ New category" row at the bottom that opens the shared BottomSheet.
function CatPicker({
  value, userId, onChange, size = 'large',
}: {
  value: string;
  userId: string;
  onChange: (v: string) => void;
  size?: 'large' | 'small';
}) {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState(() => loadCategories(userId));
  const [sheetOpen, setSheetOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const color = getCategoryColorDynamic(value, userId);

  useEffect(() => {
    function refresh() { setCats(loadCategories(userId)); }
    window.addEventListener('categories-updated', refresh);
    return () => window.removeEventListener('categories-updated', refresh);
  }, [userId]);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function pick(name: string) { onChange(name); setOpen(false); }

  const large = size === 'large';

  return (
    <div className="relative" ref={ref}>
      {large && (
        <label className="block text-[10px] uppercase tracking-wider text-sb-muted mb-1">Category</label>
      )}
      <button
        onClick={e => { e.stopPropagation(); setOpen(p => !p); }}
        className={
          large
            ? `w-full flex items-center justify-between rounded-xl border transition hover:bg-white/5 px-3 h-9`
            : `flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition hover:brightness-125`
        }
        style={large
          ? { backgroundColor: color + '15', color: '#ffffff', borderColor: color + '55' }
          : { backgroundColor: color + '22', color, border: `1px solid ${color}44` }
        }
      >
        <span className={large ? 'flex items-center gap-2 text-sm font-medium' : ''}>
          {large && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
          {value || (large ? 'Choose category' : '+ cat')}
        </span>
        <ChevronDown size={large ? 14 : 8} color="#EC4899" />
      </button>

      {open && (
        <div className={`absolute top-full mt-1 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-50 shadow-2xl ${large ? 'left-0 right-0 min-w-[220px]' : 'left-0 w-48'}`}>
          <div className="max-h-64 overflow-y-auto">
            {cats.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-sb-muted italic">No categories yet.</p>
            ) : (
              cats.map(cat => (
                <button key={cat.name} onClick={() => pick(cat.name)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-white/5 transition ${cat.name === value ? 'bg-white/5' : ''}`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-white flex-1">{cat.name}</span>
                  {cat.name === value && <Check size={11} className="text-sb-green" />}
                </button>
              ))
            )}
          </div>
          {/* Pinned "New category" */}
          <div className="border-t border-sb-border">
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); setSheetOpen(true); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left text-sb-green hover:bg-sb-green/10 transition font-medium">
              <Plus size={12} /> New category
            </button>
          </div>
        </div>
      )}

      <CreateCategorySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        userId={userId}
        onCreated={name => { pick(name); }}
      />
    </div>
  );
}

export default function ReceiptCard({ receipt, onDelete, onUpdateCategory, onReEdit, onNewReceipt, selectMode, selected, onToggleSelect }: Props) {
  const { user } = useAuth();
  const userId = user!.id;

  const [expanded,         setExpanded]         = useState(false);
  const [editingStore,     setEditingStore]     = useState(false);
  const [editStore,        setEditStore]        = useState(receipt.storeName);
  const [editingItems,     setEditingItems]     = useState(false);
  const [splitMode,        setSplitMode]        = useState(false);
  const [imgFullscreen,    setImgFullscreen]    = useState(false);
  const [shareOpen,        setShareOpen]        = useState(false);
  const [confirmDelete,    setConfirmDelete]    = useState(false);

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

  // "Active" edit modes disable tap-to-close on the expanded card.
  const anyEditActive = editingStore || editingItems || splitMode;

  useEffect(() => {
    if (editingStore) {
      setEditStore(receipt.storeName);
      setTimeout(() => storeInputRef.current?.focus(), 50);
    }
  }, [editingStore, receipt.storeName]);

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

  // Client + category assignment now flows through the <ClientPicker /> and
  // <CatPicker /> components, which own their own dropdown state and delegate
  // creation to the shared CreateSheets.

  /**
   * Autosave: every checkbox toggle in pencil mode commits the new set to Dexie
   * immediately. Recompute proportional tax on the fly and persist the whole
   * receipt shape so nothing drifts. Toast fires once per toggle so the user
   * sees "Saved".
   */
  function commitCheckedItems(nextSet: Set<number>) {
    setCheckedItems(nextSet);
    const totals = computeReceiptTotals(allLineItems, nextSet);
    const selectedProducts = allLineItems.filter((item, i) =>
      !isTaxLine(item.description) && nextSet.has(i)
    );
    onReEdit(receipt.id, {
      storeName: receipt.storeName,
      lineItems: JSON.stringify([...selectedProducts, ...taxItems]),
      taxLines: JSON.stringify(totals.proportionalTaxes),
      subtotal: totals.selectedSubtotal,
      taxAmount: totals.totalTax,
      total: totals.total,
      clientName: receipt.clientName,
      category: receipt.category,
    });
    toast('Saved');
  }

  function enterPencilMode() {
    // Reset checked to current saved items (i.e. what the receipt currently shows).
    const saved: { description: string; amount: number }[] = receipt.lineItems
      ? JSON.parse(receipt.lineItems) : [];
    const savedDescs = new Set(saved.filter(i => !isTaxLine(i.description)).map(i => i.description));
    const s = new Set<number>();
    allLineItems.forEach((item, idx) => {
      if (!isTaxLine(item.description) && savedDescs.has(item.description)) s.add(idx);
    });
    setCheckedItems(s);
    setEditingItems(true);
    // Note: store name edit is a separate action (tap the store name text).
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
      imagePath: receipt.imagePath ?? null,
      imageUrl: receipt.imageUrl ?? null,
      notes: receipt.notes ?? null,
      uuid: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    void pushReceiptNow(newReceipt, userId);
    onNewReceipt?.(newReceipt);
    setSplitMode(false);
  }

  // ── Collapsed badge row (store name line 1, client+cat line 1, date line 2) ──
  function CollapsedBadges() {
    return (
      <div className="flex-1 min-w-0 px-3 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-white font-semibold text-sm leading-tight truncate">
            {receipt.storeName || 'Unknown Store'}
          </p>
          {receipt.clientName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/40 leading-none">
              {receipt.clientName}
            </span>
          )}
          {receipt.category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full leading-none"
              style={{ backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}>
              {receipt.category}
            </span>
          )}
        </div>
        <p className="text-[11px] text-sb-muted leading-snug mt-0.5">{dateDisplay}</p>
      </div>
    );
  }

  return (
    <>
      <div className={`bg-sb-card rounded-xl border transition-colors ${selected ? 'border-sb-green' : 'border-sb-border'} overflow-visible`}>

        {/* ── Collapsed row ── */}
        {!expanded && (
          <div
            className="flex items-stretch gap-0 cursor-pointer active:bg-white/5 hover:bg-white/[0.03] transition rounded-xl"
            onClick={() => selectMode ? onToggleSelect?.(receipt.id) : setExpanded(true)}
          >
            <div className={`flex items-center justify-center transition-all duration-200 overflow-hidden ${selectMode ? 'w-10 opacity-100' : 'w-0 opacity-0'}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-sb-green border-sb-green' : 'border-sb-muted bg-transparent'}`}>
                {selected && <Check size={11} className="text-black" strokeWidth={3} />}
              </div>
            </div>
            <span className="w-1 rounded-l-xl flex-shrink-0 self-stretch" style={{ backgroundColor: catColor, minHeight: 52 }} />
            <CollapsedBadges />
            <div className="flex flex-col items-end justify-between px-3 py-2 flex-shrink-0 gap-1" onClick={e => e.stopPropagation()}>
              <span className="text-sb-green font-bold text-sm leading-tight">${receipt.total.toFixed(2)}</span>
              {confirmDelete ? (
                <button onClick={() => { onDelete(receipt.id); setConfirmDelete(false); }} onBlur={() => setConfirmDelete(false)}
                  className="bg-red-950/40 rounded-lg p-1 transition"><Trash2 size={14} color="#ef4444" /></button>
              ) : (
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="hover:bg-red-950/30 rounded-lg p-1 transition"><Trash2 size={14} color="#ef4444" /></button>
              )}
            </div>
          </div>
        )}

        {/* ── Expanded detail ── */}
        {expanded && (
          <div className="animate-fade-in">

            {/* Tap-to-close strip at top */}
            <div className="flex justify-center pt-2 pb-0 cursor-pointer"
              onClick={() => { if (!anyEditActive) setExpanded(false); }}>
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* ── Header — expanded working surface ── */}
            <div className="px-3 pt-2 pb-2.5" onClick={e => e.stopPropagation()}>

              {/* Line 1: store name (large, tappable to edit) + trash top-right */}
              <div className="flex items-start gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  {editingStore ? (
                    <input ref={storeInputRef} value={editStore}
                      onChange={e => setEditStore(e.target.value)}
                      onBlur={saveStoreName}
                      onKeyDown={e => { if (e.key === 'Enter') saveStoreName(); if (e.key === 'Escape') setEditingStore(false); }}
                      className="w-full bg-transparent border-b border-sb-green text-white font-semibold text-lg focus:outline-none pb-0.5" />
                  ) : (
                    <button
                      onClick={() => setEditingStore(true)}
                      className="text-white font-semibold text-lg leading-tight truncate block text-left w-full hover:text-white/80 transition">
                      {receipt.storeName || 'Unknown Store'}
                    </button>
                  )}
                </div>
                {/* Trash — top right corner, on its own */}
                <button
                  onClick={() => confirmDelete ? (onDelete(receipt.id), setConfirmDelete(false)) : setConfirmDelete(true)}
                  onBlur={() => setConfirmDelete(false)}
                  className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition ${confirmDelete ? 'bg-red-950/40' : 'hover:bg-red-950/30'}`}
                  title="Delete">
                  <Trash2 size={15} color="#ef4444" />
                </button>
              </div>

              {/* Line 2: pickers row — Client (left) + Category (right) */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <ClientPicker
                  value={receipt.clientName}
                  userId={userId}
                  onChange={name => {
                    if (name) setLastClient(userId, name);
                    onReEdit(receipt.id, {
                      storeName: receipt.storeName,
                      lineItems: receipt.lineItems ?? '[]',
                      taxLines: receipt.taxLines ?? '[]',
                      subtotal: receipt.subtotal,
                      taxAmount: receipt.taxAmount,
                      total: receipt.total,
                      clientName: name || null,
                      category: receipt.category,
                    });
                  }}
                />
                <CatPicker
                  value={receipt.category}
                  userId={userId}
                  onChange={name => onUpdateCategory(receipt.id, name)}
                />
              </div>

              {/* Line 2: date · [Split] · [Edit · Share] · trash — action row */}
              {!splitMode && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-sb-muted flex-shrink-0">{dateDisplay}</span>
                  <div className="flex-1" />

                  {/* Split — prominent outline peer, text only, sits left of Edit */}
                  {productItems.length > 1 && !editingItems && (
                    <button
                      onClick={() => enterSplitMode()}
                      className="h-8 px-4 rounded-lg border border-sb-green text-sb-green text-[13px] font-semibold hover:bg-sb-green/10 transition"
                      title="Split receipt">
                      Split
                    </button>
                  )}

                  {/* Tool cluster [Edit · Share] — outline peers */}
                  <div className="flex items-center gap-1.5">
                    {/* Edit — pencil is a MODE TOGGLE. Enter shows checkboxes;
                        every toggle autosaves; tap again to exit back to viewing. */}
                    <button
                      onClick={() => editingItems ? setEditingItems(false) : enterPencilMode()}
                      className={`h-7 px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition ${
                        editingItems
                          ? 'border-sb-green text-sb-green bg-sb-green/15'
                          : 'border-white/15 text-white hover:bg-white/5'
                      }`}
                      title={editingItems ? 'Done editing' : 'Edit items'}>
                      <Pencil size={12} />
                      <span>Edit</span>
                    </button>

                    {/* Share */}
                    <button onClick={() => setShareOpen(true)}
                      className="h-7 px-2 rounded-lg border border-white/15 text-white hover:bg-white/5 flex items-center transition" title="Share">
                      <ShareArrow size={13} color="#ffffff" />
                    </button>
                  </div>

                  {/* Trash was moved to the top-right of the header (line 1). */}
                </div>
              )}
            </div>

            {/* ── Line items (pencil mode) ── */}
            {!splitMode && (
              <div className="px-4 pb-3 border-t border-sb-border pt-3 space-y-0.5"
                onClick={e => { if (editingItems) e.stopPropagation(); else { e.stopPropagation(); if (!anyEditActive) setExpanded(false); } }}>
                {productItems.map((item, i) => {
                  const originalIndex = allLineItems.indexOf(item);
                  const checked = checkedItems.has(originalIndex);
                  return (
                    <div key={i}
                      onClick={() => {
                        if (!editingItems) return;
                        // Autosave: build the next set + persist immediately.
                        const next = new Set(checkedItems);
                        next.has(originalIndex) ? next.delete(originalIndex) : next.add(originalIndex);
                        commitCheckedItems(next);
                      }}
                      className={`flex items-center gap-2 py-1 rounded transition ${editingItems ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}`}>
                      <div className={`transition-all duration-150 overflow-hidden flex-shrink-0 ${editingItems ? 'w-5 opacity-100' : 'w-0 opacity-0'}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-sb-green border-sb-green' : 'border-sb-muted bg-transparent'}`}>
                          {checked && <Check size={9} className="text-black" strokeWidth={3} />}
                        </div>
                      </div>
                      <span className={`flex-1 text-xs leading-snug transition-colors ${editingItems && !checked ? 'text-white/30 line-through' : 'text-white'}`}>
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

            {/* ── Split mode ── */}
            {splitMode && (
              <div className="border-t border-sb-border" onClick={e => e.stopPropagation()}>
                <div className="px-3 py-2 bg-sb-green/5 border-b border-sb-border">
                  <p className="text-[11px] text-sb-green font-medium">Select items to split into a new receipt</p>
                </div>

                <div className="px-3 pt-2 pb-1 space-y-1">
                  {productItems.map((item, i) => {
                    const originalIndex = allLineItems.indexOf(item);
                    const checked = splitChecked.has(originalIndex);
                    return (
                      <div key={i} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/5 rounded-lg px-1 active:bg-white/10"
                        onClick={() => {
                          setSplitChecked(prev => {
                            const next = new Set(prev);
                            next.has(originalIndex) ? next.delete(originalIndex) : next.add(originalIndex);
                            return next;
                          });
                        }}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-sb-green border-sb-green' : 'border-sb-muted bg-transparent'}`}>
                          {checked && <Check size={9} className="text-black" strokeWidth={3} />}
                        </div>
                        <span className="flex-1 text-xs text-white leading-snug">{item.description}</span>
                        <span className="text-xs text-white flex-shrink-0">${item.amount.toFixed(2)}</span>
                        {/* Per-item client + category — small variant, only when checked */}
                        {checked && (
                          <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
                            <ClientPicker
                              size="small"
                              value={splitClients[originalIndex] ?? null}
                              userId={userId}
                              onChange={v => setSplitClients(prev => ({ ...prev, [originalIndex]: v }))}
                            />
                            <CatPicker
                              size="small"
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
                        <p className="text-[10px] text-sb-muted">
                          {productItems.length - splitChecked.size} item{productItems.length - splitChecked.size === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex-1 px-3 py-2.5 text-center">
                        <p className="text-[10px] text-sb-green mb-0.5">New receipt</p>
                        <p className="text-sm font-bold text-sb-green">${splitTotals.total.toFixed(2)}</p>
                        <p className="text-[10px] text-sb-muted">
                          {splitChecked.size} item{splitChecked.size === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cancel + Save */}
                <div className="px-3 pb-3 flex items-center gap-2">
                  <button
                    onClick={() => setSplitMode(false)}
                    className="px-4 py-2.5 rounded-xl border border-white/15 text-sb-muted text-sm font-medium hover:bg-white/5 hover:text-white transition active:scale-[0.98]">
                    Cancel
                  </button>
                  <button
                    onClick={saveSplit}
                    disabled={splitChecked.size === 0}
                    className="flex-1 py-2.5 rounded-xl bg-sb-green text-black text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition active:scale-[0.98]">
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
        )}
      </div>

      {shareOpen && <ShareModal receipt={receipt} onClose={() => setShareOpen(false)} />}
      {imgFullscreen && receipt.imageUrl && (
        <ZoomableImage src={receipt.imageUrl} onClose={() => setImgFullscreen(false)} />
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
