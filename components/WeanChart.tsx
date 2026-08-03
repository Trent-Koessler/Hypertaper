import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ScheduleResult } from '../types';
import { addDaysISO, parseISODateLocal } from '../services/dateUtils';

interface WeanChartProps {
  steps: ScheduleResult['steps'];
  targetCurve: ScheduleResult['targetCurve'];
  unit: string;
  /** Dose the percentage view is measured against — the patient's starting dose. */
  startingDose: number;
  startDate: string;
  endDate: string;
  isDarkMode?: boolean;
}

interface ChartPoint {
  t: number;
  dose?: number;
  ideal?: number;
}

type TickMode = 'auto' | 'day' | 'week' | 'month';
type YScale = 'linear' | 'log';
type YUnit = 'dose' | 'percent';

const DAY_MS = 86_400_000;

const timestamp = (iso: string): number | null => parseISODateLocal(iso)?.getTime() ?? null;

/** Value of a step series at `t`: the last value set at or before it. */
function carryForward(points: ChartPoint[], key: 'dose' | 'ideal', t: number): number | undefined {
  let carried: number | undefined;
  for (const point of points) {
    if (point.t > t) break;
    if (point[key] !== undefined) carried = point[key];
  }
  return carried;
}

/** Value of a continuous series at `t`, interpolated between its samples. */
function interpolate(points: ChartPoint[], key: 'dose' | 'ideal', t: number): number | undefined {
  const known = points.filter(p => p[key] !== undefined);
  if (known.length === 0) return undefined;
  if (t <= known[0].t) return known[0][key];
  for (let i = 1; i < known.length; i++) {
    if (known[i].t < t) continue;
    const a = known[i - 1];
    const b = known[i];
    const span = b.t - a.t;
    if (span === 0) return b[key];
    return a[key]! + ((b[key]! - a[key]!) * (t - a.t)) / span;
  }
  return known[known.length - 1][key];
}

