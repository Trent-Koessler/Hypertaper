import { describe, it, expect } from 'vitest';
import { generateSchedule, findBestTabletCombination } from './weaningLogic';
import { DrugConfig, WeanConfig, Denomination } from '../types';

const drug = (denominations: Denomination[], overrides: Partial<DrugConfig> = {}): DrugConfig => ({
  name: 'Test',
  currentDose: 50,
  unit: 'mg',
  startDate: '2026-07-31',
  denominations,
  ...overrides
});

const wean = (overrides: Partial<WeanConfig> = {}): WeanConfig => ({
  reductionType: 'percentage',
  reductionValue: 10,
  intervalDays: 14,
  minimumDoseThreshold: 0.5,
  ...overrides
});

const DEFAULTS: Denomination[] = [
  { id: '1', strength: 50, canSplit: 'half' },
  { id: '2', strength: 25, canSplit: 'no' }
];

const FINE: Denomination[] = [
  { id: '1', strength: 10, canSplit: 'quarter' },
  { id: '2', strength: 5, canSplit: 'quarter' },
  { id: '3', strength: 2, canSplit: 'quarter' }
];

describe('findBestTabletCombination', () => {
  it('never returns a dose above the target', () => {
    for (const target of [45, 40.5, 36.45, 23.9, 15.7, 12.4, 7.3, 1.2]) {
      const { actualDose } = findBestTabletCombination(target, DEFAULTS);
      expect(actualDose).toBeLessThanOrEqual(target);
    }
  });

  it('hits achievable doses exactly', () => {
    expect(findBestTabletCombination(50, DEFAULTS).actualDose).toBe(50);
    expect(findBestTabletCombination(75, DEFAULTS).actualDose).toBe(75);
    expect(findBestTabletCombination(25, DEFAULTS).actualDose).toBe(25);
  });

  it('returns the largest achievable dose at or below the target', () => {
    expect(findBestTabletCombination(45, DEFAULTS).actualDose).toBe(25);
    expect(findBestTabletCombination(74, DEFAULTS).actualDose).toBe(50);
    expect(findBestTabletCombination(17.4, FINE).actualDose).toBe(17.25);
  });

  it('returns zero when nothing small enough can be made', () => {
    expect(findBestTabletCombination(24, DEFAULTS)).toEqual({ actualDose: 0, tablets: {} });
    expect(findBestTabletCombination(0.4, FINE)).toEqual({ actualDose: 0, tablets: {} });
  });

  it('prefers whole tablets over splitting when both reach the dose', () => {
    const { tablets } = findBestTabletCombination(25, DEFAULTS);
    // A whole 25mg tablet, not half of the 50mg one.
    expect(tablets).toEqual({ '2': 1 });
  });

  it('uses the fewest pieces', () => {
    const { tablets, actualDose } = findBestTabletCombination(50, DEFAULTS);
    expect(actualDose).toBe(50);
    expect(tablets).toEqual({ '1': 1 });
  });

  it('reports halves and quarters as tablet fractions', () => {
    const { actualDose, tablets } = findBestTabletCombination(
      2.5, [{ id: 'a', strength: 10, canSplit: 'quarter' }]
    );
    expect(actualDose).toBe(2.5);
    expect(tablets).toEqual({ a: 0.25 });
  });

  it('ignores blank and invalid denominations', () => {
    const withBlank: Denomination[] = [...DEFAULTS, { id: '3', strength: 0, canSplit: 'no' }];
    expect(findBestTabletCombination(50, withBlank).actualDose).toBe(50);
    expect(findBestTabletCombination(50, [{ id: 'x', strength: NaN }]).actualDose).toBe(0);
    expect(findBestTabletCombination(50, [{ id: 'x', strength: -5 }]).actualDose).toBe(0);
  });

  it('handles awkward fractional strengths without drifting', () => {
    const odd: Denomination[] = [{ id: 'a', strength: 37.5, canSplit: 'quarter' }];
    const { actualDose } = findBestTabletCombination(28.125, odd);
    expect(actualDose).toBe(28.125); // 3 quarters of 37.5
  });

  it('stays fast with a large formulary', () => {
    const many: Denomination[] = [10, 5, 2, 1, 25, 50, 20, 15].map((s, i) => ({
      id: String(i), strength: s, canSplit: 'quarter'
    }));
    const started = Date.now();
    findBestTabletCombination(30, many);
    expect(Date.now() - started).toBeLessThan(250);
  });
});

