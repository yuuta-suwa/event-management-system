/**
 * 4層の成長・成果指標（docs/06_METRICS_AND_PILOT.md のKPI厳密定義）
 * - 休息日・未計画日・合理的変更日は着手率の分母に含めない
 * - 未記録は「不明」。0%や未実行とみなさない
 * - 分母0は『未計測』
 */
import type { AppEvent, DayPlan, Evidence, Goal } from './schema';
import { dateRange } from './dates';

export type DayCategory = 'started' | 'not_started' | 'unknown' | 'rest' | 'changed' | 'unplanned' | 'pending' | 'future';

export function categorizePlan(plan: DayPlan | undefined, date: string, today: string): DayCategory {
  if (date > today) return 'future';
  if (!plan) return 'unplanned';
  if (plan.dayMode === 'recover' || plan.status === 'rest') return 'rest';
  if (plan.status === 'changed') return 'changed';
  if (plan.status === 'unplanned' || !plan.importantAction) return 'unplanned';
  if (plan.status === 'in_progress' || plan.status === 'paused' || plan.status === 'completed') return 'started';
  if (plan.status === 'not_started') return 'not_started';
  // planned / unknown
  if (date === today && plan.status === 'planned') return 'pending';
  return 'unknown';
}

export interface ActionMetrics {
  periodStart: string;
  periodEnd: string;
  plannedDays: number;
  knownDays: number;
  startedDays: number;
  completedDays: number;
  notStartedDays: number;
  unknownDays: number;
  restDays: number;
  changedDays: number;
  unplannedDays: number;
  pendingDays: number;
  startRate: number | null;
  coverage: number | null;
  lowCoverage: boolean;
  internalSwitches: number;
  externalInterrupts: number;
  returnKnown: number;
  returned: number;
  returnRate: number | null;
  protectedMinutes: number | null;
  byDate: Record<string, DayCategory>;
}

export function latestPlanByDate(plans: DayPlan[]): Map<string, DayPlan> {
  const map = new Map<string, DayPlan>();
  for (const p of plans) {
    const cur = map.get(p.localDate);
    if (!cur || (p.plannedAt ?? '') >= (cur.plannedAt ?? '')) map.set(p.localDate, p);
  }
  return map;
}

export function computeActionMetrics(
  plans: DayPlan[],
  events: AppEvent[],
  periodStart: string,
  periodEnd: string,
  today: string,
): ActionMetrics {
  const byPlan = latestPlanByDate(plans);
  const byDate: Record<string, DayCategory> = {};
  const counts: Record<DayCategory, number> = { started: 0, not_started: 0, unknown: 0, rest: 0, changed: 0, unplanned: 0, pending: 0, future: 0 };
  const completedDays = { n: 0 };
  for (const date of dateRange(periodStart, periodEnd)) {
    const plan = byPlan.get(date);
    const cat = categorizePlan(plan, date, today);
    byDate[date] = cat;
    counts[cat]++;
    if (cat === 'started' && plan?.status === 'completed') completedDays.n++;
  }
  const plannedDays = counts.started + counts.not_started + counts.unknown;
  const knownDays = counts.started + counts.not_started;
  const startRate = knownDays === 0 ? null : counts.started / knownDays;
  const coverage = plannedDays === 0 ? null : knownDays / plannedDays;

  const inPeriod = events.filter((e) => e.localDate >= periodStart && e.localDate <= periodEnd);
  const interrupts = inPeriod.filter((e) => e.kind === 'EXTERNAL_INTERRUPT');
  const returnKnownList = interrupts.filter((e) => e.payload?.resumeOutcome === 'resumed' || e.payload?.resumeOutcome === 'not_resumed');
  const returned = returnKnownList.filter((e) => e.payload?.resumeOutcome === 'resumed').length;
  const minutes = inPeriod
    .filter((e) => e.kind === 'ACTION_COMPLETED' && typeof e.payload?.minutes === 'number')
    .reduce((s, e) => s + (e.payload.minutes as number), 0);

  return {
    periodStart,
    periodEnd,
    plannedDays,
    knownDays,
    startedDays: counts.started,
    completedDays: completedDays.n,
    notStartedDays: counts.not_started,
    unknownDays: counts.unknown,
    restDays: counts.rest,
    changedDays: counts.changed,
    unplannedDays: counts.unplanned,
    pendingDays: counts.pending,
    startRate,
    coverage,
    lowCoverage: coverage !== null && coverage < 0.6,
    internalSwitches: inPeriod.filter((e) => e.kind === 'INTERNAL_SWITCH').length,
    externalInterrupts: interrupts.length,
    returnKnown: returnKnownList.length,
    returned,
    returnRate: returnKnownList.length === 0 ? null : returned / returnKnownList.length,
    protectedMinutes: minutes > 0 ? minutes : null,
    byDate,
  };
}

