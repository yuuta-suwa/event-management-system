/**
 * データ操作。すべての書き込みはトランザクション内で現在状態を再確認し、
 * 多重タップ・同時実行でもイベントが重複しないよう冪等にする。
 */
import { db } from './db';
import {
  defaultLifeCompass, defaultLifeTime, defaultPreferences, defaultWorkshop, SCHEMA_VERSION,
  type AppEvent, type DayMode, type DayPlan, type EventKind, type Evidence, type EvidenceLayer, type Experiment, type Goal,
  type LifeCompass, type LifeTime, type LifeTimeQuestionId, type PlanStatus, type Preferences,
  type Profile, type Review, type Route, type Workshop,
} from '../domain/schema';
import { addDays, localDateOf } from '../domain/dates';
import { newId } from '../domain/id';
import { finalizeWorkshop, prefillFromBranch, type Answer, type Answers } from '../domain/workshop';

export const clock = { now: (): Date => new Date() };

export interface AppMeta {
  onboardingDone: boolean;
  isDemo: boolean;
  dismissedReviews: string[];
}

export interface AppData {
  schemaVersion: string;
  createdAt: string;
  preferences: Preferences;
  profile: Profile;
  workshop: Workshop;
  lifeCompass: LifeCompass;
  lifeTime: LifeTime;
  appMeta: AppMeta;
  goals: Goal[];
  experiments: Experiment[];
  dayPlans: DayPlan[];
  events: AppEvent[];
  evidence: Evidence[];
  reviews: Review[];
}

const KV_DEFAULTS = () => ({
  meta: { schemaVersion: SCHEMA_VERSION, createdAt: clock.now().toISOString() },
  preferences: defaultPreferences(),
  profile: {} as Profile,
  workshop: defaultWorkshop(),
  lifeCompass: defaultLifeCompass(),
  lifeTime: defaultLifeTime(),
  appMeta: { onboardingDone: false, isDemo: false, dismissedReviews: [] } as AppMeta,
});

type KvKey = keyof ReturnType<typeof KV_DEFAULTS>;

async function getKv<T>(key: KvKey): Promise<T> {
  const row = await db().kv.get(key);
  return (row?.value ?? KV_DEFAULTS()[key]) as T;
}

async function putKv(key: KvKey, value: unknown): Promise<void> {
  await db().kv.put({ key, value });
}

export async function ensureInitialized(): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => {
    const meta = await d.kv.get('meta');
    if (meta) return;
    const defs = KV_DEFAULTS();
    await d.kv.bulkPut(Object.entries(defs).map(([key, value]) => ({ key, value })));
  });
}

export async function loadAll(): Promise<AppData> {
  const d = db();
  return d.transaction('r', [d.kv, ...d.collections], async () => {
    const meta = await getKv<{ schemaVersion: string; createdAt: string }>('meta');
    const [goals, experiments, dayPlans, events, evidence, reviews] = await Promise.all([
      d.goals.toArray(), d.experiments.toArray(), d.dayPlans.toArray(), d.events.toArray(), d.evidence.toArray(), d.reviews.toArray(),
    ]);
    events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    dayPlans.sort((a, b) => a.localDate.localeCompare(b.localDate));
    return {
      schemaVersion: meta.schemaVersion,
      createdAt: meta.createdAt,
      preferences: await getKv<Preferences>('preferences'),
      profile: await getKv<Profile>('profile'),
      workshop: await getKv<Workshop>('workshop'),
      lifeCompass: await getKv<LifeCompass>('lifeCompass'),
      lifeTime: await getKv<LifeTime>('lifeTime'),
      appMeta: await getKv<AppMeta>('appMeta'),
      goals, experiments, dayPlans, events, evidence, reviews,
    };
  });
}

async function tz(): Promise<string> {
  return (await getKv<Preferences>('preferences')).timeZone;
}

export async function todayLocal(): Promise<string> {
  return localDateOf(clock.now(), await tz());
}

function mkEvent(kind: EventKind, localDate: string, planId: string | null, payload: Record<string, unknown> = {}, id?: string): AppEvent {
  return { id: id ?? newId('ev'), kind, occurredAt: clock.now().toISOString(), localDate, planId, payload, updatedAt: null };
}

/** 同じopIdのイベントは1件だけ保存（多重タップ対策） */
async function addEventOnce(ev: AppEvent): Promise<boolean> {
  const existing = await db().events.get(ev.id);
  if (existing) return false;
  await db().events.add(ev);
  return true;
}

