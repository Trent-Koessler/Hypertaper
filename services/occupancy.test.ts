import { describe, it, expect } from 'vitest';
import { KNOWN_EC50_MG, doseForOccupancy, receptorOccupancy } from './occupancy';
import { MAUDSLEY_DIAZEPAM_REGIMENS } from './maudsleyDiazepam';

describe('receptor occupancy', () => {
  it('is half at the EC50 and zero at no dose', () => {
    expect(receptorOccupancy(24.7, 24.7)).toBeCloseTo(50, 9);
    expect(receptorOccupancy(0, 24.7)).toBe(0);
  });

  it('converts back to the same dose', () => {
    for (const dose of [0.25, 1, 7.5, 24.7, 60, 200]) {
      expect(doseForOccupancy(receptorOccupancy(dose, 24.7), 24.7)).toBeCloseTo(dose, 9);
    }
  });

  it('gives no dose for zero or negative occupancy', () => {
    expect(doseForOccupancy(0, 24.7)).toBe(0);
    expect(doseForOccupancy(-3, 24.7)).toBe(0);
  });

  // The book prints occupancy to one decimal place and the EC50 is itself rounded,
  // so each figure is within 0.1 points.
  it.each(MAUDSLEY_DIAZEPAM_REGIMENS)('reproduces the Maudsley $id table with the diazepam EC50', regimen => {
    regimen.steps.forEach(step => {
      expect(Math.abs(receptorOccupancy(step.total, KNOWN_EC50_MG.Diazepam) - step.ro)).toBeLessThanOrEqual(0.1);
    });
  });
});
