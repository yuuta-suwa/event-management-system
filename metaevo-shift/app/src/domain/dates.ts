/** 日付ユーティリティ。暦日は 'YYYY-MM-DD' 文字列で扱い、UTCの暦日に正規化して差分を計算する。 */

const DAY_MS = 86_400_000;

/** 指定タイムゾーンでのローカル日付（YYYY-MM-DD） */
export function localDateOf(at: Date | string, timeZone: string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 指定タイムゾーンでの時刻（HH:mm） */
export function localTimeOf(at: Date | string, timeZone: string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  try {
    return new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

export function ymdToUtcMs(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  return Date.UTC(y, m - 1, d);
}

export function utcMsToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** b - a の暦日差 */
export function daysBetween(a: string, b: string): number {
  return Math.round((ymdToUtcMs(b) - ymdToUtcMs(a)) / DAY_MS);
}

export function addDays(ymd: string, n: number): string {
  return utcMsToYmd(ymdToUtcMs(ymd) + n * DAY_MS);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 年を加算。2月29日 → 非閏年は2月28日（2月末）とする規約。 */
export function addYears(ymd: string, years: number): string {
  const { y, m, d } = parseYmd(ymd);
  const ny = y + years;
  const nd = Math.min(d, daysInMonth(ny, m));
  return `${String(ny).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function isValidYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const { y, m, d } = parseYmd(ymd);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Day番号：Day0 = 初回ワーク日、Day1 = 翌日 */
export function dayNumber(day0: string, today: string): number {
  return daysBetween(day0, today);
}

export function formatJpDate(ymd: string): string {
  const { m, d } = parseYmd(ymd);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(ymdToUtcMs(ymd)).getUTCDay()];
  return `${m}月${d}日（${wd}）`;
}

export function dateRange(start: string, endInclusive: string): string[] {
  const out: string[] = [];
  const n = daysBetween(start, endInclusive);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}
