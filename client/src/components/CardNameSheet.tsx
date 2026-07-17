import { useState, useEffect } from 'react';
import BottomSheet from './BottomSheet';
import { useAuth } from '../contexts/AuthContext';
import { getPaymentMethods, savePaymentMethods } from '../lib/paymentStorage';
import { getDb } from '../lib/db';
import type { PaymentMethod } from '../utils/types';

interface Props {
  // Pre-filled when OCR found an unknown last4
  last4?: string | null;
  network?: string | null;
  onSave: (method: PaymentMethod) => void;
  onClose: () => void;
}

export default function CardNameSheet({ last4, network, onSave, onClose }: Props) {
  const { user } = useAuth();
  const [label, setLabel] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);

  const title = last4
    ? `${network ?? 'Card'} ending ${last4} — what's this card?`
    : 'New payment card';

  // Live-count receipts that share this last4 (for the backfill hint)
  useEffect(() => {
    if (!last4 || !user) { setMatchCount(null); return; }
    let cancelled = false;
    getDb(user.id).receipts
      .where('last4')
      .equals(last4)
      .count()
      .then(n => { if (!cancelled) setMatchCount(n); })
      .catch(() => { if (!cancelled) setMatchCount(null); });
    return () => { cancelled = true; };
  }, [last4, user]);

  async function handleSave() {
    if (!label.trim() || !user) return;
    const method: PaymentMethod = {
      id: crypto.randomUUID(),
      label: label.trim(),
      last4: last4 ?? null,
      network: network ?? null,
      createdAt: new Date().toISOString(),
    };
    const existing = getPaymentMethods(user.id);
    savePaymentMethods(user.id, [...existing, method]);

    // Backfill: tag any existing receipts that have this last4 and were not
    // manually assigned. We don't block the sheet close on this — it's fast
    // (indexed query) and fires in the background.
    if (last4) {
      const db = getDb(user.id);
      const matches = await db.receipts
        .where('last4')
        .equals(last4)
        .toArray();
      const toUpdate = matches.filter(
        r => (r as { paymentMethodSource?: string }).paymentMethodSource !== 'manual'
      );
      const now = new Date().toISOString();
      for (const r of toUpdate) {
        if (r.id !== undefined) {
          await db.receipts.update(r.id, {
            paymentMethod: method.label,
            paymentMethodSource: 'matched',
            updatedAt: now,
          });
        }
      }
      if (toUpdate.length > 0) {
        window.dispatchEvent(new CustomEvent('receipts-updated'));
      }
    }

    onSave(method);
  }

  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      onPrimary={handleSave}
      primaryDisabled={!label.trim()}
    >
      <input
        autoFocus
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && label.trim()) handleSave(); }}
        placeholder={last4 ? 'e.g. TD Visa' : 'Card name'}
        className="w-full bg-sb-card border border-sb-green rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none"
      />
      {last4 && label.trim() && matchCount !== null && matchCount > 0 && (
        <p className="text-[12px] text-white/50 mt-2 px-1">
          {matchCount} past receipt{matchCount === 1 ? '' : 's'} with card •••{last4} will be tagged as "{label.trim()}".
        </p>
      )}
    </BottomSheet>
  );
}
