/**
 * Receptor occupancy from dose, using the Michaelis–Menten (hyperbolic) model
 *
 *   occupancy = 100 x dose / (dose + EC50)
 *
 * where EC50 is the daily dose that occupies half the receptors. Its inverse,
 *
 *   dose = EC50 x occupancy / (100 - occupancy)
 *
 * turns an occupancy target back into a dose. Equal steps in occupancy need
 * ever-smaller steps in dose, which is why an occupancy-based taper is
 * hyperbolic.
 *
 * Canonical upstream bank:
 * https://github.com/Trent-Koessler/Psychopharmacology_visualiser/blob/main/ed50-bank.json
 */

export type DrugCategory =
  | 'Antidepressants (SSRIs, SNRIs & Atypicals)'
  | 'Antidepressants (TCAs & MAOIs)'
  | 'Antipsychotics (Second & Third Generation)'
  | 'Antipsychotics (First Generation)'
  | 'Benzodiazepines & Z-Drugs'
  | 'Gabapentinoids'
  | 'ADHD, Sedative & Rescue Agents';

export interface DrugReferenceEntry {
  id: string;
  name: string;
  drugClass: DrugCategory;
  ec50_mg: number;
  emax_pct: number;
  primaryTarget: string;
  secondaryTargets: string[];
  evidenceTier: string;
  citation: string;
  pmid: string | null;
  pbsDenominations: number[];
  defaultSplit: 'no' | 'half' | 'quarter';
  liquidConcentration_mg_ml: number | null;
  defaultDose_mg: number;
  minStopDose_mg: number;
  dosesPerDay: 1 | 2;
  clinicalNote: string;
}

export const CANONICAL_ED50_BANK_URL =
  'https://raw.githubusercontent.com/Trent-Koessler/Psychopharmacology_visualiser/main/ed50-bank.json';

export const VISUALISER_BASE_URL =
  'https://trent-koessler.github.io/Psychopharmacology_visualiser/';

