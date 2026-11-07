import { describe, expect, it } from 'vitest';
import bank from '../../src/spec/QUESTION_BANK.json';
import { BRANCHES, QUESTIONS, SECTIONS, STEPS, finalizeWorkshop, missingForFinalize, prefillFromBranch, incidentFollowupsApplicable, type Answers } from '../../src/domain/workshop';
import { defaultLifeCompass, defaultWorkshop, ROUTES, type Route } from '../../src/domain/schema';

const base = (route: Route, extra: Answers = {}): Answers => ({
  Q07: { choice: route },
  Q08: { text: '14日間のテーマ', kind: undefined },
  Q15: { action: '仮の目標を1行書く', doneWhen: '1行書けたら終了', when: 'tomorrow' },
  Q16: { text: '朝食後に机で5分' },
  ...extra,
});

describe('初回60分の構成', () => {
  it('時間配分は 8+10+10+11+10+7+4 = 60 のまま', () => {
    expect(SECTIONS.map((s) => s.minutes)).toEqual([8, 10, 10, 11, 10, 7, 4]);
    expect(SECTIONS.reduce((a, s) => a + s.minutes, 0)).toBe(60);
    expect(bank.workshopMinutes).toBe(60);
    expect(bank.introMinutes + bank.workMinutes).toBe(60);
  });
  it('Q01–Q18 が仕様どおり存在し、各区間の時間窓が質問バンクと一致する', () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual(Array.from({ length: 18 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`));
    for (const q of QUESTIONS) {
      const s = SECTIONS.find((x) => x.id === q.section)!;
      expect(s.window.replace('〜', '-')).toBe(q.timeWindow);
    }
  });
  it('4ルートA–Dの分岐質問が各2問', () => {
    expect(BRANCHES.map((b) => b.route)).toEqual([...ROUTES]);
    for (const b of BRANCHES) expect(b.prompts).toHaveLength(2);
    expect(STEPS.indexOf('BR1')).toBe(STEPS.indexOf('Q07') + 1);
  });
  it('LT00 は Q02 内の任意補助で、時間を延長しない', () => {
    expect(bank.optionalLifeTimePrompt.withinQuestion).toBe('Q02');
    expect(bank.optionalLifeTimePrompt.maximumAdditionalMinutes).toBe(0);
    expect(STEPS).not.toContain('LT00');
  });
  it('必須はQ07/Q08/Q15/Q16のみ。心理・本音項目はスキップ可能', () => {
    const required = QUESTIONS.filter((q) => q.requiredToFinalize).map((q) => q.id);
    expect(required).toEqual(['Q07', 'Q08', 'Q15', 'Q16']);
    expect(missingForFinalize({}).map((m) => m.id)).toEqual(['Q07', 'Q08', 'Q15', 'Q16']);
    expect(missingForFinalize(base('explore'))).toEqual([]);
  });
  it('Q10『該当なし』ならQ11–Q13の記述を求めない', () => {
    expect(incidentFollowupsApplicable({ Q10: { mode: 'none' } })).toBe(false);
    expect(incidentFollowupsApplicable({ Q10: { mode: 'text', text: 'x' } })).toBe(true);
  });
});

describe('finalizeWorkshop', () => {
  const now = new Date('2026-11-07T02:00:00Z'); // JST 11:00
  const run = (answers: Answers) => finalizeWorkshop({ ...defaultWorkshop(), status: 'in_progress', answers }, defaultLifeCompass(), now, 'Asia/Tokyo');

  it.each(ROUTES)('%s ルートで実験・計画を作り、Day1–14を設定する', (route) => {
    const r = run(base(route));
    expect(r.experiment.route).toBe(route);
    expect(r.experiment.startDate).toBe('2026-11-08');
    expect(r.experiment.endDate).toBe('2026-11-21');
    expect(r.dayPlans[0].localDate).toBe('2026-11-08');
    expect(r.dayPlans[0].importantAction).toBe('仮の目標を1行書く');
    expect(r.dayPlans[0].startCue).toBe('朝食後に机で5分');
    expect(r.goal.sharing).toBe('private');
    expect(r.workshop.status).toBe('completed');
  });
  it('既定の実験種別：A探索/B探索/C学習/D実行', () => {
    expect(run(base('explore')).experiment.experimentKind).toBe('exploration');
    expect(run(base('protect')).experiment.experimentKind).toBe('exploration');
    expect(run(base('plan')).experiment.experimentKind).toBe('learning');
    expect(run(base('execute')).experiment.experimentKind).toBe('execution');
  });
  it('Q14は最大2つまで仮説として保存', () => {
    const r = run(base('execute', { Q14: { choices: ['avoidance', 'urgency', 'overload'] } }));
    expect(r.experiment.hypothesisIds).toEqual(['avoidance', 'urgency']);
  });
  it('Q18『着手した』なら今日の計画を開始状態にし、明日の計画も残す', () => {
    const r = run(base('execute', { Q18: { choice: '着手した' } }));
    expect(r.dayPlans).toHaveLength(2);
    const todayPlan = r.dayPlans.find((p) => p.localDate === '2026-11-07')!;
    expect(todayPlan.status).toBe('in_progress');
    expect(r.events.filter((e) => e.kind === 'ACTION_STARTED')).toHaveLength(1);
  });
  it('価値観が「まだ分からない」なら探索中として保存し、目的未設定でも完了できる', () => {
    const r = run(base('explore', { Q02: { choices: ['まだ分からない'] } }));
    expect(r.lifeCompass.status).toBe('exploring');
    expect(r.lifeCompass.visibility).toBe('private');
  });
  it('計画から行動の証拠を勝手に作らない（finalizeは証拠を返さない）', () => {
    const r = run(base('protect')) as unknown as Record<string, unknown>;
    expect(r.evidence).toBeUndefined();
  });
  it('未入力の必須項目があると完了できない', () => {
    expect(() => run({ Q07: { choice: 'plan' } })).toThrow();
  });
  it('分岐回答からの初期値は既存回答を上書きしない', () => {
    expect(prefillFromBranch({ Q07: { choice: 'explore' }, BR2: { text: '2つの活動を試す' } }, 'Q08')).toEqual({ text: '2つの活動を試す' });
    expect(prefillFromBranch({ Q07: { choice: 'explore' }, BR2: { text: 'x' }, Q08: { text: '既存' } }, 'Q08')).toBeNull();
  });
});
