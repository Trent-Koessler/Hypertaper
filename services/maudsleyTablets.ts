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
import { MaudsleyRegimen, MaudsleyStep } from './maudsleyDiazepam';
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
 */
export function makeUpMaudsleyDose(
  target: number,
  denominations: Denomination[],
  liquid?: LiquidConfig
): MaudsleyDose {
  if (!(target > 0)) return { target: 0, exact: true, dose: 0, tablets: {}, pieces: [] };

  const tablets = findBestTabletCombination(target, denominations, false, { rounding: 'below' });
  if (isExact(tablets, target)) return toDose(target, tablets, true);

  if (liquid?.enabled) {
    const fromLiquid = findLiquidDose(target, liquid, false, 'nearest');
    if (fromLiquid.actualDose > 0) return toDose(target, fromLiquid, isExact(fromLiquid, target));
  }

  const nearest = findBestTabletCombination(target, denominations, false, { rounding: 'nearest' });
  return toDose(target, nearest, false);
}

/**
 * Every step of a regimen made up from the calculator's tablets, with the
 * total supply needed if each step is held for `daysPerStep` days. The final
 * stop step takes nothing.
 */
export function maudsleyTabletPlan(
  regimen: MaudsleyRegimen,
  denominations: Denomination[],
  liquid: LiquidConfig | undefined,
  daysPerStep: number
): MaudsleyTabletPlan {
  const days = Math.max(1, daysPerStep);
  const totalTablets: { [denomId: string]: number } = {};
  let totalLiquidMl = 0;
  let inexactStepCount = 0;

  const steps = regimen.steps.map(step => {
    const am = makeUpMaudsleyDose(step.am, denominations, liquid);
    const pm = makeUpMaudsleyDose(step.pm, denominations, liquid);
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
