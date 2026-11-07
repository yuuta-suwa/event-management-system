import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, setNow } from './setup-db';
import * as repo from '../../src/db/repo';
import { buildExport, restoreFromValidated, validateBackupText } from '../../src/db/backup';
import { seedDemo } from '../../src/db/demo';
import { AppDB, DEMO_DB, useDb } from '../../src/db/db';
import { validateOfficial } from './schema-validator';
import fixture from '../../../spec/SAMPLE_FIXTURE.json';
import type { Answer } from '../../src/domain/workshop';

async function doWorkshop(extra: Record<string, Answer> = {}) {
  const answers: Record<string, Answer> = {
    Q07: { choice: 'execute' }, Q08: { text: '提案行動を予定に入れる', kind: 'execution' },
    Q15: { action: '提案を1件送る', when: 'today' }, Q16: { text: '10時に机に座ったら' }, ...extra,
  };
  for (const [k, v] of Object.entries(answers)) await repo.saveWorkshopAnswer(k, v, k);
  await repo.completeWorkshop();
}

describe('初回ワークの途中保存と再開', () => {
  beforeEach(async () => { await freshDb(); });
  it('回答は即時保存され、再読み込み後も残る（途中終了から再開）', async () => {
    await repo.saveWorkshopAnswer('Q01', { choice: '仕事' }, 'Q01');
    await repo.setWorkshopStep('Q02');
    const a = await repo.loadAll();
    expect(a.workshop.status).toBe('in_progress');
    expect(a.workshop.answers.Q01).toEqual({ choice: '仕事', skipped: false });
    expect(a.workshop.currentStepId).toBe('Q02');
  });
  it('分岐の回答は次の質問の初期値になり、後からの部分入力で消えない（統合保存）', async () => {
    await repo.saveWorkshopAnswer('Q07', { choice: 'protect' }, 'Q07');
    await repo.saveWorkshopAnswer('BR2', { text: '仮の目標を1行書く' }, 'BR2');
    await repo.setWorkshopStep('Q15');
    await repo.saveWorkshopAnswer('Q15', { when: 'today' }, 'Q15');
    const a = await repo.loadAll();
    expect(a.workshop.answers.Q15).toEqual({ action: '仮の目標を1行書く', when: 'today', skipped: false });
    await repo.saveWorkshopAnswer('Q15', { skipped: true }, 'Q15');
    expect((await repo.loadAll()).workshop.answers.Q15).toEqual({ skipped: true });
  });
  it('完了するとワーク中の入力がそのまま今日の計画になる（再入力不要）', async () => {
    await doWorkshop();
    const a = await repo.loadAll();
    expect(a.dayPlans).toHaveLength(1);
    expect(a.dayPlans[0]).toMatchObject({ localDate: '2026-11-07', importantAction: '提案を1件送る', startCue: '10時に机に座ったら', status: 'planned' });
    expect(a.evidence).toHaveLength(0);
    await repo.completeWorkshop(); // 二重完了しても重複しない
    expect((await repo.loadAll()).experiments).toHaveLength(1);
  });
});

