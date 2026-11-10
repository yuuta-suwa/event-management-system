import { describe, expect, it } from 'vitest';
import {
  actionCompleted, blockDateTime, canMove, checkIntegrity, dayExecMetrics, freeSlots, goalProgress, isPlannable, mergeExecutionPlanning, overlaps, quadrantOf,
  rateText, repeatedlyPostponed, scoresForQuadrant, suggestForCondition, urgencySuggestion, validateBlockTime, childrenMap, executionPlanningSchema,
  type ExecutionEvent, type ExecutionPlanning, type ScheduleBlock,
} from '../../src/domain/planning';
import { realEstateExample } from '../fixtures/realEstate';

const T = '2026-11-10T05:00:00.000Z';
const blk = (id: string, actionId: string, start: number, dur: number, state: ScheduleBlock['state'] = 'placed', planDate = '2026-11-10'): ScheduleBlock => ({ id, planDate, actionId, startMinute: start, durationMinutes: dur, state, movedFromBlockId: null, movedToBlockId: null, moveReason: null, overlapConfirmed: false, createdAt: T, updatedAt: T });
const ev = (id: string, actionId: string, blockId: string | null, kind: ExecutionEvent['kind'], at = T, reason: ExecutionEvent['reason'] = null): ExecutionEvent => ({ id, actionId, blockId, planDate: '2026-11-10', kind, reason, note: null, criteriaMet: null, evidence: null, resumeAt: null, firstStep: null, occurredAt: at });

describe('v2.4 4象限（N08）', () => {
  it('重要4・緊急2は第2象限（重要・緊急でない）', () => {
    expect(quadrantOf({ importance: 4, urgency: 2 })).toBe(2);
    expect(quadrantOf({ importance: 3, urgency: 3 })).toBe(1);
    expect(quadrantOf({ importance: 2, urgency: 5 })).toBe(3);
    expect(quadrantOf({ importance: 1, urgency: 1 })).toBe(4);
    expect(quadrantOf({ importance: null, urgency: 4 })).toBeNull();
  });
  it('象限へのドロップは象限に合う既存評価を変えない', () => {
    expect(scoresForQuadrant(2, { importance: 5, urgency: 1 })).toEqual({ importance: 5, urgency: 1 });
    expect(scoresForQuadrant(2, { importance: 2, urgency: 4 })).toEqual({ importance: 4, urgency: 2 });
  });
  it('N09 期日が近いと緊急度の提案だけ出す（値は変えない）', () => {
    const n = { dueDate: '2026-11-11', urgency: 1 };
    expect(urgencySuggestion(n, '2026-11-10')).toContain('あと1日');
    expect(n.urgency).toBe(1);
    expect(urgencySuggestion({ dueDate: '2026-11-30', urgency: 1 }, '2026-11-10')).toBeNull();
  });
});

describe('v2.4 時間割 07:00〜25:00（N13/N14/N15）', () => {
  it('範囲：07:00開始OK、25:00開始NG、25:00終了OK、25:01終了NG', () => {
    expect(validateBlockTime(420, 15)).toBeNull();
    expect(validateBlockTime(419, 15)).not.toBeNull();
    expect(validateBlockTime(1500, 1)).not.toBeNull();
    expect(validateBlockTime(1470, 30)).toBeNull();
    expect(validateBlockTime(1470, 31)).not.toBeNull();
    expect(validateBlockTime(600, 0)).not.toBeNull();
  });
  it('11/10の24:30〜25:00は内部日時 11/11 00:30〜01:00、計画日は11/10', () => {
    expect(blockDateTime('2026-11-10', 1470)).toEqual({ date: '2026-11-11', time: '00:30', iso: '2026-11-11T00:30:00+09:00' });
    expect(blockDateTime('2026-11-10', 1500).iso).toBe('2026-11-11T01:00:00+09:00');
    expect(blockDateTime('2026-12-31', 1470).date).toBe('2027-01-01');
  });
  it('重複の検出と空き時間', () => {
    const bs = [blk('a', 'x', 600, 60), blk('b', 'x', 700, 30, 'moved')];
    expect(overlaps(bs, '2026-11-10', 630, 15).map((b) => b.id)).toEqual(['a']);
    expect(overlaps(bs, '2026-11-10', 660, 15)).toEqual([]);
    expect(freeSlots(bs, '2026-11-10')).toEqual([{ start: 420, end: 600 }, { start: 660, end: 1500 }]);
  });
});

