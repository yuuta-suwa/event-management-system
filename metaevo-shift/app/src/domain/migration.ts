/**
 * バックアップの検証・マイグレーション（spec/MIGRATION_v2_0_to_v2_1.md）
 * 解析 → バージョン確認 → v2.0妥当性確認 → 非破壊コピー → v2.1変換 → v2.1検証。
 * 保存（トランザクション）は db/backup.ts が担当し、途中失敗時は既存データを変更しない。
 */
import { defaultLifeTime, exportV20Schema, exportV21Schema, SCHEMA_VERSION, type ExportV21 } from './schema';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export type ImportResult =
  | { ok: true; data: ExportV21; migratedFrom: '2.0' | null; summary: ImportSummary }
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
    return { ok: true, data: v21.data as ExportV21, migratedFrom: '2.0', summary: summarize(v21.data as ExportV21) };
  }
  if (version === SCHEMA_VERSION) {
    const v21 = exportV21Schema.safeParse(raw);
    if (!v21.success) return { ok: false, error: `データの検証に失敗：${firstIssue(v21.error.issues)}` };
    return { ok: true, data: v21.data as ExportV21, migratedFrom: null, summary: summarize(v21.data as ExportV21) };
  }
  if (typeof version === 'string') {
    return { ok: false, error: `未対応のデータバージョン（${version}）です。アプリを更新してから復元してください。元のファイルはそのまま保管してください。` };
  }
  return { ok: false, error: 'schemaVersionがありません。MetaEVO Shiftのバックアップファイルではない可能性があります。' };
}
