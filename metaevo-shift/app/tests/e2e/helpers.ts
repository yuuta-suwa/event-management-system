import { expect, type Page } from '@playwright/test';

export const DAY0 = '2026-11-09T01:00:00Z'; // JST 2026-11-09 10:00（Day0）
export function at(dayOffset: number, hourJst = 10): Date {
  const d = new Date(DAY0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hourJst - 9);
  return d;
}

export async function setDay(page: Page, dayOffset: number, reload = true) {
  await page.clock.setFixedTime(at(dayOffset));
  if (reload) await page.reload();
}

export interface WorkshopOpts {
  route: 'explore' | 'protect' | 'plan' | 'execute';
  q02Unknown?: boolean;
  q06?: string;
  br2?: string;
  theme?: string;
  baseline?: number;
  unit?: string;
  q10none?: boolean;
  hypotheses?: string[];
  action?: string;
  cue?: string;
  when?: 'today' | 'tomorrow';
  q18?: string;
  finish?: boolean;
}

const ROUTE_TEXT = { explore: '方向性を探している', protect: '望みはあるが明確化や公開が負担', plan: '目標はあるが方法・計画が分からない', execute: '計画はあるが実行しにくい' };

async function next(page: Page) {
  await page.getByTestId('next').click();
}

export async function startWorkshop(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('start-onboarding').or(page.getByTestId('today'))).toBeVisible();
  if (await page.getByTestId('start-onboarding').isVisible()) await page.getByTestId('start-onboarding').click();
  else await page.goto('/#/workshop');
  await expect(page.getByTestId('intro')).toBeVisible();
  for (let i = 0; i < 7; i++) await page.getByTestId('intro-next').click();
  await page.getByTestId('intro-done').click();
}

export async function doWorkshop(page: Page, o: WorkshopOpts) {
  await startWorkshop(page);
  // Q01
  await expect(page.getByTestId('q-Q01')).toBeVisible();
  await page.getByTestId('q-Q01').getByText('仕事', { exact: true }).click();
  await next(page);
  // Q02
  if (o.q02Unknown) await page.getByTestId('q-Q02').getByText('まだ分からない').click();
  else await page.getByTestId('q-Q02').getByText('成長', { exact: true }).click();
  await next(page);
  await page.getByTestId('skip').click(); // Q03
  await page.getByTestId('skip').click(); // Q04
  await page.getByTestId('skip').click(); // Q05
  if (o.q06) { await page.getByTestId('q-Q06').getByText(o.q06, { exact: true }).click(); await next(page); } else await page.getByTestId('skip').click();
  // Q07
  await page.getByTestId('q-Q07').getByText(ROUTE_TEXT[o.route]).click();
  await next(page);
  // BR1, BR2
  await next(page);
  await expect(page.locator('[data-testid^="branch-"][data-testid$="2"]')).toBeVisible();
  if (o.br2) await page.locator('[data-testid^="branch-"][data-testid$="2"] textarea').fill(o.br2);
  await next(page);
  // Q08
  const prefilled = !!o.br2 && (o.route === 'explore' || o.route === 'plan');
  if (o.theme) await page.getByTestId('q08-theme').fill(o.theme);
  else if (!prefilled) await page.getByTestId('q08-theme').fill('14日間で試すこと');
  else await expect(page.getByTestId('q08-theme')).toHaveValue(o.br2!);
  await next(page);
  // Q09
  if (o.baseline !== undefined) {
    await page.getByTestId('q-Q09').getByText('実際の成果').click();
    await page.getByLabel('今の値（任意）').fill(String(o.baseline));
    await page.getByLabel('単位（任意）').fill(o.unit ?? '件');
    await next(page);
  } else await page.getByTestId('skip').click();
  // Q10
  if (o.q10none) { await page.getByTestId('q-Q10').getByText('該当なし').click(); await next(page); }
  else { await page.getByTestId('skip').click(); await page.getByTestId('skip').click(); await page.getByTestId('skip').click(); await page.getByTestId('skip').click(); }
  // Q14
  await expect(page.getByTestId('q-Q14')).toBeVisible();
  for (const h of o.hypotheses ?? []) await page.getByTestId('q-Q14').getByText(h).click();
  await next(page);
  // Q15
  if (o.action) await page.getByTestId('q15-action').fill(o.action);
  if (o.when === 'today') await page.getByTestId('q-Q15').getByText('今日', { exact: true }).click();
  await next(page);
  await page.getByTestId('q16-cue').fill(o.cue ?? '朝食後、机で5分');
  await next(page);
  await page.getByTestId('skip').click(); // Q17
  if (o.q18) { await page.getByTestId('q-Q18').getByText(o.q18).click(); await next(page); } else await page.getByTestId('skip').click();
  await expect(page.getByTestId('summary')).toBeVisible();
  if (o.finish !== false) {
    await page.getByTestId('finish-workshop').click();
    await expect(page.getByTestId('today')).toBeVisible();
  }
}

export async function startToday(page: Page) {
  await expect(page.getByTestId('btn-start').or(page.getByTestId('same-as-before'))).toBeVisible();
  if (await page.getByTestId('same-as-before').isVisible()) await page.getByTestId('same-as-before').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('plan-status')).toHaveText('実行中');
}

export async function evening(page: Page, o: { status?: string; progress?: string; learning?: string; qty?: number } = {}) {
  await page.getByTestId('btn-evening').click();
  const s = page.getByTestId('evening-sheet');
  if (o.status) await s.getByText(o.status, { exact: true }).click();
  if (o.progress) await page.getByTestId('ev-progress').fill(o.progress);
  if (o.learning) await page.getByTestId('ev-learning').fill(o.learning);
  if (o.qty !== undefined) { await s.getByText('結果が出た場合の成果').click(); await page.getByTestId('ev-qty').fill(String(o.qty)); }
  await page.getByTestId('ev-save').click();
  await expect(s).toBeHidden();
}