// ---------------- 設定・メタ ----------------
export async function updatePreferences(patch: Partial<Preferences>): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => putKv('preferences', { ...(await getKv<Preferences>('preferences')), ...patch }));
}

export async function updateAppMeta(patch: Partial<AppMeta>): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => putKv('appMeta', { ...(await getKv<AppMeta>('appMeta')), ...patch }));
}

// ---------------- 初回ワーク ----------------
export async function saveWorkshopAnswer(id: string, answer: Answer | undefined, stepId?: string): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => {
    const w = await getKv<Workshop>('workshop');
    const answers = { ...w.answers } as Record<string, unknown>;
    if (answer === undefined) delete answers[id];
    else if (answer.skipped) answers[id] = answer;
    else {
      // 統合保存：先に保存された値（分岐からの引き継ぎ等）を消さない。スキップ状態は解除。
      const prev = answers[id] as Answer | undefined;
      answers[id] = { ...(prev && !prev.skipped ? prev : {}), ...answer, skipped: false };
    }
    await putKv('workshop', {
      ...w,
      status: w.status === 'completed' ? 'completed' : 'in_progress',
      startedAt: w.startedAt ?? clock.now().toISOString(),
      answers,
      currentStepId: stepId ?? w.currentStepId ?? null,
    });
  });
}

export async function setWorkshopStep(stepId: string): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => {
    const w = await getKv<Workshop>('workshop');
    const answers = { ...w.answers } as Answers;
    // 分岐回答からの初期値は、常に最新の保存値から作る（未回答のときだけ）
    const pre = prefillFromBranch(answers, stepId);
    if (pre) answers[stepId] = { ...(answers[stepId] ?? {}), ...pre };
    await putKv('workshop', {
      ...w,
      answers,
      status: w.status === 'completed' ? 'completed' : 'in_progress',
      startedAt: w.startedAt ?? clock.now().toISOString(),
      currentStepId: stepId,
    });
  });
}

export async function completeWorkshop(): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.kv, ...d.collections], async () => {
    const w = await getKv<Workshop>('workshop');
    if (w.status === 'completed' && w.initialExperimentId) return; // 冪等
    const compass = await getKv<LifeCompass>('lifeCompass');
    const r = finalizeWorkshop(w, compass, clock.now(), await tz());
    await putKv('workshop', r.workshop);
    await putKv('profile', { ...(await getKv<Profile>('profile')), ...r.profile });
    await putKv('lifeCompass', r.lifeCompass);
    await d.goals.add(r.goal);
    await d.experiments.add(r.experiment);
    await d.dayPlans.bulkAdd(r.dayPlans);
    await d.events.bulkAdd(r.events);
  });
}

// ---------------- 日次の計画 ----------------
export async function planForDate(date: string): Promise<DayPlan | undefined> {
  const list = await db().dayPlans.where('localDate').equals(date).toArray();
  return list.sort((a, b) => (b.plannedAt ?? '').localeCompare(a.plannedAt ?? ''))[0];
}

