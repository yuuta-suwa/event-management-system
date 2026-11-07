import { describe, expect, it } from 'vitest';
import fixture from '../../../spec/SAMPLE_FIXTURE.json';
import { parseBackup, MAX_BACKUP_BYTES } from '../../src/domain/migration';
import { validateOfficial } from './schema-validator';


const v20 = () => {
  const { lifeTime: _lt, ...rest } = structuredClone(fixture) as Record<string, unknown>;
  void _lt;
  return { ...rest, schemaVersion: '2.0' };
};

describe('バックアップ検証とv2.0→v2.1移行', () => {
  it('公式サンプルはZod・公式JSON Schemaの両方で有効', () => {
    expect(validateOfficial(fixture)).toBe(true);
    const r = parseBackup(JSON.stringify(fixture));
    expect(r.ok).toBe(true);
  });
  it('v2.0を非破壊でv2.1へ。既存項目は1件も変えず、LIFE CLOCKは無効', () => {
    const src = v20();
    const before = JSON.stringify(src);
    const r = parseBackup(JSON.stringify(src));
    expect(JSON.stringify(src)).toBe(before); // 元データを変更しない
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe('2.0');
    expect(r.data.schemaVersion).toBe('2.1');
    for (const k of ['lifeCompass', 'workshop', 'goals', 'events', 'evidence', 'experiments', 'dayPlans', 'reviews', 'preferences', 'profile']) {
      expect((r.data as Record<string, unknown>)[k]).toEqual((src as Record<string, unknown>)[k]);
    }
    expect(r.data.lifeTime).toEqual({ enabled: false, displayMode: 'reflection', homeCard: 'off', visibility: 'private', birthDate: null, birthYear: null, planningHorizonAge: null, optedInAt: null, reflections: [], reflectionToPlanLinks: [] });
    expect(validateOfficial(r.data)).toBe(true);
  });
  it('未知の未来バージョンは安全に拒否', () => {
    const r = parseBackup(JSON.stringify({ ...fixture, schemaVersion: '9.0' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('未対応');
  });
  it('壊れたJSON・中身の不正・サイズ超過を拒否', () => {
    expect(parseBackup('{oops').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...fixture, goals: [{ id: 1 }] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...fixture, preferences: { timeZone: 'Asia/Tokyo', dataSharing: 'public' } })).ok).toBe(false);
    expect(parseBackup('{}', MAX_BACKUP_BYTES + 1).ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
  });
});
