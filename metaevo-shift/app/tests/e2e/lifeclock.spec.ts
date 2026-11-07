/** docs/08_ACCEPTANCE_TESTS.md H. v2.3 LIFE CLOCK 追加テスト */
import { expect, test } from '@playwright/test';
import { at, doWorkshop, startWorkshop } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(at(0));
});

test('H1 初回は無効。ホームに死亡・残週カードや通知は出ない。60分ワークはLT00の任意カードのみ', async ({ page }) => {
  await startWorkshop(page);
  await page.getByTestId('next').click(); // Q01 → Q02
  await expect(page.getByTestId('q-Q02')).toBeVisible();
  await expect(page.getByTestId('lt00')).toHaveCount(0); // 自動表示しない
  await page.getByTestId('lt00-open').click();
  await expect(page.getByTestId('lt00')).toContainText('任意・非公開・スキップ可');
  await page.goto('/#/today');
  await expect(page.getByTestId('lifetime-home-card')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/残り.*週|余命|寿命/);
  await page.goto('/#/compass/lifeclock');
  await expect(page.getByTestId('lifeclock-optin')).toBeVisible();
});

test('H2 LT00はQ02を自動上書きせず、本人の承認で取り込む', async ({ page }) => {
  await startWorkshop(page);
  await page.getByTestId('next').click();
  await page.getByTestId('lt00-open').click();
  await page.getByTestId('lt00').locator('textarea').fill('家族と笑って過ごした時間');
  await expect(page.getByTestId('q-Q02').locator('textarea').first()).toHaveValue('');
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('lt00-import').click();
  await page.getByTestId('next').click();
  await page.getByRole('button', { name: '前の質問へ' }).click();
  await expect(page.getByTestId('q-Q02').locator('textarea').first()).toHaveValue('家族と笑って過ごした時間');
});

test('H3 生年月日なし・問いだけで利用でき、問い→今日の一歩は実行済みにならない。個別削除できる', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await page.goto('/#/compass/lifeclock');
  await page.getByTestId('lifeclock-enable').click();
  await expect(page.getByTestId('lt-questions')).toBeVisible();
  // 穏やかな問いへ切替できる
  await page.getByTestId('lt-gentle').click();
  await expect(page.getByTestId('lt-LT01')).toContainText('将来の自分');
  await page.getByTestId('lt-LT01-input').fill('家族との時間を後回しにしたくない');
  await page.getByTestId('lt-LT01-to-today').click();
  await expect(page.getByTestId('plan-sheet')).toContainText('「実行済み」にはなりません');
  await page.getByTestId('plan-action').fill('今夜20分、スマホを置いて家族と話す');
  await page.getByTestId('plan-save').click();
  await expect(page.getByTestId('important-action')).toHaveText('今夜20分、スマホを置いて家族と話す');
  await expect(page.getByTestId('plan-status')).toHaveText('予定');
  await page.goto('/#/growth');
  await expect(page.getByTestId('layer-learning')).toContainText('未計測');
  // 個別削除（2段階）
  await page.goto('/#/compass/lifeclock');
  await page.getByRole('button', { name: '表示・削除の設定' }).click();
  await page.getByTestId('lifeclock-delete').click();
  await page.getByTestId('lifeclock-delete-confirm').click();
  await expect(page.getByTestId('lifeclock-optin')).toBeVisible();
  await page.goto('/#/today');
  await expect(page.getByTestId('important-action')).toHaveText('今夜20分、スマホを置いて家族と話す');
});

test('H4 週カレンダー：仮の節目の選択・変更、寿命予測でない旨を同一画面に表示、節目到達で負数なし', async ({ page }) => {
  await doWorkshop(page, { route: 'explore', q02Unknown: true, action: '散歩する' });
  await page.goto('/#/compass/lifeclock');
  await page.getByTestId('lifeclock-enable').click();
  await page.getByText('人生カレンダー（週）').click();
  await expect(page.getByTestId('not-prediction')).toContainText('寿命の予測ではありません');
  await expect(page.getByTestId('weeks-summary')).toContainText('仮の節目が未選択');
  await page.getByText('90歳', { exact: true }).click();
  await expect(page.getByTestId('weeks-summary')).toContainText('生年月日または生年が未入力');
  await page.getByTestId('birth-date').fill('1996-02-29');
  await page.getByTestId('birth-save').click();
  await expect(page.getByTestId('weeks-summary')).toContainText('90歳を仮の節目');
  await expect(page.getByTestId('not-prediction')).toContainText('90歳を仮の節目に設定した人生カレンダーです。これは寿命の予測ではありません');
  await expect(page.locator('svg.lifecal')).toHaveAttribute('aria-label', /これまでの時間はおよそ/);
  await page.getByText('80歳', { exact: true }).click();
  await expect(page.getByTestId('weeks-summary')).toContainText('80歳を仮の節目');
  // 節目到達：任意年齢を現年齢以下に
  await page.getByText('任意', { exact: true }).click();
  await page.getByTestId('horizon-custom').fill('20');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByTestId('weeks-summary')).toHaveText('設定した仮の節目に到達しました。新たな節目を選ぶか、時間の振り返りに切り替えられます。');
  await expect(page.getByTestId('lifeclock')).not.toContainText(/-\d+週|死亡予定/);
  // 生年のみは概算
  await page.getByText('90歳', { exact: true }).click();
  await page.getByText('生年月日・生年（任意・端末内のみ）').click();
  await page.getByRole('button', { name: '消去' }).click();
  await page.getByTestId('birth-year').fill('1990');
  await page.getByTestId('birth-save').click();
  await expect(page.getByTestId('weeks-summary')).toContainText('概算');
});

test('H5 ホームカードは本人が有効化した場合のみ、穏やかな文言で表示', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る' });
  await page.goto('/#/compass/lifeclock');
  await page.getByTestId('lifeclock-enable').click();
  await page.goto('/#/today');
  await expect(page.getByTestId('lifetime-home-card')).toHaveCount(0);
  await page.goto('/#/compass/lifeclock');
  await page.getByRole('button', { name: '表示・削除の設定' }).click();
  await page.getByText('「今日、大切にすることは？」を小さく表示').click();
  await page.goto('/#/today');
  await expect(page.getByTestId('lifetime-home-card')).toHaveText(/今日、大切にすることは？/);
  await expect(page.getByTestId('lifetime-home-card')).not.toContainText(/\d+\s*週|\d+\s*歳|余命|寿命|残り/);
});
