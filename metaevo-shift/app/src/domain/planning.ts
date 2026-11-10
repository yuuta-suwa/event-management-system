/**
 * v2.4 行動設計・実行管理（executionPlanning）ドメイン。
 * 仕様：ユーザー提供「MetaEVO Shift v2.4 完全引継ぎ（1ファイル版）」／照合結果は docs/11_V2_4_EXECUTION_PLANNING.md
 * 既存v2.3のデータは変更しない。人生の目的・既存目標は sourceAnchorId による参照のみ。
 * すべて純関数（外部API・AIなし）。
 */
import { z } from 'zod';
import { addDays } from './dates';

export const EXECUTION_PLANNING_VERSION = 1 as const;
export const FEATURE_VERSION = '2.4' as const;

// ---------- 時間（計画日 07:00〜25:00） ----------
export const DAY_START_MIN = 7 * 60; // 420
export const DAY_END_MIN = 25 * 60; // 1500（翌日01:00。終了時刻としてのみ許容）
export const SLOT_MIN = 15;

const isoDT = z.string().refine((v) => !Number.isNaN(Date.parse(v)), '日時の形式が正しくありません');
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const score = z.number().int().min(1).max(5).nullable();

export const NODE_KINDS = ['goal', 'milestone', 'step', 'action'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const NODE_KIND_LABEL: Record<NodeKind, string> = { goal: '目標', milestone: '中間成果', step: '工程', action: 'TODO' };

export const TRIAGE = ['focus_week', 'today', 'later', 'delegate', 'drop'] as const;
export type Triage = (typeof TRIAGE)[number];
export const TRIAGE_LABEL: Record<Triage, string> = { focus_week: '今週注力', today: '今日やる', later: '後で計画', delegate: '委任する', drop: 'やらない' };

export const planNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(NODE_KINDS),
  title: z.string(),
  parentId: z.string().nullable(),
  /** 既存v2.3の人生の軸・目標への参照（例 legacy:lifeCompass / legacy:goal:<id>）。複製はしない */
  sourceAnchorId: z.string().nullable().optional(),
  relatedGoalIds: z.array(z.string()).default([]),
  order: z.number(),
  collapsed: z.boolean().default(false),
  archivedAt: isoDT.nullable().default(null),
  provisional: z.boolean().default(false),
  doneCriteria: z.string().nullable().default(null),
  estimateMinutes: z.number().int().min(1).max(24 * 60).nullable().default(null),
  dependsOn: z.array(z.string()).default([]),
  startCue: z.string().nullable().default(null),
  prep: z.string().nullable().default(null),
  dueDate: ymd.nullable().default(null),
  importance: score.default(null),
  urgency: score.default(null),
  triage: z.enum(TRIAGE).nullable().default(null),
  quadrantOrder: z.number().default(0),
  note: z.string().nullable().default(null),
  /** 目標の達成条件・成果指標（任意。非数値目標に数値化を強制しない） */
  successCriteria: z.string().nullable().default(null),
  metric: z.string().nullable().default(null),
  createdAt: isoDT,
  updatedAt: isoDT,
}).passthrough();
export type PlanNode = z.infer<typeof planNodeSchema>;

export const BLOCK_STATES = ['placed', 'moved', 'cancelled'] as const;
export const scheduleBlockSchema = z.object({
  id: z.string().min(1),
  planDate: ymd,
  actionId: z.string(),
  startMinute: z.number().int(),
  durationMinutes: z.number().int().min(1),
  state: z.enum(BLOCK_STATES),
  movedFromBlockId: z.string().nullable().default(null),
  movedToBlockId: z.string().nullable().default(null),
  moveReason: z.string().nullable().default(null),
  overlapConfirmed: z.boolean().default(false),
  createdAt: isoDT,
  updatedAt: isoDT,
}).passthrough();
export type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;

export const EXEC_KINDS = ['started', 'partial', 'completed', 'interrupted', 'not_started', 'resumed', 'reopened'] as const;
export type ExecKind = (typeof EXEC_KINDS)[number];
export const INTERRUPT_REASONS = ['external', 'internal', 'prep', 'condition', 'rest', 'other'] as const;
export type InterruptReason = (typeof INTERRUPT_REASONS)[number];
export const INTERRUPT_LABEL: Record<InterruptReason, string> = { external: '外的中断（予定外の対応）', internal: '内的切替（別のことをしたくなった）', prep: '準備不足', condition: '条件変更', rest: '意図的な休息', other: 'その他' };

