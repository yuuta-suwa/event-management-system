import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, setNow } from './setup-db';
import Dexie from 'dexie';
import * as repo from '../../src/db/repo';
import * as prepo from '../../src/db/planningRepo';
import { linkPrimaryAction, primaryActionIdFor, getLifeAnchors, resolveAnchor } from '../../src/db/bridge';
import { buildExport, getPreImportSnapshot, restoreFromValidated, validateBackupText } from '../../src/db/backup';
import { AppDB, useDb } from '../../src/db/db';
import { validateOfficial } from './schema-validator';
import { realEstateExample } from '../fixtures/realEstate';
import fixture from '../../../spec/SAMPLE_FIXTURE.json';
import type { Answer } from '../../src/domain/workshop';

async function workshop() {
  const answers: Record<string, Answer> = { Q02: { choices: ['人への貢献'], text: '人の可能性を広げる' }, Q07: { choice: 'execute' }, Q08: { text: '紹介の仕組みを作る' }, Q15: { action: '連携担当へ連絡', when: 'today' }, Q16: { text: '14時' } };
  for (const [k, v] of Object.entries(answers)) await repo.saveWorkshopAnswer(k, v, k);
  await repo.completeWorkshop();
}
async function seedExample() {
  const ep = realEstateExample();
  const d = (await import('../../src/db/db')).db();
  await d.planNodes.bulkAdd(ep.planNodes);
}

describe('v2.4 DBアップグレード（非破壊）', () => {
  it('v2.3（DB version 1）のデータを保持したまま新テーブルを追加', async () => {
    const name = `upgrade-${Date.now()}`;
    const old = new Dexie(name);
    old.version(1).stores({ kv: 'key', goals: 'id, status', experiments: 'id, status, startDate', dayPlans: 'id, localDate', events: 'id, kind, localDate, planId', evidence: 'id, layer, goalId, experimentId', reviews: 'id, reviewKind' });
    await old.open();
    await old.table('kv').put({ key: 'meta', value: { schemaVersion: '2.1', createdAt: '2026-11-07T00:00:00Z' } });
    await old.table('goals').put({ id: 'g-old', status: 'provisional', title: '既存の目標', sharing: 'private', createdAt: '2026-11-07T00:00:00Z' });
    await old.table('dayPlans').put({ id: 'p-old', localDate: '2026-11-08', dayMode: 'advance', status: 'completed', importantAction: '既存の行動' });
    old.close();
    const d = new AppDB(name);
    useDb(d);
    setNow('2026-11-10T02:00:00Z');
    const a = await repo.loadAll();
    expect(d.verno).toBe(2);
    expect(a.goals.map((g) => g.title)).toEqual(['既存の目標']);
    expect(a.dayPlans[0]).toMatchObject({ id: 'p-old', importantAction: '既存の行動', status: 'completed' });
    expect(a.executionPlanning.planNodes).toEqual([]);
  });
});

