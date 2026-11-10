import React, { useMemo, useState } from 'react';
import { AlertCircle, BookOpen, ChevronDown, ChevronRight, Download, Droplet, LineChart as LineChartIcon } from 'lucide-react';
import { Denomination, LiquidConfig } from '../types';
import TabletVisualizer from './TabletVisualizer';
import HoverInfo from './HoverInfo';
import { MaudsleyDose, MaudsleyTabletPlan, MaudsleyTabletStep, maudsleyTabletPlan } from '../services/maudsleyTablets';
import {
  MAUDSLEY_CITATION,
  MAUDSLEY_DIAZEPAM_REGIMENS,
  MAUDSLEY_NOTES,
  MaudsleyForm,
  MaudsleyRegimen,
  occupancyMismatchExplanation
} from '../services/maudsleyDiazepam';

interface MaudsleyReferenceProps {
  /** Fills the calculator with the starting dose and tablets this regimen assumes. */
  onLoadRegimen: (regimen: MaudsleyRegimen) => void;
  /** Id of the regimen currently drawn on the chart, or null for none. */
  overlaidRegimenId: string | null;
  onToggleOverlay: (regimen: MaudsleyRegimen) => void;
  /** The calculator's drug, tablets and liquid, used to make up each dose of the regimen. */
  drugName: string;
  unit: string;
  denominations: Denomination[];
  /** Only passed when the liquid is switched on in the calculator. */
  liquid?: LiquidConfig;
  /** The plan's reduction interval, used as the days each step is held when counting supply. */
  intervalDays: number;
  /** The plan's occupancy step in points, when the plan is an occupancy taper. */
  planOccupancyPoints?: number;
}

const FORM_LABELS: Record<MaudsleyForm, string> = {
  tablets: 'Tabs',
  'half-tablets': '½ tabs',
  'quarter-tablets': '¼ tabs',
  liquid: 'Liquid',
  stop: 'Stop'
};

/** Quarter and liquid steps are the ones a tablet-only plan cannot reach, so they are worth flagging. */
const FORM_STYLES: Record<MaudsleyForm, string> = {
  tablets: 'text-slate-500 dark:text-slate-400',
  'half-tablets': 'text-amber-600 dark:text-amber-400',
  'quarter-tablets': 'text-orange-600 dark:text-orange-400',
  liquid: 'text-purple-600 dark:text-purple-400',
  stop: 'text-emerald-600 dark:text-emerald-400 font-medium'
};

/** Up to three decimals, so a made-up dose like 4.75mg is never shown rounded to the book's 4.8mg. */
const formatMg = (value: number): string => String(Number(value.toFixed(3)));

const SPLIT_LABELS: Record<NonNullable<Denomination['canSplit']>, string> = {
  no: '',
  half: ' (½)',
  quarter: ' (¼)'
};

/** Formats a tablet count, hiding the decimals on whole numbers. */
const formatCount = (count: number): string => count.toFixed(count % 1 === 0 ? 0 : 2);

/** The tablets (or liquid) for one administration, with a flag when the book's dose cannot be made. */
const DoseCell: React.FC<{
  dose: MaudsleyDose;
  denominations: Denomination[];
  unit: string;
}> = ({ dose, denominations, unit }) => (
  <td className={`px-3 py-1.5 border-l border-slate-100 dark:border-slate-700/60 ${dose.exact ? '' : 'bg-amber-50/70 dark:bg-amber-900/20'}`}>
    <TabletVisualizer
      counts={dose.tablets}
      denominations={denominations}
      unit={unit}
      liquidMl={dose.liquidMl}
      emptyLabel={dose.exact ? 'None' : '—'}
    />
    {!dose.exact && (
      <span className="mt-1 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 whitespace-nowrap">
        <AlertCircle size={10} />
        {dose.dose > 0
          ? `Can't make ${formatMg(dose.target)}${unit}: nearest ${formatMg(dose.dose)}${unit}`
          : `Can't make ${formatMg(dose.target)}${unit}`}
      </span>
    )}
  </td>
);

