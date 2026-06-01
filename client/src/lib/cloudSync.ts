import type { CloudProvider, CloudProviderState, CloudSettings, CloudSyncQueueItem, Receipt } from '../utils/types';
import { loadCloudSettings, saveCloudSettings } from '../hooks/useCloudAuth';
import { addReceipt, getAllReceipts } from './db';

function syncQueueKey(userId?: string)  { return userId ? `sb_u${userId}_cloud_sync_queue`  : 'sb_cloud_sync_queue'; }
function syncStatusKey(userId?: string) { return userId ? `sb_u${userId}_cloud_sync_status` : 'sb_cloud_sync_status'; }

interface CloudSyncStatus {
  lastRunAt: number | null;
  lastResult: string | null;
  errorMessage: string | null;
  processedCount: number;
}

export interface CloudSyncSummary {
  pendingCount: number;
  failedCount: number;
  lastRunAt: number | null;
  lastResult: string | null;
  errorMessage: string | null;
  processedCount: number;
}

function loadSyncQueue(userId?: string): CloudSyncQueueItem[] {
  try {
    const raw = localStorage.getItem(syncQueueKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as CloudSyncQueueItem[];
  } catch { return []; }
}

function saveSyncQueue(queue: CloudSyncQueueItem[], userId?: string) {
  localStorage.setItem(syncQueueKey(userId), JSON.stringify(queue));
}

function loadSyncStatus(userId?: string): CloudSyncStatus {
  try {
    const raw = localStorage.getItem(syncStatusKey(userId));
    if (!raw) return { lastRunAt: null, lastResult: null, errorMessage: null, processedCount: 0 };
    return JSON.parse(raw) as CloudSyncStatus;
  } catch {
    return { lastRunAt: null, lastResult: null, errorMessage: null, processedCount: 0 };
  }
}

function saveSyncStatus(status: CloudSyncStatus, userId?: string) {
  localStorage.setItem(syncStatusKey(userId), JSON.stringify(status));
}

function makeSafeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._\- ]+/g, '_').trim();
}

function getReceiptMetadata(receipt: Receipt) {
  return {
    id: receipt.id,
    storeName: receipt.storeName,
    receiptDate: receipt.receiptDate,
    subtotal: receipt.subtotal,
    taxAmount: receipt.taxAmount,
    total: receipt.total,
    category: receipt.category,
    clientName: receipt.clientName,
    lineItems: receipt.lineItems ? JSON.parse(receipt.lineItems) : null,
    rawLineItems: receipt.rawLineItems ? JSON.parse(receipt.rawLineItems) : null,
    taxLines: receipt.taxLines ? JSON.parse(receipt.taxLines) : null,
    imageUrl: receipt.imageUrl,
    notes: receipt.notes,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
  };
}

function decodeDataUri(dataUri: string): Blob {
  const [meta, data] = dataUri.split(',');
  const mimeMatch = meta.match(/data:([^;]+);/);
  const mimeType = mimeMatch?.[1] ?? 'application/octet-stream';
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mimeType });
}

async function loadImageBlob(imageUrl: string | null): Promise<Blob | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('data:')) return decodeDataUri(imageUrl);
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to fetch receipt image for cloud upload');
  return await response.blob();
}

// ── Google Drive folder helpers ───────────────────────────────────────────────

async function findOrCreateDriveFolder(
  accessToken: string,
  folderName: string,
  parentId: string | null
): Promise<string> {
  // Search for existing folder
  const parentQuery = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!searchRes.ok) throw new Error(`Drive folder search failed: ${await searchRes.text()}`);
  const searchData = await searchRes.json() as { files: { id: string }[] };

  if (searchData.files.length > 0) return searchData.files[0].id;

  // Create it
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    }),
  });
  if (!createRes.ok) throw new Error(`Drive folder create failed: ${await createRes.text()}`);
  const createData = await createRes.json() as { id: string };
  return createData.id;
}

// Returns the folder ID for: Scatterbrain Scanner/receipts/{year}/{category}/
async function ensureReceiptFolder(
  accessToken: string,
  year: string,
  category: string
): Promise<string> {
  const rootId  = await findOrCreateDriveFolder(accessToken, 'Scatterbrain Scanner', null);
  const rcptId  = await findOrCreateDriveFolder(accessToken, 'receipts', rootId);
  const yearId  = await findOrCreateDriveFolder(accessToken, year, rcptId);
  const catId   = await findOrCreateDriveFolder(accessToken, category, yearId);
  return catId;
}

// ── Drive upload ──────────────────────────────────────────────────────────────