export const DRUG_REFERENCE_BANK: Record<string, DrugReferenceEntry> = {
  // =========================================================================
  // Antidepressants (SSRIs, SNRIs & Atypicals)
  // =========================================================================
  Escitalopram: {
    id: 'escitalopram',
    name: 'Escitalopram',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 3.7,
    emax_pct: 82.0,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Sørensen et al., Mol Psychiatry 2022; Meyer et al., Am J Psychiatry 2004; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '34663904',
    pbsDenominations: [20, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 20,
    defaultDose_mg: 10,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: '10 mg achieves ~73% SERT occupancy; 5 mg still occupies ~57% SERT. Steps below 5 mg require quartered 10 mg tablets or 20 mg/mL oral drops.'
  },
  Citalopram: {
    id: 'citalopram',
    name: 'Citalopram',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 6.0,
    emax_pct: 81.4,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Sørensen et al., Mol Psychiatry 2022; Meyer et al., Am J Psychiatry 2004; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '15121647',
    pbsDenominations: [40, 20, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 40,
    defaultDose_mg: 20,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: '20 mg achieves ~77% SERT occupancy; R-citalopram allosterically modulates SERT dissociation.'
  },
  Sertraline: {
    id: 'sertraline',
    name: 'Sertraline',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 9.1,
    emax_pct: 85.5,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['DAT (~20% at 200 mg)'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Meyer et al., Am J Psychiatry 2004; Sørensen et al., Mol Psychiatry 2022; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '15121647',
    pbsDenominations: [100, 50],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 20,
    defaultDose_mg: 50,
    minStopDose_mg: 2.5,
    dosesPerDay: 1,
    clinicalNote: '50 mg achieves ~85% SERT occupancy; 25 mg (half of a 50 mg tablet) still occupies ~73% SERT. Quartered 50 mg tablets reach 12.5 mg (~58% occupancy) before switching to liquid.'
  },
  Fluoxetine: {
    id: 'fluoxetine',
    name: 'Fluoxetine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 4.5,
    emax_pct: 82.9,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['5-HT2C'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Meyer et al., Am J Psychiatry 2004; Sørensen et al., Mol Psychiatry 2022',
    pmid: '15121647',
    pbsDenominations: [20],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 4,
    defaultDose_mg: 20,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: 'Active metabolite norfluoxetine (t½ 4–16 days) provides a natural pharmacokinetic self-taper, though patients on long-term therapy still benefit from graded dose steps.'
  },
  Paroxetine: {
    id: 'paroxetine',
    name: 'Paroxetine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 5.0,
    emax_pct: 89.8,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['M1 (anticholinergic rebound)', 'NET'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Sørensen et al., Mol Psychiatry 2022; Meyer et al., Am J Psychiatry 2004; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '34663904',
    pbsDenominations: [20],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 2,
    defaultDose_mg: 20,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: 'Highest SSRI withdrawal risk: potent CYP2D6 autoinhibition reverses as dose drops below 10 mg, accelerating clearance alongside M1 cholinergic rebound.'
  },
  Fluvoxamine: {
    id: 'fluvoxamine',
    name: 'Fluvoxamine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 16.0,
    emax_pct: 82.0,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['Sigma-1'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Sørensen et al., Mol Psychiatry 2022; Suhara et al., Arch Gen Psychiatry 2003; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '34663904',
    pbsDenominations: [100, 50],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 5,
    defaultDose_mg: 100,
    minStopDose_mg: 2.5,
    dosesPerDay: 2,
    clinicalNote: 'Short half-life (~15 h) and non-linear pharmacokinetics; potent CYP1A2/CYP2C19 inhibition reverses during tapering.'
  },
  Venlafaxine: {
    id: 'venlafaxine',
    name: 'Venlafaxine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 17.5,
    emax_pct: 84.5,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['NET (recruited >=150 mg/day)'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Sørensen et al., Mol Psychiatry 2022; Meyer et al., Am J Psychiatry 2004; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '34663904',
    pbsDenominations: [150, 75, 37.5],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: 7.5,
    defaultDose_mg: 75,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: 'Smallest standard capsule (37.5 mg) still occupies ~68% SERT! Stopping at 37.5 mg drops occupancy from 68% to 0% overnight; bead-counting or compounded liquid is required.'
  },
  Desvenlafaxine: {
    id: 'desvenlafaxine',
    name: 'Desvenlafaxine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 14.3,
    emax_pct: 83.0,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['NET'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Sørensen et al., Mol Psychiatry 2022; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '34663904',
    pbsDenominations: [100, 50],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: 5,
    defaultDose_mg: 50,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: '50 mg matrix tablet occupies ~78% SERT; crushing destroys extended release and causes rapid peak/trough withdrawal. Cross-taper to venlafaxine beads or compounded suspension is often needed.'
  },
  Duloxetine: {
    id: 'duloxetine',
    name: 'Duloxetine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 8.5,
    emax_pct: 84.0,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['NET (ED50 ~45 mg)'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Takano et al., Psychopharmacology 2006; Sørensen et al., Mol Psychiatry 2022; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '16575553',
    pbsDenominations: [60, 30],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: 3,
    defaultDose_mg: 60,
    minStopDose_mg: 1.5,
    dosesPerDay: 1,
    clinicalNote: '30 mg enteric capsule still occupies ~78% SERT. Pellets are acid-labile and must not be crushed; taper via enteric micro-pellet counting in gelatin capsules.'
  },
  Vortioxetine: {
    id: 'vortioxetine',
    name: 'Vortioxetine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 8.0,
    emax_pct: 85.0,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['5-HT3', '5-HT1A', '5-HT7'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Areberg et al., J Psychopharmacol 2012; Sørensen et al., Mol Psychiatry 2022; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '22362815',
    pbsDenominations: [20, 10, 5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 20,
    defaultDose_mg: 10,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: 'Long elimination half-life (~66 h) buffers inter-dose fluctuations; 5 mg occupies ~38% SERT while 20 mg occupies >80% SERT.'
  },
  Vilazodone: {
    id: 'vilazodone',
    name: 'Vilazodone',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 10.0,
    emax_pct: 85.0,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['5-HT1A (partial agonist)'],
    evidenceTier: 'Tier 1: Human PET Imaging',
    citation: 'Rabiner et al., J Clin Psychopharmacol 2000; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '10770458',
    pbsDenominations: [40, 20, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 2,
    defaultDose_mg: 20,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: 'Must be taken with food (food doubles bioavailability); abrupt fasting drops effective exposure by 50%.'
  },
  Mirtazapine: {
    id: 'mirtazapine',
    name: 'Mirtazapine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 2.3,
    emax_pct: 92.0,
    primaryTarget: 'H1 (Histamine H1)',
    secondaryTargets: ['5-HT2A (ED50 ~11.5 mg)', 'alpha2A (ED50 ~33 mg)', '5-HT2C (ED50 ~6.5 mg)'],
    evidenceTier: 'Tier 1: Human PET & Maudsley Guidelines',
    citation: 'Sato et al., Psychopharmacology 2013; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '23443541',
    pbsDenominations: [45, 30, 15],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 15,
    defaultDose_mg: 15,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: 'H1 occupancy exceeds 85% even at 15 mg (ED50 ~2.3 mg). Rebound insomnia, nausea, and pruritus arise as dose drops below 7.5 mg down to 0.5 mg.'
  },
  Bupropion: {
    id: 'bupropion',
    name: 'Bupropion',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 500.0,
    emax_pct: 35.0,
    primaryTarget: 'DAT (Dopamine Transporter)',
    secondaryTargets: ['NET (via hydroxybupropion)', 'alpha3beta4 nAChR'],
    evidenceTier: 'Tier 1: Human PET Imaging',
    citation: 'Meyer et al., Psychopharmacology 2002; Learned-Coughlin et al., Biol Psychiatry 2003',
    pmid: '12172692',
    pbsDenominations: [150],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 150,
    minStopDose_mg: 37.5,
    dosesPerDay: 1,
    clinicalNote: 'At 150–300 mg/day, striatal DAT occupancy in human PET is modest (14–26%); SR/XL matrix tablets should not be crushed due to peak-related seizure threshold reduction.'
  },
  Trazodone: {
    id: 'trazodone',
    name: 'Trazodone',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 11.7,
    emax_pct: 94.0,
    primaryTarget: '5-HT2A',
    secondaryTargets: ['alpha1A (ED50 ~40 mg)', 'H1 (ED50 ~73 mg)', 'SERT (ED50 ~120 mg)'],
    evidenceTier: 'Tier 2: Human PET 5-HT2A / SERT & Maudsley Guidelines',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024; Stahl 2021',
    pmid: null,
    pbsDenominations: [100, 50],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 10,
    defaultDose_mg: 50,
    minStopDose_mg: 2.5,
    dosesPerDay: 1,
    clinicalNote: 'At hypnotic doses (25–100 mg), trazodone acts primarily as a 5-HT2A, alpha1A, and H1 antagonist; SERT blockade requires >=150 mg/day.'
  },
  Agomelatine: {
    id: 'agomelatine',
    name: 'Agomelatine',
    drugClass: 'Antidepressants (SSRIs, SNRIs & Atypicals)',
    ec50_mg: 0.25,
    emax_pct: 95.0,
    primaryTarget: 'MT1 / MT2 (Melatonin)',
    secondaryTargets: ['5-HT2C (ED50 ~63 mg)'],
    evidenceTier: 'Tier 2: Human PK/PD & Maudsley Guidelines',
    citation: 'De Bodinat et al., Nat Rev Drug Discov 2010; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '20616804',
    pbsDenominations: [25],
    defaultSplit: 'half',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 25,
    minStopDose_mg: 6.25,
    dosesPerDay: 1,
    clinicalNote: 'Ultra-short half-life (1–2 h) produces pulsatile nocturnal MT1/MT2 resynchronization without classical SERT withdrawal syndrome.'
  },

  // =========================================================================
  // Antidepressants (TCAs & MAOIs)
  // =========================================================================
  Amitriptyline: {
    id: 'amitriptyline',
    name: 'Amitriptyline',
    drugClass: 'Antidepressants (TCAs & MAOIs)',
    ec50_mg: 4.4,
    emax_pct: 95.0,
    primaryTarget: 'H1 (Histamine H1)',
    secondaryTargets: ['SERT (ED50 ~17.2 mg)', 'M1 (ED50 ~72 mg)', 'NET (via nortriptyline, ED50 ~17.6 mg)'],
    evidenceTier: 'Tier 2: Human PK/PD & Maudsley Guidelines',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024; Gillman, Br J Pharmacol 2007',
    pmid: '17471183',
    pbsDenominations: [50, 25, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 5,
    defaultDose_mg: 25,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: 'Tapering requires slow hyperbolic steps to prevent both serotonergic withdrawal and M1/H1 cholinergic-histaminergic rebound (insomnia, GI cramping, diaphoresis).'
  },
  Nortriptyline: {
    id: 'nortriptyline',
    name: 'Nortriptyline',
    drugClass: 'Antidepressants (TCAs & MAOIs)',
    ec50_mg: 17.6,
    emax_pct: 88.0,
    primaryTarget: 'NET (Norepinephrine Transporter)',
    secondaryTargets: ['H1 (ED50 ~40 mg)', 'M1 (ED50 ~148 mg)', 'SERT (ED50 ~72 mg)'],
    evidenceTier: 'Tier 1: Human PET NET Occupancy',
    citation: 'Sekine et al., Am J Psychiatry 2010; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '20478874',
    pbsDenominations: [25, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 2,
    defaultDose_mg: 25,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: 'Human [11C]MRB PET demonstrates NET ED50 ~17.6 mg/day (>70% NET occupancy at 50–75 mg/day); taper gradually to avoid adrenergic and cholinergic rebound.'
  },
  Clomipramine: {
    id: 'clomipramine',
    name: 'Clomipramine',
    drugClass: 'Antidepressants (TCAs & MAOIs)',
    ec50_mg: 2.7,
    emax_pct: 92.0,
    primaryTarget: 'SERT (5-HTT)',
    secondaryTargets: ['NET (via desmethylclomipramine, ED50 ~6.3 mg)', 'H1', 'M1'],
    evidenceTier: 'Tier 1: Human PET SERT Occupancy',
    citation: 'Suhara et al., Arch Gen Psychiatry 2003; Sørensen et al., Mol Psychiatry 2022; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '12672719',
    pbsDenominations: [25],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 5,
    defaultDose_mg: 25,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: 'Ultra-potent SERT blocker: human PET shows 10 mg/day already occupies ~80% SERT (ED50 ~2.67 mg). Requires liquid or compounded micro-doses below 10 mg.'
  },
  Doxepin: {
    id: 'doxepin',
    name: 'Doxepin',
    drugClass: 'Antidepressants (TCAs & MAOIs)',
    ec50_mg: 0.8,
    emax_pct: 97.0,
    primaryTarget: 'H1 (Histamine H1)',
    secondaryTargets: ['alpha1A (ED50 ~80 mg)', 'M1 (ED50 ~267 mg)', 'NET (ED50 ~97 mg)'],
    evidenceTier: 'Tier 1: Human PET H1 Occupancy',
    citation: 'Yanai et al., Br J Pharmacol 2011; Stahl 2021',
    pmid: '21585346',
    pbsDenominations: [50, 25, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 10,
    defaultDose_mg: 25,
    minStopDose_mg: 0.25,
    dosesPerDay: 1,
    clinicalNote: 'One of the most potent H1 antagonists known (Ki = 0.24 nM); even 3–6 mg occupies >80% of cortical H1 receptors. Taper down to <0.5 mg to prevent rebound insomnia.'
  },
  Moclobemide: {
    id: 'moclobemide',
    name: 'Moclobemide',
    drugClass: 'Antidepressants (TCAs & MAOIs)',
    ec50_mg: 120.0,
    emax_pct: 84.0,
    primaryTarget: 'MAO-A (Reversible RIMA)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Human [11C]Harmine PET',
    citation: 'Sacher et al., Arch Gen Psychiatry 2011; Fowler et al., J Neural Transm 2010',
    pmid: '21969460',
    pbsDenominations: [300, 150],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 300,
    minStopDose_mg: 18.75,
    dosesPerDay: 2,
    clinicalNote: '300–600 mg/day achieves ~74% brain MAO-A occupancy in human [11C]harmine PET; enzyme activity recovers within 24–48 h of cessation.'
  },

  // =========================================================================
  // Antipsychotics (Second & Third Generation)
  // =========================================================================
  Risperidone: {
    id: 'risperidone',
    name: 'Risperidone',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 1.2,
    emax_pct: 92.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['5-HT2A (ED50 ~0.12 mg)', 'alpha1A (ED50 ~0.8 mg)'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis (Maudsley Tapering)',
    citation: 'Lako et al., J Clin Psychopharmacol 2013; Horowitz et al., Schizophr Bull 2021',
    pmid: '33754644',
    pbsDenominations: [4, 3, 2, 1, 0.5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 2,
    minStopDose_mg: 0.125,
    dosesPerDay: 1,
    clinicalNote: 'Horowitz et al. (2021): 2 mg occupies ~63% D2, and 0.5 mg still occupies ~29% D2. Use 0.5 mg tablets quartered (0.125 mg) or 1 mg/mL oral solution for final steps to avoid dopamine supersensitivity psychosis.'
  },
  Paliperidone: {
    id: 'paliperidone',
    name: 'Paliperidone',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 2.4,
    emax_pct: 90.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['5-HT2A (ED50 ~0.25 mg)', 'alpha1A'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Arakawa et al., Psychopharmacology 2008; Lako et al., J Clin Psychopharmacol 2013; Horowitz et al., Schizophr Bull 2021',
    pmid: '18026719',
    pbsDenominations: [9, 6, 3],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 6,
    minStopDose_mg: 0.25,
    dosesPerDay: 1,
    clinicalNote: 'OROS osmotic tablet (3, 6, 9 mg) cannot be split or crushed; Maudsley guidelines recommend cross-switching to oral risperidone liquid (1 mg risperidone ≈ 2 mg paliperidone) for hyperbolic tapering.'
  },
  Olanzapine: {
    id: 'olanzapine',
    name: 'Olanzapine',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 4.5,
    emax_pct: 90.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['H1 (ED50 ~0.5 mg)', '5-HT2A (ED50 ~0.9 mg)', 'M1 (ED50 ~2.6 mg)'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis (Maudsley Tapering)',
    citation: 'Kapur et al., Am J Psychiatry 1998; Lako et al., J Clin Psychopharmacol 2013; Horowitz et al., Schizophr Bull 2021',
    pmid: '33754644',
    pbsDenominations: [10, 5, 2.5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 10,
    minStopDose_mg: 0.3125,
    dosesPerDay: 1,
    clinicalNote: '10 mg occupies ~69% D2 and >90% H1/5-HT2A. 2.5 mg still occupies ~36% D2 and ~83% H1; quartered 2.5 mg tablets (0.625 mg) or compounded liquid prevent severe cholinergic/histaminergic rebound insomnia and D2 supersensitivity.'
  },
  Quetiapine: {
    id: 'quetiapine',
    name: 'Quetiapine',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 38.0,
    emax_pct: 96.0,
    primaryTarget: 'H1 (Histamine H1)',
    secondaryTargets: ['5-HT2A (ED50 ~120 mg)', 'alpha1A (ED50 ~88 mg)', 'D2 (ED50 ~375 mg)'],
    evidenceTier: 'Tier 1: Human PET & Maudsley Guidelines',
    citation: 'Kapur et al., Arch Gen Psychiatry 2000; Lako et al., J Clin Psychopharmacol 2013; Horowitz et al., Schizophr Bull 2021',
    pmid: '33754644',
    pbsDenominations: [300, 200, 100, 25],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 20,
    defaultDose_mg: 100,
    minStopDose_mg: 3.125,
    dosesPerDay: 1,
    clinicalNote: 'At <150 mg/day, quetiapine is predominantly an H1 and alpha1A antagonist (H1 ED50 ~38 mg), whereas striatal D2 ED50 is ~375 mg. Low-dose tapering is governed by H1 rebound insomnia.'
  },
  Aripiprazole: {
    id: 'aripiprazole',
    name: 'Aripiprazole',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 0.7,
    emax_pct: 95.0,
    primaryTarget: 'D2 (Partial Agonist ~25% IA)',
    secondaryTargets: ['5-HT1A', '5-HT2A (ED50 ~7.3 mg)'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Yokoi et al., Neuropsychopharmacology 2002; Gründer et al., Am J Psychiatry 2008; Horowitz et al., Schizophr Bull 2021',
    pmid: '12093598',
    pbsDenominations: [30, 20, 15, 10, 5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 10,
    minStopDose_mg: 0.25,
    dosesPerDay: 1,
    clinicalNote: 'Ultra-high D2 affinity (ED50 ~0.7 mg): 2 mg/day already occupies ~74% of striatal D2 receptors! Long t½ (75–146 h) buffers inter-dose drops, but doses below 2 mg require 1 mg/mL liquid.'
  },
  Brexpiprazole: {
    id: 'brexpiprazole',
    name: 'Brexpiprazole',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 0.6,
    emax_pct: 92.0,
    primaryTarget: 'D2 (Partial Agonist ~18% IA)',
    secondaryTargets: ['5-HT1A (ED50 ~0.24 mg)', '5-HT2A (ED50 ~0.94 mg)'],
    evidenceTier: 'Tier 1: Human PET Imaging',
    citation: 'Girgis et al., Psychopharmacology 2020; Wong et al., J Psychopharmacol 2021',
    pmid: '31832720',
    pbsDenominations: [4, 3, 2, 1],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 2,
    minStopDose_mg: 0.125,
    dosesPerDay: 1,
    clinicalNote: '1 mg/day occupies ~63% of D2 and ~80% of 5-HT1A receptors; quartered 1 mg tablets (0.25 mg) reach ~29% D2 occupancy.'
  },
  Cariprazine: {
    id: 'cariprazine',
    name: 'Cariprazine',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 0.65,
    emax_pct: 94.0,
    primaryTarget: 'D2 / D3 (D3-Preferring Partial Agonist)',
    secondaryTargets: ['5-HT1A'],
    evidenceTier: 'Tier 1: Human [11C]PHNO PET',
    citation: 'Girgis et al., Biol Psychiatry 2016',
    pmid: '27016384',
    pbsDenominations: [6, 4.5, 3, 1.5],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 3,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: 'Active metabolite didesmethyl-cariprazine (DDCAR) has a 1–3 week terminal half-life, providing an intrinsic multi-week pharmacokinetic washout.'
  },
  Clozapine: {
    id: 'clozapine',
    name: 'Clozapine',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 312.5,
    emax_pct: 68.0,
    primaryTarget: 'D2 (Fast-Off Striatal D2)',
    secondaryTargets: ['H1 (ED50 ~3 mg)', 'M1 (ED50 ~15.5 mg)', '5-HT2A (ED50 ~13.5 mg)', 'alpha1A'],
    evidenceTier: 'Tier 1: Human PET & Maudsley Guidelines',
    citation: 'Farde et al., Arch Gen Psychiatry 1992; Kapur et al., Am J Psychiatry 1999; Horowitz et al., Schizophr Bull 2021',
    pmid: '33754644',
    pbsDenominations: [100, 50, 25],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 50,
    defaultDose_mg: 300,
    minStopDose_mg: 6.25,
    dosesPerDay: 2,
    clinicalNote: 'Clozapine withdrawal is driven by extreme M1 cholinergic (ED50 ~15.5 mg), H1 (ED50 ~3 mg), and 5-HT2A (ED50 ~13.5 mg) blockade rather than D2 alone. Rapid cessation risks severe cholinergic delirium and rebound psychosis.'
  },
  Amisulpride: {
    id: 'amisulpride',
    name: 'Amisulpride',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 140.0,
    emax_pct: 88.0,
    primaryTarget: 'D2 / D3 (Limbic-Selective)',
    secondaryTargets: ['5-HT7'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'La Fougère et al., J Nucl Med 2005; Lako et al., J Clin Psychopharmacol 2013; Horowitz et al., Schizophr Bull 2021',
    pmid: '15809491',
    pbsDenominations: [400, 200, 100],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 100,
    defaultDose_mg: 400,
    minStopDose_mg: 12.5,
    dosesPerDay: 2,
    clinicalNote: 'Poor blood-brain barrier penetration yields a peripheral-to-central gradient; 400 mg/day achieves ~74% striatal D2 occupancy.'
  },
  Lurasidone: {
    id: 'lurasidone',
    name: 'Lurasidone',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 25.8,
    emax_pct: 88.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['5-HT7 (ED50 ~7.7 mg)', '5-HT2A (ED50 ~31 mg)', '5-HT1A'],
    evidenceTier: 'Tier 1: Human PET Imaging',
    citation: 'Wong et al., Psychopharmacology 2013; Potkin et al., J Clin Psychopharmacol 2014',
    pmid: '23420113',
    pbsDenominations: [80, 40, 20],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 40,
    minStopDose_mg: 2.5,
    dosesPerDay: 1,
    clinicalNote: 'Must be taken with >=350 kcal food (doubles oral absorption); 40 mg with food achieves ~61% D2 occupancy and 80 mg achieves ~76% D2 occupancy.'
  },
  Ziprasidone: {
    id: 'ziprasidone',
    name: 'Ziprasidone',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 53.3,
    emax_pct: 85.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['5-HT2A (ED50 ~4.4 mg)', '5-HT1D', '5-HT1A'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis',
    citation: 'Mamo et al., Am J Psychiatry 2004; Lako et al., J Clin Psychopharmacol 2013',
    pmid: '14992979',
    pbsDenominations: [80, 60, 40, 20],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 80,
    minStopDose_mg: 5.0,
    dosesPerDay: 2,
    clinicalNote: 'Twice-daily dosing with >=500 kcal meals is essential (fasting cuts absorption by 50% and triggers inter-dose withdrawal).'
  },
  Asenapine: {
    id: 'asenapine',
    name: 'Asenapine',
    drugClass: 'Antipsychotics (Second & Third Generation)',
    ec50_mg: 2.9,
    emax_pct: 89.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['5-HT2A (ED50 ~0.16 mg)', 'H1 (ED50 ~2.2 mg)', 'alpha1A'],
    evidenceTier: 'Tier 1: Human PET Imaging',
    citation: 'de Greef et al., Neuropsychopharmacology 2011; Horowitz et al., Schizophr Bull 2021',
    pmid: '21160465',
    pbsDenominations: [10, 5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 10,
    minStopDose_mg: 0.3125,
    dosesPerDay: 2,
    clinicalNote: 'Sublingual wafer must be absorbed through oral mucosa (swallowing reduces bioavailability to <2%).'
  },

  // =========================================================================
  // Antipsychotics (First Generation)
  // =========================================================================
  Haloperidol: {
    id: 'haloperidol',
    name: 'Haloperidol',
    drugClass: 'Antipsychotics (First Generation)',
    ec50_mg: 0.55,
    emax_pct: 94.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['Sigma-1'],
    evidenceTier: 'Tier 1: Human PET Meta-Analysis (Maudsley Tapering)',
    citation: 'Kapur et al., Am J Psychiatry 1997; Lako et al., J Clin Psychopharmacol 2013; Horowitz et al., Schizophr Bull 2021',
    pmid: '33754644',
    pbsDenominations: [5, 1.5, 0.5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 2,
    defaultDose_mg: 2,
    minStopDose_mg: 0.05,
    dosesPerDay: 1,
    clinicalNote: 'Extremely steep low-dose D2 curve (ED50 ~0.55 mg): 2 mg occupies ~78% D2, and 0.5 mg still occupies ~48% D2! Requires 0.5 mg tablets quartered or 2 mg/mL oral drops down to 0.05 mg.'
  },
  Zuclopenthixol: {
    id: 'zuclopenthixol',
    name: 'Zuclopenthixol',
    drugClass: 'Antipsychotics (First Generation)',
    ec50_mg: 4.5,
    emax_pct: 92.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['D1', 'alpha1A', '5-HT2A'],
    evidenceTier: 'Tier 1: Human PET & Maudsley Guidelines',
    citation: 'Nyberg et al., Psychopharmacology 1995; Horowitz et al., Schizophr Bull 2021',
    pmid: '33754644',
    pbsDenominations: [25, 10, 2],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 20,
    defaultDose_mg: 20,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: '2 mg tablets quartered (0.5 mg) allow fine hyperbolic steps down to ~10% D2 occupancy.'
  },
  Flupentixol: {
    id: 'flupentixol',
    name: 'Flupentixol',
    drugClass: 'Antipsychotics (First Generation)',
    ec50_mg: 1.0,
    emax_pct: 92.0,
    primaryTarget: 'D2 (Striatal Dopamine D2)',
    secondaryTargets: ['D1', '5-HT2A'],
    evidenceTier: 'Tier 1: Human PET & Maudsley Guidelines',
    citation: 'Reimold et al., Psychopharmacology 2007; Horowitz et al., Schizophr Bull 2021',
    pmid: '33754644',
    pbsDenominations: [3, 0.5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 3,
    minStopDose_mg: 0.125,
    dosesPerDay: 1,
    clinicalNote: '1 mg/day occupies ~50% of striatal D2 receptors; quartered 0.5 mg tablets reach 0.125 mg (~11% D2 occupancy).'
  },
  Chlorpromazine: {
    id: 'chlorpromazine',
    name: 'Chlorpromazine',
    drugClass: 'Antipsychotics (First Generation)',
    ec50_mg: 27.3,
    emax_pct: 95.0,
    primaryTarget: 'H1 / alpha1A / D2',
    secondaryTargets: ['D2 (ED50 ~123 mg)', 'alpha1A (ED50 ~26.4 mg)', 'M1 (ED50 ~305 mg)'],
    evidenceTier: 'Tier 1: Human PET & Maudsley Guidelines',
    citation: 'Horowitz et al., Schizophr Bull 2021; Lako et al., J Clin Psychopharmacol 2013',
    pmid: '33754644',
    pbsDenominations: [100, 25, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 5,
    defaultDose_mg: 100,
    minStopDose_mg: 2.5,
    dosesPerDay: 2,
    clinicalNote: 'Low-potency phenothiazine with potent alpha1A/H1 blockade (ED50 ~27 mg) and striatal D2 ED50 ~123 mg; taper slowly to avoid autonomic, histaminergic, and cholinergic rebound.'
  },

  // =========================================================================
  // Benzodiazepines & Z-Drugs
  // =========================================================================
  Diazepam: {
    id: 'diazepam',
    name: 'Diazepam',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 24.7,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Deprescribing Guidelines (Horowitz & Taylor 2024)',
    citation: 'Horowitz & Taylor, The Maudsley Deprescribing Guidelines (Wiley-Blackwell 2024), Benzodiazepine Tapering Tables',
    pmid: null,
    pbsDenominations: [5, 2],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 10,
    minStopDose_mg: 0.5,
    dosesPerDay: 2,
    clinicalNote: 'Every receptor-occupancy figure in the Maudsley diazepam tables fits Occupancy = 100 × Dose / (Dose + 24.7). Long active metabolite desmethyldiazepam (t½ up to 100 h) smooths inter-dose troughs.'
  },
  Clonazepam: {
    id: 'clonazepam',
    name: 'Clonazepam',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 1.25,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Guidelines & Human BZD Equivalence',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024; Ashton Manual',
    pmid: null,
    pbsDenominations: [2, 0.5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 2.5,
    defaultDose_mg: 1,
    minStopDose_mg: 0.025,
    dosesPerDay: 2,
    clinicalNote: 'High potency (0.5 mg clonazepam ≈ 10 mg diazepam): 0.5 mg occupies ~29% of BZD sites. Use PBS 2.5 mg/mL oral drops (0.1 mg per drop) or cross-taper to diazepam for final steps.'
  },
  Lorazepam: {
    id: 'lorazepam',
    name: 'Lorazepam',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 2.5,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Human [11C]Flumazenil PET & Maudsley Guidelines',
    citation: 'Lingford-Hughes et al., Psychopharmacology 2002; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '12172694',
    pbsDenominations: [2.5, 1],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 2,
    defaultDose_mg: 2,
    minStopDose_mg: 0.05,
    dosesPerDay: 2,
    clinicalNote: 'Intermediate t½ (~12 h) without active metabolites (UGT2B15 glucuronidation) causes inter-dose rebound anxiety; split twice daily or cross-taper to diazepam (1 mg lorazepam ≈ 10 mg diazepam).'
  },
  Alprazolam: {
    id: 'alprazolam',
    name: 'Alprazolam',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 1.2,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Guidelines & Human BZD Equivalence',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024; Fujita et al., 1999',
    pmid: null,
    pbsDenominations: [2, 1, 0.5, 0.25],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 1,
    minStopDose_mg: 0.025,
    dosesPerDay: 2,
    clinicalNote: 'Rapid absorption and short t½ (~11 h) produce steep inter-dose withdrawal peaks; quartered 0.25 mg tablets (0.0625 mg) or cross-tapering to diazepam are recommended.'
  },
  Temazepam: {
    id: 'temazepam',
    name: 'Temazepam',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 49.4,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Deprescribing Guidelines (2:1 Diazepam Equivalence)',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: null,
    pbsDenominations: [10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 2,
    defaultDose_mg: 10,
    minStopDose_mg: 1.0,
    dosesPerDay: 1,
    clinicalNote: '10 mg temazepam ≈ 5 mg diazepam (~17% BZD occupancy); quartered 10 mg tablets reach 2.5 mg (~4.8% occupancy) before cessation.'
  },
  Oxazepam: {
    id: 'oxazepam',
    name: 'Oxazepam',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 74.1,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Deprescribing Guidelines (3:1 Diazepam Equivalence)',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: null,
    pbsDenominations: [30, 15],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 30,
    minStopDose_mg: 1.875,
    dosesPerDay: 2,
    clinicalNote: 'Direct glucuronidation (LOT); 15 mg oxazepam ≈ 5 mg diazepam. Quartered 15 mg tablets allow steps down to 3.75 mg (~4.8% occupancy).'
  },
  Nitrazepam: {
    id: 'nitrazepam',
    name: 'Nitrazepam',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 24.7,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Deprescribing Guidelines (1:1 Diazepam Equivalence)',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: null,
    pbsDenominations: [5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 0.5,
    defaultDose_mg: 5,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: '5 mg nitrazepam ≈ 5 mg diazepam (~17% BZD occupancy); long half-life (~26 h) permits direct tablet quartering down to 1.25 mg.'
  },
  Zolpidem: {
    id: 'zolpidem',
    name: 'Zolpidem',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 49.4,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (alpha1-Selective BZD Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Deprescribing Guidelines (2:1 Diazepam Equivalence)',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024; Abadie et al., Eur J Pharmacol 1996',
    pmid: null,
    pbsDenominations: [10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 10,
    minStopDose_mg: 1.25,
    dosesPerDay: 1,
    clinicalNote: 'Ultra-short half-life (~2.5 h) causes rapid nocturnal rebound insomnia upon abrupt cessation; taper via quartered 10 mg tablets.'
  },
  Zopiclone: {
    id: 'zopiclone',
    name: 'Zopiclone',
    drugClass: 'Benzodiazepines & Z-Drugs',
    ec50_mg: 37.0,
    emax_pct: 100.0,
    primaryTarget: 'GABA-A (BZD Allosteric Site)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Maudsley Deprescribing Guidelines (1.5:1 Diazepam Equivalence)',
    citation: 'Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: null,
    pbsDenominations: [7.5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 7.5,
    minStopDose_mg: 0.9375,
    dosesPerDay: 1,
    clinicalNote: '7.5 mg zopiclone ≈ 5 mg diazepam; quartered 7.5 mg tablets provide 1.875 mg increments down to ~4.8% BZD occupancy.'
  },

  // =========================================================================
  // Gabapentinoids
  // =========================================================================
  Pregabalin: {
    id: 'pregabalin',
    name: 'Pregabalin',
    drugClass: 'Gabapentinoids',
    ec50_mg: 165.0,
    emax_pct: 100.0,
    primaryTarget: 'alpha2delta-1 VGCC (Voltage-Gated Ca2+ Channel)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Human Clinical PK/PD & Maudsley Guidelines',
    citation: 'Bockbrader et al., Clin Pharmacokinet 2010; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '20818832',
    pbsDenominations: [300, 150, 75, 25],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: 20,
    defaultDose_mg: 150,
    minStopDose_mg: 5.0,
    dosesPerDay: 2,
    clinicalNote: 'Linear GI absorption via LAT1; 150 mg/day achieves ~48% alpha2delta-1 occupancy and 300 mg/day achieves ~65%. Open capsules into water or use 20 mg/mL oral solution below 25 mg.'
  },
  Gabapentin: {
    id: 'gabapentin',
    name: 'Gabapentin',
    drugClass: 'Gabapentinoids',
    ec50_mg: 885.0,
    emax_pct: 100.0,
    primaryTarget: 'alpha2delta-1 VGCC (Saturable LAT1 Absorption)',
    secondaryTargets: [],
    evidenceTier: 'Tier 1: Human Clinical PK/PD (Bockbrader et al. 2010)',
    citation: 'Bockbrader et al., Clin Pharmacokinet 2010; Horowitz & Taylor, Maudsley Deprescribing Guidelines 2024',
    pmid: '20818832',
    pbsDenominations: [800, 600, 400, 300, 100],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: 50,
    defaultDose_mg: 900,
    minStopDose_mg: 25.0,
    dosesPerDay: 2,
    clinicalNote: 'Saturable L-amino acid transporter (LAT1) absorption means bioavailability rises from ~27% at 3600 mg/day to ~60% at <=300 mg/day! Low-dose steps represent a larger proportional drop in plasma concentration than high-dose steps.'
  },

  // =========================================================================
  // ADHD, Sedative & Rescue Agents
  // =========================================================================
  Methylphenidate: {
    id: 'methylphenidate',
    name: 'Methylphenidate',
    drugClass: 'ADHD, Sedative & Rescue Agents',
    ec50_mg: 17.5,
    emax_pct: 85.0,
    primaryTarget: 'DAT (Striatal Dopamine Transporter)',
    secondaryTargets: ['NET'],
    evidenceTier: 'Tier 1: Human [11C]Cocaine PET',
    citation: 'Volkow et al., Am J Psychiatry 1998; Spencer et al., Biol Psychiatry 2006',
    pmid: '9756613',
    pbsDenominations: [10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 20,
    minStopDose_mg: 2.5,
    dosesPerDay: 2,
    clinicalNote: 'Volkow et al. (1998) human PET showed oral methylphenidate ED50 = 0.25 mg/kg (~17.5 mg in a 70 kg adult) for striatal DAT blockade.'
  },
  Dexamfetamine: {
    id: 'dexamphetamine',
    name: 'Dexamfetamine',
    drugClass: 'ADHD, Sedative & Rescue Agents',
    ec50_mg: 14.0,
    emax_pct: 90.0,
    primaryTarget: 'DAT / NET / VMAT2',
    secondaryTargets: ['TAAR1'],
    evidenceTier: 'Tier 2: Human PET & Clinical PK/PD',
    citation: 'Schouw et al., Eur Neuropsychopharmacol 2013; Stahl 2021',
    pmid: '23453165',
    pbsDenominations: [5],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 10,
    minStopDose_mg: 1.25,
    dosesPerDay: 2,
    clinicalNote: '5 mg scored PBS tablets can be quartered into 1.25 mg increments to prevent post-stimulant crash, hypersomnia, and anhedonia.'
  },
  Atomoxetine: {
    id: 'atomoxetine',
    name: 'Atomoxetine',
    drugClass: 'ADHD, Sedative & Rescue Agents',
    ec50_mg: 12.1,
    emax_pct: 92.0,
    primaryTarget: 'NET (Norepinephrine Transporter)',
    secondaryTargets: ['SERT (weak)'],
    evidenceTier: 'Tier 1: Human [11C]MRB PET',
    citation: 'Gallezot et al., NeuroImage 2011; Logan et al., Nucl Med Biol 2007',
    pmid: '21130881',
    pbsDenominations: [100, 80, 60, 40, 25, 18, 10],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: 4,
    defaultDose_mg: 40,
    minStopDose_mg: 5.0,
    dosesPerDay: 1,
    clinicalNote: 'Human PET shows near-maximal (>80%) locus coeruleus and thalamic NET occupancy at 40–80 mg/day; CYP2D6 poor metabolizers experience 5-fold higher exposure.'
  },
  Clonidine: {
    id: 'clonidine',
    name: 'Clonidine',
    drugClass: 'ADHD, Sedative & Rescue Agents',
    ec50_mg: 0.133,
    emax_pct: 95.0,
    primaryTarget: 'alpha2A (Presynaptic Autoreceptor)',
    secondaryTargets: ['Imidazoline I1'],
    evidenceTier: 'Tier 2: Human Hemodynamic/Autonomic PK/PD',
    citation: 'Davies et al., Br J Clin Pharmacol 1977; Stahl 2021',
    pmid: '849428',
    pbsDenominations: [0.15, 0.1],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 0.01,
    defaultDose_mg: 0.15,
    minStopDose_mg: 0.025,
    dosesPerDay: 2,
    clinicalNote: 'CRITICAL REBOUND HYPERTENSION RISK: Never cease clonidine abruptly; sympathetic surge from upregulated presynaptic alpha2A autoreceptors requires hyperbolic quarter-tablet steps.'
  },
  Guanfacine: {
    id: 'guanfacine',
    name: 'Guanfacine',
    drugClass: 'ADHD, Sedative & Rescue Agents',
    ec50_mg: 1.07,
    emax_pct: 92.0,
    primaryTarget: 'alpha2A (Postsynaptic PFC Selective)',
    secondaryTargets: [],
    evidenceTier: 'Tier 2: Human Clinical PK/PD',
    citation: 'Arnsten et al., CNS Drugs 2007; Boellner et al., J Clin Pharmacol 2007',
    pmid: '17592927',
    pbsDenominations: [4, 3, 2, 1],
    defaultSplit: 'no',
    liquidConcentration_mg_ml: null,
    defaultDose_mg: 2,
    minStopDose_mg: 0.5,
    dosesPerDay: 1,
    clinicalNote: 'Extended-release matrix tablets (1, 2, 3, 4 mg) must not be crushed; step down by 1 mg increments every 3–7 days to avoid rebound tachycardia and blood pressure elevation.'
  },
  Promethazine: {
    id: 'promethazine',
    name: 'Promethazine',
    drugClass: 'ADHD, Sedative & Rescue Agents',
    ec50_mg: 4.5,
    emax_pct: 96.0,
    primaryTarget: 'H1 (Histamine H1)',
    secondaryTargets: ['M1 (ED50 ~44 mg)', 'alpha1A'],
    evidenceTier: 'Tier 1: Human [11C]Doxepin PET',
    citation: 'Tashiro et al., Br J Clin Pharmacol 2008; Yanai et al., 2011',
    pmid: '18507657',
    pbsDenominations: [25, 10],
    defaultSplit: 'quarter',
    liquidConcentration_mg_ml: 1,
    defaultDose_mg: 25,
    minStopDose_mg: 1.25,
    dosesPerDay: 1,
    clinicalNote: 'Single 25 mg dose occupies >75% of cortical H1 receptors in human PET; chronic nightly use causes H1 upregulation and rebound insomnia upon abrupt cessation.'
  }
};

/**
 * Daily doses giving 50% occupancy for drugs with a published value, in mg.
 *
 * Diazepam (GABA-A): every receptor-occupancy figure in the Maudsley diazepam
 * tables (Horowitz & Taylor, 2024) fits this model with an EC50 between 24.4
 * and 25.0mg/day, the spread being the book's rounding to one decimal place.
 */
export const KNOWN_EC50_MG: { [drugName: string]: number } = Object.fromEntries(
  Object.entries(DRUG_REFERENCE_BANK).map(([name, entry]) => [name, entry.ec50_mg])
);

/** Case-insensitive lookup of a drug in DRUG_REFERENCE_BANK by name or id. */
export function getDrugReference(nameOrId: string): DrugReferenceEntry | undefined {
  if (!nameOrId) return undefined;
  if (DRUG_REFERENCE_BANK[nameOrId]) return DRUG_REFERENCE_BANK[nameOrId];
  const needle = nameOrId.trim().toLowerCase();
  return Object.values(DRUG_REFERENCE_BANK).find(
    entry =>
      entry.name.toLowerCase() === needle ||
      entry.id.toLowerCase() === needle ||
      (needle === 'dexamphetamine' && entry.id === 'dexamphetamine')
  );
}

/** Deep-link URL to open a drug and dose in the 18-Receptor Psychopharmacology Visualiser. */
export function buildVisualiserUrl(nameOrId: string, doseMg?: number): string {
  const ref = getDrugReference(nameOrId);
  const drugParam = ref ? ref.id : nameOrId.trim().toLowerCase();
  const params = new URLSearchParams();
  if (drugParam) params.set('drug', drugParam);
  if (doseMg !== undefined && Number.isFinite(doseMg) && doseMg > 0) {
    params.set('dose', String(doseMg));
  }
  const qs = params.toString();
  return qs ? `${VISUALISER_BASE_URL}?${qs}` : VISUALISER_BASE_URL;
}

/** Whether an EC50 has been entered that the model can use. */
export const hasEC50 = (ec50: number | undefined): ec50 is number =>
  ec50 !== undefined && Number.isFinite(ec50) && ec50 > 0;

/** Percentage of receptors occupied at a daily dose. */
export function receptorOccupancy(dose: number, ec50: number): number {
  if (!(dose > 0)) return 0;
  return (100 * dose) / (dose + ec50);
}

/** The daily dose that gives an occupancy, in percent. Zero at or below 0%. */
export function doseForOccupancy(occupancy: number, ec50: number): number {
  if (!(occupancy > 0)) return 0;
  if (occupancy >= 100) return Infinity;
  return (ec50 * occupancy) / (100 - occupancy);
}
