import { describe, it, expect } from 'vitest';
import { generateSchedule, findBestTabletCombination, findLiquidDose } from './weaningLogic';
import { DrugConfig, WeanConfig, Denomination, LiquidConfig } from '../types';

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
    expect(findBestTabletCombination(24, DEFAULTS)).toEqual({ actualDose: 0, tablets: {}, pieces: [] });
    expect(findBestTabletCombination(0.4, FINE)).toEqual({ actualDose: 0, tablets: {}, pieces: [] });
  });

  it('reports the pieces that make up the dose, largest first', () => {
    const { actualDose, pieces } = findBestTabletCombination(17.5, FINE);
    expect(actualDose).toBe(17.5);
    expect(pieces.reduce((sum, p) => sum + p.subtotal, 0)).toBeCloseTo(actualDose, 6);
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i].strength).toBeLessThanOrEqual(pieces[i - 1].strength);
    }
  });

  it('describes split pieces by their real strength, not the tablet strength', () => {
    const { pieces } = findBestTabletCombination(2.5, [{ id: 'a', strength: 10, canSplit: 'quarter' }]);
    expect(pieces).toEqual([
      { denomId: 'a', strength: 2.5, tabletFraction: 0.25, pieceCount: 1, subtotal: 2.5 }
    ]);
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

  it('prescribes the stop dose itself before ceasing', () => {
    // "Stop at 5mg" means 5mg is the last dose taken, not the dose below the
    // last one taken. The old engine ceased from 10mg and said nothing.
    const result = generateSchedule(
      drug(FINE, { currentDose: 20 }),
      wean({ reductionType: 'fixed', reductionValue: 5, intervalDays: 7, minimumDoseThreshold: 5 })
    );
    expect(result.steps.filter(s => !s.isStop).map(s => s.actualDose)).toEqual([20, 15, 10, 5]);
    expect(result.endReason).toBe('reached-stop-dose');
  });

  it('does not cease from a dose above the requested stop dose without saying so', () => {
    const result = generateSchedule(drug(DEFAULTS), wean({ minimumDoseThreshold: 0.5 }));
    const held = result.steps.filter(s => !s.isStop);
    const last = held[held.length - 1];
    expect(last.actualDose).toBeGreaterThan(0.5);
    expect(result.endReason).toBe('granularity-limited');
    expect(result.warnings.join(' ')).toMatch(/ceases from 25mg/i);
  });

  it('flags a step that drops far more steeply than requested', () => {
    // 50mg and 25mg tablets can only express a 50% drop, not the 10% asked for.
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.warnings.join(' ')).toMatch(/force a 50% drop/i);
  });

  it('does not flag drops that track the requested reduction', () => {
    // 0.25mg pieces are fine enough to follow a 10% curve down to 10mg, so
    // every realised drop lands within a whisker of the requested one.
    const result = generateSchedule(
      drug([{ id: '1', strength: 1, canSplit: 'quarter' }], { currentDose: 20 }),
      wean({ reductionValue: 10, minimumDoseThreshold: 10 })
    );
    expect(result.warnings.join(' ')).not.toMatch(/drop/i);
    result.steps
      .filter(s => !s.isStop && s.reductionPercent !== null)
      .forEach(s => expect(s.reductionPercent).toBeLessThan(15));
  });

  it('flags the tail of a taper, where a fixed piece size bites hardest', () => {
    // The same 0.25mg granularity that tracks a 10% curve at 20mg cannot
    // express one at 1mg — the Maudsley argument for liquids at the tail.
    const result = generateSchedule(
      drug([{ id: '1', strength: 1, canSplit: 'quarter' }], { currentDose: 20 }),
      wean({ reductionValue: 10, minimumDoseThreshold: 0.25 })
    );
    expect(result.warnings.join(' ')).toMatch(/drop/i);
  });

  it('records the realised reduction against the previous prescribed dose', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    const held = result.steps.filter(s => !s.isStop);
    expect(held[0].reductionFromPrevious).toBeNull();
    expect(held[1].reductionFromPrevious).toBe(25); // 50 -> 25
    expect(held[1].reductionPercent).toBe(50);
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

  it('does not print a cessation step for a plan it had to truncate', () => {
    // A 1% taper of 100mg in 0.001mg pieces cannot finish inside the iteration
    // cap. Emitting "STOP" here would instruct cessation from ~0.66mg.
    const result = generateSchedule(
      drug([{ id: '1', strength: 0.001, canSplit: 'no' }], { currentDose: 100 }),
      wean({ reductionValue: 1, intervalDays: 1, minimumDoseThreshold: 0 })
    );
    expect(result.endReason).toBe('truncated');
    expect(result.steps.some(s => s.isStop)).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/incomplete/i);
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

  it('reports the end date and total days independently of the stop step', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.totalDays).toBe(
      result.steps.filter(s => !s.isStop).reduce((sum, s) => sum + s.durationDays, 0)
    );
    expect(result.endDate).toBe(result.steps[result.steps.length - 1].date);
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

describe('derivation', () => {
  it('has one entry per reduction interval, not per collapsed step', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.derivation).toHaveLength(result.targetCurve.length - 1);
    expect(result.derivation.filter(d => d.startsNewStep)).toHaveLength(
      result.steps.filter(s => !s.isStop).length
    );
  });

  it('shows pieces that sum exactly to the prescribed dose', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    result.derivation.forEach(entry => {
      const sum = entry.pieces.reduce((total, p) => total + p.subtotal, 0);
      expect(sum).toBeCloseTo(entry.actualDose, 6);
      expect(entry.actualFormula).toContain(String(entry.actualDose));
    });
  });

  it('states a target that matches the closed-form curve it quotes', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    result.derivation.forEach(entry => {
      const closedForm = 30 * Math.pow(0.9, entry.intervalIndex);
      expect(entry.targetDose).toBeCloseTo(closedForm, 4);
      expect(entry.targetFormula).toContain(String(entry.targetDose));
    });
  });

  it('uses the fixed-reduction formula for a fixed taper', () => {
    const result = generateSchedule(
      drug(FINE, { currentDose: 20 }),
      wean({ reductionType: 'fixed', reductionValue: 5, minimumDoseThreshold: 0 })
    );
    expect(result.derivation[2].targetFormula).toBe('20 - (2 x 5) = 10mg');
  });

  it('never claims a dose above the target it was derived from', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    result.derivation.forEach(entry => {
      expect(entry.actualDose).toBeLessThanOrEqual(entry.targetDose);
      expect(entry.shortfall).toBeGreaterThanOrEqual(0);
    });
  });

  it('tracks the dose as a percentage of the starting dose', () => {
    const result = generateSchedule(drug(DEFAULTS), wean());
    expect(result.startingDose).toBe(50);
    expect(result.derivation[0].percentOfStartingDose).toBe(100);
    expect(result.derivation[result.derivation.length - 1].percentOfStartingDose).toBe(50);
  });
});