export async function activeExperiment(): Promise<Experiment | undefined> {
  const list = await db().experiments.where('status').equals('active').toArray();
  return list.sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export interface PlanInput {
  date: string;
  importantAction: string;
  startCue?: string | null;
  doneWhen?: string | null;
  dayMode?: DayMode;
  priorityReason?: string | null;
  displacedActivity?: string | null;
  plannedMinutes?: number | null;
  note?: string | null;
  replanReason?: string | null;
}

/** 計画の作成・変更。既存計画がある場合は REPLAN として元の予定を payload に残す。 */
export async function upsertPlan(input: PlanInput): Promise<DayPlan> {
  const d = db();
  return d.transaction('rw', [d.dayPlans, d.events, d.experiments, d.kv], async () => {
    const today = await todayLocal();
    const exp = await activeExperiment();
    const existing = await planForDate(input.date);
    const nowIso = clock.now().toISOString();
    if (existing) {
      const prev = { importantAction: existing.importantAction, startCue: existing.startCue, dayMode: existing.dayMode, status: existing.status };
      const changed = prev.importantAction !== input.importantAction || prev.startCue !== (input.startCue ?? existing.startCue);
      const keepStarted = !changed && (existing.status === 'in_progress' || existing.status === 'paused' || existing.status === 'completed');
      const next: DayPlan = {
        ...existing,
        importantAction: input.importantAction,
        startCue: input.startCue ?? existing.startCue ?? null,
        doneWhen: input.doneWhen ?? existing.doneWhen ?? null,
        dayMode: input.dayMode ?? (existing.dayMode === 'recover' ? 'advance' : existing.dayMode),
        status: keepStarted ? existing.status : 'planned',
        priorityReason: input.priorityReason !== undefined ? input.priorityReason : existing.priorityReason ?? null,
        displacedActivity: input.displacedActivity !== undefined ? input.displacedActivity : existing.displacedActivity ?? null,
        plannedMinutes: input.plannedMinutes !== undefined ? input.plannedMinutes : existing.plannedMinutes ?? null,
        note: input.note !== undefined ? input.note : existing.note ?? null,
      };
      await d.dayPlans.put(next);
      if (existing.importantAction && changed) {
        await d.events.add(mkEvent('REPLAN', today, existing.id, { previous: prev, next: { importantAction: next.importantAction, startCue: next.startCue }, reason: input.replanReason ?? null, forDate: input.date }));
      } else if (!existing.importantAction) {
        await d.events.add(mkEvent('PLAN_CREATED', today, existing.id, { forDate: input.date }));
      }
      return next;
    }
    const plan: DayPlan = {
      id: newId('p'),
      localDate: input.date,
      dayMode: input.dayMode ?? 'advance',
      status: 'planned',
      experimentId: exp?.id ?? null,
      importantAction: input.importantAction,
      startCue: input.startCue ?? null,
      doneWhen: input.doneWhen ?? null,
      plannedMinutes: input.plannedMinutes ?? null,
      plannedAt: nowIso,
      note: input.note ?? null,
      priorityReason: input.priorityReason ?? null,
      displacedActivity: input.displacedActivity ?? null,
      isExploration: exp?.experimentKind === 'exploration',
    };
    await d.dayPlans.add(plan);
    await d.events.add(mkEvent('PLAN_CREATED', today, plan.id, { forDate: input.date }));
    return plan;
  });
}

/** 朝のモード選択。回復する日は休息として保存（未達成扱いしない）。 */
export async function setDayMode(date: string, mode: DayMode, restNote?: string | null): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.dayPlans, d.events, d.experiments, d.kv], async () => {
    const existing = await planForDate(date);
    const nowIso = clock.now().toISOString();
    if (mode === 'recover') {
      if (existing?.dayMode === 'recover' && existing.status === 'rest') {
        if (restNote !== undefined) await d.dayPlans.put({ ...existing, note: restNote });
        return;
      }
      const plan: DayPlan = existing
        ? { ...existing, dayMode: 'recover', status: 'rest', note: restNote ?? existing.note ?? null }
        : { id: newId('p'), localDate: date, dayMode: 'recover', status: 'rest', experimentId: (await activeExperiment())?.id ?? null, importantAction: null, startCue: null, plannedMinutes: null, plannedAt: nowIso, note: restNote ?? null, priorityReason: null, displacedActivity: null };
      await d.dayPlans.put(plan);
      await d.events.add(mkEvent('REST_CHOSEN', date, plan.id, { previousStatus: existing?.status ?? null, restNote: restNote ?? null }));
      return;
    }
    if (existing) {
      const status: PlanStatus = existing.status === 'rest' ? (existing.importantAction ? 'planned' : 'unplanned') : existing.status;
      await d.dayPlans.put({ ...existing, dayMode: mode, status });
    } else {
      await d.dayPlans.add({ id: newId('p'), localDate: date, dayMode: mode, status: 'unplanned', experimentId: (await activeExperiment())?.id ?? null, importantAction: null, startCue: null, plannedMinutes: null, plannedAt: nowIso, note: null, priorityReason: null, displacedActivity: null });
    }
  });
}

async function transition(planId: string, from: PlanStatus[], to: PlanStatus, kind: EventKind, payload: Record<string, unknown> = {}): Promise<boolean> {
  const d = db();
  return d.transaction('rw', [d.dayPlans, d.events, d.kv], async () => {
    const plan = await d.dayPlans.get(planId);
    if (!plan || !from.includes(plan.status)) return false; // 冪等：状態が合わなければ何もしない
    await d.dayPlans.put({ ...plan, status: to });
    await d.events.add(mkEvent(kind, plan.localDate, plan.id, payload));
    return true;
  });
}

