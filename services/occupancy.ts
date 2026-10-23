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
 */

/**
 * Daily doses giving 50% occupancy for drugs with a published value, in mg.
 *
 * Diazepam (GABA-A): every receptor-occupancy figure in the Maudsley diazepam
 * tables (Horowitz & Taylor, 2024) fits this model with an EC50 between 24.4
 * and 25.0mg/day, the spread being the book's rounding to one decimal place.
 */
export const KNOWN_EC50_MG: { [drugName: string]: number } = {
  Diazepam: 24.7
};

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
