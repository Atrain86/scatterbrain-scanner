const STORAGE_KEY = 'sb_clients';
const LAST_CLIENT_KEY = 'sb_last_client';

export function loadClients(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function saveClients(clients: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

export function addClient(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return loadClients();
  const existing = loadClients();
  if (existing.some(c => c.toLowerCase() === trimmed.toLowerCase())) return existing;
  const updated = [...existing, trimmed];
  saveClients(updated);
  return updated;
}

export function removeClient(name: string): string[] {
  const updated = loadClients().filter(c => c !== name);
  saveClients(updated);
  return updated;
}

export function getLastClient(): string {
  return localStorage.getItem(LAST_CLIENT_KEY) ?? '';
}

export function setLastClient(name: string): void {
  localStorage.setItem(LAST_CLIENT_KEY, name);
}
