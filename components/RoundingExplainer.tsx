import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';

const OPTIONS: { name: string; what: string; pro: string; con: string }[] = [
  {
    name: 'Stay under',
    what: 'Drops as soon as the curve dips below the current dose.',
    pro: 'Never more medicine than the curve asks for. Shortest plan.',
    con: 'Drops come early, and the last dose stops while the curve is still above zero.'
  },
  {
    name: 'Nearest',
    what: 'Uses whichever dose is closest to the curve.',
    pro: 'Follows the curve most closely overall.',
    con: 'Some steps sit a little above the curve. Longer plan.'
  },
  {
    name: 'Hold longer',
    what: 'Stays on each dose until the curve reaches the next one down.',
    pro: 'Gentlest timing: the full time on each dose before every cut.',
    con: 'Always on or above the curve, so more medicine, more tablets and the longest plan.'
  }
];

/**
 * Small popover beside the "When Tablets Can't Match" setting, comparing the
 * three rounding modes in plain language. Opens and closes like MathsExplainer.
 */
const RoundingExplainer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative print:hidden" ref={containerRef}>
      <button
        onClick={() => setIsOpen(open => !open)}
        className="p-0.5 text-slate-400 hover:text-teal-600 dark:text-slate-500 dark:hover:text-teal-400 transition-colors rounded-full"
        aria-label="About these options"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Info size={14} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="When tablets can't match the curve"
          className="absolute right-0 z-20 mt-2 w-[18rem] sm:w-[20rem] max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-4 text-left normal-case"
        >
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              When tablets can't match the curve
            </h2>
            <button
              ref={closeButtonRef}
              onClick={() => setIsOpen(false)}
              className="p-1 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            Tablets only come in set sizes, so this decides <em>when</em> each drop happens. The drops
            are the same size in every option.
          </p>

          <dl className="space-y-3">
            {OPTIONS.map(option => (
              <div key={option.name}>
                <dt className="text-xs font-semibold text-teal-700 dark:text-teal-300">{option.name}</dt>
                <dd className="text-xs text-slate-600 dark:text-slate-300">
                  {option.what}
                  <span className="block mt-0.5"><span aria-hidden="true">✅ </span><span className="sr-only">Pro: </span>{option.pro}</span>
                  <span className="block"><span aria-hidden="true">❌ </span><span className="sr-only">Con: </span>{option.con}</span>
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            In every option the dose never goes up, and steep drops are still flagged.
          </p>
        </div>
      )}
    </div>
  );
};

export default RoundingExplainer;
