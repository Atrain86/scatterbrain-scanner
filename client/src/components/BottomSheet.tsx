import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable bottom sheet. Rises from the bottom with a cubic-bezier settle,
 * dims the background with a scrim, drag-to-dismiss via the grab handle,
 * tap-scrim to dismiss, ESC to dismiss. Body scroll is locked while open.
 *
 * The sheet content is what CALLERS render as children — this component only
 * handles the shell + motion.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional max-width for the sheet content. Default: 32rem (desktop-friendly). */
  maxWidth?: string;
  children: React.ReactNode;
}

const SETTLE_EASING = 'cubic-bezier(.32,.72,0,1)';
const SETTLE_MS = 300;
const DRAG_CLOSE_THRESHOLD = 100; // px past which release closes the sheet

export default function BottomSheet({ open, onClose, maxWidth = '32rem', children }: Props) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Mount / unmount with delay to allow exit animation
  useEffect(() => {
    if (open) {
      setRendered(true);
      // Next tick so CSS transition triggers
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else if (rendered) {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), SETTLE_MS);
      return () => clearTimeout(t);
    }
  }, [open, rendered]);

  // Lock body scroll when sheet open
  useEffect(() => {
    if (!rendered) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [rendered]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function onPointerDown(e: React.PointerEvent) {
    // Only start drag from the grab handle area (data attr on the sheet header)
    const target = e.target as HTMLElement;
    if (!target.closest('[data-sheet-handle]')) return;
    dragStart.current = e.clientY;
    setDragY(0);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current == null) return;
    const dy = Math.max(0, e.clientY - dragStart.current); // no upward drag
    setDragY(dy);
  }

  function onPointerUp() {
    if (dragStart.current == null) return;
    const shouldClose = dragY > DRAG_CLOSE_THRESHOLD;
    dragStart.current = null;
    if (shouldClose) {
      onClose();
    }
    setDragY(0);
  }

  if (!rendered) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
      {/* Scrim */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 transition-opacity"
        style={{
          opacity: visible ? 1 : 0,
          transitionDuration: `${SETTLE_MS}ms`,
          transitionTimingFunction: SETTLE_EASING,
        }}
      />

      {/* Sheet */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none">
        <div
          ref={sheetRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="pointer-events-auto w-full bg-sb-card border-t border-sb-border rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.4)]"
          style={{
            maxWidth,
            transform: `translateY(${visible ? dragY : window.innerHeight}px)`,
            transition: dragStart.current == null
              ? `transform ${SETTLE_MS}ms ${SETTLE_EASING}`
              : 'none',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Grab handle */}
          <div data-sheet-handle className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