function buildDriveMultipartBody(fileBlob: Blob, fileName: string, description: string, parentId: string) {
  const boundary = '-------314159265358979323846';
  const metadata = {
    name: fileName,
    mimeType: fileBlob.type || 'application/octet-stream',
    description,
    parents: [parentId],
  };
  return new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${fileBlob.type || 'application/octet-stream'}\r\n\r\n`,
    fileBlob,
    `\r\n--${boundary}--`,
  ]);
}

async function uploadToGoogleDrive(
  accessToken: string,
  fileBlob: Blob,
  fileName: string,
  description: string,
  folderId: string
) {
  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
  const body = buildDriveMultipartBody(fileBlob, fileName, description, folderId);
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/related; boundary=-------314159265358979323846',
    },
    body,
  });
  if (!response.ok) throw new Error(`Google Drive upload failed: ${await response.text()}`);
  return await response.json();
}

// ── Dropbox upload ────────────────────────────────────────────────────────────

async function uploadToDropbox(
  accessToken: string,
  fileBlob: Blob,
  fileName: string,
  year: string,
  category: string
) {
  const dropboxPath = `/Scatterbrain Scanner/receipts/${year}/${category}/${fileName}`;
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath, mode: 'add', autorename: true, mute: true }),
    },
    body: fileBlob,
  });
  if (!response.ok) throw new Error(`Dropbox upload failed: ${await response.text()}`);
  return await response.json();
}

// ── Token refresh ─────────────────────────────────────────────────────────────

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

function normalizeProviderState(state: CloudProviderState, payload: Record<string, any>): CloudProviderState {
  const expiresIn = payload.expires_in ?? payload.expiresIn;
  return {
    connected: true,
    email: payload.email ?? state.email ?? null,
    accessToken: payload.access_token ?? payload.accessToken ?? state.accessToken,
    refreshToken: payload.refresh_token ?? payload.refreshToken ?? state.refreshToken,
    expiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : state.expiresAt,
    scope: payload.scope ?? state.scope,
    tokenType: payload.token_type ?? payload.tokenType ?? state.tokenType,
  };
}

async function ensureValidAccessToken(providerState: CloudProviderState, provider: CloudProvider) {
  const now = Date.now();
  if (providerState.accessToken && providerState.expiresAt && providerState.expiresAt > now + 5000) {
    return providerState.accessToken;
  }
  if (!providerState.refreshToken) return null;

  const payload = provider === 'google-drive'
    ? await refreshGoogleAccessToken(providerState.refreshToken)
    : await refreshDropboxAccessToken(providerState.refreshToken);

  const settings = loadCloudSettings();
  const nextProviderState = normalizeProviderState(providerState, payload);
  const nextSettings: CloudSettings = {
    ...settings,
    [provider === 'google-drive' ? 'googleDrive' : 'dropbox']: nextProviderState,
  } as CloudSettings;
  saveCloudSettings(nextSettings);
  return nextProviderState.accessToken;
}

// ── Drive restore ─────────────────────────────────────────────────────────────

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

async function listAllDriveReceiptJsons(accessToken: string): Promise<{ id: string; name: string }[]> {
  // Walk: root → Scatterbrain Scanner → receipts → each year → each category
  const rootId    = await findOrCreateDriveFolder(accessToken, 'Scatterbrain Scanner', null);
  const rcptId    = await findOrCreateDriveFolder(accessToken, 'receipts', rootId);

  // List year folders
  const yearFolders = await listDriveFolders(accessToken, rcptId);
  const allFiles: { id: string; name: string }[] = [];

  for (const yearFolder of yearFolders) {
    const catFolders = await listDriveFolders(accessToken, yearFolder.id);
    for (const catFolder of catFolders) {
      const jsons = await listDriveJsonFiles(accessToken, catFolder.id);
      allFiles.push(...jsons);
    }
  }

  return allFiles;
}

async function listDriveFolders(accessToken: string, parentId: string): Promise<{ id: string; name: string }[]> {
  const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name)');
  url.searchParams.set('pageSize', '100');

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive folder list failed: ${await res.text()}`);
  const data = await res.json() as { files: { id: string; name: string }[] };
  return data.files;
}

