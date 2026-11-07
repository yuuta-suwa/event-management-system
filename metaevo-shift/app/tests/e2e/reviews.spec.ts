/** D. 7/14/30/60/90日レビュー */
import { expect, test } from '@playwright/test';
import { at, doWorkshop, setDay } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(at(0));
});

test('D1 Day0=初回日、Day1=翌日、Day7で3問の軽い確認。省略してもペナルティなし', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る' });
  await expect(page.getByTestId('day-badge')).toHaveText('Day 00');
  await setDay(page, 1);
  await expect(page.getByTestId('day-badge')).toHaveText('Day 01 / 14');
  await expect(page.getByTestId('important-action')).toHaveText('提案を送る'); // 翌日にそのまま表示
  await setDay(page, 6);
  await expect(page.getByTestId('due-banner')).toHaveCount(0);
  await setDay(page, 7);
  await expect(page.getByTestId('due-banner')).toContainText('Day7');
  await page.goto('/#/review/day7');
  await expect(page.getByTestId('day7').locator('fieldset')).toHaveCount(2);
  await expect(page.getByTestId('day7')).toContainText('本当の進捗を何で確かめますか');
  await page.getByTestId('day7-skip').click();
  await expect(page.getByTestId('review')).toBeVisible();
  await page.goto('/#/today');
  await expect(page.getByTestId('due-banner')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/ペナルティ|未達成です|失敗/);
});

test('D2 日付の境界は日本時間（23:59と翌0:00でDayが変わる）', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る' });
  await page.clock.setFixedTime(new Date('2026-11-09T14:59:00Z')); // JST 23:59 Day0
  await page.reload();
  await expect(page.getByTestId('day-badge')).toHaveText('Day 00');
  await page.clock.setFixedTime(new Date('2026-11-09T15:00:00Z')); // JST 0:00 Day1
  await page.reload();
  await expect(page.getByTestId('day-badge')).toHaveText('Day 01 / 14');
});

test('D3 Day30/60/90で目標・実行条件・自律的判断・成果を確認できる', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', baseline: 2, unit: '件' });
  await setDay(page, 30);
  await page.goto('/#/review');
  await expect(page.getByTestId('due-day30')).toBeVisible();
  await page.getByTestId('due-day30').click();
  const r = page.getByTestId('review-day30');
  await expect(r).toContainText('行動・実行条件');
  await expect(r).toContainText('成果');
  await expect(r).toContainText('自分で判断した記録');
  await r.getByText('続ける', { exact: true }).click();
  await page.getByTestId('day30-save').click();
  await setDay(page, 90);
  await page.goto('/#/review/day90');
  await expect(page.getByTestId('review-day90')).toContainText('中止・変更も合理的な選択');
  await page.getByTestId('review-day90').getByText('中止・変更する（合理的な選択）').click();
  await page.getByTestId('day90-save').click();
  await expect(page.getByTestId('compass')).toBeVisible();
});
