import type { CloudProvider, CloudProviderState, CloudSettings, Receipt } from '../utils/types';
import { loadCloudSettings, saveCloudSettings } from '../hooks/useCloudAuth';
import { addReceipt, getAllReceipts, getReceiptByUuid, updateReceipt, getDeletedUuids, clearDeletedUuid } from './db';
import { recordPushSuccess, recordBackgroundSyncSuccess, recordFailure } from './syncStatus';

// ── Token management ──────────────────────────────────────────────────────────

async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch('/api/auth/google/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw new Error(`Google refresh failed: ${await response.text()}`);
  return await response.json();
}

async function refreshDropboxAccessToken(refreshToken: string) {
  const response = await fetch('/api/auth/dropbox/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw new Error(`Dropbox refresh failed: ${await response.text()}`);
  return await response.json();
}

async function ensureValidAccessToken(
  providerState: CloudProviderState,
  provider: CloudProvider,
  userId?: string
): Promise<string | null> {
  const now = Date.now();
  if (providerState.accessToken && providerState.expiresAt && providerState.expiresAt > now + 5000) {
    return providerState.accessToken;
  }
  if (!providerState.refreshToken) return null;

  const payload = provider === 'google-drive'
    ? await refreshGoogleAccessToken(providerState.refreshToken)
    : await refreshDropboxAccessToken(providerState.refreshToken);

  const expiresIn = payload.expires_in ?? payload.expiresIn;
  const nextState: CloudProviderState = {
    ...providerState,
    accessToken: payload.access_token ?? payload.accessToken ?? providerState.accessToken,
    refreshToken: payload.refresh_token ?? payload.refreshToken ?? providerState.refreshToken,
    expiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : providerState.expiresAt,
  };

  const providerKey = provider === 'google-drive' ? 'googleDrive' : 'dropbox';
  // Save to user-namespaced key
  const userSettings = loadCloudSettings(userId);
  saveCloudSettings({ ...userSettings, [providerKey]: nextState } as CloudSettings, userId);
  // Also save to unnamespaced fallback (iOS PWA redirect recovery)
  if (userId) {
    const fallback = loadCloudSettings(undefined);
    saveCloudSettings({ ...fallback, [providerKey]: nextState } as CloudSettings, undefined);
  }

  return nextState.accessToken;
}

// ── Google Drive folder ───────────────────────────────────────────────────────

async function findOrCreateDriveFolder(
  accessToken: string,
  folderName: string,
  parentId: string | null
): Promise<string> {
  const parentQuery = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!searchRes.ok) throw new Error(`Drive folder search failed: ${await searchRes.text()}`);
  const searchData = await searchRes.json() as { files: { id: string }[] };
  if (searchData.files.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    }),
  });
  if (!createRes.ok) throw new Error(`Drive folder create failed: ${await createRes.text()}`);
  const data = await createRes.json() as { id: string };
  return data.id;
}

// Cache the receipts folder ID for the session to avoid repeated lookups.
// Cleared on disconnect (see resetSyncCaches) so a disconnect+reconnect within the
// same tab session doesn't reuse the pre-disconnect folder ID.
let receiptsFolderIdCache: string | null = null;

// Called from useCloudAuth.disconnectProvider — clears in-memory caches AND the
// persisted folder ID for the given user, so the next connect starts from a
// clean slate. Safe to call anytime.
export function resetSyncCaches(userId?: string): void {
  receiptsFolderIdCache = null;
  if (userId) clearPersistedFolderId(userId);
}

// ── Concurrency mutex ─────────────────────────────────────────────────────────
// A module-level promise that both backgroundSync and pushReceiptNow serialize
// against. Prevents the race where a focus event and a mount event (or two
// backgroundSyncs from any triggers) both see the same "not yet on Drive" state
// and both POST the same receipt, creating duplicate files with identical UUIDs.
//
// Every entry point that touches Drive writes must go through withSyncLock.
// Reads (audit, refresh test) are fine unguarded — they don't create duplicates.
let syncLock: Promise<void> = Promise.resolve();

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = syncLock;
  let release!: () => void;
  syncLock = new Promise<void>(res => { release = res; });
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

