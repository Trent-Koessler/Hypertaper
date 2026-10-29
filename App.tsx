import React, { useState, useEffect, useMemo } from 'react';
import { Pill, Calculator, Calendar, Info, AlertCircle, AlertTriangle, Plus, Trash2, Printer, Scissors, Sun, Moon, Copy, Check, Droplet } from 'lucide-react';
import { DrugConfig, WeanConfig, Denomination, ScheduleStep, LiquidConfig, DoseBreakdown, DoseRounding } from './types';
import { generateSchedule } from './services/weaningLogic';
import { KNOWN_EC50_MG, DRUG_REFERENCE_BANK, DrugCategory, getDrugReference, buildVisualiserUrl, hasEC50, receptorOccupancy } from './services/occupancy';
import { addDaysISO, formatDMY, formatISODate, todayISO } from './services/dateUtils';
import WeanChart from './components/WeanChart';
import TabletVisualizer from './components/TabletVisualizer';
import CalculationBreakdown from './components/CalculationBreakdown';
import MathsExplainer from './components/MathsExplainer';
import RoundingExplainer from './components/RoundingExplainer';
import MaudsleyReference from './components/MaudsleyReference';
import PatientHandout from './components/PatientHandout';
import AppIcon from './components/AppIcon';
import NumberInput from './components/NumberInput';
import {
  MAUDSLEY_TABLET_STRENGTHS,
  MaudsleyRegimen,
  getMaudsleyRegimen,
  maudsleyCurve
} from './services/maudsleyDiazepam';

const DRUG_CATEGORIES: DrugCategory[] = [
  'Benzodiazepines & Z-Drugs',
  'Antidepressants (SSRIs, SNRIs & Atypicals)',
  'Antidepressants (TCAs & MAOIs)',
  'Antipsychotics (Second & Third Generation)',
  'Antipsychotics (First Generation)',
  'Gabapentinoids',
  'ADHD, Sedative & Rescue Agents'
];

const COMMON_DRUGS = [
  ...Object.keys(DRUG_REFERENCE_BANK),
  "Other"
];

type ResultTab = 'chart' | 'schedule' | 'handout' | 'maudsley';

const RESULT_TABS: { id: ResultTab; label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'handout', label: 'Patient handout' },
  { id: 'maudsley', label: 'Maudsley' }
];