/** 実験の集計開始日：startDate（Day1）より前に紐づく計画（Day0の初回行動など）があれば含める */
export function experimentPeriodStart(exp: { id: string; startDate: string }, plans: DayPlan[]): string {
  let s = exp.startDate;
  for (const p of plans) if (p.experimentId === exp.id && p.localDate < s) s = p.localDate;
  return s;
}

export function pct(r: number): number {
  return Math.round(r * 100);
}

/** 着手率の表示文。例：『着手率 75%（記録がある8日中6日）。予定した残り2日の結果は不明』 */
export function startRateText(m: ActionMetrics): string {
  if (m.startRate === null) {
    return m.plannedDays === 0
      ? '着手率：未計測（重要行動を予定した日がまだありません）'
      : `着手率：未計測（予定した${m.plannedDays}日の着手有無がまだ記録されていません）`;
  }
  let s = `着手率 ${pct(m.startRate)}%（記録がある${m.knownDays}日中${m.startedDays}日）`;
  if (m.unknownDays > 0) s += `。予定した残り${m.unknownDays}日の結果は不明`;
  return s;
}

export function returnRateText(m: ActionMetrics): string {
  if (m.externalInterrupts === 0) return '予定外の対応：記録なし';
  if (m.returnRate === null) return `予定外の対応 ${m.externalInterrupts}件（復帰できたかは未記録）`;
  const unknown = m.externalInterrupts - m.returnKnown;
  return `予定外の対応 ${m.externalInterrupts}件：復帰の有無が分かった${m.returnKnown}件中${m.returned}件で復帰${unknown > 0 ? `（${unknown}件は未記録）` : ''}`;
}

export interface OutcomeSummary {
  goalId: string;
  goalTitle: string;
  unit: string | null;
  baseline: number | null;
  baselineDate: string | null;
  latest: number | null;
  latestDate: string | null;
  change: number | null;
  entries: Evidence[];
}

export function computeOutcomes(goals: Goal[], evidence: Evidence[]): OutcomeSummary[] {
  return goals
    .filter((g) => g.status !== 'retired' || evidence.some((e) => e.goalId === g.id && e.layer === 'outcome'))
    .map((g) => {
      const entries = evidence
        .filter((e) => e.layer === 'outcome' && e.goalId === g.id)
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
      const quantified = entries.filter((e) => typeof e.quantity === 'number');
      const last = quantified[quantified.length - 1];
      const measure = g.outcomeMeasure ?? null;
      const baseline = measure?.baseline ?? (last && typeof last.baselineQuantity === 'number' ? last.baselineQuantity : null);
      const latest = last ? (last.quantity as number) : null;
      return {
        goalId: g.id,
        goalTitle: g.title,
        unit: measure?.unit ?? last?.unit ?? null,
        baseline,
        baselineDate: measure?.baselineDate ?? null,
        latest,
        latestDate: last ? evidenceDate(last) : null,
        change: baseline !== null && latest !== null ? latest - baseline : null,
        entries,
      };
    });
}

export interface AlignmentSummary {
  yes: number;
  partly: number;
  no: number;
  unanswered: number;
  notes: Evidence[];
}

export function computeAlignment(evidence: Evidence[], events: AppEvent[], periodStart: string, periodEnd: string): AlignmentSummary {
  const ev = evidence.filter((e) => e.layer === 'alignment' && evidenceDate(e) >= periodStart && evidenceDate(e) <= periodEnd);
  const reviews = events.filter((e) => e.kind === 'DAILY_REVIEW' && e.localDate >= periodStart && e.localDate <= periodEnd);
  const s: AlignmentSummary = { yes: 0, partly: 0, no: 0, unanswered: 0, notes: ev };
  for (const r of reviews) {
    const a = r.payload?.alignment;
    if (a === 'yes') s.yes++;
    else if (a === 'partly') s.partly++;
    else if (a === 'no') s.no++;
    else s.unanswered++;
  }
  return s;
}

/** 証拠のローカル日付（保存時に localDate を補助項目として持つ。なければ observedAt の日付部分） */
export function evidenceDate(e: Evidence): string {
  const ld = (e as { localDate?: unknown }).localDate;
  return typeof ld === 'string' ? ld : e.observedAt.slice(0, 10);
}
