import { describe, it, expect } from 'vitest';
import { Denomination, LiquidConfig } from '../types';
import { getMaudsleyRegimen } from './maudsleyDiazepam';
import { makeUpMaudsleyDose, maudsleyTabletPlan } from './maudsleyTablets';

const fiveAndTwo: Denomination[] = [
  { id: 'five', strength: 5, canSplit: 'quarter' },
  { id: 'two', strength: 2, canSplit: 'quarter' }
];

const liquid: LiquidConfig = {
  enabled: true,
  mode: 'below',
  switchBelowDose: 5,
  maxTabletDropPercent: 10,
  concentration: 1,
  measureIncrementMl: 0.1
};

describe('makeUpMaudsleyDose', () => {
  it('makes a whole-tablet dose from tablets', () => {
    const dose = makeUpMaudsleyDose(30, fiveAndTwo);
    expect(dose.exact).toBe(true);
    expect(dose.dose).toBe(30);
    expect(dose.tablets).toEqual({ five: 6 });
  });

  it('uses a cut tablet for the half and quarter doses', () => {
    const dose = makeUpMaudsleyDose(0.5, fiveAndTwo);
    expect(dose.exact).toBe(true);
    expect(dose.tablets).toEqual({ two: 0.25 });
  });

  it('gives nothing for a zero dose', () => {
    expect(makeUpMaudsleyDose(0, fiveAndTwo)).toMatchObject({ exact: true, dose: 0, tablets: {} });
  });

  it('flags a dose the tablets cannot make and gives the nearest they can', () => {
    // 4.8mg: quarters reach 4.75 (a quarter of 5mg is 1.25) and 5, so 4.75 is nearest.
    const dose = makeUpMaudsleyDose(4.8, fiveAndTwo);
    expect(dose.exact).toBe(false);
    expect(dose.target).toBe(4.8);
    expect(dose.dose).toBe(4.75);
  });

  it('fills a gap with liquid when one is set up', () => {
    const dose = makeUpMaudsleyDose(4.8, fiveAndTwo, liquid);
    expect(dose.exact).toBe(true);
    expect(dose.liquidMl).toBe(4.8);
    expect(dose.tablets).toEqual({});
  });

  it('prefers tablets over liquid when the tablets can make the dose', () => {
    expect(makeUpMaudsleyDose(4, fiveAndTwo, liquid).tablets).toEqual({ two: 2 });
  });

  it('ignores a liquid that is switched off', () => {
    expect(makeUpMaudsleyDose(4.8, fiveAndTwo, { ...liquid, enabled: false }).exact).toBe(false);
  });
});

describe('maudsleyTabletPlan', () => {
  it('makes every faster-taper dose exactly from 5mg and 2mg tablets cut into quarters', () => {
    const plan = maudsleyTabletPlan(getMaudsleyRegimen('faster')!, fiveAndTwo, undefined, 14);
    expect(plan.inexactStepCount).toBe(0);
    plan.steps.forEach(({ step, am, pm }) => {
      expect(am.dose).toBe(step.am);
      expect(pm.dose).toBe(step.pm);
    });
  });

  it('counts the supply at the given days per step', () => {
    const plan = maudsleyTabletPlan(getMaudsleyRegimen('faster')!, fiveAndTwo, undefined, 14);
    // Tablet milligrams taken must equal the regimen's daily doses x 14 days.
    const mgTaken = 5 * (plan.totalTablets.five ?? 0) + 2 * (plan.totalTablets.two ?? 0);
    const mgPrescribed = getMaudsleyRegimen('faster')!.steps.reduce((sum, s) => sum + s.total, 0) * 14;
    expect(mgTaken).toBeCloseTo(mgPrescribed, 6);
    expect(plan.totalLiquidMl).toBe(0);
  });

  it('counts the slower taper liquid steps when tablets cannot make them', () => {
    const slower = getMaudsleyRegimen('slower')!;
    const withoutLiquid = maudsleyTabletPlan(slower, fiveAndTwo, undefined, 7);
    expect(withoutLiquid.inexactStepCount).toBeGreaterThan(0);

    const withLiquid = maudsleyTabletPlan(slower, fiveAndTwo, liquid, 7);
    expect(withLiquid.inexactStepCount).toBe(0);
    expect(withLiquid.totalLiquidMl).toBeGreaterThan(0);
  });
});

describe('per-step supply', () => {
  it('counts each tablet kind for a step held 14 days', () => {
    const plan = maudsleyTabletPlan(getMaudsleyRegimen('faster')!, fiveAndTwo, undefined, 14);
    // Step 1: 30mg morning and night = 6 x 5mg each, so 12 a day for 14 days.
    expect(plan.steps[0].stepTablets).toEqual({ five: 168 });
    // Step 17: 3mg + 4mg = 1.5 + 2 x 2mg a day.
    expect(plan.steps[16].stepTablets).toEqual({ two: 49 });
    expect(plan.steps[23].stepTablets).toEqual({});
  });
});