/** Every tablet kind (and any liquid) needed to hold one step, so it can be dispensed step by step. */
const StepSupplyCell: React.FC<{
  step: MaudsleyTabletStep;
  denominations: Denomination[];
  unit: string;
}> = ({ step, denominations, unit }) => {
  const lines = (Object.entries(step.stepTablets) as [string, number][])
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ denom: denominations.find(d => d.id === id), count }))
    .filter((line): line is { denom: Denomination; count: number } => !!line.denom)
    .sort((a, b) => b.denom.strength - a.denom.strength);
  return (
    <td className="px-3 py-1.5 border-l border-slate-100 dark:border-slate-700/60 whitespace-nowrap text-slate-700 dark:text-slate-200">
      {lines.map(({ denom, count }) => {
        const supply = Math.ceil(count - 1e-9);
        return (
          <span key={denom.id} className="block tabular-nums">
            <span className="font-semibold">{formatCount(count)}</span> × {denom.strength}{unit}
            {supply !== count && (
              <span className="text-slate-400 dark:text-slate-500"> (supply {supply})</span>
            )}
          </span>
        );
      })}
      {step.stepLiquidMl > 0 && (
        <span className="block tabular-nums text-sky-700 dark:text-sky-300">
          <span className="font-semibold">{formatMg(step.stepLiquidMl)}</span>mL liquid
        </span>
      )}
      {lines.length === 0 && !(step.stepLiquidMl > 0) && <span className="text-slate-400">—</span>}
    </td>
  );
};