describe('v2.4 ツリー（N03/N04/N06）', () => {
  const ep = realEstateExample();
  it('任意の深さ（目標→目標→中間成果→TODO）を保持', () => {
    const cm = childrenMap(ep.planNodes);
    expect(cm.get(null)!.map((n) => n.id)).toEqual(['re_goal_activity']);
    expect(cm.get('re_goal_month')!.map((n) => n.id)).toEqual(['re_ms_conditions', 're_ms_candidates', 're_ms_consent', 're_ms_handoff']);
  });
  it('子孫の下への移動（循環）を拒否', () => {
    expect(canMove(ep.planNodes, 're_goal_month', 're_todo_conditions').ok).toBe(false);
    expect(canMove(ep.planNodes, 're_goal_month', 're_goal_month').ok).toBe(false);
    expect(canMove(ep.planNodes, 're_ms_consent', 're_ms_conditions').ok).toBe(true);
  });
  it('タイトルだけのTODOは下書き。完了条件と所要時間で計画可能になる', () => {
    const n = { kind: 'action' as const, title: '連絡する', doneCriteria: null, estimateMinutes: null };
    expect(isPlannable(n)).toBe(false);
    expect(isPlannable({ ...n, doneCriteria: '送信済み', estimateMinutes: 10 })).toBe(true);
    expect(isPlannable({ ...n, kind: 'goal', doneCriteria: 'x', estimateMinutes: 10 })).toBe(false);
  });
});

describe('v2.4 計測（FR-404）と成果の独立（N16/N18/N22/N34）', () => {
  it('未記録は不明として別に数え、分母0は「—」', () => {
    const ep = { scheduleBlocks: [blk('b1', 'a', 600, 15), blk('b2', 'a', 700, 15)], executionEvents: [ev('e1', 'a', 'b1', 'completed')] };
    const m = dayExecMetrics(ep, '2026-11-10', null);
    expect(m.recordedBlocks).toBe(1);
    expect(m.unrecordedBlocks).toBe(1);
    expect(m.recordRate).toBe(0.5);
    expect(m.executionRate).toBe(0.5);
    const empty = dayExecMetrics({ scheduleBlocks: [], executionEvents: [] }, '2026-11-10', null);
    expect(empty.recordRate).toBeNull();
    expect(rateText(empty.executionRate)).toBe('—（評価対象なし）');
  });
  it('1タスク複数枠の完了はタスクとして1回だけ', () => {
    const ep = { scheduleBlocks: [blk('b1', 'a', 600, 15), blk('b2', 'a', 900, 15)], executionEvents: [ev('e1', 'a', 'b1', 'completed'), ev('e2', 'a', 'b2', 'completed', '2026-11-10T06:00:00Z')] };
    const m = dayExecMetrics(ep, '2026-11-10', null);
    expect(m.completedBlocks).toBe(2);
    expect(m.completedActions).toBe(1);
  });
  it('完了→再オープン→再完了：履歴は残り、完了は1回', () => {
    const evs = [ev('1', 'a', null, 'completed', '2026-11-10T01:00:00Z'), ev('2', 'a', null, 'reopened', '2026-11-10T02:00:00Z')];
    expect(actionCompleted(evs, 'a')).toBe(false);
    evs.push(ev('3', 'a', null, 'completed', '2026-11-10T03:00:00Z'));
    expect(actionCompleted(evs, 'a')).toBe(true);
  });
  it('延期率と中断理由の別集計', () => {
    const ep = { scheduleBlocks: [blk('b1', 'a', 600, 15, 'moved'), blk('b2', 'a', 700, 15)], executionEvents: [ev('x', 'a', 'b2', 'interrupted', T, 'external'), ev('y', 'a', 'b2', 'interrupted', '2026-11-10T06:00:00Z', 'internal'), ev('z', 'a', 'b2', 'interrupted', '2026-11-10T07:00:00Z', 'rest')] };
    const m = dayExecMetrics(ep, '2026-11-10', null);
    expect(m.postponeRate).toBe(0.5);
    expect(m.interruptsByReason).toMatchObject({ external: 1, internal: 1, rest: 1 });
  });
  it('TODOを完了しても成果は0件のまま（N22）', () => {
    const ep = realEstateExample();
    ep.executionEvents.push(ev('c', 're_todo_conditions', null, 'completed'));
    const p = goalProgress(ep, 're_goal_month');
    expect(p.actionsCompleted).toBe(1);
    expect(p.actionsTotal).toBe(4);
    expect(p.outcomes).toHaveLength(0);
  });
  it('延期が2回以上続くTODOを改善候補にする（N24）', () => {
    const ep = realEstateExample();
    ep.scheduleBlocks.push(blk('m1', 're_todo_candidates', 600, 15, 'moved'), blk('m2', 're_todo_candidates', 600, 15, 'moved', '2026-11-11'), blk('m3', 're_todo_candidates', 600, 15, 'placed', '2026-11-12'));
    expect(repeatedlyPostponed(ep).map((x) => [x.action.id, x.moves])).toEqual([['re_todo_candidates', 2]]);
  });
});

