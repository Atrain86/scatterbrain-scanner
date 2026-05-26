// All localStorage keys are prefixed with the user's ID so no two accounts
// ever share data on the same device.

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

// Clear every key belonging to a specific user (used on account deletion, not logout)
export function clearUserStorage(userId: string): void {
  const prefix = `sb_u${userId}_`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
