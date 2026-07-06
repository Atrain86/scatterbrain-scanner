import { useState, useRef, useEffect } from 'react';
import { X, Camera, Image as ImageIcon, Clipboard } from 'lucide-react';
import { compressReceiptImage, compressForStorage } from '../lib/imageCompression';
import { pushReceiptNow } from '../lib/cloudSync';
import { addReceipt } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import LineItemSelector from './LineItemSelector';
import type { ScannedReceiptData } from '../utils/types';

interface Props {
  onClose: () => void;
  onSaved: (receipt: import('../utils/types').Receipt) => void;
}

type Step = 'pick' | 'scanning' | 'select' | 'saving';

const isDesktop = !('ontouchstart' in window) && window.innerWidth > 768;

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ScanModal({ onClose, onSaved }: Props) {
  const { user } = useAuth();
  const userId = user!.id;

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef   = useRef<HTMLDivElement>(null);

  const [step,           setStep]           = useState<Step>('pick');
  const [scanned,        setScanned]        = useState<ScannedReceiptData | null>(null);
  const [imageFile,      setImageFile]      = useState<File | null>(null);
  const [error,          setError]          = useState('');
  const [pasteHighlight, setPasteHighlight] = useState(false);

  useEffect(() => {
    if (step !== 'pick') return;

    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setPasteHighlight(true);
            setTimeout(() => setPasteHighlight(false), 300);
            await handleFile(file);
            return;
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [step]);

  async function handleFile(file: File) {
    setError('');
    setStep('scanning');

    let compressed = file;
    if (file.type.startsWith('image/')) {
      try { compressed = await compressReceiptImage(file); } catch { /* use original */ }
    }

    setImageFile(compressed);

    const form = new FormData();
    form.append('receipt', compressed);

    try {
      const res = await fetch(`${API_BASE}/api/ocr/receipt`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Scan failed');
      const data: ScannedReceiptData = await res.json();
      setScanned(data);
      setStep('select');
    } catch (err) {
      setError((err as Error).message || 'Could not scan receipt. Try again.');
      setStep('pick');
    }
  }

  async function handleClickPaste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'paste.png', { type: imageType });
          await handleFile(file);
          return;
        }
      }
      setError('No image found in clipboard. Copy a screenshot first.');
    } catch {
      setError('Paste failed — try Cmd+V (Mac) or Ctrl+V (Windows) anywhere in this window.');
    }
  }

  async function handleSave(payload: {
    storeName: string;
    receiptDate: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    category: string;
    clientName: string;
    lineItems: string;
    rawLineItems: string;
    taxLines: string;
  }) {
    setStep('saving');
    console.log('[Save] step 1: compressing image');

    let imageUrl: string | null = null;
    if (imageFile) {
      try {
        const storageFile = await compressForStorage(imageFile);
        imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(storageFile);
        });
        console.log('[Save] step 2: image compressed, size:', imageUrl.length);
      } catch (imgErr) {
        console.warn('[Save] image compression failed (non-fatal):', imgErr);
      }
    }

    const now = new Date().toISOString();
    console.log('[Save] step 3: writing to IndexedDB, userId:', userId);

    try {
      const receipt = await addReceipt(userId, {
        uuid:         crypto.randomUUID(),
        storeName:    payload.storeName,
        receiptDate:  payload.receiptDate,
        subtotal:     payload.subtotal,
        taxAmount:    payload.taxAmount,
        total:        payload.total,
        category:     payload.category,
        clientName:   payload.clientName || null,
        lineItems:    payload.lineItems,
        rawLineItems: payload.rawLineItems,
        taxLines:     payload.taxLines,
        imagePath:    null,
        imageUrl,
        notes:        null,
        createdAt:    now,
        updatedAt:    now,
      });

      // Push to Drive immediately — fire and forget, don't block the UI.
      // Failure is recorded to sync_status by pushReceiptNow itself; catch here
      // prevents unhandled promise rejection.
      pushReceiptNow(receipt, userId).catch(err => {
        console.error('[Drive push] failed after save:', err);
      });

      onSaved(receipt);
    } catch (err) {
      const msg = (err as Error).message || 'Could not save receipt.';
      console.error('[Save] FAILED at IndexedDB write:', err);
      setError(`Save failed: ${msg}`);
      setStep('select');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sb-bg">
      {/* Header */}
      <div className="border-b border-sb-border safe-top">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto w-full">
          <h2 className="text-lg font-semibold text-white">
            {step === 'pick'     ? 'Scan' :
             step === 'scanning' ? 'Scanning…' :
             step === 'select'   ? 'Select Items' :
             'Saving…'}
          </h2>
          {step !== 'scanning' && step !== 'saving' && (
            <button onClick={onClose} className="p-2 text-sb-muted hover:text-white transition">
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {step === 'pick' && (
        <div className="flex-1 flex flex-col px-6 max-w-2xl mx-auto w-full">
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            {error && (
              <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-3 text-center w-full max-w-xs">
                {error}
              </p>
            )}

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full max-w-xs py-5 rounded-2xl bg-sb-card border border-sb-border flex flex-col items-center gap-3 hover:border-sb-green transition active:scale-95"
            >
              <Camera size={36} className="text-sb-green" />
              <span className="text-white font-semibold">Camera</span>
              <span className="text-white text-sm opacity-50">Take a photo now</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-xs py-5 rounded-2xl bg-sb-card border border-sb-border flex flex-col items-center gap-3 hover:border-sb-purple transition active:scale-95"
            >
              <ImageIcon size={36} className="text-sb-purple" />
              <span className="text-white font-semibold">Photo Library</span>
              <span className="text-white text-sm opacity-50">Choose from camera roll</span>
            </button>

            {isDesktop && (
              <div
                ref={pasteZoneRef}
                onClick={handleClickPaste}
                className={`w-full max-w-xs py-5 rounded-2xl border-2 border-dashed flex flex-col items-center gap-3 cursor-pointer transition active:scale-95 ${
                  pasteHighlight
                    ? 'border-sb-green bg-green-950/30'
                    : 'border-sb-border bg-sb-card hover:border-blue-400'
                }`}
              >
                <Clipboard size={36} className="text-blue-400" />
                <span className="text-white font-semibold">Paste Screenshot</span>
                <span className="text-white text-sm opacity-50">Cmd+V / Ctrl+V anywhere here</span>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          <div className="pb-10 pt-4 safe-bottom">
            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-2xl border border-sb-border text-white/60 text-sm font-medium hover:text-white hover:border-sb-muted transition active:scale-95"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(step === 'scanning' || step === 'saving') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          <p className="text-white opacity-50 text-sm">
            {step === 'scanning' ? 'Reading your receipt…' : 'Saving receipt…'}
          </p>
        </div>
      )}

      {step === 'select' && scanned && (
        <LineItemSelector
          scanned={scanned}
          onSave={handleSave}
          onBack={() => setStep('pick')}
          error={error}
        />
      )}
    </div>
  );
}
