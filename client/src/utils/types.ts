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
  lineItems: string | null;    // JSON: saved (selected) items
  rawLineItems: string | null; // JSON: full original scan, never trimmed
  taxLines: string | null;     // JSON: [{label, amount}]
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
  { name: 'Comm',                 color: '#2DD4BF', tailwind: 'cat-comm' },
  { name: 'Loan/Interest',        color: '#F44747', tailwind: 'cat-loan' },
  { name: 'Meals',                color: '#4ade80', tailwind: 'cat-meals' },
  { name: 'Medical',              color: '#60a5fa', tailwind: 'cat-medical' },
  { name: 'Postage',              color: '#E67E22', tailwind: 'cat-postage' },
  { name: 'Supplies & Hardware',  color: '#eab308', tailwind: 'cat-supplies' },
  { name: 'AI Services',          color: '#a855f7', tailwind: 'cat-ai' },
  { name: 'Insurance',            color: '#888888', tailwind: 'cat-insurance' },
  { name: 'Rent',                 color: '#0C87C1', tailwind: 'cat-rent' },
  { name: 'Travel',               color: '#4ECDC4', tailwind: 'cat-travel' },
  { name: 'Subscriptions',        color: '#f472b6', tailwind: 'cat-subscriptions' },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];

export interface CloudSyncQueueItem {
  id: string;
  provider: CloudProvider;
  receiptId: number;
  imageUrl: string | null;
  imageName: string;
  metadata: Record<string, any>;
  createdAt: number;
  attemptCount: number;
  lastError: string | null;
}

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

export type CloudProvider = 'google-drive' | 'dropbox';

export interface CloudProviderState {
  connected: boolean;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string | null;
  tokenType: string | null;
}

export interface CloudSettings {
  googleDrive: CloudProviderState;
  dropbox: CloudProviderState;
  primaryProvider: CloudProvider | null;
  autoSync: boolean;
}
