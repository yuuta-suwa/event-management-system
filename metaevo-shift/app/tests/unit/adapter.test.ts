import { describe, expect, it } from 'vitest';
import fixture from '../../../spec/SAMPLE_FIXTURE.json';
import { buildInsightExport } from '../../src/adapters/insightExport';
import type { ExportV21 } from '../../src/domain/schema';

describe('将来連携の境界（未接続）', () => {
  it('LIFE CLOCK・感情・非公開願望・ワーク回答を含めない', () => {
    const data = { ...(fixture as unknown as ExportV21), lifeTime: { ...(fixture as unknown as ExportV21).lifeTime, birthDate: '1990-01-01', planningHorizonAge: 90, reflections: [{ id: 'r', questionId: 'LT01' as const, recordedAt: '2026-11-07T00:00:00Z', answer: '秘密の後悔' }] } };
    const out = buildInsightExport(data, { period: { start: '2026-11-08', end: '2026-11-21' }, includeGoals: true, includeBehavior: { plannedDays: 10, knownDays: 8, startedDays: 6 }, includeOutcomeEvidenceIds: [], consent: { confirmedAt: '2026-11-21T00:00:00Z', targetName: 'future', scope: ['goals'] } }, new Date('2026-11-21T00:00:00Z'));
    const s = JSON.stringify(out);
    expect(out.excludedPrivateFields).toBe(true);
    for (const w of ['1990-01-01', '秘密の後悔', 'planningHorizonAge', 'lifeTime', 'answers', 'valueDrafts', 'sharingResistance']) expect(s).not.toContain(w);
  });
});
