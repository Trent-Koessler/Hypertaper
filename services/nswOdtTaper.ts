/**
 * NSW opioid dependence treatment (ODT) tapers: methadone and sublingual
 * buprenorphine, as set out in NSW Health, "Safe prescribing of medicines for
 * the management of opioid dependence in NSW: Guidance for prescribers"
 * (October 2026), Chapter 22, pp92-93.
 *
 * The guide asks for hyperbolic tapering - keeping the percentage cut roughly
 * constant - and gives a range of reduction for each dose band, every 1-4
 * weeks or longer. This module holds those bands, sets up the calculator for
 * each medicine, and checks every step of a plan against them.
 *
 * The same band tables are held in the SUD Toolkit (Withdrawal App,
 * data/otp-completion.js), which links here with ?preset=&dose=. The two
 * copies must agree; each repository's tests pin its own copy to the guide.
 */
import { DrugConfig, ScheduleStep, WeanConfig } from '../types';

export type NswOdtMedicine = 'methadone' | 'buprenorphine';

export interface NswTaperBand {
  /** Label as the guide prints it. */
  label: string;
  /** Exclusive lower edge, mg/day. */
  fromMg: number;
  /** Inclusive upper edge, mg/day (Infinity for the top band). */
  toMg: number;
  /** The reduction range the guide gives for this band, in mg. */
  stepMg: [number, number];
}

export const NSW_ODT_SOURCE =
  'NSW Health, Safe prescribing of medicines for the management of opioid dependence in NSW (2026), ' +
  'sections 22.3-22.4, pp92-93';

export const METHADONE_BANDS: NswTaperBand[] = [
  { label: '>120mg', fromMg: 120, toMg: Infinity, stepMg: [10, 20] },
  { label: '60-120mg', fromMg: 60, toMg: 120, stepMg: [5, 10] },
  { label: '30-60mg', fromMg: 30, toMg: 60, stepMg: [2.5, 5] },
  { label: '15-30mg', fromMg: 15, toMg: 30, stepMg: [1, 2.5] },
  { label: '5-15mg', fromMg: 5, toMg: 15, stepMg: [0.5, 1] },
  { label: '<5mg', fromMg: 0, toMg: 5, stepMg: [0.5, 1.25] }
];

export const BUPRENORPHINE_BANDS: NswTaperBand[] = [
  { label: '>16mg', fromMg: 16, toMg: Infinity, stepMg: [2, 4] },
  { label: '8-16mg', fromMg: 8, toMg: 16, stepMg: [1, 2] },
  { label: '4-8mg', fromMg: 4, toMg: 8, stepMg: [0.4, 2] },
  { label: '2-4mg', fromMg: 2, toMg: 4, stepMg: [0.2, 0.4] },
  { label: '0.4-2mg', fromMg: 0.4, toMg: 2, stepMg: [0.1, 0.2] },
  { label: '<0.4mg', fromMg: 0, toMg: 0.4, stepMg: [0.1, 0.1] }
];

export const bandsFor = (medicine: NswOdtMedicine): NswTaperBand[] =>
  medicine === 'methadone' ? METHADONE_BANDS : BUPRENORPHINE_BANDS;

/**
 * The band a dose sits in. The guide's bands share their edges ("60-120mg"
 * and "30-60mg" both name 60); a dose on an edge takes the lower band, the
 * smaller step. The bottom band is labelled "<", so 5mg methadone and 0.4mg
 * buprenorphine take the band above it.
 */
export function nswBandFor(medicine: NswOdtMedicine, doseMg: number): NswTaperBand | null {
  const bands = bandsFor(medicine);
  if (!Number.isFinite(doseMg) || doseMg <= 0) return null;
  const bottom = bands[bands.length - 1];
  if (doseMg < bottom.toMg) return bottom;
  return (
    bands.find(b => b !== bottom && doseMg > b.fromMg && doseMg <= b.toMg) ??
    (doseMg === bottom.toMg ? bands[bands.length - 2] : null)
  );
}

/** Notes shown with each medicine, from the same chapter. */
export const NSW_ODT_NOTES: Record<NswOdtMedicine, string[]> = {
  methadone: [
    'Keep the percentage cut roughly constant: 5% is 5mg from 100mg but 0.5mg from 10mg.',
    'Methadone liquid is 5mg/mL. Steps below 0.5mg (0.1mL) need the pharmacy to compound a weaker ' +
      'solution, which may cost the patient more.',
    'Consider transferring to buprenorphine once below 30mg, or earlier, to ease withdrawal.',
    'Some patients prefer "blind" reductions. Write dose flexibility into the prescription so the ' +
      'pharmacist can pause or reverse a step.'
  ],
  buprenorphine: [
    'Some patients tolerate cuts of up to 25% at a time at higher doses.',
    'Tablets are 8mg, 2mg and 0.4mg (Subutex); films are 8mg and 2mg (Suboxone). Below 2mg the guide\'s ' +
      'steps (0.1-0.2mg) are smaller than a 0.4mg tablet, so they need compounding.',
    'Some patients can stop from 2mg.',
    'LAIB is not tapered here: step down to 8mg Weekly or 64mg Monthly, then stop; withdrawal comes 1-3 ' +
      'weeks (Weekly) or 5-10 weeks (Monthly) after the last dose.'
  ]
};

