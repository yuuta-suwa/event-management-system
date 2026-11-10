/**
 * v2.4 executionPlanning の保存操作。既存v2.3のデータには、LegacyBridge 経由以外では触れない。
 * 書き込みはトランザクション内で現在状態を再確認し、同じ opId の重複作成を防ぐ（冪等）。
 */
import { db } from './db';
import { clock } from './repo';
import { newId } from '../domain/id';
import {
  canMove, descendantIds, isPlannable, overlaps, validateBlockTime,
  type ExecKind, type InterruptReason, type NodeKind, type OutcomeRecord, type PlanNode, type ScheduleBlock, type Triage, type IfThenRule,
} from '../domain/planning';

const now = () => clock.now().toISOString();

export interface NewNodeInput {
  id?: string;
  kind: NodeKind;
  title: string;
  parentId: string | null;
  sourceAnchorId?: string | null;
  provisional?: boolean;
  doneCriteria?: string | null;
  estimateMinutes?: number | null;
}

export async function createNode(input: NewNodeInput): Promise<PlanNode> {
  const d = db();
  return d.transaction('rw', d.planNodes, async () => {
    if (input.id) {
      const ex = await d.planNodes.get(input.id);
      if (ex) return ex; // 冪等
    }
    if (input.parentId && !(await d.planNodes.get(input.parentId))) throw new Error('親ノードが見つかりません。');
    const siblings = await d.planNodes.where('parentId').equals(input.parentId ?? '').toArray();
    const roots = input.parentId ? siblings : (await d.planNodes.toArray()).filter((n) => !n.parentId);
    const order = Math.max(0, ...roots.map((n) => n.order)) + 1;
    const t = now();
    const node: PlanNode = {
      id: input.id ?? newId('n'), kind: input.kind, title: input.title, parentId: input.parentId, sourceAnchorId: input.sourceAnchorId ?? null,
      relatedGoalIds: [], order, collapsed: false, archivedAt: null, provisional: !!input.provisional,
      doneCriteria: input.doneCriteria ?? null, estimateMinutes: input.estimateMinutes ?? null, dependsOn: [], startCue: null, prep: null,
      dueDate: null, importance: null, urgency: null, triage: null, quadrantOrder: 0, note: null, successCriteria: null, metric: null,
      createdAt: t, updatedAt: t,
    };
    await d.planNodes.add(node);
    return node;
  });
}

export async function updateNode(id: string, patch: Partial<Omit<PlanNode, 'id' | 'parentId' | 'createdAt'>>): Promise<void> {
  const d = db();
  await d.transaction('rw', d.planNodes, async () => {
    const n = await d.planNodes.get(id);
    if (!n) throw new Error('ノードが見つかりません。');
    await d.planNodes.put({ ...n, ...patch, updatedAt: now() });
  });
}

/** 親を変更。循環になる移動は拒否し、元データは変更しない */
export async function moveNode(id: string, newParentId: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  const d = db();
  return d.transaction('rw', d.planNodes, async () => {
    const all = await d.planNodes.toArray();
    const r = canMove(all, id, newParentId);
    if (!r.ok) return r;
    const n = all.find((x) => x.id === id)!;
    const sib = all.filter((x) => (x.parentId ?? null) === newParentId && x.id !== id);
    await d.planNodes.put({ ...n, parentId: newParentId, order: Math.max(0, ...sib.map((s) => s.order)) + 1, updatedAt: now() });
    return { ok: true } as const;
  });
}

/** 同じ親の中で上下に移動 */
export async function reorderNode(id: string, dir: -1 | 1): Promise<void> {
  const d = db();
  await d.transaction('rw', d.planNodes, async () => {
    const all = await d.planNodes.toArray();
    const n = all.find((x) => x.id === id);
    if (!n) return;
    const sib = all.filter((x) => (x.parentId ?? null) === (n.parentId ?? null) && !x.archivedAt).sort((a, b) => a.order - b.order);
    const i = sib.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= sib.length) return;
    const other = sib[j];
    await d.planNodes.bulkPut([{ ...n, order: other.order, updatedAt: now() }, { ...other, order: n.order, updatedAt: now() }]);
  });
}

/** アーカイブ（削除ではない）。子孫も同じ時刻でアーカイブし、予定・実行記録・成果は残す */
export async function archiveNode(id: string): Promise<PlanNode[]> {
  const d = db();
  return d.transaction('rw', d.planNodes, async () => {
    const all = await d.planNodes.toArray();
    const ids = [id, ...descendantIds(all, id)];
    const before = all.filter((n) => ids.includes(n.id));
    const t = now();
    await d.planNodes.bulkPut(before.filter((n) => !n.archivedAt).map((n) => ({ ...n, archivedAt: t, updatedAt: t })));
    return before;
  });
}

