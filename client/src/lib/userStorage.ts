// Per-user localStorage — THE canonical way to persist any user-specific data.
//
// Design principle (from account-freshness audit): global localStorage keys for
// user data are how User A's tokens end up merged into User B's session. Every
// key that holds user-specific data MUST be namespaced with `sb_u<userId>_`.
// Global keys are reserved for app-scope data only (auth token, feature flags).
//
// New per-user preferences MUST go through useUserPref — that's the "correct
// pattern" that can't accidentally regress. Raw localStorage access for user
// data should not appear in new code; if it does, a code reviewer should push
// back.

import { useCallback, useEffect, useState } from 'react';

export function userKey(userId: string, key: string): string {
  return `sb_u${userId}_${key}`;
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

// Typed JSON access — safer than repeating JSON.parse/stringify + try/catch
// everywhere. Silently returns fallback on parse errors so callers don't
// have to guard against corrupted values.
export function getUserJson<T>(userId: string, key: string, fallback: T): T {
  const raw = getUserItem(userId, key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function setUserJson<T>(userId: string, key: string, value: T): void {
  try { setUserItem(userId, key, JSON.stringify(value)); } catch { /* quota full — non-fatal */ }
}

// Clear every key belonging to a specific user. Used by conditional-wipe on
// different-user sign-in (Task #5) after backup verification. NOT called on
// routine logout — logout preserves data for same-user re-signin.
export function clearUserStorage(userId: string): void {
  const prefix = `sb_u${userId}_`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

// Enumerate every userId that has data on this device — read by the
// conditional-wipe flow to identify "prior users" whose data may need
// cleaning up on a different-user sign-in.
export function listUserIdsWithLocalData(): string[] {
  const ids = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const m = k?.match(/^sb_u([^_]+)_/);
    if (m) ids.add(m[1]);
  }
  return Array.from(ids);
}

// ── Established-user tracking ───────────────────────────────────────────────
// The handover consent flow needs to distinguish a genuinely NEW arrival on
// this browser from a RETURNING user. A returning established user is not
// a handover risk — they've been here before, this browser is their normal
// place, we don't need to prompt "you're about to replace prior user data"
// every single time they sign in.
//
// A user becomes "established" on this device the moment they successfully
// activate a session here (login/signup succeeded AND any handover check
// passed). We also treat a valid resumed session (mount-time token decode
// with server-verify still succeeding) as an implicit re-establishment,
// which covers users who were established before this feature landed.
//
// The Set is stored under a device-scope key. Not per-user by design — it's
// a device-local roster of "who has ever been here." Reading it doesn't
// leak anything; a userID alone can't be used to impersonate.

const ESTABLISHED_KEY = 'sb_device_established_users';

function readEstablishedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(ESTABLISHED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch { return new Set(); }
}

function writeEstablishedSet(set: Set<string>): void {
  try {
    localStorage.setItem(ESTABLISHED_KEY, JSON.stringify(Array.from(set)));
  } catch { /* quota — non-fatal */ }
}

export function isEstablishedUser(userId: string): boolean {
  return readEstablishedSet().has(userId);
}

export function markUserEstablished(userId: string): void {
  const set = readEstablishedSet();
  if (set.has(userId)) return;
  set.add(userId);
  writeEstablishedSet(set);
}

export function unmarkUserEstablished(userId: string): void {
  const set = readEstablishedSet();
  if (!set.has(userId)) return;
  set.delete(userId);
  writeEstablishedSet(set);
}

// Clear every user's data EXCEPT the one being kept. Called on sign-in AFTER
// the conditional-wipe safety check has confirmed the outgoing user's data
// is backed up (or the user has explicitly overridden). Never called
// unconditionally — the wipe gate lives in AuthContext.
export function clearAllOtherUsersStorage(keepUserId: string): void {
  const keepPrefix = `sb_u${keepUserId}_`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('sb_u') && !k.startsWith(keepPrefix)) {
      toRemove.push(k);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

// React hook for per-user preferences. New preference state (year picker,
// filter toggles, chart collapse, etc.) MUST go through this hook — it makes
// the safe way the easy way. Calling with a userId of `undefined` returns the
// fallback without touching localStorage, so it's safe to use before auth
// resolves.
export function useUserPref<T>(
  userId: string | undefined,
  key: string,
  fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() =>
    userId ? getUserJson(userId, key, fallback) : fallback
  );

  useEffect(() => {
    if (!userId) return;
    setValue(getUserJson(userId, key, fallback));
    // fallback intentionally omitted from deps — treating it as a constant per hook instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  const update = useCallback((next: T) => {
    setValue(next);
    if (userId) setUserJson(userId, key, next);
  }, [userId, key]);

  return [value, update];
}
