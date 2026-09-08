/**
 * The three example diazepam taper regimens published in
 * *The Maudsley Deprescribing Guidelines* (Horowitz & Taylor, Wiley, 2024),
 * chapter 3, 'Safe Deprescribing of Benzodiazepines and Z-drugs'.
 *
 * Transcribed verbatim from the source tables so the app can show a clinician
 * what the published guidance actually prescribes, next to the plan HyperTaper
 * has generated. Nothing here is computed: the doses and the receptor-occupancy
 * figures are the book's, not ours. `services/weaningLogic.ts` remains the only
 * place a taper is calculated.
 *
 * The guidelines are explicit that these are examples and not prescriptive —
 * see `MAUDSLEY_NOTES` below, which is surfaced alongside the tables in the UI.
 */

/** How a step's dose is to be made up, per the book's 'Form' column. */
export type MaudsleyForm = 'tablets' | 'half-tablets' | 'quarter-tablets' | 'liquid' | 'stop';

export interface MaudsleyStep {
  /** Step number as printed in the source table. */
  step: number;
  /** GABA-A receptor occupancy at this dose, percent. */
  ro: number;
  am: number;
  pm: number;
  /** Total daily dose in mg. AM + PM. */
  total: number;
  form: MaudsleyForm;
  /**
   * The book footnotes this step to say a liquid formulation could be used
   * instead of splitting tablets.
   */
  liquidAlternative?: boolean;
}

export interface MaudsleyRegimen {
  id: 'faster' | 'moderate' | 'slower';
  /** The book's label, e.g. 'A. A faster taper'. */
  label: string;
  title: string;
  /** Maximum drop in receptor occupancy between consecutive steps, in percentage points. */
  occupancyStep: number;
  /** The book's own one-line description of the regimen. */
  description: string;
  /** Footnotes printed beneath the source table. */
  footnotes: string[];
  steps: MaudsleyStep[];
}

