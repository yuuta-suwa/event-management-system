/**
 * LegacyBridge：v2.3の既存データ（人生の軸・目標・日モード・最重要行動・振り返り・成長4区分）への型付きアダプタ。
 * 既存の回答は新領域に複製せず、sourceAnchorId による参照だけを使う。
 *
 * 照合結果（spec/DATA_SCHEMA.json v2.1 と実装の実物）
 * - 人生の目的・価値観：kv 'lifeCompass'（単一オブジェクト：desiredWayOfLiving / lifePrinciple / longTermPurpose / values）
 * - 既存目標：goals[]（id, title, status。retired は履歴）
 * - 日モード：dayPlans[].dayMode（advance/prepare/recover）。日付キーは localDate
 * - 最重要行動：dayPlans[].importantAction（文字列。IDではない）→ 追加プロパティ primaryActionId でTODOへリンク
 * - 振り返り：events[kind=DAILY_REVIEW]（payload に executionSummary を任意追記）
 */
import { db } from './db';
import { upsertPlan, type AppData } from './repo';
import { latestPlanByDate } from '../domain/metrics';
import type { DayMode, DayPlan } from '../domain/schema';
import type { PlanNode } from '../domain/planning';

export interface LifeAnchor {
  id: string;
  label: string;
  detail: string | null;
  kind: 'lifeCompass' | 'goal';
  status: string;
}

export const LIFE_COMPASS_ANCHOR = 'legacy:lifeCompass';
export const goalAnchorId = (goalId: string) => `legacy:goal:${goalId}`;

export function getLifeAnchors(data: AppData): LifeAnchor[] {
  const c = data.lifeCompass;
  const label = c.desiredWayOfLiving || c.lifePrinciple || (c.values ?? []).join('・') || '人生の軸（まだ探索中）';
  const detail = [c.lifePrinciple && c.lifePrinciple !== label ? `理念：${c.lifePrinciple}` : null, c.longTermPurpose ? `長期の目的：${c.longTermPurpose}` : null].filter(Boolean).join(' ／ ') || null;
  return [{ id: LIFE_COMPASS_ANCHOR, label, detail, kind: 'lifeCompass', status: c.status }];
}

export function getExistingGoals(data: AppData): LifeAnchor[] {
  return data.goals.filter((g) => g.status !== 'retired').map((g) => ({ id: goalAnchorId(g.id), label: g.title, detail: g.purpose ?? null, kind: 'goal', status: g.status }));
}

/** 参照の解決。見つからなければ null（リンク切れとして表示） */
export function resolveAnchor(data: AppData, anchorId: string | null | undefined): LifeAnchor | null {
  if (!anchorId) return null;
  if (anchorId === LIFE_COMPASS_ANCHOR) return getLifeAnchors(data)[0];
  if (anchorId.startsWith('legacy:goal:')) {
    const g = data.goals.find((x) => x.id === anchorId.slice('legacy:goal:'.length));
    return g ? { id: anchorId, label: g.title, detail: g.purpose ?? null, kind: 'goal', status: g.status } : null;
  }
  return null;
}

export function getDayMode(data: AppData, planDate: string): DayMode | null {
  return latestPlanByDate(data.dayPlans).get(planDate)?.dayMode ?? null;
}

/** その日の最重要行動にリンクされたTODO（行動名が一致しているときだけ有効） */
export function primaryActionIdFor(data: AppData, planDate: string): string | null {
  const plan = latestPlanByDate(data.dayPlans).get(planDate) as (DayPlan & { primaryActionId?: string | null }) | undefined;
  if (!plan?.primaryActionId) return null;
  const node = data.executionPlanning.planNodes.find((n) => n.id === plan.primaryActionId);
  return node && node.title === plan.importantAction ? node.id : null;
}

/** TODOをその日の最重要行動にする。v2.3の dayPlan を正本として1回の操作で更新する */
export async function linkPrimaryAction(planDate: string, action: PlanNode): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.dayPlans, d.events, d.experiments, d.kv, d.planNodes], async () => {
    const plan = await upsertPlan({
      date: planDate,
      importantAction: action.title,
      startCue: action.startCue ?? null,
      doneWhen: action.doneCriteria ?? null,
      replanReason: '目標ツリーのTODOを最重要行動に選んだ',
    });
    const cur = await d.dayPlans.get(plan.id);
    if (cur) await d.dayPlans.put({ ...cur, primaryActionId: action.id } as DayPlan);
  });
}

/** 振り返りへの接続：既存の記録は変えず、実行計画の要約を追記できる形で返す */
export function executionSummaryText(s: { validBlocks: number; recordedBlocks: number; completedBlocks: number; movedBlocks: number }): string {
  if (s.validBlocks === 0 && s.movedBlocks === 0) return '今日の予定枠はありません。';
  return `予定枠 ${s.validBlocks}件：記録 ${s.recordedBlocks}件・完了 ${s.completedBlocks}件・未記録 ${s.validBlocks - s.recordedBlocks}件${s.movedBlocks ? `・延期 ${s.movedBlocks}件` : ''}`;
}
