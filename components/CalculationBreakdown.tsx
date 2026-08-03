import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Sigma } from 'lucide-react';
import { DrugConfig, WeanConfig, ScheduleResult } from '../types';

interface CalculationBreakdownProps {
  drug: DrugConfig;
  wean: WeanConfig;
  schedule: ScheduleResult;
}

const num = (value: number, decimals = 4): string => String(parseFloat(value.toFixed(decimals)));

const END_REASON_TEXT: Record<ScheduleResult['endReason'], string> = {
  'reached-stop-dose':
    'The ideal curve reached the stop dose, so cessation is the intended end of the plan.',
  'granularity-limited':
    'The curve fell below the smallest dose the available strengths can make, so the plan ceases from the last dose it could express.',
  truncated:
    'The plan was cut off at the engine\'s interval limit before the stop dose was reached. It is incomplete and shows no cessation date.'
};

const CalculationBreakdown: React.FC<CalculationBreakdownProps> = ({ drug, wean, schedule }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const { unit } = drug;
  const intervalDays = Math.max(1, Math.round(wean.intervalDays || 1));

  const methodLines = useMemo(() => {
    const curve = wean.reductionType === 'percentage'
      ? `target(n) = ${num(schedule.startingDose)} x (1 - ${num(wean.reductionValue)}/100)^n`
      : `target(n) = ${num(schedule.startingDose)} - (n x ${num(wean.reductionValue)})`;

    return [
      `1. Ideal curve. Interval n falls on day n x ${intervalDays}, and asks for ${curve}. Each target is computed from the original dose, not from the previously prescribed one, so tablet rounding at one step never compounds into the rest of the curve.`,
      `2. Achievable dose. For each target, the engine searches every combination of the available pieces and takes the largest total that does not exceed the target. It never rounds up, so no step can prescribe more than the curve asks for.`,
      `3. Holding. When two consecutive intervals resolve to the same achievable dose, they are merged into one held step. The dose is held until the curve falls far enough to justify the next achievable dose down.`,
      `4. Stopping. Intervals are generated while target(n) is at or above the stop dose of ${num(wean.minimumDoseThreshold)}${unit}, so the stop dose itself is prescribed before cessation.`,
      `5. Preference. Among combinations that reach the same dose, the engine prefers the fewest pieces, and then the fewest cut tablets.`
    ];
  }, [wean, schedule.startingDose, intervalDays, unit]);

  const totalsRows = useMemo(
    () =>
      Object.entries(schedule.totalTablets)
        .map(([id, total]) => {
          const denom = drug.denominations.find(d => d.id === id);
          if (!denom) return null;
          const terms = schedule.steps
            .filter(step => !step.isStop && (step.tablets[id] ?? 0) > 0)
            .map(step => `(${num(step.tablets[id])} x ${step.durationDays}d)`);
          return { strength: denom.strength, terms, total };
        })
        .filter((row): row is { strength: number; terms: string[]; total: number } => row !== null)
        .sort((a, b) => b.strength - a.strength),
    [schedule.totalTablets, schedule.steps, drug.denominations]
  );

  const plainText = useMemo(() => {
    const lines: string[] = [];
    lines.push('HYPERTAPER — CALCULATION BREAKDOWN');
    lines.push('');
    lines.push('INPUTS');
    lines.push(`  Drug: ${drug.name || '(unnamed)'}`);
    lines.push(`  Starting dose: ${num(schedule.startingDose)}${unit}`);
    lines.push(
      `  Reduction: ${wean.reductionType === 'percentage' ? `${num(wean.reductionValue)}% of the starting dose, compounded` : `${num(wean.reductionValue)}${unit}, fixed`} every ${intervalDays} day(s)`
    );
    lines.push(`  Stop dose: ${num(wean.minimumDoseThreshold)}${unit} (inclusive)`);
    lines.push(`  Start date: ${drug.startDate}`);
    lines.push('  Available pieces:');
    drug.denominations
      .filter(d => Number.isFinite(d.strength) && d.strength > 0)
      .forEach(d => {
        const splits = d.canSplit === 'quarter'
          ? `whole ${num(d.strength)}, half ${num(d.strength / 2)}, quarter ${num(d.strength / 4)}`
          : d.canSplit === 'half'
            ? `whole ${num(d.strength)}, half ${num(d.strength / 2)}`
            : `whole ${num(d.strength)}`;
        lines.push(`    ${num(d.strength)}${unit} tablet -> ${splits} (${unit})`);
      });
    lines.push('');
    lines.push('METHOD');
    methodLines.forEach(line => lines.push(`  ${line}`));
    lines.push('');
    lines.push('INTERVAL-BY-INTERVAL DERIVATION');
    lines.push(
      '  n   Date        Target                          Prescribed                        Short   Change     % start'
    );
    schedule.derivation.forEach(entry => {
      const change = entry.reductionPercent === null
        ? '-'
        : `-${num(entry.reductionPercent, 1)}%`;
      lines.push(
        '  ' +
          String(entry.intervalIndex).padEnd(4) +
          entry.date.padEnd(12) +
          entry.targetFormula.padEnd(32) +
          (entry.startsNewStep ? entry.actualFormula : `(held) ${num(entry.actualDose)}${unit}`).padEnd(34) +
          `${num(entry.shortfall, 3)}`.padEnd(8) +
          change.padEnd(11) +
          `${num(entry.percentOfStartingDose, 1)}%`
      );
    });
    lines.push('');
    lines.push('TOTAL TABLETS (daily count x days held, summed over steps)');
    totalsRows.forEach(row => {
      lines.push(`  ${num(row.strength)}${unit}: ${row.terms.join(' + ')} = ${num(row.total)} tablets`);
    });
    lines.push('');
    lines.push('DURATION');
    lines.push(
      `  ${schedule.derivation.length} interval(s) x ${intervalDays} day(s) = ${schedule.totalDays} days = ${schedule.durationWeeks} week(s), rounded up`
    );
    lines.push(`  Start ${drug.startDate} -> end ${schedule.endDate}`);
    lines.push(`  ${END_REASON_TEXT[schedule.endReason]}`);
    lines.push('');
    lines.push('NUMERICAL NOTES');
    lines.push('  Doses are quantised to 0.001 of a unit before the combination search, and results are rounded to 4 decimal places.');
    lines.push('  Tablet splitting is assumed to be exact. In practice halves and quarters vary by roughly 10-20%, which matters most at the smallest doses.');
    if (schedule.warnings.length > 0) {
      lines.push('');
      lines.push('WARNINGS');
      schedule.warnings.forEach(w => lines.push(`  - ${w}`));
    }
    return lines.join('\n');
  }, [drug, wean, schedule, unit, intervalDays, methodLines, totalsRows]);

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(plainText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors duration-200">
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200"
        >
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Sigma className="w-4 h-4" />
          Show the calculations
        </button>
        {isOpen && (
          <button
            onClick={copy}
            className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full transition-colors flex items-center gap-2 font-medium print:hidden"
          >
            {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed — select manually' : 'Copy working'}
          </button>
        )}
      </div>

      {!isOpen ? (
        <p className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
          Every number in this plan, with the arithmetic that produced it, so it can be checked independently.
        </p>
      ) : (
        <div className="px-6 py-5 space-y-6 text-sm">
          <section>
            <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Inputs</h4>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-slate-600 dark:text-slate-300">
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                <dt>Starting dose</dt>
                <dd className="font-mono">{num(schedule.startingDose)}{unit}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                <dt>Reduction</dt>
                <dd className="font-mono">
                  {wean.reductionType === 'percentage' ? `${num(wean.reductionValue)}%` : `${num(wean.reductionValue)}${unit}`} / {intervalDays}d
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                <dt>Stop dose (inclusive)</dt>
                <dd className="font-mono">{num(wean.minimumDoseThreshold)}{unit}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                <dt>Start date</dt>
                <dd className="font-mono">{drug.startDate}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">Pieces available each day:</span>
              <ul className="mt-1 space-y-0.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                {drug.denominations
                  .filter(d => Number.isFinite(d.strength) && d.strength > 0)
                  .map(d => (
                    <li key={d.id}>
                      {num(d.strength)}{unit} tablet &rarr; {num(d.strength)}
                      {(d.canSplit === 'half' || d.canSplit === 'quarter') && ` | ½ = ${num(d.strength / 2)}`}
                      {d.canSplit === 'quarter' && ` | ¼ = ${num(d.strength / 4)}`}
                      {' '}{unit}
                    </li>
                  ))}
              </ul>
            </div>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Method</h4>
            <ol className="space-y-1.5 text-slate-600 dark:text-slate-300 list-none">
              {methodLines.map(line => (
                <li key={line} className="leading-relaxed">{line}</li>
              ))}
            </ol>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
              Interval-by-interval derivation
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left font-mono">
                <thead className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th scope="col" className="py-2 pr-3">n</th>
                    <th scope="col" className="py-2 pr-3">Date</th>
                    <th scope="col" className="py-2 pr-3">Ideal target</th>
                    <th scope="col" className="py-2 pr-3">Prescribed</th>
                    <th scope="col" className="py-2 pr-3 text-right">Short by</th>
                    <th scope="col" className="py-2 pr-3 text-right">Change</th>
                    <th scope="col" className="py-2 text-right">% of start</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {schedule.derivation.map(entry => (
                    <tr
                      key={entry.intervalIndex}
                      className={entry.startsNewStep ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}
                    >
                      <td className="py-1.5 pr-3">{entry.intervalIndex}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{entry.date}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{entry.targetFormula}</td>
                      <td className="py-1.5 pr-3">
                        {entry.startsNewStep ? entry.actualFormula : `held at ${num(entry.actualDose)}${unit}`}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{num(entry.shortfall, 3)}</td>
                      <td className="py-1.5 pr-3 text-right">
                        {entry.reductionPercent === null ? '—' : `−${num(entry.reductionPercent, 1)}%`}
                      </td>
                      <td className="py-1.5 text-right">{num(entry.percentOfStartingDose, 1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Greyed rows are intervals where the previous dose is still held because no smaller achievable
              dose had yet come within reach of the curve.
            </p>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
              Total tablets (daily count × days held)
            </h4>
            <ul className="space-y-1 font-mono text-xs text-slate-600 dark:text-slate-300">
              {totalsRows.map(row => (
                <li key={row.strength}>
                  {num(row.strength)}{unit}: {row.terms.join(' + ')} = <strong>{num(row.total)}</strong> tablets
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Duration</h4>
            <p className="font-mono text-xs text-slate-600 dark:text-slate-300">
              {schedule.derivation.length} interval(s) × {intervalDays} day(s) = {schedule.totalDays} days ={' '}
              {schedule.durationWeeks} week(s), rounded up
            </p>
            <p className="font-mono text-xs text-slate-600 dark:text-slate-300 mt-1">
              {drug.startDate} → {schedule.endDate}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{END_REASON_TEXT[schedule.endReason]}</p>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Numerical notes</h4>
            <ul className="list-disc list-inside space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <li>
                Doses are quantised to 0.001 of a unit before the combination search, and results are rounded
                to 4 decimal places.
              </li>
              <li>
                Tablet splitting is assumed to be exact. In practice halves and quarters vary by roughly
                10–20% of the intended piece, which matters most at the smallest doses.
              </li>
              <li>
                The plan gives a total daily dose. How it is divided across the day is a separate clinical
                decision and is not modelled here.
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};

export default CalculationBreakdown;
