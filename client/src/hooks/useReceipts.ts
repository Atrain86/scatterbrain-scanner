import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllReceipts, deleteReceipt, updateReceipt } from '../lib/db';
import { deleteReceiptFromDrive, pushReceiptNow } from '../lib/cloudSync';
import { useAuth } from '../contexts/AuthContext';
import type { Receipt } from '../utils/types';

export function useReceipts() {
  const { user } = useAuth();
  const userId = user!.id;

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const initialized = useRef(false);

  const load = useCallback(async () => {
    // Only show spinner on first load — subsequent reloads update silently
    if (!initialized.current) {
      setIsLoading(true);
    }
    try {
      const rows = await getAllReceipts(userId);
      setReceipts(rows);
    } finally {
      setIsLoading(false);
      initialized.current = true;
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const handler = () => { void load(); };
    window.addEventListener('receipts-updated', handler);
    return () => window.removeEventListener('receipts-updated', handler);
  }, [load]);

  const remove = useCallback(async (id: number) => {
    // Read UUID before deleting (deleteReceipt also tombstones it)
    const receipt = receipts.find(r => r.id === id);
    await deleteReceipt(userId, id);
    setReceipts(prev => prev.filter(r => r.id !== id));
    // Fire-and-forget Drive delete so the receipt doesn't get re-pulled on next sync
    if (receipt?.uuid) void deleteReceiptFromDrive(receipt.uuid, userId);
  }, [userId, receipts]);

  const update = useCallback(async (id: number, changes: Partial<Receipt>) => {
    const updated = await updateReceipt(userId, id, changes);
    setReceipts(prev => prev.map(r => r.id === id ? updated : r));
    // Push edit to Drive immediately so other devices see the updated version
    void pushReceiptNow(updated, userId);
    return updated;
  }, [userId]);

  const add = useCallback((receipt: Receipt) => {
    setReceipts(prev => [receipt, ...prev]);
  }, []);

  return { receipts, isLoading, reload: load, remove, update, add };
}