export async function restoreNode(id: string): Promise<void> {
  const d = db();
  await d.transaction('rw', d.planNodes, async () => {
    const all = await d.planNodes.toArray();
    const n = all.find((x) => x.id === id);
    if (!n?.archivedAt) return;
    const stamp = n.archivedAt;
    const ids = [id, ...descendantIds(all, id)];
    const t = now();
    await d.planNodes.bulkPut(all.filter((x) => ids.includes(x.id) && x.archivedAt === stamp).map((x) => ({ ...x, archivedAt: null, updatedAt: t })));
    // 親がアーカイブ中ならルートへ（表示上の迷子を防ぐ）
    if (n.parentId && all.find((x) => x.id === n.parentId)?.archivedAt) {
      const cur = await d.planNodes.get(id);
      if (cur) await d.planNodes.put({ ...cur, parentId: null });
    }
  });
}

/** 元に戻す（直前の状態のノードを書き戻す） */
export async function restoreSnapshot(nodes: PlanNode[]): Promise<void> {
  await db().planNodes.bulkPut(nodes);
}

export async function setPriority(id: string, p: { importance?: number | null; urgency?: number | null; triage?: Triage | null; quadrantOrder?: number }): Promise<void> {
  await updateNode(id, p);
}

// ---------- 予定 ----------
export type PlaceResult = { ok: true; block: ScheduleBlock } | { ok: false; reason: string; overlaps?: ScheduleBlock[] };

export async function placeBlock(input: { opId: string; actionId: string; planDate: string; startMinute: number; durationMinutes: number; confirmOverlap?: boolean; movedFromBlockId?: string | null }): Promise<PlaceResult> {
  const d = db();
  return d.transaction('rw', [d.scheduleBlocks, d.planNodes], async () => {
    const existing = await d.scheduleBlocks.get(input.opId);
    if (existing) return { ok: true, block: existing } as const; // 冪等（二重確定でも1件）
    const action = await d.planNodes.get(input.actionId);
    if (!action) return { ok: false, reason: '行動が見つかりません。' } as const;
    if (!isPlannable(action)) return { ok: false, reason: '完了条件と所要時間を入れると予定に配置できます。' } as const;
    const t = validateBlockTime(input.startMinute, input.durationMinutes);
    if (t) return { ok: false, reason: t } as const;
    const all = await d.scheduleBlocks.where('planDate').equals(input.planDate).toArray();
    const ov = overlaps(all, input.planDate, input.startMinute, input.durationMinutes);
    if (ov.length && !input.confirmOverlap) return { ok: false, reason: '同じ時間帯に別の予定があります。', overlaps: ov } as const;
    const ts = now();
    const block: ScheduleBlock = {
      id: input.opId, planDate: input.planDate, actionId: input.actionId, startMinute: input.startMinute, durationMinutes: input.durationMinutes,
      state: 'placed', movedFromBlockId: input.movedFromBlockId ?? null, movedToBlockId: null, moveReason: null, overlapConfirmed: ov.length > 0, createdAt: ts, updatedAt: ts,
    };
    await d.scheduleBlocks.add(block);
    return { ok: true, block } as const;
  });
}

/** 延期・時間変更：元枠は moved として残し、新しい枠を作る。実行記録は消さない */
export async function moveBlock(input: { opId: string; blockId: string; planDate: string; startMinute: number; reason: string | null; confirmOverlap?: boolean }): Promise<PlaceResult> {
  const d = db();
  return d.transaction('rw', [d.scheduleBlocks, d.planNodes], async () => {
    const old = await d.scheduleBlocks.get(input.blockId);
    if (!old) return { ok: false, reason: '予定が見つかりません。' } as const;
    if (old.state === 'moved' && old.movedToBlockId) {
      const already = await d.scheduleBlocks.get(old.movedToBlockId);
      if (already) return { ok: true, block: already } as const;
    }
    const r = await placeBlock({ opId: input.opId, actionId: old.actionId, planDate: input.planDate, startMinute: input.startMinute, durationMinutes: old.durationMinutes, confirmOverlap: input.confirmOverlap, movedFromBlockId: old.id });
    if (!r.ok) return r;
    await d.scheduleBlocks.put({ ...old, state: 'moved', movedToBlockId: r.block.id, moveReason: input.reason, updatedAt: now() });
    return r;
  });
}

