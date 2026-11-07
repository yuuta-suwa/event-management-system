/**
 * 行動支援ルールエンジン（docs/05_INTERVENTION_ENGINE.md）
 * ローカルで動く決定的な純関数。LLMや外部APIは使わない。
 * 本人はどの提案も拒否・変更できる。感情入力がないときはそれを推測しない。
 */
import type { AppEvent, DayPlan, Route } from './schema';

export type RuleId =
  | 'R_SAFE' | 'R_REST' | 'R_EXTERNAL' | 'R_INTERNAL' | 'R_NO_DIRECTION' | 'R_DISCLOSURE'
  | 'R_NO_METHOD' | 'R_NO_PLAN' | 'R_FEEDBACK' | 'R_NORMAL';

export const RULE_PRIORITY: RuleId[] = [
  'R_SAFE', 'R_REST', 'R_EXTERNAL', 'R_INTERNAL', 'R_NO_DIRECTION', 'R_DISCLOSURE', 'R_NO_METHOD', 'R_NO_PLAN', 'R_FEEDBACK', 'R_NORMAL',
];

export type UserContext = 'safety' | 'rest' | 'external' | 'internal' | 'unsure_method' | 'unsure_efficacy' | null;

export interface RuleInput {
  currentRoute: Route | null;
  compassStatus: 'exploring' | 'provisional' | 'committed' | 'paused';
  hasActiveGoal: boolean;
  sharingResistance: string | null;
  hypothesisIds: string[];
  todayPlan: DayPlan | null;
  /** 本人が今押したボタン（選択コンテキスト）。過去記録だけを根拠に割り込まない。 */
  context: UserContext;
  selfReportedState: { safetyConcern?: boolean; fatigue?: 'high' | 'normal' | null };
  /** 直近期間の事実（集計済み） */
  recentStartedDays: number;
  hasOutcomeMeasure: boolean;
  recentOutcomeEvidence: number;
  recentEvents: AppEvent[];
}

export interface RuleChoice {
  id: string;
  label: string;
}

export interface RuleResult {
  ruleId: RuleId;
  reason: string;
  message: string;
  observedFacts: string[];
  hypothesis: string | null;
  uncertainty: string;
  choices: RuleChoice[];
  nextEvidenceToObserve: string;
}

/** 判定の閾値：1回『そのような記録がありました』、3回以上『複数回記録されました』（UIの暫定条件） */
export function frequencyPhrase(count: number, what: string): string | null {
  if (count <= 0) return null;
  if (count >= 3) return `この14日間に${what}が複数回記録されました（${count}件）。`;
  if (count === 1) return `${what}の記録がありました。`;
  return `${what}の記録が${count}件ありました。`;
}

function hasResistance(s: string | null): boolean {
  return !!s && /抵抗/.test(s);
}

