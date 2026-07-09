import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Plus, X, Trash2 } from 'lucide-react';
import { computeReceiptTotals, isTaxLine, fmt } from '../utils/taxCalc';
import type { ScannedReceiptData, ReceiptLineItem } from '../utils/types';
import { getAllCategories } from '../utils/types';
import { loadClients, addClient, getLastClient, setLastClient } from '../utils/clients';
import { useAuth } from '../contexts/AuthContext';

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
    rawLineItems: string;
    taxLines: string;
  }) => void;
  onBack: () => void;
  error?: string;
}

interface EditableItem extends ReceiptLineItem {
  id: string;
  isManual?: boolean;
  isSelected: boolean;
}

let idCounter = 0;
function makeId() { return `item-${++idCounter}`; }

export default function LineItemSelector({ scanned, onSave, onBack, error }: Props) {
  const { user } = useAuth();
  const userId = user!.id;

  const initialItems: EditableItem[] = (scanned.lineItems || [])
    .filter(item => !isTaxLine(item.description))
    .map(item => ({ ...item, id: makeId(), isSelected: true }));

  const initialTaxItems: ReceiptLineItem[] = (scanned.lineItems || [])
    .filter(item => isTaxLine(item.description));

  const [storeName,    setStoreName]    = useState(scanned.vendor || '');
  const [receiptDate,  setReceiptDate]  = useState(scanned.date || new Date().toISOString().split('T')[0]);
  const [category,     setCategory]     = useState(scanned.suggestedCategory || 'Other');
  const [items,        setItems]        = useState<EditableItem[]>(initialItems);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [fallbackTotal, setFallbackTotal] = useState(scanned.totalAmount.toFixed(2));
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const fallbackMode = (scanned.lineItems || []).length === 0;

  // Client state
  const [clients,         setClients]         = useState<string[]>(() => loadClients(userId));
  const [clientName,      setClientName]      = useState(() => getLastClient(userId));
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [newClientName,   setNewClientName]   = useState('');
  const clientPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showClientPicker) return;
    function handleClick(e: MouseEvent) {
      if (clientPickerRef.current && !clientPickerRef.current.contains(e.target as Node)) {
        setShowClientPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showClientPicker]);

  function pickClient(name: string) {
    setClientName(name);
    setLastClient(userId, name);
    setShowClientPicker(false);
    setNewClientName('');
  }

  function clearClient() {
    setClientName('');
    setLastClient(userId, '');
  }

  function handleAddNewClient() {
    const trimmed = newClientName.trim();
    if (!trimmed) return;
    const updated = addClient(userId, trimmed);
    setClients(updated);
    pickClient(trimmed);
  }

  // ── Item manipulation ────────────────────────────────────────────────────

  function toggleItem(id: string) {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, isSelected: !item.isSelected } : item
    ));
  }

  function selectAll()  { setItems(prev => prev.map(i => ({ ...i, isSelected: true }))); }
  function selectNone() { setItems(prev => prev.map(i => ({ ...i, isSelected: false }))); }

  function deleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function updateItem(id: string, changes: Partial<EditableItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
  }

  function addItem() {
    const newItem: EditableItem = {
      id: makeId(),
      description: '',
      amount: 0,
      isManual: true,
      isSelected: true,
    };
    setItems(prev => [...prev, newItem]);
    setEditingId(newItem.id);
  }

  // ── Totals ───────────────────────────────────────────────────────────────

  const selectedItems  = items.filter(i => i.isSelected);
  const selectedSubtotal = selectedItems.reduce((s, i) => s + i.amount, 0);
  const allSubtotal    = items.reduce((s, i) => s + i.amount, 0);
  const allSelected    = items.length > 0 && items.every(i => i.isSelected);

  // Use AI total when all items selected and AI total > our sum (tax not in line items)
  const aiTotal = scanned.totalAmount;
  const taxFromAI = (!fallbackMode && allSelected && aiTotal > selectedSubtotal)
    ? parseFloat((aiTotal - selectedSubtotal).toFixed(2))
    : null;

  // Proportional tax from tax line items (if OCR captured them)
  const taxLineItems = initialTaxItems;
  const allProductSubtotal = allSubtotal;
  const proportion = allProductSubtotal > 0 ? selectedSubtotal / allProductSubtotal : 0;
  const proportionalTaxes = taxLineItems.map(t => ({
    label: t.description,
    amount: parseFloat((t.amount * proportion).toFixed(2)),
  }));
  const taxFromLines = proportionalTaxes.reduce((s, t) => s + t.amount, 0);

  const totalTax = taxFromAI !== null ? taxFromAI : taxFromLines;
  const grandTotal = fallbackMode
    ? parseFloat(fallbackTotal) || 0
    : parseFloat((selectedSubtotal + totalTax).toFixed(2));

  // ── Save ─────────────────────────────────────────────────────────────────

  function handleSave() {
    if (clientName) setLastClient(userId, clientName);
    const saveItems = items.filter(i => i.isSelected).map(i => ({ description: i.description, amount: i.amount }));
    onSave({
      storeName,
      receiptDate,
      subtotal: selectedSubtotal,
      taxAmount: totalTax,
      total: grandTotal,
      category,
      clientName,
      lineItems:    JSON.stringify([...saveItems, ...taxLineItems]),
      rawLineItems: JSON.stringify(items.map(i => ({ description: i.description, amount: i.amount }))),
      taxLines:     JSON.stringify(proportionalTaxes),
    });
  }

  const allCategories = getAllCategories(userId);
  const selectedCategory = allCategories.find(c => c.name === category) ?? allCategories[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden max-w-2xl mx-auto w-full">
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
        </div>

        {/* Client dropdown */}
        <div className="relative" ref={clientPickerRef}>
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
                <span onClick={e => { e.stopPropagation(); clearClient(); }} className="text-sb-muted hover:text-white transition p-0.5">
                  <X size={12} />
                </span>
              )}
              <ChevronDown size={16} className="text-sb-muted" />
            </div>
          </button>

          {showClientPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sb-card border border-sb-border rounded-xl overflow-hidden z-20 shadow-xl">
              <button
                onClick={() => { clearClient(); setShowClientPicker(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/5 transition text-sb-muted"
              >
                No client
              </button>
              {clients.length > 0 && <div className="border-t border-sb-border" />}
              <div className="max-h-40 overflow-y-auto">
                {clients.map(c => (
                  <button
                    key={c}
                    onClick={() => pickClient(c)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-white/5 transition ${c === clientName ? 'bg-white/5' : ''}`}
                  >
                    <span className="text-white">{c}</span>
                    {c === clientName && <Check size={14} className="text-sb-green" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-sb-border px-3 py-2 flex items-center gap-2">
                <input
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleAddNewClient(); }}
                  onClick={e => e.stopPropagation()}
                  placeholder="New client…"
                  className="flex-1 bg-sb-card2 border border-sb-border rounded-lg px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-sb-green transition"
                />
                <button
                  onClick={e => { e.stopPropagation(); handleAddNewClient(); }}
                  disabled={!newClientName.trim()}
                  className="p-1 rounded-lg text-sb-green disabled:opacity-30 hover:bg-sb-green/10 transition"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Category */}
        <div className="relative">
          <button
            onClick={() => setShowCategoryPicker(p => !p)}
            className="w-full bg-sb-card border border-sb-border rounded-xl px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCategory.color }} />
              <span className="text-white text-sm font-medium">{category}</span>
            </div>
            <ChevronDown size={16} className="text-sb-muted" />
          </button>

          {showCategoryPicker && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-sb-card border border-sb-border rounded-xl overflow-y-auto z-10 shadow-xl" style={{ maxHeight: '60vh' }}>
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

        {/* Line items */}
        {fallbackMode ? (
          <div className="bg-sb-card border border-sb-border rounded-xl p-4">
            <p className="text-sb-muted text-xs mb-3">Couldn't read individual items. Enter the total manually.</p>
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
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-sb-border">
              <span className="text-xs text-sb-muted">
                {selectedItems.length} of {items.length} items selected
              </span>
              <div className="flex gap-3">
                <button onClick={selectAll}  className="text-xs text-sb-green hover:underline">All</button>
                <button onClick={selectNone} className="text-xs text-sb-muted hover:underline">None</button>
              </div>
            </div>

            {/* Items */}
            <div className="divide-y divide-sb-border">
              {items.map(item => {
                const isEditing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-2.5 transition ${item.isSelected ? 'bg-green-950/20' : 'opacity-50'}`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleItem(item.id)}
                      className="w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition"
                      style={{ borderColor: item.isSelected ? '#4ade80' : '#555', backgroundColor: item.isSelected ? 'rgba(74,222,128,0.15)' : 'transparent' }}
                    >
                      {item.isSelected && <Check size={11} color="#4ade80" strokeWidth={3} />}
                    </button>

                    {/* Description */}
                    {isEditing ? (
                      <input
                        autoFocus
                        value={item.description}
                        onChange={e => updateItem(item.id, { description: e.target.value })}
                        onBlur={() => { if (item.description && item.amount) setEditingId(null); }}
                        placeholder="Item description"
                        className="flex-1 bg-sb-card2 border border-sb-green/50 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:border-sb-green"
                      />
                    ) : (
                      <span
                        onClick={() => setEditingId(item.id)}
                        className={`flex-1 text-sm cursor-pointer ${item.isSelected ? 'text-white' : 'text-sb-muted line-through'}`}
                      >
                        {item.description || <span className="text-white/30 italic">tap to add description</span>}
                      </span>
                    )}

                    {/* Amount */}
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sb-muted text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount || ''}
                          onChange={e => updateItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                          onBlur={() => { if (item.description && item.amount) setEditingId(null); }}
                          placeholder="0.00"
                          className="w-20 bg-sb-card2 border border-sb-green/50 rounded px-2 py-0.5 text-sm text-white text-right focus:outline-none focus:border-sb-green"
                        />
                      </div>
                    ) : (
                      <span
                        onClick={() => setEditingId(item.id)}
                        className={`text-sm font-medium cursor-pointer ${item.isSelected ? 'text-sb-green' : 'text-sb-muted'}`}
                      >
                        {fmt(item.amount)}
                      </span>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1 text-sb-muted hover:text-red-400 transition flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add item button */}
            <button
              onClick={addItem}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-sb-muted hover:text-white hover:bg-white/5 transition border-t border-sb-border border-dashed"
            >
              <Plus size={14} />
              Add item
            </button>
          </div>
        )}

        {/* Tax summary */}
        {!fallbackMode && (taxFromAI !== null || proportionalTaxes.length > 0) && (
          <div className="bg-sb-card border border-sb-border rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs text-sb-muted mb-2">Tax (selected items)</p>
            {taxFromAI !== null ? (
              <div className="flex justify-between text-sm">
                <span className="text-sb-muted">Tax</span>
                <span className="text-white">{fmt(taxFromAI)}</span>
              </div>
            ) : proportionalTaxes.map((t, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-sb-muted">{t.label}</span>
                <span className="text-white">{fmt(t.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-3">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-sb-border px-4 py-4 safe-bottom space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-sb-muted">Total</p>
            <p className="text-2xl font-bold text-sb-green">{fmt(grandTotal)}</p>
            {!fallbackMode && totalTax > 0 && (
              <p className="text-xs text-sb-muted">{fmt(selectedSubtotal)} + {fmt(totalTax)} tax</p>
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
              disabled={!storeName || (!fallbackMode && selectedItems.length === 0)}
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