// ── Folder ID persistence ─────────────────────────────────────────────────────
// Store the created folder ID per-user so we never rely on name-search + first-match
// to relocate it. Name-search + first-match was the vector that spawned the two
// duplicate "Scatterbrain Scanner" root folders during the recovery.

function driveFolderIdKey(userId: string): string {
  return `sb_u${userId}_drive_folder_id`;
}

function loadPersistedFolderId(userId: string): string | null {
  try { return localStorage.getItem(driveFolderIdKey(userId)); } catch { return null; }
}

function savePersistedFolderId(userId: string, folderId: string): void {
  try { localStorage.setItem(driveFolderIdKey(userId), folderId); } catch { /* non-fatal */ }
}

function clearPersistedFolderId(userId: string): void {
  try { localStorage.removeItem(driveFolderIdKey(userId)); } catch { /* non-fatal */ }
}

// Verify a persisted folder ID still exists and is not trashed. If Google says
// the file is gone, returns false so caller falls back to search+create.
async function isFolderIdValid(accessToken: string, folderId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,trashed,mimeType`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return false;
    const data = await res.json() as { id?: string; trashed?: boolean; mimeType?: string };
    return !!data.id && data.trashed !== true && data.mimeType === 'application/vnd.google-apps.folder';
  } catch { return false; }
}

// Distinctive folder name — reduces collision with any pre-existing folder in
// the user's Drive and makes it obvious what created it. Also encodes purpose
// so users browsing Drive can identify it at a glance.
const ROOT_FOLDER_NAME = 'Scatterbrain Scanner - Receipts';

async function getReceiptsFolderId(accessToken: string, userId?: string): Promise<string> {
  // 1. In-memory session cache
  if (receiptsFolderIdCache) return receiptsFolderIdCache;

  // 2. Persisted per-user folder ID — verify still valid before trusting it
  if (userId) {
    const persisted = loadPersistedFolderId(userId);
    if (persisted && await isFolderIdValid(accessToken, persisted)) {
      receiptsFolderIdCache = persisted;
      return persisted;
    }
    // Persisted ID was stale (folder trashed/deleted) — clear it before falling through
    if (persisted) clearPersistedFolderId(userId);
  }

  // 3. Search + create (only when no valid persisted ID exists)
  const rootId = await findOrCreateDriveFolder(accessToken, ROOT_FOLDER_NAME, null);
  const folderId = await findOrCreateDriveFolder(accessToken, 'receipts', rootId);

  receiptsFolderIdCache = folderId;
  if (userId) savePersistedFolderId(userId, folderId);
  return folderId;
}

// ── Drive file operations ─────────────────────────────────────────────────────

async function findDriveFileId(accessToken: string, fileName: string, folderId: string): Promise<string | null> {
  const query = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id)');
  url.searchParams.set('pageSize', '1');
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json() as { files: { id: string }[] };
  return data.files[0]?.id ?? null;
}

async function uploadFileToDrive(
  accessToken: string,
  fileBlob: Blob,
  fileName: string,
  folderId: string,
  existingFileId?: string | null,
): Promise<void> {
  const boundary = '-------314159265358979323846';
  const mimeType = fileBlob.type || 'application/octet-stream';

  if (existingFileId) {
    // PATCH existing file — do not include parents in metadata
    const metadata = { name: fileName, mimeType };
    const body = new Blob([
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
      fileBlob,
      `\r\n--${boundary}--`,
    ]);
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!res.ok) throw new Error(`Drive update failed: ${await res.text()}`);
  } else {
    // POST new file
    const metadata = { name: fileName, mimeType, parents: [folderId] };
    const body = new Blob([
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
      fileBlob,
      `\r\n--${boundary}--`,
    ]);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`);
  }
}