export function evaluateRules(input: RuleInput): RuleResult {
  const plan = input.todayPlan;
  const hasPlan = !!plan && !!plan.importantAction && plan.status !== 'rest' && plan.status !== 'changed';

  // 1. 安全
  if (input.context === 'safety' || input.selfReportedState.safetyConcern) {
    return {
      ruleId: 'R_SAFE',
      reason: '本人から安全上の問題の申告がありました。',
      message: '行動の改善はいったん止めて、安全を最優先にしてください。入力は後でも、しなくても大丈夫です。',
      observedFacts: ['安全に関わる申告'],
      hypothesis: null,
      uncertainty: 'アプリは状況を判断・診断しません。',
      choices: [{ id: 'show_support', label: '緊急・相談窓口を見る' }],
      nextEvidenceToObserve: 'なし（安全確保を優先）',
    };
  }

  // 2. 回復
  if (input.context === 'rest' || plan?.dayMode === 'recover' || input.selfReportedState.fatigue === 'high') {
    return {
      ruleId: 'R_REST',
      reason: '本人が回復する日・強い疲労を選びました。',
      message: '休むことも、本人の大切な価値を守る選択です。今日は何を回復させたいですか？（回答任意）',
      observedFacts: ['回復する日を選択'],
      hypothesis: null,
      uncertainty: '休息は未達成として扱いません。仕事の着手率の分母にも含めません。',
      choices: [
        { id: 'rest_note', label: '何を守る休息かメモする（任意）' },
        { id: 'reduce_load', label: '明日の負荷を減らす' },
      ],
      nextEvidenceToObserve: '回復できたと感じたか（任意）',
    };
  }

  const interrupts = input.recentEvents.filter((e) => e.kind === 'EXTERNAL_INTERRUPT').length;
  const switches = input.recentEvents.filter((e) => e.kind === 'INTERNAL_SWITCH').length;

  // 3. 外部中断（本人が押した）
  if (input.context === 'external') {
    const f = frequencyPhrase(interrupts, '予定外の対応');
    return {
      ruleId: 'R_EXTERNAL',
      reason: '本人が「予定外の対応が入った」を選びました。',
      message: '人命・安全・重大な損失に関わるなら、すぐ対応してください。それ以外は、今対応が必要か・任せられるか・後に回せるかを確認しましょう。',
      observedFacts: f ? [f] : [],
      hypothesis: null,
      uncertainty: '予定外の対応は逃避ではありません。',
      choices: [
        { id: 'now', label: '今すぐ対応が必要' },
        { id: 'delegate', label: '誰かに任せられる' },
        { id: 'later', label: '後に回せる' },
      ],
      nextEvidenceToObserve: '再開する最初の1操作と、実際に戻れたか',
    };
  }

  // 4. 内的切替（本人が押した）
  if (input.context === 'internal') {
    const f = frequencyPhrase(switches, '別の行動への切替');
    return {
      ruleId: 'R_INTERNAL',
      reason: '本人が「別のことをしたい」を選びました。',
      message: '今、別の行動を選びたいようです。何が必要か確認し、次の一手を決めますか？',
      observedFacts: f ? [f] : [],
      hypothesis: null,
      uncertainty: '理由は本人の選択として記録するだけで、性格や「逃避」と断定しません。',
      choices: [
        { id: 'two_minutes', label: '2分だけ始める' },
        { id: 'smaller', label: '今の行動をさらに小さくする' },
        { id: 'replan', label: '合理的に再計画する' },
        { id: 'rest', label: '休息する' },
      ],
      nextEvidenceToObserve: '2分着手できたか、どの理由のときに切り替えたか',
    };
  }

  if (input.context === 'unsure_method' || input.context === 'unsure_efficacy') {
    return ruleNoMethod();
  }

  if (!hasPlan) {
    // 5. 方向性が探索中
    if (input.compassStatus === 'exploring' && (input.currentRoute === 'explore' || !input.hasActiveGoal)) {
      return {
        ruleId: 'R_NO_DIRECTION',
        reason: '理念や目標はまだ探索中です。',
        message: '答えが決まっていなくても始められます。価値観を探す小さな体験を1つ選び、仮の一行で始めましょう。',
        observedFacts: ['今日の最重要行動が未設定'],
        hypothesis: null,
        uncertainty: '目標が未設定であることは、本人の評価とは関係ありません。',
        choices: [
          { id: 'explore_action', label: '今日の探索行動を決める' },
          { id: 'recover', label: '今日は回復する日にする' },
        ],
        nextEvidenceToObserve: '試した体験と、そのとき感じたこと',
      };
    }
    // 6. 非公開への抵抗
    if (input.currentRoute === 'protect' || hasResistance(input.sharingResistance)) {
      return {
        ruleId: 'R_DISCLOSURE',
        reason: '明確化や公開への負担を本人が申告しています。',
        message: 'この願望は、他人に見せなくて構いません。まず本人だけの仮案として扱えます。',
        observedFacts: ['今日の最重要行動が未設定'],
        hypothesis: input.hypothesisIds.includes('self_worth') ? 'self_worth（本人が選んだ仮説）' : null,
        uncertainty: '開示は求めません。内容はこの端末の中だけに保存されます。',
        choices: [{ id: 'private_action', label: '非公開のまま小さな一歩を決める' }],
        nextEvidenceToObserve: '非公開の小行動なら実行できるか',
      };
    }
    // 7. 方法不明
    if (input.currentRoute === 'plan' || input.hypothesisIds.includes('method_gap') || input.hypothesisIds.includes('low_efficacy')) {
      return ruleNoMethod();
    }
    // 8. 計画未設定
    return {
      ruleId: 'R_NO_PLAN',
      reason: '今日の最重要行動が未設定です。',
      message: '5分で今日の最重要行動を1件だけ選びましょう。',
      observedFacts: ['今日の最重要行動が未設定'],
      hypothesis: null,
      uncertainty: '計画しない日も、本人が選んだなら合理的な選択です。',
      choices: [
        { id: 'set_plan', label: '最重要行動を1件決める' },
        { id: 'recover', label: '今日は回復する日にする' },
      ],
      nextEvidenceToObserve: '決めた行動に着手できたか',
    };
  }

  // 9. フィードバック：行動記録はあるが成果が未設定または未確認
  if (input.recentStartedDays >= 3 && (!input.hasOutcomeMeasure || input.recentOutcomeEvidence === 0)) {
    return {
      ruleId: 'R_FEEDBACK',
      reason: input.hasOutcomeMeasure ? '行動の記録はありますが、成果の記録はまだありません。' : '行動の記録はありますが、成果指標が未設定です。',
      message: '実行した記録はあります。成果はまだ確認できません。方法が有効だったか、確かめる方法を決めましょう。',
      observedFacts: [`直近の期間に着手した日：${input.recentStartedDays}日`],
      hypothesis: null,
      uncertainty: '行動が増えたことだけでは、目標に近づいたとは言えません。',
      choices: [
        { id: 'define_outcome', label: '現実の結果を何で確かめるか決める' },
        { id: 'check_strategy', label: '方法・技能・相手の反応を点検する' },
      ],
      nextEvidenceToObserve: '目標に合った結果指標の変化（期間・母数・計測日つき）',
    };
  }

  // 10. 通常
  return {
    ruleId: 'R_NORMAL',
    reason: '今日の最重要行動と開始条件が整っています。',
    message: plan?.startCue ? `開始条件：${plan.startCue}` : '準備ができたら始めましょう。',
    observedFacts: [],
    hypothesis: null,
    uncertainty: '',
    choices: [{ id: 'start', label: '今から始める' }],
    nextEvidenceToObserve: '具体的に何をしたか',
  };
}

