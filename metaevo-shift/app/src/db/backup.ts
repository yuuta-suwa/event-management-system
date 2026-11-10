/**
 * JSONバックアップと復元（schemaVersion付き、検証・マイグレーション・トランザクション保存）
 * v2.4：executionPlanning を含める。schemaVersion は 2.1 のまま（追加プロパティ。v2.1公式スキーマで検証可能）
 */
import { db } from './db';
import { clock, loadAll, updatePreferences } from './repo';
import { exportV21Schema, SCHEMA_VERSION, type ExportV21 } from '../domain/schema';
import { parseBackup, type ImportResult } from '../domain/migration';
import { localDateOf } from '../domain/dates';
import { checkIntegrity, executionPlanningSchema, FEATURE_VERSION, mergeExecutionPlanning, stable, type ExecutionPlanning } from '../domain/planning';

export type ExportV24 = ExportV21 & { featureVersion: string; exportedAt: string; executionPlanning: ExecutionPlanning };

export async function buildExport(): Promise<ExportV24> {
  const a = await loadAll();
  const data = {
    schemaVersion: SCHEMA_VERSION,
    featureVersion: FEATURE_VERSION,
    createdAt: a.createdAt,
    exportedAt: clock.now().toISOString(),
    preferences: a.preferences,
    profile: a.profile,
    workshop: a.workshop,
    goals: a.goals,
    experiments: a.experiments,
    dayPlans: a.dayPlans,
    events: a.events,
    evidence: a.evidence,
    reviews: a.reviews,
    lifeCompass: a.lifeCompass,
    lifeTime: a.lifeTime,
    executionPlanning: a.executionPlanning,
  };
  if (!exportV21Schema.safeParse(data).success || !executionPlanningSchema.safeParse(data.executionPlanning).success) {
    throw new Error('バックアップ作成前の検証に失敗しました。');
  }
  return data as ExportV24;
}

export function backupFileName(now: Date, timeZone: string, isDemo: boolean): string {
  return `metaevo-shift-${isDemo ? 'DEMO-' : ''}backup-${localDateOf(now, timeZone).replaceAll('-', '')}.json`;
}

