import React, { useState, useEffect } from 'react';
import { Pill, Calculator, Calendar, Activity, Info, AlertCircle, Plus, Trash2, ArrowRight, Download, Scissors, Sun, Moon, Copy } from 'lucide-react';
import { DrugConfig, WeanConfig, Denomination, ScheduleResult } from './types';
import { generateSchedule } from './services/weaningLogic';
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

const App: React.FC = () => {
  const [drug, setDrug] = useState<DrugConfig>({
    name: 'Sertraline',
    currentDose: 50,
    unit: 'mg',
    startDate: new Date().toISOString().split('T')[0],
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

  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [isCustomDrug, setIsCustomDrug] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Auto-calculate on change
  useEffect(() => {
    if (drug.currentDose > 0 && drug.denominations.length > 0) {
      const result = generateSchedule(drug, wean);
      setSchedule(result);
    }
  }, [drug, wean]);

  // Handler for adding denomination
  const addDenom = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setDrug({
      ...drug,
      denominations: [...drug.denominations, { id: newId, strength: 0, canSplit: 'no' }]
    });
  };

  const removeDenom = (id: string) => {
    setDrug({
      ...drug,
      denominations: drug.denominations.filter(d => d.id !== id)
    });
  };

  const updateDenom = (id: string, field: keyof Denomination, value: any) => {
    setDrug({
      ...drug,
      denominations: drug.denominations.map(d => d.id === id ? { ...d, [field]: value } : d)
    });
  };

  const handleDrugChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'Other') {
      setIsCustomDrug(true);
      setDrug({ ...drug, name: '' });
    } else {
      setIsCustomDrug(false);
      setDrug({ ...drug, name: val });
    }
  };

  const printSchedule = () => {
    window.print();
  };

  const generateEmrText = () => {
    if (!schedule) return '';
    
    const dateColWidth = 15;
    const doseColWidth = 12;

    let text = `Medication Taper Plan\n`;
    text += `Drug: ${drug.name}\n`;
    text += `Start Dose: ${drug.currentDose}${drug.unit}\n\n`;
    
    text += `Date`.padEnd(dateColWidth) + `Dose`.padEnd(doseColWidth) + `Instructions\n`;
    text += `-`.repeat(50) + `\n`;
    
    schedule.steps.forEach(step => {
      const dateStr = new Date(step.date).toLocaleDateString(undefined, {month: 'short', day: '2-digit', year: 'numeric'});
      if (step.isStop) {
        text += `${dateStr}`.padEnd(dateColWidth) + `STOP`.padEnd(doseColWidth) + `Cease medication\n`;
      } else {
        const tabletsText = Object.entries(step.tablets)
          .filter(([_, count]) => count > 0)
          .map(([id, count]) => {
            const denom = drug.denominations.find(d => d.id === id);
            return denom ? `${count}x ${denom.strength}${drug.unit}` : '';
          })
          .filter(Boolean)
          .join(', ');
        
        text += `${dateStr}`.padEnd(dateColWidth) + `${step.actualDose}${drug.unit}`.padEnd(doseColWidth) + `${tabletsText}\n`;
      }
    });
    
    return text;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 transition-colors duration-200">
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
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={printSchedule} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
              <Download size={18} />
              <span>Export Plan</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Configuration */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Drug Details Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-4 text-blue-800 dark:text-blue-400">
              <Pill className="w-5 h-5" />
              <h2 className="font-semibold text-lg">Medication Details</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Drug Name</label>
                {!isCustomDrug ? (
                  <select 
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
                      type="text" 
                      value={drug.name}
                      placeholder="Enter drug name"
                      autoFocus
                      onChange={e => setDrug({...drug, name: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                    <button 
                      onClick={() => setIsCustomDrug(false)}
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap px-2"
                    >
                      Back to list
                    </button>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Current Dose</label>
                  <input 
                    type="number" 
                    value={drug.currentDose}
                    onChange={e => setDrug({...drug, currentDose: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Unit</label>
                  <select 
                    value={drug.unit}
                    onChange={e => setDrug({...drug, unit: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  >
                    <option value="mg">mg</option>
                    <option value="ml">ml</option>
                    <option value="mcg">mcg</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Start Date</label>
                <input 
                  type="date" 
                  value={drug.startDate}
                  onChange={e => setDrug({...drug, startDate: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-medium text-slate-500 uppercase">Available Denominations</label>
                  <button onClick={addDenom} className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-3">
                  {drug.denominations.map((denom, idx) => (
                    <div key={denom.id} className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-200 dark:border-slate-600">
                      <div className="flex gap-2 items-center">
                        <input 
                          type="number" 
                          placeholder="Strength"
                          value={denom.strength || ''}
                          onChange={e => updateDenom(denom.id, 'strength', Number(e.target.value))}
                          className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                        />
                        <span className="text-sm text-slate-400 w-8">{drug.unit}</span>
                        {drug.denominations.length > 1 && (
                          <button onClick={() => removeDenom(denom.id)} className="text-slate-400 hover:text-red-600 p-1">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                         <Scissors size={14} className="text-slate-400" />
                         <select 
                           value={denom.canSplit || 'no'}
                           onChange={e => updateDenom(denom.id, 'canSplit', e.target.value)}
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-600 dark:border-slate-700 p-6 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-4 text-indigo-800 dark:text-indigo-400">
              <Calculator className="w-5 h-5" />
              <h2 className="font-semibold text-lg">Taper Settings</h2>
            </div>
            
            <div className="space-y-4">
               <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-2">Reduction Method</label>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setWean({...wean, reductionType: 'percentage'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${wean.reductionType === 'percentage' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Hyperbolic (%)
                  </button>
                  <button 
                    onClick={() => setWean({...wean, reductionType: 'fixed'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${wean.reductionType === 'fixed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Fixed Amount
                  </button>
                </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">
                      {wean.reductionType === 'percentage' ? 'Reduction %' : `Amount (${drug.unit})`}
                    </label>
                    <input 
                      type="number" 
                      value={wean.reductionValue}
                      onChange={e => setWean({...wean, reductionValue: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Every (Days)</label>
                    <input 
                      type="number" 
                      value={wean.intervalDays}
                      onChange={e => setWean({...wean, intervalDays: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                    />
                  </div>
               </div>

               {/* New Minimum Dose Threshold Field */}
               <div>
                 <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Stop Taper At (Min Dose)</label>
                 <div className="flex items-center gap-2">
                   <input 
                     type="number" 
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
                    ? `Reduces current dose by ${wean.reductionValue}% every ${wean.intervalDays} days until ${wean.minimumDoseThreshold}${drug.unit} is reached.` 
                    : `Reduces dose by exactly ${wean.reductionValue}${drug.unit} every ${wean.intervalDays} days until ${wean.minimumDoseThreshold}${drug.unit} is reached.`}
                 </p>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column: Schedule Visualization */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Summary Stats */}
          {schedule && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600 dark:border-slate-700 shadow-sm flex flex-col justify-center transition-colors duration-200">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">Total Duration</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{schedule.durationWeeks}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Weeks</span>
                  </div>
               </div>
               <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600 dark:border-slate-700 shadow-sm flex flex-col justify-center transition-colors duration-200">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">Steps</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{schedule.steps.length - 1}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Reduction steps</span>
                  </div>
               </div>
               <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600 dark:border-slate-700 shadow-sm flex flex-col justify-center transition-colors duration-200">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">Est. End Date</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
                      {new Date(schedule.steps[schedule.steps.length - 1].date).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                    </span>
                  </div>
               </div>
            </div>
          )}

          {/* Chart */}
          {schedule && <WeanChart steps={schedule.steps} unit={drug.unit} isDarkMode={isDarkMode} />}

          {/* EMR Friendly Text */}
          {schedule && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-600 p-6 transition-colors duration-200">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                   <Copy className="w-4 h-4" /> 
                   EMR-Friendly Text
                 </h3>
                 <button 
                   onClick={() => navigator.clipboard.writeText(generateEmrText())}
                   className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full transition-colors flex items-center gap-2 font-medium"
                 >
                   Copy to Clipboard
                 </button>
              </div>
              <textarea
                readOnly
                value={generateEmrText()}
                className="w-full h-40 p-3 text-sm font-mono border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-lg outline-none resize-y"
              />
            </div>
          )}

          {/* Detailed List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
               <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                 <Calendar className="w-4 h-4" /> 
                 Deprescribing Schedule
               </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Step</th>
                    <th className="px-6 py-3">Target vs Actual</th>
                    <th className="px-6 py-3">Tablets Required (Daily)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedule?.steps.map((step, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50 dark:bg-slate-700/50 transition-colors ${step.isStop ? 'bg-green-50/50 dark:bg-green-900/20' : ''}`}>
                      <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {new Date(step.date).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {step.isStop ? <span className="text-green-600 dark:text-green-400 font-bold">STOP</span> : `Week ${Math.floor(step.dayIndex / 7) + 1}`}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                           <span className="font-semibold text-slate-800 dark:text-slate-100">
                             {step.actualDose}{drug.unit}
                           </span>
                           {!step.isStop && (
                             <span className="text-xs text-slate-400">
                               Target: {step.targetDose}{drug.unit}
                             </span>
                           )}
                           {Math.abs(step.actualDose - step.targetDose) > (step.targetDose * 0.1) && !step.isStop && (
                             <span className="text-[10px] text-amber-500 flex items-center gap-1 mt-1">
                               <AlertCircle size={10} /> Significant deviation
                             </span>
                           )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <TabletVisualizer counts={step.tablets} denominations={drug.denominations} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Tablets Summary */}
            {schedule && (
              <div className="bg-slate-50 dark:bg-slate-700/50 p-6 border-t border-slate-200 dark:border-slate-600">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Total Medication Required for Full Plan</h4>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(schedule.totalTablets).map(([id, count]: [string, number]) => {
                    const denom = drug.denominations.find(d => d.id === id);
                    if(!denom) return null;
                    return (
                      <div key={id} className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm flex items-center gap-3">
                         <div className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold px-2 py-1 rounded text-xs">
                           {denom.strength}{drug.unit}
                         </div>
                         <div className="text-slate-600 dark:text-slate-300 font-medium">
                           {count.toFixed(count % 1 === 0 ? 0 : 2)} <span className="text-xs text-slate-400 font-normal">tablets</span>
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;