const RegimenTable: React.FC<{
  regimen: MaudsleyRegimen;
  plan: MaudsleyTabletPlan | null;
  denominations: Denomination[];
  unit: string;
  liquid?: LiquidConfig;
}> = ({ regimen, plan, denominations, unit, liquid }) => (
  <div className="overflow-x-auto max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-30 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
        <tr>
          <th className="text-left font-medium px-3 py-2">Step</th>
          <th className="text-right font-medium px-3 py-2">RO (%)</th>
          <th className="text-right font-medium px-3 py-2">AM (mg)</th>
          <th className="text-right font-medium px-3 py-2">PM (mg)</th>
          <th className="text-right font-medium px-3 py-2">Total daily (mg)</th>
          <th className="text-left font-medium px-2 py-2 w-16">
            Book form{' '}
            <HoverInfo
              label="About the book form column"
              text="How the book makes up each dose: whole tablets, half or quarter tablets, or liquid. * marks steps where the book says a liquid could be used instead. Your own tablets and liquid are shown in the columns to the right."
            />
          </th>
          {plan && (
            <>
              <th className="text-left font-medium px-3 py-2 border-l border-slate-200 dark:border-slate-700">Morning tablets</th>
              <th className="text-left font-medium px-3 py-2 border-l border-slate-200 dark:border-slate-700">Night tablets</th>
              <th className="text-left font-medium px-3 py-2 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap">
                This step ({plan.daysPerStep} day{plan.daysPerStep === 1 ? '' : 's'})
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {regimen.steps.map((step, index) => {
          const made = plan?.steps[index];
          return (
            <tr
              key={step.step}
              className="border-t border-slate-100 dark:border-slate-700/60 odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-800 dark:even:bg-slate-800/50"
            >
              <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{step.step}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{step.ro}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatMg(step.am)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatMg(step.pm)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">
                {formatMg(step.total)}
              </td>
              <td className={`px-2 py-1.5 w-16 leading-tight ${FORM_STYLES[step.form]}`}>
                {FORM_LABELS[step.form]}
                {step.liquidAlternative && <span className="text-slate-400 dark:text-slate-500"> *</span>}
              </td>
              {made && (step.form === 'stop' ? (
                <td colSpan={3} className="px-3 py-1.5 border-l border-slate-100 dark:border-slate-700/60 text-emerald-600 dark:text-emerald-400 font-medium">
                  Stop
                </td>
              ) : (
                <>
                  <DoseCell dose={made.am} denominations={denominations} unit={unit} />
                  <DoseCell dose={made.pm} denominations={denominations} unit={unit} />
                  <StepSupplyCell step={made} denominations={denominations} unit={unit} />
                </>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

/** What the whole regimen needs, counted at the plan's own interval. */
const SupplySummary: React.FC<{
  plan: MaudsleyTabletPlan;
  regimen: MaudsleyRegimen;
  denominations: Denomination[];
  unit: string;
  liquid?: LiquidConfig;
}> = ({ plan, regimen, denominations, unit, liquid }) => {
  const heldSteps = regimen.steps.filter(step => step.form !== 'stop').length;
  const weeks = Math.round((heldSteps * plan.daysPerStep) / 7);
  const bottles = liquid?.bottleSizeMl && liquid.bottleSizeMl > 0
    ? Math.ceil(plan.totalLiquidMl / liquid.bottleSizeMl - 1e-9)
    : null;

  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-4 border border-slate-200 dark:border-slate-600">
      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
        Total medication for the full regimen
      </h4>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 mb-3">
        Counted at {plan.daysPerStep} day{plan.daysPerStep === 1 ? '' : 's'} per step (the plan&apos;s
        &lsquo;Every (days)&rsquo; setting): {heldSteps} steps, about {weeks} weeks. The guideline itself
        allows 1-4 weeks per step, so the real amount depends on the pace the patient takes.
      </p>
      <div className="flex flex-wrap gap-3">
        {(Object.entries(plan.totalTablets) as [string, number][]).map(([id, count]) => {
          const denom = denominations.find(d => d.id === id);
          if (!denom || !(count > 0)) return null;
          const supply = Math.ceil(count - 1e-9);
          return (
            <div key={id} className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm flex items-center gap-3">
              <div className="bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-bold px-2 py-1 rounded text-xs">
                {denom.strength}{unit}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                {formatCount(count)} <span className="text-xs text-slate-400 font-normal">tablets taken</span>
                {supply !== count && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400 font-normal">
                    supply {supply} whole tablets
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {plan.totalLiquidMl > 0 && liquid && (
          <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm flex items-center gap-3">
            <div className="bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-bold px-2 py-1 rounded text-xs flex items-center gap-1">
              <Droplet size={12} /> {formatMg(liquid.concentration)}{unit}/mL
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300 font-medium">
              {formatCount(plan.totalLiquidMl)} <span className="text-xs text-slate-400 font-normal">mL</span>
              {bottles !== null && (
                <span className="block text-xs text-slate-500 dark:text-slate-400 font-normal">
                  supply {bottles} × {liquid.bottleSizeMl}mL bottle{bottles === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MaudsleyReference: React.FC<MaudsleyReferenceProps> = ({
  onLoadRegimen,
  overlaidRegimenId,
  onToggleOverlay,
  drugName,
  unit,
  denominations,
  liquid,
  intervalDays,
  planOccupancyPoints
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeId, setActiveId] = useState<string>(MAUDSLEY_DIAZEPAM_REGIMENS[0].id);
  const [showNotes, setShowNotes] = useState(false);

  const active = MAUDSLEY_DIAZEPAM_REGIMENS.find(r => r.id === activeId) ?? MAUDSLEY_DIAZEPAM_REGIMENS[0];
  const isOverlaid = overlaidRegimenId === active.id;

  const usableTablets = denominations.filter(d => d.strength > 0);
  // The book's doses are in mg, so tablets in another unit cannot make them up.
  const canMakeUp = unit === 'mg' && (usableTablets.length > 0 || !!liquid);
  const plan = useMemo(
    () => (canMakeUp ? maudsleyTabletPlan(active, usableTablets, liquid, intervalDays) : null),
    // usableTablets is rebuilt each render; its source is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canMakeUp, active, denominations, liquid, intervalDays]
  );
  const tabletList = usableTablets.map(d => `${d.strength}${unit}${SPLIT_LABELS[d.canSplit ?? 'no']}`).join(', ');
  const notDiazepam = drugName.trim().toLowerCase() !== 'diazepam';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:hidden">
      <button
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 p-6 text-left"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            Maudsley reference: diazepam taper schedules
          </span>
        </span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The three example regimens published in {MAUDSLEY_CITATION} Reproduced for reference — HyperTaper
            does not calculate these numbers, and they are not a substitute for reading the guideline itself.
          </p>

          <div className="flex flex-wrap gap-2">
            {MAUDSLEY_DIAZEPAM_REGIMENS.map(regimen => (
              <button
                key={regimen.id}
                onClick={() => setActiveId(regimen.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  regimen.id === activeId
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {regimen.title} · {regimen.steps.length} steps
              </button>
            ))}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{active.label}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {active.description}{' '}
              <HoverInfo
                label="Why this doesn't match an occupancy taper"
                text={occupancyMismatchExplanation(active, planOccupancyPoints)}
                align="right"
              />
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onLoadRegimen(active)}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              <Download size={13} />
              Load this regimen&apos;s starting point
            </button>
            <button
              onClick={() => onToggleOverlay(active)}
              aria-pressed={isOverlaid}
              className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors font-medium ${
                isOverlaid
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              <LineChartIcon size={13} />
              {isOverlaid ? 'Remove from chart' : 'Compare on chart'}
            </button>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Loading a regimen sets the starting dose to {active.steps[0].total}mg and the available tablets to
            10mg, 5mg and 2mg (quarterable). It does not copy the table into the plan — HyperTaper still
            generates the schedule from your own taper settings.
          </p>

          {plan ? (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <p>
                Tablet columns use the tablets in the sidebar: {tabletList || 'none'}
                {liquid ? `, plus the ${formatMg(liquid.concentration)}${unit}/mL liquid for doses tablets cannot make` : ''}.
              </p>
              {notDiazepam && (
                <p className="text-amber-700 dark:text-amber-300 flex items-start gap-1">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  The sidebar is set up for {drugName || 'another drug'}, not diazepam. Load this regimen&apos;s
                  starting point to use diazepam tablets.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Enter tablet strengths in mg in the sidebar to see the tablets for each step.
            </p>
          )}

          {plan && plan.inexactStepCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                {plan.inexactStepCount} step{plan.inexactStepCount === 1 ? '' : 's'} can&apos;t be made exactly
                with {liquid ? 'these tablets or this liquid' : 'these tablets'} (shaded below, with the nearest dose
                that can be made).{' '}
                {liquid
                  ? 'A finer measuring increment or another tablet strength would fill them.'
                  : 'Tick “Use a liquid formulation” in the sidebar, or add another tablet strength, to fill them.'}
              </span>
            </div>
          )}

          <RegimenTable regimen={active} plan={plan} denominations={usableTablets} unit={unit} liquid={liquid} />

          {plan && (
            <SupplySummary plan={plan} regimen={active} denominations={usableTablets} unit={unit} liquid={liquid} />
          )}

          <ol className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
            {active.footnotes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ol>

          <div>
            <button
              onClick={() => setShowNotes(open => !open)}
              aria-expanded={showNotes}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 flex items-center gap-1"
            >
              {showNotes ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Deprescribing notes from the guideline
            </button>
            {showNotes && (
              <dl className="mt-3 space-y-3">
                {MAUDSLEY_NOTES.map(note => (
                  <div key={note.heading}>
                    <dt className="text-xs font-semibold text-slate-700 dark:text-slate-200">{note.heading}</dt>
                    <dd className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{note.body}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaudsleyReference;