describe('generateSchedule', () => {
  it('does not emit steps that prescribe nothing', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    const zeroDoseSteps = result.steps.filter(s => !s.isStop && s.actualDose === 0);
    expect(zeroDoseSteps).toEqual([]);
  });

  it('ends with exactly one stop step', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.steps.filter(s => s.isStop)).toHaveLength(1);
    expect(result.steps[result.steps.length - 1].isStop).toBe(true);
  });

  it('never increases the dose', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    const doses = result.steps.map(s => s.actualDose);
    for (let i = 1; i < doses.length; i++) {
      expect(doses[i]).toBeLessThanOrEqual(doses[i - 1]);
    }
  });

  it('never prescribes above the taper target', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    result.steps.filter(s => !s.isStop).forEach(step => {
      expect(step.actualDose).toBeLessThanOrEqual(step.targetDose);
    });
  });

  it('collapses repeated doses into a single held step', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    const doses = result.steps.filter(s => !s.isStop).map(s => s.actualDose);
    expect(new Set(doses).size).toBe(doses.length);
    expect(doses).toEqual([50, 25]);
  });

  it('reports duration from the collapsed steps', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    const held = result.steps.filter(s => !s.isStop);
    const totalDays = held.reduce((sum, s) => sum + s.durationDays, 0);
    expect(result.durationWeeks).toBe(Math.ceil(totalDays / 7));
    // The old engine reported 88 weeks for this plan by counting empty steps.
    expect(result.durationWeeks).toBeLessThan(30);
  });

  it('counts reduction steps without counting the starting dose', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.reductionStepCount).toBe(1); // 50 -> 25
  });

  it('spaces dates by the held duration', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.steps[0].date).toBe('2026-07-31');
    expect(result.steps[1].date).toBe('2026-08-14'); // 50mg held for one interval
  });

  it('keeps dates on the calendar across a DST boundary', () => {
    const result = generateSchedule(
      drug(FINE, { currentDose: 30, startDate: '2026-10-25' }),
      wean({ intervalDays: 7 })
    );
    const dates = result.steps.map(s => s.date);
    for (let i = 1; i < dates.length; i++) {
      const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000;
      expect(Number.isInteger(gap)).toBe(true);
      expect(gap % 7).toBe(0);
    }
  });

  it('samples the ideal curve at every interval, not just at dose changes', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    // The plan collapses to two held doses, but the curve must stay dense
    // enough to draw the intended hyperbolic shape between them.
    expect(result.steps.filter(s => !s.isStop)).toHaveLength(2);
    expect(result.targetCurve.length).toBeGreaterThan(result.steps.length);

    const doses = result.targetCurve.map(p => p.dose);
    for (let i = 1; i < doses.length; i++) {
      expect(doses[i]).toBeLessThan(doses[i - 1]);
    }
  });

  it('spans the ideal curve across the full plan', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.targetCurve[0].date).toBe(result.steps[0].date);
    expect(result.targetCurve[result.targetCurve.length - 1].date)
      .toBe(result.steps[result.steps.length - 1].date);
    expect(result.targetCurve[result.targetCurve.length - 1].dose).toBeGreaterThanOrEqual(0);
  });

  it('spaces the ideal curve by the reduction interval', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean({ intervalDays: 7 }));
    const dates = result.targetCurve.map(p => Date.parse(p.date));
    for (let i = 1; i < dates.length - 1; i++) {
      expect((dates[i] - dates[i - 1]) / 86_400_000).toBe(7);
    }
  });

  it('totals tablets using each step duration', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    const expected: Record<string, number> = {};
    result.steps.filter(s => !s.isStop).forEach(step => {
      Object.entries(step.tablets).forEach(([id, count]) => {
        expected[id] = (expected[id] || 0) + count * step.durationDays;
      });
    });
    expect(result.totalTablets).toEqual(expected);
  });

  it('warns when the tablets are too coarse for the requested reduction', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.warnings.join(' ')).toMatch(/smallest available piece/i);
  });

  it('warns when the taper cannot reach the stop dose', () => {
    const result = generateSchedule(drug(DEFAULTS), wean({ minimumDoseThreshold: 0.5 }));
    expect(result.warnings.join(' ')).toMatch(/no smaller dose can be made/i);
  });

  it.each([
    ['a cleared reduction field', wean({ reductionValue: 0 })],
    ['a negative reduction', wean({ reductionValue: -10 })],
    ['a zero fixed reduction', wean({ reductionType: 'fixed', reductionValue: 0 })],
    ['a reduction over 100%', wean({ reductionValue: 150 })]
  ])('rejects %s instead of running away', (_label, config) => {
    const result = generateSchedule(drug(DEFAULTS), config);
    expect(result.steps).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('terminates when the stop dose is zero', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean({ minimumDoseThreshold: 0 }));
    expect(result.steps.length).toBeLessThan(60);
    expect(result.steps[result.steps.length - 1].isStop).toBe(true);
  });

  it('rejects a missing dose or empty denomination list', () => {
    expect(generateSchedule(drug(DEFAULTS, { currentDose: 0 }), wean()).warnings.length).toBeGreaterThan(0);
    expect(generateSchedule(drug([]), wean()).warnings.length).toBeGreaterThan(0);
  });

  it('falls back to today when the start date is blank', () => {
    const result = generateSchedule(drug(DEFAULTS, { startDate: '' }), wean());
    expect(result.warnings.join(' ')).toMatch(/start date/i);
    expect(result.steps[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('clamps a sub-day interval to one day', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean({ intervalDays: 0 }));
    result.steps.filter(s => !s.isStop).forEach(s => expect(s.durationDays).toBeGreaterThanOrEqual(1));
    expect(result.warnings.join(' ')).toMatch(/at least one day/i);
  });

  it('supports a fixed-amount taper', () => {
    const result = generateSchedule(
      drug(FINE, { currentDose: 20 }),
      wean({ reductionType: 'fixed', reductionValue: 5, minimumDoseThreshold: 0 })
    );
    expect(result.steps.filter(s => !s.isStop).map(s => s.actualDose)).toEqual([20, 15, 10, 5]);
  });

  it('generates a whole plan quickly with a large formulary', () => {
    const many: Denomination[] = [10, 5, 2, 1, 25, 50, 20, 15].map((s, i) => ({
      id: String(i), strength: s, canSplit: 'quarter'
    }));
    const started = Date.now();
    generateSchedule(drug(many, { currentDose: 100 }), wean({ minimumDoseThreshold: 0.25 }));
    // The previous engine took ~18s for this shape, freezing the browser tab.
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