export async function cancelBlock(blockId: string, reason: string | null): Promise<void> {
  const d = db();
  await d.transaction('rw', d.scheduleBlocks, async () => {
    const b = await d.scheduleBlocks.get(blockId);
    if (b && b.state === 'placed') await d.scheduleBlocks.put({ ...b, state: 'cancelled', moveReason: reason, updatedAt: now() });
  });
}

// ---------- 実行記録（追記型） ----------
export interface ExecInput {
  opId: string;
  actionId: string;
  blockId: string | null;
  planDate: string;
  kind: ExecKind;
  reason?: InterruptReason | null;
  note?: string | null;
  criteriaMet?: boolean | null;
  evidence?: string | null;
  resumeAt?: string | null;
  firstStep?: string | null;
}

export async function recordExecution(input: ExecInput): Promise<boolean> {
  const d = db();
  return d.transaction('rw', [d.executionEvents, d.scheduleBlocks, d.planNodes, d.dayPlans, d.events], async () => {
    if (await d.executionEvents.get(input.opId)) return false;
    if (input.blockId) {
      const b = await d.scheduleBlocks.get(input.blockId);
      if (!b || b.actionId !== input.actionId) throw new Error('予定枠と行動が一致しません。');
    }
    await d.executionEvents.add({
      seq: await nextExecSeq(),
      id: input.opId, actionId: input.actionId, blockId: input.blockId, planDate: input.planDate, kind: input.kind, reason: input.reason ?? null,
      note: input.note ?? null, criteriaMet: input.criteriaMet ?? null, evidence: input.evidence ?? null, resumeAt: input.resumeAt ?? null, firstStep: input.firstStep ?? null, occurredAt: now(),
    });
    // LegacyBridge：この行動がその日のv2.3最重要行動なら、v2.3側の状態も合わせる（正本は dayPlan）
    const plans = await d.dayPlans.where('localDate').equals(input.planDate).toArray();
    const plan = plans.find((p) => (p as { primaryActionId?: string }).primaryActionId === input.actionId);
    if (plan) {
      const to = input.kind === 'completed' ? 'completed' : input.kind === 'started' || input.kind === 'resumed' || input.kind === 'reopened' ? 'in_progress' : input.kind === 'interrupted' ? 'paused' : null;
      if (to && plan.status !== to && !(to === 'paused' && plan.status !== 'in_progress')) {
        await d.dayPlans.put({ ...plan, status: to });
        const kind = to === 'completed' ? 'ACTION_COMPLETED' : to === 'paused' ? 'ACTION_PAUSED' : plan.status === 'paused' ? 'ACTION_RESUMED' : 'ACTION_STARTED';
        await d.events.add({ id: newId('ev'), kind, occurredAt: now(), localDate: input.planDate, planId: plan.id, payload: { via: 'execution_planning', actionId: input.actionId }, updatedAt: null });
      }
    }
    return true;
  });
}

// ---------- 成果（TODO完了から自動生成しない） ----------
export interface OutcomeInput {
  opId: string;
  goalNodeId: string;
  date: string;
  metric: string | null;
  value: number | null;
  unit: string | null;
  qualitative: string | null;
  evidence: string | null;
}

export async function addOutcome(input: OutcomeInput): Promise<boolean> {
  const d = db();
  return d.transaction('rw', [d.outcomeRecords, d.planNodes], async () => {
    if (await d.outcomeRecords.get(input.opId)) return false;
    const g = await d.planNodes.get(input.goalNodeId);
    if (!g || g.kind === 'action') throw new Error('成果は目標または中間成果に記録してください。');
    const { opId, ...rest } = input;
    await d.outcomeRecords.add({ ...rest, id: opId, createdAt: now() } as OutcomeRecord);
    return true;
  });
}

export async function deleteOutcome(id: string): Promise<void> {
  await db().outcomeRecords.delete(id);
}

// ---------- IF→THEN ----------
export async function saveRule(rule: Omit<IfThenRule, 'id' | 'createdAt'> & { id?: string }): Promise<IfThenRule> {
  const r: IfThenRule = { ...rule, id: rule.id ?? newId('rule'), createdAt: now() } as IfThenRule;
  await db().ifThenRules.put(r);
  return r;
}
export async function deleteRule(id: string): Promise<void> {
  await db().ifThenRules.delete(id);
}

/** 実行記録の通し番号（トランザクション内で呼ぶ） */
export async function nextExecSeq(): Promise<number> {
  let max = 0;
  await db().executionEvents.each((e) => { if (typeof e.seq === 'number' && e.seq > max) max = e.seq; });
  return max + 1;
}
