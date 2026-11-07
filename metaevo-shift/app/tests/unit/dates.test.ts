import { describe, expect, it } from 'vitest';
import { addDays, addYears, dayNumber, daysBetween, localDateOf } from '../../src/domain/dates';

describe('日付（日本時間）', () => {
  it('UTC 15:00 以降は JST の翌日', () => {
    expect(localDateOf('2026-11-07T14:59:59Z', 'Asia/Tokyo')).toBe('2026-11-07');
    expect(localDateOf('2026-11-07T15:00:00Z', 'Asia/Tokyo')).toBe('2026-11-08');
  });
  it('Day0=初回日、Day1=翌日、Day14=14日後', () => {
    expect(dayNumber('2026-11-07', '2026-11-07')).toBe(0);
    expect(dayNumber('2026-11-07', '2026-11-08')).toBe(1);
    expect(addDays('2026-11-07', 14)).toBe('2026-11-21');
    expect(dayNumber('2026-12-25', '2027-01-08')).toBe(14);
  });
  it('閏年・年跨ぎ', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-12-31', '2028-01-01')).toBe(1);
    expect(addYears('2000-02-29', 1)).toBe('2001-02-28');
    expect(addYears('2000-02-29', 4)).toBe('2004-02-29');
  });
  it('他のタイムゾーンでも暦日で計算', () => {
    expect(localDateOf('2026-11-07T23:30:00Z', 'America/Los_Angeles')).toBe('2026-11-07');
  });
});
