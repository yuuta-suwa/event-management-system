/** JSONバックアップと復元（schemaVersion付き、検証・マイグレーション・トランザクション保存） */
import { db } from './db';
import { clock, loadAll, updatePreferences } from './repo';
import { exportV21Schema, SCHEMA_VERSION, type ExportV21 } from '../domain/schema';
import { parseBackup, type ImportResult } from '../domain/migration';
import { localDateOf } from '../domain/dates';

export async function buildExport(): Promise<ExportV21> {
  const a = await loadAll();
  const data = {
    schemaVersion: SCHEMA_VERSION,
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
  };
  const parsed = exportV21Schema.safeParse(data);
  if (!parsed.success) throw new Error('バックアップ作成前の検証に失敗しました。');
  return data as ExportV21;
}

export function backupFileName(now: Date, timeZone: string, isDemo: boolean): string {
  return `metaevo-shift-${isDemo ? 'DEMO-' : ''}backup-${localDateOf(now, timeZone).replaceAll('-', '')}.json`;
}

/** 端末にJSONファイルとして保存する。共有シートが使える端末では共有シートも選べる。 */
export async function downloadBackup(isDemo: boolean, preferShare = false): Promise<string> {
  const data = await buildExport();
  const text = JSON.stringify(data, null, 2);
  const name = backupFileName(clock.now(), data.preferences.timeZone, isDemo);
  const blob = new Blob([text], { type: 'application/json' });
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/json' }) : null;
  const nav = globalThis.navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (preferShare && file && nav?.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: name });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  if (!isDemo) await updatePreferences({ lastBackupAt: clock.now().toISOString() });
  return name;
}

export function validateBackupText(text: string, size?: number): ImportResult {
  return parseBackup(text, size);
}

/** 検証済みデータで端末データを置き換える。途中失敗時は Dexie がロールバックし既存データは変わらない。 */
export async function restoreFromValidated(data: ExportV21): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.kv, ...d.collections], async () => {
    const appMeta = (await d.kv.get('appMeta'))?.value as Record<string, unknown> | undefined;
    await Promise.all([d.kv.clear(), ...d.collections.map((t) => t.clear())]);
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
  });
}
