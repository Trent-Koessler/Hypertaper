import { describe, expect, it } from 'vitest';
import {
  BUPRENORPHINE_BANDS,
  METHADONE_BANDS,
  checkAgainstNsw,
  nswBandFor,
  nswMedicineForName,
  nswOdtPreset,
  parseNswPreset
} from './nswOdtTaper';
import { generateSchedule } from './weaningLogic';

// NSW Health, Safe prescribing of medicines for the management of opioid
// dependence in NSW (2026), sections 22.3-22.4. The SUD Toolkit holds the same
// tables (data/otp-completion.js); both are pinned to the guide here.
describe('NSW 2026 taper bands', () => {
  it('match section 22.3 (methadone)', () => {
    expect(METHADONE_BANDS.map(b => b.stepMg)).toEqual([
      [10, 20], [5, 10], [2.5, 5], [1, 2.5], [0.5, 1], [0.5, 1.25]
    ]);
  });

  it('match section 22.4 (sublingual buprenorphine)', () => {
    expect(BUPRENORPHINE_BANDS.map(b => b.stepMg)).toEqual([
      [2, 4], [1, 2], [0.4, 2], [0.2, 0.4], [0.1, 0.2], [0.1, 0.1]
    ]);
  });

  it('put a dose on a shared edge in the lower band', () => {
    expect(nswBandFor('methadone', 120)?.label).toBe('60-120mg');
    expect(nswBandFor('methadone', 60)?.label).toBe('30-60mg');
    expect(nswBandFor('methadone', 5)?.label).toBe('5-15mg');
    expect(nswBandFor('methadone', 4)?.label).toBe('<5mg');
    expect(nswBandFor('buprenorphine', 0.4)?.label).toBe('0.4-2mg');
    expect(nswBandFor('buprenorphine', 0.2)?.label).toBe('<0.4mg');
    expect(nswBandFor('methadone', 0)).toBeNull();
  });
});

describe('links and names', () => {
  it('reads only the two known presets', () => {
    expect(parseNswPreset('nsw-methadone')).toBe('methadone');
    expect(parseNswPreset('nsw-buprenorphine')).toBe('buprenorphine');
    expect(parseNswPreset('diazepam')).toBeNull();
    expect(parseNswPreset(null)).toBeNull();
  });

  it('recognises the medicine from the drug name', () => {
    expect(nswMedicineForName('Methadone')).toBe('methadone');
    expect(nswMedicineForName('buprenorphine')).toBe('buprenorphine');
    expect(nswMedicineForName('Suboxone')).toBe('buprenorphine');
    expect(nswMedicineForName('Diazepam')).toBeNull();
  });
});

describe('the presets', () => {
  it('give methadone as 5mg/mL liquid measured to 0.1mL', () => {
    const { drug, wean } = nswOdtPreset('methadone', 80, '2026-11-05');
    expect(drug.currentDose).toBe(80);
    expect(drug.liquid?.enabled).toBe(true);
    expect(drug.liquid?.mode).toBe('whole');
    expect(drug.liquid?.concentration).toBe(5);
    expect(drug.liquid?.measureIncrementMl).toBe(0.1);
    expect(wean.intervalDays).toBeGreaterThanOrEqual(7);
    expect(wean.reductionValue).toBe(5);
  });

  it('give buprenorphine the three Subutex strengths, unsplit', () => {
    const { drug } = nswOdtPreset('buprenorphine', 16, '2026-11-05');
    expect(drug.denominations.map(d => d.strength)).toEqual([8, 2, 0.4]);
    expect(drug.denominations.every(d => d.canSplit === 'no')).toBe(true);
  });

  // The preset is a starting point, but it should not itself break the guide
  // where the dose form can follow it: methadone liquid can, all the way down.
  it('keeps a methadone taper from 100mg inside the NSW range at every step', () => {
    const { drug, wean } = nswOdtPreset('methadone', 100, '2026-11-05');
    const schedule = generateSchedule(drug, wean);
    const checks = checkAgainstNsw('methadone', schedule.steps);
    expect(checks.length).toBeGreaterThan(10);
    expect(checks.filter(c => c.tooFast)).toEqual([]);
    expect(checks.filter(c => c.tooSoon)).toEqual([]);
  });
});

describe('the check', () => {
  const step = (actualDose: number, durationDays: number, isStop = false) => ({
    date: '2026-11-05', dayIndex: 0, durationDays, targetDose: actualDose, actualDose, tablets: {},
    pieces: [], reductionFromPrevious: null, reductionPercent: null, isStop
  });

  it('flags a drop bigger than the band allows, and a dose held under a week', () => {
    const checks = checkAgainstNsw('methadone', [step(100, 14), step(85, 5), step(80, 14)]);
    expect(checks[0]).toMatchObject({ fromDose: 100, toDose: 85, drop: 15, tooFast: true });
    expect(checks[1]).toMatchObject({ drop: 5, tooFast: false, tooSoon: true, heldDays: 5 });
  });

  it('checks the stop step from the last dose', () => {
    const checks = checkAgainstNsw('buprenorphine', [step(2, 14), step(0, 0, true)]);
    expect(checks[0]).toMatchObject({ fromDose: 2, toDose: 0, drop: 2, tooFast: true });
  });
});
