/**
 * 初回60分ワーク（workshop/02_FACILITATOR_60MIN.md, 03_QUESTIONS_AND_BRANCHES.md, spec/QUESTION_BANK.json）
 * 時間配分 8+10+10+11+10+7+4 = 60 は変更しない。
 */
import bank from '../spec/QUESTION_BANK.json';
import type { AppEvent, DayPlan, Experiment, Goal, LifeCompass, OutcomeMeasure, Profile, Route, Workshop } from './schema';
import { addDays, localDateOf } from './dates';
import { newId } from './id';

export interface BankQuestion {
  id: string;
  section: string;
  timeWindow: string;
  label: string;
  inputType: string;
  options: string[];
  requiredToFinalize: boolean;
  maySkip: boolean;
  optionLabels: Record<string, string>;
  maxSelections?: number;
}

export const QUESTIONS: BankQuestion[] = bank.questions as unknown as BankQuestion[];
export const BRANCHES = bank.branches as unknown as { route: Route; labels: string[]; prompts: string[]; output: string }[];
export const LT00 = bank.optionalLifeTimePrompt;

export interface Section {
  id: 'intro' | 'values' | 'desire' | 'goal' | 'incident' | 'plan' | 'start';
  window: string;
  minutes: number;
  title: string;
}

export const SECTIONS: Section[] = [
  { id: 'intro', window: '00:00〜08:00', minutes: 8, title: '価値と使い方' },
  { id: 'values', window: '08:00〜18:00', minutes: 10, title: '自分の軸・生き方を探索' },
  { id: 'desire', window: '18:00〜28:00', minutes: 10, title: '本音と抵抗を区別' },
  { id: 'goal', window: '28:00〜39:00', minutes: 11, title: '目的・目標と優先順位' },
  { id: 'incident', window: '39:00〜49:00', minutes: 10, title: '行動を妨げる条件' },
  { id: 'plan', window: '49:00〜56:00', minutes: 7, title: '14日間の行動設計' },
  { id: 'start', window: '56:00〜60:00', minutes: 4, title: 'アプリ利用と初回2分' },
];

/** 講師台本の各質問の目安時間（分） */
export const QUESTION_MINUTES: Record<string, number> = {
  Q01: 2, Q02: 5, Q03: 3, Q04: 3, Q05: 4, Q06: 3, Q07: 3, Q08: 4, Q09: 4,
  Q10: 2, Q11: 2, Q12: 2, Q13: 2, Q14: 2, Q15: 2, Q16: 2, Q17: 3, Q18: 4,
};

export const INTRO_SLIDES: { title: string; body: string }[] = [
  { title: '目標を公開する場ではありません', body: 'MetaEVO Shiftは、目標を無理に公開・宣言する場ではありません。回答はこの端末の中だけに保存されます。' },
  { title: '自分で選ぶ。仮のままでいい', body: '価値観・理念・目標は、あなた自身が選びます。決まっていなくても、仮のまま始めて大丈夫です。' },
  { title: '行動しにくい理由は性格ではないかもしれない', body: '行動しにくいのは、能力・環境・動機など、いろいろな条件が関係している可能性があります。' },
  { title: '毎日は、選ぶ・始める・記録する', body: '毎日「今日大切なこと」を1つ選び、始めて、学びと成果を記録します。朝30〜60秒、夜1〜2分が目安です。' },
  { title: '14日間は自分に合う方法を見つける実験', body: '14日間の記録は診断ではありません。自分に合うやり方を発見するための実験です。' },
  { title: '休息も大切な行動です', body: 'このアプリは、休まず働き続けることを求めません。回復する日も、本人が選んだ意味のある一日です。' },
  { title: '成果は3つに分けて確かめる', body: '「実行した」「身についた」「実際に変わった」を分けて確認します。さらに、自分の大切なことに沿っていたかも本人が振り返れます。' },
  { title: '始める前に', body: 'どの質問もスキップ・後から修正できます。回答は途中で自動保存されます。人生の時間（LIFE CLOCK）は、希望する人が後から「人生の軸」で有効にできます。' },
];

export type StepId = 'intro' | 'BR1' | 'BR2' | 'summary' | string;

export function buildSteps(): StepId[] {
  const ids: StepId[] = ['intro'];
  for (const q of QUESTIONS) {
    ids.push(q.id);
    if (q.id === 'Q07') ids.push('BR1', 'BR2');
  }
  ids.push('summary');
  return ids;
}

export const STEPS = buildSteps();

export function sectionOfStep(step: StepId): Section {
  if (step === 'intro') return SECTIONS[0];
  if (step === 'BR1' || step === 'BR2') return SECTIONS[3];
  if (step === 'summary') return SECTIONS[6];
  const q = QUESTIONS.find((x) => x.id === step);
  return SECTIONS.find((s) => s.id === q?.section) ?? SECTIONS[0];
}