describe('日次・イベントの冪等性', () => {
  beforeEach(async () => { await freshDb(); await doWorkshop(); });
  it('同時多重タップでも開始イベントは1件', async () => {
    const plan = (await repo.loadAll()).dayPlans[0];
    await Promise.all([repo.startAction(plan.id), repo.startAction(plan.id), repo.startAction(plan.id)]);
    const a = await repo.loadAll();
    expect(a.events.filter((e) => e.kind === 'ACTION_STARTED')).toHaveLength(1);
    expect(a.dayPlans[0].status).toBe('in_progress');
  });
  it('同じopIdの内的切替は1件のみ保存。外部中断とは別イベント', async () => {
    const plan = (await repo.loadAll()).dayPlans[0];
    const sw = { opId: 'op-1', planId: plan.id, date: plan.localDate, decision: 'two_minutes' as const, reason: '面倒' };
    await Promise.all([repo.recordInternalSwitch(sw), repo.recordInternalSwitch(sw)]);
    await repo.recordExternalInterrupt({ opId: 'op-2', planId: plan.id, date: plan.localDate, critical: false, triage: 'now', resumeFirstStep: '2行目から', resumeAt: '15:00' });
    const a = await repo.loadAll();
    expect(a.events.filter((e) => e.kind === 'INTERNAL_SWITCH')).toHaveLength(1);
    expect(a.events.filter((e) => e.kind === 'EXTERNAL_INTERRUPT')).toHaveLength(1);
    const intr = a.events.find((e) => e.kind === 'EXTERNAL_INTERRUPT')!;
    expect(intr.payload).toMatchObject({ resumeFirstStep: '2行目から', resumeAt: '15:00', resumeOutcome: null });
    expect(a.dayPlans[0].status).toBe('paused');
    await repo.setInterruptOutcome(intr.id, 'resumed');
    const b = await repo.loadAll();
    expect(b.dayPlans[0].status).toBe('in_progress');
    expect(b.events.find((e) => e.id === intr.id)!.payload.resumeOutcome).toBe('resumed');
  });
  it('回復する日は休息として保存し REST_CHOSEN を記録', async () => {
    await repo.setDayMode('2026-11-08', 'recover', '家族との時間');
    const a = await repo.loadAll();
    const p = a.dayPlans.find((x) => x.localDate === '2026-11-08')!;
    expect(p).toMatchObject({ dayMode: 'recover', status: 'rest' });
    expect(a.events.some((e) => e.kind === 'REST_CHOSEN')).toBe(true);
  });
  it('計画変更は元の予定と変更後を両方残す', async () => {
    await repo.upsertPlan({ date: '2026-11-07', importantAction: '提案の下書きを3行', replanReason: '負担を下げる' });
    const a = await repo.loadAll();
    const rp = a.events.find((e) => e.kind === 'REPLAN')!;
    expect((rp.payload.previous as Record<string, unknown>).importantAction).toBe('提案を1件送る');
    expect((rp.payload.next as Record<string, unknown>).importantAction).toBe('提案の下書きを3行');
  });
  it('夜の確認：4層の証拠を分けて保存し、明日の行動を予約', async () => {
    await repo.saveEveningReview({ opId: 'n1', date: '2026-11-07', status: 'completed', progress: '提案書を送った', learning: '構成の型が分かった', outcomeQuantity: 1, outcomeUnit: '件', alignment: 'yes', tomorrowAction: '次の提案を送る' });
    await repo.saveEveningReview({ opId: 'n1', date: '2026-11-07', status: 'completed' });
    const a = await repo.loadAll();
    expect(a.events.filter((e) => e.kind === 'DAILY_REVIEW')).toHaveLength(1);
    expect(a.evidence.map((e) => e.layer).sort()).toEqual(['action', 'learning', 'outcome']);
    expect(a.dayPlans.find((p) => p.localDate === '2026-11-08')?.importantAction).toBe('次の提案を送る');
  });
  it('目標を変えても旧目標・旧実験・過去の行動記録は保持', async () => {
    const before = await repo.loadAll();
    await repo.reviseGoal({ oldGoalId: before.goals[0].id, title: '家族との時間を守りつつ事業を育てる', route: 'plan', firstAction: '方法を3つ調べる', startCue: '夜21時', experimentKind: 'learning' });
    const a = await repo.loadAll();
    expect(a.goals).toHaveLength(2);
    expect(a.goals.find((g) => g.id === before.goals[0].id)?.status).toBe('retired');
    expect(a.experiments.filter((e) => e.status === 'retired')).toHaveLength(1);
    expect(a.dayPlans).toHaveLength(before.dayPlans.length);
    expect(a.events.some((e) => e.kind === 'GOAL_REVISED')).toBe(true);
  });
});

