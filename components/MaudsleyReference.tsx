import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Download, LineChart as LineChartIcon } from 'lucide-react';
import {
  MAUDSLEY_CITATION,
  MAUDSLEY_DIAZEPAM_REGIMENS,
  MAUDSLEY_NOTES,
  MaudsleyForm,
  MaudsleyRegimen
} from '../services/maudsleyDiazepam';

interface MaudsleyReferenceProps {
  /** Fills the calculator with the starting dose and tablets this regimen assumes. */
  onLoadRegimen: (regimen: MaudsleyRegimen) => void;
  /** Id of the regimen currently drawn on the chart, or null for none. */
  overlaidRegimenId: string | null;
  onToggleOverlay: (regimen: MaudsleyRegimen) => void;
}

const FORM_LABELS: Record<MaudsleyForm, string> = {
  tablets: 'Use tablets',
  'half-tablets': 'Use ½ tablets',
  'quarter-tablets': 'Use ¼ tablets',
  liquid: 'Liquid',
  stop: 'Stop'
};

/** Quarter and liquid steps are the ones a tablet-only plan cannot reach, so they are worth flagging. */
const FORM_STYLES: Record<MaudsleyForm, string> = {
  tablets: 'text-slate-500 dark:text-slate-400',
  'half-tablets': 'text-amber-600 dark:text-amber-400',
  'quarter-tablets': 'text-orange-600 dark:text-orange-400',
  liquid: 'text-purple-600 dark:text-purple-400',
  stop: 'text-emerald-600 dark:text-emerald-400 font-medium'
};

const formatMg = (value: number): string => (value % 1 === 0 ? String(value) : value.toFixed(1));

const RegimenTable: React.FC<{ regimen: MaudsleyRegimen }> = ({ regimen }) => (
  <div className="overflow-x-auto max-h-[26rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
        <tr>
          <th className="text-left font-medium px-3 py-2">Step</th>
          <th className="text-right font-medium px-3 py-2">RO (%)</th>
          <th className="text-right font-medium px-3 py-2">AM (mg)</th>
          <th className="text-right font-medium px-3 py-2">PM (mg)</th>
          <th className="text-right font-medium px-3 py-2">Total daily (mg)</th>
          <th className="text-left font-medium px-3 py-2">Form</th>
        </tr>
      </thead>
      <tbody>
        {regimen.steps.map(step => (
          <tr
            key={step.step}
            className="border-t border-slate-100 dark:border-slate-700/60 odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-800 dark:even:bg-slate-800/50"
          >
            <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{step.step}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{step.ro}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatMg(step.am)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatMg(step.pm)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">
              {formatMg(step.total)}
            </td>
            <td className={`px-3 py-1.5 whitespace-nowrap ${FORM_STYLES[step.form]}`}>
              {FORM_LABELS[step.form]}
              {step.liquidAlternative && <span className="text-slate-400 dark:text-slate-500">&nbsp;*</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MaudsleyReference: React.FC<MaudsleyReferenceProps> = ({
  onLoadRegimen,
  overlaidRegimenId,
  onToggleOverlay
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(MAUDSLEY_DIAZEPAM_REGIMENS[0].id);
  const [showNotes, setShowNotes] = useState(false);

  const active = MAUDSLEY_DIAZEPAM_REGIMENS.find(r => r.id === activeId) ?? MAUDSLEY_DIAZEPAM_REGIMENS[0];
  const isOverlaid = overlaidRegimenId === active.id;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:hidden">
      <button
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 p-6 text-left"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            Maudsley reference: diazepam taper schedules
          </span>
        </span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The three example regimens published in {MAUDSLEY_CITATION} Reproduced for reference — HyperTaper
            does not calculate these numbers, and they are not a substitute for reading the guideline itself.
          </p>

          <div className="flex flex-wrap gap-2">
            {MAUDSLEY_DIAZEPAM_REGIMENS.map(regimen => (
              <button
                key={regimen.id}
                onClick={() => setActiveId(regimen.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  regimen.id === activeId
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {regimen.title} · {regimen.steps.length} steps
              </button>
            ))}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{active.label}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{active.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onLoadRegimen(active)}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              <Download size={13} />
              Load this regimen&apos;s starting point
            </button>
            <button
              onClick={() => onToggleOverlay(active)}
              aria-pressed={isOverlaid}
              className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors font-medium ${
                isOverlaid
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              <LineChartIcon size={13} />
              {isOverlaid ? 'Remove from chart' : 'Compare on chart'}
            </button>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Loading a regimen sets the starting dose to {active.steps[0].total}mg and the available tablets to
            10mg, 5mg and 2mg (quarterable). It does not copy the table into the plan — HyperTaper still
            generates the schedule from your own taper settings.
          </p>

          <RegimenTable regimen={active} />

          <ol className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
            {active.footnotes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ol>

          <div>
            <button
              onClick={() => setShowNotes(open => !open)}
              aria-expanded={showNotes}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1"
            >
              {showNotes ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Deprescribing notes from the guideline
            </button>
            {showNotes && (
              <dl className="mt-3 space-y-3">
                {MAUDSLEY_NOTES.map(note => (
                  <div key={note.heading}>
                    <dt className="text-xs font-semibold text-slate-700 dark:text-slate-200">{note.heading}</dt>
                    <dd className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{note.body}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaudsleyReference;
