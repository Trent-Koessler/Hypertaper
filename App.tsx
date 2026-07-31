import React, { useState, useEffect, useMemo } from 'react';
import { Pill, Calculator, Calendar, Activity, Info, AlertCircle, AlertTriangle, Plus, Trash2, Printer, Scissors, Sun, Moon, Copy, Check } from 'lucide-react';
import { DrugConfig, WeanConfig, Denomination, ScheduleStep } from './types';
import { generateSchedule } from './services/weaningLogic';
import { formatISODate, todayISO } from './services/dateUtils';
import WeanChart from './components/WeanChart';
import TabletVisualizer from './components/TabletVisualizer';

const COMMON_DRUGS = [
  "Sertraline",
  "Venlafaxine",
  "Citalopram",
  "Escitalopram",
  "Paroxetine",
  "Duloxetine",
  "Fluoxetine",
  "Mirtazapine",
  "Diazepam",
  "Gabapentin",
  "Pregabalin",
  "Other"
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

/** Formats a tablet count, hiding the decimals on whole numbers. */
const formatCount = (count: number): string => count.toFixed(count % 1 === 0 ? 0 : 2);

/** Rounds a dose for display without leaving trailing zeros (12.5 not 12.5000). */
const formatDose = (value: number, decimals = 2): string =>
  String(parseFloat(value.toFixed(decimals)));

/** "2x 50mg, 1x 25mg" for a step's tablets, optionally scaled over the whole step. */
const describeTablets = (
  step: ScheduleStep,
  denominations: Denomination[],
  unit: string,
  multiplier = 1
): string =>
  Object.entries(step.tablets)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const denom = denominations.find(d => d.id === id);
      return denom ? `${formatCount(count * multiplier)}x ${denom.strength}${unit}` : '';
    })
    .filter(Boolean)
    .join(', ');

const describeDuration = (days: number): string => {
  if (days % 7 === 0 && days >= 7) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
};

