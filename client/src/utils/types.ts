export interface ReceiptLineItem {
  description: string;
  amount: number;
}

export interface TaxLine {
  label: string;
  amount: number;
}

export interface Receipt {
  id: number;
  storeName: string;
  receiptDate: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  category: string;
  clientName: string | null;
  lineItems: string | null; // JSON string
  taxLines: string | null;  // JSON string
  imagePath: string | null;
  imageUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScannedReceiptData {
  vendor: string;
  date: string | null;
  lineItems: ReceiptLineItem[] | null;
  totalAmount: number;
  suggestedCategory: string;
  confidence: number;
  method: string;
}

export const CATEGORIES = [
  { name: 'Supplies & Materials', color: '#E67E22', tailwind: 'cat-supplies' },
  { name: 'Gas & Fuel',           color: '#F44747', tailwind: 'cat-gas' },
  { name: 'Vehicle & Auto',       color: '#0C87C1', tailwind: 'cat-vehicle' },
  { name: 'Equipment & Tools',    color: '#eab308', tailwind: 'cat-equipment' },
  { name: 'Meals & Entertainment',color: '#4ade80', tailwind: 'cat-meals' },
  { name: 'Office Supplies',      color: '#a855f7', tailwind: 'cat-office' },
  { name: 'Subcontractors',       color: '#4ECDC4', tailwind: 'cat-subs' },
  { name: 'Insurance',            color: '#888888', tailwind: 'cat-insurance' },
  { name: 'Phone & Internet',     color: '#2DD4BF', tailwind: 'cat-phone' },
  { name: 'Other',                color: '#6B7280', tailwind: 'cat-other' },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];

export function getCategoryColor(name: string): string {
  return CATEGORIES.find(c => c.name === name)?.color ?? '#6B7280';
}

export function getAllCategories(): { name: string; color: string }[] {
  const builtin = CATEGORIES.map(c => ({ name: c.name, color: c.color }));
  try {
    const custom = JSON.parse(localStorage.getItem('sb_custom_categories') || '[]');
    return [...builtin, ...(Array.isArray(custom) ? custom : [])];
  } catch { return builtin; }
}

export function getCategoryColorDynamic(name: string): string {
  return getAllCategories().find(c => c.name === name)?.color ?? '#6B7280';
}
