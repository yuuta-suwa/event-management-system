import { describe, expect, it } from 'vitest';
import { ageOn, computeLifeClock, lifeClockSummary, NOT_A_PREDICTION, REACHED_MESSAGE, validateHorizon, yearProgress } from '../../src/domain/lifeClock';

describe('LIFE CLOCK 計算', () => {
  it('節目未選択なら週の数値を出さない', () => {
    expect(computeLifeClock({ birthDate: '1990-01-01', planningHorizonAge: null, today: '2026-11-07' }).kind).toBe('not_configured');
  });
  it('生年月日も生年もなければ問いだけ（数値なし）', () => {
    expect(computeLifeClock({ planningHorizonAge: 90, today: '2026-11-07' })).toEqual({ kind: 'not_configured', reason: 'no_birth' });
  });
  it('正確な生年月日で経過週と節目までの週を算出', () => {
    const r = computeLifeClock({ birthDate: '1990-11-07', planningHorizonAge: 90, today: '2026-11-07' });
    expect(r.kind).toBe('exact');
    if (r.kind !== 'exact') return;
    expect(r.ageYears).toBe(36);
    expect(r.weeksLived).toBe(Math.floor(13149 / 7));
    expect(r.milestoneDate).toBe('2080-11-07');
    expect(r.weeksLived + r.weeksToMilestone).toBe(r.totalWeeks);
    expect(r.weeksToMilestone).toBeGreaterThan(0);
  });
  it('2月29日生まれ：非閏年の誕生日は2月28日', () => {
    expect(ageOn('2000-02-29', '2001-02-27')).toBe(0);
    expect(ageOn('2000-02-29', '2001-02-28')).toBe(1);
    const r = computeLifeClock({ birthDate: '2000-02-29', planningHorizonAge: 81, today: '2026-11-07' });
    expect(r.kind === 'exact' && r.milestoneDate).toBe('2081-02-28');
  });
  it('年跨ぎ（12/31→1/1）で値が連続', () => {
    const a = computeLifeClock({ birthDate: '1990-06-15', planningHorizonAge: 90, today: '2026-12-31' });
    const b = computeLifeClock({ birthDate: '1990-06-15', planningHorizonAge: 90, today: '2027-01-01' });
    if (a.kind !== 'exact' || b.kind !== 'exact') throw new Error('exact expected');
    expect(b.weeksLived - a.weeksLived).toBeGreaterThanOrEqual(0);
    expect(b.weeksLived - a.weeksLived).toBeLessThanOrEqual(1);
  });
  it('節目超過でも負の値を出さない', () => {
    const r = computeLifeClock({ birthDate: '1940-01-01', planningHorizonAge: 80, today: '2026-11-07' });
    expect(r.kind).toBe('exact_reached');
    expect(lifeClockSummary(r, 80)).toBe(REACHED_MESSAGE);
    const same = computeLifeClock({ birthDate: '1946-11-07', planningHorizonAge: 80, today: '2026-11-07' });
    expect(same.kind).toBe('exact_reached');
  });
  it('生年のみは概算（年の帯）', () => {
    const r = computeLifeClock({ birthYear: 1990, planningHorizonAge: 90, today: '2026-11-07' });
    expect(r.kind).toBe('approx');
    if (r.kind !== 'approx') return;
    expect([r.ageMin, r.ageMax]).toEqual([35, 36]);
    expect(lifeClockSummary(r, 90)).toContain('概算');
  });
  it('範囲外の節目・未来の生年月日は拒否', () => {
    expect(validateHorizon(0)).not.toBeNull();
    expect(validateHorizon(121)).not.toBeNull();
    expect(validateHorizon(120)).toBeNull();
    expect(computeLifeClock({ birthDate: '2030-01-01', planningHorizonAge: 90, today: '2026-11-07' }).kind).toBe('invalid');
  });
  it('要約には「寿命の予測ではない」を常に含め、死亡日を示す語を含まない', () => {
    const r = computeLifeClock({ birthDate: '1990-11-07', planningHorizonAge: 90, today: '2026-11-07' });
    const s = lifeClockSummary(r, 90);
    expect(s).toContain(NOT_A_PREDICTION);
    expect(s).not.toMatch(/死亡|余命|命はあと|死ぬまで/);
  });
  it('年表示は今年の週のみ', () => {
    expect(yearProgress('2026-01-01').weekOfYear).toBe(1);
    expect(yearProgress('2026-12-31').daysLeftInYear).toBe(0);
  });
});
