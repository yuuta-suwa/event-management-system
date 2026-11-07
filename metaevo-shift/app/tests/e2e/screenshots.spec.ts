/** 納品用スクリーンショット（デモデータ・架空の内容のみ使用） */
import { expect, test } from '@playwright/test';
import { at, doWorkshop } from './helpers';

const out = (n: string) => `../docs-screenshots/${n}.png`;
test.use({ deviceScaleFactor: 2 });

test('screenshots', async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, 'SCREENSHOTS=1 のときのみ実行');
  await page.clock.setFixedTime(at(0));
  await page.goto('/');
  await page.screenshot({ path: out('01-welcome') });
  await page.getByTestId('start-onboarding').click();
  await page.screenshot({ path: out('02-intro') });
  await doWorkshop(page, { route: 'execute', action: '見込み顧客へ提案を1件送る', cue: '朝10時に机に座ったら、下書きを5分', when: 'today', baseline: 2, unit: '件', hypotheses: ['不快な気持ちを避けたい'], finish: false });
  await page.screenshot({ path: out('03-workshop-summary') });
  // 以降はデモデータ
  await page.goto('/#/settings');
  await page.getByTestId('to-demo').click();
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('action-block')).toBeVisible();
  await page.screenshot({ path: out('04-today'), fullPage: true });
  await page.getByTestId('btn-internal').click();
  await page.screenshot({ path: out('05-internal-switch') });
  await page.keyboard.press('Escape');
  await page.goto('/#/growth');
  await page.screenshot({ path: out('06-growth'), fullPage: true });
  await page.goto('/#/compass');
  await page.screenshot({ path: out('07-compass'), fullPage: true });
  await page.goto('/#/compass/lifeclock');
  await page.getByTestId('lifeclock-enable').click();
  await page.getByText('人生カレンダー（週）').click();
  await page.getByText('90歳', { exact: true }).click();
  await page.getByTestId('birth-date').fill('1988-04-01');
  await page.getByTestId('birth-save').click();
  await page.screenshot({ path: out('08-lifeclock'), fullPage: true });
  await page.goto('/#/review');
  await page.screenshot({ path: out('09-review'), fullPage: true });
  await page.goto('/#/settings');
  await page.screenshot({ path: out('10-settings'), fullPage: true });
});
