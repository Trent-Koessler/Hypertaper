/**
 * Receptor occupancy from dose, using the Michaelis–Menten (hyperbolic) model
 *
 *   occupancy = Emax x dose / (dose + EC50)
 *
 * where EC50 is the daily dose giving half the maximum occupancy and Emax is
 * that maximum (100% unless a study measured a lower ceiling). Its inverse,
 *
 *   dose = EC50 x occupancy / (Emax - occupancy)
 *
 * turns an occupancy target back into a dose. Equal steps in occupancy need
 * ever-smaller steps in dose, which is why an occupancy-based taper is
 * hyperbolic.
 *
 * The drug values come from services/ed50-bank.json, a copy of the master file
 * in the Psychopharmacology Visualiser repository. Do not edit the copy: change
 * the master and run `npm run sync-bank`.
 */
import bankFile from './ed50-bank.json';

export type Evidence = 'reported' | 'back-calculated' | 'fitted' | 'derived' | 'none';

export interface DrugReferenceEntry {
  id: string;
  name: string;
  drugClass: string;
  /** The drug's id in the Visualiser, or null if the Visualiser does not include it. */
  visualiserId: string | null;
  target: string;
  /** Daily dose for half the maximum occupancy, in mg; null when no usable data exist. */
  ed50_mg: number | null;
  /** Maximum occupancy reported by the source; null means not reported (100% is assumed). */
  emax_pct: number | null;
  evidence: Evidence;
  source: string | null;
  /** How the value was obtained, in plain words. */
  method: string;
  form: 'tablet' | 'capsule' | 'modified-release';
  strengths_mg: number[];
  note: string | null;
}

export interface BankSource {
  citation: string;
  pmid: string | null;
  doi: string | null;
}

interface BankFile {
  drugs: Record<string, Omit<DrugReferenceEntry, 'id'>>;
  sources: Record<string, BankSource>;
}

const bank = bankFile as BankFile;

export const VISUALISER_BASE_URL =
  'https://trent-koessler.github.io/Psychopharmacology_visualiser/';

/** Every drug in the shared bank, keyed by its display name. */
export const DRUG_REFERENCE_BANK: Record<string, DrugReferenceEntry> = Object.fromEntries(
  Object.entries(bank.drugs).map(([id, entry]) => [entry.name, { ...entry, id }])
);

export const BANK_SOURCES: Record<string, BankSource> = bank.sources;

/** Drug classes in the order the bank lists them. */
export const DRUG_CLASSES: string[] = [...new Set(Object.values(DRUG_REFERENCE_BANK).map(d => d.drugClass))];

/** Published EC50 values by drug name, for the drugs that have one. */
export const KNOWN_EC50_MG: { [drugName: string]: number } = Object.fromEntries(
  Object.values(DRUG_REFERENCE_BANK)
    .filter(entry => entry.ed50_mg !== null)
    .map(entry => [entry.name, entry.ed50_mg as number])
);

/** Case-insensitive lookup of a drug in DRUG_REFERENCE_BANK by name or id. */
export function getDrugReference(nameOrId: string): DrugReferenceEntry | undefined {
  if (!nameOrId) return undefined;
  if (DRUG_REFERENCE_BANK[nameOrId]) return DRUG_REFERENCE_BANK[nameOrId];
  const needle = nameOrId.trim().toLowerCase();
  return Object.values(DRUG_REFERENCE_BANK).find(
    entry => entry.name.toLowerCase() === needle || entry.id === needle
  );
}

/** Link that opens a drug and dose in the Visualiser, or null if the Visualiser lacks the drug. */
export function buildVisualiserUrl(nameOrId: string, doseMg?: number): string | null {
  const ref = getDrugReference(nameOrId);
  if (!ref?.visualiserId) return null;
  const params = new URLSearchParams({ drug: ref.visualiserId });
  if (doseMg !== undefined && Number.isFinite(doseMg) && doseMg > 0) {
    params.set('dose', String(doseMg));
  }
  return `${VISUALISER_BASE_URL}?${params.toString()}`;
}

/** Whether an EC50 has been entered that the model can use. */
export const hasEC50 = (ec50: number | undefined): ec50 is number =>
  ec50 !== undefined && Number.isFinite(ec50) && ec50 > 0;

/** The maximum occupancy to use: the value entered if valid, otherwise 100%. */
export const effectiveEmax = (emax: number | undefined): number =>
  emax !== undefined && Number.isFinite(emax) && emax > 0 && emax <= 100 ? emax : 100;

/** Percentage of receptors occupied at a daily dose. */
export function receptorOccupancy(dose: number, ec50: number, emax = 100): number {
  if (!(dose > 0)) return 0;
  return (emax * dose) / (dose + ec50);
}

/** The daily dose that gives an occupancy, in percent. Zero at or below 0%. */
export function doseForOccupancy(occupancy: number, ec50: number, emax = 100): number {
  if (!(occupancy > 0)) return 0;
  if (occupancy >= emax) return Infinity;
  return (ec50 * occupancy) / (emax - occupancy);
}
