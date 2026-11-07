/** Day7/14/30/60/90 の判定（Day0 = 初回ワーク日、Day1 = 翌日。日付は利用者のタイムゾーンの暦日） */
import type { Experiment, Review, ReviewKind, Workshop } from './schema';
import { daysBetween, localDateOf } from './dates';

export function day0Of(workshop: Workshop, timeZone: string): string | null {
  return workshop.completedAt ? localDateOf(workshop.completedAt, timeZone) : null;
}

/** 実験サイクル内の日数（startDate = Day1） */
export function cycleDay(exp: Experiment, today: string): number {
  return daysBetween(exp.startDate, today) + 1;
}

export interface DueReview {
  kind: ReviewKind;
  title: string;
  periodStart: string;
  periodEnd: string;
}

export const REVIEW_TITLES: Record<string, string> = {
  day7: 'Day7 軽い確認（約3分）',
  day14: 'Day14 振り返り（20〜30分）',
  day30: 'Day30 継続の確認',
  day60: 'Day60 自分で判断できているか',
  day90: 'Day90 成果と価値の確認',
};

export function dueReviews(opts: { day0: string | null; today: string; experiment: Experiment | null; reviews: Review[] }): DueReview[] {
  const { day0, today, experiment, reviews } = opts;
  const out: DueReview[] = [];
  if (experiment) {
    const cd = cycleDay(experiment, today);
    const has = (k: ReviewKind) => reviews.some((r) => r.reviewKind === k && r.periodStart === experiment.startDate);
    if (cd >= 7 && !has('day7')) out.push({ kind: 'day7', title: REVIEW_TITLES.day7, periodStart: experiment.startDate, periodEnd: experiment.endDate });
    if (cd >= 14 && !has('day14')) out.push({ kind: 'day14', title: REVIEW_TITLES.day14, periodStart: experiment.startDate, periodEnd: experiment.endDate });
  }
  if (day0) {
    const n = daysBetween(day0, today);
    for (const k of [30, 60, 90] as const) {
      const kind = `day${k}` as ReviewKind;
      if (n >= k && !reviews.some((r) => r.reviewKind === kind)) {
        out.push({ kind, title: REVIEW_TITLES[kind], periodStart: day0, periodEnd: today });
      }
    }
  }
  return out;
}