export function branchFor(route: Route | null | undefined) {
  return BRANCHES.find((b) => b.route === route) ?? null;
}

/** ルート表示（A–D） */
export const ROUTE_LETTER: Record<Route, string> = { explore: 'A', protect: 'B', plan: 'C', execute: 'D' };
export const ROUTE_LABEL: Record<Route, string> = {
  explore: '望みを探索中',
  protect: '望みはあるが具体化や公開が負担',
  plan: '目標はあるが方法・計画が不明',
  execute: '行動の開始・継続が難しい',
};

export const DEFAULT_KIND: Record<Route, 'exploration' | 'learning' | 'execution'> = {
  explore: 'exploration',
  protect: 'exploration',
  plan: 'learning',
  execute: 'execution',
};

// ---- 回答の型（workshop.answers[ID] に保存） ----
export interface Answer {
  skipped?: boolean;
  choice?: string;
  choices?: string[];
  text?: string;
  // Q08
  kind?: 'exploration' | 'learning' | 'execution';
  // Q09
  unit?: string;
  baseline?: number | null;
  target?: number | null;
  // Q10
  mode?: 'text' | 'none' | 'not_remember';
  // Q15
  action?: string;
  doneWhen?: string;
  when?: 'today' | 'tomorrow';
  // Q17
  minimal?: string;
  displaced?: string;
  evidence?: string;
  // LT00
  useGentle?: boolean;
  importedToQ02?: boolean;
}

export type Answers = Record<string, Answer | undefined>;

export function getRoute(answers: Answers): Route | null {
  const c = answers.Q07?.choice;
  return c === 'explore' || c === 'protect' || c === 'plan' || c === 'execute' ? c : null;
}

export interface MissingItem {
  id: string;
  label: string;
}

/** 完全終了に必要な項目：Q07 route、Q08 theme、Q15 firstAction、Q16 startCue */
export function missingForFinalize(answers: Answers): MissingItem[] {
  const out: MissingItem[] = [];
  if (!getRoute(answers)) out.push({ id: 'Q07', label: 'Q07 現在の状態' });
  if (!answers.Q08?.text?.trim()) out.push({ id: 'Q08', label: 'Q08 14日間のテーマ' });
  if (!answers.Q15?.action?.trim()) out.push({ id: 'Q15', label: 'Q15 最も大切な一歩' });
  if (!answers.Q16?.text?.trim()) out.push({ id: 'Q16', label: 'Q16 始める条件（If–Then）' });
  return out;
}

/** Q10で『該当なし』『思い出せない』ならQ11–Q13は記述不要（強制しない） */
export function incidentFollowupsApplicable(answers: Answers): boolean {
  const m = answers.Q10?.mode;
  return !(m === 'none' || m === 'not_remember');
}

/** 分岐回答から後続質問の初期値を作る（二重入力を避ける。既存回答は上書きしない） */
export function prefillFromBranch(answers: Answers, step: string): Answer | null {
  const route = getRoute(answers);
  const br2 = answers.BR2?.text?.trim();
  if (!br2) return null;
  if (step === 'Q08' && !answers.Q08?.text && (route === 'explore' || route === 'plan')) return { text: br2 };
  if (step === 'Q15' && !answers.Q15?.action && route === 'protect') return { action: br2 };
  if (step === 'Q16' && !answers.Q16?.text && route === 'execute') return { text: br2 };
  return null;
}

export interface FinalizeResult {
  profile: Profile;
  workshop: Workshop;
  lifeCompass: LifeCompass;
  goal: Goal;
  experiment: Experiment;
  dayPlans: DayPlan[];
  events: AppEvent[];
}

function arr(a: Answer | undefined): string[] {
  if (!a || a.skipped) return [];
  return [...(a.choices ?? []), ...(a.choice ? [a.choice] : [])];
}