export const NSW_ODT_LABELS: Record<NswOdtMedicine, string> = {
  methadone: 'Methadone (oral liquid)',
  buprenorphine: 'Buprenorphine (sublingual)'
};

/**
 * The calculator settings for each medicine. The reduction is 5% every 14
 * days. 5% is the guide's own worked example, and it is the largest round
 * figure that fits every band: the tightest band, methadone 5-15mg, allows at
 * most 1mg, which is 6.7% of 15mg (a 10% default broke it at 13.5mg). Two
 * weeks is within "every 1-4 weeks or longer". Both are starting points the
 * clinician is expected to adjust.
 */
export function nswOdtPreset(
  medicine: NswOdtMedicine,
  doseMg: number | undefined,
  startDate: string
): { drug: DrugConfig; wean: WeanConfig } {
  if (medicine === 'methadone') {
    return {
      drug: {
        name: 'Methadone',
        currentDose: doseMg ?? 60,
        unit: 'mg',
        startDate,
        // Liquid for the whole taper; the tablet is listed only so the
        // calculator has one, and is not used while liquid is on.
        denominations: [{ id: 'nsw-methadone-10', strength: 10, canSplit: 'no' }],
        liquid: {
          enabled: true,
          mode: 'whole',
          switchBelowDose: 5,
          maxTabletDropPercent: 15,
          concentration: 5,
          measureIncrementMl: 0.1
        },
        dosesPerDay: 1,
        ec50: 0,
        emax: undefined
      },
      wean: {
        reductionType: 'percentage',
        reductionValue: 5,
        intervalDays: 14,
        minimumDoseThreshold: 1,
        reduceOnStartDate: false,
        rounding: 'nearest'
      }
    };
  }
  return {
    drug: {
      name: 'Buprenorphine',
      currentDose: doseMg ?? 8,
      unit: 'mg',
      startDate,
      denominations: [
        { id: 'nsw-bup-8', strength: 8, canSplit: 'no' },
        { id: 'nsw-bup-2', strength: 2, canSplit: 'no' },
        { id: 'nsw-bup-0.4', strength: 0.4, canSplit: 'no' }
      ],
      liquid: {
        enabled: false,
        mode: 'below',
        switchBelowDose: 2,
        maxTabletDropPercent: 15,
        concentration: 1,
        measureIncrementMl: 0.1
      },
      dosesPerDay: 1,
      ec50: 0,
      emax: undefined
    },
    wean: {
      reductionType: 'percentage',
      reductionValue: 5,
      intervalDays: 14,
      minimumDoseThreshold: 0.4,
      reduceOnStartDate: false,
      rounding: 'nearest'
    }
  };
}

/** Reads ?preset= from a link, e.g. from the SUD Toolkit. */
export function parseNswPreset(value: string | null): NswOdtMedicine | null {
  if (value === 'nsw-methadone') return 'methadone';
  if (value === 'nsw-buprenorphine') return 'buprenorphine';
  return null;
}

/** Which NSW medicine a drug name is, if either. */
export function nswMedicineForName(name: string): NswOdtMedicine | null {
  const n = name.trim().toLowerCase();
  if (n.startsWith('methadone')) return 'methadone';
  if (n.startsWith('buprenorphine') || n === 'subutex' || n === 'suboxone') return 'buprenorphine';
  return null;
}

export interface NswStepCheck {
  stepIndex: number;
  fromDose: number;
  toDose: number;
  drop: number;
  band: NswTaperBand;
  /** Bigger than the largest step the guide gives for the band. */
  tooFast: boolean;
  /** Days this dose is held before the drop; the guide says 1-4 weeks or longer. */
  heldDays: number;
  tooSoon: boolean;
}

/**
 * Checks each reduction in a plan against the band the dose was in before it.
 * The stop step is checked like any other: stopping from a dose larger than
 * the band's biggest step is flagged.
 */
export function checkAgainstNsw(medicine: NswOdtMedicine, steps: ScheduleStep[]): NswStepCheck[] {
  const checks: NswStepCheck[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const step = steps[i];
    const fromDose = prev.actualDose;
    const toDose = step.isStop ? 0 : step.actualDose;
    const drop = Math.round((fromDose - toDose) * 1000) / 1000;
    if (drop <= 0) continue;
    const band = nswBandFor(medicine, fromDose);
    if (!band) continue;
    checks.push({
      stepIndex: i,
      fromDose,
      toDose,
      drop,
      band,
      tooFast: drop > band.stepMg[1] + 1e-9,
      heldDays: prev.durationDays,
      tooSoon: prev.durationDays < 7
    });
  }
  return checks;
}
