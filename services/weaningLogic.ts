import { DrugConfig, WeanConfig, ScheduleResult, ScheduleStep, Denomination } from '../types';
import { addDaysISO, isValidISODate, todayISO } from './dateUtils';

/** A physically takeable piece: a whole tablet, or a half/quarter of one. */
interface Piece {
  denomId: string;
  strength: number;
  tabletFraction: number; // 1 for a whole tablet, 0.5 for a half, 0.25 for a quarter
  cost: number; // Preference weight: fewer pieces first, then fewer cuts
}

// Costs are compared as a sum, so the piece-count term must dominate the
// splitting term. Whole tablets are preferred over halves at equal piece count.
const COST_WHOLE = 10;
const COST_HALF = 11;
const COST_QUARTER = 12;

/** Doses are quantised to this resolution (0.001 of a unit) before searching. */
const SCALE = 1000;
/** Upper bound on DP table size, so pathological strengths cannot hang the UI. */
const MAX_STATES = 200_000;
const MAX_ITERATIONS = 500;
const UNREACHABLE = 0x7fffffff;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function roundDose(value: number): number {
  return parseFloat(value.toFixed(4));
}

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
): { actualDose: number; tablets: { [id: string]: number } } {
  const empty = { actualDose: 0, tablets: {} };
  if (!Number.isFinite(targetDose) || targetDose <= 0) return empty;

  const pieces = buildPieces(denominations);
  if (pieces.length === 0) return empty;

  const scaledTarget = Math.floor(targetDose * SCALE + 1e-6);
  if (scaledTarget <= 0) return empty;

  const scaledStrengths = pieces.map(p => Math.max(1, Math.round(p.strength * SCALE)));

  // Working in units of the greatest common divisor keeps the table tiny for
  // real-world strengths (a 0.5mg tablet split into quarters gives a 0.125 unit).
  let unit = scaledStrengths.reduce((a, b) => gcd(a, b));
  unit = Math.max(unit, Math.ceil(scaledTarget / MAX_STATES));

  // Rounding each piece *up* to the grid guarantees the reconstructed exact dose
  // still lands at or below the target even when the grid has been coarsened.
  const pieceUnits = scaledStrengths.map(s => Math.ceil(s / unit));
  const cap = Math.floor(scaledTarget / unit);
  if (cap <= 0) return empty;

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
  if (value === 0) return empty;

  const tablets: { [id: string]: number } = {};
  let exactDose = 0;
  while (value > 0) {
    const index = cameFrom[value];
    if (index < 0) break;
    const piece = pieces[index];
    tablets[piece.denomId] = (tablets[piece.denomId] || 0) + piece.tabletFraction;
    exactDose += piece.strength;
    value -= pieceUnits[index];
  }

  return { actualDose: roundDose(exactDose), tablets };
}

function emptyResult(warnings: string[]): ScheduleResult {
  return { steps: [], totalTablets: {}, durationWeeks: 0, reductionStepCount: 0, warnings };
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

export function generateSchedule(drug: DrugConfig, wean: WeanConfig): ScheduleResult {
  const warnings: string[] = [];
  if (!validate(drug, wean, warnings)) return emptyResult(warnings);

  const intervalDays = Number.isFinite(wean.intervalDays) ? Math.max(1, Math.round(wean.intervalDays)) : 1;
  const threshold = Number.isFinite(wean.minimumDoseThreshold) ? Math.max(0, wean.minimumDoseThreshold) : 0;
  const startDate = isValidISODate(drug.startDate) ? drug.startDate : todayISO();
  if (!isValidISODate(drug.startDate)) {
    warnings.push('The start date was not a valid date; using today instead.');
  }

  // 1. Walk the taper curve, recording the achievable dose at each interval.
  const holds: { targetDose: number; actualDose: number; tablets: { [id: string]: number } }[] = [];
  let target = drug.currentDose;
  let iteration = 0;
  let ranOutOfRoom = false;

  while (target > threshold && iteration < MAX_ITERATIONS) {
    const { actualDose, tablets } = findBestTabletCombination(target, drug.denominations);

    // No combination of the available tablets can reach the target without
    // exceeding it: the taper is finished, whatever the arithmetic target says.
    if (actualDose <= 0) {
      ranOutOfRoom = true;
      break;
    }

    holds.push({ targetDose: roundDose(target), actualDose, tablets });

    target = wean.reductionType === 'fixed'
      ? target - wean.reductionValue
      : target * (1 - wean.reductionValue / 100);
    iteration++;
  }

  if (iteration >= MAX_ITERATIONS) {
    warnings.push(
      `The schedule was truncated at ${MAX_ITERATIONS} reductions. Try a larger reduction or a higher stop dose.`
    );
  }

  if (holds.length === 0) {
    warnings.push('The current dose is already at or below the stop dose, so there is nothing to taper.');
    return emptyResult(warnings);
  }

  // 2. Collapse consecutive intervals that prescribe the same dose into a single
  //    held step, so the plan reads as "50mg for 28 days" rather than repeating rows.
  const steps: ScheduleStep[] = [];
  const totalTablets: { [denomId: string]: number } = {};
  let dayIndex = 0;

  holds.forEach(hold => {
    const previous = steps[steps.length - 1];
    if (previous && previous.actualDose === hold.actualDose) {
      previous.durationDays += intervalDays;
    } else {
      steps.push({
        date: addDaysISO(startDate, dayIndex),
        dayIndex,
        durationDays: intervalDays,
        // Report the target that first justified this dose.
        targetDose: hold.targetDose,
        actualDose: hold.actualDose,
        tablets: hold.tablets,
        isStop: false
      });
    }
    dayIndex += intervalDays;
  });

  steps.forEach(step => {
    Object.entries(step.tablets).forEach(([id, count]) => {
      totalTablets[id] = roundDose((totalTablets[id] || 0) + count * step.durationDays);
    });
  });

  steps.push({
    date: addDaysISO(startDate, dayIndex),
    dayIndex,
    durationDays: 0,
    targetDose: 0,
    actualDose: 0,
    tablets: {},
    isStop: true
  });

  // 3. Warn when the available tablets cannot express the requested curve.
  const smallestPiece = Math.min(...buildPieces(drug.denominations).map(p => p.strength));
  if (steps[0].actualDose < drug.currentDose) {
    warnings.push(
      `A dose of ${drug.currentDose}${drug.unit} cannot be made from the available strengths; the plan starts at ${steps[0].actualDose}${drug.unit}.`
    );
  }
  const firstReduction = wean.reductionType === 'percentage'
    ? drug.currentDose * (wean.reductionValue / 100)
    : wean.reductionValue;
  if (smallestPiece > firstReduction) {
    warnings.push(
      `The smallest available piece is ${roundDose(smallestPiece)}${drug.unit}, which is larger than the requested reduction of ${roundDose(firstReduction)}${drug.unit}. The taper cannot follow the requested curve — add a smaller strength or allow splitting.`
    );
  }
  if (ranOutOfRoom && steps[steps.length - 2].actualDose > threshold) {
    warnings.push(
      `The taper stops at ${steps[steps.length - 2].actualDose}${drug.unit} rather than ${threshold}${drug.unit}, because no smaller dose can be made from the available strengths.`
    );
  }

  return {
    steps,
    totalTablets,
    durationWeeks: Math.ceil(dayIndex / 7),
    reductionStepCount: Math.max(0, steps.length - 2),
    warnings
  };
}
