import {
  DrugConfig,
  WeanConfig,
  ScheduleResult,
  ScheduleStep,
  ScheduleEndReason,
  Denomination,
  DerivationEntry,
  DosePiece
} from '../types';
import { addDaysISO, isValidISODate, todayISO } from './dateUtils';

/** A physically takeable piece: a whole tablet, or a half/quarter of one. */
interface Piece {
  denomId: string;
  strength: number;
  tabletFraction: number; // 1 for a whole tablet, 0.5 for a half, 0.25 for a quarter
  cost: number; // Preference weight: fewer pieces first, then fewer cuts
}

// Costs are compared as a sum, so the piece-count term must dominate the
// splitting term: one extra piece (+100) must always cost more than swapping
// every piece in the regimen from a whole to a quarter (+2 each). At these
// values that holds for regimens of up to 50 pieces a day, which is far beyond
// anything prescribable. Whole tablets are preferred over halves at equal
// piece count.
const COST_WHOLE = 100;
const COST_HALF = 101;
const COST_QUARTER = 102;

/** Doses are quantised to this resolution (0.001 of a unit) before searching. */
const SCALE = 1000;
/** Upper bound on DP table size, so pathological strengths cannot hang the UI. */
const MAX_STATES = 200_000;
const MAX_ITERATIONS = 500;
const UNREACHABLE = 0x7fffffff;
/** Slack for comparing floating-point doses, well below any real strength. */
const EPSILON = 1e-9;
/**
 * A realised drop this many times larger than the requested one is reported.
 * Tablet granularity always forces some overshoot; 1.5x is the point at which
 * a "10% taper" is really delivering 15% or more and the clinician should know.
 */
const DROP_WARNING_RATIO = 1.5;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function roundDose(value: number): number {
  return parseFloat(value.toFixed(4));
}

/** Renders a dose for a formula string without trailing zeros. */
function num(value: number, decimals = 4): string {
  return String(parseFloat(value.toFixed(decimals)));
}

const FRACTION_NAMES: { [fraction: number]: string } = {
  1: 'whole',
  0.5: 'half',
  0.25: 'quarter'
};

/** Expands the configured denominations into every piece the patient could take. */
export function buildPieces(denominations: Denomination[]): Piece[] {
  const pieces: Piece[] = [];
  denominations.forEach(d => {
    // A blank row (the state a freshly added denomination starts in) or a
    // nonsensical strength contributes nothing but search space.
    if (!Number.isFinite(d.strength) || d.strength <= 0) return;

    pieces.push({ denomId: d.id, strength: d.strength, tabletFraction: 1, cost: COST_WHOLE });

    if (d.canSplit === 'half' || d.canSplit === 'quarter') {
      pieces.push({ denomId: d.id, strength: d.strength / 2, tabletFraction: 0.5, cost: COST_HALF });
    }
    if (d.canSplit === 'quarter') {
      pieces.push({ denomId: d.id, strength: d.strength / 4, tabletFraction: 0.25, cost: COST_QUARTER });
    }
  });
  return pieces;
}

export interface TabletCombination {
  actualDose: number;
  tablets: { [id: string]: number };
  /** The dose broken into the pieces the patient physically takes. */
  pieces: DosePiece[];
}

const EMPTY_COMBINATION: TabletCombination = { actualDose: 0, tablets: {}, pieces: [] };

/**
 * Finds the largest dose that is achievable with the available pieces and does
 * *not* exceed the target, preferring the fewest pieces and the fewest cuts.
 *
 * Deliberately never rounds up: a deprescribing plan must not instruct a dose
 * above the taper target. When nothing at or below the target can be made, the
 * result is 0, which is the signal that the taper has run out of room.
 *
 * Runs an unbounded-knapsack DP over doses quantised to a common unit, so cost
 * is O(states x pieces) rather than exponential in the number of denominations.
 */
