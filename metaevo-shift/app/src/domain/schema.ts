/**
 * MetaEVO Shift 保存データ v2.1（spec/DATA_SCHEMA.json と一致させる）
 * 追加プロパティは JSON Schema 上許容されている（additionalProperties 未指定）ため、
 * 実装上必要な補助項目は passthrough で保持する。補助項目の一覧は README「仕様からの補足」を参照。
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '2.1' as const;

const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), '日時の形式が正しくありません');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません');
const nullableStr = z.string().nullable();

export const ROUTES = ['explore', 'protect', 'plan', 'execute'] as const;
export const routeSchema = z.enum(ROUTES);
export type Route = z.infer<typeof routeSchema>;

export const DAY_MODES = ['advance', 'prepare', 'recover'] as const;
export type DayMode = (typeof DAY_MODES)[number];

export const PLAN_STATUSES = [
  'unplanned', 'planned', 'in_progress', 'paused', 'completed', 'not_started', 'changed', 'rest', 'unknown',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const EVENT_KINDS = [
  'PLAN_CREATED', 'ACTION_STARTED', 'ACTION_PAUSED', 'ACTION_COMPLETED', 'INTERNAL_SWITCH', 'EXTERNAL_INTERRUPT',
  'ACTION_RESUMED', 'REPLAN', 'REST_CHOSEN', 'DAILY_REVIEW', 'HYPOTHESIS_REVISED', 'GOAL_REVISED', 'EVIDENCE_ADDED',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVIDENCE_LAYERS = ['action', 'learning', 'outcome', 'alignment'] as const;
export type EvidenceLayer = (typeof EVIDENCE_LAYERS)[number];

export const HYPOTHESIS_STATUSES = ['supported', 'contradicted', 'insufficient', 'rejected', 'not_applicable'] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

export const REVIEW_KINDS = ['day7', 'day14', 'day30', 'day60', 'day90', 'daily', 'custom'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const LT_IDS = ['LT00', 'LT01', 'LT02', 'LT03', 'LT04', 'LT05'] as const;
export type LifeTimeQuestionId = (typeof LT_IDS)[number];

export const preferencesSchema = z
  .object({
    timeZone: z.string().min(1),
    dataSharing: z.literal('private'),
    lastBackupAt: isoDateTime.nullable().optional(),
    displayTheme: z.enum(['dark', 'light', 'system']).optional(),
  })
  .passthrough();

export const profileSchema = z
  .object({
    currentChallenge: nullableStr.optional(),
    valueDrafts: z.array(z.string()).optional(),
    motivations: z.array(z.string()).optional(),
    sharingResistance: nullableStr.optional(),
    selectedRoute: routeSchema.optional(),
  })
  .passthrough();

export const workshopSchema = z
  .object({
    status: z.enum(['not_started', 'in_progress', 'completed']),
    startedAt: isoDateTime.nullable().optional(),
    completedAt: isoDateTime.nullable().optional(),
    answers: z.record(z.string(), z.unknown()),
    selectedRoute: routeSchema.optional(),
    initialExperimentId: nullableStr.optional(),
  })
  .passthrough();

export const goalSchema = z
  .object({
    id: z.string(),
    status: z.enum(['exploring', 'provisional', 'committed', 'paused', 'retired']),
    title: z.string(),
    purpose: nullableStr.optional(),
    targetDate: isoDate.nullable().optional(),
    sharing: z.literal('private'),
    createdAt: isoDateTime,
    revisedAt: isoDateTime.nullable().optional(),
    outcomeMeasureId: nullableStr.optional(),
    priorityReason: nullableStr.optional(),
    expectedOutcome: nullableStr.optional(),
  })
  .passthrough();

export const experimentSchema = z
  .object({
    id: z.string(),
    route: routeSchema,
    theme: z.string(),
    experimentKind: z.enum(['exploration', 'learning', 'execution']),
    firstAction: z.string(),
    startCue: z.string(),
    fallbackPlan: nullableStr.optional(),
    startDate: isoDate,
    endDate: isoDate,
    status: z.enum(['draft', 'active', 'completed', 'paused', 'retired']),
    hypothesisIds: z.array(z.string()).optional(),
    evidenceMeasureIds: z.array(z.string()).optional(),
  })
  .passthrough();

export const dayPlanSchema = z
  .object({
    id: z.string(),
    localDate: isoDate,
    dayMode: z.enum(DAY_MODES),
    status: z.enum(PLAN_STATUSES),
    experimentId: nullableStr.optional(),
    importantAction: nullableStr.optional(),
    startCue: nullableStr.optional(),
    plannedMinutes: z.number().min(0).nullable().optional(),
    plannedAt: isoDateTime.nullable().optional(),
    note: nullableStr.optional(),
    priorityReason: nullableStr.optional(),
    displacedActivity: nullableStr.optional(),
  })
  .passthrough();

export const eventSchema = z
  .object({
    id: z.string(),
    kind: z.enum(EVENT_KINDS),
    occurredAt: isoDateTime,
    localDate: isoDate,
    planId: nullableStr.optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    updatedAt: isoDateTime.nullable().optional(),
  })
  .passthrough();

export const evidenceSchema = z
  .object({
    id: z.string(),
    layer: z.enum(EVIDENCE_LAYERS),
    observedAt: isoDateTime,
    description: z.string(),
    goalId: nullableStr.optional(),
    experimentId: nullableStr.optional(),
    quantity: z.number().nullable().optional(),
    unit: nullableStr.optional(),
    baselineQuantity: z.number().nullable().optional(),
    source: z.enum(['self_report', 'record', 'external_document', 'other']).optional(),
  })
  .passthrough();

export const reviewSchema = z
  .object({
    id: z.string(),
    reviewKind: z.enum(REVIEW_KINDS),
    reviewedAt: isoDateTime,
    periodStart: isoDate.nullable().optional(),
    periodEnd: isoDate.nullable().optional(),
    facts: nullableStr.optional(),
    hypothesisStatus: z.enum(HYPOTHESIS_STATUSES).optional(),
    nextAction: nullableStr.optional(),
    note: nullableStr.optional(),
  })
  .passthrough();

export const lifeCompassSchema = z
  .object({
    status: z.enum(['exploring', 'provisional', 'committed', 'paused']),
    visibility: z.literal('private'),
    values: z.array(z.string()).optional(),
    desiredWayOfLiving: nullableStr.optional(),
    lifePrinciple: nullableStr.optional(),
    longTermPurpose: nullableStr.optional(),
    updatedAt: isoDateTime.nullable().optional(),
    revisions: z
      .array(
        z
          .object({ changedAt: isoDateTime.optional(), reason: nullableStr.optional(), previousText: nullableStr.optional() })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const lifeTimeReflectionSchema = z
  .object({
    id: z.string(),
    questionId: z.enum(LT_IDS),
    recordedAt: isoDateTime,
    answer: nullableStr.optional(),
    linkedPlanId: nullableStr.optional(),
    kind: z.enum(['values', 'weekly', 'daily', 'other']).optional(),
  })
  .passthrough();

export const lifeTimeSchema = z
  .object({
    enabled: z.boolean(),
    displayMode: z.enum(['reflection', 'year', 'weeks']),
    homeCard: z.enum(['off', 'gentle']),
    visibility: z.literal('private'),
    birthDate: isoDate.nullable().optional(),
    birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
    planningHorizonAge: z.number().int().min(1).max(120).nullable().optional(),
    optedInAt: isoDateTime.nullable().optional(),
    reflections: z.array(lifeTimeReflectionSchema),
    reflectionToPlanLinks: z.array(z.object({ reflectionId: z.string(), planId: z.string() }).passthrough()),
  })
  .passthrough();

export const exportV21Schema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    createdAt: isoDateTime,
    preferences: preferencesSchema,
    profile: profileSchema.optional(),
    workshop: workshopSchema,
    goals: z.array(goalSchema),
    experiments: z.array(experimentSchema),
    dayPlans: z.array(dayPlanSchema),
    events: z.array(eventSchema),
    evidence: z.array(evidenceSchema),
    reviews: z.array(reviewSchema),
    lifeCompass: lifeCompassSchema,
    lifeTime: lifeTimeSchema,
  })
  .passthrough();

/** v2.0 は lifeTime を持たない以外は同一構造（spec/MIGRATION_v2_0_to_v2_1.md） */
export const exportV20Schema = exportV21Schema
  .omit({ schemaVersion: true, lifeTime: true })
  .extend({ schemaVersion: z.literal('2.0') })
  .passthrough();

