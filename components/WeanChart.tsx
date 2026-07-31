import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ScheduleResult } from '../types';
import { parseISODateLocal } from '../services/dateUtils';

interface WeanChartProps {
  steps: ScheduleResult['steps'];
  targetCurve: ScheduleResult['targetCurve'];
  unit: string;
  isDarkMode?: boolean;
}

interface ChartPoint {
  t: number;
  dose?: number;
  ideal?: number;
}

const timestamp = (iso: string): number | null => parseISODateLocal(iso)?.getTime() ?? null;

const WeanChart: React.FC<WeanChartProps> = ({ steps, targetCurve, unit, isDarkMode }) => {
  // The two series are sampled at different dates: the plan holds a dose across
  // several intervals, while the ideal curve moves at every interval. Merging on
  // the timestamp keeps both on one honest time axis.
  const byTime = new Map<number, ChartPoint>();
  const pointAt = (t: number): ChartPoint => {
    let point = byTime.get(t);
    if (!point) {
      point = { t };
      byTime.set(t, point);
    }
    return point;
  };

  steps.forEach(step => {
    const t = timestamp(step.date);
    if (t !== null) pointAt(t).dose = step.actualDose;
  });
  targetCurve.forEach(entry => {
    const t = timestamp(entry.date);
    if (t !== null) pointAt(t).ideal = entry.dose;
  });

  const data = Array.from(byTime.values()).sort((a, b) => a.t - b.t);
  const axisColor = '#94a3b8';

  return (
    <div className="h-72 w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 pb-10 transition-colors duration-200">
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">Projected Taper Curve</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#f1f5f9"} />
          <XAxis
            dataKey="t"
            // A numeric time axis, so a 12-week hold is drawn six times wider
            // than a 2-week one. A category axis would space them equally.
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            // Keeps the final drop to zero off the plot edge, where it would clip.
            padding={{ left: 4, right: 12 }}
            tick={{ fontSize: 10, fill: axisColor }}
            tickFormatter={(value: number) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis
            tick={{ fontSize: 10, fill: axisColor }}
            label={{ value: unit, angle: -90, position: 'insideLeft', style: { fill: axisColor, fontSize: 10 } }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderRadius: '8px', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            itemStyle={{ fontSize: '12px', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}
            formatter={(value: number, name: string) => [`${value} ${unit}`, name]}
            // The timestamps are already local midnight, so format the Date
            // directly; round-tripping through toISOString would shift the day.
            labelFormatter={(label: number) => new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Line
            // A dose is held and then dropped; it is never titrated smoothly
            // between two values, so the line must be stepped.
            type="stepAfter"
            dataKey="dose"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            name="Prescribed dose"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="ideal"
            stroke={axisColor}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Ideal target"
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WeanChart;
