import { useState, useRef, useCallback, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

// Phase 6 Stage 2 — purple month range slider for the Dashboard.
//
// Behavior contract (from spec + Alan's mockup):
//   - 12 month detents evenly spaced along a horizontal rail
//   - Two round purple handles; purple fill between them
//   - Grey rail + grey detent dots outside the fill; small silver detents
//     also visible inside the fill (subtle)
//   - Full year (start=0, end=11) = "rest state": NO readout above, NO reset
//     below, instruction line "tap a month, or drag the ends" shows.
//   - Narrowed (anything else) = readout above (e.g. "January – June"),
//     Reset button below. Instruction hidden.
//
// Input:
//   - Tap on a detent =
//       * fresh state → start of a new selection (span collapses to that
//         single month; both handles snap there)
//       * after a single-month tap → extends to a span (the two months
//         become start and end, sorted)
//       * fresh tap after a completed span → starts over as single-month
//   - Drag either handle → smooth pointer-follow, snaps to nearest detent on
//     drop. Handles cannot cross (start <= end enforced).
//
// The slider only owns start/end month INDICES (0..11) and calls onChange
// when they change. The parent Dashboard decides how to slice receipts.

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const PURPLE       = '#a855f7';
const PURPLE_DARK  = '#7c3aed';
const RAIL_GREY    = '#2a2a33';
const DETENT_GREY  = '#5a5468';
const DETENT_ON_FILL = '#c4b5fd';

interface Props {
  start: number;       // 0..11
  end:   number;       // 0..11, >= start
  onChange: (start: number, end: number) => void;
}

type TapState = 'fresh' | 'awaiting-end';

export default function MonthRangeSlider({ start, end, onChange }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const [tapState, setTapState] = useState<TapState>('fresh');

  const isFullYear = start === 0 && end === 11;

  // ── Geometry helpers ──────────────────────────────────────────────────────
  // Detents live at fractional positions i/11 (0.0 … 1.0) so both edges
  // touch the ends of the rail; each detent i is centered at (i/11) * width.

  const positionForIndex = (i: number) => `${(i / 11) * 100}%`;

  const indexFromClientX = useCallback((clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * 11);
  }, []);

  // ── Tap on a detent ───────────────────────────────────────────────────────

  const handleDetentTap = useCallback((i: number) => {
    // If a selection is completed and the user taps again → fresh single-month.
    // If a single-month is set and user taps another → extend to a span.
    if (tapState === 'fresh' || start !== end) {
      // Start (or restart) as single-month
      onChange(i, i);
      setTapState('awaiting-end');
      return;
    }
    // tapState === 'awaiting-end' and current is single-month (start === end)
    const anchor = start;
    if (i === anchor) {
      // Same month tapped again — no-op, stay in awaiting-end so a THIRD tap
      // still counts as extend.
      return;
    }
    const s = Math.min(anchor, i);
    const e = Math.max(anchor, i);
    onChange(s, e);
    setTapState('fresh');
  }, [onChange, start, end, tapState]);

  // ── Drag handle ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      const i = indexFromClientX(e.clientX);
      if (dragging === 'start') {
        const next = Math.min(i, end);
        if (next !== start) onChange(next, end);
      } else {
        const next = Math.max(i, start);
        if (next !== end) onChange(start, next);
      }
    }
    function onUp() {
      setDragging(null);
      setTapState('fresh');
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, indexFromClientX, onChange, start, end]);

  const startHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging('start');
  };
  const endHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging('end');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const readout = start === end
    ? MONTH_NAMES_LONG[start]
    : `${MONTH_NAMES_LONG[start]} – ${MONTH_NAMES_LONG[end]}`;

  return (
    <div className="w-full select-none">
      {/* Readout — only when narrowed */}
      <div className="h-6 flex items-center justify-center mb-2">
        {!isFullYear && (
          <p className="text-white text-base font-bold tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {readout}
          </p>
        )}
      </div>

      {/* Rail row */}
      <div className="relative px-1 py-3">
        <div
          ref={railRef}
          className="relative h-1 rounded-full"
          style={{ backgroundColor: RAIL_GREY }}
        >
          {/* Purple fill between the two handles */}
          <div
            className="absolute top-0 h-full rounded-full transition-[left,width] duration-100"
            style={{
              left:  positionForIndex(start),
              width: `calc(${((end - start) / 11) * 100}% )`,
              backgroundColor: PURPLE,
            }}
          />

          {/* 12 detents — large invisible tap targets over small visible dots */}
          {Array.from({ length: 12 }, (_, i) => {
            const insideFill = i > start && i < end;
            const isHandlePos = i === start || i === end;
            return (
              <button
                key={i}
                type="button"
                aria-label={MONTH_NAMES_LONG[i]}
                onClick={() => handleDetentTap(i)}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center"
                style={{ left: positionForIndex(i), width: 40, height: 40 }}
              >
                {!isHandlePos && (
                  <span
                    className="rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: insideFill ? DETENT_ON_FILL : DETENT_GREY,
                    }}
                  />
                )}
              </button>
            );
          })}

          {/* Start handle */}
          <div
            onPointerDown={startHandlePointerDown}
            role="slider"
            aria-label={`Range start: ${MONTH_NAMES_LONG[start]}`}
            aria-valuemin={0}
            aria-valuemax={11}
            aria-valuenow={start}
            tabIndex={0}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full cursor-grab active:cursor-grabbing touch-none"
            style={{
              left: positionForIndex(start),
              width: 22, height: 22,
              backgroundColor: PURPLE,
              border: `2px solid ${PURPLE_DARK}`,
              boxShadow: '0 2px 6px rgba(168,85,247,0.35)',
              zIndex: 2,
            }}
          />
          {/* End handle */}
          <div
            onPointerDown={endHandlePointerDown}
            role="slider"
            aria-label={`Range end: ${MONTH_NAMES_LONG[end]}`}
            aria-valuemin={0}
            aria-valuemax={11}
            aria-valuenow={end}
            tabIndex={0}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full cursor-grab active:cursor-grabbing touch-none"
            style={{
              left: positionForIndex(end),
              width: 22, height: 22,
              backgroundColor: PURPLE,
              border: `2px solid ${PURPLE_DARK}`,
              boxShadow: '0 2px 6px rgba(168,85,247,0.35)',
              zIndex: 2,
            }}
          />
        </div>

        {/* Month labels under every detent.
            Alignment: each label's CENTER sits under its detent's center EXCEPT
            Jan (i=0), which anchors LEFT (so the "J" starts at 0%), and Dec
            (i=11), which anchors RIGHT (so the "c" ends at 100%). This
            maximises breathing room between the outer labels and their
            neighbours (Feb, Nov) without cramping the middle. */}
        <div className="relative mt-3 h-4 text-white/50 text-[10px]">
          {MONTH_NAMES_SHORT.map((label, i) => {
            const isFirst = i === 0;
            const isLast  = i === 11;
            const style: React.CSSProperties = {
              position: 'absolute',
              top: 0,
              left: `${(i / 11) * 100}%`,
              transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
              whiteSpace: 'nowrap',
            };
            return <span key={i} style={style}>{label}</span>;
          })}
        </div>
      </div>

      {/* Below-rail area: instruction at full year, Reset when narrowed */}
      <div className="h-10 flex items-center justify-center mt-1">
        {isFullYear ? (
          <p className="text-white/40 text-xs">tap a month, or drag the ends</p>
        ) : (
          <button
            onClick={() => { onChange(0, 11); setTapState('fresh'); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border transition"
            style={{ borderColor: PURPLE, color: PURPLE }}
          >
            <RotateCcw size={12} />
            <span className="text-xs font-semibold">Reset</span>
          </button>
        )}
      </div>
    </div>
  );
}
