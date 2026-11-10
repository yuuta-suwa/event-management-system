/**
 * バックアップの検証・マイグレーション（spec/MIGRATION_v2_0_to_v2_1.md）
 * 解析 → バージョン確認 → v2.0妥当性確認 → 非破壊コピー → v2.1変換 → v2.1検証。
 * 保存（トランザクション）は db/backup.ts が担当し、途中失敗時は既存データを変更しない。
 */
import { defaultLifeTime, exportV20Schema, exportV21Schema, SCHEMA_VERSION, type ExportV21 } from './schema';
import { checkIntegrity, emptyExecutionPlanning, executionPlanningSchema, type ExecutionPlanning, type IntegrityReport } from './planning';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export type ImportResult =
  | { ok: true; data: ExportV21; migratedFrom: '2.0' | null; summary: ImportSummary; executionPlanning: ExecutionPlanning; hadExecutionPlanning: boolean; integrity: IntegrityReport }
  | { ok: false; error: string };

export interface ImportSummary {
  goals: number;
  experiments: number;
  dayPlans: number;
  events: number;
  evidence: number;
  reviews: number;
  workshopStatus: string;
  lifeTimeEnabled: boolean;
  planNodes?: number;
  scheduleBlocks?: number;
  executionEvents?: number;
  outcomeRecords?: number;
}

export function summarize(d: ExportV21): ImportSummary {
  return {
    goals: d.goals.length,
    experiments: d.experiments.length,
    dayPlans: d.dayPlans.length,
    events: d.events.length,
    evidence: d.evidence.length,
    reviews: d.reviews.length,
    workshopStatus: d.workshop.status,
    lifeTimeEnabled: d.lifeTime.enabled,
  };
}

/** v2.0 → v2.1：既存項目は1件も変更しない。lifeTime を無効状態で追加。 */
export function migrateV20toV21(v20: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(v20);
  copy.schemaVersion = SCHEMA_VERSION;
  copy.lifeTime = defaultLifeTime();
  return copy;
}

function firstIssue(issues: { path: PropertyKey[]; message: string }[]): string {
  const i = issues[0];
  return i ? `${i.path.map(String).join('.') || '(ルート)'}：${i.message}` : '不明なエラー';
}

export function parseBackup(text: string, byteSize?: number): ImportResult {
  const size = byteSize ?? new Blob([text]).size;
  if (size > MAX_BACKUP_BYTES) return { ok: false, error: `ファイルが大きすぎます（上限 ${MAX_BACKUP_BYTES / 1024 / 1024}MB）。` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読み込めませんでした。MetaEVO Shiftのバックアップファイルか確認してください。' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'バックアップの形式が正しくありません。' };
  const version = (raw as Record<string, unknown>).schemaVersion;
  if (version === '2.0') {
    const v20 = exportV20Schema.safeParse(raw);
    if (!v20.success) return { ok: false, error: `v2.0データの検証に失敗：${firstIssue(v20.error.issues)}` };
    const migrated = migrateV20toV21(raw as Record<string, unknown>);
    const v21 = exportV21Schema.safeParse(migrated);
    if (!v21.success) return { ok: false, error: `v2.1への変換後の検証に失敗：${firstIssue(v21.error.issues)}` };
    return withPlanning(raw as Record<string, unknown>, v21.data as ExportV21, '2.0');
  }
  if (version === SCHEMA_VERSION) {
    const v21 = exportV21Schema.safeParse(raw);
    if (!v21.success) return { ok: false, error: `データの検証に失敗：${firstIssue(v21.error.issues)}` };
    return withPlanning(raw as Record<string, unknown>, v21.data as ExportV21, null);
  }
  if (typeof version === 'string') {
    return { ok: false, error: `未対応のデータバージョン（${version}）です。アプリを更新してから復元してください。元のファイルはそのまま保管してください。` };
  }
  return { ok: false, error: 'schemaVersionがありません。MetaEVO Shiftのバックアップファイルではない可能性があります。' };
}

/** v2.4 executionPlanning の検証。旧バックアップ（領域なし）は空の領域で初期化する（非破壊） */
function withPlanning(raw: Record<string, unknown>, data: ExportV21, migratedFrom: '2.0' | null): ImportResult {
  const had = raw.executionPlanning !== undefined;
  const ep = executionPlanningSchema.safeParse(had ? raw.executionPlanning : emptyExecutionPlanning());
  if (!ep.success) return { ok: false, error: `行動計画データ（executionPlanning）の検証に失敗：${firstIssue(ep.error.issues)}` };
  const planning = ep.data as ExecutionPlanning;
  const integrity = checkIntegrity(planning, { goalIds: data.goals.map((g) => g.id), hasLifeCompass: !!data.lifeCompass });
  if (integrity.errors.length) return { ok: false, error: `行動計画データの整合性エラー：${integrity.errors[0]}${integrity.errors.length > 1 ? ` ほか${integrity.errors.length - 1}件` : ''}` };
  const summary = { ...summarize(data), planNodes: planning.planNodes.length, scheduleBlocks: planning.scheduleBlocks.length, executionEvents: planning.executionEvents.length, outcomeRecords: planning.outcomeRecords.length };
  return { ok: true, data, migratedFrom, summary, executionPlanning: planning, hadExecutionPlanning: had, integrity };
}
