import React from 'react';
import { FileText, Printer } from 'lucide-react';
import { Denomination, DoseBreakdown, LiquidConfig, ScheduleStep } from '../types';
import { addDaysISO, formatISODate } from '../services/dateUtils';

interface PatientHandoutProps {
  drugName: string;
  unit: string;
  steps: ScheduleStep[];
  denominations: Denomination[];
  liquid?: LiquidConfig;
  /** False when the plan was cut off; the handout then has no stop row. */
  isComplete: boolean;
}

const FRACTIONS: { [quarters: number]: string } = { 1: '¼', 2: '½', 3: '¾' };

const formatAmount = (value: number): string => String(parseFloat(value.toFixed(3)));

/** 1.5 -> "1½", 0.25 -> "¼"; falls back to decimals for anything finer than quarters. */
const tabletCount = (count: number): string => {
  const whole = Math.floor(count + 1e-9);
  const quarters = Math.round((count - whole) * 4);
  if (Math.abs(count - (whole + quarters / 4)) > 1e-6) return formatAmount(count);
  if (quarters === 0) return String(whole);
  return `${whole > 0 ? whole : ''}${FRACTIONS[quarters]}`;
};

/** ["1½ × 2mg tablets", "¼ × 5mg tablet"], or ["0.6mL liquid"]. The liquid's strength is stated once, above the table. */
const describeForPatient = (
  dose: Pick<DoseBreakdown, 'tablets' | 'liquidMl'>,
  denominations: Denomination[],
  unit: string,
  liquid?: LiquidConfig
): string[] => {
  if (dose.liquidMl && liquid) {
    return [`${formatAmount(dose.liquidMl)}mL liquid`];
  }
  const parts = Object.entries(dose.tablets)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const denom = denominations.find(d => d.id === id);
      if (!denom) return '';
      return `${tabletCount(count)} × ${formatAmount(denom.strength)}${unit} tablet${count > 1 ? 's' : ''}`;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts : ['None'];
};

/** One amount per line, so the dose columns can stay narrow enough for the page. */
const Amounts: React.FC<{ parts: string[] }> = ({ parts }) => (
  <>
    {parts.map((part, index) => (
      <span key={part} className="block">
        {index > 0 && '+ '}
        {part}
      </span>
    ))}
  </>
);

const longDate = (iso: string) => formatISODate(iso, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A plain-language copy of the plan for the patient: one row per step, with a
 * box to tick when that step is started. Names and contact details are left
 * as blank lines to fill in by hand, so no patient data is typed into the app.
 */
const PatientHandout: React.FC<PatientHandoutProps> = ({ drugName, unit, steps, denominations, liquid, isComplete }) => {
  const doseSteps = steps.filter(step => !step.isStop);
  const stopStep = steps.find(step => step.isStop);
  const twiceDaily = doseSteps.some(step => step.split);
  const usesLiquid = doseSteps.some(step => step.liquidMl);
  const name = drugName || 'your medicine';

  const printHandout = () => {
    // Printing the handout alone: the print stylesheet hides everything else
    // while this class is on the page.
    document.documentElement.classList.add('print-handout');
    const cleanUp = () => {
      document.documentElement.classList.remove('print-handout');
      window.removeEventListener('afterprint', cleanUp);
    };
    window.addEventListener('afterprint', cleanUp);
    window.print();
  };

  const cell = 'px-3 py-2 border border-slate-300 align-top';

  return (
    <div id="patient-handout-card" className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Patient Handout
        </h3>
        <button
          onClick={printHandout}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-full transition-colors flex items-center gap-2 font-medium"
        >
          <Printer size={14} />
          Print handout
        </button>
      </div>

      {/* The preview is drawn as a white page in both themes, as it will print. */}
      <div id="patient-handout" className="bg-white text-slate-900 rounded-lg border border-slate-200 p-6 text-sm">
        <h2 className="text-xl font-bold mb-1">Your {name} reducing plan</h2>
        <p className="text-slate-600 mb-4">
          This plan lowers your dose slowly, in small steps, to reduce withdrawal symptoms.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mb-5">
          {['Name', 'Prescriber', 'Pharmacy', 'Phone'].map(label => (
            <div key={label} className="flex items-end gap-2">
              <span className="font-medium whitespace-nowrap">{label}:</span>
              <span className="flex-1 border-b border-slate-400 h-5" />
            </div>
          ))}
        </div>

        <ul className="list-disc pl-5 space-y-1 mb-5 text-slate-700">
          <li>
            Take the amounts in each row from its start date to its end date
            {twiceDaily ? ', once in the morning and once at night.' : ', once each day.'}
          </li>
          <li>Tick the box when you start each new row.</li>
          {usesLiquid && liquid && (
            <li>
              The liquid is {formatAmount(liquid.concentration)}{unit} in each mL. Measure it with an oral syringe from
              your pharmacy, not a kitchen spoon.
            </li>
          )}
          <li>Do not change your dose or skip ahead without talking to your prescriber.</li>
          <li>
            If withdrawal symptoms become hard to manage, contact your prescriber. The plan can be paused or
            slowed down.
          </li>
        </ul>

        {/* Fixed column widths keep the table inside an A4 page, whatever the amounts. */}
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '20%' }} />
              {twiceDaily ? (
                <>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '22%' }} />
                </>
              ) : (
                <col style={{ width: '44%' }} />
              )}
              <col style={{ width: '15%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                <th className={cell}>Step</th>
                <th className={cell}>Dates</th>
                {twiceDaily ? (
                  <>
                    <th className={cell}>Morning</th>
                    <th className={cell}>Night</th>
                  </>
                ) : (
                  <th className={cell}>Each day</th>
                )}
                <th className={cell}>Total each day</th>
                <th className={`${cell} text-center`}>Started</th>
              </tr>
            </thead>
            <tbody>
              {doseSteps.map((step, index) => (
                <tr key={step.date}>
                  <td className={cell}>{index + 1}</td>
                  <td className={cell}>
                    {longDate(step.date)}
                    <span className="block text-slate-500">to {longDate(addDaysISO(step.date, step.durationDays - 1))}</span>
                  </td>
                  {step.split ? (
                    <>
                      <td className={cell}><Amounts parts={describeForPatient(step.split.am, denominations, unit, liquid)} /></td>
                      <td className={cell}><Amounts parts={describeForPatient(step.split.pm, denominations, unit, liquid)} /></td>
                    </>
                  ) : (
                    <td className={cell}><Amounts parts={describeForPatient(step, denominations, unit, liquid)} /></td>
                  )}
                  <td className={`${cell} font-semibold`}>{formatAmount(step.actualDose)}{unit}</td>
                  <td className={`${cell} text-center`}>
                    <span className="inline-block w-5 h-5 border-2 border-slate-500 rounded-sm" aria-label="Tick box" />
                  </td>
                </tr>
              ))}
              {isComplete && stopStep && (
                <tr className="bg-green-50">
                  <td className={cell}>{doseSteps.length + 1}</td>
                  <td className={cell}>From {longDate(stopStep.date)}</td>
                  <td className={`${cell} font-semibold`} colSpan={twiceDaily ? 3 : 2}>
                    Stop — no more {name}
                  </td>
                  <td className={`${cell} text-center`}>
                    <span className="inline-block w-5 h-5 border-2 border-slate-500 rounded-sm" aria-label="Tick box" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-slate-600">
          Keep this sheet with your medicines. Bring it to each appointment.
        </p>
      </div>
    </div>
  );
};

export default PatientHandout;
