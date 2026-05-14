import { useState, useEffect, useCallback } from 'react';
import { getAllReceipts, deleteReceipt, updateReceipt } from '../lib/db';
import type { Receipt } from '../utils/types';

export function useReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await getAllReceipts();
      setReceipts(rows);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = useCallback(async (id: number) => {
    await deleteReceipt(id);
    setReceipts(prev => prev.filter(r => r.id !== id));
  }, []);

  const update = useCallback(async (id: number, changes: Partial<Receipt>) => {
    const updated = await updateReceipt(id, changes);
    setReceipts(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  }, []);

  return { receipts, isLoading, reload: load, remove, update };
}