describe('v2.4 LegacyBridge', () => {
  beforeEach(async () => { await freshDb(undefined, '2026-11-10T02:00:00Z'); await workshop(); });
  it('N01 人生の軸は参照のみ（回答を複製しない）', async () => {
    const n = await prepo.createNode({ kind: 'goal', title: '信頼される営業力を育てる', parentId: null, sourceAnchorId: 'legacy:lifeCompass' });
    const a = await repo.loadAll();
    expect(resolveAnchor(a, n.sourceAnchorId)?.label).toBe('人の可能性を広げる');
    expect(JSON.stringify(a.executionPlanning)).not.toContain('人の可能性を広げる');
    expect(getLifeAnchors(a)[0].id).toBe('legacy:lifeCompass');
    const g = await prepo.createNode({ kind: 'goal', title: 'x', parentId: null, sourceAnchorId: `legacy:goal:${a.goals[0].id}` });
    expect(resolveAnchor(await repo.loadAll(), g.sourceAnchorId)?.label).toBe('紹介の仕組みを作る');
  });
  it('N10 最重要行動：正本は v2.3 の dayPlan。TODOを選ぶと同じ1件になり、実行状態も一致', async () => {
    await seedExample();
    let a = await repo.loadAll();
    const todo = a.executionPlanning.planNodes.find((n) => n.id === 're_todo_conditions')!;
    await linkPrimaryAction('2026-11-10', todo);
    a = await repo.loadAll();
    const plans = a.dayPlans.filter((p) => p.localDate === '2026-11-10');
    expect(plans).toHaveLength(1);
    expect(plans[0].importantAction).toBe(todo.title);
    expect(primaryActionIdFor(a, '2026-11-10')).toBe(todo.id);
    // v2.3の「今から始める」→ TODO側にも記録
    await repo.startAction(plans[0].id);
    a = await repo.loadAll();
    expect(a.executionPlanning.executionEvents.map((e) => [e.actionId, e.kind])).toEqual([[todo.id, 'started']]);
    // TODO側で完了 → v2.3側も完了
    await prepo.recordExecution({ opId: 'x1', actionId: todo.id, blockId: null, planDate: '2026-11-10', kind: 'completed' });
    a = await repo.loadAll();
    expect(a.dayPlans.find((p) => p.localDate === '2026-11-10')!.status).toBe('completed');
    expect(a.evidence.filter((e) => e.layer === 'outcome')).toHaveLength(0);
    // 行動名を変えるとリンクは解除（二重の正本を作らない）
    await repo.upsertPlan({ date: '2026-11-10', importantAction: '別の行動' });
    expect(primaryActionIdFor(await repo.loadAll(), '2026-11-10')).toBeNull();
  });
});

