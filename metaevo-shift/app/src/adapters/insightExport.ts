/**
 * 将来の AIメンター's会議室 連携のための境界（docs/07_ARCHITECTURE_AND_FUTURE_BRIDGE.md）
 * 現バージョンでは UI・通信・認証を一切実装しない。型と、除外ルールを守る純関数のみ。
 * - 本人が個別に選択したデータだけを共有
 * - 感情・非公開願望・第三者情報・LIFE CLOCK（出生情報・後悔の記述・死生観・仮の到達年齢）は既定で除外
 */
import type { ExportV21 } from '../domain/schema';

export interface InsightExportV1 {
  version: 1;
  generatedAt: string;
  period: { start: string; end: string };
  selectedGoalSummary?: { title: string; status: string }[];
  selectedBehaviorSummary?: { plannedDays: number; knownDays: number; startedDays: number };
  selectedOutcomeEvidence?: { description: string; quantity: number | null; unit: string | null; observedAt: string }[];
  excludedPrivateFields: true;
  consent: { confirmedAt: string; targetName: string; scope: string[] };
}

export interface InsightSelection {
  period: { start: string; end: string };
  includeGoals: boolean;
  includeBehavior: { plannedDays: number; knownDays: number; startedDays: number } | null;
  includeOutcomeEvidenceIds: string[];
  consent: { confirmedAt: string; targetName: string; scope: string[] };
}

/** 本人の選択と同意に基づく要約だけを作る（送信はしない）。 */
export function buildInsightExport(data: ExportV21, sel: InsightSelection, now: Date): InsightExportV1 {
  const out: InsightExportV1 = {
    version: 1,
    generatedAt: now.toISOString(),
    period: sel.period,
    excludedPrivateFields: true,
    consent: sel.consent,
  };
  if (sel.includeGoals) out.selectedGoalSummary = data.goals.map((g) => ({ title: g.title, status: g.status }));
  if (sel.includeBehavior) out.selectedBehaviorSummary = { ...sel.includeBehavior };
  if (sel.includeOutcomeEvidenceIds.length) {
    out.selectedOutcomeEvidence = data.evidence
      .filter((e) => e.layer === 'outcome' && sel.includeOutcomeEvidenceIds.includes(e.id))
      .map((e) => ({ description: e.description, quantity: e.quantity ?? null, unit: e.unit ?? null, observedAt: e.observedAt }));
  }
  return out;
}