export function startAction(planId: string, payload: Record<string, unknown> = {}) {
  return transition(planId, ['planned', 'not_started', 'unknown'], 'in_progress', 'ACTION_STARTED', payload);
}
export function pauseAction(planId: string) {
  return transition(planId, ['in_progress'], 'paused', 'ACTION_PAUSED');
}
export function resumeAction(planId: string, payload: Record<string, unknown> = {}) {
  return transition(planId, ['paused'], 'in_progress', 'ACTION_RESUMED', payload);
}

export async function completeAction(planId: string, opts: { what?: string | null; minutes?: number | null } = {}): Promise<boolean> {
  const d = db();
  return d.transaction('rw', [d.dayPlans, d.events, d.evidence, d.kv, d.experiments], async () => {
    const plan = await d.dayPlans.get(planId);
    if (!plan || !['in_progress', 'paused', 'planned'].includes(plan.status)) return false;
    await d.dayPlans.put({ ...plan, status: 'completed' });
    await d.events.add(mkEvent('ACTION_COMPLETED', plan.localDate, plan.id, { minutes: opts.minutes ?? null, what: opts.what ?? null }));
    if (opts.what?.trim()) {
      await addEvidenceInTx({ layer: 'action', description: opts.what.trim(), experimentId: plan.experimentId ?? null, localDate: plan.localDate, source: 'self_report' });
    }
    return true;
  });
}

// ---------------- 内的切替・外部中断 ----------------
export interface InternalSwitchInput {
  opId: string;
  planId: string | null;
  date: string;
  otherActivity?: string | null;
  reason?: string | null;
  feeling?: string | null;
  decision: 'two_minutes' | 'smaller' | 'replan' | 'rest' | 'other_activity';
  occurredAt?: string;
  backfilled?: boolean;
}

export async function recordInternalSwitch(input: InternalSwitchInput): Promise<boolean> {
  const d = db();
  return d.transaction('rw', [d.dayPlans, d.events, d.kv], async () => {
    const ev = mkEvent('INTERNAL_SWITCH', input.date, input.planId, {
      otherActivity: input.otherActivity ?? null,
      reason: input.reason ?? null,
      feeling: input.feeling ?? null,
      decision: input.decision,
      backfilled: !!input.backfilled,
    }, input.opId);
    if (input.occurredAt) ev.occurredAt = input.occurredAt;
    const added = await addEventOnce(ev);
    if (!added) return false;
    if (input.planId && !input.backfilled) {
      const plan = await d.dayPlans.get(input.planId);
      if (plan) {
        if (input.decision === 'two_minutes' && ['planned', 'not_started', 'unknown', 'paused'].includes(plan.status)) {
          const kind: EventKind = plan.status === 'paused' ? 'ACTION_RESUMED' : 'ACTION_STARTED';
          await d.dayPlans.put({ ...plan, status: 'in_progress' });
          await d.events.add(mkEvent(kind, plan.localDate, plan.id, { via: 'internal_switch_two_minutes', switchId: ev.id }));
        } else if (input.decision === 'rest') {
          await d.dayPlans.put({ ...plan, status: 'rest', dayMode: 'recover' });
          await d.events.add(mkEvent('REST_CHOSEN', plan.localDate, plan.id, { via: 'internal_switch', switchId: ev.id }));
        } else if (input.decision === 'other_activity' && plan.status === 'in_progress') {
          await d.dayPlans.put({ ...plan, status: 'paused' });
        }
      }
    }
    return true;
  });
}

export interface ExternalInterruptInput {
  opId: string;
  planId: string | null;
  date: string;
  critical: boolean;
  triage?: 'now' | 'delegate' | 'later' | null;
  summary?: string | null;
  resumeFirstStep?: string | null;
  resumeAt?: string | null; // HH:mm
  occurredAt?: string;
  backfilled?: boolean;
  resumeOutcome?: 'resumed' | 'not_resumed' | null;
}