describe('LIFE CLOCK のデータ', () => {
  beforeEach(async () => { await freshDb(); await doWorkshop(); });
  it('初期は無効。問いから今日の行動を設定しても証拠は作らない', async () => {
    expect((await repo.loadAll()).lifeTime.enabled).toBe(false);
    await repo.updateLifeTime({ enabled: true });
    const rid = await repo.addLifeReflection('LT01', '家族との時間を後回しにしたくない', 'values');
    const plan = await repo.upsertPlan({ date: '2026-11-07', importantAction: '今夜20分、スマホを置いて話す', priorityReason: '家族との時間を後回しにしたくない' });
    await repo.linkReflectionToPlan(rid, plan.id);
    const a = await repo.loadAll();
    expect(a.lifeTime.optedInAt).not.toBeNull();
    expect(a.lifeTime.reflectionToPlanLinks).toEqual([{ reflectionId: rid, planId: plan.id }]);
    expect(a.evidence).toHaveLength(0);
    expect(a.dayPlans.find((p) => p.id === plan.id)?.status).toBe('planned');
  });
  it('LIFE CLOCKの記録だけ削除でき、他の記録は残る', async () => {
    await repo.updateLifeTime({ enabled: true, birthDate: '1990-01-01', planningHorizonAge: 90, displayMode: 'weeks' });
    const rid = await repo.addLifeReflection('LT02', '友人', 'values');
    const plan = await repo.upsertPlan({ date: '2026-11-07', importantAction: '友人に連絡', priorityReason: '友人' });
    await repo.linkReflectionToPlan(rid, plan.id);
    await repo.deleteLifeTimeData();
    const a = await repo.loadAll();
    expect(a.lifeTime).toMatchObject({ enabled: false, birthDate: null, planningHorizonAge: null, reflections: [], reflectionToPlanLinks: [] });
    expect(a.dayPlans.find((p) => p.id === plan.id)?.importantAction).toBe('友人に連絡');
    expect(a.dayPlans.find((p) => p.id === plan.id)?.priorityReason).toBeNull();
    expect(a.goals).toHaveLength(1);
  });
});

describe('バックアップと復元', () => {
  beforeEach(async () => { await freshDb(); await doWorkshop(); });
  it('バックアップは schemaVersion 2.1 付きで公式JSON Schemaに適合', async () => {
    const data = await buildExport();
    expect(data.schemaVersion).toBe('2.1');
    expect(validateOfficial(JSON.parse(JSON.stringify(data)))).toBe(true);
  });
  it('バックアップ→全削除→復元で同じ内容に戻る（集計も同一）', async () => {
    const plan = (await repo.loadAll()).dayPlans[0];
    await repo.startAction(plan.id);
    const exported = JSON.stringify(await buildExport());
    await repo.deleteAllData();
    expect((await repo.loadAll()).dayPlans).toHaveLength(0);
    const v = validateBackupText(exported);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    await restoreFromValidated(v.data);
    const a = await repo.loadAll();
    expect(a.dayPlans).toEqual(JSON.parse(exported).dayPlans);
    expect(a.events).toHaveLength(JSON.parse(exported).events.length);
  });
  it('復元中に失敗したら既存データは変更されない', async () => {
    const before = await repo.loadAll();
    const bad = structuredClone(fixture) as Record<string, unknown>;
    bad.events = [{ id: 'dup', kind: 'PLAN_CREATED', occurredAt: '2026-11-07T00:00:00Z', localDate: '2026-11-07', payload: {} }, { id: 'dup', kind: 'PLAN_CREATED', occurredAt: '2026-11-07T00:00:00Z', localDate: '2026-11-07', payload: {} }];
    const v = validateBackupText(JSON.stringify(bad));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    await expect(restoreFromValidated(v.data)).rejects.toBeTruthy();
    const after = await repo.loadAll();
    expect(after.dayPlans).toEqual(before.dayPlans);
    expect(after.workshop).toEqual(before.workshop);
  });
  it('v2.0 バックアップを復元すると LIFE CLOCK は無効状態', async () => {
    const { lifeTime: _x, ...rest } = structuredClone(fixture) as Record<string, unknown>;
    void _x;
    const v = validateBackupText(JSON.stringify({ ...rest, schemaVersion: '2.0' }));
    if (!v.ok) throw new Error(v.error);
    await restoreFromValidated(v.data);
    const a = await repo.loadAll();
    expect(a.lifeTime.enabled).toBe(false);
    expect(a.workshop.answers.Q15).toBe('仮の目標を一行書く');
    expect(a.lifeCompass.desiredWayOfLiving).toBe('人の可能性を引き出す');
  });
});

describe('テスト用データと本人データの分離', () => {
  it('デモデータは本人用DBに投入できない', async () => {
    await freshDb('metaevo-shift');
    await expect(seedDemo()).rejects.toThrow();
  });
  it('デモDBにのみ投入される', async () => {
    const d = new AppDB(DEMO_DB);
    useDb(d);
    setNow('2026-11-07T02:00:00Z');
    await seedDemo();
    const a = await repo.loadAll();
    expect(a.appMeta.isDemo).toBe(true);
    expect(a.dayPlans.length).toBeGreaterThan(0);
  });
});
