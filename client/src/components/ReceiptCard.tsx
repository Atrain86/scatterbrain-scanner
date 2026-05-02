import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Trash2, Check, Pencil, Share2, Image as ImageIcon } from 'lucide-react';
import type { Receipt } from '../utils/types';
import { CATEGORIES, getCategoryColor } from '../utils/types';
import { isTaxLine } from '../utils/taxCalc';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from './ShareModal';

interface Props {
  receipt: Receipt;
  onDelete: (id: number) => void;
  onUpdateCategory: (id: number, category: string) => void;
}

export default function ReceiptCard({ receipt, onDelete, onUpdateCategory }: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [editingCat, setEditingCat] = useState(false);
  const [imgFullscreen, setImgFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const catPickerRef = useRef<HTMLDivElement>(null);

  const catColor = getCategoryColor(receipt.category);
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
            <p className="text-sb-purple font-bold text-sm leading-tight truncate"
               style={{ fontFamily: "'Poppins', sans-serif" }}>
              {receipt.storeName}
            </p>
            <p className="text-[11px] text-sb-muted leading-snug">{dateDisplay}</p>
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
                {CATEGORIES.map(cat => (
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
    </>
  );
}