export function findBestTabletCombination(
  targetDose: number,
  denominations: Denomination[]
): TabletCombination {
  if (!Number.isFinite(targetDose) || targetDose <= 0) return { ...EMPTY_COMBINATION };

  const pieces = buildPieces(denominations);
  if (pieces.length === 0) return { ...EMPTY_COMBINATION };

  const scaledTarget = Math.floor(targetDose * SCALE + 1e-6);
  if (scaledTarget <= 0) return { ...EMPTY_COMBINATION };

  const scaledStrengths = pieces.map(p => Math.max(1, Math.round(p.strength * SCALE)));

  // Working in units of the greatest common divisor keeps the table tiny for
  // real-world strengths (a 0.5mg tablet split into quarters gives a 0.125 unit).
  let unit = scaledStrengths.reduce((a, b) => gcd(a, b));
  unit = Math.max(unit, Math.ceil(scaledTarget / MAX_STATES));

  // Rounding each piece *up* to the grid guarantees the reconstructed exact dose
  // still lands at or below the target even when the grid has been coarsened.
  const pieceUnits = scaledStrengths.map(s => Math.ceil(s / unit));
  const cap = Math.floor(scaledTarget / unit);
  if (cap <= 0) return { ...EMPTY_COMBINATION };

  const cost = new Int32Array(cap + 1).fill(UNREACHABLE);
  const cameFrom = new Int32Array(cap + 1).fill(-1);
  cost[0] = 0;

  for (let value = 1; value <= cap; value++) {
    let best = UNREACHABLE;
    let bestPiece = -1;
    for (let k = 0; k < pieceUnits.length; k++) {
      const size = pieceUnits[k];
      if (size > value) continue;
      const previous = cost[value - size];
      if (previous === UNREACHABLE) continue;
      const candidate = previous + pieces[k].cost;
      if (candidate < best) {
        best = candidate;
        bestPiece = k;
      }
    }
    cost[value] = best;
    cameFrom[value] = bestPiece;
  }

  let value = cap;
  while (value > 0 && cost[value] === UNREACHABLE) value--;
  if (value === 0) return { ...EMPTY_COMBINATION };

  const tablets: { [id: string]: number } = {};
  const pieceCounts = new Map<number, number>();
  let exactDose = 0;
  while (value > 0) {
    const index = cameFrom[value];
    if (index < 0) break;
    const piece = pieces[index];
    tablets[piece.denomId] = (tablets[piece.denomId] || 0) + piece.tabletFraction;
    pieceCounts.set(index, (pieceCounts.get(index) || 0) + 1);
    exactDose += piece.strength;
    value -= pieceUnits[index];
  }

  // Largest pieces first, so the breakdown reads the way it would be dispensed.
  const breakdown: DosePiece[] = Array.from(pieceCounts.entries())
    .map(([index, pieceCount]) => ({
      denomId: pieces[index].denomId,
      strength: roundDose(pieces[index].strength),
      tabletFraction: pieces[index].tabletFraction,
      pieceCount,
      subtotal: roundDose(pieces[index].strength * pieceCount)
    }))
    .sort((a, b) => b.strength - a.strength);

  return {
    actualDose: roundDose(exactDose),
    tablets: Object.fromEntries(Object.entries(tablets).map(([id, n]) => [id, roundDose(n)])),
    pieces: breakdown
  };
}

/** "2 x 25mg + 1 x half of 10mg (5mg) = 55mg" — the arithmetic behind a dose. */
function describePieces(pieces: DosePiece[], actualDose: number, unit: string): string {
  if (pieces.length === 0) return `0${unit}`;
  const terms = pieces.map(p => {
    const fraction = FRACTION_NAMES[p.tabletFraction];
    const base = p.tabletFraction === 1
      ? `${num(p.strength)}${unit}`
      : `${fraction} of ${num(p.strength / p.tabletFraction)}${unit} (${num(p.strength)}${unit})`;
    return `${p.pieceCount} x ${base}`;
  });
  return `${terms.join(' + ')} = ${num(actualDose)}${unit}`;
}

function emptyResult(warnings: string[], startDate: string, startingDose: number): ScheduleResult {
  return {
    steps: [],
    targetCurve: [],
    derivation: [],
    totalTablets: {},
    startingDose,
    totalDays: 0,
    durationWeeks: 0,
    endDate: startDate,
    endReason: 'reached-stop-dose',
    reductionStepCount: 0,
    warnings
  };
}

function validate(drug: DrugConfig, wean: WeanConfig, warnings: string[]): boolean {
  let usable = true;

  if (buildPieces(drug.denominations).length === 0) {
    warnings.push('Add at least one tablet strength greater than zero to generate a schedule.');
    usable = false;
  }
  if (!Number.isFinite(drug.currentDose) || drug.currentDose <= 0) {
    warnings.push('Enter a current dose greater than zero.');
    usable = false;
  }
  if (!Number.isFinite(wean.reductionValue) || wean.reductionValue <= 0) {
    warnings.push(
      wean.reductionType === 'percentage'
        ? 'Enter a reduction percentage greater than zero.'
        : 'Enter a reduction amount greater than zero.'
    );
    usable = false;
  }
  if (wean.reductionType === 'percentage' && wean.reductionValue > 100) {
    warnings.push('A reduction above 100% is not meaningful; use 100% to stop in a single step.');
    usable = false;
  }
  if (!Number.isFinite(wean.intervalDays) || wean.intervalDays < 1) {
    warnings.push('The interval between reductions must be at least one day; using 1 day.');
  }

  return usable;
}

