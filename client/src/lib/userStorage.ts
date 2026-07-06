// ─── Per-user localStorage — the ONE canonical helper for user data ──────────
//
// Rule (enforce forever): any localStorage key that stores USER-SCOPED data
// MUST be written through this module. Do NOT call localStorage.setItem/getItem
// directly for user data — that's exactly how Finding 5 crept in.
//
// Global (non-user) keys — auth token, feature flags, service-worker version,
// etc. — are the only ones allowed outside this module.
//
// All keys go through `userKey(userId, suffix)` which produces `sb_u{id}_{k}`.
// `clearUserStorage(userId)` removes every key matching that user's prefix.
// `useUserPref<T>(userId, key, default)` is a React hook for typed prefs.

import { useCallback, useEffect, useState } from 'react';

const PREFIX_FOR = (userId: string) => `sb_u${userId}_`;

// ── Raw key access ─────────────────────────────────────────────────────────────

export function userKey(userId: string, key: string): string {
  return `${PREFIX_FOR(userId)}${key}`;
}

export function getUserItem(userId: string, key: string): string | null {
  return localStorage.getItem(userKey(userId, key));
}

export function setUserItem(userId: string, key: string, value: string): void {
  localStorage.setItem(userKey(userId, key), value);
}

export function removeUserItem(userId: string, key: string): void {
  localStorage.removeItem(userKey(userId, key));
}

// ── Typed JSON access ──────────────────────────────────────────────────────────

export function getUserJson<T>(userId: string, key: string, fallback: T): T {
  try {
    const raw = getUserItem(userId, key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setUserJson<T>(userId: string, key: string, value: T): void {
  setUserItem(userId, key, JSON.stringify(value));
}

// ── Bulk clear (used on logout + on user-mismatch sign-in) ────────────────────

/**
 * Clear every localStorage key belonging to the given user. Safe to call at any
 * point — it only touches keys with the `sb_u{userId}_` prefix. Used by logout
 * (Finding 3) and by sign-in when the incoming user doesn't match resident data.
 */
export function clearUserStorage(userId: string): void {
  const prefix = PREFIX_FOR(userId);
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Clear per-user keys belonging to EVERY resident user on this device that
 * isn't the given "keep" user. Used defensively when we can't trust that only
 * one user's data has been left behind. Pass `null` to clear ALL users.
 */
export function clearAllOtherUsersStorage(keepUserId: string | null): void {
  const keepPrefix = keepUserId ? PREFIX_FOR(keepUserId) : null;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    // Match any per-user key (sb_u{something}_...)
    if (!k.startsWith('sb_u')) continue;
    if (keepPrefix && k.startsWith(keepPrefix)) continue;
    // Skip our small allow-list of things whose leading "sb_u" isn't a user prefix.
    // (Currently none — but this comment is where you'd add exceptions if any ever appear.)
    toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

// ── React hook for typed per-user preferences (Fix 5's pattern) ──────────────

/**
 * useUserPref — the "correct" way to add a new per-user preference.
 *
 * Example:
 *   const [chartCollapsed, setChartCollapsed] = useUserPref(userId, 'home_chart_collapsed', false);
 *
 * Guarantees:
 *   - Storage key is namespaced (sb_u{userId}_home_chart_collapsed) — no global leak possible.
 *   - Reads default value if key missing or corrupt.
 *   - Writes via setUserJson so JSON round-trip is safe.
 *   - Re-reads when userId changes (e.g. sign-in as a different user in the same tab).
 */
export function useUserPref<T>(
  userId: string,
  key: string,
  defaultValue: T
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(() => getUserJson(userId, key, defaultValue));

  // Re-read on userId change so a mid-session user swap picks up the right pref.
  useEffect(() => {
    setValueState(getUserJson(userId, key, defaultValue));
    // We deliberately DON'T depend on `defaultValue` to avoid infinite loops on
    // callers that pass an inline object literal. Assume defaultValue is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  const setValue = useCallback((v: T | ((prev: T) => T)) => {
    setValueState(prev => {
      const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v;
      setUserJson(userId, key, next);
      return next;
    });
  }, [userId, key]);

  return [value, setValue];
}
