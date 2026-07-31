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
  minimumDoseThreshold: number; // Dose at which to stop (e.g. 0.1mg)
}

export interface ScheduleStep {
  date: string;
  dayIndex: number;
  durationDays: number; // How long this dose is held before the next change
  targetDose: number;
  actualDose: number;
  tablets: { [denomId: string]: number }; // Tablet-equivalents of each denomination (0.5 = one half)
  isStop: boolean;
}

export interface ScheduleResult {
  steps: ScheduleStep[];
  /**
   * The ideal taper curve sampled once per reduction interval. Steps collapse
   * repeated doses, so they are too sparse to plot the intended curve against.
   */
  targetCurve: { date: string; dose: number }[];
  totalTablets: { [denomId: string]: number };
  durationWeeks: number;
  reductionStepCount: number; // Number of dose *decreases*, excluding the starting dose
  warnings: string[];
}
