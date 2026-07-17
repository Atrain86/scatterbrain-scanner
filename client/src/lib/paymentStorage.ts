// Payment method storage helpers — per-user, namespaced with sb_u<userId>_.
// Follows the same pattern as userStorage.ts (getUserJson / setUserJson).
// Cash and Other are built-in constants; never stored in payment_methods.

import type { PaymentMethod } from '../utils/types';

export function getPaymentMethods(userId: string): PaymentMethod[] {
  try {
    const raw = localStorage.getItem(`sb_u${userId}_payment_methods`);
    return raw ? (JSON.parse(raw) as PaymentMethod[]) : [];
  } catch { return []; }
}

export function savePaymentMethods(userId: string, methods: PaymentMethod[]): void {
  localStorage.setItem(`sb_u${userId}_payment_methods`, JSON.stringify(methods));
}

export function getStoreDefaults(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(`sb_u${userId}_store_defaults`);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

export function saveStoreDefaults(userId: string, defaults: Record<string, string>): void {
  localStorage.setItem(`sb_u${userId}_store_defaults`, JSON.stringify(defaults));
}

export function getDeletedPaymentMethods(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`sb_u${userId}_deleted_payment_methods`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function saveDeletedPaymentMethods(userId: string, ids: string[]): void {
  localStorage.setItem(`sb_u${userId}_deleted_payment_methods`, JSON.stringify(ids));
}

// Normalise a store name so lookups in store_defaults are stable across minor
// OCR spelling variation ("Tim Hortons", "Tim Horton's", "TIM HORTONS" → "tim hortons").
export function normalizeStoreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
