import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { realEstateExample } from '../fixtures/realEstate';

export const V24_NOW = new Date('2026-11-10T01:00:00Z'); // JST 2026-11-10 10:00
export const PLAN_DATE = '2026-11-10';

export function v24Backup(mutate?: (ep: ReturnType<typeof realEstateExample>) => void): string {
  const fixture = JSON.parse(fs.readFileSync(path.resolve('../spec/SAMPLE_FIXTURE.json'), 'utf8'));
  const ep = realEstateExample();
  mutate?.(ep);
  return JSON.stringify({ ...fixture, featureVersion: '2.4', executionPlanning: ep });
}

export const asFile = (name: string, text: string) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });

/** 公式サンプル（v2.3完了済み）＋不動産トスアップ例で開始（テスト専用データ） */
export async function seedV24(page: Page, text = v24Backup()) {
  await page.clock.setFixedTime(V24_NOW);
  await page.goto('/');
  await page.getByRole('button', { name: 'バックアップから復元する' }).click();
  await page.getByTestId('restore-input').setInputFiles(asFile('seed.json', text));
  await expect(page.getByTestId('restore-preview')).toBeVisible();
  await page.getByTestId('restore-confirm').click();
  await expect(page.getByTestId('today')).toBeVisible();
}

export async function openNode(page: Page, id: string) {
  await page.goto(`/#/compass/plan/${id}`);
  await expect(page.getByTestId('node-sheet')).toBeVisible();
}

export async function placeAt(page: Page, actionId: string, time: string, opts: { date?: string; dur?: string } = {}) {
  await openNode(page, actionId);
  await page.getByTestId('node-to-schedule').click();
  if (opts.date) await page.getByTestId('place-date').fill(opts.date);
  await page.getByTestId('place-time').fill(time);
  if (opts.dur) await page.getByTestId('place-dur').fill(opts.dur);
  await page.getByTestId('place-save').click();
}
