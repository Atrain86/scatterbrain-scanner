import { useState, useRef } from 'react';
import { X, Camera, Image as ImageIcon } from 'lucide-react';
import { useAuthFetch } from '../contexts/AuthContext';
import { compressReceiptImage } from '../lib/imageCompression';
import LineItemSelector from './LineItemSelector';
import type { ScannedReceiptData } from '../utils/types';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

type Step = 'pick' | 'scanning' | 'select' | 'saving';

export default function ScanModal({ onClose, onSaved }: Props) {
  const authFetch = useAuthFetch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [scanned, setScanned] = useState<ScannedReceiptData | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState('');

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
      const res = await authFetch('/api/receipts/scan', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Scan failed');
      const data: ScannedReceiptData = await res.json();
      setScanned(data);
      setStep('select');
    } catch (err) {
      setError((err as Error).message || 'Could not scan receipt. Try again.');
      setStep('pick');
    }
  }

  async function handleSave(payload: {
    storeName: string;
    receiptDate: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    category: string;
    lineItems: string;
    taxLines: string;
  }) {
    setStep('saving');
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => form.append(k, String(v)));
    if (imageFile) form.append('receipt', imageFile);

    try {
      const res = await authFetch('/api/receipts', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Save failed');
      onSaved();
    } catch (err) {
      setError((err as Error).message || 'Could not save receipt.');
      setStep('select');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sb-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sb-border safe-top">
        <h2 className="text-lg font-semibold text-white">
          {step === 'pick'     ? 'Scan Receipt' :
           step === 'scanning' ? 'Scanning…'    :
           step === 'select'   ? 'Select Items'  :
           'Saving…'}
        </h2>
        {step !== 'scanning' && step !== 'saving' && (
          <button onClick={onClose} className="p-2 text-sb-muted hover:text-white transition">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Body */}
      {step === 'pick' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          {error && (
            <p className="text-sb-red text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-3 text-center w-full max-w-xs">
              {error}
            </p>
          )}

          <button
            onClick={() => cameraInputRef.current?.click()}
            className="w-full max-w-xs py-5 rounded-2xl bg-sb-card border border-sb-border flex flex-col items-center gap-3 hover:border-sb-green transition active:scale-95"
          >
            <Camera size={36} className="text-sb-green" />
            <span className="text-white font-semibold">Camera</span>
            <span className="text-sb-muted text-sm">Take a photo now</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs py-5 rounded-2xl bg-sb-card border border-sb-border flex flex-col items-center gap-3 hover:border-sb-purple transition active:scale-95"
          >
            <ImageIcon size={36} className="text-sb-purple" />
            <span className="text-white font-semibold">Photo Library</span>
            <span className="text-sb-muted text-sm">Choose from camera roll</span>
          </button>

          {/* Hidden inputs */}
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
      )}

      {(step === 'scanning' || step === 'saving') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          <p className="text-sb-muted text-sm">
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
