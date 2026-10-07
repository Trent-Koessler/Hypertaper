import React from 'react';

/**
 * The HyperTaper mark: a dose that falls fast and then levels off, the shape of
 * a hyperbolic taper. Kept in step with `public/favicon.svg`.
 */
const AppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect width="64" height="64" rx="15" fill="#0f766e" />
    <path d="M14 14 C18 36 28 46 50 49" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
  </svg>
);

export default AppIcon;