describe('v2.4 ノード・予定・実行の保存', () => {
  beforeEach(async () => { await freshDb(undefined, '2026-11-10T02:00:00Z'); await seedExample(); });
  it('N04 循環する移動は拒否し、元データは変わらない', async () => {
    const before = (await repo.loadAll()).executionPlanning.planNodes;
    const r = await prepo.moveNode('re_goal_month', 're_todo_conditions');
    expect(r.ok).toBe(false);
    expect((await repo.loadAll()).executionPlanning.planNodes).toEqual(before);
  });
  it('N05 アーカイブ→復元で予定・実行記録・成果は消えない', async () => {
    await prepo.placeBlock({ opId: 'b1', actionId: 're_todo_conditions', planDate: '2026-11-10', startMinute: 840, durationMinutes: 15 });
    await prepo.recordExecution({ opId: 'e1', actionId: 're_todo_conditions', blockId: 'b1', planDate: '2026-11-10', kind: 'completed' });
    await prepo.addOutcome({ opId: 'o1', goalNodeId: 're_goal_month', date: '2026-11-10', metric: 'トスアップ', value: 1, unit: '件', qualitative: null, evidence: '受領連絡' });
    await prepo.archiveNode('re_goal_month');
    let ep = (await repo.loadAll()).executionPlanning;
    expect(ep.planNodes.filter((n) => n.archivedAt)).toHaveLength(9);
    expect(ep.scheduleBlocks).toHaveLength(1);
    expect(ep.executionEvents).toHaveLength(1);
    expect(ep.outcomeRecords).toHaveLength(1);
    await prepo.restoreNode('re_goal_month');
    ep = (await repo.loadAll()).executionPlanning;
    expect(ep.planNodes.filter((n) => n.archivedAt)).toHaveLength(0);
  });
  it('N12/N14/N15 予定の配置・範囲外の拒否・重複は本人確認が必要・二重確定は1件', async () => {
    const draft = await prepo.createNode({ kind: 'action', title: 'タイトルだけ', parentId: 're_ms_consent' });
    expect((await prepo.placeBlock({ opId: 'x', actionId: draft.id, planDate: '2026-11-10', startMinute: 420, durationMinutes: 15 })).ok).toBe(false);
    expect((await prepo.placeBlock({ opId: 'b0', actionId: 're_todo_conditions', planDate: '2026-11-10', startMinute: 1500, durationMinutes: 1 })).ok).toBe(false);
    expect((await repo.loadAll()).executionPlanning.scheduleBlocks).toHaveLength(0);
    const r1 = await prepo.placeBlock({ opId: 'b1', actionId: 're_todo_conditions', planDate: '2026-11-10', startMinute: 420, durationMinutes: 15 });
    expect(r1.ok).toBe(true);
    const r2 = await prepo.placeBlock({ opId: 'b2', actionId: 're_todo_candidates', planDate: '2026-11-10', startMinute: 425, durationMinutes: 15 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.overlaps?.map((b) => b.id)).toEqual(['b1']);
    await Promise.all([prepo.placeBlock({ opId: 'b2', actionId: 're_todo_candidates', planDate: '2026-11-10', startMinute: 425, durationMinutes: 15, confirmOverlap: true }), prepo.placeBlock({ opId: 'b2', actionId: 're_todo_candidates', planDate: '2026-11-10', startMinute: 425, durationMinutes: 15, confirmOverlap: true })]);
    const bs = (await repo.loadAll()).executionPlanning.scheduleBlocks;
    expect(bs).toHaveLength(2);
    expect(bs.find((b) => b.id === 'b2')!.overlapConfirmed).toBe(true);
  });
  it('N17 延期：旧予定は moved として残り、新予定が作られ、完了扱いにならない', async () => {
    await prepo.placeBlock({ opId: 'b1', actionId: 're_todo_conditions', planDate: '2026-11-10', startMinute: 840, durationMinutes: 15 });
    await prepo.recordExecution({ opId: 'e1', actionId: 're_todo_conditions', blockId: 'b1', planDate: '2026-11-10', kind: 'interrupted', reason: 'external' });
    await prepo.moveBlock({ opId: 'b2', blockId: 'b1', planDate: '2026-11-11', startMinute: 600, reason: '突発対応' });
    await prepo.moveBlock({ opId: 'b2', blockId: 'b1', planDate: '2026-11-11', startMinute: 600, reason: '突発対応' });
    const ep = (await repo.loadAll()).executionPlanning;
    expect(ep.scheduleBlocks.map((b) => [b.id, b.state, b.planDate])).toEqual(expect.arrayContaining([['b1', 'moved', '2026-11-10'], ['b2', 'placed', '2026-11-11']]));
    expect(ep.scheduleBlocks).toHaveLength(2);
    expect(ep.scheduleBlocks.find((b) => b.id === 'b1')!.moveReason).toBe('突発対応');
    expect(ep.executionEvents).toHaveLength(1);
    expect(ep.executionEvents.some((e) => e.kind === 'completed')).toBe(false);
  });
  it('N21 同じ確定を2回押しても実行記録は1件。成果はTODOに付けられない', async () => {
    await Promise.all([1, 2].map(() => prepo.recordExecution({ opId: 'same', actionId: 're_todo_conditions', blockId: null, planDate: '2026-11-10', kind: 'started' })));
    expect((await repo.loadAll()).executionPlanning.executionEvents).toHaveLength(1);
    await expect(prepo.addOutcome({ opId: 'o', goalNodeId: 're_todo_conditions', date: '2026-11-10', metric: null, value: 1, unit: null, qualitative: null, evidence: null })).rejects.toThrow();
  });
});

describe('v2.4 バックアップ・復元（N26〜N29）', () => {
  beforeEach(async () => { await freshDb(undefined, '2026-11-10T02:00:00Z'); await workshop(); await seedExample(); });
  it('N26 v2.3データ＋追加領域をJSONに出力し、全置換で同じIDに戻る。v2.1公式スキーマにも適合', async () => {
    await prepo.placeBlock({ opId: 'b1', actionId: 're_todo_conditions', planDate: '2026-11-10', startMinute: 840, durationMinutes: 15 });
    const exp = await buildExport();
    expect(exp.featureVersion).toBe('2.4');
    expect(exp.executionPlanning.planNodes).toHaveLength(10);
    expect(validateOfficial(JSON.parse(JSON.stringify(exp)))).toBe(true);
    const text = JSON.stringify(exp);
    await repo.deleteAllData();
    const v = validateBackupText(text);
    if (!v.ok) throw new Error(v.error);
    await restoreFromValidated(v.data, { mode: 'replace', executionPlanning: v.executionPlanning });
    const a = await repo.loadAll();
    expect(a.executionPlanning.planNodes.map((n) => n.id).sort()).toEqual(exp.executionPlanning.planNodes.map((n) => n.id).sort());
    expect(a.executionPlanning.scheduleBlocks[0].id).toBe('b1');
    expect(a.goals.map((g) => g.id)).toEqual(exp.goals.map((g) => g.id));
    expect(await getPreImportSnapshot()).not.toBeNull();
  });
  it('N27 同じJSONを2回マージしても重複しない。内容違いは競合として報告し端末側を残す', async () => {
    const text = JSON.stringify(await buildExport());
    const v = validateBackupText(text);
    if (!v.ok) throw new Error(v.error);
    const r1 = await restoreFromValidated(v.data, { mode: 'merge', executionPlanning: v.executionPlanning });
    const r2 = await restoreFromValidated(v.data, { mode: 'merge', executionPlanning: v.executionPlanning });
    expect(r1.added).toBe(0);
    expect(r2.added).toBe(0);
    expect(r2.conflicts).toEqual([]);
    const a = await repo.loadAll();
    expect(a.executionPlanning.planNodes).toHaveLength(10);
    const changed = JSON.parse(text);
    changed.executionPlanning.planNodes[0].title = '別のタイトル';
    const v2 = validateBackupText(JSON.stringify(changed));
    if (!v2.ok) throw new Error(v2.error);
    const r3 = await restoreFromValidated(v2.data, { mode: 'merge', executionPlanning: v2.executionPlanning });
    expect(r3.conflicts.length).toBe(1);
    expect((await repo.loadAll()).executionPlanning.planNodes.find((n) => n.id === changed.executionPlanning.planNodes[0].id)!.title).not.toBe('別のタイトル');
  });
  it('N28 不正な型・整合性エラーは検証で拒否し、元データは変更しない', async () => {
    const before = await repo.loadAll();
    const exp = JSON.parse(JSON.stringify(await buildExport()));
    exp.executionPlanning.planNodes[1].parentId = exp.executionPlanning.planNodes[1].id; // 自己参照の循環
    expect(validateBackupText(JSON.stringify(exp)).ok).toBe(false);
    exp.executionPlanning = { version: 1, planNodes: 'x' };
    expect(validateBackupText(JSON.stringify(exp)).ok).toBe(false);
    const after = await repo.loadAll();
    expect(after.executionPlanning).toEqual(before.executionPlanning);
  });
  it('N29 v2.3（executionPlanningなし）とv2.0のバックアップは空の領域で初期化され、既存回答は失われない', async () => {
    const v23 = { ...(fixture as Record<string, unknown>) };
    const v = validateBackupText(JSON.stringify(v23));
    if (!v.ok) throw new Error(v.error);
    expect(v.hadExecutionPlanning).toBe(false);
    await restoreFromValidated(v.data, { mode: 'replace', executionPlanning: v.executionPlanning });
    const a = await repo.loadAll();
    expect(a.executionPlanning.planNodes).toEqual([]);
    expect(a.workshop.answers.Q15).toBe('仮の目標を一行書く');
    const { lifeTime: _l, ...rest } = fixture as Record<string, unknown>;
    void _l;
    const v20 = validateBackupText(JSON.stringify({ ...rest, schemaVersion: '2.0' }));
    expect(v20.ok && v20.executionPlanning.planNodes.length === 0).toBe(true);
  });
  it('マージ後に整合性エラーになる場合は中止し、元データを維持', async () => {
    const before = await repo.loadAll();
    const exp = JSON.parse(JSON.stringify(await buildExport()));
    // 単体では整合するが、端末側と合わせると循環する組み合わせ
    exp.executionPlanning.planNodes = [{ ...exp.executionPlanning.planNodes.find((n: { id: string }) => n.id === 're_goal_activity'), id: 'cyc_a', parentId: null }];
    const v = validateBackupText(JSON.stringify(exp));
    if (!v.ok) throw new Error(v.error);
    v.executionPlanning.planNodes[0].parentId = 'cyc_a';
    await expect(restoreFromValidated(v.data, { mode: 'merge', executionPlanning: v.executionPlanning })).rejects.toThrow();
    expect((await repo.loadAll()).executionPlanning).toEqual(before.executionPlanning);
  });
});
