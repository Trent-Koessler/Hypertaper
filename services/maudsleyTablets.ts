/**
 * Makes up each dose of a published Maudsley regimen from the tablets (and,
 * where tablets fall short, the liquid) entered in the calculator.
 *
 * The regimen's doses are the book's and are never changed here. This only
 * answers "what does the patient take to get this dose?", using the same
 * tablet search as the generated plan, so the pieces shown match the rest of
 * the app.
 */
import { Denomination, DoseBreakdown, LiquidConfig } from '../types';
import { MaudsleyForm, MaudsleyRegimen, MaudsleyStep } from './maudsleyDiazepam';
import { findBestTabletCombination, findLiquidDose, TabletCombination } from './weaningLogic';

/** Slack for comparing doses, far below any real tablet or measure. */
const EPSILON = 1e-6;

/** One administration (morning or night) of a Maudsley step, made up for the patient. */
export interface MaudsleyDose extends DoseBreakdown {
  /** The dose the book prescribes for this administration. */
  target: number;
  /** False when neither the tablets nor the liquid can make `target`; `dose` is then the nearest they can make. */
  exact: boolean;
}

export interface MaudsleyTabletStep {
  step: MaudsleyStep;
  am: MaudsleyDose;
  pm: MaudsleyDose;
  /** Tablet-equivalents of each denomination needed to hold this step for `daysPerStep` days. */
  stepTablets: { [denomId: string]: number };
  /** Liquid in mL needed to hold this step for `daysPerStep` days; 0 when none. */
  stepLiquidMl: number;
}

export interface MaudsleyTabletPlan {
  steps: MaudsleyTabletStep[];
  /** Number of steps with a morning or night dose that cannot be made exactly. */
  inexactStepCount: number;
  /** Tablet-equivalents of each denomination over the whole regimen, at `daysPerStep` per step. */
  totalTablets: { [denomId: string]: number };
  /** Total liquid in mL over the whole regimen; 0 when none is used. */
  totalLiquidMl: number;
  daysPerStep: number;
}

/**
 * How the tablets for each step are picked.
 * - 'app': the fewest pieces, cutting a tablet whenever that saves a piece.
 * - 'book': only cut tablets as far as the book does for that step (whole
 *   tablets on a 'tablets' step, halves on a 'half-tablets' step), falling back
 *   to the app's choice when the dose can't be made that way.
 */
export type MaudsleyTabletStyle = 'app' | 'book';

type SplitLevel = NonNullable<Denomination['canSplit']>;

const SPLIT_RANK: Record<SplitLevel, number> = { no: 0, half: 1, quarter: 2 };

/** The furthest the book cuts a tablet for each form; undefined means no limit. */
const BOOK_SPLIT: Record<MaudsleyForm, SplitLevel | undefined> = {
  tablets: 'no',
  'half-tablets': 'half',
  'quarter-tablets': 'quarter',
  liquid: undefined,
  stop: undefined
};