async function downloadDriveFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${await res.text()}`);
  return await res.text();
}

export interface RestoreResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function restoreFromGoogleDrive(
  existingReceipts: { storeName: string; receiptDate: string; total: number }[],
  userId?: string
): Promise<RestoreResult> {
  const settings = loadCloudSettings(userId);
  const providerState = settings.googleDrive;

  if (!providerState.connected) throw new Error('Google Drive is not connected.');

  const accessToken = await ensureValidAccessToken(providerState, 'google-drive');
  if (!accessToken) throw new Error('Unable to get a valid Google Drive access token. Try reconnecting.');

  const jsonFiles = await listAllDriveReceiptJsons(accessToken);

  const result: RestoreResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

  // Build a dedup set: "storeName|receiptDate|total"
  const existingKeys = new Set(
    existingReceipts.map(r => `${r.storeName}|${r.receiptDate}|${r.total.toFixed(2)}`)
  );

  for (const file of jsonFiles) {
    try {
      const text = await downloadDriveFile(accessToken, file.id);
      const meta = JSON.parse(text) as Record<string, any>;

      const key = `${meta.storeName ?? ''}|${meta.receiptDate ?? ''}|${Number(meta.total ?? 0).toFixed(2)}`;
      if (existingKeys.has(key)) {
        result.skipped += 1;
        continue;
      }

      const now = new Date().toISOString();
      await addReceipt(userId ?? 'anon', {
        storeName:    meta.storeName    ?? '',
        receiptDate:  meta.receiptDate  ?? now.slice(0, 10),
        subtotal:     Number(meta.subtotal  ?? 0),
        taxAmount:    Number(meta.taxAmount ?? 0),
        total:        Number(meta.total     ?? 0),
        category:     meta.category     ?? 'Other',
        clientName:   meta.clientName   ?? null,
        lineItems:    typeof meta.lineItems    === 'string' ? meta.lineItems    : JSON.stringify(meta.lineItems    ?? []),
        rawLineItems: typeof meta.rawLineItems === 'string' ? meta.rawLineItems : JSON.stringify(meta.rawLineItems ?? []),
        taxLines:     typeof meta.taxLines     === 'string' ? meta.taxLines     : JSON.stringify(meta.taxLines     ?? []),
        imagePath:    null,
        imageUrl:     meta.imageUrl     ?? null,
        notes:        meta.notes        ?? null,
        createdAt:    meta.createdAt    ?? now,
        updatedAt:    meta.updatedAt    ?? now,
      });

      existingKeys.add(key);
      result.imported += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push((err as Error).message);
    }
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getCloudSyncQueue(userId?: string) {
  return loadSyncQueue(userId);
}

export function getCloudSyncSummary(provider?: CloudProvider | null, userId?: string): CloudSyncSummary {
  const settings = loadCloudSettings(userId);
  const activeProvider = provider || settings.primaryProvider;
  const queue = loadSyncQueue(userId);
  const relevantQueue = activeProvider ? queue.filter(item => item.provider === activeProvider) : queue;
  const status = loadSyncStatus(userId);
  return {
    pendingCount: relevantQueue.length,
    failedCount: relevantQueue.filter(item => !!item.lastError).length,
    lastRunAt: status.lastRunAt,
    lastResult: status.lastResult,
    errorMessage: status.errorMessage,
    processedCount: status.processedCount,
  };
}

export async function enqueueReceiptSync(receipt: Receipt, provider: CloudProvider, userId?: string) {
  const year = (receipt.receiptDate || '').slice(0, 4) || String(new Date().getFullYear());
  const safeStore = makeSafeFileName(receipt.storeName || 'receipt');
  const safeDate = receipt.receiptDate || new Date().toISOString().slice(0, 10);
  const safeTotal = receipt.total.toFixed(2);
  const baseName = `${safeDate}_${safeStore}_$${safeTotal}`;
  const imageName = makeSafeFileName(`${baseName}.jpg`);

  const newItem: CloudSyncQueueItem = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    provider,
    receiptId: receipt.id,
    imageUrl: receipt.imageUrl,
    imageName,
    metadata: getReceiptMetadata(receipt),
    createdAt: Date.now(),
    attemptCount: 0,
    lastError: null,
  };

  const queue = loadSyncQueue(userId);
  queue.push(newItem);
  saveSyncQueue(queue, userId);
  return newItem;
}

// ── Background two-way sync ───────────────────────────────────────────────────
// Called silently on app load and on window focus. Pushes all local receipts
// to Drive then pulls any Drive receipts not yet in local DB.

export async function backgroundSync(userId: string): Promise<void> {
  const settings = loadCloudSettings(userId);
  const provider = settings.primaryProvider;
  if (!provider) return;

  const providerState = settings[provider === 'google-drive' ? 'googleDrive' : 'dropbox'];
  if (!providerState.connected) return;

  try {
    // Push: queue all local receipts, then upload
    const allReceipts = await getAllReceipts(userId);
    const existingQueue = loadSyncQueue(userId);
    const queuedReceiptIds = new Set(existingQueue.map(q => q.receiptId));

    for (const receipt of allReceipts) {
      if (!queuedReceiptIds.has(receipt.id)) {
        await enqueueReceiptSync(receipt, provider, userId);
      }
    }
    await processCloudSyncQueue(userId);

    // Pull: restore from Drive any receipts not already local
    if (provider === 'google-drive') {
      const existing = allReceipts.map(r => ({
        storeName: r.storeName,
        receiptDate: r.receiptDate,
        total: r.total,
      }));
      const restoreResult = await restoreFromGoogleDrive(existing, userId);
      if (restoreResult.imported > 0) {
        window.dispatchEvent(new CustomEvent('receipts-updated'));
      }
    }
  } catch (err) {
    console.warn('[backgroundSync] error:', (err as Error).message);
  }
}

export async function processCloudSyncQueue(userId?: string): Promise<CloudSyncSummary> {
  const settings = loadCloudSettings(userId);
  const queue = loadSyncQueue(userId);
  const activeProvider = settings.primaryProvider;
  const status: CloudSyncStatus = {
    lastRunAt: Date.now(),
    lastResult: null,
    errorMessage: null,
    processedCount: 0,
  };

  if (!activeProvider) {
    saveSyncStatus(status, userId);
    return {
      pendingCount: queue.length,
      failedCount: queue.filter(item => !!item.lastError).length,
      lastRunAt: status.lastRunAt,
      lastResult: 'No primary cloud provider selected',
      errorMessage: 'Please choose Google Drive or Dropbox in settings.',
      processedCount: 0,
    };
  }

  const providerState = settings[activeProvider === 'google-drive' ? 'googleDrive' : 'dropbox'];
  const relevantQueue = queue.filter(item => item.provider === activeProvider);

  if (!providerState.connected) {
    saveSyncStatus(status, userId);
    return {
      pendingCount: relevantQueue.length,
      failedCount: relevantQueue.filter(item => !!item.lastError).length,
      lastRunAt: status.lastRunAt,
      lastResult: `${activeProvider === 'google-drive' ? 'Google Drive' : 'Dropbox'} is not connected`,
      errorMessage: 'Reconnect your cloud provider to resume sync.',
      processedCount: 0,
    };
  }

  const accessToken = await ensureValidAccessToken(providerState, activeProvider);
  if (!accessToken) {
    saveSyncStatus(status, userId);
    return {
      pendingCount: relevantQueue.length,
      failedCount: relevantQueue.filter(item => !!item.lastError).length,
      lastRunAt: status.lastRunAt,
      lastResult: 'Unable to refresh access token',
      errorMessage: 'Reconnect your cloud provider or check your refresh token.',
      processedCount: 0,
    };
  }

  const nextQueue = [...queue];
  let processedCount = 0;
  let failedCount = 0;
  let lastError: string | null = null;

  for (const item of relevantQueue) {
    const meta = item.metadata;
    const year = (meta.receiptDate || '').slice(0, 4) || String(new Date().getFullYear());
    const category = meta.category || 'Other';
    const fileDescription = `Receipt from ${meta.storeName} on ${meta.receiptDate}`;

    try {
      if (activeProvider === 'google-drive') {
        // Ensure the folder structure exists, get the target folder ID
        const folderId = await ensureReceiptFolder(accessToken, year, category);

        // Upload image
        const fileBlob = await loadImageBlob(item.imageUrl);
        if (fileBlob) {
          await uploadToGoogleDrive(accessToken, fileBlob, item.imageName, fileDescription, folderId);
        }

        // Upload JSON metadata sidecar (needed for restore)
        const metadataBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
        const metadataName = item.imageName.replace(/\.[^.]+$/, '') + '.json';
        await uploadToGoogleDrive(accessToken, metadataBlob, metadataName, fileDescription, folderId);

      } else {
        // Dropbox — folder path is built into the upload path
        const fileBlob = await loadImageBlob(item.imageUrl);
        if (fileBlob) {
          await uploadToDropbox(accessToken, fileBlob, item.imageName, year, category);
        }
        const metadataBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
        const metadataName = item.imageName.replace(/\.[^.]+$/, '') + '.json';
        await uploadToDropbox(accessToken, metadataBlob, metadataName, year, category);
      }

      const index = nextQueue.findIndex(q => q.id === item.id);
      if (index >= 0) nextQueue.splice(index, 1);
      processedCount += 1;

    } catch (error) {
      const errorMessage = (error as Error).message || 'Cloud sync failed';
      lastError = errorMessage;
      failedCount += 1;
      const index = nextQueue.findIndex(q => q.id === item.id);
      if (index >= 0) {
        nextQueue[index] = {
          ...nextQueue[index],
          attemptCount: nextQueue[index].attemptCount + 1,
          lastError: errorMessage,
        };
      }
      console.warn('Cloud sync error:', errorMessage);
    }
  }

  saveSyncQueue(nextQueue, userId);

  const result: CloudSyncSummary = {
    pendingCount: nextQueue.filter(item => item.provider === activeProvider).length,
    failedCount: nextQueue.filter(item => item.provider === activeProvider && !!item.lastError).length,
    lastRunAt: status.lastRunAt,
    lastResult: failedCount > 0 ? `Completed with ${failedCount} failures` : `Uploaded ${processedCount} receipt(s)`,
    errorMessage: lastError,
    processedCount,
  };

  saveSyncStatus(result, userId);
  return result;
}
