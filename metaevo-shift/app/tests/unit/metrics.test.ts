import { describe, expect, it } from 'vitest';
import { computeActionMetrics, computeOutcomes, startRateText, returnRateText } from '../../src/domain/metrics';
import type { AppEvent, DayPlan, Goal } from '../../src/domain/schema';
import { addDays } from '../../src/domain/dates';

const plan = (date: string, status: DayPlan['status'], dayMode: DayPlan['dayMode'] = 'advance'): DayPlan => ({
  id: `p-${date}`, localDate: date, dayMode, status, importantAction: status === 'rest' ? null : '提案を送る', plannedAt: `${date}T00:00:00Z`,
});

describe('KPI厳密定義', () => {
  const start = '2026-11-08';
  const end = addDays(start, 13);
  const today = addDays(end, 1);
  // 14日：休息2、未計画2、予定10（着手6・未実行2・未記録2）
  const statuses: (DayPlan['status'] | null)[] = ['completed', 'in_progress', 'completed', 'not_started', 'paused', 'completed', 'not_started', 'completed', 'planned', 'unknown', 'rest', 'rest', null, null];
  const plans = statuses.flatMap((s, i) => (s ? [plan(addDays(start, i), s, s === 'rest' ? 'recover' : 'advance')] : []));

  it('記録のある8日中6日着手 → 75%、残る予定2日は不明', () => {
    const m = computeActionMetrics(plans, [], start, end, today);
    expect(m.plannedDays).toBe(10);
    expect(m.knownDays).toBe(8);
    expect(m.startedDays).toBe(6);
    expect(m.restDays).toBe(2);
    expect(m.unplannedDays).toBe(2);
    expect(m.startRate).toBe(0.75);
    expect(startRateText(m)).toBe('着手率 75%（記録がある8日中6日）。予定した残り2日の結果は不明');
  });
  it('休息日は分母に含めない', () => {
    const m = computeActionMetrics([plan(start, 'rest', 'recover'), plan(addDays(start, 1), 'completed')], [], start, addDays(start, 1), today);
    expect(m.plannedDays).toBe(1);
    expect(m.startRate).toBe(1);
  });
  it('分母0は0%ではなく未計測', () => {
    const m = computeActionMetrics([plan(start, 'planned')], [], start, start, today);
    expect(m.startRate).toBeNull();
    expect(startRateText(m)).toContain('未計測');
    expect(startRateText(m)).not.toContain('0%');
  });
  it('未記録が多い日々は0%と断定しない（データ不足）', () => {
    const ps = Array.from({ length: 14 }, (_, i) => plan(addDays(start, i), i === 0 ? 'completed' : 'planned'));
    const m = computeActionMetrics(ps, [], start, end, today);
    expect(m.startRate).toBe(1);
    expect(m.unknownDays).toBe(13);
    expect(m.lowCoverage).toBe(true);
  });
  it('今日の未確定の予定は不明に数えない', () => {
    const m = computeActionMetrics([plan(today, 'planned')], [], today, today, today);
    expect(m.unknownDays).toBe(0);
    expect(m.pendingDays).toBe(1);
  });
  it('外部中断の復帰率は、復帰可否が分かった件数のみが分母', () => {
    const ev = (id: string, outcome: unknown): AppEvent => ({ id, kind: 'EXTERNAL_INTERRUPT', occurredAt: `${start}T01:00:00Z`, localDate: start, planId: null, payload: { resumeOutcome: outcome } });
    const m = computeActionMetrics([], [ev('a', 'resumed'), ev('b', 'not_resumed'), ev('c', null)], start, end, today);
    expect(m.returnRate).toBe(0.5);
    expect(returnRateText(m)).toContain('1件は未記録');
  });
  it('内的切替と外部中断を別々に集計', () => {
    const e = (kind: AppEvent['kind']): AppEvent => ({ id: kind, kind, occurredAt: `${start}T01:00:00Z`, localDate: start, planId: null, payload: {} });
    const m = computeActionMetrics([], [e('INTERNAL_SWITCH'), e('EXTERNAL_INTERRUPT')], start, end, today);
    expect(m.internalSwitches).toBe(1);
    expect(m.externalInterrupts).toBe(1);
  });
  it('成果は基準値との差（単位・計測日つき）', () => {
    const g: Goal = { id: 'g', status: 'provisional', title: '商談', sharing: 'private', createdAt: '2026-11-07T00:00:00Z', outcomeMeasure: { id: 'm', kinds: [], description: null, unit: '件', baseline: 2, baselineDate: '2026-11-07', target: null } };
    const out = computeOutcomes([g], [{ id: 'e', layer: 'outcome', observedAt: '2026-11-15T12:00:00Z', description: '商談', goalId: 'g', quantity: 4, unit: '件', baselineQuantity: 2 }]);
    expect(out[0].change).toBe(2);
    expect(out[0].unit).toBe('件');
  });
});
