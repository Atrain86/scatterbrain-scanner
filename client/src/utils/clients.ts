function key(userId: string, suffix: string) { return `sb_u${userId}_${suffix}`; }

export function loadClients(userId: string): string[] {
  try {
    const raw = localStorage.getItem(key(userId, 'clients'));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function saveClients(userId: string, clients: string[]): void {
  localStorage.setItem(key(userId, 'clients'), JSON.stringify(clients));
  // Notify listeners (Settings, receipt pickers) so they can refresh.
  try { window.dispatchEvent(new CustomEvent('clients-updated', { detail: { userId } })); } catch {}
}

export function addClient(userId: string, name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return loadClients(userId);
  const existing = loadClients(userId);
  if (existing.some(c => c.toLowerCase() === trimmed.toLowerCase())) return existing;
  const updated = [...existing, trimmed];
  saveClients(userId, updated);
  return updated;
}

export function removeClient(userId: string, name: string): string[] {
  const updated = loadClients(userId).filter(c => c !== name);
  saveClients(userId, updated);
  return updated;
}

export function getLastClient(userId: string): string {
  return localStorage.getItem(key(userId, 'last_client')) ?? '';
}

export function setLastClient(userId: string, name: string): void {
  localStorage.setItem(key(userId, 'last_client'), name);
}
