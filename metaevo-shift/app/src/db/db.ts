/**
 * ローカル保存（IndexedDB / Dexie）
 * - 本人のデータ：DB名 'metaevo-shift'
 * - デモ・テスト用データ：DB名 'metaevo-shift-demo'（本物のデータと物理的に別のDB）
 */
import Dexie, { type EntityTable } from 'dexie';
import type { AppEvent, DayPlan, Evidence, Experiment, Goal, Review } from '../domain/schema';

export const PERSONAL_DB = 'metaevo-shift';
export const DEMO_DB = 'metaevo-shift-demo';
const MODE_KEY = 'metaevo-shift:data-mode';

export type DataMode = 'personal' | 'demo';

export interface KvRow {
  key: string;
  value: unknown;
}

export class AppDB extends Dexie {
  kv!: EntityTable<KvRow, 'key'>;
  goals!: EntityTable<Goal, 'id'>;
  experiments!: EntityTable<Experiment, 'id'>;
  dayPlans!: EntityTable<DayPlan, 'id'>;
  events!: EntityTable<AppEvent, 'id'>;
  evidence!: EntityTable<Evidence, 'id'>;
  reviews!: EntityTable<Review, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      kv: 'key',
      goals: 'id, status',
      experiments: 'id, status, startDate',
      dayPlans: 'id, localDate',
      events: 'id, kind, localDate, planId',
      evidence: 'id, layer, goalId, experimentId',
      reviews: 'id, reviewKind',
    });
  }

  get collections() {
    return [this.goals, this.experiments, this.dayPlans, this.events, this.evidence, this.reviews] as const;
  }
}

export function getDataMode(): DataMode {
  try {
    return globalThis.localStorage?.getItem(MODE_KEY) === 'demo' ? 'demo' : 'personal';
  } catch {
    return 'personal';
  }
}

export function setDataMode(mode: DataMode): void {
  try {
    globalThis.localStorage?.setItem(MODE_KEY, mode);
  } catch {
    /* 保存できない環境では既定（本人データ）のまま */
  }
}

let current: AppDB | null = null;

export function db(): AppDB {
  if (!current) current = new AppDB(getDataMode() === 'demo' ? DEMO_DB : PERSONAL_DB);
  return current;
}

/** テスト用：任意名のDBを使う */
export function useDb(instance: AppDB): void {
  current = instance;
}