describe('v2.4 IF→THEN（N20）', () => {
  it('15分以内の重要TODOだけを提案（予定は変えない純関数）', () => {
    const ep = realEstateExample();
    const before = JSON.stringify(ep);
    const s = suggestForCondition(ep, { condition: 'cancelled', maxMinutes: 15, onlyImportant: true });
    expect(s.map((x) => x.actionId)).toEqual(['re_todo_conditions', 're_todo_candidates']);
    expect(JSON.stringify(ep)).toBe(before);
  });
});

describe('v2.4 整合性チェック12項目・マージ（N26/N27/N28）', () => {
  const legacy = { goalIds: [], hasLifeCompass: true };
  it('サンプルは整合', () => {
    expect(checkIntegrity(realEstateExample(), legacy)).toEqual({ errors: [], warnings: [] });
  });
  it('ID重複・親不在・循環・予定範囲・行動不一致・成果の参照先を検出', () => {
    const ep = realEstateExample();
    ep.planNodes.push({ ...ep.planNodes[0] });
    ep.planNodes.push({ ...ep.planNodes[1], id: 'orphan', parentId: 'nope' });
    ep.planNodes.find((n) => n.id === 're_goal_activity')!.parentId = 're_ms_conditions';
    ep.scheduleBlocks.push(blk('bad', 're_todo_conditions', 1490, 30), blk('goalblk', 're_goal_month', 600, 15));
    ep.executionEvents.push(ev('mismatch', 're_todo_consent', 'bad', 'started'));
    ep.outcomeRecords.push({ id: 'o', goalNodeId: 're_todo_conditions', date: '2026-11-10', metric: null, value: 1, unit: '件', qualitative: null, evidence: null, createdAt: T });
    const r = checkIntegrity(ep, legacy);
    const all = r.errors.join('\n');
    for (const w of ['IDが重複', '親ノードが存在しません', '循環', '範囲外', 'TODO以外', '一致しません', '成果記録はTODOではなく']) expect(all).toContain(w);
  });
  it('既存データへのリンク切れは警告（安全に表示）', () => {
    const ep = realEstateExample();
    ep.planNodes[0].sourceAnchorId = 'legacy:goal:missing';
    expect(checkIntegrity(ep, legacy).warnings[0]).toContain('リンク切れ');
  });
  it('同じデータを2回マージしても重複しない。内容違いは競合として報告', () => {
    const base = realEstateExample();
    const once = mergeExecutionPlanning(base, realEstateExample());
    expect(once.added).toBe(0);
    expect(once.identical).toBe(base.planNodes.length);
    const changed = realEstateExample();
    changed.planNodes[3].title = '別の内容';
    changed.planNodes.push({ ...changed.planNodes[3], id: 'new1' });
    const r = mergeExecutionPlanning(base, changed);
    expect(r.added).toBe(1);
    expect(r.conflicts).toEqual([{ collection: 'planNodes', id: 're_todo_conditions' }]);
    expect(r.merged.planNodes.find((n) => n.id === 're_todo_conditions')!.title).toBe('連携担当へ対象条件と必要情報を確認する');
  });
  it('不正な型はスキーマで拒否', () => {
    expect(executionPlanningSchema.safeParse({ version: 1, planNodes: [{ id: 1 }], scheduleBlocks: [], executionEvents: [], ifThenRules: [], outcomeRecords: [] }).success).toBe(false);
  });
});

describe('v2.4 大量データ（N33・純関数）', () => {
  it('500ノード・200予定枠でもツリー構築・整合性・計測が高速', () => {
    const ep: ExecutionPlanning = { version: 1, planNodes: [], scheduleBlocks: [], executionEvents: [], ifThenRules: [], outcomeRecords: [] };
    for (let g = 0; g < 10; g++) {
      ep.planNodes.push({ ...realEstateExample().planNodes[0], id: `g${g}`, sourceAnchorId: null, title: `目標${g}` });
      for (let a = 0; a < 49; a++) ep.planNodes.push({ ...realEstateExample().planNodes[3], id: `g${g}a${a}`, parentId: `g${g}`, order: a, title: `TODO ${g}-${a}` });
    }
    for (let i = 0; i < 200; i++) ep.scheduleBlocks.push(blk(`b${i}`, `g${i % 10}a${i % 49}`, 420 + (i % 70) * 15, 15, 'placed', `2026-11-${String(10 + (i % 10)).padStart(2, '0')}`));
    const t0 = performance.now();
    const cm = childrenMap(ep.planNodes);
    const r = checkIntegrity(ep, { goalIds: [], hasLifeCompass: true });
    const m = dayExecMetrics(ep, '2026-11-10', null);
    const ms = performance.now() - t0;
    expect(ep.planNodes).toHaveLength(500);
    expect(cm.get(null)).toHaveLength(10);
    expect(r.errors).toEqual([]);
    expect(m.validBlocks).toBe(20);
    console.log(`[N33] 500ノード・200予定枠：ツリー構築＋整合性チェック＋計測 ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(500);
  });
});