export const executionEventSchema = z.object({
  id: z.string().min(1),
  actionId: z.string(),
  blockId: z.string().nullable().default(null),
  planDate: ymd,
  kind: z.enum(EXEC_KINDS),
  reason: z.enum(INTERRUPT_REASONS).nullable().default(null),
  note: z.string().nullable().default(null),
  criteriaMet: z.boolean().nullable().default(null),
  evidence: z.string().nullable().default(null),
  resumeAt: z.string().nullable().default(null),
  firstStep: z.string().nullable().default(null),
  occurredAt: isoDT,
  /** 同時刻の記録の順序（追記ごとに増える通し番号） */
  seq: z.number().int().optional(),
}).passthrough();
export type ExecutionEvent = z.infer<typeof executionEventSchema>;

export const IF_CONDITIONS = ['manual', 'free_time', 'cancelled', 'blocked', 'evening'] as const;
export type IfCondition = (typeof IF_CONDITIONS)[number];
export const IF_LABEL: Record<IfCondition, string> = { manual: '手動で確認する', free_time: '空き時間ができた', cancelled: '予定がキャンセルになった', blocked: 'タスクが障害で止まった', evening: '当日の振り返り時' };

export const ifThenRuleSchema = z.object({
  id: z.string().min(1),
  condition: z.enum(IF_CONDITIONS),
  label: z.string(),
  maxMinutes: z.number().int().min(1).nullable().default(null),
  onlyImportant: z.boolean().default(true),
  originalPolicy: z.enum(['keep', 'move_candidate', 'hold_candidate']).default('keep'),
  targetActionId: z.string().nullable().default(null),
  createdAt: isoDT,
}).passthrough();
export type IfThenRule = z.infer<typeof ifThenRuleSchema>;

export const outcomeRecordSchema = z.object({
  id: z.string().min(1),
  goalNodeId: z.string(),
  date: ymd,
  metric: z.string().nullable().default(null),
  value: z.number().nullable().default(null),
  unit: z.string().nullable().default(null),
  qualitative: z.string().nullable().default(null),
  evidence: z.string().nullable().default(null),
  createdAt: isoDT,
}).passthrough();
export type OutcomeRecord = z.infer<typeof outcomeRecordSchema>;

export const executionPlanningSchema = z.object({
  version: z.literal(EXECUTION_PLANNING_VERSION),
  featureVersion: z.string().optional(),
  planNodes: z.array(planNodeSchema),
  scheduleBlocks: z.array(scheduleBlockSchema),
  executionEvents: z.array(executionEventSchema),
  ifThenRules: z.array(ifThenRuleSchema),
  outcomeRecords: z.array(outcomeRecordSchema),
}).passthrough();
export type ExecutionPlanning = z.infer<typeof executionPlanningSchema>;

export function emptyExecutionPlanning(): ExecutionPlanning {
  return { version: 1, featureVersion: FEATURE_VERSION, planNodes: [], scheduleBlocks: [], executionEvents: [], ifThenRules: [], outcomeRecords: [] };
}

// ---------- ツリー ----------
export function childrenMap(nodes: PlanNode[], includeArchived = false): Map<string | null, PlanNode[]> {
  const m = new Map<string | null, PlanNode[]>();
  for (const n of nodes) {
    if (!includeArchived && n.archivedAt) continue;
    const k = n.parentId ?? null;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(n);
  }
  for (const list of m.values()) list.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  return m;
}

export function ancestors(nodes: PlanNode[], id: string): PlanNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: PlanNode[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const p = byId.get(cur.parentId);
    if (!p) break;
    out.unshift(p);
    cur = p;
  }
  return out;
}

export function descendantIds(nodes: PlanNode[], id: string): Set<string> {
  const cm = childrenMap(nodes, true);
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of cm.get(cur) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return out;
}

/** 移動の可否：自分自身・子孫の下へは移動できない（循環参照の防止） */
export function canMove(nodes: PlanNode[], id: string, newParentId: string | null): { ok: true } | { ok: false; reason: string } {
  if (newParentId === null) return { ok: true };
  if (newParentId === id) return { ok: false, reason: '自分自身の下には移動できません。' };
  if (!nodes.some((n) => n.id === newParentId)) return { ok: false, reason: '移動先が見つかりません。' };
  if (descendantIds(nodes, id).has(newParentId)) return { ok: false, reason: '自分の子孫の下には移動できません（循環になるため）。' };
  return { ok: true };
}