const App: React.FC = () => {
  const [drug, setDrug] = useState<DrugConfig>({
    name: 'Sertraline',
    currentDose: 50,
    unit: 'mg',
    startDate: todayISO(),
    denominations: [
      { id: '1', strength: 50, canSplit: 'half' },
      { id: '2', strength: 25, canSplit: 'no' }
    ]
  });

  const [wean, setWean] = useState<WeanConfig>({
    reductionType: 'percentage',
    reductionValue: 10,
    intervalDays: 14,
    minimumDoseThreshold: 0.5
  });

  const [isCustomDrug, setIsCustomDrug] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isDarkMode, setIsDarkMode] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // Persisting the preference is best-effort.
    }
  }, [isDarkMode]);

  // Derived, not stored: a stale schedule can never outlive an invalid input.
  const schedule = useMemo(() => generateSchedule(drug, wean), [drug, wean]);
  const hasSchedule = schedule.steps.length > 0;

  const addDenom = () => {
    setDrug(prev => ({
      ...prev,
      denominations: [...prev.denominations, { id: createId(), strength: 0, canSplit: 'no' }]
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

  const handleDrugChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'Other') {
      setIsCustomDrug(true);
      setDrug(prev => ({ ...prev, name: '' }));
    } else {
      setIsCustomDrug(false);
      setDrug(prev => ({ ...prev, name: val }));
    }
  };

  const printSchedule = () => {
    window.print();
  };

  const emrText = useMemo(() => {
    if (!hasSchedule) return '';

    const dateColWidth = 18;
    const doseColWidth = 12;
    const durationColWidth = 12;

    let text = `Medication Taper Plan\n`;
    text += `Drug: ${drug.name || '(unnamed)'}\n`;
    text += `Start Dose: ${drug.currentDose}${drug.unit}\n`;
    text += `Reduction: ${wean.reductionType === 'percentage' ? `${wean.reductionValue}%` : `${wean.reductionValue}${drug.unit}`} every ${wean.intervalDays} days\n\n`;

    text += `Date`.padEnd(dateColWidth) + `Dose`.padEnd(doseColWidth) + `For`.padEnd(durationColWidth) + `Instructions\n`;
    text += `-`.repeat(80) + `\n`;

    schedule.steps.forEach(step => {
      // A fixed format keeps the note identical on every machine, unlike a locale-dependent one.
      const dateStr = formatISODate(step.date, { year: 'numeric', month: 'short', day: '2-digit' });

      if (step.isStop) {
        text += dateStr.padEnd(dateColWidth) + `STOP`.padEnd(doseColWidth) + `-`.padEnd(durationColWidth) + `Cease medication\n`;
        return;
      }

      const daily = describeTablets(step, drug.denominations, drug.unit);
      const stepTotal = describeTablets(step, drug.denominations, drug.unit, step.durationDays);
      const instruction = `${daily} daily (step total: ${stepTotal})`;

      text += dateStr.padEnd(dateColWidth)
        + `${formatDose(step.actualDose, 3)}${drug.unit}`.padEnd(doseColWidth)
        + describeDuration(step.durationDays).padEnd(durationColWidth)
        + `${instruction}\n`;
    });

    text += `\n` + `-`.repeat(80) + `\n`;
    text += `Total Medication Required for Full Plan:\n`;
    Object.entries(schedule.totalTablets).forEach(([id, count]: [string, number]) => {
      const denom = drug.denominations.find(d => d.id === id);
      if (denom) {
        text += `- ${formatCount(count)}x ${denom.strength}${drug.unit} tablets\n`;
      }
    });

    if (schedule.warnings.length > 0) {
      text += `\nNotes:\n`;
      schedule.warnings.forEach(warning => {
        text += `- ${warning}\n`;
      });
    }

    return text;
  }, [schedule, drug, wean, hasSchedule]);

  const copyEmrText = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(emrText);
      setCopyState('copied');
    } catch {
      // Fails on insecure origins and when the user denies permission.
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 2500);
  };

  const lastStep = hasSchedule ? schedule.steps[schedule.steps.length - 1] : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 transition-colors duration-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Activity className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-cyan-600 bg-clip-text text-transparent">
              HyperTaper
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={printSchedule} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
              <Printer size={18} />
              <span>Print Plan</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column: Configuration */}
        <div className="lg:col-span-4 space-y-6 print:hidden">

          {/* Drug Details Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-4 text-blue-800 dark:text-blue-400">
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  >
                    {COMMON_DRUGS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
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
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                    <button
                      onClick={() => setIsCustomDrug(false)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap px-2"
                    >
                      Back to list
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="current-dose" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Current Dose</label>
                  <input
                    id="current-dose"
                    type="number"
                    min="0"
                    step="any"
                    value={drug.currentDose}
                    onChange={e => setDrug({...drug, currentDose: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
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
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Available Denominations</span>
                  <button onClick={addDenom} aria-label="Add a tablet strength" className="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 p-1 rounded transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-3">
                  {drug.denominations.map(denom => (
                    <div key={denom.id} className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-200 dark:border-slate-600">
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Strength"
                          aria-label={`Tablet strength in ${drug.unit}`}
                          value={denom.strength || ''}
                          onChange={e => updateDenom(denom.id, 'strength', Number(e.target.value))}
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
            </div>
          </div>

          {/* Taper Configuration Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-4 text-indigo-800 dark:text-indigo-400">
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
                    onClick={() => setWean({...wean, reductionType: 'percentage'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${wean.reductionType === 'percentage' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Hyperbolic (%)
                  </button>
                  <button
                    role="radio"
                    aria-checked={wean.reductionType === 'fixed'}
                    onClick={() => setWean({...wean, reductionType: 'fixed'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${wean.reductionType === 'fixed' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Fixed Amount
                  </button>
                </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reduction-value" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                      {wean.reductionType === 'percentage' ? 'Reduction %' : `Amount (${drug.unit})`}
                    </label>
                    <input
                      id="reduction-value"
                      type="number"
                      min="0"
                      step="any"
                      value={wean.reductionValue}
                      onChange={e => setWean({...wean, reductionValue: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="interval-days" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Every (Days)</label>
                    <input
                      id="interval-days"
                      type="number"
                      min="1"
                      step="1"
                      value={wean.intervalDays}
                      onChange={e => setWean({...wean, intervalDays: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                  </div>
               </div>

               <div>
                 <label htmlFor="min-dose" className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Stop Taper At (Min Dose)</label>
                 <div className="flex items-center gap-2">
                   <input
                     id="min-dose"
                     type="number"
                     min="0"
                     step="0.1"
                     value={wean.minimumDoseThreshold}
                     onChange={e => setWean({...wean, minimumDoseThreshold: Number(e.target.value)})}
                     className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                   />
                   <span className="text-sm text-slate-400">{drug.unit}</span>
                 </div>
               </div>

               <div className="pt-2">
                 <p className="text-xs text-slate-400 flex items-start gap-1">
                   <Info size={14} className="mt-0.5 flex-shrink-0" />
                   {wean.reductionType === 'percentage'
                    ? `Reduces the target dose by ${wean.reductionValue}% every ${wean.intervalDays} days until ${wean.minimumDoseThreshold}${drug.unit} is reached. Each step uses the largest dose the available tablets can make without exceeding the target.`
                    : `Reduces the target dose by ${wean.reductionValue}${drug.unit} every ${wean.intervalDays} days until ${wean.minimumDoseThreshold}${drug.unit} is reached. Each step uses the largest dose the available tablets can make without exceeding the target.`}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">Est. End Date</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        {lastStep && formatISODate(lastStep.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                 </div>
              </div>

              {/* Chart */}
              <WeanChart
                steps={schedule.steps}
                targetCurve={schedule.targetCurve}
                unit={drug.unit}
                isDarkMode={isDarkMode}
              />

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
                  className="w-full h-40 p-3 text-sm font-mono border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-lg outline-none resize-y"
                />
              </div>

              {/* Detailed List */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                   <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                     <Calendar className="w-4 h-4" />
                     Deprescribing Schedule for {drug.name || 'this medication'}
                   </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-medium">
                      <tr>
                        <th scope="col" className="px-6 py-3">Date</th>
                        <th scope="col" className="px-6 py-3">Step</th>
                        <th scope="col" className="px-6 py-3">Target vs Actual</th>
                        <th scope="col" className="px-6 py-3">Tablets Required (Daily)</th>
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
                               {!step.isStop && step.actualDose < step.targetDose * 0.9 && (
                                 <span className="text-[10px] text-amber-500 flex items-center gap-1 mt-1">
                                   <AlertCircle size={10} /> {formatDose(step.targetDose - step.actualDose)}{drug.unit} below target
                                 </span>
                               )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <TabletVisualizer counts={step.tablets} denominations={drug.denominations} unit={drug.unit} />
                            {!step.isStop && (
                              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/50 pt-2 font-medium">
                                Step Total: {describeTablets(step, drug.denominations, drug.unit, step.durationDays)}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
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
                           <div className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold px-2 py-1 rounded text-xs">
                             {denom.strength}{drug.unit}
                           </div>
                           <div className="text-slate-600 dark:text-slate-300 font-medium">
                             {formatCount(count)} <span className="text-xs text-slate-400 font-normal">tablets</span>
                           </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
