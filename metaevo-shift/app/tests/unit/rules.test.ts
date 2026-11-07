import { describe, expect, it } from 'vitest';
import { countFullAvoidanceSequences, evaluateRules, frequencyPhrase, type RuleInput } from '../../src/domain/rules';

const base: RuleInput = {
  currentRoute: 'execute', compassStatus: 'provisional', hasActiveGoal: true, sharingResistance: null, hypothesisIds: [],
  todayPlan: { id: 'p', localDate: '2026-11-08', dayMode: 'advance', status: 'planned', importantAction: '提案を送る', startCue: '10時' },
  context: null, selfReportedState: {}, recentStartedDays: 0, hasOutcomeMeasure: true, recentOutcomeEvidence: 0, recentEvents: [],
};

describe('ルールエンジン（純関数）', () => {
  it('安全が最優先', () => {
    expect(evaluateRules({ ...base, context: 'internal', selfReportedState: { safetyConcern: true } }).ruleId).toBe('R_SAFE');
  });
  it('回復日は R_REST、休息を未達成扱いしない', () => {
    const r = evaluateRules({ ...base, todayPlan: { ...base.todayPlan!, dayMode: 'recover', status: 'rest' }, context: 'external' });
    expect(r.ruleId).toBe('R_REST');
    expect(r.uncertainty).toContain('未達成として扱いません');
  });
  it('本人が押した外部中断／内的切替のコンテキストを優先', () => {
    expect(evaluateRules({ ...base, context: 'external' }).ruleId).toBe('R_EXTERNAL');
    expect(evaluateRules({ ...base, context: 'internal' }).ruleId).toBe('R_INTERNAL');
  });
  it('探索中・計画なし → R_NO_DIRECTION', () => {
    expect(evaluateRules({ ...base, currentRoute: 'explore', compassStatus: 'exploring', todayPlan: null }).ruleId).toBe('R_NO_DIRECTION');
  });
  it('公開への抵抗 → R_DISCLOSURE（開示を求めない）', () => {
    const r = evaluateRules({ ...base, currentRoute: 'protect', todayPlan: null });
    expect(r.ruleId).toBe('R_DISCLOSURE');
    expect(r.message).toContain('他人に見せなくて構いません');
  });
  it('方法不明 → R_NO_METHOD', () => {
    expect(evaluateRules({ ...base, currentRoute: 'plan', todayPlan: null }).ruleId).toBe('R_NO_METHOD');
    expect(evaluateRules({ ...base, context: 'unsure_method' }).ruleId).toBe('R_NO_METHOD');
  });
  it('計画なし → R_NO_PLAN', () => {
    expect(evaluateRules({ ...base, todayPlan: null }).ruleId).toBe('R_NO_PLAN');
  });
  it('行動は増えたが成果がない → R_FEEDBACK（成果を断定しない）', () => {
    const r = evaluateRules({ ...base, recentStartedDays: 5, recentOutcomeEvidence: 0 });
    expect(r.ruleId).toBe('R_FEEDBACK');
    expect(r.message).toContain('成果はまだ確認できません');
  });
  it('整っていれば R_NORMAL', () => {
    expect(evaluateRules(base).ruleId).toBe('R_NORMAL');
  });
  it('同一入力には同一出力（決定的）', () => {
    expect(evaluateRules(base)).toEqual(evaluateRules(base));
  });
  it('閾値：1回と3回以上で文言が変わる', () => {
    expect(frequencyPhrase(1, '切替')).toBe('切替の記録がありました。');
    expect(frequencyPhrase(3, '切替')).toContain('複数回記録されました');
    expect(frequencyPhrase(0, '切替')).toBeNull();
  });
  it('感情→別作業→安心の全要素が揃わなければ回避を数えない', () => {
    const e = (payload: Record<string, unknown>) => ({ id: Math.random().toString(), kind: 'INTERNAL_SWITCH' as const, occurredAt: '2026-11-08T00:00:00Z', localDate: '2026-11-08', planId: null, payload });
    expect(countFullAvoidanceSequences([e({ otherActivity: '資料整理' }), e({ feeling: '不安', otherActivity: '資料整理', afterFeeling: '安心' })])).toBe(1);
  });
});