/**
 * The dose the ideal curve asks for at interval `n`, in closed form.
 *
 * Computed from the starting dose rather than by repeatedly multiplying the
 * previous target, so the value never accumulates floating-point drift and
 * always equals the formula shown to the clinician.
 */
function targetAtInterval(startingDose: number, wean: WeanConfig, n: number): number {
  return wean.reductionType === 'fixed'
    ? startingDose - n * wean.reductionValue
    : startingDose * Math.pow(1 - wean.reductionValue / 100, n);
}

function targetFormula(startingDose: number, wean: WeanConfig, n: number, target: number, unit: string): string {
  if (n === 0) return `${num(startingDose)}${unit} (starting dose)`;
  if (wean.reductionType === 'fixed') {
    return `${num(startingDose)} - (${n} x ${num(wean.reductionValue)}) = ${num(target)}${unit}`;
  }
  const factor = num(1 - wean.reductionValue / 100, 6);
  return `${num(startingDose)} x ${factor}^${n} = ${num(target)}${unit}`;
}

export function generateSchedule(drug: DrugConfig, wean: WeanConfig): ScheduleResult {
  const warnings: string[] = [];
  const startDate = isValidISODate(drug.startDate) ? drug.startDate : todayISO();
  if (!validate(drug, wean, warnings)) return emptyResult(warnings, startDate, drug.currentDose);

  const intervalDays = Number.isFinite(wean.intervalDays) ? Math.max(1, Math.round(wean.intervalDays)) : 1;
  const threshold = Number.isFinite(wean.minimumDoseThreshold) ? Math.max(0, wean.minimumDoseThreshold) : 0;
  if (!isValidISODate(drug.startDate)) {
    warnings.push('The start date was not a valid date; using today instead.');
  }

  const startingDose = drug.currentDose;
  const unit = drug.unit;

  // 1. Walk the taper curve, recording the achievable dose at each interval.
  //    The stop dose is inclusive: asking to stop at 5mg prescribes 5mg and
  //    then ceases, rather than ceasing from the step above it.
  const holds: { target: number; combination: TabletCombination }[] = [];
  let iteration = 0;
  let endReason: ScheduleEndReason = 'reached-stop-dose';

  while (iteration < MAX_ITERATIONS) {
    const target = targetAtInterval(startingDose, wean, iteration);
    if (target <= EPSILON || target < threshold - EPSILON) break;

    const combination = findBestTabletCombination(target, drug.denominations);

    // No combination of the available tablets can reach the target without
    // exceeding it: the taper is finished, whatever the arithmetic target says.
    if (combination.actualDose <= 0) {
      endReason = 'granularity-limited';
      break;
    }

    holds.push({ target: roundDose(target), combination });
    iteration++;
  }

  if (iteration >= MAX_ITERATIONS) {
    endReason = 'truncated';
    warnings.push(
      `The plan is incomplete: it was cut off after ${MAX_ITERATIONS} reduction intervals before reaching the stop dose. No cessation date is shown. Try a larger reduction, a longer interval, or a higher stop dose.`
    );
  }

  if (holds.length === 0) {
    warnings.push(
      endReason === 'granularity-limited'
        ? `No combination of the available strengths reaches ${num(startingDose)}${unit} without exceeding it, so no plan can be generated. Add a smaller strength or allow splitting.`
        : 'The current dose is already at or below the stop dose, so there is nothing to taper.'
    );
    return emptyResult(warnings, startDate, startingDose);
  }

  // 2. Collapse consecutive intervals that prescribe the same dose into a single
  //    held step, so the plan reads as "50mg for 28 days" rather than repeating rows.
  const steps: ScheduleStep[] = [];
  const targetCurve: { date: string; dose: number }[] = [];
  const derivation: DerivationEntry[] = [];
  const totalTablets: { [denomId: string]: number } = {};
  let dayIndex = 0;
  let previousDose: number | null = null;

  holds.forEach((hold, index) => {
    const date = addDaysISO(startDate, index * intervalDays);
    const { actualDose, tablets, pieces } = hold.combination;
    targetCurve.push({ date, dose: hold.target });

    const previous = steps[steps.length - 1];
    const startsNewStep = !previous || previous.actualDose !== actualDose;

    const reductionFromPrevious = startsNewStep && previousDose !== null
      ? roundDose(previousDose - actualDose)
      : null;
    const reductionPercent = reductionFromPrevious !== null && previousDose
      ? roundDose((reductionFromPrevious / previousDose) * 100)
      : null;

    derivation.push({
      intervalIndex: index,
      date,
      targetDose: hold.target,
      targetFormula: targetFormula(startingDose, wean, index, hold.target, unit),
      actualDose,
      actualFormula: describePieces(pieces, actualDose, unit),
      pieces,
      shortfall: roundDose(hold.target - actualDose),
      startsNewStep,
      reductionFromPrevious,
      reductionPercent,
      percentOfStartingDose: roundDose((actualDose / startingDose) * 100)
    });

    if (startsNewStep) {
      steps.push({
        date,
        dayIndex,
        durationDays: intervalDays,
        // Report the target that first justified this dose.
        targetDose: hold.target,
        actualDose,
        tablets,
        pieces,
        reductionFromPrevious,
        reductionPercent,
        isStop: false
      });
      previousDose = actualDose;
    } else {
      previous.durationDays += intervalDays;
    }
    dayIndex += intervalDays;
  });

  steps.forEach(step => {
    Object.entries(step.tablets).forEach(([id, count]) => {
      totalTablets[id] = roundDose((totalTablets[id] || 0) + count * step.durationDays);
    });
  });

  const endDate = addDaysISO(startDate, dayIndex);
  const lastPrescribed = steps[steps.length - 1];

  // A truncated plan has not finished tapering, so it must not print a cessation
  // instruction: doing so would tell the prescriber to stop from a dose the
  // taper never intended to stop from.
  if (endReason !== 'truncated') {
    steps.push({
      date: endDate,
      dayIndex,
      durationDays: 0,
      targetDose: 0,
      actualDose: 0,
      tablets: {},
      pieces: [],
      reductionFromPrevious: roundDose(lastPrescribed.actualDose),
      reductionPercent: 100,
      isStop: true
    });
  }

  // Carry the ideal curve to the end date so it spans the same range as the plan.
  const finalTarget = targetAtInterval(startingDose, wean, holds.length);
  targetCurve.push({ date: endDate, dose: roundDose(Math.max(0, finalTarget)) });

  // 3. Warn when the available tablets cannot express the requested curve.
  const smallestPiece = Math.min(...buildPieces(drug.denominations).map(p => p.strength));
  if (steps[0].actualDose < startingDose - EPSILON) {
    warnings.push(
      `A dose of ${num(startingDose)}${unit} cannot be made from the available strengths; the plan starts at ${num(steps[0].actualDose)}${unit}.`
    );
  }
  const firstReduction = wean.reductionType === 'percentage'
    ? startingDose * (wean.reductionValue / 100)
    : wean.reductionValue;
  if (smallestPiece > firstReduction) {
    warnings.push(
      `The smallest available piece is ${num(smallestPiece)}${unit}, which is larger than the requested reduction of ${num(firstReduction)}${unit}. The taper cannot follow the requested curve — add a smaller strength, allow splitting, or use a liquid formulation.`
    );
  }

  // The plan holds a dose until the curve falls far enough to justify the next
  // achievable one, so a coarse formulary turns a gentle taper into a cliff.
  // That is the clinically dangerous failure mode, and it is invisible from the
  // requested percentage alone.
  const worstDrop = steps
    .filter(step => !step.isStop && step.reductionPercent !== null)
    .reduce<ScheduleStep | null>((worst, step) => {
      const requested = wean.reductionType === 'percentage'
        ? wean.reductionValue
        : (wean.reductionValue / (step.actualDose + (step.reductionFromPrevious ?? 0))) * 100;
      if (step.reductionPercent! <= requested * DROP_WARNING_RATIO) return worst;
      return !worst || step.reductionPercent! > worst.reductionPercent! ? step : worst;
    }, null);

  if (worstDrop) {
    const from = roundDose(worstDrop.actualDose + (worstDrop.reductionFromPrevious ?? 0));
    warnings.push(
      `The available strengths force a ${num(worstDrop.reductionPercent!, 1)}% drop on ${worstDrop.date} (${num(from)}${unit} to ${num(worstDrop.actualDose)}${unit}), which is steeper than the requested reduction. Add a smaller strength, allow splitting, or lengthen the interval so the patient holds each dose for longer.`
    );
  }

  if (endReason === 'granularity-limited' && lastPrescribed.actualDose > threshold + EPSILON) {
    warnings.push(
      `The taper ceases from ${num(lastPrescribed.actualDose)}${unit} (${num((lastPrescribed.actualDose / startingDose) * 100, 1)}% of the starting dose) rather than tapering to ${num(threshold)}${unit}, because no smaller dose can be made from the available strengths.`
    );
  }

  return {
    steps,
    targetCurve,
    derivation,
    totalTablets,
    startingDose,
    totalDays: dayIndex,
    durationWeeks: Math.ceil(dayIndex / 7),
    endDate,
    endReason,
    reductionStepCount: Math.max(0, steps.filter(s => !s.isStop).length - 1),
    warnings
  };
}
