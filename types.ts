export interface Denomination {
  id: string;
  strength: number;
  label?: string; // e.g., "10mg tablet"
  canSplit?: 'no' | 'half' | 'quarter';
}

export interface DrugConfig {
  name: string;
  currentDose: number;
  unit: string; // e.g. "mg", "ml"
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
  targetDose: number;
  actualDose: number;
  tablets: { [denomId: string]: number }; // Count of each denomination
  isStop: boolean;
}

export interface ScheduleResult {
  steps: ScheduleStep[];
  totalTablets: { [denomId: string]: number };
  durationWeeks: number;
}