const createId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `denom-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

const readStoredTheme = (): boolean => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); fall through.
  }
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/** How each rounding mode is named and explained in the settings. */
const ROUNDING_TEXT: Record<DoseRounding, { label: string; description: string; summary: string }> = {
  below: {
    label: 'Stay under',
    description: 'Never above the curve. Each drop comes as soon as the curve passes below the current dose.',
    summary: 'Each step uses the largest dose the available tablets can make without exceeding the target.'
  },
  nearest: {
    label: 'Nearest',
    description: 'Uses whichever dose is closest to the curve. Some steps sit a little above it.',
    summary: 'Each step uses the achievable dose closest to the target, which may be slightly above it.'
  },
  hold: {
    label: 'Hold longer',
    description: 'Stays on each dose until the curve reaches the next one down. Steps sit on or above the curve.',
    summary: 'Each dose is held until the target reaches the next achievable dose down.'
  }
};

/** Formats a tablet count, hiding the decimals on whole numbers. */
const formatCount = (count: number): string => count.toFixed(count % 1 === 0 ? 0 : 2);

/** Bottles to supply for a liquid volume, or null when no bottle size is set. */
const bottleCount = (totalMl: number, liquid?: LiquidConfig): number | null =>
  liquid?.bottleSizeMl && liquid.bottleSizeMl > 0 ? Math.ceil(totalMl / liquid.bottleSizeMl - 1e-9) : null;

/** Whole tablets to supply for a count that may include cut pieces. */
const supplyCount = (count: number): number => Math.ceil(count - 1e-9);


/** Rounds a dose for display without leaving trailing zeros (12.5 not 12.5000). */
const formatDose = (value: number, decimals = 2): string =>
  String(parseFloat(value.toFixed(decimals)));

/** "2x 50mg, 1x 25mg" (or "1.8mL of 1mg/mL liquid") for a dose, optionally scaled over the whole step. */
const describeTablets = (
  dose: Pick<ScheduleStep, 'tablets' | 'liquidMl'> | DoseBreakdown,
  denominations: Denomination[],
  unit: string,
  multiplier = 1,
  liquid?: LiquidConfig,
  showSupply = false
): string =>
  dose.liquidMl && liquid
    ? `${formatDose(dose.liquidMl * multiplier, 3)}mL of ${formatDose(liquid.concentration, 3)}${unit}/mL liquid`
    : Object.entries(dose.tablets)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const denom = denominations.find(d => d.id === id);
      const total = count * multiplier;
      if (!denom) return '';
      const supply = showSupply && supplyCount(total) !== total ? ` (supply ${supplyCount(total)})` : '';
      return `${formatCount(total)}x ${denom.strength}${unit}${supply}`;
    })
    .filter(Boolean)
    .join(', ') || 'none';

/** The EC50 to start from when a drug is chosen: a published value, or 0 for unknown. */
const knownEC50 = (name: string, unit: string): number => {
  const ref = getDrugReference(name);
  const mg = ref ? ref.ec50_mg : KNOWN_EC50_MG[name];
  if (mg === undefined) return 0;
  return unit === 'mcg' ? mg * 1000 : mg;
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const describeDuration = (days: number): string => {
  if (days % 7 === 0 && days >= 7) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
};

const App: React.FC = () => {
  const [drug, setDrug] = useState<DrugConfig>({
    name: 'Diazepam',
    // 10mg is a common starting point for a benzodiazepine taper, and quartered
    // 2mg tablets take it down to 0.5mg without a steeper-than-requested step.
    currentDose: 10,
    unit: 'mg',
    startDate: todayISO(),
    denominations: [
      { id: '1', strength: 5, canSplit: 'quarter' },
      { id: '2', strength: 2, canSplit: 'quarter' }
    ],
    // Off by default. Diazepam Elixir is 1mg/mL in Australia.
    liquid: {
      enabled: false,
      mode: 'below',
      switchBelowDose: 2,
      maxTabletDropPercent: 15,
      concentration: 1,
      measureIncrementMl: 0.1,
      bottleSizeMl: 100
    },
    // Diazepam is usually divided morning and night, as in the Maudsley tables.
    dosesPerDay: 2,
    splitPreference: 'even',
    ec50: KNOWN_EC50_MG.Diazepam
  });

  const [wean, setWean] = useState<WeanConfig>({
    reductionType: 'percentage',
    reductionValue: 10,
    intervalDays: 14,
    minimumDoseThreshold: 0.5,
    reduceOnStartDate: false,
    // Tracks the curve most closely; steps may sit a little above it.
    rounding: 'nearest'
  });

  const [isCustomDrug, setIsCustomDrug] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [activeTab, setActiveTab] = useState<ResultTab>('chart');
  /** Whether the Schedule tab and EMR text include each dose's receptor occupancy. */
  const [showOccupancy, setShowOccupancy] = useState(false);

  /** Inactive panels are hidden on screen only, so printing still includes them. */
  const panelClass = (tab: ResultTab): string =>
    activeTab === tab ? 'space-y-6' : 'hidden print:block space-y-6';
  const [isDarkMode, setIsDarkMode] = useState(readStoredTheme);
  /** Published regimen drawn on the chart for comparison, by id, or null for none. */
  const [overlaidRegimenId, setOverlaidRegimenId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // Persisting the preference is best-effort.
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const drugParam = params.get('drug') || params.get('drugId');
      const doseParam = Number(params.get('dose'));
      const ec50Param = Number(params.get('ec50'));
      const unitParam = params.get('unit') === 'mcg' ? 'mcg' : 'mg';
      const minDoseParam = Number(params.get('minDose'));
      const modeParam = params.get('mode');

      if (drugParam) {
        const ref = getDrugReference(drugParam);
        if (ref) {
          setIsCustomDrug(false);
          const scale = unitParam === 'mcg' ? 1000 : 1;
          const resolvedEc50 =
            Number.isFinite(ec50Param) && ec50Param > 0
              ? ec50Param
              : ref.ec50_mg * scale;
          const resolvedDose =
            Number.isFinite(doseParam) && doseParam > 0
              ? doseParam
              : ref.defaultDose_mg * scale;

          setDrug(prev => ({
            ...prev,
            name: ref.name,
            unit: unitParam,
            currentDose: resolvedDose,
            ec50: resolvedEc50,
            dosesPerDay: ref.dosesPerDay,
            denominations: ref.pbsDenominations.map((strength, idx) => ({
              id: `pbs-${ref.id}-${idx}`,
              strength: strength * scale,
              canSplit: ref.defaultSplit
            })),
            liquid: prev.liquid
              ? {
                  ...prev.liquid,
                  concentration:
                    ref.liquidConcentration_mg_ml !== null
                      ? ref.liquidConcentration_mg_ml * scale
                      : prev.liquid.concentration
                }
              : prev.liquid
          }));

          setWean(prev => ({
            ...prev,
            minimumDoseThreshold:
              Number.isFinite(minDoseParam) && minDoseParam > 0
                ? minDoseParam
                : ref.minStopDose_mg * scale,
            reductionType: modeParam === 'occupancy' ? 'occupancy' : prev.reductionType
          }));
          if (modeParam === 'occupancy') {
            setShowOccupancy(true);
          }
        } else {
          setIsCustomDrug(true);
          setDrug(prev => ({
            ...prev,
            name: drugParam,
            unit: unitParam,
            currentDose: Number.isFinite(doseParam) && doseParam > 0 ? doseParam : prev.currentDose,
            ec50: Number.isFinite(ec50Param) && ec50Param > 0 ? ec50Param : 0
          }));
        }
      }
    } catch {
      // Ignore malformed URL query parameters
    }
  }, []);

  // Derived, not stored: a stale schedule can never outlive an invalid input.
  const schedule = useMemo(() => generateSchedule(drug, wean), [drug, wean]);
  const hasSchedule = schedule.steps.length > 0;

  const referenceCurve = useMemo(() => {
    const regimen = overlaidRegimenId ? getMaudsleyRegimen(overlaidRegimenId) : undefined;
    if (!regimen) return null;
    return {
      name: `Maudsley ${regimen.title.toLowerCase()} taper`,
      points: maudsleyCurve(regimen, wean.intervalDays)
    };
  }, [overlaidRegimenId, wean.intervalDays]);

  /**
   * Sets up the calculator to start where a published regimen starts, using the
   * tablet strengths the guideline lists as available. The schedule itself is
   * still generated from the user's own taper settings — the table is a
   * reference, not a plan to be replayed.
   */
  const loadMaudsleyRegimen = (regimen: MaudsleyRegimen) => {
    setIsCustomDrug(false);
    setDrug(prev => ({
      ...prev,
      name: 'Diazepam',
      unit: 'mg',
      ec50: KNOWN_EC50_MG.Diazepam,
      currentDose: regimen.steps[0].total,
      denominations: MAUDSLEY_TABLET_STRENGTHS.map((strength, index) => ({
        id: `maudsley-${index}`,
        strength,
        canSplit: 'quarter' as const
      }))
    }));
  };

  const toggleMaudsleyOverlay = (regimen: MaudsleyRegimen) => {
    // Turning the overlay on jumps to the chart, where the comparison is drawn.
    if (overlaidRegimenId !== regimen.id) setActiveTab('chart');
    setOverlaidRegimenId(current => (current === regimen.id ? null : regimen.id));
  };

  const addDenom = () => {
    setDrug(prev => ({
      ...prev,
      denominations: [...prev.denominations, { id: createId(), strength: 0, canSplit: 'quarter' }]
    }));
  };

  const removeDenom = (id: string) => {
    setDrug(prev => ({ ...prev, denominations: prev.denominations.filter(d => d.id !== id) }));
  };

  const updateDenom = <K extends keyof Denomination>(id: string, field: K, value: Denomination[K]) => {
    setDrug(prev => ({
      ...prev,
      denominations: prev.denominations.map(d => (d.id === id ? { ...d, [field]: value } : d))
    }));
  };

  const updateLiquid = <K extends keyof LiquidConfig>(field: K, value: LiquidConfig[K]) => {
    setDrug(prev => prev.liquid ? { ...prev, liquid: { ...prev.liquid, [field]: value } } : prev);
  };

  const liquid = drug.liquid;
  const liquidOn = !!liquid?.enabled;
  const liquidOnly = liquidOn && liquid!.mode === 'whole';
  const twiceDaily = drug.dosesPerDay === 2;
  const rounding = wean.rounding ?? 'below';
  const ec50 = hasEC50(drug.ec50) ? drug.ec50 : null;
  const occupancyTaper = wean.reductionType === 'occupancy';
  const occupancyShown = showOccupancy && ec50 !== null;
  const reductionText = occupancyTaper
    ? `${wean.reductionValue} occupancy points`
    : wean.reductionType === 'percentage' ? `${wean.reductionValue}%` : `${wean.reductionValue}${drug.unit}`;

  /**
   * Switching method also sets the schedule's occupancy tick-box: an occupancy
   * taper is read in occupancy, the others in dose. It can still be changed by hand.
   */
  const chooseReductionType = (reductionType: WeanConfig['reductionType']) => {
    setWean(prev => ({ ...prev, reductionType }));
    setShowOccupancy(reductionType === 'occupancy');
  };

  const handleDrugChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'Other') {
      setIsCustomDrug(true);
      setDrug(prev => ({ ...prev, name: '', ec50: 0 }));
    } else {
      setIsCustomDrug(false);
      const ref = getDrugReference(val);
      if (ref) {
        const scale = drug.unit === 'mcg' ? 1000 : 1;
        setDrug(prev => ({
          ...prev,
          name: ref.name,
          currentDose: ref.defaultDose_mg * scale,
          ec50: ref.ec50_mg * scale,
          dosesPerDay: ref.dosesPerDay,
          denominations: ref.pbsDenominations.map((strength, idx) => ({
            id: `pbs-${ref.id}-${idx}`,
            strength: strength * scale,
            canSplit: ref.defaultSplit
          })),
          liquid: prev.liquid
            ? {
                ...prev.liquid,
                concentration:
                  ref.liquidConcentration_mg_ml !== null
                    ? ref.liquidConcentration_mg_ml * scale
                    : prev.liquid.concentration
              }
            : prev.liquid
        }));
        setWean(prev => ({
          ...prev,
          minimumDoseThreshold: ref.minStopDose_mg * scale
        }));
      } else {
        setDrug(prev => ({ ...prev, name: val, ec50: knownEC50(val, prev.unit) }));
      }
    }
  };

  const printSchedule = () => {
    window.print();
  };

  // The EMR copy is a list of short blocks, one per step, rather than a table:
  // padded columns fall apart when pasted into a note in a proportional font.
  // Each block's lines are joined with soft line breaks (<br>) in the HTML copy
  // and newlines in the plain-text copy, with a blank line between blocks.
  const emrBlocks = useMemo((): string[][] => {
    if (!hasSchedule) return [];
    const blocks: string[][] = [];

    const header = [
      'Medication Taper Plan',
      `Drug: ${drug.name || '(unnamed)'}`,
      `Start dose: ${drug.currentDose}${drug.unit}`,
      `Reduction: ${reductionText} every ${wean.intervalDays} days`,
      `Stop dose: ${wean.minimumDoseThreshold}${drug.unit}`,
      `Dosing: ${twiceDaily ? `twice daily (morning and night, ${drug.splitPreference === 'fewest' ? 'fewest pieces' : 'even doses'})` : 'once daily'}`
    ];
    if (occupancyShown) {
      header.push(`Receptor occupancy: estimated as 100 x dose / (dose + ${ec50}${drug.unit}), the dose for 50% occupancy (EC50)`);
    }
    if (rounding !== 'below') header.push(`When tablets can't match the target: ${ROUNDING_TEXT[rounding].label.toLowerCase()} (${ROUNDING_TEXT[rounding].summary})`);
    if (wean.reduceOnStartDate) header.push(`First reduction: on the start date (${formatDMY(drug.startDate)})`);
    if (liquidOn) {
      header.push(`Liquid: ${liquid!.concentration}${drug.unit}/mL, measured to ${liquid!.measureIncrementMl}mL, `
        + (liquidOnly
          ? 'for the whole taper'
          : liquid!.mode === 'tolerance'
            ? `once a tablet step would drop by more than ${liquid!.maxTabletDropPercent}%`
            : `for doses below ${liquid!.switchBelowDose}${drug.unit}`));
    }
    blocks.push(header);

    schedule.steps.forEach((step, index) => {
      // dd-mm-yyyy reads the same on every machine, unlike a locale-dependent date.
      const from = formatDMY(step.date);
      if (step.isStop) {
        blocks.push([`Step ${index + 1}: from ${from}`, 'STOP - cease medication']);
        return;
      }

      const to = formatDMY(addDaysISO(step.date, step.durationDays - 1));
      const occupancy = occupancyShown ? ` (occupancy ${formatDose(receptorOccupancy(step.actualDose, ec50!), 1)}%)` : '';
      const lines = [
        `Step ${index + 1}: ${from} to ${to} (${describeDuration(step.durationDays)})`,
        `${formatDose(step.actualDose, 3)}${drug.unit} daily${occupancy}`
      ];
      if (step.split) {
        lines.push(`Morning: ${formatDose(step.split.am.dose, 3)}${drug.unit} = ${describeTablets(step.split.am, drug.denominations, drug.unit, 1, liquid)}`);
        lines.push(`Night: ${formatDose(step.split.pm.dose, 3)}${drug.unit} = ${describeTablets(step.split.pm, drug.denominations, drug.unit, 1, liquid)}`);
      } else {
        lines.push(`Take: ${describeTablets(step, drug.denominations, drug.unit, 1, liquid)} once daily`);
      }
      lines.push(`Step total: ${describeTablets(step, drug.denominations, drug.unit, step.durationDays, liquid, true)}`);
      blocks.push(lines);
    });

    if (schedule.endReason === 'truncated') {
      blocks.push(['*** INCOMPLETE PLAN - the taper had not reached the stop dose when the schedule was cut off. ***']);
    }

    const totals = ['Total medication required for full plan:'];
    Object.entries(schedule.totalTablets).forEach(([id, count]: [string, number]) => {
      const denom = drug.denominations.find(d => d.id === id);
      if (denom) {
        totals.push(`- ${formatCount(count)}x ${denom.strength}${drug.unit} tablets taken`
          + (supplyCount(count) !== count ? ` (supply ${supplyCount(count)} whole tablets)` : ''));
      }
    });
    if (schedule.totalLiquidMl > 0 && liquid) {
      const bottles = bottleCount(schedule.totalLiquidMl, liquid);
      totals.push(`- ${formatDose(schedule.totalLiquidMl, 2)}mL of ${liquid.concentration}${drug.unit}/mL liquid`
        + (bottles !== null ? ` (supply ${bottles} x ${liquid.bottleSizeMl}mL bottle${bottles === 1 ? '' : 's'})` : ''));
    }
    blocks.push(totals);

    if (schedule.warnings.length > 0) {
      blocks.push(['Notes:', ...schedule.warnings.map(warning => `- ${warning}`)]);
    }

    return blocks;
  }, [schedule, drug, wean, hasSchedule, liquid, liquidOn, liquidOnly, twiceDaily, rounding, ec50, occupancyShown, reductionText]);

  const emrText = useMemo(() => emrBlocks.map(lines => lines.join('\n')).join('\n\n'), [emrBlocks]);
  const emrHtml = useMemo(
    () => emrBlocks.map(lines => `<p>${lines.map(escapeHtml).join('<br>')}</p>`).join(''),
    [emrBlocks]
  );

  const copyEmrText = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      // Rich-text editors take the HTML copy, where each step's lines are soft
      // line breaks inside one paragraph; plain-text fields take the text copy.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([emrText], { type: 'text/plain' }),
            'text/html': new Blob([emrHtml], { type: 'text/html' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(emrText);
      }
      setCopyState('copied');
    } catch {
      // Fails on insecure origins and when the user denies permission.
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 2500);
  };

  const heldSteps = schedule.steps.filter(step => !step.isStop);
  // When the first reduction is on the start date, a plan can stop straight from
  // the current dose with no held step left; the stop step records that dose.
  const stopStep = schedule.steps.find(step => step.isStop);
  const finalDose = heldSteps.length > 0
    ? heldSteps[heldSteps.length - 1].actualDose
    : stopStep?.reductionFromPrevious ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 transition-colors duration-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AppIcon className="w-9 h-9" />
            <h1 className="text-xl font-bold tracking-tight text-teal-900 dark:text-teal-50">
              Hyper<span className="text-teal-600 dark:text-teal-400">Taper</span>
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-4">
            <MathsExplainer />
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={printSchedule} className="flex items-center gap-2 text-sm font-medium bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white px-3 sm:px-3.5 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap" aria-label="Print plan">
              <Printer size={16} />
              <span className="hidden sm:inline">Print plan</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column: Configuration */}
        <div className="lg:col-span-4 space-y-6 print:hidden">

          {/* Drug Details Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-4 text-teal-800 dark:text-teal-400">
              <Pill className="w-5 h-5" />
              <h2 className="font-semibold text-lg">Medication Details</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="drug-name" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Drug Name</label>
                {!isCustomDrug ? (
                  <select
                    id="drug-name"
                    value={COMMON_DRUGS.includes(drug.name) ? drug.name : 'Other'}
                    onChange={handleDrugChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  >
                    {DRUG_CATEGORIES.map(category => (
                      <optgroup key={category} label={category}>
                        {Object.values(DRUG_REFERENCE_BANK)
                          .filter(entry => entry.drugClass === category)
                          .map(entry => (
                            <option key={entry.name} value={entry.name}>
                              {entry.name} (ED50: {entry.ec50_mg}mg · {entry.primaryTarget.split(' ')[0]})
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    <option value="Other">Other (custom medication)</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      id="drug-name"
                      type="text"
                      value={drug.name}
                      placeholder="Enter drug name"
                      autoFocus
                      onChange={e => setDrug({...drug, name: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                    <button
                      onClick={() => setIsCustomDrug(false)}
                      className="text-xs text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap px-2"
                    >
                      Back to list
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="current-dose" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Current Dose</label>
                  <NumberInput
                    id="current-dose"
                    min="0"
                    step="any"
                    value={drug.currentDose}
                    onChange={v => setDrug({...drug, currentDose: v})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="dose-unit" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Unit</label>
                  <select
                    id="dose-unit"
                    value={drug.unit}
                    onChange={e => setDrug({...drug, unit: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  >
                    {/*
                      Only solid-dose strength units. "ml" implied a liquid,
                      which has no fixed denominations and cannot be halved or
                      quartered, so every plan built on it was wrong. It returns
                      with proper continuous-formulation support.
                    */}
                    <option value="mg">mg</option>
                    <option value="mcg">mcg</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="start-date" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Start Date</label>
                <input
                  id="start-date"
                  type="date"
                  value={drug.startDate}
                  onChange={e => setDrug({...drug, startDate: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                />
                <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mt-3 mb-1">On the Start Date</span>
                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg" role="radiogroup" aria-label="On the start date">
                  {([[false, 'Keep current dose'], [true, 'Make first reduction']] as const).map(([onStart, label]) => (
                    <button
                      key={label}
                      role="radio"
                      aria-checked={(wean.reduceOnStartDate ?? false) === onStart}
                      onClick={() => setWean(prev => ({ ...prev, reduceOnStartDate: onStart }))}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${(wean.reduceOnStartDate ?? false) === onStart ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                  {wean.reduceOnStartDate
                    ? 'The first lower dose starts on this date, e.g. the day of the clinic visit.'
                    : `The current dose is held for one interval from this date, then reduced.`}
                </p>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Doses Per Day</span>
                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg" role="radiogroup" aria-label="Doses per day">
                  {([[1, 'Once daily'], [2, 'Morning + night']] as const).map(([count, label]) => (
                    <button
                      key={count}
                      role="radio"
                      aria-checked={(drug.dosesPerDay ?? 1) === count}
                      onClick={() => setDrug(prev => ({ ...prev, dosesPerDay: count }))}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${(drug.dosesPerDay ?? 1) === count ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {twiceDaily && (
                  <>
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mt-3 mb-1">Morning + Night Split</span>
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg" role="radiogroup" aria-label="Morning and night split">
                      {([['even', 'Even doses'], ['fewest', 'Fewest pieces']] as const).map(([preference, label]) => (
                        <button
                          key={preference}
                          role="radio"
                          aria-checked={(drug.splitPreference ?? 'even') === preference}
                          onClick={() => setDrug(prev => ({ ...prev, splitPreference: preference }))}
                          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${(drug.splitPreference ?? 'even') === preference ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                      {(drug.splitPreference ?? 'even') === 'even'
                        ? 'Morning and night are kept as equal as possible, even if that takes more, smaller pieces.'
                        : 'Uses the fewest pieces each day, then shares them as evenly as they allow. Morning and night may differ.'}
                    </p>
                  </>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Available Denominations</span>
                  <button onClick={addDenom} aria-label="Add a tablet strength" className="text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-slate-700 p-1 rounded transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
                {liquidOnly && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                    Not used — the whole taper is given as liquid.
                  </p>
                )}
                <div className={`space-y-3 ${liquidOnly ? 'opacity-50' : ''}`}>
                  {drug.denominations.map(denom => (
                    <div key={denom.id} className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-200 dark:border-slate-600">
                      <div className="flex gap-2 items-center">
                        <NumberInput
                          min="0"
                          step="any"
                          placeholder="Strength"
                          aria-label={`Tablet strength in ${drug.unit}`}
                          value={denom.strength || undefined}
                          onChange={v => updateDenom(denom.id, 'strength', v)}
                          className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                        />
                        <span className="text-sm text-slate-400 w-8">{drug.unit}</span>
                        {drug.denominations.length > 1 && (
                          <button
                            onClick={() => removeDenom(denom.id)}
                            aria-label={`Remove the ${denom.strength}${drug.unit} strength`}
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                         <Scissors size={14} className="text-slate-400" />
                         <select
                           aria-label={`Splitting allowed for the ${denom.strength}${drug.unit} tablet`}
                           value={denom.canSplit || 'no'}
                           onChange={e => updateDenom(denom.id, 'canSplit', e.target.value as Denomination['canSplit'])}
                           className="flex-1 text-xs px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 outline-none"
                         >
                           <option value="no">Do not split</option>
                           <option value="half">Allow halves (1/2)</option>
                           <option value="quarter">Allow quarters (1/4)</option>
                         </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Liquid formulation */}
              {liquid && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={liquid.enabled}
                      onChange={e => updateLiquid('enabled', e.target.checked)}
                      className="w-4 h-4 accent-teal-600"
                    />
                    <Droplet size={14} className="text-sky-500" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Use a liquid formulation</span>
                  </label>

                  {liquid.enabled && (
                    <div className="mt-3 space-y-3 bg-sky-50/60 dark:bg-sky-900/10 p-3 rounded-lg border border-sky-100 dark:border-sky-900/40">
                      <div className="flex bg-white dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600" role="radiogroup" aria-label="When to use the liquid">
                        {([['below', 'Below a dose'], ['tolerance', 'By drop size'], ['whole', 'Whole taper']] as const).map(([mode, label]) => (
                          <button
                            key={mode}
                            role="radio"
                            aria-checked={liquid.mode === mode}
                            onClick={() => updateLiquid('mode', mode)}
                            className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${liquid.mode === mode ? 'bg-sky-100 dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {liquid.mode === 'tolerance' && (
                        <div>
                          <label htmlFor="liquid-tolerance" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Switch when a tablet drop exceeds</label>
                          <div className="flex items-center gap-2">
                            <NumberInput
                              id="liquid-tolerance"
                              min="0"
                              step="any"
                              value={liquid.maxTabletDropPercent}
                              onChange={v => updateLiquid('maxTabletDropPercent', v)}
                              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                            />
                            <span className="text-sm text-slate-400 w-10">%</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Tablets are used until the next tablet step would cut the dose by more than this, then liquid for the rest of the taper.
                          </p>
                        </div>
                      )}

                      {liquid.mode === 'below' && (
                        <div>
                          <label htmlFor="liquid-switch" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Switch to liquid below</label>
                          <div className="flex items-center gap-2">
                            <NumberInput
                              id="liquid-switch"
                              min="0"
                              step="any"
                              value={liquid.switchBelowDose}
                              onChange={v => updateLiquid('switchBelowDose', v)}
                              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                            />
                            <span className="text-sm text-slate-400 w-10">{drug.unit}</span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="liquid-concentration" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Strength</label>
                          <div className="flex items-center gap-1">
                            <NumberInput
                              id="liquid-concentration"
                              min="0"
                              step="any"
                              value={liquid.concentration}
                              onChange={v => updateLiquid('concentration', v)}
                              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                            />
                            <span className="text-xs text-slate-400 whitespace-nowrap">{drug.unit}/mL</span>
                          </div>
                        </div>
                        <div>
                          <label htmlFor="liquid-increment" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Measure to</label>
                          <div className="flex items-center gap-1">
                            <NumberInput
                              id="liquid-increment"
                              min="0"
                              step="any"
                              value={liquid.measureIncrementMl}
                              onChange={v => updateLiquid('measureIncrementMl', v)}
                              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                            />
                            <span className="text-xs text-slate-400">mL</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="liquid-bottle" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Bottle size</label>
                        <div className="flex items-center gap-2">
                          <NumberInput
                            id="liquid-bottle"
                            min="0"
                            step="any"
                            value={liquid.bottleSizeMl}
                            onChange={v => updateLiquid('bottleSizeMl', v)}
                            className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                          />
                          <span className="text-sm text-slate-400 w-10">mL</span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1">
                        <Info size={14} className="mt-0.5 flex-shrink-0" />
                        <span>
                          Smallest dose change: {formatDose(liquid.concentration * liquid.measureIncrementMl, 4)}{drug.unit}.
                          In Australia, Diazepam Elixir is 1mg/mL in 100mL bottles.
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Receptor occupancy (Michaelis–Menten) */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <label htmlFor="ec50" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Receptor Occupancy: Dose for 50% (EC50)
                </label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    id="ec50"
                    min="0"
                    step="any"
                    placeholder="Not set"
                    value={drug.ec50 || undefined}
                    onChange={v => setDrug(prev => ({ ...prev, ec50: v }))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  />
                  <span className="text-sm text-slate-400 whitespace-nowrap">{drug.unit}/day</span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                  {ec50 === null
                    ? 'Enter a published value to show the estimated receptor occupancy of each dose. Leave blank to hide it.'
                    : `Occupancy = 100 × dose ÷ (dose + ${formatDose(ec50, 3)}). The current dose is about ${formatDose(receptorOccupancy(drug.currentDose, ec50), 1)}% occupancy.`}
                  {drug.name === 'Diazepam' && drug.unit === 'mg' &&
                    ` ${KNOWN_EC50_MG.Diazepam}mg/day fits every occupancy figure in the Maudsley diazepam tables.`}
                </p>

                {(() => {
                  const ref = getDrugReference(drug.name);
                  if (!ref) return null;
                  const doseMg = drug.unit === 'mcg' ? drug.currentDose / 1000 : drug.currentDose;
                  return (
                    <div className="mt-3 p-3 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 space-y-1.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="font-semibold text-teal-900 dark:text-teal-200">
                          {ref.primaryTarget} · Published ED50: {ref.ec50_mg}mg
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-100 dark:bg-teal-900/70 text-teal-800 dark:text-teal-200">
                          {ref.evidenceTier}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {ref.clinicalNote}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        <span className="font-medium">Ref:</span> {ref.citation}
                        {ref.pmid && (
                          <>
                            {' · '}
                            <a
                              href={`https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-700 dark:text-teal-400 underline hover:text-teal-900"
                            >
                              PMID: {ref.pmid}
                            </a>
                          </>
                        )}
                      </p>
                      <div className="pt-1">
                        <a
                          href={buildVisualiserUrl(ref.id, doseMg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 underline"
                        >
                          View 18-Receptor Profile &amp; CYP Modifiers in Visualiser →
                        </a>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Taper Configuration Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-4 text-teal-800 dark:text-teal-400">
              <Calculator className="w-5 h-5" />
              <h2 className="font-semibold text-lg">Taper Settings</h2>
            </div>

            <div className="space-y-4">
               <div>
                <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-2">Reduction Method</span>
                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg" role="radiogroup" aria-label="Reduction method">
                  <button
                    role="radio"
                    aria-checked={wean.reductionType === 'percentage'}
                    onClick={() => chooseReductionType('percentage')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${wean.reductionType === 'percentage' ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Hyperbolic (%)
                  </button>
                  <button
                    role="radio"
                    aria-checked={wean.reductionType === 'fixed'}
                    onClick={() => chooseReductionType('fixed')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${wean.reductionType === 'fixed' ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Fixed Amount
                  </button>
                  <button
                    role="radio"
                    aria-checked={occupancyTaper}
                    onClick={() => chooseReductionType('occupancy')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${occupancyTaper ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Occupancy
                  </button>
                </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reduction-value" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                      {wean.reductionType === 'percentage' ? 'Reduction %' : occupancyTaper ? 'Occupancy points' : `Amount (${drug.unit})`}
                    </label>
                    <NumberInput
                      id="reduction-value"
                      min="0"
                      step="any"
                      value={wean.reductionValue}
                      onChange={v => setWean({...wean, reductionValue: v})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="interval-days" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Every (Days)</label>
                    <NumberInput
                      id="interval-days"
                      min="1"
                      step="1"
                      value={wean.intervalDays}
                      onChange={v => setWean({...wean, intervalDays: v})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                  </div>
               </div>

               <div>
                 <label htmlFor="min-dose" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Stop Taper At (Min Dose)</label>
                 <div className="flex items-center gap-2">
                   <NumberInput
                     id="min-dose"
                     min="0"
                     step="0.1"
                     value={wean.minimumDoseThreshold}
                     onChange={v => setWean({...wean, minimumDoseThreshold: v})}
                     className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                   />
                   <span className="text-sm text-slate-400">{drug.unit}</span>
                 </div>
               </div>

               <div>
                 <div className="flex items-center justify-between mb-1">
                   <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">When Tablets Can't Match</span>
                   <RoundingExplainer />
                 </div>
                 <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg" role="radiogroup" aria-label="When tablets can't match the target">
                   {(Object.keys(ROUNDING_TEXT) as DoseRounding[]).map(mode => (
                     <button
                       key={mode}
                       role="radio"
                       aria-checked={rounding === mode}
                       onClick={() => setWean(prev => ({ ...prev, rounding: mode }))}
                       className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${rounding === mode ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                     >
                       {ROUNDING_TEXT[mode].label}
                     </button>
                   ))}
                 </div>
                 <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">{ROUNDING_TEXT[rounding].description}</p>
               </div>

               <div className="pt-2">
                 <p className="text-xs text-slate-400 flex items-start gap-1">
                   <Info size={14} className="mt-0.5 flex-shrink-0" />
                   {occupancyTaper
                    ? `Lowers estimated receptor occupancy by ${wean.reductionValue} percentage points every ${wean.intervalDays} days${ec50 !== null ? ` (from ${formatDose(receptorOccupancy(drug.currentDose, ec50), 1)}%)` : ''}, so the dose cuts get smaller as the dose falls, until ${wean.minimumDoseThreshold}${drug.unit} is reached. ${ROUNDING_TEXT[rounding].summary}`
                    : `Reduces the target dose by ${reductionText} every ${wean.intervalDays} days until ${wean.minimumDoseThreshold}${drug.unit} is reached. ${ROUNDING_TEXT[rounding].summary}`}
                 </p>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column: Schedule Visualization */}
        <div className="lg:col-span-8 space-y-6">

          {/* Warnings */}
          {schedule.warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm mb-2">
                <AlertTriangle size={16} />
                Check these before prescribing
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
                {schedule.warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          {!hasSchedule ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400">
              No schedule to show yet. Adjust the settings on the left to generate a taper plan.
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                 <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center transition-colors duration-200">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">Total Duration</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{schedule.durationWeeks}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">Weeks</span>
                    </div>
                 </div>
                 <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center transition-colors duration-200">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">Steps</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{schedule.reductionStepCount}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">Reduction steps</span>
                    </div>
                 </div>
                 <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center transition-colors duration-200">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">
                      {schedule.endReason === 'truncated' ? 'Plan Cut Off' : 'Est. End Date'}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        {formatISODate(schedule.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                 </div>
                 {/* The dose the patient steps off from is the clinically risky
                     number, and it is not always the requested stop dose. */}
                 <div className="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl border border-teal-200 dark:border-teal-800 shadow-sm flex flex-col justify-center transition-colors duration-200">
                    <span className="text-teal-700 dark:text-teal-300 text-xs font-semibold uppercase">
                      {schedule.endReason === 'truncated' ? 'Lowest Dose Reached' : 'Ceases From'}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-teal-900 dark:text-teal-50">
                        {formatDose(finalDose, 3)}{drug.unit}
                      </span>
                      <span className="text-sm text-teal-700 dark:text-teal-300">
                        ({formatDose((finalDose / schedule.startingDose) * 100, 1)}% of start)
                      </span>
                    </div>
                 </div>
              </div>

              {/* Tabs keep the page short. Inactive panels stay in the page and
                  are only hidden on screen, so "Print plan" still prints them. */}
              <div role="tablist" aria-label="Plan views" className="flex flex-wrap gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl w-fit print:hidden">
                {RESULT_TABS.map(tab => (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-semibold shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart" className={panelClass('chart')}>
                {/* Chart */}
                <WeanChart
                  steps={schedule.steps}
                  targetCurve={schedule.targetCurve}
                  unit={drug.unit}
                  startingDose={schedule.startingDose}
                  startDate={schedule.steps[0].date}
                  endDate={schedule.endDate}
                  isDarkMode={isDarkMode}
                  reference={referenceCurve}
                  ec50={ec50}
                />

                <CalculationBreakdown drug={drug} wean={wean} schedule={schedule} />
              </div>

              <div role="tabpanel" id="panel-schedule" aria-labelledby="tab-schedule" className={panelClass('schedule')}>
                {/* Detailed List */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                     <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                       <Calendar className="w-4 h-4" />
                       Deprescribing Schedule for {drug.name || 'this medication'}
                     </h3>
                     {ec50 !== null && (
                       <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer print:hidden">
                         <input
                           type="checkbox"
                           checked={showOccupancy}
                           onChange={e => setShowOccupancy(e.target.checked)}
                           className="w-4 h-4 accent-teal-600"
                         />
                         Show receptor occupancy
                       </label>
                     )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-medium">
                        <tr>
                          <th scope="col" className="px-6 py-3">Date</th>
                          <th scope="col" className="px-6 py-3">Step</th>
                          <th scope="col" className="px-6 py-3">Target vs Actual</th>
                          <th scope="col" className="px-6 py-3">
                            {twiceDaily ? 'Morning / Night' : liquidOn ? 'Tablets / Liquid (Daily)' : 'Tablets Required (Daily)'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {schedule.steps.map(step => (
                          <tr key={step.date + step.actualDose} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${step.isStop ? 'bg-green-50/50 dark:bg-green-900/20' : ''}`}>
                            <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                              {formatISODate(step.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-300 whitespace-nowrap">
                              {step.isStop
                                ? <span className="text-green-600 dark:text-green-400 font-bold">STOP</span>
                                : <>
                                    Week {Math.floor(step.dayIndex / 7) + 1}
                                    <span className="block text-xs text-slate-400 dark:text-slate-500">
                                      for {describeDuration(step.durationDays)}
                                    </span>
                                  </>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                 <span className="font-semibold text-slate-800 dark:text-slate-100">
                                   {formatDose(step.actualDose, 3)}{drug.unit}
                                 </span>
                                 {!step.isStop && (
                                   <span className="text-xs text-slate-500 dark:text-slate-400">
                                     Target: {formatDose(step.targetDose)}{drug.unit}
                                   </span>
                                 )}
                                 {occupancyShown && (
                                   <span className="text-xs text-violet-600 dark:text-violet-300">
                                     Occupancy: {formatDose(receptorOccupancy(step.actualDose, ec50!), 1)}%
                                   </span>
                                 )}
                                 {!step.isStop && step.actualDose < step.targetDose * 0.9 && (
                                   <span className="text-[10px] text-amber-500 flex items-center gap-1 mt-1">
                                     <AlertCircle size={10} /> {formatDose(step.targetDose - step.actualDose)}{drug.unit} below target
                                   </span>
                                 )}
                                 {!step.isStop && step.actualDose > step.targetDose + 1e-9 && (
                                   <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                     {formatDose(step.actualDose - step.targetDose)}{drug.unit} above target
                                   </span>
                                 )}
                                 {!step.isStop && step.reductionPercent !== null && (
                                   <span className={`text-[10px] mt-1 ${step.steeperThanRequested ? 'text-amber-500 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                                     ↓ {formatDose(step.reductionFromPrevious ?? 0, 3)}{drug.unit} ({formatDose(step.reductionPercent, 1)}%
                                     {occupancyShown && `, ${formatDose(receptorOccupancy(step.actualDose + (step.reductionFromPrevious ?? 0), ec50) - receptorOccupancy(step.actualDose, ec50), 1)} occupancy pts`}) from previous dose
                                   </span>
                                 )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {step.split ? (
                                <div className="space-y-2">
                                  {([['Morning', step.split.am], ['Night', step.split.pm]] as const).map(([when, part]) => (
                                    <div key={when} className="flex items-center gap-2">
                                      <span className="w-24 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                                        {when}
                                        <span className="block font-semibold text-slate-700 dark:text-slate-200">
                                          {formatDose(part.dose, 3)}{drug.unit}
                                        </span>
                                      </span>
                                      <TabletVisualizer
                                        counts={part.tablets}
                                        denominations={drug.denominations}
                                        unit={drug.unit}
                                        liquidMl={part.liquidMl}
                                        concentration={liquid?.concentration}
                                        emptyLabel="None"
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <TabletVisualizer
                                  counts={step.tablets}
                                  denominations={drug.denominations}
                                  unit={drug.unit}
                                  liquidMl={step.liquidMl}
                                  concentration={liquid?.concentration}
                                />
                              )}
                              {!step.isStop && (
                                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/50 pt-2 font-medium">
                                  Step Total: {describeTablets(step, drug.denominations, drug.unit, step.durationDays, liquid, true)}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {schedule.endReason === 'truncated' && (
                          <tr className="bg-amber-50 dark:bg-amber-900/20">
                            <td colSpan={4} className="px-6 py-4 text-sm text-amber-800 dark:text-amber-200">
                              The taper had not reached the stop dose when the schedule was cut off, so this plan
                              is incomplete and shows no cessation date.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Tablets Summary */}
                  <div className="bg-slate-50 dark:bg-slate-700/50 p-6 border-t border-slate-200 dark:border-slate-600">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Total Medication Required for Full Plan</h4>
                    <div className="flex flex-wrap gap-4">
                      {Object.entries(schedule.totalTablets).map(([id, count]: [string, number]) => {
                        const denom = drug.denominations.find(d => d.id === id);
                        if (!denom) return null;
                        return (
                          <div key={id} className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm flex items-center gap-3">
                             <div className="bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-bold px-2 py-1 rounded text-xs">
                               {denom.strength}{drug.unit}
                             </div>
                             <div className="text-slate-600 dark:text-slate-300 font-medium">
                               {formatCount(count)} <span className="text-xs text-slate-400 font-normal">tablets taken</span>
                               {supplyCount(count) !== count && (
                                 <span className="block text-xs text-slate-500 dark:text-slate-400 font-normal">
                                   supply {supplyCount(count)} whole tablets
                                 </span>
                               )}
                             </div>
                          </div>
                        );
                      })}
                      {schedule.totalLiquidMl > 0 && liquid && (
                        <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm flex items-center gap-3">
                          <div className="bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-bold px-2 py-1 rounded text-xs flex items-center gap-1">
                            <Droplet size={12} /> {formatDose(liquid.concentration, 3)}{drug.unit}/mL
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 font-medium">
                            {formatDose(schedule.totalLiquidMl, 2)} <span className="text-xs text-slate-400 font-normal">mL</span>
                            {bottleCount(schedule.totalLiquidMl, liquid) !== null && (
                              <span className="block text-xs text-slate-500 dark:text-slate-400 font-normal">
                                supply {bottleCount(schedule.totalLiquidMl, liquid)} × {liquid.bottleSizeMl}mL bottle{bottleCount(schedule.totalLiquidMl, liquid) === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* EMR Friendly Text */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200 print:hidden">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                       <Copy className="w-4 h-4" />
                       <label htmlFor="emr-text">EMR-Friendly Text</label>
                     </h3>
                     <button
                       onClick={copyEmrText}
                       className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full transition-colors flex items-center gap-2 font-medium"
                     >
                       {copyState === 'copied' && <Check size={14} />}
                       {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed — select and copy manually' : 'Copy to Clipboard'}
                     </button>
                  </div>
                  <textarea
                    id="emr-text"
                    readOnly
                    value={emrText}
                    className="w-full h-72 p-3 text-sm font-mono border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-lg outline-none resize-y"
                  />
                </div>
              </div>

              <div role="tabpanel" id="panel-handout" aria-labelledby="tab-handout" className={panelClass('handout')}>
                <PatientHandout
                  drugName={drug.name}
                  unit={drug.unit}
                  steps={schedule.steps}
                  denominations={drug.denominations}
                  liquid={liquidOn ? liquid : undefined}
                  isComplete={schedule.endReason !== 'truncated'}
                />
              </div>

              <div role="tabpanel" id="panel-maudsley" aria-labelledby="tab-maudsley" className={panelClass('maudsley')}>
                <MaudsleyReference
                  onLoadRegimen={loadMaudsleyRegimen}
                  overlaidRegimenId={overlaidRegimenId}
                  onToggleOverlay={toggleMaudsleyOverlay}
                />
              </div>
            </>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            HyperTaper is a calculation aid, not medical advice. Every plan must be reviewed against the
            product's licensed strengths and the patient's clinical picture before prescribing.
          </p>
        </div>
      </main>
    </div>
  );
};

export default App;