/** Thins a tick list down to a readable count without dropping the endpoints. */
function thin(ticks: number[], limit = 10): number[] {
  if (ticks.length <= limit) return ticks;
  const stride = Math.ceil(ticks.length / limit);
  const kept = ticks.filter((_, i) => i % stride === 0);
  const last = ticks[ticks.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

function buildTicks(from: number, to: number, mode: TickMode): number[] {
  const spanDays = Math.max(1, Math.round((to - from) / DAY_MS));
  const resolved: Exclude<TickMode, 'auto'> =
    mode !== 'auto' ? mode : spanDays <= 21 ? 'day' : spanDays <= 180 ? 'week' : 'month';

  if (resolved === 'month') {
    const ticks: number[] = [];
    const cursor = new Date(from);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    if (cursor.getTime() < from) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor.getTime() <= to) {
      ticks.push(cursor.getTime());
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return thin(ticks.length > 1 ? ticks : [from, to]);
  }

  const strideDays = resolved === 'week' ? 7 : 1;
  const ticks: number[] = [];
  // Walk the calendar rather than adding milliseconds, so a DST change cannot
  // nudge a tick onto the wrong day.
  for (let day = 0; ; day += strideDays) {
    const date = new Date(from);
    date.setDate(date.getDate() + day);
    if (date.getTime() > to) break;
    ticks.push(date.getTime());
  }
  return thin(ticks);
}

const WeanChart: React.FC<WeanChartProps> = ({
  steps,
  targetCurve,
  unit,
  startingDose,
  startDate,
  endDate,
  isDarkMode
}) => {
  const [tickMode, setTickMode] = useState<TickMode>('auto');
  const [yScale, setYScale] = useState<YScale>('linear');
  const [yUnit, setYUnit] = useState<YUnit>('dose');
  const [showPrescribed, setShowPrescribed] = useState(true);
  const [showIdeal, setShowIdeal] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // The two series are sampled at different dates: the plan holds a dose across
  // several intervals, while the ideal curve moves at every interval. Merging on
  // the timestamp keeps both on one honest time axis.
  const allPoints = useMemo(() => {
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

    return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
  }, [steps, targetCurve]);

  const planFrom = timestamp(startDate) ?? allPoints[0]?.t ?? Date.now();
  const planTo = timestamp(endDate) ?? allPoints[allPoints.length - 1]?.t ?? planFrom;

  const windowFrom = (fromDate && timestamp(fromDate)) || planFrom;
  const windowTo = (toDate && timestamp(toDate)) || planTo;
  const [from, to] = windowFrom <= windowTo ? [windowFrom, windowTo] : [windowTo, windowFrom];

  const scaleValue = (value: number | undefined): number | undefined =>
    value === undefined ? undefined : yUnit === 'percent' && startingDose > 0
      ? parseFloat(((value / startingDose) * 100).toFixed(2))
      : value;

  const data = useMemo(() => {
    const inWindow = allPoints.filter(p => p.t >= from && p.t <= to);

    // A dose held from before the window would otherwise start the line late,
    // making a long hold look like a gap. Carry it in at the window edge.
    const edges: ChartPoint[] = [];
    if (!inWindow.some(p => p.t === from)) {
      edges.push({ t: from, dose: carryForward(allPoints, 'dose', from), ideal: interpolate(allPoints, 'ideal', from) });
    }
    if (!inWindow.some(p => p.t === to) && to > from) {
      edges.push({ t: to, dose: carryForward(allPoints, 'dose', to), ideal: interpolate(allPoints, 'ideal', to) });
    }

    const scaled = [...edges, ...inWindow]
      .sort((a, b) => a.t - b.t)
      .map(p => ({ t: p.t, dose: scaleValue(p.dose), ideal: scaleValue(p.ideal) }));

    if (yScale !== 'log') return scaled;

    // A log axis cannot render zero. Dropping the cessation point outright
    // would end the prescribed line at the *start* of the last held dose,
    // hiding weeks of treatment, so hold the last dose out to that date
    // instead and say in the caption that the drop to zero is not drawn.
    let lastDose: number | undefined;
    return scaled.map(p => {
      if (p.dose !== undefined && p.dose > 0) lastDose = p.dose;
      return {
        t: p.t,
        dose: p.dose === 0 ? lastDose : p.dose,
        ideal: p.ideal === 0 ? undefined : p.ideal
      };
    });
  }, [allPoints, from, to, yScale, yUnit, startingDose]);

  const ticks = useMemo(() => buildTicks(from, to, tickMode), [from, to, tickMode]);

  const axisColor = '#94a3b8';
  const yLabel = yUnit === 'percent' ? '% of start' : unit;
  const valueSuffix = yUnit === 'percent' ? '% of start' : unit;
  const hasZeroDose = yScale === 'log' && allPoints.some(p => p.dose === 0);

  const formatTick = (value: number): string => {
    const date = new Date(value);
    const spanDays = Math.max(1, Math.round((to - from) / DAY_MS));
    const resolved = tickMode !== 'auto' ? tickMode : spanDays <= 21 ? 'day' : spanDays <= 180 ? 'week' : 'month';
    if (resolved === 'month') {
      return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    }
    if (resolved === 'week') {
      // Week numbers are relative to the plan, which is what a clinician
      // reviewing "week 6 of the taper" actually wants.
      const week = Math.round((value - planFrom) / DAY_MS / 7);
      return `Wk ${week}`;
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const controlClass =
    'text-xs px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 outline-none';

  const preset = (label: string, apply: () => void) => (
    <button
      key={label}
      onClick={apply}
      className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
    >
      {label}
    </button>
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 transition-colors duration-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Projected Taper Curve</h3>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {preset('Full plan', () => { setFromDate(''); setToDate(''); })}
          {preset('First 12 weeks', () => { setFromDate(startDate); setToDate(addDaysISO(startDate, 84)); })}
          {preset('Last 12 weeks', () => { setFromDate(addDaysISO(endDate, -84)); setToDate(endDate); })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mb-4 print:hidden">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500">From</span>
          <input
            type="date"
            value={fromDate}
            min={startDate}
            max={endDate}
            onChange={e => setFromDate(e.target.value)}
            className={controlClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500">To</span>
          <input
            type="date"
            value={toDate}
            min={startDate}
            max={endDate}
            onChange={e => setToDate(e.target.value)}
            className={controlClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500">X axis</span>
          <select value={tickMode} onChange={e => setTickMode(e.target.value as TickMode)} className={controlClass}>
            <option value="auto">Auto</option>
            <option value="day">Days</option>
            <option value="week">Taper weeks</option>
            <option value="month">Months</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500">Y axis</span>
          <select value={yUnit} onChange={e => setYUnit(e.target.value as YUnit)} className={controlClass}>
            <option value="dose">Dose ({unit})</option>
            <option value="percent">% of starting dose</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500">Scale</span>
          <select value={yScale} onChange={e => setYScale(e.target.value as YScale)} className={controlClass}>
            <option value="linear">Linear</option>
            <option value="log">Logarithmic</option>
          </select>
        </label>
        <div className="flex items-center gap-3 pb-1">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={showPrescribed} onChange={e => setShowPrescribed(e.target.checked)} />
            Prescribed
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={showIdeal} onChange={e => setShowIdeal(e.target.checked)} />
            Ideal target
          </label>
        </div>
      </div>

      {yScale === 'log' && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
          On a log axis a constant-percentage taper is a straight line, which makes any deviation from the
          intended curve obvious.
          {hasZeroDose && ' Zero cannot be plotted on a log axis, so the final dose is drawn holding to the cessation date rather than dropping to it.'}
        </p>
      )}

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#f1f5f9'} />
            <XAxis
              dataKey="t"
              // A numeric time axis, so a 12-week hold is drawn six times wider
              // than a 2-week one. A category axis would space them equally.
              type="number"
              scale="time"
              domain={[from, to]}
              ticks={ticks}
              // Keeps the final drop to zero off the plot edge, where it would clip.
              padding={{ left: 4, right: 12 }}
              tick={{ fontSize: 10, fill: axisColor }}
              tickFormatter={formatTick}
            />
            <YAxis
              scale={yScale}
              domain={yScale === 'log' ? ['auto', 'auto'] : [0, 'auto']}
              allowDataOverflow={false}
              tick={{ fontSize: 10, fill: axisColor }}
              tickFormatter={(value: number) => String(parseFloat(value.toPrecision(3)))}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', style: { fill: axisColor, fontSize: 10 } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                borderRadius: '8px',
                border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
              itemStyle={{ fontSize: '12px', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}
              formatter={(value: number, name: string) => [`${value} ${valueSuffix}`, name]}
              // The timestamps are already local midnight, so format the Date
              // directly; round-tripping through toISOString would shift the day.
              labelFormatter={(label: number) => new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            {showPrescribed && (
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
                isAnimationActive={false}
              />
            )}
            {showIdeal && (
              <Line
                type="monotone"
                dataKey="ideal"
                stroke={axisColor}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Ideal target"
                connectNulls
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default WeanChart;
