import { useEffect } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
}

export default function BottomSheet({
  title,
  onClose,
  children,
  primaryLabel = 'Create',
  onPrimary,
  primaryDisabled,
}: Props) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Card */}
      <div
        className="relative bg-sb-card2 rounded-2xl w-full max-w-sm p-5"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
      >
        {/* Title */}
        <p className="text-white font-bold text-[17px] mb-4"
          style={{ fontFamily: "'Poppins', sans-serif" }}>
          {title}
        </p>
        {/* Content */}
        <div className="mb-5">{children}</div>
        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-sb-border text-white text-sm font-semibold hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={onPrimary}
            disabled={primaryDisabled}
            className="flex-1 py-2.5 rounded-xl bg-sb-green text-black text-sm font-bold disabled:opacity-40 transition hover:brightness-110 active:scale-95"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
