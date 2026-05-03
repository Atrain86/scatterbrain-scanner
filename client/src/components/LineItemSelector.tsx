import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { computeReceiptTotals, isTaxLine, fmt } from '../utils/taxCalc';
import type { ScannedReceiptData, ReceiptLineItem } from '../utils/types';
import { getAllCategories } from '../utils/types';

interface Props {
  scanned: ScannedReceiptData;
  onSave: (payload: {
    storeName: string;
    receiptDate: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    category: string;
    clientName: string;
    lineItems: string;
    taxLines: string;
  }) => void;
  onBack: () => void;
  error?: string;
}

export default function LineItemSelector({ scanned, onSave, onBack, error }: Props) {
  const lineItems: ReceiptLineItem[] = scanned.lineItems || [];
  const productItems = lineItems.filter(item => !isTaxLine(item.description));

  const [storeName, setStoreName] = useState(scanned.vendor || '');
  const [receiptDate, setReceiptDate] = useState(scanned.date || new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState('');
  const [category, setCategory] = useState(scanned.suggestedCategory || 'Other');
  const [selected, setSelected] = useState<Set<number>>(() => {
    // Default: all product items selected
    const s = new Set<number>();
    lineItems.forEach((item, i) => { if (!isTaxLine(item.description)) s.add(i); });
    return s;
  });
  const [fallbackTotal, setFallbackTotal] = useState(scanned.totalAmount.toFixed(2));
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Fallback mode: AI couldn't parse line items
  const fallbackMode = lineItems.length === 0;

  function toggleItem(index: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(lineItems.map((_, i) => i).filter(i => !isTaxLine(lineItems[i].description))));
  }

  function selectNone() {
    setSelected(new Set());
  }

  const totals = fallbackMode
    ? { selectedSubtotal: parseFloat(fallbackTotal) || 0, proportionalTaxes: [], totalTax: 0, total: parseFloat(fallbackTotal) || 0 }
    : computeReceiptTotals(lineItems, selected);

  function handleSave() {
    // Only save the items the user selected (plus tax lines)
    const selectedItems = lineItems.filter((item, i) =>
      isTaxLine(item.description) ? false : selected.has(i)
    );
    const taxLines = lineItems.filter(i => isTaxLine(i.description));

    onSave({
      storeName,
      receiptDate,
      subtotal: totals.selectedSubtotal,
      taxAmount: totals.totalTax,
      total: totals.total,
      category,
      clientName,
      lineItems: JSON.stringify([...selectedItems, ...taxLines]),
      taxLines: JSON.stringify(totals.proportionalTaxes),
    });
  }

  const allCategories = getAllCategories();
  const selectedCategory = allCategories.find(c => c.name === category) ?? allCategories[allCategories.length - 1];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Scrollable item list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* Store name + date */}
        <div className="bg-sb-card border border-sb-border rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-sb-muted mb-1">Store Name</label>
            <input
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              className="w-full bg-transparent text-white text-base font-semibold border-b border-sb-border pb-1 focus:outline-none focus:border-sb-green transition"
            />
          </div>
          <div>
            <label className="block text-xs text-sb-muted mb-1">Date</label>
            <input
              type="date"
              value={receiptDate}
              onChange={e => setReceiptDate(e.target.value)}
              className="w-full bg-transparent text-white border-b border-sb-border pb-1 focus:outline-none focus:border-sb-green transition"
            />
          </div>
          <div>
            <label className="block text-xs text-sb-muted mb-1">Client <span className="opacity-50">(optional)</span></label>
            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="e.g. Smith Renovation"
              className="w-full bg-transparent text-white border-b border-sb-border pb-1 focus:outline-none focus:border-sb-green transition placeholder-white/30"
            />
          </div>
        </div>

        {/* Category */}
        <div className="relative">
          <button
            onClick={() => setShowCategoryPicker(p => !p)}
            className="w-full bg-sb-card border border-sb-border rounded-xl px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
              />
              <span className="text-white text-sm font-medium">{category}</span>
            </div>
            <ChevronDown size={16} className="text-sb-muted" />
          </button>

          {showCategoryPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sb-card border border-sb-border rounded-xl overflow-hidden z-10 shadow-xl">
              {allCategories.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => { setCategory(cat.name); setShowCategoryPicker(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-white/5 transition ${cat.name === category ? 'bg-white/5' : ''}`}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-white">{cat.name}</span>
                  {cat.name === category && <Check size={14} className="ml-auto text-sb-green" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items or fallback */}
        {fallbackMode ? (
          <div className="bg-sb-card border border-sb-border rounded-xl p-4">
            <p className="text-sb-muted text-xs mb-3">
              Couldn't read individual items. Enter the total manually.
            </p>
            <label className="block text-xs text-sb-muted mb-1">Total Amount</label>
            <div className="flex items-center gap-2">
              <span className="text-sb-muted">$</span>
              <input
                type="number"
                step="0.01"
                value={fallbackTotal}
                onChange={e => setFallbackTotal(e.target.value)}
                className="flex-1 bg-transparent text-white text-xl font-bold border-b border-sb-border pb-1 focus:outline-none focus:border-sb-green transition"
              />
            </div>
          </div>
        ) : (
          <div className="bg-sb-card border border-sb-border rounded-xl overflow-hidden">
            {/* Select all / none */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-sb-border">
              <span className="text-xs text-sb-muted">
                {selected.size} of {productItems.length} items selected
              </span>
              <div className="flex gap-3">
                <button onClick={selectAll}  className="text-xs text-sb-green hover:underline">All</button>
                <button onClick={selectNone} className="text-xs text-sb-muted hover:underline">None</button>
              </div>
            </div>

            {/* Items */}
            <div className="divide-y divide-sb-border">
              {lineItems.map((item, index) => {
                const isT = isTaxLine(item.description);
                if (isT) return null; // tax lines shown in summary, not selectable

                const checked = selected.has(index);
                return (
                  <button
                    key={index}
                    onClick={() => toggleItem(index)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                      checked ? 'bg-green-950/20' : 'hover:bg-white/5'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className="w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition"
                      style={{ borderColor: checked ? '#4ade80' : '#555', backgroundColor: checked ? 'rgba(74,222,128,0.15)' : 'transparent' }}
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

        {/* Tax summary */}
        {!fallbackMode && totals.proportionalTaxes.length > 0 && (
          <div className="bg-sb-card border border-sb-border rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs text-sb-muted mb-2">Proportional Tax (selected items only)</p>
            {totals.proportionalTaxes.map((t, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-sb-muted">{t.label}</span>
                <span className="text-white">{fmt(t.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sb-red text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-3">
            {error}
          </p>
        )}
      </div>

      {/* Footer — total + save */}
      <div className="border-t border-sb-border px-4 py-4 safe-bottom space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-sb-muted">Total</p>
            <p className="text-2xl font-bold text-sb-green">{fmt(totals.total)}</p>
            {!fallbackMode && totals.totalTax > 0 && (
              <p className="text-xs text-sb-muted">
                {fmt(totals.selectedSubtotal)} + {fmt(totals.totalTax)} tax
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl border border-sb-border text-sb-muted hover:text-white transition"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={!storeName || (!fallbackMode && selected.size === 0)}
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