function saveBlob(text: string, name: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 端末にJSONファイルとして保存する。共有シートが使える端末では共有シートも選べる。 */
export async function downloadBackup(isDemo: boolean, preferShare = false): Promise<string> {
  const data = await buildExport();
  const text = JSON.stringify(data, null, 2);
  const name = backupFileName(clock.now(), data.preferences.timeZone, isDemo);
  const file = typeof File !== 'undefined' ? new File([text], name, { type: 'application/json' }) : null;
  const nav = globalThis.navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (preferShare && file && nav?.canShare?.({ files: [file] })) await nav.share({ files: [file], title: name });
  else saveBlob(text, name);
  if (!isDemo) await updatePreferences({ lastBackupAt: clock.now().toISOString() });
  return name;
}

export function validateBackupText(text: string, size?: number): ImportResult {
  return parseBackup(text, size);
}

const SNAPSHOT_KEY = 'preImportSnapshot';

/** 直前のバックアップ（復元前に端末内へ自動保存。1世代） */
export async function getPreImportSnapshot(): Promise<{ savedAt: string; text: string } | null> {
  const row = await db().kv.get(SNAPSHOT_KEY);
  return (row?.value as { savedAt: string; text: string } | undefined) ?? null;
}
export async function downloadPreImportSnapshot(): Promise<boolean> {
  const s = await getPreImportSnapshot();
  if (!s) return false;
  saveBlob(s.text, `metaevo-shift-before-restore-${s.savedAt.slice(0, 19).replace(/[-:T]/g, '')}.json`);
  return true;
}

export type RestoreMode = 'replace' | 'merge';
export interface RestoreReport {
  mode: RestoreMode;
  added: number;
  identical: number;
  conflicts: { collection: string; id: string }[];
}

type Validated = Extract<ImportResult, { ok: true }>;

/**
 * 検証済みデータで復元する。
 * - replace：端末データを読み込んだ内容で置き換える
 * - merge：同じIDは追加しない（2回取り込んでも重複しない）。内容が異なる同じIDは既存を残して競合として報告
 * どちらも開始前に直前の状態を端末内へ退避し、途中で失敗したら Dexie がロールバックして既存データは変わらない。
 */
export async function restoreFromValidated(data: ExportV21, opts: { mode?: RestoreMode; executionPlanning?: ExecutionPlanning } = {}): Promise<RestoreReport> {
  const mode = opts.mode ?? 'replace';
  const d = db();
  const snapshot = JSON.stringify(await buildExport().catch(() => null));
  const report: RestoreReport = { mode, added: 0, identical: 0, conflicts: [] };
  await d.transaction('rw', [...d.allTables], async () => {
    const appMeta = (await d.kv.get('appMeta'))?.value as Record<string, unknown> | undefined;
    const incomingEp = opts.executionPlanning ?? (data as Partial<ExportV24>).executionPlanning ?? null;
    if (mode === 'replace') {
      await Promise.all(d.allTables.map((t) => t.clear()));
      await d.kv.bulkPut([
        { key: 'meta', value: { schemaVersion: SCHEMA_VERSION, createdAt: data.createdAt } },
        { key: 'preferences', value: data.preferences },
        { key: 'profile', value: data.profile ?? {} },
        { key: 'workshop', value: data.workshop },
        { key: 'lifeCompass', value: data.lifeCompass },
        { key: 'lifeTime', value: data.lifeTime },
        { key: 'appMeta', value: { ...(appMeta ?? {}), onboardingDone: true, dismissedReviews: (appMeta?.dismissedReviews as string[]) ?? [] } },
      ]);
      await d.goals.bulkAdd(data.goals as never[]);
      await d.experiments.bulkAdd(data.experiments as never[]);
      await d.dayPlans.bulkAdd(data.dayPlans as never[]);
      await d.events.bulkAdd(data.events.map((e) => ({ ...e, payload: e.payload ?? {} })) as never[]);
      await d.evidence.bulkAdd(data.evidence as never[]);
      await d.reviews.bulkAdd(data.reviews as never[]);
      if (incomingEp) {
        await d.planNodes.bulkAdd(incomingEp.planNodes as never[]);
        await d.scheduleBlocks.bulkAdd(incomingEp.scheduleBlocks as never[]);
        await d.executionEvents.bulkAdd(incomingEp.executionEvents as never[]);
        await d.ifThenRules.bulkAdd(incomingEp.ifThenRules as never[]);
        await d.outcomeRecords.bulkAdd(incomingEp.outcomeRecords as never[]);
        report.added = incomingEp.planNodes.length + incomingEp.scheduleBlocks.length + incomingEp.executionEvents.length + incomingEp.ifThenRules.length + incomingEp.outcomeRecords.length;
      }
    } else {
      // v2.3の記録：同じIDは既存を残し、ないものだけ追加。人生の軸などの単一項目は端末側を維持
      const legacy: [typeof d.goals | typeof d.experiments | typeof d.dayPlans | typeof d.events | typeof d.evidence | typeof d.reviews, { id: string }[]][] = [
        [d.goals, data.goals], [d.experiments, data.experiments], [d.dayPlans, data.dayPlans], [d.events, data.events.map((e) => ({ ...e, payload: e.payload ?? {} }))], [d.evidence, data.evidence], [d.reviews, data.reviews],
      ];
      for (const [table, items] of legacy) {
        for (const it of items) {
          const ex = await (table as typeof d.goals).get(it.id);
          if (!ex) {
            await (table as typeof d.goals).add(it as never);
            report.added++;
          } else if (stable(ex) === stable(it)) report.identical++;
          else report.conflicts.push({ collection: table.name, id: it.id });
        }
      }
      if (incomingEp) {
        const current: ExecutionPlanning = {
          version: 1, planNodes: await d.planNodes.toArray(), scheduleBlocks: await d.scheduleBlocks.toArray(), executionEvents: await d.executionEvents.toArray(),
          ifThenRules: await d.ifThenRules.toArray(), outcomeRecords: await d.outcomeRecords.toArray(),
        };
        const m = mergeExecutionPlanning(current, incomingEp);
        const goals = await d.goals.toArray();
        const integ = checkIntegrity(m.merged, { goalIds: goals.map((g) => g.id), hasLifeCompass: true });
        if (integ.errors.length) throw new Error(`統合後の整合性エラー：${integ.errors[0]}`);
        await d.planNodes.bulkPut(m.merged.planNodes as never[]);
        await d.scheduleBlocks.bulkPut(m.merged.scheduleBlocks as never[]);
        await d.executionEvents.bulkPut(m.merged.executionEvents as never[]);
        await d.ifThenRules.bulkPut(m.merged.ifThenRules as never[]);
        await d.outcomeRecords.bulkPut(m.merged.outcomeRecords as never[]);
        report.added += m.added;
        report.identical += m.identical;
        report.conflicts.push(...m.conflicts);
      }
    }
    await d.kv.put({ key: SNAPSHOT_KEY, value: { savedAt: clock.now().toISOString(), text: snapshot } });
  });
  return report;
}

/** 画面からの復元（検証結果をそのまま渡す） */
export function restoreValidated(v: Validated, mode: RestoreMode): Promise<RestoreReport> {
  return restoreFromValidated(v.data, { mode, executionPlanning: v.executionPlanning });
}