async function deleteDriveFileById(accessToken: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function deleteDriveFilesByUuid(accessToken: string, uuid: string, folderId: string): Promise<void> {
  // Delete both the .json and .jpg for this UUID
  const query = `'${folderId}' in parents and (name='${uuid}.json' or name='${uuid}.jpg') and trashed=false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name)');
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return;
  const data = await res.json() as { files: { id: string }[] };
  for (const f of data.files) {
    await deleteDriveFileById(accessToken, f.id);
  }
}

async function listDriveJsonFiles(accessToken: string, folderId: string): Promise<{ id: string; name: string }[]> {
  let files: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const query = `'${folderId}' in parents and mimeType='application/json' and trashed=false`;
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'nextPageToken,files(id,name)');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`);
    const data = await res.json() as { nextPageToken?: string; files: { id: string; name: string }[] };
    files = files.concat(data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadDriveFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${await res.text()}`);
  return await res.text();
}

// ── Image helpers ─────────────────────────────────────────────────────────────

function decodeDataUri(dataUri: string): Blob {
  const [meta, data] = dataUri.split(',');
  const mimeMatch = meta.match(/data:([^;]+);/);
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg';
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mimeType });
}

async function loadImageBlob(imageUrl: string | null): Promise<Blob | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('data:')) return decodeDataUri(imageUrl);
  try {
    const res = await fetch(imageUrl);
    return res.ok ? await res.blob() : null;
  } catch { return null; }
}

// ── Core sync: push one receipt to Drive ─────────────────────────────────────

async function pushReceiptToDrive(receipt: Receipt, accessToken: string, userId?: string): Promise<void> {
  const folderId = await getReceiptsFolderId(accessToken, userId);
  const jsonName = `${receipt.uuid}.json`;

  // Find existing file IDs so we PATCH instead of POST (avoids duplicates, preserves edits)
  const [existingJsonId, existingImgId] = await Promise.all([
    findDriveFileId(accessToken, jsonName, folderId),
    findDriveFileId(accessToken, `${receipt.uuid}.jpg`, folderId),
  ]);

  const meta = {
    uuid:         receipt.uuid,
    storeName:    receipt.storeName,
    receiptDate:  receipt.receiptDate,
    subtotal:     receipt.subtotal,
    taxAmount:    receipt.taxAmount,
    total:        receipt.total,
    category:     receipt.category,
    clientName:   receipt.clientName,
    lineItems:    receipt.lineItems ? JSON.parse(receipt.lineItems) : null,
    rawLineItems: receipt.rawLineItems ? JSON.parse(receipt.rawLineItems) : null,
    taxLines:     receipt.taxLines ? JSON.parse(receipt.taxLines) : null,
    imageUrl:     receipt.imageUrl,
    notes:        receipt.notes,
    createdAt:    receipt.createdAt,
    updatedAt:    receipt.updatedAt,
  };
  const jsonBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
  await uploadFileToDrive(accessToken, jsonBlob, jsonName, folderId, existingJsonId);

  // Upload image (best-effort)
  const imgBlob = await loadImageBlob(receipt.imageUrl);
  if (imgBlob) {
    await uploadFileToDrive(accessToken, imgBlob, `${receipt.uuid}.jpg`, folderId, existingImgId);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

// Called silently on app load, window focus, and after every save.
// Uses a single Drive file list for both push and pull — avoids per-receipt API calls.
// Serialized via withSyncLock so concurrent triggers (mount + focus fired within
// the same tick, "Sync now" pressed mid-run, etc.) queue instead of racing.
export async function backgroundSync(userId: string): Promise<SyncResult> {
  return withSyncLock(() => backgroundSyncInternal(userId));
}

async function backgroundSyncInternal(userId: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] };
  const settings = loadCloudSettings(userId);
  const provider = settings.primaryProvider;
  if (!provider) return result;

  const providerState = settings[provider === 'google-drive' ? 'googleDrive' : 'dropbox'];
  if (!providerState.connected) return result;

  const accessToken = await ensureValidAccessToken(providerState, provider, userId);
  if (!accessToken) return result;

  if (provider !== 'google-drive') return result;

  try {
    const folderId = await getReceiptsFolderId(accessToken, userId);

    // ONE Drive list call — builds set of all UUIDs already on Drive
    const driveFiles = await listDriveJsonFiles(accessToken, folderId);
    const driveUuids = new Set<string>();
    const driveFileMap = new Map<string, string>(); // uuid → file.id
    for (const f of driveFiles) {
      const m = f.name.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i);
      if (m) {
        driveUuids.add(m[1].toLowerCase());
        driveFileMap.set(m[1].toLowerCase(), f.id);
      }
    }

    // Process tombstones: delete from Drive any UUIDs the user deleted locally
    const deletedUuids = getDeletedUuids(userId);
    for (const uuid of deletedUuids) {
      if (driveUuids.has(uuid.toLowerCase())) {
        try {
          await deleteDriveFilesByUuid(accessToken, uuid, folderId);
          driveUuids.delete(uuid.toLowerCase()); // won't be pulled back
        } catch { /* non-fatal — will retry next sync */ }
      }
      clearDeletedUuid(userId, uuid); // clear tombstone after Drive delete (or if not on Drive)
    }

    const allReceipts = await getAllReceipts(userId);
    const localUuids = new Set(allReceipts.map(r => r.uuid?.toLowerCase()).filter(Boolean));

    // Push: local receipts whose UUID is not on Drive
    for (const receipt of allReceipts) {
      if (!receipt.uuid || driveUuids.has(receipt.uuid.toLowerCase())) continue;
      try {
        await pushReceiptToDrive(receipt, accessToken, userId);
        driveUuids.add(receipt.uuid.toLowerCase()); // prevent re-upload in same run
        result.pushed += 1;
      } catch (err) {
        result.errors.push(`push ${receipt.uuid}: ${(err as Error).message}`);
      }
    }

    // Build a map of local receipts by UUID for last-write-wins comparison
    const localByUuid = new Map(allReceipts.map(r => [r.uuid?.toLowerCase(), r]));

    // Pull: new receipts from Drive + last-write-wins overwrites for existing ones
    const tombstoneSet = new Set(getDeletedUuids(userId).map(u => u.toLowerCase()));
    let updated = 0;
    for (const file of driveFiles) {
      const m = file.name.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i);
      if (!m) continue;
      const uuid = m[1].toLowerCase();
      if (tombstoneSet.has(uuid)) continue; // user deleted this — don't re-pull

      const local = localByUuid.get(uuid);

      try {
        const text = await downloadDriveFile(accessToken, file.id);
        const meta = JSON.parse(text) as Record<string, unknown>;
        const now = new Date().toISOString();
        const driveUpdatedAt = String(meta.updatedAt ?? '');

        if (local) {
          // Last-write-wins: only overwrite local if Drive version is strictly newer
          if (!driveUpdatedAt || (local.updatedAt && local.updatedAt >= driveUpdatedAt)) continue;

          await updateReceipt(userId, local.id, {
            storeName:    String(meta.storeName    ?? local.storeName),
            receiptDate:  String(meta.receiptDate  ?? local.receiptDate),
            subtotal:     Number(meta.subtotal     ?? local.subtotal),
            taxAmount:    Number(meta.taxAmount    ?? local.taxAmount),
            total:        Number(meta.total        ?? local.total),
            category:     String(meta.category     ?? local.category),
            clientName:   meta.clientName != null ? String(meta.clientName) : local.clientName,
            lineItems:    typeof meta.lineItems    === 'string' ? meta.lineItems    : JSON.stringify(meta.lineItems    ?? []),
            rawLineItems: typeof meta.rawLineItems === 'string' ? meta.rawLineItems : JSON.stringify(meta.rawLineItems ?? []),
            taxLines:     typeof meta.taxLines     === 'string' ? meta.taxLines     : JSON.stringify(meta.taxLines     ?? []),
            imageUrl:     meta.imageUrl != null ? String(meta.imageUrl) : local.imageUrl,
            notes:        meta.notes    != null ? String(meta.notes)    : local.notes,
            updatedAt:    driveUpdatedAt,
          });
          updated += 1;
        } else {
          // New receipt — add it
          await addReceipt(userId, {
            uuid,
            storeName:    String(meta.storeName    ?? ''),
            receiptDate:  String(meta.receiptDate  ?? now.slice(0, 10)),
            subtotal:     Number(meta.subtotal     ?? 0),
            taxAmount:    Number(meta.taxAmount    ?? 0),
            total:        Number(meta.total        ?? 0),
            category:     String(meta.category     ?? 'Other'),
            clientName:   meta.clientName != null ? String(meta.clientName) : null,
            lineItems:    typeof meta.lineItems    === 'string' ? meta.lineItems    : JSON.stringify(meta.lineItems    ?? []),
            rawLineItems: typeof meta.rawLineItems === 'string' ? meta.rawLineItems : JSON.stringify(meta.rawLineItems ?? []),
            taxLines:     typeof meta.taxLines     === 'string' ? meta.taxLines     : JSON.stringify(meta.taxLines     ?? []),
            imagePath:    null,
            imageUrl:     meta.imageUrl != null ? String(meta.imageUrl) : null,
            notes:        meta.notes    != null ? String(meta.notes)    : null,
            createdAt:    String(meta.createdAt ?? now),
            updatedAt:    driveUpdatedAt || now,
          });
          result.pulled += 1;
        }
      } catch (err) {
        result.errors.push(`pull ${uuid}: ${(err as Error).message}`);
      }
    }

    if (result.pulled > 0 || updated > 0) {
      window.dispatchEvent(new CustomEvent('receipts-updated'));
    }
  } catch (err) {
    result.errors.push((err as Error).message);
  }

  // Record status: if any errors surfaced, treat as failure; otherwise it's a clean run
  // (even a 0-pushed / 0-pulled run is a successful "we talked to Drive and it agreed").
  if (result.errors.length > 0) {
    recordFailure(userId, 'backgroundSync', result.errors[0]);
  } else {
    recordBackgroundSyncSuccess(userId);
    // Also record push success if we pushed anything — makes the "last push" freshness accurate
    if (result.pushed > 0) {
      recordPushSuccess(userId, `${result.pushed} receipts (backgroundSync)`);
    }
  }

  return result;
}

// Delete a receipt from Drive immediately — called fire-and-forget from useReceipts.remove.
// Re-throws so callers can observe; records failure for the Settings indicator.
// Serialized via withSyncLock so a delete cannot race with a concurrent backgroundSync
// (which might otherwise re-push the just-deleted receipt).
export async function deleteReceiptFromDrive(uuid: string, userId: string): Promise<void> {
  return withSyncLock(async () => {
    const settings = loadCloudSettings(userId);
    const provider = settings.primaryProvider;
    if (!provider) return;
    const providerState = settings[provider === 'google-drive' ? 'googleDrive' : 'dropbox'];
    if (!providerState.connected) return;

    try {
      const accessToken = await ensureValidAccessToken(providerState, provider, userId);
      if (!accessToken) {
        recordFailure(userId, 'delete', 'No access token (refresh returned null — token likely revoked)');
        throw new Error('No access token');
      }
      if (provider === 'google-drive') {
        const folderId = await getReceiptsFolderId(accessToken, userId);
        await deleteDriveFilesByUuid(accessToken, uuid, folderId);
      }
    } catch (err) {
      recordFailure(userId, 'delete', (err as Error).message || 'Unknown delete error');
      throw err;
    }
  });
}

// Push a single receipt immediately after save — fast path, called from ScanModal.
// Records success ONLY after Drive returns 2xx for both JSON and image uploads.
// Records failure on any throw. Re-throws so callers can also observe.
// Serialized via withSyncLock so a save-time push cannot race a concurrent
// backgroundSync — the previous v0.10.3 duplicate-explosion happened because
// mount-triggered and focus-triggered syncs raced against each other; pushReceiptNow
// racing a backgroundSync is the same class of bug and would also produce duplicates.
export async function pushReceiptNow(receipt: Receipt, userId: string): Promise<void> {
  return withSyncLock(async () => {
    const settings = loadCloudSettings(userId);
    const provider = settings.primaryProvider;
    if (!provider) return; // Drive not configured — not a failure, just a no-op
    const providerState = settings[provider === 'google-drive' ? 'googleDrive' : 'dropbox'];
    if (!providerState.connected) return;

    try {
      const accessToken = await ensureValidAccessToken(providerState, provider, userId);
      if (!accessToken) {
        recordFailure(userId, 'push', 'No access token (refresh returned null — token likely revoked)');
        throw new Error('No access token');
      }
      if (provider === 'google-drive') {
        await pushReceiptToDrive(receipt, accessToken, userId);
        recordPushSuccess(userId, receipt.uuid || 'unknown');
      }
    } catch (err) {
      recordFailure(userId, 'push', (err as Error).message || 'Unknown push error');
      throw err;
    }
  });
}

// ── Drive duplicate cleanup ───────────────────────────────────────────────────
// One-time function: finds Drive files with the old naming scheme (date_store_$total),
// groups duplicates by receipt content, keeps the oldest, deletes the rest.
// Safe to call multiple times — only affects non-UUID files.

export interface CleanupResult {
  scanned: number;
  deleted: number;
  errors: string[];
}

export async function cleanupDriveDuplicates(userId: string): Promise<CleanupResult> {
  const result: CleanupResult = { scanned: 0, deleted: 0, errors: [] };
  const settings = loadCloudSettings(userId);
  const providerState = settings.googleDrive;
  if (!providerState.connected) throw new Error('Google Drive not connected');

  const accessToken = await ensureValidAccessToken(providerState, 'google-drive', userId);
  if (!accessToken) throw new Error('Could not get Drive access token');

  const folderId = await getReceiptsFolderId(accessToken, userId);
  const allFiles = await listDriveJsonFiles(accessToken, folderId);

  // Only process files that are NOT UUID-named (legacy files)
  const legacyFiles = allFiles.filter(f =>
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i.test(f.name)
  );
  result.scanned = legacyFiles.length;

  // Group by content key: storeName|receiptDate|total
  const groups = new Map<string, { id: string; name: string; createdAt: string }[]>();

  for (const file of legacyFiles) {
    try {
      const text = await downloadDriveFile(accessToken, file.id);
      const meta = JSON.parse(text) as Record<string, unknown>;
      const key = `${meta.storeName ?? ''}|${meta.receiptDate ?? ''}|${Number(meta.total ?? 0).toFixed(2)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ id: file.id, name: file.name, createdAt: String(meta.createdAt ?? '') });
    } catch (err) {
      result.errors.push(`read ${file.name}: ${(err as Error).message}`);
    }
  }

  // For each group with duplicates: keep oldest, delete the rest
  for (const [, copies] of groups) {
    if (copies.length <= 1) continue;
    copies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const toDelete = copies.slice(1); // keep index 0 (oldest)
    for (const file of toDelete) {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok || res.status === 204) {
          result.deleted += 1;
        } else {
          result.errors.push(`delete ${file.name}: ${res.status}`);
        }
      } catch (err) {
        result.errors.push(`delete ${file.name}: ${(err as Error).message}`);
      }
    }
  }

  return result;
}