/** The same tablets, but none cut further than `max`. */
function limitSplitting(denominations: Denomination[], max: SplitLevel): Denomination[] {
  return denominations.map(d =>
    SPLIT_RANK[d.canSplit ?? 'no'] > SPLIT_RANK[max] ? { ...d, canSplit: max } : d
  );
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

const toDose = (target: number, combination: TabletCombination, exact: boolean): MaudsleyDose => ({
  target,
  exact,
  dose: combination.actualDose,
  tablets: combination.tablets,
  pieces: combination.pieces,
  liquidMl: combination.liquidMl
});

const isExact = (combination: TabletCombination, target: number): boolean =>
  Math.abs(combination.actualDose - target) < EPSILON;

/**
 * Tablets when they make the dose exactly. Otherwise the liquid, if one is set
 * up; otherwise the nearest dose the tablets can make, flagged as inexact.
 *
 * With `preferLiquid` (and a liquid switched on) the liquid is tried first, so
 * a patient already on liquid is not moved back to tablets.
 *
 * With `maxSplit`, tablets cut no further than that are tried first, so the
 * dose is made up the way the book makes it when the tablets allow.
 */
export function makeUpMaudsleyDose(
  target: number,
  denominations: Denomination[],
  liquid?: LiquidConfig,
  preferLiquid = false,
  maxSplit?: SplitLevel
): MaudsleyDose {
  if (!(target > 0)) return { target: 0, exact: true, dose: 0, tablets: {}, pieces: [] };

  const fromLiquid = liquid?.enabled ? findLiquidDose(target, liquid, false, 'nearest') : null;
  if (preferLiquid && fromLiquid && isExact(fromLiquid, target)) return toDose(target, fromLiquid, true);

  if (maxSplit) {
    const limited = findBestTabletCombination(target, limitSplitting(denominations, maxSplit), false, { rounding: 'below' });
    if (isExact(limited, target)) return toDose(target, limited, true);
  }

  const tablets = findBestTabletCombination(target, denominations, false, { rounding: 'below' });
  if (isExact(tablets, target)) return toDose(target, tablets, true);

  if (fromLiquid && fromLiquid.actualDose > 0) return toDose(target, fromLiquid, isExact(fromLiquid, target));

  const nearest = findBestTabletCombination(target, denominations, false, { rounding: 'nearest' });
  return toDose(target, nearest, false);
}

/**
 * Every step of a regimen made up from the calculator's tablets, with the
 * total supply needed if each step is held for `daysPerStep` days. The final
 * stop step takes nothing.
 *
 * Tablets are used until the first step that needs the liquid. From then on
 * every step is given as liquid, morning and night alike, as the book does,
 * so the patient never switches back and forth between the two.
 */
export function maudsleyTabletPlan(
  regimen: MaudsleyRegimen,
  denominations: Denomination[],
  liquid: LiquidConfig | undefined,
  daysPerStep: number,
  style: MaudsleyTabletStyle = 'app'
): MaudsleyTabletPlan {
  const days = Math.max(1, daysPerStep);
  const totalTablets: { [denomId: string]: number } = {};
  let totalLiquidMl = 0;
  let inexactStepCount = 0;
  let onLiquid = false;

  const usesLiquid = (dose: MaudsleyDose) => (dose.liquidMl ?? 0) > 0;

  const steps = regimen.steps.map(step => {
    const maxSplit = style === 'book' ? BOOK_SPLIT[step.form] : undefined;
    let am = makeUpMaudsleyDose(step.am, denominations, liquid, onLiquid, maxSplit);
    let pm = makeUpMaudsleyDose(step.pm, denominations, liquid, onLiquid, maxSplit);
    if (!onLiquid && (usesLiquid(am) || usesLiquid(pm))) {
      onLiquid = true;
      am = makeUpMaudsleyDose(step.am, denominations, liquid, true, maxSplit);
      pm = makeUpMaudsleyDose(step.pm, denominations, liquid, true, maxSplit);
    }
    if (!am.exact || !pm.exact) inexactStepCount++;

    const stepTablets: { [denomId: string]: number } = {};
    let stepLiquidMl = 0;
    for (const part of [am, pm]) {
      Object.entries(part.tablets).forEach(([id, count]) => {
        stepTablets[id] = round((stepTablets[id] || 0) + count * days);
      });
      stepLiquidMl = round(stepLiquidMl + (part.liquidMl ?? 0) * days);
    }
    Object.entries(stepTablets).forEach(([id, count]) => {
      totalTablets[id] = round((totalTablets[id] || 0) + count);
    });
    totalLiquidMl = round(totalLiquidMl + stepLiquidMl);
    return { step, am, pm, stepTablets, stepLiquidMl };
  });

  return { steps, inexactStepCount, totalTablets, totalLiquidMl, daysPerStep: days };
}