export const MAUDSLEY_DIAZEPAM_REGIMENS: MaudsleyRegimen[] = [
  {
    id: 'faster',
    label: 'A. A faster taper',
    title: 'Faster',
    occupancyStep: 5,
    description:
      "Up to 5 percentage points of GABA-A occupancy between each step, with reductions made every 1-4 weeks.",
    footnotes: [
      "Patients who have been on the medication for only a few weeks will probably be able to taper more quickly and might follow every second or third step of this regimen and make reductions every few days or so. Normally the duration of the taper should not be longer than the period that the patient has been on the drug for people who have only taken it for a few weeks. However, the FDA has issued an alert regarding dependence and withdrawal from benzodiazepines indicating that some people can experience withdrawal effects after just a few days of use, therefore necessitating slower tapering.",
      "Alternatively, a liquid formulation of the drug could be used for these doses.",
    ],
    steps: [
    { step: 1, ro: 70.8, am: 30, pm: 30, total: 60, form: 'tablets' },
    { step: 2, ro: 69, am: 25, pm: 30, total: 55, form: 'tablets' },
    { step: 3, ro: 66.9, am: 25, pm: 25, total: 50, form: 'tablets' },
    { step: 4, ro: 64.6, am: 20, pm: 25, total: 45, form: 'tablets' },
    { step: 5, ro: 61.8, am: 20, pm: 20, total: 40, form: 'tablets' },
    { step: 6, ro: 59.3, am: 18, pm: 18, total: 36, form: 'tablets' },
    { step: 7, ro: 56.4, am: 16, pm: 16, total: 32, form: 'tablets' },
    { step: 8, ro: 53.1, am: 14, pm: 14, total: 28, form: 'tablets' },
    { step: 9, ro: 49.3, am: 12, pm: 12, total: 24, form: 'tablets' },
    { step: 10, ro: 44.7, am: 10, pm: 10, total: 20, form: 'tablets' },
    { step: 11, ro: 42.2, am: 9, pm: 9, total: 18, form: 'tablets' },
    { step: 12, ro: 39.3, am: 8, pm: 8, total: 16, form: 'tablets' },
    { step: 13, ro: 36.2, am: 7, pm: 7, total: 14, form: 'tablets' },
    { step: 14, ro: 32.7, am: 6, pm: 6, total: 12, form: 'tablets' },
    { step: 15, ro: 28.8, am: 5, pm: 5, total: 10, form: 'tablets' },
    { step: 16, ro: 24.5, am: 4, pm: 4, total: 8, form: 'tablets' },
    { step: 17, ro: 22.1, am: 3, pm: 4, total: 7, form: 'half-tablets', liquidAlternative: true },
    { step: 18, ro: 19.5, am: 3, pm: 3, total: 6, form: 'half-tablets', liquidAlternative: true },
    { step: 19, ro: 16.8, am: 2, pm: 3, total: 5, form: 'half-tablets', liquidAlternative: true },
    { step: 20, ro: 13.9, am: 2, pm: 2, total: 4, form: 'tablets' },
    { step: 21, ro: 10.8, am: 1, pm: 2, total: 3, form: 'half-tablets', liquidAlternative: true },
    { step: 22, ro: 7.5, am: 1, pm: 1, total: 2, form: 'half-tablets', liquidAlternative: true },
    { step: 23, ro: 3.9, am: 0.5, pm: 0.5, total: 1, form: 'quarter-tablets', liquidAlternative: true },
    { step: 24, ro: 0, am: 0, pm: 0, total: 0, form: 'stop' },
    ]
  },
  {
    id: 'moderate',
    label: 'B. A moderate taper',
    title: 'Moderate',
    occupancyStep: 2.5,
    description:
      "Up to 2.5 percentage points of GABA-A occupancy between each step, with reductions made every 1-4 weeks.",
    footnotes: [
      "Alternatively, a liquid formulation of the drug could be used for these doses. Or, a slightly higher dose could be taken at night using half tablets. E.g. 8mg morning and 9mg night to make up 17mg total, using half tablets.",
    ],
    steps: [
    { step: 1, ro: 70.8, am: 30, pm: 30, total: 60, form: 'tablets' },
    { step: 2, ro: 69.4, am: 28, pm: 28, total: 56, form: 'tablets' },
    { step: 3, ro: 67.8, am: 26, pm: 26, total: 52, form: 'tablets' },
    { step: 4, ro: 66, am: 24, pm: 24, total: 48, form: 'tablets' },
    { step: 5, ro: 64, am: 22, pm: 22, total: 44, form: 'tablets' },
    { step: 6, ro: 61.8, am: 20, pm: 20, total: 40, form: 'tablets' },
    { step: 7, ro: 60.6, am: 19, pm: 19, total: 38, form: 'tablets' },
    { step: 8, ro: 59.3, am: 18, pm: 18, total: 36, form: 'tablets' },
    { step: 9, ro: 57.9, am: 17, pm: 17, total: 34, form: 'tablets' },
    { step: 10, ro: 56.4, am: 16, pm: 16, total: 32, form: 'tablets' },
    { step: 11, ro: 54.8, am: 15, pm: 15, total: 30, form: 'tablets' },
    { step: 12, ro: 53.1, am: 14, pm: 14, total: 28, form: 'tablets' },
    { step: 13, ro: 51.3, am: 13, pm: 13, total: 26, form: 'tablets' },
    { step: 14, ro: 49.3, am: 12, pm: 12, total: 24, form: 'tablets' },
    { step: 15, ro: 47.1, am: 11, pm: 11, total: 22, form: 'tablets' },
    { step: 16, ro: 44.7, am: 10, pm: 10, total: 20, form: 'tablets' },
    { step: 17, ro: 43.5, am: 9.5, pm: 9.5, total: 19, form: 'quarter-tablets', liquidAlternative: true },
    { step: 18, ro: 42.2, am: 9, pm: 9, total: 18, form: 'tablets' },
    { step: 19, ro: 40.8, am: 8.5, pm: 8.5, total: 17, form: 'quarter-tablets', liquidAlternative: true },
    { step: 20, ro: 39.3, am: 8, pm: 8, total: 16, form: 'tablets' },
    { step: 21, ro: 37.8, am: 7.5, pm: 7.5, total: 15, form: 'quarter-tablets', liquidAlternative: true },
    { step: 22, ro: 36.2, am: 7, pm: 7, total: 14, form: 'tablets' },
    { step: 23, ro: 34.5, am: 6.5, pm: 6.5, total: 13, form: 'quarter-tablets', liquidAlternative: true },
    { step: 24, ro: 32.7, am: 6, pm: 6, total: 12, form: 'tablets' },
    { step: 25, ro: 30.8, am: 5.5, pm: 5.5, total: 11, form: 'quarter-tablets', liquidAlternative: true },
    { step: 26, ro: 28.8, am: 5, pm: 5, total: 10, form: 'tablets' },
    { step: 27, ro: 26.7, am: 4.5, pm: 4.5, total: 9, form: 'quarter-tablets', liquidAlternative: true },
    { step: 28, ro: 24.5, am: 4, pm: 4, total: 8, form: 'tablets' },
    { step: 29, ro: 23.3, am: 3.5, pm: 4, total: 7.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 30, ro: 22.1, am: 3.5, pm: 3.5, total: 7, form: 'quarter-tablets', liquidAlternative: true },
    { step: 31, ro: 20.8, am: 3, pm: 3.5, total: 6.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 32, ro: 19.5, am: 3, pm: 3, total: 6, form: 'half-tablets', liquidAlternative: true },
    { step: 33, ro: 18.2, am: 2.5, pm: 3, total: 5.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 34, ro: 16.8, am: 2.5, pm: 2.5, total: 5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 35, ro: 15.4, am: 2, pm: 2.5, total: 4.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 36, ro: 13.9, am: 2, pm: 2, total: 4, form: 'tablets' },
    { step: 37, ro: 12.4, am: 1.5, pm: 2, total: 3.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 38, ro: 10.8, am: 1.5, pm: 1.5, total: 3, form: 'quarter-tablets', liquidAlternative: true },
    { step: 39, ro: 9.2, am: 1, pm: 1.5, total: 2.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 40, ro: 7.5, am: 1, pm: 1, total: 2, form: 'half-tablets', liquidAlternative: true },
    { step: 41, ro: 5.7, am: 0.5, pm: 1, total: 1.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 42, ro: 3.9, am: 0.5, pm: 0.5, total: 1, form: 'quarter-tablets', liquidAlternative: true },
    { step: 43, ro: 2, am: 0, pm: 0.5, total: 0.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 44, ro: 0, am: 0, pm: 0, total: 0, form: 'stop' },
    ]
  },
  {
    id: 'slower',
    label: 'C. A slower taper',
    title: 'Slower',
    occupancyStep: 1.3,
    description:
      "Up to 1.3 percentage points of GABA-A occupancy between each step, with reductions made every 1-4 weeks. The book directs a switch to a liquid formulation once tablets can no longer make the dose.",
    footnotes: [
      "Alternatively, a liquid formulation of the drug could be used for these doses. Or, a slightly higher dose could be taken at night using half tablets where this is possible. E.g. 8mg morning and 9mg night to make up 17mg total, using half tablets.",
      "See the guideline's notes on the manufacturer's liquid or off-label options.",
    ],
    steps: [
    { step: 1, ro: 70.8, am: 30, pm: 30, total: 60, form: 'tablets' },
    { step: 2, ro: 70.1, am: 28, pm: 30, total: 58, form: 'tablets' },
    { step: 3, ro: 69.4, am: 28, pm: 28, total: 56, form: 'tablets' },
    { step: 4, ro: 68.6, am: 26, pm: 28, total: 54, form: 'tablets' },
    { step: 5, ro: 67.8, am: 26, pm: 26, total: 52, form: 'tablets' },
    { step: 6, ro: 66.9, am: 24, pm: 26, total: 50, form: 'tablets' },
    { step: 7, ro: 66, am: 24, pm: 24, total: 48, form: 'tablets' },
    { step: 8, ro: 65.1, am: 22, pm: 24, total: 46, form: 'tablets' },
    { step: 9, ro: 64, am: 22, pm: 22, total: 44, form: 'tablets' },
    { step: 10, ro: 63, am: 20, pm: 22, total: 42, form: 'tablets' },
    { step: 11, ro: 61.8, am: 20, pm: 20, total: 40, form: 'tablets' },
    { step: 12, ro: 61.2, am: 19, pm: 20, total: 39, form: 'tablets' },
    { step: 13, ro: 60.6, am: 19, pm: 19, total: 38, form: 'tablets' },
    { step: 14, ro: 60, am: 18, pm: 19, total: 37, form: 'tablets' },
    { step: 15, ro: 59.3, am: 18, pm: 18, total: 36, form: 'tablets' },
    { step: 16, ro: 58.6, am: 17, pm: 18, total: 35, form: 'tablets' },
    { step: 17, ro: 57.9, am: 17, pm: 17, total: 34, form: 'tablets' },
    { step: 18, ro: 57.2, am: 16, pm: 17, total: 33, form: 'tablets' },
    { step: 19, ro: 56.4, am: 16, pm: 16, total: 32, form: 'tablets' },
    { step: 20, ro: 55.7, am: 15, pm: 16, total: 31, form: 'tablets' },
    { step: 21, ro: 54.8, am: 15, pm: 15, total: 30, form: 'tablets' },
    { step: 22, ro: 54, am: 14, pm: 15, total: 29, form: 'tablets' },
    { step: 23, ro: 53.1, am: 14, pm: 14, total: 28, form: 'tablets' },
    { step: 24, ro: 52.2, am: 13, pm: 14, total: 27, form: 'tablets' },
    { step: 25, ro: 51.3, am: 13, pm: 13, total: 26, form: 'tablets' },
    { step: 26, ro: 50.3, am: 12, pm: 13, total: 25, form: 'tablets' },
    { step: 27, ro: 49.3, am: 12, pm: 12, total: 24, form: 'tablets' },
    { step: 28, ro: 48.2, am: 11, pm: 12, total: 23, form: 'tablets' },
    { step: 29, ro: 47.1, am: 11, pm: 11, total: 22, form: 'tablets' },
    { step: 30, ro: 46, am: 10, pm: 11, total: 21, form: 'tablets' },
    { step: 31, ro: 44.7, am: 10, pm: 10, total: 20, form: 'tablets' },
    { step: 32, ro: 44.1, am: 9.5, pm: 10, total: 19.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 33, ro: 43.5, am: 9.5, pm: 9.5, total: 19, form: 'quarter-tablets', liquidAlternative: true },
    { step: 34, ro: 42.8, am: 9, pm: 9.5, total: 18.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 35, ro: 42.2, am: 9, pm: 9, total: 18, form: 'tablets' },
    { step: 36, ro: 41.5, am: 8.5, pm: 9, total: 17.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 37, ro: 40.8, am: 8.5, pm: 8.5, total: 17, form: 'quarter-tablets', liquidAlternative: true },
    { step: 38, ro: 40, am: 8, pm: 8.5, total: 16.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 39, ro: 39.3, am: 8, pm: 8, total: 16, form: 'tablets' },
    { step: 40, ro: 38.6, am: 7.5, pm: 8, total: 15.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 41, ro: 37.8, am: 7.5, pm: 7.5, total: 15, form: 'quarter-tablets', liquidAlternative: true },
    { step: 42, ro: 37, am: 7, pm: 7.5, total: 14.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 43, ro: 36.2, am: 7, pm: 7, total: 14, form: 'tablets' },
    { step: 44, ro: 35.3, am: 6.5, pm: 7, total: 13.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 45, ro: 34.5, am: 6.5, pm: 6.5, total: 13, form: 'quarter-tablets', liquidAlternative: true },
    { step: 46, ro: 33.6, am: 6, pm: 6.5, total: 12.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 47, ro: 32.7, am: 6, pm: 6, total: 12, form: 'tablets' },
    { step: 48, ro: 31.8, am: 5.5, pm: 6, total: 11.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 49, ro: 30.8, am: 5.5, pm: 5.5, total: 11, form: 'quarter-tablets', liquidAlternative: true },
    { step: 50, ro: 29.8, am: 5, pm: 5.5, total: 10.5, form: 'quarter-tablets', liquidAlternative: true },
    { step: 51, ro: 28.8, am: 5, pm: 5, total: 10, form: 'tablets' },
    { step: 52, ro: 28, am: 4.8, pm: 4.8, total: 9.6, form: 'liquid' },
    { step: 53, ro: 27.1, am: 4.6, pm: 4.6, total: 9.2, form: 'liquid' },
    { step: 54, ro: 26.3, am: 4.4, pm: 4.4, total: 8.8, form: 'liquid' },
    { step: 55, ro: 25.4, am: 4.2, pm: 4.2, total: 8.4, form: 'liquid' },
    { step: 56, ro: 24.5, am: 4, pm: 4, total: 8, form: 'liquid' },
    { step: 57, ro: 23.5, am: 3.8, pm: 3.8, total: 7.6, form: 'liquid' },
    { step: 58, ro: 22.6, am: 3.6, pm: 3.6, total: 7.2, form: 'liquid' },
    { step: 59, ro: 21.6, am: 3.4, pm: 3.4, total: 6.8, form: 'liquid' },
    { step: 60, ro: 20.6, am: 3.2, pm: 3.2, total: 6.4, form: 'liquid' },
    { step: 61, ro: 19.5, am: 3, pm: 3, total: 6, form: 'liquid' },
    { step: 62, ro: 18.5, am: 2.8, pm: 2.8, total: 5.6, form: 'liquid' },
    { step: 63, ro: 17.4, am: 2.6, pm: 2.6, total: 5.2, form: 'liquid' },
    { step: 64, ro: 16.3, am: 2.4, pm: 2.4, total: 4.8, form: 'liquid' },
    { step: 65, ro: 15.1, am: 2.2, pm: 2.2, total: 4.4, form: 'liquid' },
    { step: 66, ro: 13.9, am: 2, pm: 2, total: 4, form: 'liquid' },
    { step: 67, ro: 13.3, am: 1.9, pm: 1.9, total: 3.8, form: 'liquid' },
    { step: 68, ro: 12.7, am: 1.8, pm: 1.8, total: 3.6, form: 'liquid' },
    { step: 69, ro: 12.1, am: 1.7, pm: 1.7, total: 3.4, form: 'liquid' },
    { step: 70, ro: 11.5, am: 1.6, pm: 1.6, total: 3.2, form: 'liquid' },
    { step: 71, ro: 10.8, am: 1.5, pm: 1.5, total: 3, form: 'liquid' },
    { step: 72, ro: 10.2, am: 1.4, pm: 1.4, total: 2.8, form: 'liquid' },
    { step: 73, ro: 9.5, am: 1.3, pm: 1.3, total: 2.6, form: 'liquid' },
    { step: 74, ro: 8.9, am: 1.2, pm: 1.2, total: 2.4, form: 'liquid' },
    { step: 75, ro: 8.2, am: 1.1, pm: 1.1, total: 2.2, form: 'liquid' },
    { step: 76, ro: 7.5, am: 1, pm: 1, total: 2, form: 'liquid' },
    { step: 77, ro: 6.8, am: 0.9, pm: 0.9, total: 1.8, form: 'liquid' },
    { step: 78, ro: 6.1, am: 0.8, pm: 0.8, total: 1.6, form: 'liquid' },
    { step: 79, ro: 5.4, am: 0.7, pm: 0.7, total: 1.4, form: 'liquid' },
    { step: 80, ro: 4.6, am: 0.6, pm: 0.6, total: 1.2, form: 'liquid' },
    { step: 81, ro: 3.9, am: 0.5, pm: 0.5, total: 1, form: 'liquid' },
    { step: 82, ro: 3.1, am: 0.4, pm: 0.4, total: 0.8, form: 'liquid' },
    { step: 83, ro: 2.4, am: 0.3, pm: 0.3, total: 0.6, form: 'liquid' },
    { step: 84, ro: 1.6, am: 0.2, pm: 0.2, total: 0.4, form: 'liquid' },
    { step: 85, ro: 0.8, am: 0.1, pm: 0.1, total: 0.2, form: 'liquid' },
    { step: 86, ro: 0, am: 0, pm: 0, total: 0, form: 'stop' },
    ]
  },
];