export type Preferences = z.infer<typeof preferencesSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Workshop = z.infer<typeof workshopSchema> & { currentStepId?: string | null };
export type Goal = z.infer<typeof goalSchema> & { outcomeMeasure?: OutcomeMeasure | null };
export type Experiment = z.infer<typeof experimentSchema> & {
  doneWhen?: string | null;
  evidencePlan?: EvidencePlan | null;
  goalId?: string | null;
  changedCondition?: string | null;
};
export type DayPlan = z.infer<typeof dayPlanSchema> & { doneWhen?: string | null; isExploration?: boolean };
export type AppEvent = z.infer<typeof eventSchema> & { payload: Record<string, unknown> };
export type Evidence = z.infer<typeof evidenceSchema>;
export type Review = z.infer<typeof reviewSchema> & { answers?: Record<string, unknown>; hypotheses?: Record<string, HypothesisStatus> };
export type LifeCompass = z.infer<typeof lifeCompassSchema>;
export type LifeTime = z.infer<typeof lifeTimeSchema>;
export type LifeTimeReflection = z.infer<typeof lifeTimeReflectionSchema>;
export type ExportV21 = z.infer<typeof exportV21Schema>;

/** 目標ごとの成果証拠の定義（種類・単位・基準値・計測日） */
export interface OutcomeMeasure {
  id: string;
  kinds: string[];
  description: string | null;
  unit: string | null;
  baseline: number | null;
  baselineDate: string | null;
  target: number | null;
}

export interface EvidencePlan {
  kinds: string[];
  text: string | null;
  unit: string | null;
  baseline: number | null;
  target: number | null;
}

export function defaultLifeTime(): LifeTime {
  return {
    enabled: false,
    displayMode: 'reflection',
    homeCard: 'off',
    visibility: 'private',
    birthDate: null,
    birthYear: null,
    planningHorizonAge: null,
    optedInAt: null,
    reflections: [],
    reflectionToPlanLinks: [],
  };
}

export function defaultLifeCompass(): LifeCompass {
  return { status: 'exploring', visibility: 'private', values: [], desiredWayOfLiving: null, lifePrinciple: null, longTermPurpose: null, updatedAt: null, revisions: [] };
}

export function defaultWorkshop(): Workshop {
  return { status: 'not_started', startedAt: null, completedAt: null, answers: {}, initialExperimentId: null, currentStepId: null };
}

export function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  } catch {
    return 'Asia/Tokyo';
  }
}

export function defaultPreferences(): Preferences {
  return { timeZone: defaultTimeZone(), dataSharing: 'private', lastBackupAt: null, displayTheme: 'dark' };
}
