import 'fake-indexeddb/auto';
import { AppDB, useDb } from '../../src/db/db';
import { clock, ensureInitialized, updatePreferences } from '../../src/db/repo';

let n = 0;
export async function freshDb(name = `test-${Date.now()}-${n++}`, now = '2026-11-07T02:00:00Z'): Promise<AppDB> {
  const d = new AppDB(name);
  useDb(d);
  clock.now = () => new Date(now);
  await ensureInitialized();
  await updatePreferences({ timeZone: 'Asia/Tokyo' });
  return d;
}

export function setNow(iso: string) {
  clock.now = () => new Date(iso);
}