// Legacy exports kept for SettingsPage compatibility — simplified stubs
export interface RestoreResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function restoreFromGoogleDrive(
  _existingReceipts: unknown,
  userId?: string
): Promise<RestoreResult> {
  if (!userId) return { imported: 0, skipped: 0, failed: 0, errors: ['No userId'] };
  const syncResult = await backgroundSync(userId);
  return { imported: syncResult.pulled, skipped: 0, failed: syncResult.errors.length, errors: syncResult.errors };
}

// ── Audit: read-only comparison of Drive vs local IndexedDB ───────────────────
// Enumerates the current Drive receipts folder, groups files by UUID, and
// compares against the local receipt set. Read-only — no writes, no deletes,
// no push. Purpose: confirm the "dirty" folder is a complete superset of local
// data before archiving it, and to visualize the duplicate distribution.

export interface DriveAuditResult {
  folderId: string | null;
  folderName: string | null;
  totalFiles: number;             // every jpg + json in the folder
  totalJsonFiles: number;         // json files with valid uuid names
  uniqueUuidsOnDrive: number;     // distinct UUIDs on Drive
  localReceiptCount: number;      // receipts in phone IndexedDB
  uniqueUuidsLocal: number;       // distinct UUIDs locally
  missingFromDrive: string[];     // local UUIDs not on Drive — first 20
  extraOnDrive: string[];         // Drive UUIDs not local — first 20
  duplicateUuids: { uuid: string; jsonCount: number; jpgCount: number }[]; // UUIDs with >1 json or >1 jpg — first 30
  totalDuplicateFiles: number;    // count of files beyond the "1 json + 1 jpg" ideal per UUID
  localSupersetOnDrive: boolean;  // true if every local UUID appears at least once on Drive
}

