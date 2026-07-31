import React from 'react';
import { Circle, Square } from 'lucide-react';
import { Denomination } from '../types';

interface TabletVisualizerProps {
  counts: { [id: string]: number };
  denominations: Denomination[];
  unit: string;
}

const FRACTION_LABELS: { [fraction: string]: string } = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾'
};

const TabletVisualizer: React.FC<TabletVisualizerProps> = ({ counts, denominations, unit }) => {
  const items = (Object.entries(counts) as [string, number][]).filter(([_, count]) => count > 0);

  if (items.length === 0) return <span className="text-slate-400 dark:text-slate-500 text-xs">No medication</span>;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {items.map(([id, count]) => {
        const denom = denominations.find(d => d.id === id);
        if (!denom) return null;

        const isSmall = denom.strength <= 5;
        const fullPills = Math.floor(count);
        const remainder = parseFloat((count - fullPills).toFixed(2));

        return (
          <div key={id} className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-1 border border-slate-200 dark:border-slate-600 transition-colors">
            <div className="flex -space-x-1 mr-2 items-center">
              {/* Full Pills */}
              {Array.from({ length: Math.min(fullPills, 5) }).map((_, i) => (
                <div key={`full-${i}`} className="relative z-10">
                   {isSmall ?
                     <Circle size={14} className="fill-white text-sky-500" /> :
                     <Square size={14} className="fill-white text-indigo-500 rounded-sm" />
                   }
                </div>
              ))}

              {/* Fractional Pill */}
              {remainder > 0 && (
                <div key="partial" className="relative z-20">
                   <div className="relative">
                     {isSmall ?
                        <Circle size={14} className="text-sky-500 fill-sky-100" /> :
                        <Square size={14} className="text-indigo-500 fill-indigo-100 rounded-sm" />
                     }
                     <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-slate-600">
                        {FRACTION_LABELS[String(remainder)] ?? ''}
                     </div>
                   </div>
                </div>
              )}

              {fullPills > 5 && <span className="text-xs text-slate-500 dark:text-slate-400 pl-2">+{fullPills - 5}</span>}
            </div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
              {count} x {denom.strength}{unit}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default TabletVisualizer;