export async function recordExternalInterrupt(input: ExternalInterruptInput): Promise<boolean> {
  const d = db();
  return d.transaction('rw', [d.dayPlans, d.events, d.kv], async () => {
    let planStatusBefore: string | null = null;
    if (input.planId) planStatusBefore = (await d.dayPlans.get(input.planId))?.status ?? null;
    const ev = mkEvent('EXTERNAL_INTERRUPT', input.date, input.planId, {
      critical: input.critical,
      triage: input.triage ?? null,
      summary: input.summary ?? null,
      resumeFirstStep: input.resumeFirstStep ?? null,
      resumeAt: input.resumeAt ?? null,
      resumeOutcome: input.resumeOutcome ?? null,
      planStatusBefore,
      backfilled: !!input.backfilled,
    }, input.opId);
    if (input.occurredAt) ev.occurredAt = input.occurredAt;
    const added = await addEventOnce(ev);
    if (!added) return false;
    if (input.planId && !input.backfilled) {
      const plan = await d.dayPlans.get(input.planId);
      if (plan && plan.status === 'in_progress') {
        await d.dayPlans.put({ ...plan, status: 'paused' });
        await d.events.add(mkEvent('ACTION_PAUSED', plan.localDate, plan.id, { via: 'external_interrupt', interruptId: ev.id }));
      }
    }
    return true;
  });
}

/** 中断からの復帰／未復帰を事実として記録（予定を過ぎても非難しない） */
export async function setInterruptOutcome(interruptId: string, outcome: 'resumed' | 'not_resumed'): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.dayPlans, d.events, d.kv], async () => {
    const ev = await d.events.get(interruptId);
    if (!ev || ev.payload?.resumeOutcome === outcome) return;
    await d.events.put({ ...ev, payload: { ...ev.payload, resumeOutcome: outcome, resumedAt: outcome === 'resumed' ? clock.now().toISOString() : null }, updatedAt: clock.now().toISOString() });
    if (outcome === 'resumed' && ev.planId) {
      const plan = await d.dayPlans.get(ev.planId);
      if (plan && (plan.status === 'paused' || plan.status === 'planned')) {
        await d.dayPlans.put({ ...plan, status: 'in_progress' });
        await d.events.add(mkEvent(plan.status === 'paused' ? 'ACTION_RESUMED' : 'ACTION_STARTED', plan.localDate, plan.id, { interruptId }));
      }
    }
  });
}

/** 今日は計画しない（合理的な変更） */
export async function markPlanChanged(planId: string, reason: string | null): Promise<boolean> {
  return transition(planId, ['planned', 'paused', 'not_started', 'unknown', 'in_progress'], 'changed', 'REPLAN', { reason, cancelled: true });
}

// ---------------- 夜の確認 ----------------
export type EveningStatus = 'started' | 'completed' | 'changed' | 'rest' | 'not_started' | 'unknown';
const EVENING_TO_STATUS: Record<EveningStatus, PlanStatus> = {
  started: 'in_progress', completed: 'completed', changed: 'changed', rest: 'rest', not_started: 'not_started', unknown: 'unknown',
};

export interface EveningInput {
  opId: string;
  date: string;
  status: EveningStatus | null;
  progress?: string | null;
  learning?: string | null;
  outcomeText?: string | null;
  outcomeQuantity?: number | null;
  outcomeUnit?: string | null;
  alignment?: 'yes' | 'partly' | 'no' | null;
  tomorrowAction?: string | null;
  tomorrowCue?: string | null;
  lifeTimeNote?: string | null;
}

