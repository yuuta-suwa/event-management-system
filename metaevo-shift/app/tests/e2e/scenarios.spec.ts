/** docs/08_ACCEPTANCE_TESTS.md G. E2E必須シナリオ（10本） */
import { expect, test } from '@playwright/test';
import { at, doWorkshop, evening, setDay, startToday } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(at(0));
});

test('G1 A：方向性が分からない人 → 非公開探索 → 体験行動 → 実行 → Day14で学びを確認', async ({ page }) => {
  await doWorkshop(page, { route: 'explore', q02Unknown: true, br2: '気になる活動を2つ試す', action: '料理教室の体験を予約する', when: 'today' });
  // 分岐回答がQ08へ引き継がれている（二重入力なし）→ 方向性に表示
  await expect(page.getByText('今の方向性：気になる活動を2つ試す')).toBeVisible();
  await expect(page.getByText('今日の探索')).toBeVisible();
  await expect(page.getByTestId('important-action')).toHaveText('料理教室の体験を予約する');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-complete').click();
  await page.getByTestId('complete-what').fill('体験を予約した');
  await page.getByTestId('complete-save').click();
  await evening(page, { learning: '人に教える場面に充実感があった' });
  await setDay(page, 14);
  await expect(page.getByTestId('day-badge')).toHaveText('Day 14 / 14');
  await page.getByTestId('due-banner').click();
  await page.goto('/#/review/day14');
  for (let i = 0; i < 2; i++) await page.getByTestId('d14-next').click();
  await expect(page.getByTestId('d14-step3')).toContainText('人に教える場面に充実感があった');
  await page.getByTestId('d14-next').click();
  await page.getByTestId('d14-next').click();
  await page.getByTestId('d14-finish').click();
  await expect(page.getByTestId('review')).toBeVisible();
});

test('G2 B：言えない目標 → 公開なし → 仮の目標 → 最小行動 → Day14で変化確認', async ({ page }) => {
  await doWorkshop(page, { route: 'protect', q06: '人に話すことに抵抗', br2: '年収の目標額を自分だけのメモに1行書く', theme: '非公開の仮目標を試す', when: 'today', finish: false });
  // B2の回答がQ15の初期値になっている
  await page.goto('/#/workshop');
  await expect(page.getByTestId('summary')).toContainText('年収の目標額を自分だけのメモに1行書く');
  await page.getByTestId('finish-workshop').click();
  await expect(page.getByText(/公開する|共有する/)).toHaveCount(0);
  await startToday(page);
  await evening(page, { status: '完了した', progress: 'メモに1行書いた' });
  await page.getByTestId('tab-compass').click();
  await expect(page.getByTestId('compass')).toContainText('非公開');
  await setDay(page, 14);
  await page.goto('/#/review/day14');
  await expect(page.getByTestId('d14-step1')).toBeVisible();
  await page.getByTestId('d14-next').click();
  await page.getByTestId('d14-next').click();
  await expect(page.getByTestId('d14-step3')).toContainText('メモに1行書いた');
});

test('G3 C：方法が分からず見込みが低い → 学習実験 → 方法を試す → Day14で実行可能性を再評価', async ({ page }) => {
  await doWorkshop(page, { route: 'plan', hypotheses: ['やり方が分からない', 'できる見込みが持てない'], theme: '提案の手順を1本作って試す', action: '提案の上手な人の資料を1つ読む', when: 'today' });
  await page.goto('/#/compass');
  await expect(page.getByTestId('compass')).toContainText('やり方が分からない');
  await page.goto('/#/today');
  await page.getByTestId('btn-unsure').click();
  await page.getByTestId('unsure-sheet').getByText('① 最初の操作が分からない').click();
  await page.getByLabel('ステップ1').fill('資料のURLを開く');
  await page.getByLabel('ステップ2').fill('目次だけ読む');
  await page.getByTestId('unsure-save-steps').click();
  await expect(page.getByTestId('important-action')).toHaveText('資料のURLを開く');
  await startToday(page);
  await setDay(page, 14);
  await page.goto('/#/review/day14');
  for (let i = 0; i < 3; i++) await page.getByTestId('d14-next').click();
  const step4 = page.getByTestId('d14-step4');
  await step4.getByText('判断する情報が足りない').first().click();
  await step4.getByText('反対する観察あり').nth(1).click();
  await page.getByTestId('d14-next').click();
  await page.getByTestId('d14-finish').click();
  await page.goto('/#/review');
  await expect(page.getByTestId('review')).toContainText('Day14 振り返り（20〜30分）');
  await expect(page.getByTestId('review')).toContainText('次の一手：提案の上手な人の資料を1つ読む');
});

test('G4 D：資料整理に流れる → 内的切替 → 理由記録（任意）→ 2分着手 → 実成果を確認', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', baseline: 2, unit: '件', action: '見込み顧客へ提案を1件送る', when: 'today' });
  await page.getByTestId('btn-internal').click();
  const sheet = page.getByTestId('internal-sheet');
  await sheet.getByLabel('今やりたい別のこと（任意）').fill('資料整理');
  await sheet.getByText('不安', { exact: true }).click();
  await expect(sheet).not.toContainText('逃避です');
  await page.getByTestId('sw-two-minutes').click();
  await expect(page.getByTestId('plan-status')).toHaveText('実行中');
  await evening(page, { status: '完了した', qty: 4 });
  await page.getByTestId('tab-growth').click();
  await expect(page.getByTestId('outcome-change')).toContainText('2件 → 4件（+2件）');
  await expect(page.getByTestId('layer-action')).toContainText('内的な切替：1件');
});

