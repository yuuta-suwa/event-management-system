/**
 * 人生の時間｜LIFE CLOCK 計算（docs/10_LIFE_CLOCK_FEATURE.md）
 * - 寿命・余命・死亡日を予測しない。仮の計画上の節目（本人が選ぶ 1〜120歳）までの週を示すだけ。
 * - 生年月日はローカル日付をUTCの暦日に正規化した日数差で計算。
 * - 2月29日生まれの非閏年は2月28日（2月末）を規約とする。
 * - 節目到達後は負の値を出さず「節目に到達」状態にする。
 */
import { addYears, daysBetween, isValidYmd, parseYmd } from './dates';

export const HORIZON_MIN = 1;
export const HORIZON_MAX = 120;
export const HORIZON_PRESETS = [80, 90, 100] as const;
export const WEEKS_PER_YEAR = 52;

export const NOT_A_PREDICTION = 'これは寿命の予測ではありません。あなたが選んだ仮の節目です。';
export const REACHED_MESSAGE = '設定した仮の節目に到達しました。新たな節目を選ぶか、時間の振り返りに切り替えられます。';

export type LifeClockResult =
  | { kind: 'not_configured'; reason: 'no_horizon' | 'no_birth' }
  | { kind: 'invalid'; message: string }
  | {
      kind: 'exact';
      ageYears: number;
      weeksLived: number;
      weeksToMilestone: number;
      totalWeeks: number;
      milestoneDate: string;
      reached: false;
    }
  | { kind: 'exact_reached'; ageYears: number; weeksLived: number; milestoneDate: string; reached: true }
  | {
      kind: 'approx';
      ageMin: number;
      ageMax: number;
      approxWeeksLived: number;
      approxWeeksToMilestone: number | null;
      reached: boolean;
    };

export function validateHorizon(age: unknown): string | null {
  if (typeof age !== 'number' || !Number.isInteger(age)) return '仮の節目は整数の年齢で入力してください。';
  if (age < HORIZON_MIN || age > HORIZON_MAX) return `仮の節目は${HORIZON_MIN}〜${HORIZON_MAX}歳の範囲で選んでください。`;
  return null;
}

/** 満年齢（birthDate → today） */
export function ageOn(birthDate: string, today: string): number {
  const b = parseYmd(birthDate);
  const t = parseYmd(today);
  let age = t.y - b.y;
  // 今年の誕生日（2/29 → 非閏年は 2/28）
  const bdayThisYear = addYears(birthDate, age);
  if (today < bdayThisYear) age -= 1;
  return Math.max(0, age);
}

export function computeLifeClock(input: {
  birthDate?: string | null;
  birthYear?: number | null;
  planningHorizonAge?: number | null;
  today: string;
}): LifeClockResult {
  const { birthDate, birthYear, planningHorizonAge, today } = input;
  if (planningHorizonAge === null || planningHorizonAge === undefined) return { kind: 'not_configured', reason: 'no_horizon' };
  const hErr = validateHorizon(planningHorizonAge);
  if (hErr) return { kind: 'invalid', message: hErr };

  if (birthDate) {
    if (!isValidYmd(birthDate)) return { kind: 'invalid', message: '生年月日の形式が正しくありません。' };
    if (birthDate > today) return { kind: 'invalid', message: '生年月日が今日より後になっています。' };
    const weeksLived = Math.floor(daysBetween(birthDate, today) / 7);
    const milestoneDate = addYears(birthDate, planningHorizonAge);
    const ageYears = ageOn(birthDate, today);
    if (today >= milestoneDate) {
      return { kind: 'exact_reached', ageYears, weeksLived, milestoneDate, reached: true };
    }
    const totalWeeks = Math.floor(daysBetween(birthDate, milestoneDate) / 7);
    const weeksToMilestone = Math.max(0, totalWeeks - weeksLived);
    return { kind: 'exact', ageYears, weeksLived, weeksToMilestone, totalWeeks, milestoneDate, reached: false };
  }

  if (typeof birthYear === 'number') {
    const ty = parseYmd(today).y;
    if (birthYear > ty) return { kind: 'invalid', message: '生年が今年より後になっています。' };
    const ageMax = ty - birthYear;
    const ageMin = Math.max(0, ageMax - 1);
    // 概算：年の中央（7月1日）生まれと仮定
    const approxWeeksLived = Math.max(0, Math.floor(daysBetween(`${birthYear}-07-01`, today) / 7));
    const reached = ageMin >= planningHorizonAge;
    const approxTotal = planningHorizonAge * WEEKS_PER_YEAR;
    return {
      kind: 'approx',
      ageMin,
      ageMax,
      approxWeeksLived,
      approxWeeksToMilestone: reached ? null : Math.max(0, approxTotal - approxWeeksLived),
      reached,
    };
  }

  return { kind: 'not_configured', reason: 'no_birth' };
}

/** 今年の経過週（年表示モード）。死亡・寿命の情報は含まない。 */
export function yearProgress(today: string): { weekOfYear: number; weeksInYear: number; daysLeftInYear: number } {
  const { y } = parseYmd(today);
  const start = `${y}-01-01`;
  const end = `${y}-12-31`;
  const day = daysBetween(start, today);
  return { weekOfYear: Math.floor(day / 7) + 1, weeksInYear: Math.ceil((daysBetween(start, end) + 1) / 7), daysLeftInYear: daysBetween(today, end) };
}

/** 読み上げ用要約 */
export function lifeClockSummary(r: LifeClockResult, horizon: number | null | undefined): string {
  switch (r.kind) {
    case 'not_configured':
      return r.reason === 'no_horizon' ? '仮の節目が未選択のため、週の数値は表示していません。' : '生年月日または生年が未入力のため、週の数値は表示していません。問いの振り返りは使えます。';
    case 'invalid':
      return r.message;
    case 'exact':
      return `${horizon}歳を仮の節目に設定した人生カレンダーです。これまでの時間はおよそ${r.weeksLived.toLocaleString()}週、仮の節目まではおよそ${r.weeksToMilestone.toLocaleString()}週です。${NOT_A_PREDICTION}`;
    case 'exact_reached':
      return REACHED_MESSAGE;
    case 'approx':
      return r.reached
        ? REACHED_MESSAGE
        : `生年からの概算です（${r.ageMin}〜${r.ageMax}歳）。これまで約${r.approxWeeksLived.toLocaleString()}週、${horizon}歳の仮の節目まで約${(r.approxWeeksToMilestone ?? 0).toLocaleString()}週です。${NOT_A_PREDICTION}`;
  }
}
