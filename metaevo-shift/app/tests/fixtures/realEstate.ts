/**
 * 仕様書8章「不動産トスアップ1件」の具体例（架空のテストデータ。件数・時間は試算）。
 * ユーザー提供パックの examples/real_estate_one_tossup.json は手元にないため、仕様本文から作成。
 */
import type { ExecutionPlanning, PlanNode } from '../../src/domain/planning';

const T = '2026-11-10T00:00:00.000Z';
const node = (id: string, kind: PlanNode['kind'], title: string, parentId: string | null, order: number, extra: Partial<PlanNode> = {}): PlanNode => ({
  id, kind, title, parentId, order, sourceAnchorId: null, relatedGoalIds: [], collapsed: false, archivedAt: null, provisional: false, doneCriteria: null, estimateMinutes: null,
  dependsOn: [], startCue: null, prep: null, dueDate: null, importance: null, urgency: null, triage: null, quadrantOrder: 0, note: null, successCriteria: null, metric: null,
  createdAt: T, updatedAt: T, ...extra,
});

export function realEstateExample(): ExecutionPlanning {
  return {
    version: 1,
    featureVersion: '2.4',
    planNodes: [
      node('re_goal_activity', 'goal', '信頼される営業力を育てる', null, 1, { sourceAnchorId: 'legacy:lifeCompass' }),
      node('re_goal_month', 'goal', '不動産トスアップ1件', 're_goal_activity', 1, { metric: 'トスアップ成立件数', successCriteria: '対象条件・本人同意・受領確認がそろう' }),
      node('re_ms_conditions', 'milestone', '紹介条件を把握する', 're_goal_month', 1),
      node('re_todo_conditions', 'action', '連携担当へ対象条件と必要情報を確認する', 're_ms_conditions', 1, { doneCriteria: '対象条件・受領方法をメモに記録', estimateMinutes: 15, importance: 4, urgency: 2 }),
      node('re_ms_candidates', 'milestone', '見込み候補を整理する', 're_goal_month', 2),
      node('re_todo_candidates', 'action', '既存の接点から候補3人を洗い出す', 're_ms_candidates', 1, { doneCriteria: '候補3人の名前と接点をメモ', estimateMinutes: 15, importance: 4, urgency: 2, dependsOn: ['re_todo_conditions'] }),
      node('re_ms_consent', 'milestone', '本人のニーズ・同意を確認する', 're_goal_month', 3),
      node('re_todo_consent', 'action', '相談を希望するか1人に確認する', 're_ms_consent', 1, { doneCriteria: '希望の有無を記録', estimateMinutes: 10 }),
      node('re_ms_handoff', 'milestone', '担当者へ引き継ぎ受領確認', 're_goal_month', 4),
      node('re_todo_handoff', 'action', '本人同意の範囲で情報を引き継ぐ', 're_ms_handoff', 1, { doneCriteria: '担当者から受領の返信', estimateMinutes: 10 }),
    ],
    scheduleBlocks: [],
    executionEvents: [],
    ifThenRules: [],
    outcomeRecords: [],
  };
}
