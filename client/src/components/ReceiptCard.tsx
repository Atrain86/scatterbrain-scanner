import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Trash2, Check, Pencil, Share2, Image as ImageIcon, X } from 'lucide-react';
import type { Receipt } from '../utils/types';
import { getAllCategories, getCategoryColorDynamic } from '../utils/types';
import { isTaxLine, computeReceiptTotals, fmt } from '../utils/taxCalc';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from './ShareModal';

interface ReEditUpdates {
  storeName: string;
  lineItems: string;
  taxLines: string;
  subtotal: number;
  taxAmount: number;
  total: number;
}

interface Props {
  receipt: Receipt;
  onDelete: (id: number) => void;
  onUpdateCategory: (id: number, category: string) => void;
  onReEdit: (id: number, updates: ReEditUpdates) => void;
}

export default function ReceiptCard({ receipt, onDelete, onUpdateCategory, onReEdit }: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [editingCat, setEditingCat] = useState(false);
  const [imgFullscreen, setImgFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reEditOpen, setReEditOpen] = useState(false);
  const catPickerRef = useRef<HTMLDivElement>(null);

  const catColor = getCategoryColorDynamic(receipt.category);
  const lineItems: { description: string; amount: number }[] = receipt.lineItems
    ? JSON.parse(receipt.lineItems) : [];
  const productItems = lineItems.filter(i => !isTaxLine(i.description));
  const taxItems     = lineItems.filter(i =>  isTaxLine(i.description));

  const dateDisplay = new Date(receipt.receiptDate + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  useEffect(() => {
    if (!editingCat) return;
    function handleClick(e: MouseEvent) {
      if (catPickerRef.current && !catPickerRef.current.contains(e.target as Node)) {
        setEditingCat(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editingCat]);

  function pickCategory(name: string) {
    onUpdateCategory(receipt.id, name);
    setEditingCat(false);
  }

  return (
    <>
      <div className="bg-sb-card rounded-xl border border-sb-border overflow-visible">

        {/* ── Collapsed row ── */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-white/5 transition"
        >
          {/* Category color bar */}
          <span
            className="w-1 self-stretch rounded-full flex-shrink-0"
            style={{ backgroundColor: catColor, minHeight: 32 }}
          />

          {/* Store + date */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight truncate"
               style={{ fontFamily: "'Poppins', sans-serif" }}>
              {receipt.storeName}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[11px] text-sb-muted leading-snug">{dateDisplay}</p>
              {receipt.clientName && (
                <span className="text-[10px] px-1.5 py-0 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/40 leading-snug">
                  {receipt.clientName}
                </span>
              )}
            </div>
          </div>

          {/* Total */}
          <span className="text-sb-green font-bold text-base leading-tight flex-shrink-0">
            ${receipt.total.toFixed(2)}
          </span>

          <span className="text-sb-muted flex-shrink-0 ml-0.5">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {/* ── Action row (always visible) ── */}
        <div className="flex items-center justify-between px-3 pb-1.5">
          {/* Category pill — tap to edit */}
          <div className="relative" ref={editingCat ? catPickerRef : undefined}>
            <button
              onClick={e => { e.stopPropagation(); setEditingCat(p => !p); }}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition hover:brightness-125"
              style={{
                backgroundColor: catColor + '22',
                color: catColor,
                border: `1px solid ${catColor}44`,
              }}
            >
              {receipt.category}
              <Pencil size={9} />
            </button>

            {editingCat && (
              <div
                ref={catPickerRef}
                className="absolute top-full left-0 mt-1 w-52 bg-sb-card2 border border-sb-border rounded-xl overflow-hidden z-30 shadow-2xl"
                style={{ animation: 'fadeIn 120ms ease-out' }}
              >
                {getAllCategories().map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => pickCategory(cat.name)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/5 transition"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-white flex-1">{cat.name}</span>
                    {cat.name === receipt.category && <Check size={11} className="text-sb-green" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShareOpen(true)}
              className="text-sb-purple hover:brightness-125 transition"
              title="Share"
            >
              <Share2 size={15} />
            </button>
            <button
              onClick={() => onDelete(receipt.id)}
              className="text-sb-red hover:brightness-125 transition"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* ── Expanded detail ── */}
        {expanded && (
          <div className="border-t border-sb-border animate-fade-in">

            {/* Receipt image */}
            {receipt.imageUrl ? (
              <div
                className="cursor-zoom-in border-b border-sb-border bg-black"
                onClick={() => setImgFullscreen(true)}
              >
                <img
                  src={receipt.imageUrl}
                  alt="Receipt"
                  className="w-full max-h-56 object-contain"
                />
                <p className="text-center text-[10px] text-sb-muted py-1">Tap to enlarge</p>
              </div>
            ) : (
              <div className="border-b border-sb-border flex items-center justify-center gap-2 py-4 text-sb-muted">
                <ImageIcon size={16} />
                <span className="text-xs">No receipt image</span>
              </div>
            )}

            <div className="px-4 py-3 space-y-3">
              {/* Product line items */}
              {productItems.length > 0 && (
                <div className="space-y-1">
                  {productItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-sb-muted flex-1 pr-3 leading-snug">{item.description}</span>
                      <span className="text-white flex-shrink-0">${item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tax lines */}
              {taxItems.length > 0 && (
                <div className="space-y-1 border-t border-sb-border pt-2">
                  {taxItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-sb-muted">{item.description}</span>
                      <span className="text-sb-muted">${item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div className="border-t border-sb-border pt-2 space-y-1">
                {receipt.subtotal > 0 && receipt.taxAmount > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-sb-muted">Subtotal</span>
                      <span className="text-white">${receipt.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-sb-muted">Tax</span>
                      <span className="text-white">${receipt.taxAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-white">Total</span>
                  <span className="text-sb-green">${receipt.total.toFixed(2)}</span>
                </div>
              </div>

              {receipt.notes && (
                <p className="text-sb-muted text-xs italic border-t border-sb-border pt-2">{receipt.notes}</p>
              )}

              {/* Edit Items button */}
              {productItems.length > 0 && (
                <button
                  onClick={() => setReEditOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-sb-border text-white/60 text-xs hover:text-white hover:border-sb-muted transition"
                >
                  <Pencil size={13} />
                  Edit Items
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {shareOpen && (
        <ShareModal
          receipt={receipt}
          onClose={() => setShareOpen(false)}
          userEmail={user?.email ?? ''}
        />
      )}

      {imgFullscreen && receipt.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setImgFullscreen(false)}
        >
          <img
            src={receipt.imageUrl}
            alt="Receipt"
            className="max-w-full max-h-full object-contain rounded-xl"
          />
        </div>
      )}

      {/* ── Re-edit modal ── */}
      {reEditOpen && (
        <ReEditModal
          receipt={receipt}
          onClose={() => setReEditOpen(false)}
          onSave={(updates) => {
            onReEdit(receipt.id, updates);
            setReEditOpen(false);
          }}
        />
      )}
    </>
  );
}

/* ── Inline re-edit modal ── */
interface ReEditModalProps {
  receipt: Receipt;
  onClose: () => void;
  onSave: (updates: ReEditUpdates) => void;
}

function ReEditModal({ receipt, onClose, onSave }: ReEditModalProps) {
  // Use rawLineItems (full original scan) if available, else fall back to saved lineItems
  const allItems: { description: string; amount: number }[] = (() => {
    try {
      if (receipt.rawLineItems) return JSON.parse(receipt.rawLineItems);
      if (receipt.lineItems) return JSON.parse(receipt.lineItems);
    } catch {}
    return [];
  })();

  // Which items are currently saved
  const savedItems: { description: string; amount: number }[] = (() => {
    try { return receipt.lineItems ? JSON.parse(receipt.lineItems) : []; } catch { return []; }
  })();
  const savedDescriptions = new Set(savedItems.filter(i => !isTaxLine(i.description)).map(i => i.description));

  const taxLineItems = allItems.filter(i => isTaxLine(i.description));

  const [storeName, setStoreName] = useState(receipt.storeName);

  // Pre-check items that are in the saved set
  const [selected, setSelected] = useState<Set<number>>(() => {
    const s = new Set<number>();
    allItems.forEach((item, i) => {
      if (!isTaxLine(item.description) && savedDescriptions.has(item.description)) s.add(i);
    });
    return s;
  });

  const lineItems = allItems;

  function toggleItem(index: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  const totals = computeReceiptTotals(lineItems, selected);

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
    });
  }

  const productItems = allItems.filter(i => !isTaxLine(i.description));

  return (
    <div className="fixed inset-0 z-50 bg-sb-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sb-border safe-top">
        <h2 className="text-white font-semibold text-base">Edit Receipt</h2>
        <button onClick={onClose} className="text-sb-muted hover:text-white transition p-1">
          <X size={20} />
        </button>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* Store name editable */}
        <div className="bg-sb-card border border-sb-border rounded-xl px-4 py-3">
          <label className="block text-xs text-sb-muted mb-1">Store Name</label>
          <input
            value={storeName}
            onChange={e => setStoreName(e.target.value)}
            className="w-full bg-transparent text-white text-base font-semibold border-b border-sb-border pb-1 focus:outline-none focus:border-sb-green transition"
          />
        </div>

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

        {/* Proportional tax summary */}
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

      {/* Footer */}
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