describe('liquid formulation', () => {
  const liquid = (overrides: Partial<LiquidConfig> = {}): LiquidConfig => ({
    enabled: true,
    mode: 'below',
    switchBelowDose: 2,
    maxTabletDropPercent: 15,
    concentration: 1,
    measureIncrementMl: 0.1,
    ...overrides
  });
  const DIAZEPAM: Denomination[] = [
    { id: '5', strength: 5, canSplit: 'quarter' },
    { id: '2', strength: 2, canSplit: 'quarter' }
  ];

  it('rounds a liquid dose down to whole measuring increments', () => {
    expect(findLiquidDose(1.85, liquid())).toEqual({ actualDose: 1.8, tablets: {}, pieces: [], liquidMl: 1.8 });
    expect(findLiquidDose(1.8, liquid()).actualDose).toBe(1.8);
    expect(findLiquidDose(0.95, liquid({ concentration: 2, measureIncrementMl: 0.2 })).liquidMl).toBe(0.4);
    expect(findLiquidDose(0.05, liquid()).actualDose).toBe(0);
  });

  it('switches to liquid only once the target falls below the switch dose', () => {
    const result = generateSchedule(drug(DIAZEPAM, { currentDose: 10, liquid: liquid() }), wean());
    const held = result.steps.filter(step => !step.isStop);
    held.forEach(step => {
      if (step.targetDose >= 2) expect(step.liquidMl).toBeUndefined();
      else expect(step.liquidMl).toBeGreaterThan(0);
    });
    expect(held.some(step => step.liquidMl !== undefined)).toBe(true);
  });

  it('removes the steep tail drop that quartered tablets force', () => {
    const steepest = (result: ReturnType<typeof generateSchedule>) =>
      Math.max(...result.steps.filter(step => !step.isStop).map(step => step.reductionPercent ?? 0));

    // Quartered 2mg tablets can only go 1mg -> 0.5mg at the end: a 50% cut.
    const tabletsOnly = generateSchedule(drug(DIAZEPAM, { currentDose: 10 }), wean());
    expect(steepest(tabletsOnly)).toBe(50);

    // 0.1mL of a 1mg/mL liquid keeps every step within a few points of 10%.
    const withLiquid = generateSchedule(drug(DIAZEPAM, { currentDose: 10, liquid: liquid() }), wean());
    expect(steepest(withLiquid)).toBeLessThan(20);

    // A finer measure removes the steep-drop warning altogether.
    const finer = generateSchedule(
      drug(DIAZEPAM, { currentDose: 10, liquid: liquid({ measureIncrementMl: 0.05 }) }),
      wean()
    );
    expect(finer.warnings.some(w => w.includes('steeper than the requested reduction'))).toBe(false);
  });

  it('never steps up when changing from tablets to liquid', () => {
    // 5mg whole tablets only: tablets fall far below the curve, and the liquid
    // tracks the curve closely, so the first liquid dose would exceed the last tablet dose.
    const coarse: Denomination[] = [{ id: '5', strength: 5, canSplit: 'no' }];
    const result = generateSchedule(
      drug(coarse, { currentDose: 10, liquid: liquid({ switchBelowDose: 8 }) }),
      wean()
    );
    const doses = result.steps.map(step => step.actualDose);
    for (let i = 1; i < doses.length; i++) expect(doses[i]).toBeLessThanOrEqual(doses[i - 1]);
  });

  it('gives every step as liquid in whole-taper mode, without needing tablets', () => {
    const result = generateSchedule(drug([], { currentDose: 10, liquid: liquid({ mode: 'whole' }) }), wean());
    const held = result.steps.filter(step => !step.isStop);
    expect(held.length).toBeGreaterThan(0);
    held.forEach(step => {
      expect(step.liquidMl).toBeGreaterThan(0);
      expect(step.tablets).toEqual({});
      expect(step.actualDose).toBeLessThanOrEqual(step.targetDose);
    });
    expect(result.endReason).toBe('reached-stop-dose');
  });

  it('totals liquid volume over each step duration', () => {
    const result = generateSchedule(drug([], { currentDose: 10, liquid: liquid({ mode: 'whole' }) }), wean());
    const expected = result.steps
      .filter(step => step.liquidMl !== undefined)
      .reduce((sum, step) => sum + step.liquidMl! * step.durationDays, 0);
    expect(result.totalLiquidMl).toBeCloseTo(expected, 4);
    expect(result.totalTablets).toEqual({});
  });

  it('shows the volume arithmetic in the derivation', () => {
    const result = generateSchedule(drug([], { currentDose: 10, liquid: liquid({ mode: 'whole' }) }), wean());
    expect(result.derivation[1].actualFormula).toBe('9mL x 1mg/mL = 9mg');
  });

  it('ignores the liquid settings when liquid is switched off', () => {
    const off = generateSchedule(
      drug(DIAZEPAM, { currentDose: 10, liquid: liquid({ enabled: false, mode: 'whole' }) }),
      wean()
    );
    expect(off.steps.every(step => step.liquidMl === undefined)).toBe(true);
    expect(off.totalLiquidMl).toBe(0);
  });

  it('stays on tablets until a tablet step would exceed the drop tolerance', () => {
    const result = generateSchedule(
      drug(DIAZEPAM, { currentDose: 10, liquid: liquid({ mode: 'tolerance', maxTabletDropPercent: 15 }) }),
      wean()
    );
    const held = result.steps.filter(step => !step.isStop);
    const firstLiquid = held.findIndex(step => step.liquidMl !== undefined);
    expect(firstLiquid).toBeGreaterThan(0);

    // Every change while on tablets is within tolerance...
    held.slice(1, firstLiquid).forEach(step => expect(step.reductionPercent!).toBeLessThanOrEqual(15));
    // ...and once on liquid, the plan never goes back to tablets.
    held.slice(firstLiquid).forEach(step => expect(step.liquidMl).toBeGreaterThan(0));
    // The switch itself happens because the next tablet dose would have dropped too far.
    const tabletsOnly = generateSchedule(drug(DIAZEPAM, { currentDose: 10 }), wean());
    const lastTabletDose = held[firstLiquid - 1].actualDose;
    const nextTablet = tabletsOnly.steps.find(step => step.actualDose < lastTabletDose)!;
    expect(nextTablet.isStop || nextTablet.reductionPercent! > 15).toBe(true);
  });

  it('switches to liquid when the tablets run out, rather than stopping early', () => {
    const coarse: Denomination[] = [{ id: '5', strength: 5, canSplit: 'no' }];
    const result = generateSchedule(
      drug(coarse, { currentDose: 10, liquid: liquid({ mode: 'tolerance', maxTabletDropPercent: 60 }) }),
      wean()
    );
    expect(result.endReason).toBe('reached-stop-dose');
    expect(result.steps.some(step => step.liquidMl !== undefined)).toBe(true);
  });

  it('never steps up in tolerance mode', () => {
    const coarse: Denomination[] = [{ id: '5', strength: 5, canSplit: 'no' }];
    const result = generateSchedule(
      drug(coarse, { currentDose: 10, liquid: liquid({ mode: 'tolerance', maxTabletDropPercent: 60 }) }),
      wean()
    );
    const doses = result.steps.map(step => step.actualDose);
    for (let i = 1; i < doses.length; i++) expect(doses[i]).toBeLessThanOrEqual(doses[i - 1]);
  });

  it('rejects an unusable liquid', () => {
    const result = generateSchedule(
      drug(DIAZEPAM, { currentDose: 10, liquid: liquid({ concentration: 0 }) }),
      wean()
    );
    expect(result.steps).toEqual([]);
    expect(result.warnings.some(w => w.includes('liquid concentration'))).toBe(true);
  });
});

