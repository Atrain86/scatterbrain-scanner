import { useState, useRef, useEffect } from 'react';
import { Trash2, Check, Pencil, Share2, Image as ImageIcon, X, Plus, ZoomIn, ZoomOut, ChevronDown, SplitSquareHorizontal } from 'lucide-react';
import type { Receipt } from '../utils/types';
import { getAllCategories, getCategoryColorDynamic } from '../utils/types';
import { isTaxLine, computeReceiptTotals, fmt } from '../utils/taxCalc';
import { loadClients, addClient, setLastClient } from '../utils/clients';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from './ShareModal';

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
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}

export default function ReceiptCard({ receipt, onDelete, onUpdateCategory, onReEdit, selectMode, selected, onToggleSelect }: Props) {
  const { user } = useAuth();
  const userId = user!.id;

  const [expanded,         setExpanded]         = useState(false);
  const [editingStore,     setEditingStore]     = useState(false);
  const [editStore,        setEditStore]        = useState(receipt.storeName);
  const [editingItems,     setEditingItems]     = useState(false);
  const [imgFullscreen,    setImgFullscreen]    = useState(false);
  const [shareOpen,        setShareOpen]        = useState(false);
  const [confirmDelete,    setConfirmDelete]    = useState(false);
  const [showCatPicker,    setShowCatPicker]    = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clients,          setClients]          = useState<string[]>(() => loadClients(userId));
  const [newClientInput,   setNewClientInput]   = useState('');
  const [newCatInput,      setNewCatInput]      = useState('');

  // Inline item editing — tracks which product item indices are selected
  const allLineItems: { description: string; amount: number }[] = receipt.lineItems
    ? JSON.parse(receipt.lineItems) : [];
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => {
    // Initially: all non-tax items that are in the saved lineItems are checked
    const saved: { description: string; amount: number }[] = receipt.lineItems
      ? JSON.parse(receipt.lineItems) : [];
    const savedDescs = new Set(saved.filter(i => !isTaxLine(i.description)).map(i => i.description));
    const s = new Set<number>();
    allLineItems.forEach((item, i) => {
      if (!isTaxLine(item.description) && savedDescs.has(item.description)) s.add(i);
    });
    return s;
  });

  const catPickerRef    = useRef<HTMLDivElement>(null);
  const clientPickerRef = useRef<HTMLDivElement>(null);
  const storeInputRef   = useRef<HTMLInputElement>(null);

  const catColor     = getCategoryColorDynamic(receipt.category, userId);
  const productItems = allLineItems.filter(i => !isTaxLine(i.description));
  const taxItems     = allLineItems.filter(i =>  isTaxLine(i.description));

  // Live totals while editing items
  const liveTotals = computeReceiptTotals(allLineItems, checkedItems);

  const dateDisplay = new Date(receipt.receiptDate + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  // Focus store input when editing starts
  useEffect(() => {
    if (editingStore) {
      setEditStore(receipt.storeName);
      setTimeout(() => storeInputRef.current?.focus(), 50);
    }
  }, [editingStore, receipt.storeName]);

  // Close pickers on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (showCatPicker && catPickerRef.current && !catPickerRef.current.contains(e.target as Node)) {
        setShowCatPicker(false);
      }
      if (showClientPicker && clientPickerRef.current && !clientPickerRef.current.contains(e.target as Node)) {
        setShowClientPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCatPicker, showClientPicker]);

  function saveStoreName() {
    const trimmed = editStore.trim();
    if (trimmed && trimmed !== receipt.storeName) {
      onReEdit(receipt.id, {
        storeName:   trimmed,
        lineItems:   receipt.lineItems ?? '[]',
        taxLines:    receipt.taxLines ?? '[]',
        subtotal:    receipt.subtotal,
        taxAmount:   receipt.taxAmount,
        total:       receipt.total,
        clientName:  receipt.clientName,
        category:    receipt.category,
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
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    const all = getAllCategories(userId);
    if (all.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      pickCategory(all.find(c => c.name.toLowerCase() === trimmed.toLowerCase())!.name);
      return;
    }
    const key = `sb_u${userId}_custom_categories`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([...existing, { name: trimmed, color: '#6B7280' }]));
    pickCategory(trimmed);
  }

  function pickClient(name: string) {
    setLastClient(userId, name);
    onReEdit(receipt.id, {
      storeName:   receipt.storeName,
      lineItems:   receipt.lineItems ?? '[]',
      taxLines:    receipt.taxLines ?? '[]',
      subtotal:    receipt.subtotal,
      taxAmount:   receipt.taxAmount,
      total:       receipt.total,
      clientName:  name || null,
      category:    receipt.category,
    });
    setShowClientPicker(false);
    setNewClientInput('');
  }

  function addNewClient() {
    const trimmed = newClientInput.trim();
    if (!trimmed) return;
    const updated = addClient(userId, trimmed);
    setClients(updated);
    pickClient(trimmed);
  }

  function saveItems() {
    const selectedProducts = allLineItems.filter((item, i) =>
      !isTaxLine(item.description) && checkedItems.has(i)
    );
    onReEdit(receipt.id, {
      storeName:   receipt.storeName,
      lineItems:   JSON.stringify([...selectedProducts, ...taxItems]),
      taxLines:    JSON.stringify(liveTotals.proportionalTaxes),
      subtotal:    liveTotals.selectedSubtotal,
      taxAmount:   liveTotals.totalTax,
      total:       liveTotals.total,
      clientName:  receipt.clientName,
      category:    receipt.category,
    });
    setEditingItems(false);
  }

  return (
    <>
      <div className={`bg-sb-card rounded-xl border transition-colors ${selected ? 'border-sb-green' : 'border-sb-border'} overflow-visible`}>

        {/* ── Collapsed row (hidden when expanded) ── */}
        {!expanded && (
          <div
            className="flex items-stretch gap-0 cursor-pointer active:bg-white/5 hover:bg-white/[0.03] transition rounded-xl"
            onClick={() => selectMode ? onToggleSelect?.(receipt.id) : setExpanded(p => !p)}
          >
            {/* Checkbox — slides in from left in select mode */}
            <div className={`flex items-center justify-center transition-all duration-200 overflow-hidden ${selectMode ? 'w-10 opacity-100' : 'w-0 opacity-0'}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-sb-green border-sb-green' : 'border-sb-muted bg-transparent'}`}>
                {selected && <Check size={11} className="text-black" strokeWidth={3} />}
              </div>
            </div>

            {/* Category color bar */}
            <span
              className="w-1 rounded-l-xl flex-shrink-0 self-stretch"
              style={{ backgroundColor: catColor, minHeight: 52 }}
            />

            {/* Store + date + tags */}
            <div className="flex-1 min-w-0 px-3 py-3">
              <p className="text-white font-bold text-sm leading-tight truncate"
                 style={{ fontFamily: "'Poppins', sans-serif" }}>
                {receipt.storeName || 'Unknown Store'}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-[11px] text-sb-muted leading-snug">{dateDisplay}</p>
                {receipt.clientName && (
                  <span className="text-[10px] px-1.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/40 leading-snug">
                    {receipt.clientName}
                  </span>
                )}
                {receipt.category && (
                  <span
                    className="text-[10px] px-1.5 rounded-full leading-snug"
                    style={{ backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}
                  >
                    {receipt.category}
                  </span>
                )}
              </div>
            </div>

            {/* Trash (top-right) + price below */}
            <div
              className="flex flex-col items-center justify-between px-3 py-2 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              {confirmDelete ? (
                <button
                  onClick={() => { onDelete(receipt.id); setConfirmDelete(false); }}
                  onBlur={() => setConfirmDelete(false)}
                  className="text-red-400 bg-red-950/40 rounded-lg p-1 transition"
                  title="Confirm delete"
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="text-sb-muted hover:text-red-400 transition p-1"
                  title="Delete receipt"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <span className="text-sb-green font-bold text-sm leading-tight mt-1">
                ${receipt.total.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* ── Expanded detail — tap gray background to collapse ── */}
        {expanded && (
          <div className="animate-fade-in" onClick={() => { if (!editingStore && !editingItems && !showCatPicker && !showClientPicker) setExpanded(false); }}>

            {/* ── Single header ── */}
            <div className="px-3 pt-3 pb-2.5" onClick={e => e.stopPropagation()}>

              {/* Line 1: store name · client badge · trash */}
              <div className="flex items-center gap-1.5 min-w-0 mb-1.5">

                {/* Store name */}
                <div className="flex-1 min-w-0">
                  {editingStore ? (
                    <input
                      ref={storeInputRef}
                      value={editStore}
                      onChange={e => setEditStore(e.target.value)}
                      onBlur={saveStoreName}
                      onKeyDown={e => { if (e.key === 'Enter') saveStoreName(); if (e.key === 'Escape') setEditingStore(false); }}
                      className="w-full bg-transparent border-b border-sb-green text-white font-bold text-sm focus:outline-none pb-0.5"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    />
                  ) : (
                    <button
                      onClick={() => setEditingStore(true)}
                      className="text-white font-bold text-sm leading-tight truncate text-left w-full hover:text-white/80 transition"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    >
                      {receipt.storeName || 'Unknown Store'}
                    </button>
                  )}
                </div>

                {/* Client badge — always tappable */}
                <div className="relative flex-shrink-0" ref={clientPickerRef}>
                  <button
                    onClick={() => setShowClientPicker(p => !p)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap transition hover:brightness-125"
                    style={receipt.clientName
                      ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)' }
                      : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#6b7280', borderColor: 'rgba(255,255,255,0.1)' }
                    }
                  >
                    {receipt.clientName || '+ client'}
                    <ChevronDown size={8} />
                  </button>
                  {showClientPicker && (
                    <div className="absolute top-full left-0 mt-1 w-44 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl">
                      <button onClick={() => pickClient('')}
                        className="w-full px-3 py-2.5 text-xs text-left text-sb-muted hover:bg-white/5 flex items-center gap-2">
                        <X size={10} /> No client
                      </button>
                      {clients.length > 0 && <div className="border-t border-sb-border" />}
                      <div className="max-h-36 overflow-y-auto">
                        {clients.map(c => (
                          <button key={c} onClick={() => pickClient(c)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-xs text-left hover:bg-white/5 transition ${c === receipt.clientName ? 'bg-white/5' : ''}`}>
                            <span className="text-white">{c}</span>
                            {c === receipt.clientName && <Check size={10} className="text-sb-green" />}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-sb-border px-2 py-1.5 flex gap-1">
                        <input value={newClientInput} onChange={e => setNewClientInput(e.target.value)}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addNewClient(); }}
                          placeholder="+ new client"
                          className="flex-1 bg-transparent border-b border-sb-border text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-sb-green py-0.5" />
                        <button onClick={addNewClient} disabled={!newClientInput.trim()}
                          className="text-sb-green disabled:opacity-30"><Plus size={12} /></button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Category badge — always tappable */}
                <div className="relative flex-shrink-0" ref={catPickerRef}>
                  <button
                    onClick={() => setShowCatPicker(p => !p)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition hover:brightness-125"
                    style={{ backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}
                  >
                    {receipt.category || '+ cat'}
                    <ChevronDown size={8} />
                  </button>
                  {showCatPicker && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-40 shadow-2xl">
                      <div className="max-h-48 overflow-y-auto">
                        {getAllCategories(userId).map(cat => (
                          <button key={cat.name} onClick={() => pickCategory(cat.name)}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-white/5 transition ${cat.name === receipt.category ? 'bg-white/5' : ''}`}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-white flex-1">{cat.name}</span>
                            {cat.name === receipt.category && <Check size={10} className="text-sb-green" />}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-sb-border px-2 py-1.5 flex gap-1">
                        <input value={newCatInput} onChange={e => setNewCatInput(e.target.value)}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addNewCategory(); }}
                          placeholder="+ new category"
                          className="flex-1 bg-transparent border-b border-sb-border text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-sb-green py-0.5" />
                        <button onClick={addNewCategory} disabled={!newCatInput.trim()}
                          className="text-sb-green disabled:opacity-30"><Plus size={12} /></button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Trash — top right */}
                <button
                  onClick={() => confirmDelete ? (onDelete(receipt.id), setConfirmDelete(false)) : setConfirmDelete(true)}
                  onBlur={() => setConfirmDelete(false)}
                  className={`p-2 rounded-lg transition ml-auto flex-shrink-0 ${confirmDelete ? 'bg-red-950/40' : 'hover:bg-white/5'}`}
                  title="Delete">
                  <Trash2 size={15} color={confirmDelete ? '#f87171' : '#ef4444'} />
                </button>
              </div>

              {/* Line 2: date (left) · icons + total (right) */}
              <div className="flex items-center">
                <span className="text-[11px] text-sb-muted flex-shrink-0">{dateDisplay}</span>

                <div className="flex items-center gap-1 ml-auto">
                  {/* Pencil — yellow — inline item edit toggle */}
                  <button
                    onClick={() => editingItems ? saveItems() : setEditingItems(true)}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition flex-shrink-0"
                    title={editingItems ? 'Save items' : 'Edit items'}
                  >
                    {editingItems
                      ? <Check size={14} color="#4ade80" strokeWidth={2.5} />
                      : <Pencil size={14} color="#eab308" />
                    }
                  </button>

                  {/* Split — purple */}
                  {productItems.length > 0 && (
                    <button onClick={() => {
                      const el = document.createElement('div');
                      el.className = 'fixed top-6 left-1/2 -translate-x-1/2 bg-sb-card border border-sb-border text-white text-xs px-4 py-2 rounded-xl z-50 shadow-xl pointer-events-none';
                      el.textContent = 'Split receipt — coming soon';
                      document.body.appendChild(el);
                      setTimeout(() => el.remove(), 2000);
                    }} className="p-1.5 rounded-lg hover:bg-white/5 transition flex-shrink-0" title="Split receipt">
                      <SplitSquareHorizontal size={14} color="#a855f7" />
                    </button>
                  )}

                  {/* Share — blue */}
                  <button onClick={() => setShareOpen(true)}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition flex-shrink-0" title="Share">
                    <Share2 size={14} color="#3b82f6" />
                  </button>

                  {/* Total — live when editing, saved otherwise */}
                  <span className="text-sb-green font-bold text-sm flex-shrink-0 ml-1">
                    ${(editingItems ? liveTotals.total : receipt.total).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Line items ── */}
            <div className="px-4 pb-3 border-t border-sb-border pt-3 space-y-0.5" onClick={e => e.stopPropagation()}>
              {productItems.map((item, i) => {
                const originalIndex = allLineItems.indexOf(item);
                const checked = checkedItems.has(originalIndex);
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (!editingItems) return;
                      setCheckedItems(prev => {
                        const next = new Set(prev);
                        next.has(originalIndex) ? next.delete(originalIndex) : next.add(originalIndex);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-2 py-1 rounded transition ${editingItems ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}`}
                  >
                    {/* Checkbox slides in when editing */}
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

              {/* Tax — shown once, proportional if editing */}
              {taxItems.length > 0 && (
                <div className="border-t border-sb-border mt-2 pt-2 space-y-0.5">
                  {(editingItems ? liveTotals.proportionalTaxes.map(t => ({ description: t.label, amount: t.amount })) : taxItems).map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-sb-muted">{item.description}</span>
                      <span className="text-sb-muted">${item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Total only — no subtotal row */}
              <div className="border-t border-sb-border mt-2 pt-2 flex justify-between text-sm font-semibold">
                <span className="text-white">Total</span>
                <span className="text-sb-green">
                  ${(editingItems ? liveTotals.total : receipt.total).toFixed(2)}
                </span>
              </div>

              {receipt.notes && (
                <p className="text-sb-muted text-xs italic border-t border-sb-border pt-2">{receipt.notes}</p>
              )}
            </div>

            {/* ── Receipt photo ── */}
            {receipt.imageUrl ? (
              <div className="cursor-zoom-in border-t border-sb-border bg-black"
                   onClick={e => { e.stopPropagation(); setImgFullscreen(true); }}>
                <img src={receipt.imageUrl} alt="Receipt" className="w-full max-h-56 object-contain" />
                <p className="text-center text-[10px] text-sb-muted py-1">Tap to enlarge</p>
              </div>
            ) : (
              <div className="border-t border-sb-border flex items-center justify-center gap-2 py-4 text-sb-muted">
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
  const lastTouchMid  = useRef<{ x: number; y: number } | null>(null);
  const dragStart     = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  function getTouchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      lastTouchDist.current = getTouchDist(e.touches);
      lastTouchMid.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      dragStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        ox: offset.x,
        oy: offset.y,
      };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const newDist = getTouchDist(e.touches);
      const ratio = newDist / lastTouchDist.current;
      setScale(s => Math.min(Math.max(s * ratio, 1), 5));
      lastTouchDist.current = newDist;
    } else if (e.touches.length === 1 && dragStart.current && scale > 1) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) lastTouchDist.current = null;
    if (e.touches.length === 0) dragStart.current = null;
    if (scale <= 1) setOffset({ x: 0, y: 0 });
  }

  function handleTap() {
    if (scale === 1) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center"
      style={{ touchAction: 'none' }}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 safe-top z-10">
        <button onClick={onClose} className="text-white/70 hover:text-white transition p-1">
          <X size={22} />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setScale(s => Math.max(s - 0.5, 1)); if (scale - 0.5 <= 1) setOffset({ x: 0, y: 0 }); }}
            className="text-white/70 hover:text-white transition p-1"
            disabled={scale <= 1}
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-white/50 text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(s + 0.5, 5))}
            className="text-white/70 hover:text-white transition p-1"
            disabled={scale >= 5}
          >
            <ZoomIn size={20} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleTap}
      >
        <img
          src={src}
          alt="Receipt"
          draggable={false}
          style={{
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transformOrigin: 'center',
            transition: lastTouchDist.current ? 'none' : 'transform 0.1s ease-out',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            userSelect: 'none',
          }}
        />
      </div>

      {scale === 1 && (
        <p className="absolute bottom-8 text-white/30 text-xs">Tap to close · Pinch to zoom</p>
      )}
    </div>
  );
}

/* ── Inline re-edit modal ── */
interface ReEditModalProps {
  receipt: Receipt;
  userId: string;
  onClose: () => void;
  onSave: (updates: ReEditUpdates) => void;
}

function ReEditModal({ receipt, userId, onClose, onSave }: ReEditModalProps) {
  const allItems: { description: string; amount: number }[] = (() => {
    try {
      if (receipt.rawLineItems) return JSON.parse(receipt.rawLineItems);
      if (receipt.lineItems) return JSON.parse(receipt.lineItems);
    } catch {}
    return [];
  })();

  const savedItems: { description: string; amount: number }[] = (() => {
    try { return receipt.lineItems ? JSON.parse(receipt.lineItems) : []; } catch { return []; }
  })();
  const savedDescriptions = new Set(savedItems.filter(i => !isTaxLine(i.description)).map(i => i.description));
  const taxLineItems = allItems.filter(i => isTaxLine(i.description));

  const [storeName, setStoreName]   = useState(receipt.storeName);
  const [clientName, setClientName] = useState(receipt.clientName ?? '');
  const [category, setCategory]     = useState(receipt.category ?? '');

  // Client dropdown state
  const [clients, setClients]             = useState<string[]>(() => loadClients(userId));
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [newClientInput, setNewClientInput]     = useState('');
  const clientRef = useRef<HTMLDivElement>(null);

  // Category dropdown state
  const [showCatPicker, setShowCatPicker] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<Set<number>>(() => {
    const s = new Set<number>();
    allItems.forEach((item, i) => {
      if (!isTaxLine(item.description) && savedDescriptions.has(item.description)) s.add(i);
    });
    return s;
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (showClientPicker && clientRef.current && !clientRef.current.contains(e.target as Node)) setShowClientPicker(false);
      if (showCatPicker   && catRef.current    && !catRef.current.contains(e.target as Node))    setShowCatPicker(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showClientPicker, showCatPicker]);

  const lineItems = allItems;

  function toggleItem(index: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  const totals = computeReceiptTotals(lineItems, selected);

  function pickClient(name: string) {
    setClientName(name);
    setLastClient(userId, name);
    setShowClientPicker(false);
    setNewClientInput('');
  }

  function handleAddNewClient() {
    const trimmed = newClientInput.trim();
    if (!trimmed) return;
    const updated = addClient(userId, trimmed);
    setClients(updated);
    pickClient(trimmed);
  }

  function handleSave() {
    const selectedItems = lineItems.filter((item, i) =>
      isTaxLine(item.description) ? false : selected.has(i)
    );
    onSave({
      storeName,
      lineItems: JSON.stringify([...selectedItems, ...taxLineItems]),
      taxLines: JSON.stringify(totals.proportionalTaxes),
      subtotal: totals.selectedSubtotal,
      taxAmount: totals.totalTax,
      total: totals.total,
      clientName: clientName.trim() || null,
      category,
    });
  }

  const productItems = allItems.filter(i => !isTaxLine(i.description));
  const catColor = getCategoryColorDynamic(category, userId);

  return (
    <div className="fixed inset-0 z-50 bg-sb-bg flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sb-border safe-top">
        <h2 className="text-white font-semibold text-base">Edit Receipt</h2>
        <button onClick={onClose} className="text-sb-muted hover:text-white transition p-1">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* Store name */}
        <div className="bg-sb-card border border-sb-border rounded-xl px-4 py-3">
          <label className="block text-xs text-sb-muted mb-1">Store Name</label>
          <input
            value={storeName}
            onChange={e => setStoreName(e.target.value)}
            className="w-full bg-transparent text-white text-base font-semibold border-b border-sb-border pb-1 focus:outline-none focus:border-sb-green transition"
          />
        </div>

        {/* Client dropdown */}
        <div className="relative" ref={clientRef}>
          <button
            onClick={() => setShowClientPicker(p => !p)}
            className="w-full bg-sb-card border border-sb-border rounded-xl px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-sb-muted flex-shrink-0">Client</span>
              {clientName ? (
                <span className="text-white text-sm font-medium truncate">{clientName}</span>
              ) : (
                <span className="text-white/30 text-sm">Select or add client…</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {clientName && (
                <span onClick={e => { e.stopPropagation(); setClientName(''); }} className="text-sb-muted hover:text-white p-0.5">
                  <X size={12} />
                </span>
              )}
              <ChevronDown size={16} className="text-sb-muted" />
            </div>
          </button>
          {showClientPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sb-card border border-sb-border rounded-xl overflow-hidden z-30 shadow-2xl">
              <button
                onClick={() => { setClientName(''); setShowClientPicker(false); }}
                className="w-full px-4 py-2.5 text-sm text-left text-sb-muted hover:bg-white/5 transition"
              >
                No client
              </button>
              {clients.length > 0 && <div className="border-t border-sb-border" />}
              <div className="max-h-36 overflow-y-auto">
                {clients.map(c => (
                  <button key={c} onClick={() => pickClient(c)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-white/5 transition ${c === clientName ? 'bg-white/5' : ''}`}
                  >
                    <span className="text-white">{c}</span>
                    {c === clientName && <Check size={13} className="text-sb-green" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-sb-border px-3 py-2 flex items-center gap-2">
                <input
                  value={newClientInput}
                  onChange={e => setNewClientInput(e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleAddNewClient(); }}
                  onClick={e => e.stopPropagation()}
                  placeholder="New client…"
                  className="flex-1 bg-sb-card2 border border-sb-border rounded-lg px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-sb-green transition"
                />
                <button onClick={e => { e.stopPropagation(); handleAddNewClient(); }} disabled={!newClientInput.trim()}
                  className="p-1 rounded-lg text-sb-green disabled:opacity-30 hover:bg-sb-green/10 transition">
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Category dropdown */}
        <div className="relative" ref={catRef}>
          <button
            onClick={() => setShowCatPicker(p => !p)}
            className="w-full bg-sb-card border border-sb-border rounded-xl px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
              <span className="text-white text-sm font-medium">{category || 'Select category…'}</span>
            </div>
            <ChevronDown size={16} className="text-sb-muted" />
          </button>
          {showCatPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sb-card border border-sb-border rounded-xl overflow-y-auto z-30 shadow-2xl" style={{ maxHeight: '55vh' }}>
              {getAllCategories().map(cat => (
                <button key={cat.name} onClick={() => { setCategory(cat.name); setShowCatPicker(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-white/5 transition ${cat.name === category ? 'bg-white/5' : ''}`}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-white">{cat.name}</span>
                  {cat.name === category && <Check size={13} className="ml-auto text-sb-green" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items */}
        {productItems.length === 0 ? (
          <p className="text-sb-muted text-sm text-center py-8">No line items to edit.</p>
        ) : (
          <div className="bg-sb-card border border-sb-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-sb-border">
              <span className="text-xs text-sb-muted">
                {selected.size} of {productItems.length} items selected
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelected(new Set(lineItems.map((_, i) => i).filter(i => !isTaxLine(lineItems[i].description))))}
                  className="text-xs text-sb-green hover:underline"
                >
                  All
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-sb-muted hover:underline"
                >
                  None
                </button>
              </div>
            </div>

            <div className="divide-y divide-sb-border">
              {lineItems.map((item, index) => {
                if (isTaxLine(item.description)) return null;
                const checked = selected.has(index);
                return (
                  <button
                    key={index}
                    onClick={() => toggleItem(index)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                      checked ? 'bg-green-950/20' : 'hover:bg-white/5'
                    }`}
                  >
                    <div
                      className="w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition"
                      style={{
                        borderColor: checked ? '#4ade80' : '#555',
                        backgroundColor: checked ? 'rgba(74,222,128,0.15)' : 'transparent',
                      }}
                    >
                      {checked && <Check size={11} color="#4ade80" strokeWidth={3} />}
                    </div>
                    <span className={`flex-1 text-sm ${checked ? 'text-white' : 'text-sb-muted line-through'}`}>
                      {item.description}
                    </span>
                    <span className={`text-sm font-medium ${checked ? 'text-sb-green' : 'text-sb-muted'}`}>
                      {fmt(item.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {totals.proportionalTaxes.length > 0 && (
          <div className="mt-3 bg-sb-card border border-sb-border rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs text-sb-muted mb-2">Proportional Tax</p>
            {totals.proportionalTaxes.map((t, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-sb-muted">{t.label}</span>
                <span className="text-white">{fmt(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-sb-border px-4 py-4 safe-bottom">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-sb-muted">Total</p>
            <p className="text-2xl font-bold text-sb-green">{fmt(totals.total)}</p>
            {totals.totalTax > 0 && (
              <p className="text-xs text-sb-muted">
                {fmt(totals.selectedSubtotal)} + {fmt(totals.totalTax)} tax
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-sb-border text-sb-muted hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={selected.size === 0}
              className="px-6 py-2.5 rounded-xl bg-sb-green text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
