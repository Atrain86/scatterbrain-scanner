/**
 * RenameDeleteSheets.tsx
 *
 * Inline BottomSheet-based rename and delete flows for categories and clients.
 * These are used from both ReceiptCard (dropdown pencil/trash) and SettingsPage
 * (settings list row trash).
 *
 * CRITICAL ORDERING INVARIANT — enforced in every handler:
 *   1. Bulk-modify receipts via Dexie first.
 *   2. Update the localStorage list entry last.
 *   3. Caller dispatches `receipts-updated` after onDone().
 *
 * Never calls updateReceipt() or pushReceiptNow() — uses direct Dexie bulk ops.
 */

import { useState, useEffect } from 'react';
import BottomSheet from './BottomSheet';
import {
  bulkRenameCategory,
  bulkRenameClient,
  bulkClearCategory,
  bulkReassignCategory,
  bulkClearClient,
  bulkReassignClient,
  countReceiptsByCategory,
  countReceiptsByClient,
} from '../lib/db';
import { getAllCategories, saveUserCategories } from '../utils/types';
import { loadClients, saveClients } from '../utils/clients';
import { addDeletedCategory, addDeletedClient } from '../lib/db';

// ─────────────────────────────────────────────────────────────────────────────
// CategoryRenameSheet
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryRenameSheetProps {
  userId: string;
  oldName: string;
  onClose: () => void;
  onDone: () => void;
}

