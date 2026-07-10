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
// Canonical-store principle (redesign spec Phase 5): the user's own
// custom_categories bucket is the source of truth for color. Built-in
// CATEGORIES defaults are only used to seed the list — once the user has
// their own entry with the same name, THEIR color wins. Otherwise Settings
// (which reads custom_categories directly) and receipt cards (which read
// through this helper) can drift out of sync, e.g. after a palette migration.
export function getAllCategories(userId: string): { name: string; color: string }[] {
  try {
    const stored = JSON.parse(localStorage.getItem(`sb_u${userId}_custom_categories`) || '[]');
    const custom = Array.isArray(stored)
      ? stored.filter(
          (c): c is { name: string; color: string } =>
            typeof c === 'object' && c !== null && typeof (c as { name: unknown }).name === 'string' && typeof (c as { color: unknown }).color === 'string'
        )
      : [];

    // Custom entries win on name conflict — see docstring. Merge order:
    // start with built-ins, then let custom overwrite by name.
    const byName = new Map<string, { name: string; color: string }>();
    for (const c of CATEGORIES) byName.set(c.name.toLowerCase(), { name: c.name, color: c.color });
    for (const c of custom)     byName.set(c.name.toLowerCase(), { name: c.name, color: c.color });
    return Array.from(byName.values());
  } catch {
    return CATEGORIES.map(c => ({ name: c.name, color: c.color }));
  }
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
