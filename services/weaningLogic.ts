import {
  DrugConfig,
  WeanConfig,
  ScheduleResult,
  ScheduleStep,
  ScheduleEndReason,
  Denomination,
  DerivationEntry,
  DosePiece,
  DoseBreakdown,
  LiquidConfig,
  SplitDose,
  DoseRounding,
  SplitPreference
} from '../types';
import { addDaysISO, formatDMY, isValidISODate, todayISO } from './dateUtils';

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

/**
 * Doses are quantised to this resolution (0.000001 of a unit) before searching.
 * Fine enough that a quarter of a 0.125mg tablet (0.03125) is exact; the GCD
 * step below divides the scale back out, so it does not enlarge the DP table.
 */
const SCALE = 1_000_000;
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
  /** Daily volume in mL when the dose is given as liquid instead of tablets. */
  liquidMl?: number;
  /** The daily dose divided into morning and night, when dosing twice daily. */
  split?: SplitDose;
}

const EMPTY_COMBINATION: TabletCombination = { actualDose: 0, tablets: {}, pieces: [] };

export interface CombinationOptions {
  /** Which achievable dose to take when the target cannot be made. Default 'below'. */
  rounding?: DoseRounding;
  /** How a twice-daily dose is shared when evenness costs extra pieces. Default 'even'. */
  splitPreference?: SplitPreference;
}

/**
 * Chooses between the nearest achievable doses below and above a target.
 * Ties go to the lower dose. In 'hold' mode the dose above is used unless the
 * nearest achievable dose is zero, so the last dose still ends the taper.
 */
function pickRounded(target: number, below: number, above: number | null, rounding: DoseRounding): 'below' | 'above' {
  if (rounding === 'below' || above === null || above <= below + EPSILON) return 'below';
  const aboveIsNearer = above - target < target - below - EPSILON;
  if (rounding === 'nearest') return aboveIsNearer ? 'above' : 'below';
  return below <= 0 && !aboveIsNearer ? 'below' : 'above';
}

/**
 * Finds the achievable dose for a target, preferring the fewest pieces and the
 * fewest cuts. By default ('below') it is the largest dose that does *not*
 * exceed the target, and the result is 0 when nothing at or below the target
 * can be made, which is the signal that the taper has run out of room. The
 * other rounding modes may take the nearest dose above the target instead; see
 * `DoseRounding`.
 *
 * Runs an unbounded-knapsack DP over doses quantised to a common unit, so cost
 * is O(states x pieces) rather than exponential in the number of denominations.
 *
 * With `split`, the daily dose is then divided into a morning and a night dose,
 * each made of whole pieces. The split never changes the daily total. By
 * default the most even split is chosen, even if that means more (smaller)
 * pieces than the daily dose alone would need: a 10mg tablet that cannot be cut
 * gives way to 2.5 x 2mg morning and night. `splitPreference: 'fewest'` keeps
 * the fewest daily pieces instead and shares those as evenly as they allow.
 */