export async function saveEveningReview(input: EveningInput): Promise<boolean> {
  const d = db();
  return d.transaction('rw', [d.dayPlans, d.events, d.evidence, d.kv, d.experiments, d.goals], async () => {
    const plan = await planForDate(input.date);
    const ev = mkEvent('DAILY_REVIEW', input.date, plan?.id ?? null, {
      status: input.status,
      alignment: input.alignment ?? null,
      hasProgress: !!input.progress?.trim(),
      hasLearning: !!input.learning?.trim(),
      hasOutcome: !!(input.outcomeText?.trim() || typeof input.outcomeQuantity === 'number'),
      lifeTimeNote: input.lifeTimeNote ?? null,
    }, input.opId);
    const added = await addEventOnce(ev);
    if (!added) return false;
    if (plan && input.status) {
      const status = EVENING_TO_STATUS[input.status];
      await d.dayPlans.put({ ...plan, status, dayMode: status === 'rest' ? 'recover' : plan.dayMode });
    }
    const exp = await activeExperiment();
    const goalId = exp?.goalId ?? null;
    const base = { experimentId: plan?.experimentId ?? exp?.id ?? null, localDate: input.date, source: 'self_report' as const };
    if (input.progress?.trim()) await addEvidenceInTx({ ...base, layer: 'action', description: input.progress.trim(), goalId });
    if (input.learning?.trim()) await addEvidenceInTx({ ...base, layer: 'learning', description: input.learning.trim(), goalId });
    if (input.outcomeText?.trim() || typeof input.outcomeQuantity === 'number') {
      const goal = goalId ? await d.goals.get(goalId) : undefined;
      await addEvidenceInTx({
        ...base,
        layer: 'outcome',
        description: input.outcomeText?.trim() || `${input.outcomeQuantity}${input.outcomeUnit ?? ''}`,
        goalId,
        quantity: typeof input.outcomeQuantity === 'number' ? input.outcomeQuantity : null,
        unit: input.outcomeUnit?.trim() || goal?.outcomeMeasure?.unit || null,
        baselineQuantity: goal?.outcomeMeasure?.baseline ?? null,
      });
    }
    if (input.tomorrowAction?.trim()) {
      const tomorrow = addDays(input.date, 1);
      const existing = await planForDate(tomorrow);
      const nowIso = clock.now().toISOString();
      if (existing) {
        await d.dayPlans.put({ ...existing, importantAction: input.tomorrowAction.trim(), startCue: input.tomorrowCue ?? existing.startCue ?? null, status: existing.status === 'unplanned' ? 'planned' : existing.status });
      } else {
        const p: DayPlan = { id: newId('p'), localDate: tomorrow, dayMode: 'advance', status: 'planned', experimentId: exp?.id ?? null, importantAction: input.tomorrowAction.trim(), startCue: input.tomorrowCue?.trim() || exp?.startCue || null, plannedMinutes: null, plannedAt: nowIso, note: null, priorityReason: null, displacedActivity: null, isExploration: exp?.experimentKind === 'exploration' };
        await d.dayPlans.add(p);
        await d.events.add(mkEvent('PLAN_CREATED', input.date, p.id, { forDate: tomorrow, via: 'evening_reservation' }));
      }
    }
    return true;
  });
}

// ---------------- 証拠 ----------------
export interface EvidenceInput {
  layer: EvidenceLayer;
  description: string;
  goalId?: string | null;
  experimentId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  baselineQuantity?: number | null;
  source?: Evidence['source'];
  localDate?: string;
}

async function addEvidenceInTx(input: EvidenceInput): Promise<Evidence> {
  const d = db();
  const localDate = input.localDate ?? (await todayLocal());
  const e: Evidence = {
    id: newId('e'),
    layer: input.layer,
    observedAt: clock.now().toISOString(),
    description: input.description,
    goalId: input.goalId ?? null,
    experimentId: input.experimentId ?? null,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    baselineQuantity: input.baselineQuantity ?? null,
    source: input.source ?? 'self_report',
    localDate,
  } as Evidence;
  await d.evidence.add(e);
  await d.events.add(mkEvent('EVIDENCE_ADDED', localDate, null, { evidenceId: e.id, layer: e.layer }));
  return e;
}

export async function addEvidence(input: EvidenceInput): Promise<Evidence> {
  const d = db();
  return d.transaction('rw', [d.evidence, d.events, d.kv], () => addEvidenceInTx(input));
}

export async function deleteEvidence(id: string): Promise<void> {
  await db().evidence.delete(id);
}

// ---------------- 記録の追記・編集 ----------------
export async function updateEvent(id: string, patch: { payload?: Record<string, unknown>; localDate?: string; occurredAt?: string }): Promise<void> {
  const d = db();
  await d.transaction('rw', d.events, async () => {
    const ev = await d.events.get(id);
    if (!ev) return;
    await d.events.put({ ...ev, ...patch, payload: { ...ev.payload, ...(patch.payload ?? {}) }, updatedAt: clock.now().toISOString() });
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await db().events.delete(id);
}

export async function setPlanStatus(planId: string, status: PlanStatus): Promise<void> {
  const d = db();
  await d.transaction('rw', d.dayPlans, async () => {
    const p = await d.dayPlans.get(planId);
    if (p) await d.dayPlans.put({ ...p, status, dayMode: status === 'rest' ? 'recover' : p.dayMode === 'recover' ? 'advance' : p.dayMode });
  });
}

// ---------------- 人生の軸 ----------------
export async function updateLifeCompass(patch: Partial<LifeCompass>, reason: string | null): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => {
    const c = await getKv<LifeCompass>('lifeCompass');
    const prevText = [c.desiredWayOfLiving, c.lifePrinciple, c.longTermPurpose, (c.values ?? []).join('・')].filter(Boolean).join(' ／ ') || null;
    const nowIso = clock.now().toISOString();
    await putKv('lifeCompass', {
      ...c,
      ...patch,
      visibility: 'private',
      updatedAt: nowIso,
      revisions: [...(c.revisions ?? []), { changedAt: nowIso, reason, previousText: prevText }],
    });
  });
}