export function hasCycle(nodes: PlanNode[]): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let cur = n.parentId ? byId.get(n.parentId) : undefined;
    while (cur) {
      if (seen.has(cur.id)) return n.id;
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return null;
}

/** 計画可能：行動で、タイトル・完了条件・所要時間がそろっている */
export function isPlannable(n: Pick<PlanNode, 'kind' | 'title' | 'doneCriteria' | 'estimateMinutes'>): boolean {
  return n.kind === 'action' && !!n.title.trim() && !!n.doneCriteria?.trim() && typeof n.estimateMinutes === 'number' && n.estimateMinutes > 0;
}

export function missingForPlannable(n: PlanNode): string[] {
  const out: string[] = [];
  if (n.kind !== 'action') out.push('TODO（行動）に変換');
  if (!n.title.trim()) out.push('行動名');
  if (!n.doneCriteria?.trim()) out.push('完了条件');
  if (!n.estimateMinutes) out.push('所要時間');
  return out;
}

export const SPLIT_SUGGEST_MIN = 60;

// ---------- 重要度×緊急度 ----------
export type Quadrant = 1 | 2 | 3 | 4 | null;
export const QUADRANT_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: '第1象限｜重要・緊急',
  2: '第2象限｜重要・緊急でない',
  3: '第3象限｜重要でない・緊急',
  4: '第4象限｜重要でない・緊急でない',
};
/** 3以上を「高」とする。未判定（null）はどちらかでも null なら未分類 */
export function quadrantOf(n: Pick<PlanNode, 'importance' | 'urgency'>): Quadrant {
  if (n.importance == null || n.urgency == null) return null;
  const imp = n.importance >= 3;
  const urg = n.urgency >= 3;
  if (imp && urg) return 1;
  if (imp && !urg) return 2;
  if (!imp && urg) return 3;
  return 4;
}
/** 象限への配置（ドラッグ／タップ）。既存の評価が象限と合っていれば変更しない */
export function scoresForQuadrant(q: 1 | 2 | 3 | 4, cur: Pick<PlanNode, 'importance' | 'urgency'>): { importance: number; urgency: number } {
  const wantImp = q === 1 || q === 2;
  const wantUrg = q === 1 || q === 3;
  const imp = cur.importance != null && (cur.importance >= 3) === wantImp ? cur.importance : wantImp ? 4 : 2;
  const urg = cur.urgency != null && (cur.urgency >= 3) === wantUrg ? cur.urgency : wantUrg ? 4 : 2;
  return { importance: imp, urgency: urg };
}
/** 期日が近いときの緊急度「提案」（本人の評価は上書きしない） */
export function urgencySuggestion(n: Pick<PlanNode, 'dueDate' | 'urgency'>, today: string): string | null {
  if (!n.dueDate) return null;
  const days = Math.round((Date.parse(n.dueDate) - Date.parse(today)) / 86_400_000);
  if (days <= 2 && (n.urgency ?? 0) < 3) return days < 0 ? '期限を過ぎています。緊急度を見直しますか？' : `期限まであと${days}日です。緊急度を見直しますか？`;
  return null;
}

// ---------- 時間割 ----------
export function fmtMinute(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (mi > 59 || h > 25) return null;
  return h * 60 + mi;
}
export function validateBlockTime(startMinute: number, durationMinutes: number): string | null {
  if (!Number.isInteger(startMinute) || !Number.isInteger(durationMinutes)) return '時刻と所要時間は分単位の整数で入力してください。';
  if (durationMinutes < 1) return '所要時間は1分以上にしてください。';
  if (startMinute < DAY_START_MIN) return '開始は07:00以降にしてください。';
  if (startMinute >= DAY_END_MIN) return '開始は25:00より前にしてください（25:00は終了時刻としてのみ使えます）。';
  if (startMinute + durationMinutes > DAY_END_MIN) return '終了が25:00（翌01:00）を超えています。';
  return null;
}
/** 計画日＋分 → 実際の日時（タイムゾーンのオフセットつきISO文字列。25:00 は翌日01:00） */
export function blockDateTime(planDate: string, minute: number, offset = '+09:00'): { date: string; time: string; iso: string } {
  const dayShift = Math.floor(minute / 1440);
  const m = minute % 1440;
  const date = addDays(planDate, dayShift);
  const time = fmtMinute(m);
  return { date, time, iso: `${date}T${time}:00${offset}` };
}