export function findBestTabletCombination(
  targetDose: number,
  denominations: Denomination[],
  split = false,
  options: CombinationOptions = {}
): TabletCombination {
  const rounding = options.rounding ?? 'below';
  if (!Number.isFinite(targetDose) || targetDose <= 0) return { ...EMPTY_COMBINATION };

  const pieces = buildPieces(denominations);
  if (pieces.length === 0) return { ...EMPTY_COMBINATION };

  const scaledTarget = Math.floor(targetDose * SCALE + 1e-6);
  const scaledStrengths = pieces.map(p => Math.max(1, Math.round(p.strength * SCALE)));
  // The nearest achievable dose above the target is less than one smallest
  // piece above the nearest one below it, so that is as far as the search goes.
  const searchTop = rounding === 'below'
    ? scaledTarget
    : Math.ceil(targetDose * SCALE - 1e-6) + Math.min(...scaledStrengths);
  if (searchTop <= 0) return { ...EMPTY_COMBINATION };

  // Working in units of the greatest common divisor keeps the table tiny for
  // real-world strengths (a 0.5mg tablet split into quarters gives a 0.125 unit).
  let unit = scaledStrengths.reduce((a, b) => gcd(a, b));
  unit = Math.max(unit, Math.ceil(searchTop / MAX_STATES));

  // Rounding each piece *up* to the grid guarantees the reconstructed exact dose
  // still lands at or below the target even when the grid has been coarsened.
  const pieceUnits = scaledStrengths.map(s => Math.ceil(s / unit));
  const belowCap = Math.floor(scaledTarget / unit);
  const tableCap = Math.max(belowCap, Math.floor(searchTop / unit));

  const cost = new Int32Array(tableCap + 1).fill(UNREACHABLE);
  const cameFrom = new Int32Array(tableCap + 1).fill(-1);
  cost[0] = 0;

  for (let value = 1; value <= tableCap; value++) {
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

  /** Walks the DP back from a grid value to the piece indexes that make it up. */
  const piecesFor = (start: number): Map<number, number> => {
    const counts = new Map<number, number>();
    let remaining = start;
    while (remaining > 0) {
      const index = cameFrom[remaining];
      if (index < 0) break;
      counts.set(index, (counts.get(index) || 0) + 1);
      remaining -= pieceUnits[index];
    }
    return counts;
  };
  const exactDose = (gridValue: number): number => {
    let dose = 0;
    piecesFor(gridValue).forEach((count, index) => { dose += pieces[index].strength * count; });
    return dose;
  };

  let belowValue = Math.max(0, belowCap);
  while (belowValue > 0 && cost[belowValue] === UNREACHABLE) belowValue--;
  const belowDose = belowValue > 0 ? exactDose(belowValue) : 0;

  let aboveValue = -1;
  if (rounding !== 'below' && belowDose < targetDose - EPSILON) {
    for (let candidate = belowValue + 1; candidate <= tableCap; candidate++) {
      if (cost[candidate] !== UNREACHABLE && exactDose(candidate) >= targetDose - EPSILON) {
        aboveValue = candidate;
        break;
      }
    }
  }
  const aboveDose = aboveValue > 0 ? exactDose(aboveValue) : null;

  const value = pickRounded(targetDose, belowDose, aboveDose, rounding) === 'above' ? aboveValue : belowValue;
  if (value <= 0) return { ...EMPTY_COMBINATION };

  if (!split) {
    const daily = toBreakdown(pieces, piecesFor(value));
    return { actualDose: daily.dose, tablets: daily.tablets, pieces: daily.pieces };
  }

  const [amCounts, pmCounts] = options.splitPreference === 'fewest'
    ? shareFewestPieces(piecesFor(value), pieceUnits)
    : splitMostEvenly(value, cost, piecesFor);
  let am = toBreakdown(pieces, amCounts);
  let pm = toBreakdown(pieces, pmCounts);
  // Coarsened grids round pieces up, so exact doses can invert; night stays the larger.
  if (am.dose > pm.dose) [am, pm] = [pm, am];

  const dailyCounts = new Map(amCounts);
  pmCounts.forEach((count, index) => dailyCounts.set(index, (dailyCounts.get(index) || 0) + count));
  const daily = toBreakdown(pieces, dailyCounts);
  return { actualDose: daily.dose, tablets: daily.tablets, pieces: daily.pieces, split: { am, pm } };
}

type PieceCounts = Map<number, number>;

/**
 * The most even split: the largest morning dose that is no more than half the
 * day and leaves an achievable night dose, so any uneven part goes at night.
 * Each half is made of its own fewest pieces. A zero morning dose is always
 * possible, so this always finds a split.
 */
function splitMostEvenly(
  value: number,
  cost: Int32Array,
  piecesFor: (gridValue: number) => PieceCounts
): [PieceCounts, PieceCounts] {
  for (let morning = Math.floor(value / 2); morning > 0; morning--) {
    if (cost[morning] === UNREACHABLE || cost[value - morning] === UNREACHABLE) continue;
    return [piecesFor(morning), piecesFor(value - morning)];
  }
  return [new Map(), piecesFor(value)];
}

/**
 * Shares one fixed set of daily pieces between morning and night as evenly as
 * it can (a subset sum over the pieces), with any uneven part at night.
 */
function shareFewestPieces(daily: PieceCounts, pieceUnits: number[]): [PieceCounts, PieceCounts] {
  const items: number[] = [];
  daily.forEach((count, index) => { for (let i = 0; i < count; i++) items.push(index); });
  const total = items.reduce((sum, index) => sum + pieceUnits[index], 0);
  const half = Math.floor(total / 2);

  // reachedBy[s] is the item that first made a morning total of s, or -1.
  const reachedBy = new Int32Array(half + 1).fill(-1);
  const BASE = -2;
  reachedBy[0] = BASE;
  items.forEach((index, item) => {
    const size = pieceUnits[index];
    for (let s = half; s >= size; s--) {
      if (reachedBy[s] === -1 && reachedBy[s - size] !== -1) reachedBy[s] = item;
    }
  });

  let morning = half;
  while (morning > 0 && reachedBy[morning] === -1) morning--;
  const am: PieceCounts = new Map();
  const pm: PieceCounts = new Map(daily);
  for (let s = morning; s > 0; s -= pieceUnits[items[reachedBy[s]]]) {
    const index = items[reachedBy[s]];
    am.set(index, (am.get(index) || 0) + 1);
    pm.set(index, pm.get(index)! - 1);
  }
  pm.forEach((count, index) => { if (count === 0) pm.delete(index); });
  return [am, pm];
}

/** Turns piece counts (by index into `pieces`) into a dose with its tablets and pieces. */
function toBreakdown(pieces: Piece[], counts: Map<number, number>): DoseBreakdown {
  const tablets: { [id: string]: number } = {};
  let exactDose = 0;
  counts.forEach((count, index) => {
    const piece = pieces[index];
    tablets[piece.denomId] = (tablets[piece.denomId] || 0) + piece.tabletFraction * count;
    exactDose += piece.strength * count;
  });

  // Largest pieces first, so the breakdown reads the way it would be dispensed.
  const breakdown: DosePiece[] = Array.from(counts.entries())
    .map(([index, pieceCount]) => ({
      denomId: pieces[index].denomId,
      strength: roundDose(pieces[index].strength),
      tabletFraction: pieces[index].tabletFraction,
      pieceCount,
      subtotal: roundDose(pieces[index].strength * pieceCount)
    }))
    .sort((a, b) => b.strength - a.strength);

  return {
    dose: roundDose(exactDose),
    tablets: Object.fromEntries(Object.entries(tablets).map(([id, n]) => [id, roundDose(n)])),
    pieces: breakdown
  };
}

/** The smallest dose the liquid can deliver: one measuring increment. */
export function liquidDoseIncrement(liquid: LiquidConfig): number {
  return liquid.concentration * liquid.measureIncrementMl;
}

/** Whether a step aiming at `targetDose` is given as liquid rather than tablets. */
export function usesLiquid(liquid: LiquidConfig | undefined, targetDose: number): boolean {
  if (!liquid?.enabled) return false;
  if (liquid.mode === 'whole') return true;
  // Tolerance mode decides as the taper unfolds, not from the target alone.
  return liquid.mode === 'below' && targetDose < liquid.switchBelowDose - EPSILON;
}

/**
 * A liquid dose that is a whole number of measuring increments. Like the
 * tablet search, by default it is the largest that does not exceed the target;
 * the other rounding modes may take the next measure up (see `DoseRounding`).
 */
export function findLiquidDose(
  targetDose: number,
  liquid: LiquidConfig,
  split = false,
  rounding: DoseRounding = 'below'
): TabletCombination {
  const increment = liquidDoseIncrement(liquid);
  if (!Number.isFinite(targetDose) || targetDose <= 0 || !(increment > 0)) return { ...EMPTY_COMBINATION };

  // The small tolerances absorb floating-point error (1.8 / 0.1 = 17.999...),
  // not a real rounding: they are far below any measurable volume.
  const below = Math.floor(targetDose / increment + 1e-9);
  const above = Math.ceil(targetDose / increment - 1e-9);
  const increments = pickRounded(targetDose, below * increment, above * increment, rounding) === 'above' ? above : below;
  if (increments <= 0) return { ...EMPTY_COMBINATION };

  const liquidMl = roundDose(increments * liquid.measureIncrementMl);
  const result: TabletCombination = {
    actualDose: roundDose(liquidMl * liquid.concentration),
    tablets: {},
    pieces: [],
    liquidMl
  };
  if (split) {
    // Whole measures each; an odd measure goes at night.
    const measure = (count: number): DoseBreakdown => {
      const ml = roundDose(count * liquid.measureIncrementMl);
      return { dose: roundDose(ml * liquid.concentration), tablets: {}, pieces: [], liquidMl: ml };
    };
    const morning = Math.floor(increments / 2);
    result.split = { am: measure(morning), pm: measure(increments - morning) };
  }
  return result;
}

/** "2 x 25mg + 1 x half of 10mg (5mg) = 55mg" — the arithmetic behind a dose. */
function describePieces(
  pieces: DosePiece[],
  actualDose: number,
  unit: string,
  liquidMl?: number,
  liquid?: LiquidConfig
): string {
  if (liquidMl !== undefined && liquid) {
    return `${num(liquidMl)}mL x ${num(liquid.concentration)}${unit}/mL = ${num(actualDose)}${unit}`;
  }
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

function describeSplit(split: SplitDose, unit: string, liquid?: LiquidConfig): string {
  const part = (dose: DoseBreakdown) =>
    dose.dose > 0 ? describePieces(dose.pieces, dose.dose, unit, dose.liquidMl, liquid) : 'none';
  return `AM: ${part(split.am)} | PM: ${part(split.pm)}`;
}

function emptyResult(warnings: string[], startDate: string, startingDose: number): ScheduleResult {
  return {
    steps: [],
    targetCurve: [],
    derivation: [],
    totalTablets: {},
    totalLiquidMl: 0,
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
  const liquid = drug.liquid?.enabled ? drug.liquid : undefined;

  if (liquid) {
    if (!Number.isFinite(liquid.concentration) || liquid.concentration <= 0) {
      warnings.push(`Enter a liquid concentration greater than zero (${drug.unit}/mL).`);
      usable = false;
    }
    if (!Number.isFinite(liquid.measureIncrementMl) || liquid.measureIncrementMl <= 0) {
      warnings.push('Enter the smallest liquid volume that can be measured, greater than zero (mL).');
      usable = false;
    }
    if (liquid.mode === 'below' && (!Number.isFinite(liquid.switchBelowDose) || liquid.switchBelowDose <= 0)) {
      warnings.push('Enter the dose below which the taper switches to liquid, greater than zero.');
      usable = false;
    }
    if (liquid.mode === 'tolerance' && (!Number.isFinite(liquid.maxTabletDropPercent) || liquid.maxTabletDropPercent <= 0)) {
      warnings.push('Enter the largest tablet drop to allow before switching to liquid, greater than zero percent.');
      usable = false;
    }
  }

  // A liquid-only taper needs no tablets; any taper that starts on tablets does.
  const tabletsNeeded = !(liquid && liquid.mode === 'whole');
  if (tabletsNeeded && buildPieces(drug.denominations).length === 0) {
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
  const splitDaily = drug.dosesPerDay === 2;
  const rounding = wean.rounding ?? 'below';
  const options: CombinationOptions = { rounding, splitPreference: drug.splitPreference };
  const doseFor = (target: number, liquid: boolean, mode: DoseRounding = rounding): TabletCombination =>
    liquid
      ? findLiquidDose(target, drug.liquid!, splitDaily, mode)
      : findBestTabletCombination(target, drug.denominations, splitDaily, { ...options, rounding: mode });

  // 1. Walk the taper curve, recording the achievable dose at each interval.
  //    The stop dose is inclusive: asking to stop at 5mg prescribes 5mg and
  //    then ceases, rather than ceasing from the step above it.
  const holds: { target: number; combination: TabletCombination }[] = [];
  let iteration = 0;
  let endReason: ScheduleEndReason = 'reached-stop-dose';
  let onLiquid = false;

  while (iteration < MAX_ITERATIONS) {
    const target = targetAtInterval(startingDose, wean, iteration);
    if (target <= EPSILON || target < threshold - EPSILON) break;

    const previousHold = holds[holds.length - 1];
    const liquidStep = onLiquid || usesLiquid(drug.liquid, target);
    let combination = doseFor(target, liquidStep);
    // Rounding up is only ever towards a dose already being taken; it must not
    // start the plan above the current dose when that dose cannot be made.
    if (!previousHold && combination.actualDose > startingDose + EPSILON) {
      combination = doseFor(target, liquidStep, 'below');
    }

    // In tolerance mode, the first tablet step that would drop by more than the
    // clinician's tolerance (or that the tablets cannot make at all) is given as
    // liquid instead, and the rest of the taper stays on liquid.
    if (!onLiquid && previousHold && drug.liquid?.enabled && drug.liquid.mode === 'tolerance' && !combination.liquidMl) {
      const previousDose = previousHold.combination.actualDose;
      const drop = ((previousDose - combination.actualDose) / previousDose) * 100;
      if (combination.actualDose <= 0 || drop > drug.liquid.maxTabletDropPercent + EPSILON) {
        onLiquid = true;
        combination = doseFor(target, true);
      }
    }

    // Changing formulation can land above the previous dose: tablets may have
    // fallen well short of an earlier target that the finer liquid now tracks
    // closely. A taper must never step up, so hold the previous dose instead.
    if (previousHold && combination.actualDose > previousHold.combination.actualDose + EPSILON) {
      combination = previousHold.combination;
    }

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
  // With reduceOnStartDate the current dose's first interval has already been
  // held before the start date, so the timeline begins one interval earlier
  // and that part is trimmed off below. Day 0 is always the start date.
  const offsetDays = wean.reduceOnStartDate ? intervalDays : 0;
  let dayIndex = -offsetDays;
  let previousDose: number | null = null;

  holds.forEach((hold, index) => {
    const date = addDaysISO(startDate, index * intervalDays - offsetDays);
    const { actualDose, tablets, pieces, liquidMl, split } = hold.combination;
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
      actualFormula: describePieces(pieces, actualDose, unit, liquidMl, drug.liquid),
      ...(split ? { splitFormula: describeSplit(split, unit, drug.liquid) } : {}),
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
        ...(liquidMl !== undefined ? { liquidMl } : {}),
        ...(split ? { split } : {}),
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

  const lastPrescribed = steps[steps.length - 1];

  // Drop the part of the current dose that falls before the start date. If the
  // tablets cannot make the first reduction, the current dose carries on past
  // the start date, and that remainder stays in the plan.
  if (offsetDays > 0) {
    const first = steps[0];
    first.durationDays -= offsetDays;
    if (first.durationDays <= 0) {
      steps.shift();
    } else {
      first.date = startDate;
      first.dayIndex = 0;
    }
  }

  let totalLiquidMl = 0;
  steps.forEach(step => {
    Object.entries(step.tablets).forEach(([id, count]) => {
      totalTablets[id] = roundDose((totalTablets[id] || 0) + count * step.durationDays);
    });
    if (step.liquidMl !== undefined) totalLiquidMl = roundDose(totalLiquidMl + step.liquidMl * step.durationDays);
  });

  const endDate = addDaysISO(startDate, dayIndex);

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
  // The chart starts on the start date; points before it belong to doses already taken.
  if (offsetDays > 0) {
    while (targetCurve.length > 1 && targetCurve[0].date < startDate) targetCurve.shift();
  }

  // 3. Warn when the available tablets cannot express the requested curve.
  // The first reduction is made in whichever form the plan starts on.
  const startsOnLiquid = usesLiquid(drug.liquid, startingDose);
  const smallestPiece = startsOnLiquid
    ? liquidDoseIncrement(drug.liquid!)
    : Math.min(...buildPieces(drug.denominations).map(p => p.strength));
  const firstHeldDose = holds[0].combination.actualDose;
  if (firstHeldDose < startingDose - EPSILON) {
    warnings.push(
      `A dose of ${num(startingDose)}${unit} cannot be made from the available strengths; the plan starts at ${num(firstHeldDose)}${unit}.`
    );
  }
  const firstReduction = wean.reductionType === 'percentage'
    ? startingDose * (wean.reductionValue / 100)
    : wean.reductionValue;
  if (smallestPiece > firstReduction) {
    warnings.push(
      `The smallest ${startsOnLiquid ? 'measurable liquid dose' : 'available piece'} is ${num(smallestPiece)}${unit}, which is larger than the requested reduction of ${num(firstReduction)}${unit}. The taper cannot follow the requested curve — ${startsOnLiquid ? 'measure a smaller volume or use a more dilute liquid' : 'add a smaller strength, allow splitting, or use a liquid formulation'}.`
    );
  }

  // The plan holds a dose until the curve justifies the next achievable one, so
  // a coarse formulary turns a gentle taper into a cliff. That is the
  // clinically dangerous failure mode, and it is invisible from the requested
  // percentage alone, so each such step is flagged and the worst one reported.
  steps.forEach(step => {
    if (step.isStop || step.reductionPercent === null) return;
    const requested = wean.reductionType === 'percentage'
      ? wean.reductionValue
      : (wean.reductionValue / (step.actualDose + (step.reductionFromPrevious ?? 0))) * 100;
    step.steeperThanRequested = step.reductionPercent > requested * DROP_WARNING_RATIO;
  });
  const worstDrop = steps
    .filter(step => step.steeperThanRequested)
    .reduce<ScheduleStep | null>(
      (worst, step) => (!worst || step.reductionPercent! > worst.reductionPercent! ? step : worst),
      null
    );

  if (worstDrop) {
    const from = roundDose(worstDrop.actualDose + (worstDrop.reductionFromPrevious ?? 0));
    warnings.push(
      `The available ${worstDrop.liquidMl !== undefined ? 'liquid measure forces' : 'strengths force'} a ${num(worstDrop.reductionPercent!, 1)}% drop on ${formatDMY(worstDrop.date)} (${num(from)}${unit} to ${num(worstDrop.actualDose)}${unit}), which is steeper than the requested reduction. ${worstDrop.liquidMl !== undefined ? 'Measure a smaller volume, use a more dilute liquid,' : 'Add a smaller strength, allow splitting,'} or lengthen the interval so the patient holds each dose for longer.`
    );
  }

  // Pieces cannot always be shared evenly; a lopsided split changes how the day
  // is covered, so say where it first happens.
  const uneven = steps.find(step => step.split && step.split.am.dose < step.split.pm.dose / 2 - EPSILON);
  if (uneven?.split) {
    warnings.push(
      `From ${formatDMY(uneven.date)} the available pieces cannot divide the daily dose evenly: ${num(uneven.split.am.dose)}${unit} in the morning and ${num(uneven.split.pm.dose)}${unit} at night.${uneven.split.am.dose === 0 ? ' The whole dose is taken at night.' : ''}`
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
    totalLiquidMl,
    startingDose,
    totalDays: dayIndex,
    durationWeeks: Math.ceil(dayIndex / 7),
    endDate,
    endReason,
    // Every held step after the current dose is a reduction.
    reductionStepCount: steps.filter(s => !s.isStop && s.reductionFromPrevious !== null).length,
    warnings
  };
}
