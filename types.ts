export interface Denomination {
  id: string;
  strength: number;
  label?: string; // e.g., "10mg tablet"
  canSplit?: 'no' | 'half' | 'quarter';
}

export interface DrugConfig {
  name: string;
  currentDose: number;
  unit: string; // Strength unit of the solid dose form, e.g. "mg", "mcg"
  startDate: string; // ISO date string
  denominations: Denomination[];
}

export interface WeanConfig {
  reductionType: 'percentage' | 'fixed';
  reductionValue: number; // e.g., 10 (percent) or 5 (mg)
  intervalDays: number; // e.g., reduce every 14 days
  minimumDoseThreshold: number; // Lowest dose to prescribe before stopping (inclusive)
}

/** One physical piece counted towards a dose: a whole tablet, or a half/quarter. */
export interface DosePiece {
  denomId: string;
  strength: number; // Strength of this piece, e.g. 12.5 for half of a 25mg tablet
  tabletFraction: number; // 1 whole, 0.5 half, 0.25 quarter
  pieceCount: number; // How many such pieces are taken each day
  subtotal: number; // pieceCount x strength
}

export interface ScheduleStep {
  date: string;
  dayIndex: number;
  durationDays: number; // How long this dose is held before the next change
  targetDose: number;
  actualDose: number;
  tablets: { [denomId: string]: number }; // Tablet-equivalents of each denomination (0.5 = one half)
  pieces: DosePiece[]; // The same dose broken down into physically takeable pieces
  /** Drop from the previously *prescribed* dose. Null on the first step. */
  reductionFromPrevious: number | null;
  /** The same drop as a percentage of the previously prescribed dose. */
  reductionPercent: number | null;
  isStop: boolean;
}

/**
 * One reduction interval of the ideal curve, with the arithmetic that produced
 * the prescribed dose. Emitted so a clinician can check every number the plan
 * rests on without re-deriving it — the values here are the ones the engine
 * used, not a recomputation.
 */
export interface DerivationEntry {
  intervalIndex: number; // n, counting the starting dose as 0
  date: string;
  targetDose: number;
  targetFormula: string; // e.g. "50 x (1 - 0.10)^3 = 36.45mg"
  actualDose: number;
  actualFormula: string; // e.g. "1 x 25mg + 1 x 5mg = 30mg"
  pieces: DosePiece[];
  shortfall: number; // targetDose - actualDose
  startsNewStep: boolean; // False while the previous dose is still being held
  reductionFromPrevious: number | null;
  reductionPercent: number | null;
  percentOfStartingDose: number;
}

/** Why the taper finished, which decides whether cessation is actually planned. */
export type ScheduleEndReason =
  /** The ideal curve reached the stop dose; cessation is intended. */
  | 'reached-stop-dose'
  /** No smaller dose can be made from the available strengths. */
  | 'granularity-limited'
  /** The engine hit its iteration cap; the plan shown is incomplete. */
  | 'truncated';

export interface ScheduleResult {
  steps: ScheduleStep[];
  /**
   * The ideal taper curve sampled once per reduction interval. Steps collapse
   * repeated doses, so they are too sparse to plot the intended curve against.
   */
  targetCurve: { date: string; dose: number }[];
  derivation: DerivationEntry[];
  totalTablets: { [denomId: string]: number };
  startingDose: number; // The dose the curve is measured against
  totalDays: number;
  durationWeeks: number;
  endDate: string;
  endReason: ScheduleEndReason;
  reductionStepCount: number; // Number of dose *decreases*, excluding the starting dose
  warnings: string[];
}