export function CategoryRenameSheet({ userId, oldName, onClose, onDone }: CategoryRenameSheetProps) {
  const [newName, setNewName] = useState(oldName);
  const [count, setCount]     = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    countReceiptsByCategory(userId, oldName).then(setCount);
  }, [userId, oldName]);

  const trimmed = newName.trim();
  const cats    = getAllCategories(userId);
  const existingMatch = cats.find(
    c => c.name.toLowerCase() === trimmed.toLowerCase() && c.name !== oldName
  );
  const isMerge = !!existingMatch;

  async function handleSave() {
    if (!trimmed || trimmed === oldName) { onClose(); return; }
    setSaving(true);
    try {
      // 1. Bulk-update receipts first
      await bulkRenameCategory(userId, oldName, existingMatch ? existingMatch.name : trimmed);
      // 2. Update localStorage list last
      if (isMerge) {
        // Merge: remove the old entry; the target already exists
        saveUserCategories(userId, cats.filter(c => c.name !== oldName));
      } else {
        // Rename: update the entry in-place
        saveUserCategories(
          userId,
          cats.map(c => c.name === oldName ? { ...c, name: trimmed } : c)
        );
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const primaryLabel = saving ? 'Saving…' : isMerge ? 'Merge' : 'Rename';

  return (
    <BottomSheet
      title={`Rename "${oldName}"`}
      onClose={onClose}
      primaryLabel={primaryLabel}
      onPrimary={handleSave}
      primaryDisabled={!trimmed || trimmed === oldName || saving}
    >
      <div className="space-y-3">
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          className="sb-input"
          placeholder="New name"
        />
        {count !== null && count > 0 && !isMerge && (
          <p className="text-xs text-white/50">
            {count} receipt{count !== 1 ? 's' : ''} will be updated.
          </p>
        )}
        {isMerge && (
          <p className="text-xs text-sb-green">
            "{trimmed}" already exists — {count ?? '…'} receipt{count !== 1 ? 's' : ''} will be merged into it.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClientRenameSheet
// ─────────────────────────────────────────────────────────────────────────────

interface ClientRenameSheetProps {
  userId: string;
  oldName: string;
  onClose: () => void;
  onDone: () => void;
}

export function ClientRenameSheet({ userId, oldName, onClose, onDone }: ClientRenameSheetProps) {
  const [newName, setNewName] = useState(oldName);
  const [count, setCount]     = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    countReceiptsByClient(userId, oldName).then(setCount);
  }, [userId, oldName]);

  const trimmed = newName.trim();
  const clients = loadClients(userId);
  const existingMatch = clients.find(
    c => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName
  );
  const isMerge = !!existingMatch;

  async function handleSave() {
    if (!trimmed || trimmed === oldName) { onClose(); return; }
    setSaving(true);
    try {
      const targetName = existingMatch ?? trimmed;
      // 1. Bulk-update receipts first
      await bulkRenameClient(userId, oldName, targetName);
      // 2. Update localStorage list last
      if (isMerge) {
        saveClients(userId, clients.filter(c => c !== oldName));
      } else {
        saveClients(userId, clients.map(c => c === oldName ? trimmed : c));
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const primaryLabel = saving ? 'Saving…' : isMerge ? 'Merge' : 'Rename';

  return (
    <BottomSheet
      title={`Rename "${oldName}"`}
      onClose={onClose}
      primaryLabel={primaryLabel}
      onPrimary={handleSave}
      primaryDisabled={!trimmed || trimmed === oldName || saving}
    >
      <div className="space-y-3">
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          className="sb-input"
          placeholder="New name"
        />
        {count !== null && count > 0 && !isMerge && (
          <p className="text-xs text-white/50">
            {count} receipt{count !== 1 ? 's' : ''} will be updated.
          </p>
        )}
        {isMerge && (
          <p className="text-xs text-sb-green">
            "{trimmed}" already exists — {count ?? '…'} receipt{count !== 1 ? 's' : ''} will be merged into it.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CategoryDeleteSheet
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryDeleteSheetProps {
  userId: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}

export function CategoryDeleteSheet({ userId, name, onClose, onDone }: CategoryDeleteSheetProps) {
  const [count, setCount]         = useState<number | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [saving, setSaving]       = useState(false);

  const cats = getAllCategories(userId).filter(c => c.name !== name);

  useEffect(() => {
    countReceiptsByCategory(userId, name).then(c => {
      setCount(c);
    });
  }, [userId, name]);

  async function handleDelete() {
    setSaving(true);
    try {
      // 1. Bulk-update receipts first
      if (count && count > 0) {
        if (reassignTo) {
          await bulkReassignCategory(userId, name, reassignTo);
        } else {
          await bulkClearCategory(userId, name);
        }
      }
      // 2. Remove from list + tombstone last
      const updated = getAllCategories(userId).filter(c => c.name !== name);
      saveUserCategories(userId, updated);
      addDeletedCategory(userId, name);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (count === null) return null; // loading

  return (
    <BottomSheet
      title={`Delete "${name}"`}
      onClose={onClose}
      primaryLabel={saving ? 'Deleting…' : 'Delete'}
      onPrimary={handleDelete}
      primaryDisabled={saving}
    >
      <div className="space-y-3">
        {count > 0 ? (
          <>
            <p className="text-sm text-white/70">
              {count} receipt{count !== 1 ? 's' : ''} use "{name}".
            </p>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Move receipts to:</p>
              <select
                value={reassignTo}
                onChange={e => setReassignTo(e.target.value)}
                className="w-full bg-sb-card border border-sb-border rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sb-green"
              >
                <option value="">Leave unassigned</option>
                {cats.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <p className="text-sm text-white/70">No receipts use this category.</p>
        )}
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClientDeleteSheet
// ─────────────────────────────────────────────────────────────────────────────

interface ClientDeleteSheetProps {
  userId: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}

export function ClientDeleteSheet({ userId, name, onClose, onDone }: ClientDeleteSheetProps) {
  const [count, setCount]           = useState<number | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [saving, setSaving]         = useState(false);

  const otherClients = loadClients(userId).filter(c => c !== name);

  useEffect(() => {
    countReceiptsByClient(userId, name).then(c => {
      setCount(c);
    });
  }, [userId, name]);

  async function handleDelete() {
    setSaving(true);
    try {
      // 1. Bulk-update receipts first
      if (count && count > 0) {
        if (reassignTo) {
          await bulkReassignClient(userId, name, reassignTo);
        } else {
          await bulkClearClient(userId, name);
        }
      }
      // 2. Remove from list + tombstone last
      saveClients(userId, loadClients(userId).filter(c => c !== name));
      addDeletedClient(userId, name);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (count === null) return null; // loading

  return (
    <BottomSheet
      title={`Delete "${name}"`}
      onClose={onClose}
      primaryLabel={saving ? 'Deleting…' : 'Delete'}
      onPrimary={handleDelete}
      primaryDisabled={saving}
    >
      <div className="space-y-3">
        {count > 0 ? (
          <>
            <p className="text-sm text-white/70">
              {count} receipt{count !== 1 ? 's' : ''} use "{name}".
            </p>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Move receipts to:</p>
              <select
                value={reassignTo}
                onChange={e => setReassignTo(e.target.value)}
                className="w-full bg-sb-card border border-sb-border rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sb-green"
              >
                <option value="">Leave unassigned</option>
                {otherClients.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <p className="text-sm text-white/70">No receipts use this client.</p>
        )}
      </div>
    </BottomSheet>
  );
}
