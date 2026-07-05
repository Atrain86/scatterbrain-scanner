// ─── Canonical user category store ────────────────────────────────────────────
//
// One source of truth for the USER'S editable category list. Every surface that
// reads/writes categories (Settings, receipt picker, split-mode picker) must go
// through this module. Storage is per-user localStorage.
//
// IMPORTANT — decoupled from AI vocabulary:
//   The AI parser has its own internal category vocabulary (see server prompts).
//   That vocab is NOT loaded into the user's editable list. Instead, when a
//   receipt is saved with a category name, `ensureCategoryFromReceipt()` adds
//   that name to the user's list on the fly with a generated color. This means:
//     • New users start with an EMPTY editable list.
//     • The list grows organically from what the AI actually tagged onto their
//       real receipts, plus anything they create manually.

export interface UserCategory {
  name: string;
  color: string;
}

const KEY = (userId: string) => `sb_u${userId}_categories_v3`;

// Old keys we migrate away from — if any of these exist, we import them once.
const LEGACY_KEYS = (userId: string) => [
  `sb_u${userId}_custom_categories`,
];

// Color assignment for AI-tagged categories that arrive without a color choice.
// Deterministic so the same name always gets the same color across devices.
const AUTO_COLORS = [
  '#4ade80', '#60a5fa', '#eab308', '#a855f7', '#f472b6',
  '#4ECDC4', '#F44747', '#0C87C1', '#2DD4BF', '#E67E22',
  '#888888', '#6366F1', '#22C55E', '#F5C518',
];

function autoColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AUTO_COLORS[Math.abs(hash) % AUTO_COLORS.length];
}

function readRaw(userId: string): UserCategory[] {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(c => c && typeof c.name === 'string');
    }
    // Migrate legacy stores ONE TIME — copy into new key without preloading defaults.
    for (const legacy of LEGACY_KEYS(userId)) {
      const legacyRaw = localStorage.getItem(legacy);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Only migrate if user actually customized — heuristic: any name
          // that isn't in the well-known "default 11" list survives.
          // (We deliberately migrate EVERYTHING here because at this point in the
          // migration we can't tell "user kept defaults" from "user deliberately
          // wants those names" — better to be conservative and not delete work.)
          localStorage.setItem(KEY(userId), JSON.stringify(parsed));
          return parsed as UserCategory[];
        }
      }
    }
    return [];
  } catch {
    return [];
  }
}

function writeRaw(userId: string, list: UserCategory[]): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(list));
    // Notify listeners (e.g. Settings + receipt pickers) to refetch
    window.dispatchEvent(new CustomEvent('categories-updated', { detail: { userId } }));
  } catch {}
}

export function loadCategories(userId: string): UserCategory[] {
  return readRaw(userId);
}

export function saveCategories(userId: string, list: UserCategory[]): void {
  writeRaw(userId, list);
}

/**
 * Add a category with a chosen color (from the Settings palette or the New
 * Category sheet). Case-insensitive dedupe against existing names.
 * Returns the updated list.
 */
export function addCategory(userId: string, name: string, color: string): UserCategory[] {
  const trimmed = name.trim();
  if (!trimmed) return loadCategories(userId);
  const list = loadCategories(userId);
  if (list.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return list;
  const updated = [...list, { name: trimmed, color }];
  writeRaw(userId, updated);
  return updated;
}

/**
 * Ensure a category exists in the user's editable list. Called when a receipt
 * arrives with an AI-tagged category name. Idempotent — safe to call
 * repeatedly. If the name is not yet in the list, adds it with a deterministic
 * auto-color; if already present, no-op.
 */
export function ensureCategoryFromReceipt(userId: string, name: string): UserCategory[] {
  const trimmed = name.trim();
  if (!trimmed) return loadCategories(userId);
  const list = loadCategories(userId);
  if (list.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return list;
  const updated = [...list, { name: trimmed, color: autoColorFor(trimmed) }];
  writeRaw(userId, updated);
  return updated;
}

export function removeCategory(userId: string, name: string): UserCategory[] {
  const list = loadCategories(userId).filter(c => c.name.toLowerCase() !== name.toLowerCase());
  writeRaw(userId, list);
  return list;
}

export function updateCategoryColor(userId: string, name: string, color: string): UserCategory[] {
  const list = loadCategories(userId).map(c =>
    c.name.toLowerCase() === name.toLowerCase() ? { ...c, color } : c
  );
  writeRaw(userId, list);
  return list;
}

export function getCategoryColorFromStore(userId: string, name: string): string {
  const found = loadCategories(userId).find(c => c.name.toLowerCase() === name.toLowerCase());
  if (found) return found.color;
  // Fall back to deterministic auto-color even if not in list, so at least
  // charts/badges render a consistent color for AI tags in-transit.
  return autoColorFor(name);
}
