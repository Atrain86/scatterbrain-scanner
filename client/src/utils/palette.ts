// Curated 12-hue palette — Phase 1 of the redesign spec.
//
// Design rationale (from spec):
// - Constant saturation/lightness, hue-walked around the color wheel.
// - Replaces the previous 46-color rainbow picker.
// - Category color appears in exactly 3 quiet places: receipt card left-edge bar,
//   the small dot in the category badge, and Dashboard chart bars. Never as a
//   full badge fill. This palette is tuned for those uses — muted enough not
//   to fight the content, distinct enough to be identifiable at a glance.

export const CURATED_PALETTE: readonly string[] = [
  '#e0725f', // 1  warm red
  '#e0a35f', // 2  orange
  '#d9c15c', // 3  yellow
  '#9fc46b', // 4  yellow-green
  '#6bc48a', // 5  green
  '#5cbfae', // 6  teal
  '#5cb0c9', // 7  cyan
  '#6b95d9', // 8  blue
  '#8b83d9', // 9  indigo
  '#af7bd1', // 10 violet
  '#cf78bf', // 11 magenta
  '#d16b93', // 12 pink
] as const;

// Parse a hex color to RGB triplet. Accepts #rgb, #rrggbb, upper/lowercase.
// Returns null for anything unparseable so callers can fall back safely.
function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if ([r, g, b].every(v => Number.isFinite(v))) return [r, g, b];
    return null;
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if ([r, g, b].every(v => Number.isFinite(v))) return [r, g, b];
    return null;
  }
  return null;
}

// Return the palette color nearest to the given hex, by Euclidean RGB distance.
// Used for the one-time migration that re-maps existing category colors onto
// the curated palette. Any invalid input falls back to palette[0] deterministically.
export function nearestCuratedColor(hex: string): string {
  const target = hexToRgb(hex);
  if (!target) return CURATED_PALETTE[0];

  let bestColor = CURATED_PALETTE[0];
  let bestDist = Infinity;

  for (const candidate of CURATED_PALETTE) {
    const rgb = hexToRgb(candidate);
    if (!rgb) continue;
    const [dr, dg, db] = [rgb[0] - target[0], rgb[1] - target[1], rgb[2] - target[2]];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestColor = candidate;
    }
  }
  return bestColor;
}

// Case-insensitive membership check. `isCurated('#E0725F') === true`.
export function isCurated(hex: string): boolean {
  const lower = hex.toLowerCase().trim();
  return CURATED_PALETTE.some(c => c.toLowerCase() === lower);
}

// ── Category re-map migration ────────────────────────────────────────────────
// Read-only planner + destructive executor for the Phase 1 palette migration.
// Any category whose color is NOT already in the curated palette gets remapped
// to its nearest curated color. Same shape as the v0.10.6 dedupe: preview first,
// user confirms, then execute.

export interface CategoryRemap {
  name: string;
  from: string;
  to: string;
}

export interface PaletteMigrationPlan {
  remaps: CategoryRemap[];        // categories whose color WILL change
  alreadyCurated: string[];       // category names whose color is already in the palette (no-op)
  totalCategories: number;
}

export function previewPaletteMigration(
  categories: { name: string; color: string }[],
): PaletteMigrationPlan {
  const remaps: CategoryRemap[] = [];
  const alreadyCurated: string[] = [];

  for (const cat of categories) {
    if (isCurated(cat.color)) {
      alreadyCurated.push(cat.name);
    } else {
      const nearest = nearestCuratedColor(cat.color);
      remaps.push({ name: cat.name, from: cat.color, to: nearest });
    }
  }

  return { remaps, alreadyCurated, totalCategories: categories.length };
}

export function applyPaletteMigration(
  categories: { name: string; color: string }[],
  plan: PaletteMigrationPlan,
): { name: string; color: string }[] {
  const remapByName = new Map(plan.remaps.map(r => [r.name, r.to]));
  return categories.map(cat => {
    const to = remapByName.get(cat.name);
    return to ? { ...cat, color: to } : cat;
  });
}