export async function auditDriveVsLocal(userId: string): Promise<DriveAuditResult> {
  const settings = loadCloudSettings(userId);
  const providerState = settings.googleDrive;
  if (!providerState.connected) throw new Error('Google Drive not connected');

  const accessToken = await ensureValidAccessToken(providerState, 'google-drive', userId);
  if (!accessToken) throw new Error('Could not get Drive access token (token likely revoked)');

  const folderId = await getReceiptsFolderId(accessToken, userId);

  // List ALL files in the folder (both json and jpg), not just json
  let allFiles: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
    url.searchParams.set('fields', 'nextPageToken,files(id,name)');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`);
    const data = await res.json() as { nextPageToken?: string; files: { id: string; name: string }[] };
    allFiles = allFiles.concat(data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  // Group by UUID, counting json and jpg separately
  const uuidRegex = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(json|jpg)$/i;
  const uuidFiles = new Map<string, { json: number; jpg: number }>();
  let totalJsonFiles = 0;
  for (const f of allFiles) {
    const m = f.name.match(uuidRegex);
    if (!m) continue;
    const uuid = m[1].toLowerCase();
    const ext = m[2].toLowerCase();
    const cur = uuidFiles.get(uuid) || { json: 0, jpg: 0 };
    if (ext === 'json') { cur.json += 1; totalJsonFiles += 1; }
    else { cur.jpg += 1; }
    uuidFiles.set(uuid, cur);
  }

  // Compare against local
  const allReceipts = await getAllReceipts(userId);
  const localUuids = new Set<string>();
  for (const r of allReceipts) if (r.uuid) localUuids.add(r.uuid.toLowerCase());

  const driveUuidSet = new Set(uuidFiles.keys());
  const missingFromDrive: string[] = [];
  for (const u of localUuids) if (!driveUuidSet.has(u)) missingFromDrive.push(u);
  const extraOnDrive: string[] = [];
  for (const u of driveUuidSet) if (!localUuids.has(u)) extraOnDrive.push(u);

  // Duplicate detection: any UUID with >1 json OR >1 jpg is a duplicate
  const duplicateUuids: { uuid: string; jsonCount: number; jpgCount: number }[] = [];
  let totalDuplicateFiles = 0;
  for (const [uuid, counts] of uuidFiles) {
    if (counts.json > 1 || counts.jpg > 1) {
      duplicateUuids.push({ uuid, jsonCount: counts.json, jpgCount: counts.jpg });
      totalDuplicateFiles += Math.max(0, counts.json - 1) + Math.max(0, counts.jpg - 1);
    }
  }
  duplicateUuids.sort((a, b) => (b.jsonCount + b.jpgCount) - (a.jsonCount + a.jpgCount));

  return {
    folderId,
    folderName: ROOT_FOLDER_NAME,
    totalFiles: allFiles.length,
    totalJsonFiles,
    uniqueUuidsOnDrive: uuidFiles.size,
    localReceiptCount: allReceipts.length,
    uniqueUuidsLocal: localUuids.size,
    missingFromDrive: missingFromDrive.slice(0, 20),
    extraOnDrive: extraOnDrive.slice(0, 20),
    duplicateUuids: duplicateUuids.slice(0, 30),
    totalDuplicateFiles,
    localSupersetOnDrive: missingFromDrive.length === 0,
  };
}