export function activeBlocks(blocks: ScheduleBlock[], planDate: string): ScheduleBlock[] {
  return blocks.filter((b) => b.planDate === planDate && b.state === 'placed').sort((a, b) => a.startMinute - b.startMinute);
}
export function overlaps(blocks: ScheduleBlock[], planDate: string, start: number, dur: number, ignoreId?: string): ScheduleBlock[] {
  const end = start + dur;
  return activeBlocks(blocks, planDate).filter((b) => b.id !== ignoreId && b.startMinute < end && start < b.startMinute + b.durationMinutes);
}
export function freeSlots(blocks: ScheduleBlock[], planDate: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let cur = DAY_START_MIN;
  for (const b of activeBlocks(blocks, planDate)) {
    if (b.startMinute > cur) out.push({ start: cur, end: b.startMinute });
    cur = Math.max(cur, b.startMinute + b.durationMinutes);
  }
  if (cur < DAY_END_MIN) out.push({ start: cur, end: DAY_END_MIN });
  return out;
}
export function plannedMinutes(blocks: ScheduleBlock[], planDate: string): number {
  return activeBlocks(blocks, planDate).reduce((s, b) => s + b.durationMinutes, 0);
}

// ---------- 実行状態 ----------
export type BlockExecState = 'unrecorded' | 'not_started' | 'in_progress' | 'partial' | 'completed' | 'interrupted';
export const EXEC_STATE_LABEL: Record<BlockExecState, string> = { unrecorded: '未記録', not_started: '未着手', in_progress: '実行中', partial: '一部実行', completed: '完了', interrupted: '中断・困難' };

/** 実行記録の時系列（同時刻は通し番号 seq で確定） */
export function cmpExec(a: ExecutionEvent, b: ExecutionEvent): number {
  return a.occurredAt.localeCompare(b.occurredAt) || (Number(a.seq ?? 0) - Number(b.seq ?? 0));
}

export function blockExecState(events: ExecutionEvent[], blockId: string): BlockExecState {
  const evs = events.filter((e) => e.blockId === blockId).sort(cmpExec);
  const last = evs[evs.length - 1];
  if (!last) return 'unrecorded';
  switch (last.kind) {
    case 'started': case 'resumed': return 'in_progress';
    case 'partial': return 'partial';
    case 'completed': return 'completed';
    case 'interrupted': return 'interrupted';
    case 'not_started': return 'not_started';
    case 'reopened': return 'in_progress';
  }
}
/** タスクとしての完了（再オープン後の再完了でも1回だけ） */
export function actionCompleted(events: ExecutionEvent[], actionId: string): boolean {
  const evs = events.filter((e) => e.actionId === actionId && (e.kind === 'completed' || e.kind === 'reopened')).sort(cmpExec);
  return evs.length > 0 && evs[evs.length - 1].kind === 'completed';
}

// ---------- 計測（FR-404） ----------
export interface DayExecMetrics {
  validBlocks: number;
  recordedBlocks: number;
  unrecordedBlocks: number;
  completedBlocks: number;
  completedActions: number;
  movedBlocks: number;
  recordRate: number | null;
  executionRate: number | null;
  postponeRate: number | null;
  primaryStarted: boolean;
  primaryCompleted: boolean;
  interruptsByReason: Record<InterruptReason, number>;
}
export function dayExecMetrics(ep: Pick<ExecutionPlanning, 'scheduleBlocks' | 'executionEvents'>, planDate: string, primaryActionId: string | null): DayExecMetrics {
  const valid = activeBlocks(ep.scheduleBlocks, planDate);
  const moved = ep.scheduleBlocks.filter((b) => b.planDate === planDate && b.state === 'moved');
  const states = valid.map((b) => blockExecState(ep.executionEvents, b.id));
  const completed = states.filter((s) => s === 'completed').length;
  const recorded = states.filter((s) => s !== 'unrecorded').length;
  const completedActions = new Set(valid.filter((_b, i) => states[i] === 'completed').map((b) => b.actionId)).size;
  const dayEvents = ep.executionEvents.filter((e) => e.planDate === planDate);
  const reasons = Object.fromEntries(INTERRUPT_REASONS.map((r) => [r, 0])) as Record<InterruptReason, number>;
  for (const e of dayEvents) if (e.kind === 'interrupted' && e.reason) reasons[e.reason]++;
  const prim = primaryActionId ? dayEvents.filter((e) => e.actionId === primaryActionId) : [];
  return {
    validBlocks: valid.length,
    recordedBlocks: recorded,
    unrecordedBlocks: valid.length - recorded,
    completedBlocks: completed,
    completedActions,
    movedBlocks: moved.length,
    recordRate: valid.length ? recorded / valid.length : null,
    executionRate: valid.length ? completed / valid.length : null,
    postponeRate: valid.length + moved.length ? moved.length / (valid.length + moved.length) : null,
    primaryStarted: prim.some((e) => e.kind === 'started' || e.kind === 'partial' || e.kind === 'completed'),
    primaryCompleted: primaryActionId ? actionCompleted(ep.executionEvents, primaryActionId) : false,
    interruptsByReason: reasons,
  };
}
/** 分母0は『—（評価対象なし）』。0%扱いしない */
export function rateText(r: number | null): string {
  return r === null ? '—（評価対象なし）' : `${Math.round(r * 100)}%`;
}