export async function setRoute(route: Route): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => putKv('profile', { ...(await getKv<Profile>('profile')), selectedRoute: route }));
}

/** 目標を選び直す。旧目標・旧実験は履歴として保持（retired）。 */
export async function reviseGoal(input: {
  oldGoalId: string | null;
  title: string;
  purpose?: string | null;
  reason?: string | null;
  route: Route;
  firstAction: string;
  startCue: string;
  experimentKind: Experiment['experimentKind'];
  unit?: string | null;
  baseline?: number | null;
}): Promise<{ goalId: string; experimentId: string }> {
  const d = db();
  return d.transaction('rw', [d.goals, d.experiments, d.events, d.kv], async () => {
    const nowIso = clock.now().toISOString();
    const today = await todayLocal();
    if (input.oldGoalId) {
      const old = await d.goals.get(input.oldGoalId);
      if (old) await d.goals.put({ ...old, status: 'retired', revisedAt: nowIso });
    }
    for (const ex of await d.experiments.where('status').equals('active').toArray()) {
      await d.experiments.put({ ...ex, status: 'retired' });
    }
    const measureId = newId('m');
    const goal: Goal = {
      id: newId('g'), status: input.route === 'explore' ? 'exploring' : 'provisional', title: input.title, purpose: input.purpose ?? null,
      targetDate: null, sharing: 'private', createdAt: nowIso, revisedAt: null, outcomeMeasureId: measureId, priorityReason: null, expectedOutcome: null,
      outcomeMeasure: { id: measureId, kinds: [], description: null, unit: input.unit ?? null, baseline: input.baseline ?? null, baselineDate: typeof input.baseline === 'number' ? today : null, target: null },
    };
    await d.goals.add(goal);
    const ex: Experiment = {
      id: newId('ex'), route: input.route, theme: input.title, experimentKind: input.experimentKind, firstAction: input.firstAction, startCue: input.startCue,
      fallbackPlan: null, startDate: addDays(today, 1), endDate: addDays(today, 14), status: 'active', hypothesisIds: [], evidenceMeasureIds: [measureId], goalId: goal.id,
    };
    await d.experiments.add(ex);
    await d.events.add(mkEvent('GOAL_REVISED', today, null, { oldGoalId: input.oldGoalId, newGoalId: goal.id, reason: input.reason ?? null }));
    await putKv('profile', { ...(await getKv<Profile>('profile')), selectedRoute: input.route });
    return { goalId: goal.id, experimentId: ex.id };
  });
}

export async function updateGoal(id: string, patch: Partial<Goal>): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.goals, d.events, d.kv], async () => {
    const g = await d.goals.get(id);
    if (!g) return;
    await d.goals.put({ ...g, ...patch, sharing: 'private', revisedAt: clock.now().toISOString() });
    await d.events.add(mkEvent('GOAL_REVISED', await todayLocal(), null, { goalId: id, fields: Object.keys(patch) }));
  });
}

// ---------------- レビュー ----------------
export async function saveReview(review: Omit<Review, 'id' | 'reviewedAt'> & { id?: string }): Promise<Review> {
  const d = db();
  return d.transaction('rw', [d.reviews, d.events, d.kv], async () => {
    const r: Review = { ...review, id: review.id ?? newId('r'), reviewedAt: clock.now().toISOString() } as Review;
    const exists = await d.reviews.get(r.id);
    await d.reviews.put(r);
    if (!exists && r.hypotheses) {
      const today = await todayLocal();
      for (const [hid, status] of Object.entries(r.hypotheses)) {
        await d.events.add(mkEvent('HYPOTHESIS_REVISED', today, null, { hypothesisId: hid, status, reviewId: r.id }));
      }
    }
    return r;
  });
}

