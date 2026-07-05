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
  uuid: string;
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

// AI's INTERNAL vocabulary — used for chart color fallback + category recognition.
// This list is decoupled from the user's editable list (see utils/categories.ts).
// New users do NOT get these preloaded into their editable list. Instead, when the
// AI tags a receipt with one of these names, ensureCategoryFromReceipt() adds it
// to the user's canonical store on the fly.
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

export function getCategoryColor(name: string): string {
  return CATEGORIES.find(c => c.name === name)?.color ?? '#6B7280';
}

/**
 * Returns the USER'S editable category list from the canonical store.
 * Callers that need to render a color for a name not yet in the list should
 * use getCategoryColorDynamic() instead — it falls back through the AI vocab.
 */
export function getAllCategories(userId?: string): { name: string; color: string }[] {
  if (!userId) return [];
  try {
    // Read the canonical store directly (avoid circular import).
    const raw = localStorage.getItem(`sb_u${userId}_categories_v3`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(c => c && typeof c.name === 'string');
    }
  } catch {}
  return [];
}

/**
 * Color lookup that tries in order:
 *   1) User's canonical store (their picked color)
 *   2) Built-in AI vocabulary (matches the AI's known names)
 *   3) Generic grey
 */
export function getCategoryColorDynamic(name: string, userId?: string): string {
  if (userId) {
    const userMatch = getAllCategories(userId).find(c => c.name === name);
    if (userMatch) return userMatch.color;
  }
  const builtin = CATEGORIES.find(c => c.name === name);
  if (builtin) return builtin.color;
  return '#6B7280';
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