/** Diazepam tablet strengths listed as available in the guideline. */
export const MAUDSLEY_TABLET_STRENGTHS = [10, 5, 2];

/**
 * The context a clinician needs to read the tables safely. Condensed from the
 * guideline's 'Deprescribing notes' and surrounding text; the wording is close
 * to the source because the caveats are the clinically load-bearing part.
 */
export const MAUDSLEY_NOTES: { heading: string; body: string }[] = [
  {
    heading: 'These are examples, not prescriptions',
    body:
      'None of these regimens should be seen as prescriptive - patients should not be compelled to adhere ' +
      'strictly to them. They are example regimens and are not "set and forget", but should be modified to ' +
      'ensure withdrawal symptoms stay tolerable throughout. Intermediate steps halfway between the doses ' +
      "listed can be added to make a more gradual taper. Ultimately it is the patient's experience of " +
      'withdrawal that should guide the rate of taper.'
  },
  {
    heading: 'When to make the next reduction',
    body:
      'Each reduction should be made once the withdrawal symptoms from the previous one have largely ' +
      'resolved, so that reductions do not accumulate. Aim for a rate that produces tolerable symptoms ' +
      'abating within a week or two, which puts reductions about every 1-4 weeks. If symptoms are ' +
      'moderately severe or take longer than a couple of weeks to resolve, postpone the next reduction and ' +
      'then taper more gradually. If severe withdrawal symptoms occur, return to a higher dose, wait for ' +
      'symptoms to resolve, and taper more slowly thereafter.'
  },
  {
    heading: 'Why the steps are hyperbolic',
    body:
      'The relationship between diazepam dose and GABA-A receptor occupancy is hyperbolic. Linear dose ' +
      'reductions (60mg, 45mg, 30mg, 15mg, 0mg) therefore cause increasingly large reductions in effect, ' +
      'and increasingly severe withdrawal. Equal-sized reductions in receptor occupancy require ' +
      'hyperbolically reducing doses, which is what the RO (%) column tracks.'
  },
  {
    heading: 'Available formulations',
    body:
      'Tablets: 2mg, 5mg and 10mg (UK, Europe, USA, Australia, Canada). Oral solutions vary by country - ' +
      '5mg/mL and 5mg/5mL (USA), 2mg/5mL (UK), 10mg/mL (Europe), 10mg/10mL (Australia). Where no suitable ' +
      'liquid is available, the guideline notes off-label options: diazepam tablets can be dispersed in ' +
      'water, or a compounding pharmacy can prepare suspensions, smaller capsules or tapering strips.'
  },
  {
    heading: 'An even slower taper',
    body:
      'Some patients cannot taper at the slowest rate shown here and need smaller decrements again, ' +
      'lengthening the overall taper. Such a regimen is built by placing intermediate steps within ' +
      'regimen C - for example 60mg, 58mg, 56mg becomes 60mg, 59mg, 58mg, 57mg, 56mg.'
  },
  {
    heading: 'Micro-tapering',
    body:
      'These tables reduce at intervals of 1-4 weeks. An alternative is micro-tapering: very small ' +
      'reductions made every day, calculated by dividing each step change by 14 or 28 days. The moderate ' +
      'regimen going 60mg to 56mg over 14 days is equivalent to 0.3mg per day, or 0.15mg per dose when ' +
      'dosed twice daily. By the end of that taper the rate falls to about 0.04mg a day.'
  }
];

export const MAUDSLEY_CITATION =
  'Horowitz M, Taylor D. The Maudsley Deprescribing Guidelines: Antidepressants, Benzodiazepines, ' +
  'Gabapentinoids and Z-drugs. Wiley, 2024. Chapter 3: Safe Deprescribing of Benzodiazepines and Z-drugs.';

export const getMaudsleyRegimen = (id: string): MaudsleyRegimen | undefined =>
  MAUDSLEY_DIAZEPAM_REGIMENS.find(regimen => regimen.id === id);

/**
 * The regimen laid out on a calendar so it can be drawn against a generated
 * plan. The book gives step *numbers*, not dates: it says only that reductions
 * are made 'every 1-4 weeks'. Placing them therefore needs an interval to be
 * chosen, and we use the one the plan itself is using, so the two curves are
 * compared on the same reduction cadence rather than an arbitrary one.
 */
export const maudsleyCurve = (
  regimen: MaudsleyRegimen,
  intervalDays: number
): { dayIndex: number; dose: number }[] =>
  regimen.steps.map((step, index) => ({
    dayIndex: index * Math.max(1, intervalDays),
    dose: step.total
  }));
