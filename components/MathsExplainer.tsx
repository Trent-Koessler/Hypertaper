import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';

/**
 * Header popover explaining the taper equation in plain language.
 *
 * Deliberately generic: it describes the formulas the engine uses rather than
 * the current plan's numbers, so it reads the same before any dose is entered.
 * The plan-specific derivation lives in CalculationBreakdown.
 */
const MathsExplainer: React.FC = () => {
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
    // Move focus into the panel so keyboard and screen-reader users land on the
    // content they just opened, and Escape has somewhere sensible to return from.
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(open => !open)}
        className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
        aria-label="How the taper is calculated"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Info size={20} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="How the taper is calculated"
          className="absolute right-0 mt-2 w-[22rem] sm:w-[26rem] max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-5 text-left"
        >
          <div className="flex items-start justify-between gap-4 mb-3">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              How the taper is calculated
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

          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            The dose the taper is aiming for at each step.
          </p>

          <p className="font-mono text-sm text-blue-700 dark:text-blue-300 bg-slate-50 dark:bg-slate-900 rounded px-3 py-2 mb-3">
            target(n) = D₀ × (1 − r/100)<sup>n</sup>
          </p>

          <ul className="space-y-1 mb-3 text-sm text-slate-600 dark:text-slate-300">
            <li>
              <strong className="text-slate-800 dark:text-slate-100">target(n)</strong> — the dose
              the curve asks for at step <em>n</em>, before tablets are taken into account
            </li>
            <li>
              <strong className="text-slate-800 dark:text-slate-100">D₀</strong> — the starting dose
            </li>
            <li>
              <strong className="text-slate-800 dark:text-slate-100">r</strong> — the reduction you
              asked for, as a percentage
            </li>
            <li>
              <strong className="text-slate-800 dark:text-slate-100">n</strong> — which reduction
              you're up to (0 = the starting dose, 1 = the first cut, and so on). Each one falls a
              fixed interval later.
            </li>
          </ul>

          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            Each cut takes the same <em>percentage</em> of what's left, not the same number of
            milligrams. So the steps get smaller as the dose gets smaller — 10% of 20mg is 2mg, but
            10% of 2mg is 0.2mg. This is what "hyperbolic" means: it matches the fact that the last
            few milligrams matter far more than the first few, and it stretches out the tail of the
            taper instead of ending in a cliff.
          </p>

          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            In <strong className="text-slate-800 dark:text-slate-100">fixed</strong> mode the
            formula is simply{' '}
            <span className="font-mono text-blue-700 dark:text-blue-300">
              target(n) = D₀ − n × r
            </span>
            , taking the same amount off every time.
          </p>

          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            Each target is worked out from the original dose, never from the previous prescribed
            dose, so tablet rounding at one step never carries through the rest of the plan.
          </p>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            <strong className="text-slate-800 dark:text-slate-100">From curve to tablets.</strong>{' '}
            The curve asks for doses no tablet can make. For each target the app finds the largest
            dose your available tablets and splits can actually make <em>without going over</em>,
            and holds it until the curve falls far enough to justify the next one. That's why the
            plan is a staircase sitting just under a smooth curve — and why it warns you when coarse
            tablet strengths force a drop much steeper than you asked for.
          </p>
        </div>
      )}
    </div>
  );
};

export default MathsExplainer;
