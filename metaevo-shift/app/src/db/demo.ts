/**
 * デモ・テスト用データ（架空）。本人のデータとは別DB（metaevo-shift-demo）にのみ投入する。
 * 講師の投影やテスト用。実在の人物・本物のプライベートデータは含まない。
 */
import { db, DEMO_DB } from './db';
import { clock, ensureInitialized } from './repo';
import { addDays, localDateOf } from '../domain/dates';
import { defaultLifeTime, type AppEvent, type DayPlan, type Evidence } from '../domain/schema';

export async function seedDemo(): Promise<void> {
  const d = db();
  if (d.name !== DEMO_DB) throw new Error('デモデータは本人用DBには投入できません。');
  await ensureInitialized();
  const tz = 'Asia/Tokyo';
  const now = clock.now();
  const today = localDateOf(now, tz);
  const day0 = addDays(today, -9);
  const iso = (date: string, hm = '09:00') => new Date(`${date}T${hm}:00+09:00`).toISOString();
  const exId = 'demo_ex1';
  const goalId = 'demo_g1';
  const plans: DayPlan[] = [];
  const events: AppEvent[] = [];
  const evidence: Evidence[] = [];
  const statuses: DayPlan['status'][] = ['completed', 'in_progress', 'rest', 'not_started', 'completed', 'planned', 'completed', 'changed', 'completed'];
  statuses.forEach((st, i) => {
    const date = addDays(day0, i + 1);
    const id = `demo_p${i + 1}`;
    plans.push({ id, localDate: date, dayMode: st === 'rest' ? 'recover' : 'advance', status: st, experimentId: exId, importantAction: st === 'rest' ? null : '見込み顧客へ提案を1件送る', startCue: '朝10時に机に座ったら、下書きを5分', plannedAt: iso(addDays(date, -1), '21:00'), plannedMinutes: 25, note: st === 'rest' ? '家族との時間を守る' : null, priorityReason: null, displacedActivity: '資料整理' });
    if (st === 'completed' || st === 'in_progress') events.push({ id: `demo_ev_s${i}`, kind: 'ACTION_STARTED', occurredAt: iso(date, '10:05'), localDate: date, planId: id, payload: {} });
    if (st === 'completed') events.push({ id: `demo_ev_c${i}`, kind: 'ACTION_COMPLETED', occurredAt: iso(date, '10:40'), localDate: date, planId: id, payload: { minutes: 30 } });
    if (st === 'rest') events.push({ id: `demo_ev_r${i}`, kind: 'REST_CHOSEN', occurredAt: iso(date, '08:00'), localDate: date, planId: id, payload: {} });
  });
  events.push({ id: 'demo_ev_sw', kind: 'INTERNAL_SWITCH', occurredAt: iso(addDays(day0, 4), '10:10'), localDate: addDays(day0, 4), planId: 'demo_p4', payload: { otherActivity: '資料整理', reason: '不安', decision: 'two_minutes' } });
  events.push({ id: 'demo_ev_ex', kind: 'EXTERNAL_INTERRUPT', occurredAt: iso(addDays(day0, 2), '11:00'), localDate: addDays(day0, 2), planId: 'demo_p2', payload: { critical: false, triage: 'now', resumeFirstStep: '下書きの2行目から書く', resumeAt: '15:00', resumeOutcome: 'resumed' } });
  evidence.push({ id: 'demo_e1', layer: 'action', observedAt: iso(addDays(day0, 1), '10:40'), description: '提案書を1件送った', goalId, experimentId: exId, quantity: null, unit: null, baselineQuantity: null, source: 'self_report', localDate: addDays(day0, 1) } as Evidence);
  evidence.push({ id: 'demo_e2', layer: 'learning', observedAt: iso(addDays(day0, 5), '21:00'), description: '最初の提案を一人で送れるようになった', goalId, experimentId: exId, quantity: null, unit: null, baselineQuantity: null, source: 'self_report', localDate: addDays(day0, 5) } as Evidence);
  evidence.push({ id: 'demo_e3', layer: 'outcome', observedAt: iso(addDays(day0, 7), '21:00'), description: '商談の件数', goalId, experimentId: exId, quantity: 4, unit: '件', baselineQuantity: 2, source: 'self_report', localDate: addDays(day0, 7) } as Evidence);
  await d.transaction('rw', [d.kv, ...d.collections], async () => {
    await Promise.all([d.kv.clear(), ...d.collections.map((t) => t.clear())]);
    await d.kv.bulkPut([
      { key: 'meta', value: { schemaVersion: '2.1', createdAt: iso(day0, '09:00') } },
      { key: 'preferences', value: { timeZone: tz, dataSharing: 'private', lastBackupAt: null, displayTheme: 'dark' } },
      { key: 'profile', value: { currentChallenge: '仕事：提案が後回しになる（デモ）', valueDrafts: ['人への貢献', '成長'], motivations: ['自分の意思'], sharingResistance: '特になし', selectedRoute: 'execute' } },
      { key: 'workshop', value: { status: 'completed', startedAt: iso(day0, '10:00'), completedAt: iso(day0, '11:00'), answers: { Q07: { choice: 'execute' }, Q08: { text: '提案行動を毎日の予定に入れる（デモ）', kind: 'execution' }, Q15: { action: '見込み顧客へ提案を1件送る', when: 'tomorrow' }, Q16: { text: '朝10時に机に座ったら、下書きを5分' } }, selectedRoute: 'execute', initialExperimentId: exId, currentStepId: 'summary' } },
      { key: 'lifeCompass', value: { status: 'provisional', visibility: 'private', values: ['人への貢献', '成長'], desiredWayOfLiving: '人の役に立ち、成長する（デモ）', lifePrinciple: null, longTermPurpose: null, updatedAt: iso(day0, '11:00'), revisions: [] } },
      { key: 'lifeTime', value: defaultLifeTime() },
      { key: 'appMeta', value: { onboardingDone: true, isDemo: true, dismissedReviews: [] } },
    ]);
    await d.goals.add({ id: goalId, status: 'provisional', title: '顧客への価値を増やす（デモ）', purpose: null, targetDate: null, sharing: 'private', createdAt: iso(day0, '10:40'), revisedAt: null, outcomeMeasureId: 'demo_m1', priorityReason: null, expectedOutcome: '商談の件数', outcomeMeasure: { id: 'demo_m1', kinds: ['実際の成果'], description: '商談の件数', unit: '件', baseline: 2, baselineDate: day0, target: 4 } });
    await d.experiments.add({ id: exId, route: 'execute', theme: '提案行動を毎日の予定に入れる（デモ）', experimentKind: 'execution', firstAction: '見込み顧客へ提案を1件送る', startCue: '朝10時に机に座ったら、下書きを5分', fallbackPlan: '2分だけ', startDate: addDays(day0, 1), endDate: addDays(day0, 14), status: 'active', hypothesisIds: ['avoidance', 'urgency'], evidenceMeasureIds: ['demo_m1'], goalId });
    await d.dayPlans.bulkAdd(plans);
    await d.events.bulkAdd(events);
    await d.evidence.bulkAdd(evidence);
  });
}