function ruleNoMethod(): RuleResult {
  return {
    ruleId: 'R_NO_METHOD',
    reason: '方法が分からない、または実行できる見込みが低いと本人が申告しています。',
    message: 'できないと決める前に、方法を知るための5分の実験を選びますか？',
    observedFacts: [],
    hypothesis: 'method_gap / low_efficacy（仮説・本人が変更可能）',
    uncertainty: '能力や性格の問題と断定しません。',
    choices: [
      { id: 'split', label: '3ステップに分ける' },
      { id: 'learn', label: '学ぶ・相談する' },
      { id: 'experiment', label: '試せる実験に変える' },
      { id: 'reduce', label: '負荷を減らす' },
    ],
    nextEvidenceToObserve: '最初の一歩を実行できたか',
  };
}

/** 原因候補 → 14日間に試す改善実験 */
export const HYPOTHESIS_EXPERIMENTS: Record<string, { label: string; experiment: string; check: string }> = {
  value_gap: { label: '目標への納得感が低い', experiment: '自分の価値観と一致する目標を仮置きする／目標を変更する', check: '納得感と着手が変わるか' },
  self_worth: { label: '自己評価や公開への不安', experiment: '公開しない仮の願望で試す。失敗しても自己価値は変わらないという見方を検討する', check: '非公開の小行動なら実行できるか' },
  method_gap: { label: 'やり方が分からない', experiment: '必要な技能・情報を3項目に分解し、1つ学ぶ', check: '最初の一歩を実行できるか' },
  low_efficacy: { label: 'できる見込みが持てない', experiment: '難度を下げ、達成できる一例を試して結果を確認する', check: '実行可能性への認識が変わるか' },
  avoidance: { label: '不快な気持ちを避けたい', experiment: '不快感をそのままに2分だけ着手する', check: '別作業へ移る前に始められるか' },
  opportunity: { label: '時間・環境が整わない', experiment: '時間を確保／委任／準備物を前日に用意する', check: '実行可能な機会が増えるか' },
  urgency: { label: '目先の緊急そうな作業が優先される', experiment: '重要行動の予約、突発対応の緊急度評価、復帰計画', check: '重要行動への復帰が増えるか' },
  overload: { label: '負荷や疲労が大きい', experiment: '行動量を増やす前に削減・回復・予定の再設計', check: '余力と継続が改善するか' },
  unknown: { label: 'まだ分からない', experiment: '1回の具体的な場面を観察・記録する', check: '実際に何が起きるか' },
};

/**
 * 心理的回避の推定条件：感情→別作業→安心の全要素が本人により記録された事例のみ数える。
 * 1要素でも未記録なら推定しない。
 */
export function countFullAvoidanceSequences(events: AppEvent[]): number {
  return events.filter(
    (e) =>
      e.kind === 'INTERNAL_SWITCH' &&
      typeof e.payload?.feeling === 'string' && (e.payload.feeling as string).length > 0 &&
      typeof e.payload?.otherActivity === 'string' && (e.payload.otherActivity as string).length > 0 &&
      e.payload?.afterFeeling === '安心',
  ).length;
}
