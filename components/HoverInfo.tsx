import React from 'react';
import { Info } from 'lucide-react';

interface HoverInfoProps {
  /** Shown in a small bubble on hover, keyboard focus or tap. */
  text: string;
  /** Screen-reader name for the icon. */
  label?: string;
  /** Which side of the icon the bubble opens towards. */
  align?: 'left' | 'right';
}

/**
 * An (i) icon with a short explanation that appears on hover. Tapping it on a
 * touch screen focuses the button, which shows the same bubble.
 */
const HoverInfo: React.FC<HoverInfoProps> = ({ text, label = 'More information', align = 'left' }) => (
  <span className="relative inline-flex group align-middle print:hidden">
    <button
      type="button"
      aria-label={label}
      className="p-0.5 rounded-full text-slate-400 hover:text-teal-600 focus:text-teal-600 dark:text-slate-500 dark:hover:text-teal-400 dark:focus:text-teal-400 outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <Info size={13} />
    </button>
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full mt-1 z-50 w-72 max-w-[80vw] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-[11px] leading-relaxed font-normal normal-case text-slate-600 dark:text-slate-300 shadow-lg opacity-0 invisible transition-opacity group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible ${align === 'left' ? 'left-0' : 'right-0'}`}
    >
      {text}
    </span>
  </span>
);

export default HoverInfo;
