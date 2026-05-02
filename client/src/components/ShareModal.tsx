import { useState } from 'react';
import { X, Mail, Share2, Send, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthFetch } from '../contexts/AuthContext';
import { track } from '../lib/analytics';
import type { Receipt } from '../utils/types';

interface Props {
  receipt: Receipt;
  onClose: () => void;
  userEmail: string;
}

export default function ShareModal({ receipt, onClose, userEmail }: Props) {
  const authFetch = useAuthFetch();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const { data: recentRecipients = [] } = useQuery<string[]>({
    queryKey: ['recipients'],
    queryFn: async () => {
      const res = await authFetch('/api/recipients');
      return res.ok ? res.json() : [];
    },
  });

  async function handleEmailShare() {
    if (!email.trim()) { setError('Enter a recipient email'); return; }
    setError('');
    setSending(true);
    try {
      const res = await authFetch(`/api/receipts/${receipt.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      track('receipt_shared', { method: 'email' });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function handleNativeShare() {
    const text = `Receipt from ${receipt.storeName} — $${receipt.total.toFixed(2)} on ${receipt.receiptDate}`;

    if (navigator.share) {
      try {
        const shareData: ShareData = { title: `Receipt: ${receipt.storeName}`, text };
        // Attach image if available and browser supports file sharing
        if (receipt.imageUrl && navigator.canShare) {
          try {
            const imgRes = await fetch(receipt.imageUrl);
            const blob = await imgRes.blob();
            const file = new File([blob], 'receipt.jpg', { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
              shareData.files = [file];
            }
          } catch { /* fall through to text-only share */ }
        }
        await navigator.share(shareData);
        track('receipt_shared', { method: 'native' });
        onClose();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(text);
      setError('Link copied to clipboard (native share not available in this browser)');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70" onClick={onClose}>
      <div
        className="w-full bg-sb-card border-t border-sb-border rounded-t-3xl p-6 pb-10 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-sb-border rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold text-lg">Share Receipt</h2>
            <p className="text-sb-muted text-sm">{receipt.storeName} · ${receipt.total.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-sb-muted hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-green-950/40 border border-green-800/40 flex items-center justify-center mx-auto mb-4">
              <Send size={24} className="text-sb-green" />
            </div>
            <p className="text-white font-semibold mb-1">Receipt sent!</p>
            <p className="text-sb-muted text-sm">Email delivered to {email}</p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2.5 rounded-xl bg-sb-green text-black font-semibold text-sm hover:brightness-110 transition"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Native share button (SMS, WhatsApp, etc.) */}
            <button
              onClick={handleNativeShare}
              className="w-full flex items-center gap-3 bg-sb-card2 border border-sb-border rounded-xl px-4 py-3.5 hover:border-sb-purple transition"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-950/40 border border-purple-800/30 flex items-center justify-center flex-shrink-0">
                <Share2 size={18} className="text-sb-purple" />
              </div>
              <div className="text-left">
                <p className="text-white text-sm font-medium">Text / Share</p>
                <p className="text-sb-muted text-xs">iMessage, WhatsApp, SMS…</p>
              </div>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-sb-border" />
              <span className="text-sb-muted text-xs">or email</span>
              <div className="flex-1 border-t border-sb-border" />
            </div>

            {/* Recent recipients */}
            {recentRecipients.length > 0 && (
              <div>
                <p className="text-xs text-sb-muted mb-2 flex items-center gap-1.5">
                  <Clock size={11} /> Recent
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentRecipients.map(r => (
                    <button
                      key={r}
                      onClick={() => setEmail(r)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition ${
                        email === r
                          ? 'border-sb-green text-sb-green bg-green-950/30'
                          : 'border-sb-border text-sb-muted hover:border-sb-muted'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Email input */}
            <div>
              <label className="block text-xs text-sb-muted mb-1.5">
                <Mail size={11} className="inline mr-1" /> Recipient email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="accountant@example.com"
                className="sb-input"
                onKeyDown={e => e.key === 'Enter' && handleEmailShare()}
              />
            </div>

            {error && (
              <p className="text-sb-red text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleEmailShare}
              disabled={sending || !email.trim()}
              className="w-full py-3 rounded-xl bg-sb-green text-black font-semibold text-sm disabled:opacity-40 hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              <Mail size={16} />
              {sending ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
