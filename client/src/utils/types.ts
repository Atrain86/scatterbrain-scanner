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
  paymentMethod: string | null; // "Visa" | "Mastercard" | "Amex" | "Debit" | "Cash" | "Other" | null
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
  paymentMethod: string | null;
}

// Built-in category default colors are drawn from the curated 12-hue palette
// (see utils/palette.ts, Phase 1 of the redesign spec). Mapped to nearest
// curated hue from the previous ad-hoc set so fresh installs / new users get
// the palette from day 1. Existing users' custom_categories are migrated
// separately via the "Preview palette migration" button in Settings.
export const CATEGORIES = [
  { name: 'Comm',                 color: '#5cbfae', tailwind: 'cat-comm' },
  { name: 'Loan/Interest',        color: '#e0725f', tailwind: 'cat-loan' },
  { name: 'Meals',                color: '#6bc48a', tailwind: 'cat-meals' },
  { name: 'Medical',              color: '#6b95d9', tailwind: 'cat-medical' },
  { name: 'Postage',              color: '#e0a35f', tailwind: 'cat-postage' },
  { name: 'Supplies & Hardware',  color: '#d9c15c', tailwind: 'cat-supplies' },
  { name: 'AI Services',          color: '#af7bd1', tailwind: 'cat-ai' },
  { name: 'Insurance',            color: '#8b83d9', tailwind: 'cat-insurance' },
  { name: 'Rent',                 color: '#5cb0c9', tailwind: 'cat-rent' },
  { name: 'Travel',               color: '#5cbfae', tailwind: 'cat-travel' },
  { name: 'Subscriptions',        color: '#d16b93', tailwind: 'cat-subscriptions' },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];

export function getCategoryColor(name: string): string {
  return CATEGORIES.find(c => c.name === name)?.color ?? '#6B7280';
}

// userId is REQUIRED. Custom categories are user-owned; there is no shared
// category set. The pre-account-safety-v2 code fell back to `sb_custom_categories`
// (unnamespaced) when userId was missing — same class of leak as the cloud
// settings bucket. User A's custom "Materials — Metro Site" category would
// appear in User B's picker on the same device.
//
// Blank-canvas contract (post-bleed-alarm): this function returns ONLY the
// user's own custom entries. Built-in CATEGORIES are NOT merged in — that
// merge was the source of the "bleed" complaint (every new user saw the 11
// built-ins and thought Alan's categories had leaked). Categories are now
// personal from day one; a new user's list is empty until they add entries
// or scan receipts that generate them.
//
// CATEGORIES is kept for the getCategoryColor() legacy fallback (used by
// receipt cards when a receipt has a category name that isn't in the user's
// custom list — e.g. imported from Drive with a name that predates the
// user's own list). Nothing else in the app should rely on the built-ins.
export function getAllCategories(userId: string): { name: string; color: string }[] {
  try {
    const stored = JSON.parse(localStorage.getItem(`sb_u${userId}_custom_categories`) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (c): c is { name: string; color: string } =>
        typeof c === 'object' && c !== null &&
        typeof (c as { name: unknown }).name === 'string' &&
        typeof (c as { color: unknown }).color === 'string'
    );
  } catch {
    return [];
  }
}

export function saveUserCategories(userId: string, cats: { name: string; color: string }[]): void {
  localStorage.setItem(`sb_u${userId}_custom_categories`, JSON.stringify(cats));
}

// Auto-add a category to the user's custom list if it isn't already there.
// Called at receipt-save time (LineItemSelector.handleSave) so the user's
// category list grows organically from real receipts, matching the
// blank-canvas contract without leaving the picker empty forever. If the
// category already exists (case-insensitive), this is a no-op — we don't
// touch the existing entry (preserves any color the user has assigned).
// Never called with an empty name.
export function ensureCategoryExists(userId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const key = `sb_u${userId}_custom_categories`;
  let existing: { name: string; color: string }[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch { /* fall through — will overwrite corrupted value */ }

  if (existing.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return;

  // Pick a palette color the user hasn't used yet; if all 12 are taken,
  // just start reusing from the top (color reuse is allowed — the name
  // is the identity, per the older category-sync gap memo).
  // Uses CATEGORIES built-ins for a stable name→color hint when we can,
  // otherwise falls back to the next unused palette hue.
  const usedColors = new Set(existing.map(c => c.color.toLowerCase()));
  const preferred = CATEGORIES.find(c => c.name.toLowerCase() === trimmed.toLowerCase())?.color;
  let color: string;
  if (preferred && !usedColors.has(preferred.toLowerCase())) {
    color = preferred;
  } else {
    const palette = CATEGORIES.map(c => c.color); // curated palette hue set
    const firstUnused = palette.find(c => !usedColors.has(c.toLowerCase()));
    color = firstUnused ?? palette[existing.length % palette.length];
  }

  const next = [...existing, { name: trimmed, color }];
  localStorage.setItem(key, JSON.stringify(next));
}

export function getCategoryColorDynamic(name: string, userId: string): string {
  const target = name.toLowerCase();
  return getAllCategories(userId).find(c => c.name.toLowerCase() === target)?.color ?? '#6B7280';
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