/** 目標ごとの「行動の完了」と「現実の成果」を独立に集計（TODO完了から成果を作らない） */
export function goalProgress(ep: ExecutionPlanning, goalId: string): { actionsTotal: number; actionsCompleted: number; outcomes: OutcomeRecord[] } {
  const ids = descendantIds(ep.planNodes, goalId);
  const actions = ep.planNodes.filter((n) => ids.has(n.id) && n.kind === 'action' && !n.archivedAt);
  return {
    actionsTotal: actions.length,
    actionsCompleted: actions.filter((a) => actionCompleted(ep.executionEvents, a.id)).length,
    outcomes: ep.outcomeRecords.filter((o) => o.goalNodeId === goalId).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** 延期が続く行動（振り返りでの改善候補） */
export function repeatedlyPostponed(ep: ExecutionPlanning, min = 2): { action: PlanNode; moves: number }[] {
  const count = new Map<string, number>();
  for (const b of ep.scheduleBlocks) if (b.state === 'moved') count.set(b.actionId, (count.get(b.actionId) ?? 0) + 1);
  return [...count.entries()]
    .filter(([, n]) => n >= min)
    .map(([id, n]) => ({ action: ep.planNodes.find((x) => x.id === id)!, moves: n }))
    .filter((x) => x.action && !actionCompleted(ep.executionEvents, x.action.id));
}

/** 当日終わりに未完了の予定枠（翌日への移動候補。本人が確定するまで移動しない） */
export function carryOverCandidates(ep: ExecutionPlanning, planDate: string): ScheduleBlock[] {
  return activeBlocks(ep.scheduleBlocks, planDate).filter((b) => blockExecState(ep.executionEvents, b.id) !== 'completed' && !actionCompleted(ep.executionEvents, b.actionId));
}

// ---------- IF→THEN（提案のみ） ----------
export interface Suggestion {
  actionId: string;
  title: string;
  minutes: number;
  quadrant: Quadrant;
  reason: string;
}
export function suggestForCondition(ep: ExecutionPlanning, opts: { condition: IfCondition; maxMinutes: number | null; onlyImportant: boolean; excludeActionIds?: string[] }): Suggestion[] {
  const scheduledOpen = new Set(ep.scheduleBlocks.filter((b) => b.state === 'placed').map((b) => b.actionId));
  return ep.planNodes
    .filter((n) => isPlannable(n) && !n.archivedAt && n.triage !== 'drop' && n.triage !== 'delegate')
    .filter((n) => !actionCompleted(ep.executionEvents, n.id))
    .filter((n) => !(opts.excludeActionIds ?? []).includes(n.id))
    .filter((n) => opts.maxMinutes === null || (n.estimateMinutes ?? 0) <= opts.maxMinutes)
    .filter((n) => !opts.onlyImportant || (n.importance ?? 0) >= 3)
    .map((n) => ({
      actionId: n.id,
      title: n.title,
      minutes: n.estimateMinutes!,
      quadrant: quadrantOf(n),
      reason: [quadrantOf(n) === 2 ? '重要・緊急でない（第2象限）' : quadrantOf(n) === 1 ? '重要・緊急' : null, scheduledOpen.has(n.id) ? '別の時間にも予定あり' : null].filter(Boolean).join('／'),
    }))
    .sort((a, b) => (a.quadrant ?? 9) - (b.quadrant ?? 9) || a.minutes - b.minutes)
    .slice(0, 5);
}

// ---------- 整合性チェック（JSON Schemaだけでは不足する12項目） ----------
export interface IntegrityReport {
  errors: string[];
  warnings: string[];
}
export function checkIntegrity(ep: ExecutionPlanning, legacy: { goalIds: string[]; hasLifeCompass: boolean; planIdsByDate?: Map<string, string[]> }): IntegrityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dup = (name: string, ids: string[]) => {
    const s = new Set<string>();
    for (const id of ids) {
      if (s.has(id)) errors.push(`${name} のIDが重複しています：${id}`);
      s.add(id);
    }
  };
  dup('PlanNode', ep.planNodes.map((n) => n.id));
  dup('ScheduleBlock', ep.scheduleBlocks.map((n) => n.id));
  dup('ExecutionEvent', ep.executionEvents.map((n) => n.id));
  dup('IfThenRule', ep.ifThenRules.map((n) => n.id));
  dup('OutcomeRecord', ep.outcomeRecords.map((n) => n.id));
  const byId = new Map(ep.planNodes.map((n) => [n.id, n]));
  for (const n of ep.planNodes) {
    if (n.parentId && !byId.has(n.parentId)) errors.push(`親ノードが存在しません：${n.id} → ${n.parentId}`);
    if (n.sourceAnchorId) {
      const ok = n.sourceAnchorId === 'legacy:lifeCompass' ? legacy.hasLifeCompass : n.sourceAnchorId.startsWith('legacy:goal:') ? legacy.goalIds.includes(n.sourceAnchorId.slice('legacy:goal:'.length)) : false;
      if (!ok) warnings.push(`既存データへの参照が見つかりません（リンク切れとして表示）：${n.sourceAnchorId}`);
    }
  }
  const cyc = hasCycle(ep.planNodes);
  if (cyc) errors.push(`ノードの親子関係が循環しています：${cyc}`);
  const blockById = new Map(ep.scheduleBlocks.map((b) => [b.id, b]));
  for (const b of ep.scheduleBlocks) {
    const a = byId.get(b.actionId);
    if (!a) errors.push(`予定の行動が存在しません：${b.id}`);
    else if (a.kind !== 'action') errors.push(`予定がTODO以外を参照しています：${b.id}`);
    const t = validateBlockTime(b.startMinute, b.durationMinutes);
    if (t) errors.push(`予定の時刻が範囲外です：${b.id}（${t}）`);
  }
  for (const e of ep.executionEvents) {
    if (!byId.has(e.actionId)) errors.push(`実行記録の行動が存在しません：${e.id}`);
    if (e.blockId) {
      const b = blockById.get(e.blockId);
      if (!b) errors.push(`実行記録の予定枠が存在しません：${e.id}`);
      else if (b.actionId !== e.actionId) errors.push(`実行記録の行動と予定枠の行動が一致しません：${e.id}`);
    }
  }
  for (const r of ep.ifThenRules) if (r.targetActionId && !byId.has(r.targetActionId)) warnings.push(`IF→THENの対象が見つからないため提案できません：${r.id}`);
  for (const o of ep.outcomeRecords) {
    const g = byId.get(o.goalNodeId);
    if (!g) errors.push(`成果記録の目標が存在しません：${o.id}`);
    else if (g.kind === 'action') errors.push(`成果記録はTODOではなく目標・中間成果に記録してください：${o.id}`);
  }
  return { errors, warnings };
}

// ---------- インポートの統合（追加マージ） ----------
export interface MergeResult {
  merged: ExecutionPlanning;
  added: number;
  identical: number;
  conflicts: { collection: string; id: string }[];
}
type Coll = 'planNodes' | 'scheduleBlocks' | 'executionEvents' | 'ifThenRules' | 'outcomeRecords';
const COLLS: Coll[] = ['planNodes', 'scheduleBlocks', 'executionEvents', 'ifThenRules', 'outcomeRecords'];
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));
}
/** 同じIDは追加しない（冪等）。内容が異なる同じIDは「競合」として既存を残し報告する */
export function mergeExecutionPlanning(current: ExecutionPlanning, incoming: ExecutionPlanning): MergeResult {
  const merged = structuredClone(current);
  let added = 0;
  let identical = 0;
  const conflicts: MergeResult['conflicts'] = [];
  for (const c of COLLS) {
    const have = new Map((merged[c] as { id: string }[]).map((x) => [x.id, x]));
    for (const item of incoming[c] as { id: string }[]) {
      const ex = have.get(item.id);
      if (!ex) {
        (merged[c] as unknown[]).push(item);
        have.set(item.id, item);
        added++;
      } else if (stable(ex) === stable(item)) identical++;
      else conflicts.push({ collection: c, id: item.id });
    }
  }
  return { merged, added, identical, conflicts };
}

export const SAMPLE_GOAL_QUESTIONS = ['次に必要な中間成果は？', '障害になりそうなことは？', '最初の行動は？'] as const;