export function finalizeWorkshop(workshop: Workshop, compass: LifeCompass, now: Date, timeZone: string): FinalizeResult {
  const answers = workshop.answers as Answers;
  const missing = missingForFinalize(answers);
  if (missing.length) throw new Error(`未入力：${missing.map((m) => m.label).join('、')}`);
  const route = getRoute(answers)!;
  const nowIso = now.toISOString();
  const today = localDateOf(now, timeZone);

  const q02 = answers.Q02;
  const valueChoices = arr(q02).filter((v) => v !== 'まだ分からない' && v !== 'その他');
  const exploringValues = !q02 || q02.skipped || arr(q02).includes('まだ分からない') || (valueChoices.length === 0 && !q02.text?.trim());

  const profile: Profile = {
    currentChallenge: answers.Q01 && !answers.Q01.skipped ? [answers.Q01.choice, answers.Q01.text].filter(Boolean).join('：') || null : null,
    valueDrafts: [...valueChoices, ...(q02?.text?.trim() ? [q02.text.trim()] : [])],
    motivations: arr(answers.Q04),
    sharingResistance: answers.Q06 && !answers.Q06.skipped ? answers.Q06.choice ?? null : null,
    selectedRoute: route,
  };

  const lifeCompass: LifeCompass = {
    ...compass,
    status: compass.status !== 'exploring' ? compass.status : exploringValues ? 'exploring' : 'provisional',
    visibility: 'private',
    values: valueChoices.length ? valueChoices : compass.values ?? [],
    desiredWayOfLiving: q02?.text?.trim() || compass.desiredWayOfLiving || null,
    updatedAt: nowIso,
    revisions: compass.revisions ?? [],
  };

  const q09 = answers.Q09;
  const measure: OutcomeMeasure = {
    id: newId('m'),
    kinds: q09?.skipped ? [] : q09?.choices ?? [],
    description: q09?.skipped ? null : q09?.text?.trim() || null,
    unit: q09?.unit?.trim() || null,
    baseline: typeof q09?.baseline === 'number' ? q09.baseline : null,
    baselineDate: typeof q09?.baseline === 'number' ? today : null,
    target: typeof q09?.target === 'number' ? q09.target : null,
  };

  const goal: Goal = {
    id: newId('g'),
    status: route === 'explore' ? 'exploring' : 'provisional',
    title: answers.Q08!.text!.trim(),
    purpose: profile.currentChallenge ?? null,
    targetDate: null,
    sharing: 'private',
    createdAt: nowIso,
    revisedAt: null,
    outcomeMeasureId: measure.id,
    outcomeMeasure: measure,
    priorityReason: null,
    expectedOutcome: measure.description,
  };

  const q14 = answers.Q14;
  const hypothesisIds = q14 && !q14.skipped ? (q14.choices ?? []).slice(0, 2) : [];
  const q15 = answers.Q15!;
  const q17 = answers.Q17;
  const day1 = addDays(today, 1);

  const experiment: Experiment = {
    id: newId('ex'),
    route,
    theme: goal.title,
    experimentKind: answers.Q08?.kind ?? DEFAULT_KIND[route],
    firstAction: q15.action!.trim(),
    doneWhen: q15.doneWhen?.trim() || null,
    startCue: answers.Q16!.text!.trim(),
    fallbackPlan: q17 && !q17.skipped ? q17.minimal?.trim() || null : null,
    startDate: day1,
    endDate: addDays(today, 14),
    status: 'active',
    hypothesisIds,
    evidenceMeasureIds: [measure.id],
    evidencePlan: {
      kinds: measure.kinds,
      text: [measure.description, q17?.evidence?.trim()].filter(Boolean).join(' ／ ') || null,
      unit: measure.unit,
      baseline: measure.baseline,
      target: measure.target,
    },
    goalId: goal.id,
  };

  const planDate = q15.when === 'tomorrow' ? day1 : today;
  const plan: DayPlan = {
    id: newId('p'),
    localDate: planDate,
    dayMode: 'advance',
    status: 'planned',
    experimentId: experiment.id,
    importantAction: experiment.firstAction,
    doneWhen: experiment.doneWhen,
    startCue: experiment.startCue,
    plannedMinutes: null,
    plannedAt: nowIso,
    note: null,
    priorityReason: null,
    displacedActivity: q17?.displaced?.trim() || null,
    isExploration: experiment.experimentKind === 'exploration',
  };
  const dayPlans: DayPlan[] = [plan];
  const events: AppEvent[] = [
    { id: newId('ev'), kind: 'PLAN_CREATED', occurredAt: nowIso, localDate: today, planId: plan.id, payload: { source: 'workshop' } },
  ];

  const q18 = answers.Q18?.choice;
  if (q18 === '着手した') {
    let todayPlan = plan;
    if (planDate !== today) {
      todayPlan = { ...plan, id: newId('p'), localDate: today, plannedAt: nowIso, note: '初回ワークで最初の2分を試した' };
      dayPlans.push(todayPlan);
      events.push({ id: newId('ev'), kind: 'PLAN_CREATED', occurredAt: nowIso, localDate: today, planId: todayPlan.id, payload: { source: 'workshop_first_two_minutes' } });
    }
    todayPlan.status = 'in_progress';
    events.push({ id: newId('ev'), kind: 'ACTION_STARTED', occurredAt: nowIso, localDate: today, planId: todayPlan.id, payload: { source: 'workshop_first_two_minutes' } });
  }

  const doneWorkshop: Workshop = {
    ...workshop,
    status: 'completed',
    completedAt: nowIso,
    selectedRoute: route,
    initialExperimentId: experiment.id,
    currentStepId: 'summary',
  };

  return { profile, workshop: doneWorkshop, lifeCompass, goal, experiment, dayPlans, events };
}

export function answeredCount(answers: Answers): number {
  return QUESTIONS.filter((q) => {
    const a = answers[q.id];
    return a && !a.skipped && (a.choice || a.choices?.length || a.text?.trim() || a.action?.trim() || a.mode);
  }).length;
}
