import { useState, useEffect, useCallback } from 'react';
import { getAllReceipts, deleteReceipt, updateReceipt } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import type { Receipt } from '../utils/types';

export function useReceipts() {
  const { user } = useAuth();
  const userId = user!.id;

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await getAllReceipts(userId);
      setReceipts(rows);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const remove = useCallback(async (id: number) => {
    await deleteReceipt(userId, id);
    setReceipts(prev => prev.filter(r => r.id !== id));
  }, [userId]);

  const update = useCallback(async (id: number, changes: Partial<Receipt>) => {
    const updated = await updateReceipt(userId, id, changes);
    setReceipts(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  }, [userId]);

  const add = useCallback((receipt: Receipt) => {
    setReceipts(prev => [receipt, ...prev]);
  }, []);

  return { receipts, isLoading, reload: load, remove, update, add };
}
