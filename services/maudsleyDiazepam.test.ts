import { describe, it, expect } from 'vitest';
import {
  MAUDSLEY_DIAZEPAM_REGIMENS,
  getMaudsleyRegimen,
  maudsleyCurve
} from './maudsleyDiazepam';

/**
 * These tables are transcribed from a published guideline rather than computed,
 * so the risk is a typo in the data, not a bug in an algorithm. The checks below
 * pin the structural invariants of the source tables and spot-check values a
 * clinician would notice were wrong.
 */
describe('Maudsley diazepam regimens', () => {
  const [faster, moderate, slower] = MAUDSLEY_DIAZEPAM_REGIMENS;

  it('has the three published regimens at the step counts printed in the book', () => {
    expect(MAUDSLEY_DIAZEPAM_REGIMENS.map(r => r.id)).toEqual(['faster', 'moderate', 'slower']);
    // Steps 1..24, 1..44 and 1..86, cessation included.
    expect(faster.steps).toHaveLength(24);
    expect(moderate.steps).toHaveLength(44);
    expect(slower.steps).toHaveLength(86);
  });

  it.each(MAUDSLEY_DIAZEPAM_REGIMENS)('$id is numbered 1..n with no gaps', regimen => {
    expect(regimen.steps.map(s => s.step)).toEqual(regimen.steps.map((_, i) => i + 1));
  });

  it.each(MAUDSLEY_DIAZEPAM_REGIMENS)('$id starts at 60mg and ends at cessation', regimen => {
    expect(regimen.steps[0].total).toBe(60);
    expect(regimen.steps[0].ro).toBe(70.8);
    const last = regimen.steps[regimen.steps.length - 1];
    expect(last).toMatchObject({ ro: 0, am: 0, pm: 0, total: 0, form: 'stop' });
  });

  it.each(MAUDSLEY_DIAZEPAM_REGIMENS)('$id has AM + PM equal to the printed total', regimen => {
    for (const step of regimen.steps) {
      expect(step.am + step.pm).toBeCloseTo(step.total, 10);
    }
  });

  it.each(MAUDSLEY_DIAZEPAM_REGIMENS)('$id falls monotonically in both dose and occupancy', regimen => {
    for (let i = 1; i < regimen.steps.length; i++) {
      expect(regimen.steps[i].total).toBeLessThan(regimen.steps[i - 1].total);
      expect(regimen.steps[i].ro).toBeLessThan(regimen.steps[i - 1].ro);
    }
  });

  it.each(MAUDSLEY_DIAZEPAM_REGIMENS)(
    '$id never drops occupancy by more than the rate it advertises',
    regimen => {
      // The final step to zero is the deliberate exception: the guideline notes
      // the last drop before stopping is the largest in occupancy terms.
      const steps = regimen.steps.slice(0, -1);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i - 1].ro - steps[i].ro).toBeLessThanOrEqual(regimen.occupancyStep + 1e-9);
      }
    }
  );

  it('only the slower regimen reaches a liquid formulation', () => {
    expect(faster.steps.some(s => s.form === 'liquid')).toBe(false);
    expect(moderate.steps.some(s => s.form === 'liquid')).toBe(false);
    // The book switches regimen C to liquid once tablets run out, at step 52.
    expect(slower.steps.find(s => s.form === 'liquid')?.step).toBe(52);
  });

  it('spot-checks rows against the printed tables', () => {
    expect(faster.steps[9]).toMatchObject({ step: 10, ro: 44.7, am: 10, pm: 10, total: 20 });
    expect(moderate.steps[16]).toMatchObject({ step: 17, ro: 43.5, am: 9.5, pm: 9.5, total: 19 });
    expect(slower.steps[84]).toMatchObject({ step: 85, ro: 0.8, am: 0.1, pm: 0.1, total: 0.2 });
  });

  it('looks a regimen up by id and reports nothing for an unknown one', () => {
    expect(getMaudsleyRegimen('moderate')).toBe(moderate);
    expect(getMaudsleyRegimen('nonexistent')).toBeUndefined();
  });

  it('lays the curve out one step per reduction interval, starting on day zero', () => {
    const curve = maudsleyCurve(faster, 14);
    expect(curve).toHaveLength(faster.steps.length);
    expect(curve[0]).toEqual({ dayIndex: 0, dose: 60 });
    expect(curve[1].dayIndex).toBe(14);
    expect(curve[curve.length - 1]).toEqual({ dayIndex: 14 * 23, dose: 0 });
  });

  it('keeps the curve advancing even if the interval is degenerate', () => {
    // A zero interval would stack every step on the plan's start date.
    expect(maudsleyCurve(faster, 0)[3].dayIndex).toBe(3);
  });
});