describe('morning and night split', () => {
  const DIAZEPAM: Denomination[] = [
    { id: '5', strength: 5, canSplit: 'quarter' },
    { id: '2', strength: 2, canSplit: 'quarter' }
  ];
  const twice = (overrides: Partial<DrugConfig> = {}) =>
    drug(DIAZEPAM, { currentDose: 10, dosesPerDay: 2, ...overrides });

  it('does not change the daily dose, only how it is taken', () => {
    const once = generateSchedule(drug(DIAZEPAM, { currentDose: 10 }), wean());
    const split = generateSchedule(twice(), wean());
    expect(split.derivation.map(e => e.actualDose)).toEqual(once.derivation.map(e => e.actualDose));
  });

  it('makes morning plus night equal the daily dose, with night the larger', () => {
    const result = generateSchedule(twice(), wean());
    result.steps.filter(step => !step.isStop).forEach(step => {
      const { am, pm } = step.split!;
      expect(am.dose + pm.dose).toBeCloseTo(step.actualDose, 6);
      expect(am.dose).toBeLessThanOrEqual(pm.dose);
    });
  });

  it('counts the tablets for each dose time, and the daily tablets are their sum', () => {
    const result = generateSchedule(twice(), wean());
    result.steps.filter(step => !step.isStop).forEach(step => {
      const { am, pm } = step.split!;
      const ids = new Set([...Object.keys(am.tablets), ...Object.keys(pm.tablets), ...Object.keys(step.tablets)]);
      ids.forEach(id => {
        expect((am.tablets[id] ?? 0) + (pm.tablets[id] ?? 0)).toBeCloseTo(step.tablets[id] ?? 0, 6);
      });
      [am, pm].forEach(part => {
        const fromPieces = part.pieces.reduce((sum, p) => sum + p.subtotal, 0);
        expect(fromPieces).toBeCloseTo(part.dose, 6);
      });
    });
  });

  it('splits evenly when the pieces allow it', () => {
    const { split } = findBestTabletCombination(10, DIAZEPAM, true);
    expect(split!.am.dose).toBe(5);
    expect(split!.pm.dose).toBe(5);
    expect(split!.am.tablets).toEqual({ '5': 1 });
  });

  it('puts the uneven part at night', () => {
    // 7.25mg: 3.625mg is not achievable, so the morning takes the next dose down.
    const { split } = findBestTabletCombination(7.25, DIAZEPAM, true);
    expect(split!.am.dose).toBe(3.5);
    expect(split!.pm.dose).toBe(3.75);
  });

  it('gives the whole dose at night when it cannot be shared, and says so', () => {
    const { split } = findBestTabletCombination(1.25, DIAZEPAM, true);
    expect(split!.am.dose).toBe(0);
    expect(split!.pm.dose).toBe(1.25);

    const result = generateSchedule(twice(), wean());
    expect(result.warnings.some(w => w.includes('cannot divide the daily dose evenly'))).toBe(true);
  });

  it('does not warn about the split when every dose divides evenly', () => {
    const halves: Denomination[] = [{ id: '10', strength: 10, canSplit: 'half' }];
    const result = generateSchedule(
      drug(halves, { currentDose: 20, dosesPerDay: 2 }),
      wean({ reductionType: 'fixed', reductionValue: 10, minimumDoseThreshold: 10 })
    );
    expect(result.warnings.some(w => w.includes('cannot divide'))).toBe(false);
    expect(result.steps[0].split!.am.tablets).toEqual({ '10': 1 });
  });

  it('leaves once-daily plans without a split', () => {
    const result = generateSchedule(drug(DIAZEPAM, { currentDose: 10 }), wean());
    expect(result.steps.every(step => step.split === undefined)).toBe(true);
  });

  it('splits a liquid dose into whole measures, odd measure at night', () => {
    const liquid: LiquidConfig = { enabled: true, mode: 'whole', switchBelowDose: 2, maxTabletDropPercent: 15, concentration: 1, measureIncrementMl: 0.1 };
    const { split } = findLiquidDose(1.9, liquid, true);
    expect(split!.am.liquidMl).toBe(0.9);
    expect(split!.pm.liquidMl).toBe(1);
  });

  it('shows the split arithmetic in the derivation', () => {
    const result = generateSchedule(twice(), wean());
    expect(result.derivation[0].splitFormula).toBe('AM: 1 x 5mg = 5mg | PM: 1 x 5mg = 5mg');
  });
});

