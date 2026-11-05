import React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Download } from 'lucide-react';
import { ScheduleStep } from '../types';
import {
  NSW_ODT_LABELS,
  NSW_ODT_NOTES,
  NSW_ODT_SOURCE,
  NswOdtMedicine,
  bandsFor,
  checkAgainstNsw
} from '../services/nswOdtTaper';

interface NswOdtReferenceProps {
  /** The NSW medicine the current drug is, or null if it is neither. */
  medicine: NswOdtMedicine | null;
  steps: ScheduleStep[];
  unit: string;
  onLoadPreset: (medicine: NswOdtMedicine) => void;
}

const formatMg = (value: number): string => String(parseFloat(value.toFixed(3)));

const stepRange = ([lo, hi]: [number, number]): string =>
  lo === hi ? `${formatMg(lo)}mg` : `${formatMg(lo)}-${formatMg(hi)}mg`;

const BandTable: React.FC<{ medicine: NswOdtMedicine }> = ({ medicine }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
    <table className="w-full text-xs border-collapse">
      <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
        <tr>
          <th className="text-left font-medium px-3 py-2">Current daily dose</th>
          <th className="text-left font-medium px-3 py-2">Each reduction (every 1-4 weeks or longer)</th>
        </tr>
      </thead>
      <tbody>
        {bandsFor(medicine).map(band => (
          <tr key={band.label} className="border-t border-slate-100 dark:border-slate-700/60">
            <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{band.label}</td>
            <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-100">{stepRange(band.stepMg)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * The NSW opioid treatment taper bands, a button to set the calculator up for
 * each medicine, and a check of every step of the current plan against them.
 */
const NswOdtReference: React.FC<NswOdtReferenceProps> = ({ medicine, steps, unit, onLoadPreset }) => {
  const checks = medicine && unit === 'mg' ? checkAgainstNsw(medicine, steps) : [];
  const tooFast = checks.filter(c => c.tooFast);
  const tooSoon = checks.filter(c => c.tooSoon);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-5 transition-colors duration-200">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-slate-400" />
        <h3 className="font-semibold text-slate-700 dark:text-slate-200">
          NSW opioid treatment: methadone and buprenorphine tapers
        </h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The 2026 NSW guide asks for <strong>hyperbolic tapering</strong> - a roughly constant percentage cut - with
        the reduction for each dose band below, every 1-4 weeks or longer, and a low threshold to pause or go back
        up. Source: {NSW_ODT_SOURCE}.
      </p>

      <div className="flex flex-wrap gap-2">
        {(['methadone', 'buprenorphine'] as NswOdtMedicine[]).map(m => (
          <button
            key={m}
            onClick={() => onLoadPreset(m)}
            className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors font-medium ${
              medicine === m
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <Download size={13} />
            Set up for {NSW_ODT_LABELS[m].toLowerCase()}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Setting up keeps your dose and start date if a methadone or buprenorphine plan is already entered, and
        starts from 5% every 14 days - the guide's own example. Adjust both to the patient.
      </p>

      {medicine ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            This plan against the NSW bands
          </h4>
          {unit !== 'mg' ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">Set the unit to mg to check this plan.</p>
          ) : checks.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No reductions in the plan yet.</p>
          ) : tooFast.length === 0 && tooSoon.length === 0 ? (
            <p className="text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={14} /> Every reduction is within the NSW range for its band, and each dose is held
              at least a week.
            </p>
          ) : (
            <div className="text-xs flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {tooFast.length > 0 &&
                  `${tooFast.length} reduction${tooFast.length === 1 ? ' is' : 's are'} bigger than the NSW range. `}
                {tooSoon.length > 0 &&
                  `${tooSoon.length} dose${tooSoon.length === 1 ? ' is' : 's are'} held for less than a week. `}
                Slow the taper, or check that the dose form can make smaller steps (compounding).
              </span>
            </div>
          )}
          {checks.length > 0 && unit === 'mg' && (
            <div className="overflow-x-auto max-h-[22rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Step</th>
                    <th className="text-right font-medium px-3 py-2">From</th>
                    <th className="text-right font-medium px-3 py-2">To</th>
                    <th className="text-right font-medium px-3 py-2">Drop</th>
                    <th className="text-left font-medium px-3 py-2">NSW range</th>
                    <th className="text-left font-medium px-3 py-2">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map(c => (
                    <tr key={c.stepIndex} className="border-t border-slate-100 dark:border-slate-700/60">
                      <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.stepIndex + 1}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatMg(c.fromDose)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.toDose === 0 ? 'Stop' : formatMg(c.toDose)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatMg(c.drop)}</td>
                      <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">
                        {stepRange(c.band.stepMg)} <span className="opacity-70">({c.band.label})</span>
                      </td>
                      <td
                        className={`px-3 py-1.5 whitespace-nowrap ${
                          c.tooFast || c.tooSoon
                            ? 'text-amber-700 dark:text-amber-300 font-medium'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {c.tooFast ? 'Bigger than range' : c.tooSoon ? `Held ${c.heldDays} days` : 'Within range'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The current drug is not methadone or buprenorphine, so the plan is not checked against these bands.
        </p>
      )}

      {(['methadone', 'buprenorphine'] as NswOdtMedicine[]).map(m => (
        <div key={m} className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{NSW_ODT_LABELS[m]}</h4>
          <BandTable medicine={m} />
          <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside">
            {NSW_ODT_NOTES[m].map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default NswOdtReference;
