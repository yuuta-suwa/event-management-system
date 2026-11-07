import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { clock, loadAll, type AppData } from './db/repo';
import { getDataMode, type DataMode } from './db/db';
import { addDays, daysBetween, localDateOf } from './domain/dates';
import { computeActionMetrics, latestPlanByDate, type ActionMetrics } from './domain/metrics';
import { day0Of, dueReviews, type DueReview } from './domain/reviews';
import type { DayPlan, Experiment, Goal } from './domain/schema';

export type Route =
  | { name: 'welcome' }
  | { name: 'workshop' }
  | { name: 'today'; edit?: boolean }
  | { name: 'compass' }
  | { name: 'lifeclock' }
  | { name: 'growth' }
  | { name: 'review'; kind?: string }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  switch (a) {
    case 'welcome': return { name: 'welcome' };
    case 'workshop': return { name: 'workshop' };
    case 'compass': return b === 'lifeclock' ? { name: 'lifeclock' } : { name: 'compass' };
    case 'growth': return { name: 'growth' };
    case 'review': return { name: 'review', kind: b };
    case 'settings': return { name: 'settings' };
    case 'today': return { name: 'today', edit: b === 'edit' };
    default: return { name: 'today' };
  }
}

export function hrefOf(r: Route): string {
  switch (r.name) {
    case 'lifeclock': return '#/compass/lifeclock';
    case 'review': return r.kind ? `#/review/${r.kind}` : '#/review';
    case 'today': return r.edit ? '#/today/edit' : '#/today';
    default: return `#/${r.name}`;
  }
}

export interface Derived {
  data: AppData;
  mode: DataMode;
  tz: string;
  today: string;
  day0: string | null;
  dayN: number | null;
  experiment: Experiment | null;
  goal: Goal | null;
  todayPlan: DayPlan | null;
  previousPlan: DayPlan | null;
  cycleMetrics: ActionMetrics | null;
  due: DueReview[];
  navigate: (r: Route) => void;
  toast: (m: string) => void;
  toastMessage: string | null;
  clearToast: () => void;
  /** LIFE CLOCK から今日の行動へ渡す一時情報（保存しない） */
  pendingLink: { reflectionId: string | null; reason: string | null } | null;
  setPendingLink: (v: { reflectionId: string | null; reason: string | null } | null) => void;
}

const Ctx = createContext<Derived | null>(null);

export function useApp(): Derived {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider がありません');
  return v;
}

function useToday(tz: string | undefined): string {
  const [today, setToday] = useState(() => localDateOf(clock.now(), tz ?? 'Asia/Tokyo'));
  useEffect(() => {
    const tick = () => setToday(localDateOf(clock.now(), tz ?? 'Asia/Tokyo'));
    tick();
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [tz]);
  return today;
}

export function AppProvider(props: { children: (route: Route, ready: boolean) => ReactNode }) {
  const data = useLiveQuery(loadAll, []);
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  const [toastMessage, setToast] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<Derived['pendingLink']>(null);
  const tz = data?.preferences.timeZone;
  const today = useToday(tz);

  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    const theme = data?.preferences.displayTheme ?? 'dark';
    const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
    document.documentElement.dataset.theme = resolved;
  }, [data?.preferences.displayTheme]);

  const navigate = useCallback((r: Route) => {
    const h = hrefOf(r);
    if (location.hash !== h) location.hash = h;
    else setRoute(r);
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  const derived = useMemo<Derived | null>(() => {
    if (!data) return null;
    const tzv = data.preferences.timeZone;
    const day0 = day0Of(data.workshop, tzv);
    const experiment = data.experiments.filter((e) => e.status === 'active').sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
    const goal = (experiment?.goalId ? data.goals.find((g) => g.id === experiment.goalId) : null) ?? data.goals.find((g) => g.status !== 'retired') ?? null;
    const byDate = latestPlanByDate(data.dayPlans);
    const todayPlan = byDate.get(today) ?? null;
    const previousPlan = [...data.dayPlans].filter((p) => p.localDate < today && p.importantAction).sort((a, b) => b.localDate.localeCompare(a.localDate))[0] ?? null;
    let cycleMetrics: ActionMetrics | null = null;
    if (experiment) {
      const end = experiment.endDate < today ? experiment.endDate : today;
      const start = experiment.startDate <= end ? experiment.startDate : end;
      cycleMetrics = computeActionMetrics(data.dayPlans, data.events, start, end, today);
    }
    return {
      data,
      mode: getDataMode(),
      tz: tzv,
      today,
      day0,
      dayN: day0 ? daysBetween(day0, today) : null,
      experiment,
      goal,
      todayPlan,
      previousPlan,
      cycleMetrics,
      due: dueReviews({ day0, today, experiment, reviews: data.reviews }),
      navigate,
      toast: setToast,
      toastMessage,
      clearToast,
      pendingLink,
      setPendingLink,
    };
  }, [data, today, navigate, toastMessage, clearToast, pendingLink]);

  return <Ctx.Provider value={derived}>{props.children(route, !!derived)}</Ctx.Provider>;
}

export function recentPeriod(today: string, days = 14): { start: string; end: string } {
  return { start: addDays(today, -(days - 1)), end: today };
}