describe('first reduction on the start date', () => {
  const onStart = (overrides: Partial<WeanConfig> = {}) => wean({ reduceOnStartDate: true, ...overrides });

  it('takes the first reduction on the start date instead of holding the current dose', () => {
    const usual = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), onStart());
    expect(usual.steps[0]).toMatchObject({ date: '2026-07-31', actualDose: 30 });
    expect(result.steps[0]).toMatchObject({ date: '2026-07-31', dayIndex: 0, actualDose: 27 });
    expect(result.steps[0].reductionFromPrevious).toBe(3);
  });

  it('is the usual plan moved one interval earlier, without the current dose', () => {
    const usual = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), onStart());
    expect(result.steps.map(s => s.actualDose)).toEqual(usual.steps.slice(1).map(s => s.actualDose));
    expect(result.totalDays).toBe(usual.totalDays - 14);
    expect(result.reductionStepCount).toBe(usual.reductionStepCount);
    expect(result.steps[result.steps.length - 1].date).toBe(result.endDate);
  });

  it('does not count tablets for the current dose taken before the start date', () => {
    const usual = generateSchedule(drug(FINE, { currentDose: 30 }), wean());
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), onStart());
    const total = (r: typeof usual) => Object.values(r.totalTablets).reduce((a, b) => a + b, 0);
    expect(total(result)).toBeLessThan(total(usual));
  });

  it('keeps holding past the start date when the first target is still met by the same dose', () => {
    // 30mg cannot be made from whole 25mg tablets, so the plan starts at 25mg,
    // and the first target (27mg) is still met by 25mg: that dose is held on.
    const tabs: Denomination[] = [{ id: '1', strength: 25, canSplit: 'no' }];
    const usual = generateSchedule(drug(tabs, { currentDose: 30 }), wean());
    const result = generateSchedule(drug(tabs, { currentDose: 30 }), onStart());
    expect(usual.steps[0].durationDays).toBeGreaterThan(14);
    expect(result.steps[0]).toMatchObject({ date: '2026-07-31', dayIndex: 0, actualDose: 25, reductionFromPrevious: null });
    expect(result.steps[0].durationDays).toBe(usual.steps[0].durationDays - 14);
    expect(result.steps[1].dayIndex).toBe(result.steps[0].durationDays);
  });

  it('starts the ideal curve on the start date', () => {
    const result = generateSchedule(drug(FINE, { currentDose: 30 }), onStart());
    expect(result.targetCurve[0]).toEqual({ date: '2026-07-31', dose: 27 });
  });
});
