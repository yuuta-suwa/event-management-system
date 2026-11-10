/** v2.4 納品用スクリーンショット（iMac相当 1440×900 / iPhone相当 390×844）。テスト用データのみ。 */
import { expect, test } from '@playwright/test';
import { openNode, placeAt, seedV24 } from './v24helpers';

test('v24 screenshots', async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, 'SCREENSHOTS=1 のときのみ実行');
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedV24(page);
  await placeAt(page, 're_todo_conditions', '14:00');
  await placeAt(page, 're_todo_candidates', '15:00');
  await placeAt(page, 're_todo_consent', '24:30', { dur: '10' });
  const shot = async (n: string) => { await page.waitForTimeout(400); await page.screenshot({ path: `../docs-screenshots/${n}.png` }); };
  await page.goto('/#/compass/plan');
  await expect(page.getByTestId('mindmap')).toBeVisible();
  await shot('v24-imac-mindmap');
  await openNode(page, 're_todo_conditions');
  await shot('v24-imac-node-pane');
  await page.goto('/#/today/priority');
  await shot('v24-imac-priority');
  await page.clock.setFixedTime(new Date('2026-11-10T04:40:00Z'));
  await page.goto('/#/today/plan');
  await page.reload();
  await shot('v24-imac-schedule');
});