/** Day14の次期実験：旧実験は completed として履歴に残す */
export async function startNextExperiment(input: {
  fromExperimentId: string | null;
  firstAction: string;
  startCue: string;
  changedCondition: string | null;
  evidenceText: string | null;
  theme?: string | null;
  hypothesisIds?: string[];
}): Promise<Experiment> {
  const d = db();
  return d.transaction('rw', [d.experiments, d.kv], async () => {
    const today = await todayLocal();
    const prev = input.fromExperimentId ? await d.experiments.get(input.fromExperimentId) : await activeExperiment();
    if (prev) await d.experiments.put({ ...prev, status: 'completed' });
    const ex: Experiment = {
      id: newId('ex'),
      route: prev?.route ?? ((await getKv<Profile>('profile')).selectedRoute ?? 'execute'),
      theme: input.theme?.trim() || prev?.theme || '次の14日間の実験',
      experimentKind: prev?.experimentKind ?? 'execution',
      firstAction: input.firstAction,
      startCue: input.startCue,
      fallbackPlan: prev?.fallbackPlan ?? null,
      startDate: addDays(today, 1),
      endDate: addDays(today, 14),
      status: 'active',
      hypothesisIds: input.hypothesisIds ?? prev?.hypothesisIds ?? [],
      evidenceMeasureIds: prev?.evidenceMeasureIds ?? [],
      goalId: prev?.goalId ?? null,
      changedCondition: input.changedCondition,
      evidencePlan: { kinds: [], text: input.evidenceText, unit: prev?.evidencePlan?.unit ?? null, baseline: prev?.evidencePlan?.baseline ?? null, target: null },
    };
    await d.experiments.add(ex);
    return ex;
  });
}

// ---------------- 人生の時間｜LIFE CLOCK ----------------
export async function updateLifeTime(patch: Partial<LifeTime>): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => {
    const lt = await getKv<LifeTime>('lifeTime');
    const next: LifeTime = { ...lt, ...patch, visibility: 'private' };
    if (patch.enabled && !lt.optedInAt) next.optedInAt = clock.now().toISOString();
    await putKv('lifeTime', next);
  });
}

export async function addLifeReflection(questionId: LifeTimeQuestionId, answer: string | null, kind: 'values' | 'weekly' | 'daily' | 'other'): Promise<string> {
  const d = db();
  return d.transaction('rw', d.kv, async () => {
    const lt = await getKv<LifeTime>('lifeTime');
    const id = newId('lt');
    await putKv('lifeTime', { ...lt, reflections: [...lt.reflections, { id, questionId, recordedAt: clock.now().toISOString(), answer, linkedPlanId: null, kind }] });
    return id;
  });
}

export async function deleteLifeReflection(id: string): Promise<void> {
  const d = db();
  await d.transaction('rw', d.kv, async () => {
    const lt = await getKv<LifeTime>('lifeTime');
    await putKv('lifeTime', { ...lt, reflections: lt.reflections.filter((r) => r.id !== id), reflectionToPlanLinks: lt.reflectionToPlanLinks.filter((l) => l.reflectionId !== id) });
  });
}

/** 問い → 今日の最重要行動。行動の証拠は作らない（実行済みにしない）。内部参照IDのみ保存。 */
export async function linkReflectionToPlan(reflectionId: string | null, planId: string): Promise<void> {
  if (!reflectionId) return;
  const d = db();
  await d.transaction('rw', d.kv, async () => {
    const lt = await getKv<LifeTime>('lifeTime');
    if (lt.reflectionToPlanLinks.some((l) => l.reflectionId === reflectionId && l.planId === planId)) return;
    await putKv('lifeTime', {
      ...lt,
      reflections: lt.reflections.map((r) => (r.id === reflectionId ? { ...r, linkedPlanId: planId } : r)),
      reflectionToPlanLinks: [...lt.reflectionToPlanLinks, { reflectionId, planId }],
    });
  });
}

/** LIFE CLOCKの記録だけ削除（他の記録は変更しない。リンク元計画の『選んだ理由』のみ消去） */
export async function deleteLifeTimeData(): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.kv, d.dayPlans], async () => {
    const lt = await getKv<LifeTime>('lifeTime');
    for (const link of lt.reflectionToPlanLinks) {
      const p = await d.dayPlans.get(link.planId);
      if (p && p.priorityReason) await d.dayPlans.put({ ...p, priorityReason: null });
    }
    await putKv('lifeTime', defaultLifeTime());
  });
}

// ---------------- 全削除 ----------------
export async function deleteAllData(): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.kv, ...d.collections], async () => {
    await Promise.all([d.kv.clear(), ...d.collections.map((t) => t.clear())]);
  });
  await ensureInitialized();
}