test('G5 E：顧客トラブル → 即対応 → 復帰地点記録 → 復帰・未復帰の事実を記録', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案書を仕上げる', when: 'today' });
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-external').click();
  await page.getByTestId('external-sheet').getByText('今対応が必要').click();
  await page.getByTestId('ext-first-step').fill('3ページ目の図から再開');
  await page.getByTestId('ext-resume-at').fill('15:00');
  await page.getByTestId('ext-save').click();
  await expect(page.getByTestId('plan-status')).toHaveText('中断中');
  await expect(page.getByTestId('resume-box')).toContainText('3ページ目の図から再開');
  await expect(page.getByTestId('resume-box')).toContainText('15:00');
  await page.getByTestId('resume-from-interrupt').click();
  await expect(page.getByTestId('plan-status')).toHaveText('実行中');
  // 2回目は戻れなかった
  await page.getByTestId('btn-external').click();
  await page.getByTestId('external-sheet').getByText('後に回せる').click();
  await page.getByTestId('ext-save').click();
  await page.getByTestId('not-resumed').click();
  await page.getByTestId('tab-growth').click();
  await expect(page.getByTestId('layer-action')).toContainText('予定外の対応 2件：復帰の有無が分かった2件中1件で復帰');
});

test('G6 F：休日に休息 → 回復日として保存 → 着手率の分母から除外', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await startToday(page);
  await setDay(page, 1);
  await page.getByTestId('mode-recover').click();
  await page.getByLabel('何を守る休息か（任意）').fill('家族との時間');
  await page.getByTestId('rest-save').click();
  await expect(page.getByTestId('rest-card')).toContainText('未達成としては扱いません');
  await page.getByTestId('tab-growth').click();
  await page.getByText('Day0から').click();
  await expect(page.getByTestId('start-rate-text')).toHaveText('着手率 100%（記録がある1日中1日）');
  await expect(page.getByTestId('layer-action')).toContainText('回復日着手率の分母外');
});

test('G7 G：14日中の未記録が多い → 0%断定なし → データ不足として次の支援を提案', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る' });
  await setDay(page, 14);
  await page.goto('/#/growth');
  await expect(page.getByTestId('start-rate')).toHaveText('未計測');
  await expect(page.getByTestId('layer-action')).not.toContainText('0%');
  await page.goto('/#/review/day14');
  await expect(page.getByTestId('d14-insufficient')).toContainText('データが不足');
  await expect(page.getByTestId('d14-start-rate')).toContainText('未計測');
});

test('G8 H：行動は増えたが成果がない → 戦略・能力・市場の反応を再検証する提案', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る' });
  for (const d of [1, 2, 3]) {
    await setDay(page, d);
    await startToday(page);
  }
  await setDay(page, 4);
  await expect(page.getByTestId('advice-R_NO_PLAN')).toBeVisible(); // 優先順位：計画未設定(8) > 成果確認(9)
  await page.getByTestId('same-as-before').click();
  await expect(page.getByTestId('advice-R_FEEDBACK')).toContainText('成果はまだ確認できません');
  await page.goto('/#/growth');
  await expect(page.getByTestId('feedback-note')).toContainText('相手の反応');
  await expect(page.getByTestId('layer-outcome')).toContainText('未計測');
});

test('G9 I：目標を変えたい → 価値観に沿って選び直す → 旧実験は履歴保存', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', theme: '売上を伸ばす', action: '提案を送る', when: 'today' });
  await startToday(page);
  await page.getByTestId('tab-compass').click();
  await page.getByTestId('revise-goal').click();
  await page.getByTestId('revise-title').fill('家族との時間を守りながら事業を育てる');
  await page.getByTestId('revise-action').fill('週の予定に家族の時間を先に入れる');
  await page.getByTestId('revise-save').click();
  await expect(page.getByTestId('compass')).toContainText('家族との時間を守りながら事業を育てる');
  await page.getByText('更新履歴').click();
  await expect(page.getByTestId('compass')).toContainText('売上を伸ばす');
  await page.getByTestId('tab-review').click();
  await expect(page.getByTestId('review')).toContainText('開始');
});

test('G10 J：ワーク中に回線を切る → データ消失なく再開、オン/オフで集計同一', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await doWorkshop(page, { route: 'execute', action: 'オフラインで決めた行動', when: 'today', finish: false });
  await expect(page.getByTestId('offline-pill')).toBeVisible();
  await page.reload(); // オフラインのまま再起動
  await expect(page.getByTestId('summary')).toContainText('オフラインで決めた行動');
  await page.getByTestId('finish-workshop').click();
  await startToday(page);
  await page.goto('/#/growth');
  const offlineText = await page.getByTestId('start-rate-text').textContent();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByTestId('start-rate-text')).toHaveText(offlineText!);
});
