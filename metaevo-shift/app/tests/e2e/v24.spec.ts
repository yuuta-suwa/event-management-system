/** v2.4 追加受け入れテスト（ユーザー提供の1ファイル版 第2部 N01〜N34）。データは架空のテスト用のみ。 */
import { expect, test } from '@playwright/test';
import { asFile, openNode, PLAN_DATE, placeAt, seedV24, v24Backup, V24_NOW } from './v24helpers';
import { doWorkshop } from './helpers';

test('受け入れ条件：人生の軸→階層分解→TODO→4象限→7〜25時配置→開始/完了→成果を独立記録→振り返り（二重入力なし）', async ({ page }) => {
  await page.clock.setFixedTime(V24_NOW);
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await page.getByTestId('tab-compass').click();
  await page.getByTestId('open-plantree').click();
  await expect(page.getByTestId('life-anchor')).toContainText('成長');
  await page.getByTestId('add-goal').click();
  await page.getByTestId('goal-title').fill('不動産トスアップ1件');
  await page.getByTestId('goal-save').click();
  // 目標 → 中間成果（深掘り）
  await page.getByRole('button', { name: /不動産トスアップ1件/ }).first().click();
  await page.getByTestId('deep-0').fill('紹介条件を把握する');
  await page.getByTestId('deep-add-0').click();
  await page.getByTestId('node-save').click();
  // 中間成果 → TODO（深掘りの「最初の行動」）
  await page.getByRole('button', { name: /紹介条件を把握する/ }).first().click();
  await page.getByTestId('deep-2').fill('連携担当へ対象条件を確認する');
  await page.getByTestId('deep-add-2').click();
  await page.getByTestId('node-save').click();
  // TODO詳細：タイトルのみ → 下書き → 条件を入れて計画可能
  await page.getByRole('button', { name: /連携担当へ対象条件を確認する/ }).first().click();
  await expect(page.getByTestId('plannable-state')).toContainText('下書き');
  await page.getByTestId('node-done').fill('対象条件・受領方法をメモに記録');
  await page.getByTestId('node-est').fill('15');
  await expect(page.getByTestId('plannable-state')).toContainText('計画可能');
  await page.getByTestId('score-imp').getByText('4', { exact: true }).click();
  await page.getByTestId('score-urg').getByText('2', { exact: true }).click();
  await page.getByTestId('node-save').click();
  // 4象限：第2象限
  await page.goto('/#/today/priority');
  const card = page.getByTestId('quad-2').getByRole('button', { name: /連携担当へ対象条件を確認する/ });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByTestId('node-make-primary').click();
  await page.getByTestId('node-to-schedule').click();
  await page.getByTestId('place-time').fill('14:00');
  await page.getByTestId('place-save').click();
  // 時間割 → 開始 → 完了
  await page.goto('/#/today/plan');
  const block = page.locator('[data-testid^="block-"]').filter({ hasText: '連携担当へ対象条件を確認する' });
  await expect(block).toContainText('14:00〜14:15');
  await expect(block).toContainText('★');
  await block.click();
  await page.getByTestId('ex-start').click();
  await expect(page.getByTestId('block-state')).toHaveText('実行中');
  await page.getByTestId('ex-complete').click();
  await page.getByTestId('block-sheet').getByText('満たした', { exact: true }).click();
  await page.getByTestId('ex-complete-save').click();
  await expect(page.getByTestId('block-state')).toHaveText('完了');
  await page.keyboard.press('Escape');
  // v2.3の「今日」でも同じ1件が完了（二重の正本なし）
  await page.goto('/#/today');
  await expect(page.getByTestId('important-action')).toHaveText('連携担当へ対象条件を確認する');
  await expect(page.getByTestId('plan-status')).toHaveText('完了');
  // 成果は独立：まだ0件
  await page.goto('/#/growth');
  const go = page.getByTestId('goal-outcomes');
  await expect(go).toContainText('TODO 1/1件 完了');
  await expect(go).toContainText('記録なし');
  await go.getByRole('button', { name: '成果を記録' }).first().click();
  await page.getByTestId('outcome-value').fill('1');
  await page.getByTestId('outcome-evidence').fill('担当者から受領連絡');
  await page.getByTestId('outcome-save').click();
  await expect(go).toContainText('1件の記録（合計 1件）');
  // 振り返り
  await page.goto('/#/today');
  await page.getByTestId('btn-evening').click();
  await expect(page.getByTestId('ev-exec-summary')).toContainText('予定枠 1件：記録 1件・完了 1件');
  await page.getByTestId('ev-save').click();
  await page.goto('/#/review');
  await expect(page.getByTestId('plan-review')).toContainText('予定実行率 100%');
});

test.describe('既存データ・目標ツリー', () => {
  test('N01 既存の人生目的に紐づき、回答内容は新領域に複製されない', async ({ page }, info) => {
    await seedV24(page);
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('life-anchor')).toContainText('人の可能性を引き出す');
    await page.goto('/#/settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-backup').click()]);
    const p = info.outputPath('b.json');
    await dl.saveAs(p);
    const json = JSON.parse((await import('node:fs')).readFileSync(p, 'utf8'));
    expect(JSON.stringify(json.executionPlanning)).not.toContain('人の可能性を引き出す');
    expect(json.executionPlanning.planNodes[0].sourceAnchorId).toBe('legacy:lifeCompass');
  });

  test('N02 人生目的なしでも仮目標・探索TODOを登録できる', async ({ page }) => {
    await page.clock.setFixedTime(V24_NOW);
    await doWorkshop(page, { route: 'explore', q02Unknown: true, action: '散歩する' });
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('life-anchor')).toContainText('まだ探索中');
    await page.getByTestId('add-goal').click();
    await page.getByTestId('add-goal-sheet').getByText('つなげない（あとで決める）').click();
    await page.getByTestId('goal-title').fill('興味のあることを探す');
    await page.getByTestId('goal-save').click();
    await expect(page.getByTestId('tree-list').or(page.getByTestId('mindmap'))).toContainText('興味のあることを探す');
  });

  test('N03 4段階以上の分解と表示順が再読み込み後も保持', async ({ page }) => {
    await seedV24(page);
    await page.goto('/#/compass/plan');
    const list = page.getByTestId('tree-list');
    await expect(list).toContainText('信頼される営業力を育てる');
    await page.reload();
    await expect(list.locator('.tree-title .t')).toHaveCount(10);
    const order = await list.locator('.tree-title .t').allTextContents();
    expect(order.slice(0, 5)).toEqual(['信頼される営業力を育てる', '不動産トスアップ1件', '紹介条件を把握する', '連携担当へ対象条件と必要情報を確認する', '見込み候補を整理する']);
  });

  test('N04/N31 子孫の配下へは移動できない（タップで操作）。元データ維持。移動は元に戻せる', async ({ page }) => {
    await seedV24(page);
    await openNode(page, 're_goal_month');
    await page.getByTestId('node-move').click();
    await expect(page.getByTestId('move-to-re_ms_conditions')).toContainText('子孫のため不可');
    await page.getByTestId('move-to-re_ms_conditions').click();
    await expect(page.getByTestId('node-sheet')).toContainText('自分の子孫の下には移動できません');
    await page.keyboard.press('Escape');
    // 正しい移動（キーボード／タップ）
    await openNode(page, 're_ms_consent');
    await page.getByTestId('node-move').click();
    await page.getByTestId('move-to-re_ms_conditions').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('undo-bar')).toBeVisible();
    await expect(page.getByTestId('row-re_ms_conditions')).toContainText('本人のニーズ・同意を確認する');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('row-re_ms_conditions')).not.toContainText('本人のニーズ・同意を確認する');
  });

  test('N04b iMac幅でマインドマップ表示、子ノード追加・折り畳みが再読み込み後も維持', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await seedV24(page);
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('mindmap')).toBeVisible();
    await expect(page.getByTestId('map-re_goal_month')).toContainText('紹介条件を把握する');
    await page.getByTestId('map-add-re_ms_handoff').click();
    await expect(page.getByTestId('map-re_ms_handoff').locator('li')).toHaveCount(2);
    await page.getByTestId('map-toggle-re_ms_candidates').click();
    await expect(page.getByTestId('map-re_ms_candidates')).not.toContainText('既存の接点から候補3人を洗い出す');
    await page.reload();
    await expect(page.getByTestId('mindmap')).toBeVisible();
    await expect(page.getByTestId('map-re_ms_handoff').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('map-re_ms_candidates')).not.toContainText('既存の接点から候補3人を洗い出す');
    await page.screenshot({ path: '../docs-screenshots/v24-imac-mindmap.png' });
  });

  test('N05 実行済みTODOをアーカイブ→復元しても記録・成果は消えない', async ({ page }) => {
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '11:00');
    await page.goto('/#/today/plan');
    await page.locator('[data-testid^="block-"]').first().click();
    await page.getByTestId('ex-start').click();
    await page.keyboard.press('Escape');
    await openNode(page, 're_ms_conditions');
    await page.getByTestId('node-archive').click();
    await expect(page.getByTestId('tree-list')).not.toContainText('紹介条件を把握する');
    await page.getByText(/アーカイブ（/).click();
    await page.getByTestId('restore-re_ms_conditions').click();
    await expect(page.getByTestId('tree-list')).toContainText('連携担当へ対象条件と必要情報を確認する');
    await page.goto('/#/today/plan');
    await expect(page.locator('[data-testid^="block-"]').first()).toContainText('実行中');
  });

  test('N07 ツリーと4象限は同じIDを共有し、変更が相互に反映', async ({ page }) => {
    await seedV24(page);
    await page.goto('/#/today/priority');
    await page.getByTestId('pcard-re_todo_conditions').click();
    await page.getByTestId('node-title').fill('連携担当へ条件を確認（改）');
    await page.getByTestId('node-save').click();
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('row-re_todo_conditions')).toContainText('連携担当へ条件を確認（改）');
  });

  test('N08/N09 重要4・緊急2は第2象限。期限が近くても評価は自動で変えない', async ({ page }) => {
    await seedV24(page, v24Backup((ep) => { ep.planNodes.find((n) => n.id === 're_todo_conditions')!.dueDate = '2026-11-11'; }));
    await page.goto('/#/today/priority');
    await expect(page.getByTestId('quad-2')).toContainText('連携担当へ対象条件と必要情報を確認する');
    await expect(page.getByTestId('pcard-re_todo_conditions')).toContainText('緊急度を見直しますか');
    await expect(page.getByTestId('pcard-re_todo_conditions')).toContainText('重要4・緊急2');
    // 未判定のTODOをドラッグで第1象限へ
    await page.getByTestId('pcard-re_todo_consent').dragTo(page.getByTestId('quad-1'));
    await expect(page.getByTestId('quad-1')).toContainText('相談を希望するか1人に確認する');
  });
});

test.describe('日モード・時間割', () => {
  test('N11 回復モードでは最重要行動を求めず、振り返りへ進める', async ({ page }) => {
    await seedV24(page);
    await page.getByTestId('mode-recover').click();
    await page.getByTestId('rest-save').click();
    await page.goto('/#/today/plan');
    await expect(page.getByTestId('sched-focus')).toContainText('回復する日');
    await expect(page.getByTestId('exec-rate')).toHaveText('—（評価対象なし）');
    await page.goto('/#/today');
    await page.getByTestId('btn-evening').click();
    await page.getByTestId('ev-save').click();
    await expect(page.getByTestId('evening-sheet')).toHaveCount(0);
  });

  test('N12/N13 7:00〜7:15と24:30〜25:00に配置。深夜は計画日11/10のまま翌01:00として表示', async ({ page }) => {
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '07:00');
    await placeAt(page, 're_todo_candidates', '24:30', { dur: '30' });
    await page.goto('/#/today/plan');
    await expect(page.getByTestId('sched-date')).toContainText('11月10日');
    const late = page.locator('[data-testid^="block-"]').filter({ hasText: '候補3人' });
    await expect(late).toContainText('24:30〜25:00（翌01:00）');
    await expect(page.locator('[data-testid^="block-"]').filter({ hasText: '連携担当' })).toContainText('07:00〜07:15');
  });

  test('N14 25:00開始・25:01終了は保存前に拒否し、データは変わらない', async ({ page }) => {
    await seedV24(page);
    await openNode(page, 're_todo_conditions');
    await page.getByTestId('node-to-schedule').click();
    await page.getByTestId('place-time').fill('25:00');
    await page.getByTestId('place-save').click();
    await expect(page.getByTestId('place-error')).toContainText('25:00より前');
    await page.getByTestId('place-time').fill('24:50');
    await page.getByTestId('place-dur').fill('11');
    await page.getByTestId('place-save').click();
    await expect(page.getByTestId('place-error')).toContainText('25:00（翌01:00）を超えています');
    await page.keyboard.press('Escape');
    await page.goto('/#/today/plan');
    await expect(page.locator('[data-testid^="block-"]')).toHaveCount(0);
  });

  test('N15 重複は警告し本人確認。無言で上書きしない', async ({ page }) => {
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '14:00');
    await openNode(page, 're_todo_candidates');
    await page.getByTestId('node-to-schedule').click();
    await page.getByTestId('place-time').fill('14:05');
    await page.getByTestId('place-save').click();
    await expect(page.getByTestId('overlap-confirm')).toContainText('連携担当へ対象条件と必要情報を確認する');
    await page.getByTestId('overlap-accept').click();
    await page.goto('/#/today/plan');
    await expect(page.locator('[data-testid^="block-"]')).toHaveCount(2);
  });

  test('N16/N19 開始→中断（理由別）→完了→再読み込みで維持。外的・内的・休息を別集計', async ({ page }) => {
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '10:00');
    await page.goto('/#/today/plan');
    const b = page.locator('[data-testid^="block-"]').first();
    for (const reason of ['外的中断（予定外の対応）', '内的切替（別のことをしたくなった）', '意図的な休息']) {
      await b.click();
      await page.getByTestId('ex-start').click();
      await page.getByTestId('ex-interrupt').click();
      await page.getByTestId('block-sheet').getByText(reason).click();
      await page.getByTestId('ex-interrupt-save').click();
      await page.keyboard.press('Escape');
    }
    await b.click();
    await page.getByTestId('ex-complete').click();
    await page.getByTestId('ex-complete-save').click();
    await expect(page.getByTestId('block-state')).toHaveText('完了');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(b).toContainText('完了');
    await page.goto('/#/review');
    await expect(page.getByTestId('plan-review')).toContainText('外的中断 1・内的切替 1・休息 1');
  });

  test('N17/N18 未着手を翌日へ延期（履歴が残り完了扱いしない）。操作なしの枠は未記録', async ({ page }) => {
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '10:00');
    await placeAt(page, 're_todo_consent', '16:00');
    await page.goto('/#/today/plan');
    await page.locator('[data-testid^="block-"]').filter({ hasText: '連携担当' }).click();
    await page.getByTestId('ex-move').click();
    await page.getByTestId('place-tomorrow').click();
    await page.getByTestId('place-reason').fill('突発対応のため');
    await page.getByTestId('place-save').click();
    await expect(page.getByTestId('sched-metrics')).toContainText('延期率 50%');
    await page.getByTestId('next-day').click();
    await expect(page.locator('[data-testid^="block-"]').filter({ hasText: '連携担当' })).toContainText('未記録');
    // 翌日：前日の未操作の枠は「未記録」のまま（未着手と推定しない）
    await page.clock.setFixedTime(new Date('2026-11-11T01:00:00Z'));
    await page.reload();
    await page.getByRole('button', { name: '前の日' }).click();
    await expect(page.locator('[data-testid^="block-"]').filter({ hasText: '相談を希望' })).toContainText('未記録');
    await expect(page.getByTestId('carry-over')).toBeVisible();
  });

  test('N20/N21 IF→THENは提案のみ。未承認なら予定は変わらず、確定の2回押しでも1件', async ({ page }) => {
    await seedV24(page);
    await page.goto('/#/today/plan');
    await page.getByTestId('btn-ifthen').click();
    await page.getByTestId('ifthen-sheet').getByText('予定がキャンセルになった').click();
    await expect(page.getByTestId('ift-suggestions')).toContainText('連携担当へ対象条件と必要情報を確認する');
    await page.getByTestId('ift-dismiss').click();
    await expect(page.locator('[data-testid^="block-"]')).toHaveCount(0);
    await page.getByTestId('btn-ifthen').click();
    await page.getByTestId('ifthen-sheet').getByText('予定がキャンセルになった').click();
    await page.getByTestId('ift-pick-re_todo_conditions').check();
    await page.getByTestId('ift-time').fill('11:00');
    await page.getByTestId('ift-accept').evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    await expect(page.getByTestId('ifthen-sheet')).toHaveCount(0);
    await expect(page.locator('[data-testid^="block-"]')).toHaveCount(1);
  });

  test('N22/N23/N34 準備TODOの完了で成果は増えない。成果は手動・根拠つき。再オープン→再完了で重複計上しない', async ({ page }) => {
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '10:00');
    await page.goto('/#/today/plan');
    const b = page.locator('[data-testid^="block-"]').first();
    await b.click();
    await page.getByTestId('ex-complete').click();
    await page.getByTestId('ex-complete-save').click();
    await page.getByTestId('ex-reopen').click();
    await expect(page.getByTestId('block-state')).toHaveText('実行中');
    await page.getByTestId('ex-complete').click();
    await page.getByTestId('ex-complete-save').click();
    await expect(page.getByTestId('block-sheet')).toContainText('（再オープン）');
    await page.keyboard.press('Escape');
    await page.goto('/#/growth');
    await expect(page.getByTestId('go-re_goal_month')).toContainText('TODO 1/4件 完了');
    await expect(page.getByTestId('go-outcome-re_goal_month')).toHaveText('記録なし');
    await page.getByTestId('add-outcome-re_goal_month').click();
    await page.getByTestId('outcome-value').fill('1');
    await page.getByTestId('outcome-evidence').fill('連携先から受領確認');
    await page.getByTestId('outcome-save').click();
    await expect(page.getByTestId('go-outcome-re_goal_month')).toContainText('1件の記録');
    await expect(page.getByTestId('go-re_goal_month')).toContainText('TODO 1/4件 完了');
  });

  test('N24 延期が続いたTODOに改善候補（分割・時間変更・依存・重要性見直し）', async ({ page }) => {
    await seedV24(page);
    await placeAt(page, 're_todo_candidates', '10:00');
    for (let i = 0; i < 2; i++) {
      await page.goto('/#/today/plan');
      await page.locator('[data-testid^="block-"]').filter({ hasText: '候補3人' }).first().click();
      await page.getByTestId('ex-move').click();
      await page.getByTestId('place-time').fill(i ? '15:00' : '13:00');
      await page.getByTestId('place-save').click();
    }
    await page.goto('/#/review');
    const s = page.getByTestId('stuck-re_todo_candidates');
    await expect(s).toContainText('2回延期');
    for (const t of ['分割し直す', '時間帯を変える', '依存関係を解消する', 'そもそも重要か見直す']) await expect(s).toContainText(t);
  });
});

test.describe('データ・オフライン・プライバシー', () => {
  test('N25 オフラインで作成・編集・完了し、再起動しても失われない', async ({ page, context }) => {
    await seedV24(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await openNode(page, 're_ms_consent');
    await page.getByTestId('deep-2').fill('オフラインで追加したTODO');
    await page.getByTestId('deep-add-2').click();
    await page.getByTestId('node-save').click();
    await placeAt(page, 're_todo_conditions', '10:00');
    await page.goto('/#/today/plan');
    await page.locator('[data-testid^="block-"]').first().click();
    await page.getByTestId('ex-complete').click();
    await page.getByTestId('ex-complete-save').click();
    await expect(page.getByTestId('block-state')).toHaveText('完了');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('[data-testid^="block-"]').first()).toContainText('完了');
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('tree-list')).toContainText('オフラインで追加したTODO');
    await context.setOffline(false);
  });

  test('N26/N27 v2.3＋追加領域をJSONに出力→同じファイルを2回マージしても重複なし', async ({ page }, info) => {
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '10:00');
    await page.goto('/#/settings');
    await expect(page.getByTestId('no-sync-note')).toContainText('自動では同期されません');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-backup').click()]);
    const p = info.outputPath('b.json');
    await dl.saveAs(p);
    const text = (await import('node:fs')).readFileSync(p, 'utf8');
    const json = JSON.parse(text);
    expect(json.schemaVersion).toBe('2.1');
    expect(json.featureVersion).toBe('2.4');
    expect(json.executionPlanning.scheduleBlocks).toHaveLength(1);
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('restore-input').setInputFiles(asFile('b.json', text));
      await expect(page.getByTestId('restore-planning-summary')).toContainText('ノード 10件／予定枠 1件');
      await page.getByTestId('restore-preview').getByText(/追加マージ：/).click();
      await page.getByTestId('restore-confirm').click();
      await expect(page.getByTestId('restore-report')).toContainText('追加 0件');
      await expect(page.getByTestId('restore-report')).toContainText('競合 0件');
    }
    await expect(page.getByTestId('download-snapshot')).toBeVisible();
    await page.goto('/#/today/plan');
    await expect(page.locator('[data-testid^="block-"]')).toHaveCount(1);
  });

  test('N28/N29 破損JSONは検証エラーで元データ不変。v2.3バックアップは空の追加領域で取り込み', async ({ page }) => {
    await seedV24(page);
    await page.goto('/#/settings');
    const bad = JSON.parse(v24Backup());
    bad.executionPlanning.planNodes[1].parentId = bad.executionPlanning.planNodes[1].id;
    await page.getByTestId('restore-input').setInputFiles(asFile('bad.json', JSON.stringify(bad)));
    await expect(page.getByTestId('restore-error')).toContainText('整合性エラー');
    await page.getByTestId('restore-input').setInputFiles(asFile('bad2.json', '{"schemaVersion":"2.1","executionPlanning":'));
    await expect(page.getByTestId('restore-error')).toContainText('JSONとして読み込めませんでした');
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('tree-list')).toContainText('信頼される営業力を育てる');
    const fs = await import('node:fs');
    const v23 = fs.readFileSync('../spec/SAMPLE_FIXTURE.json', 'utf8');
    await page.goto('/#/settings');
    await page.getByTestId('restore-input').setInputFiles(asFile('v23.json', v23));
    await expect(page.getByTestId('restore-planning-summary')).toContainText('含まれていません');
    await page.getByTestId('restore-confirm').click();
    await expect(page.getByTestId('today')).toBeVisible();
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('tree-empty')).toBeVisible();
    await page.goto('/#/compass');
    await expect(page.getByTestId('compass')).toContainText('人の可能性を引き出す');
  });

  test('N32 主要フローで外部へのリクエストがない', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external.push(r.url()); });
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '10:00');
    await page.goto('/#/today/priority');
    await page.goto('/#/today/plan');
    await page.locator('[data-testid^="block-"]').first().click();
    await page.getByTestId('ex-start').click();
    await page.goto('/#/growth');
    expect(external).toEqual([]);
  });

  test('N33 約500ノード・200予定枠でツリー・検索・予定表示がフリーズしない（実測）', async ({ page }) => {
    test.setTimeout(120_000);
    const text = v24Backup((ep) => {
      const base = ep.planNodes[3];
      for (let g = 0; g < 10; g++) {
        ep.planNodes.push({ ...ep.planNodes[0], id: `pg${g}`, title: `大量目標${g}`, sourceAnchorId: null, collapsed: g > 0 });
        for (let a = 0; a < 49; a++) ep.planNodes.push({ ...base, id: `pg${g}a${a}`, parentId: `pg${g}`, order: a, title: `大量TODO ${g}-${a}`, dependsOn: [] });
      }
      for (let i = 0; i < 200; i++) ep.scheduleBlocks.push({ id: `pb${i}`, planDate: i < 40 ? '2026-11-10' : `2026-11-${String(11 + (i % 15)).padStart(2, '0')}`, actionId: `pg${i % 10}a${i % 49}`, startMinute: 420 + (i % 40) * 25, durationMinutes: 20, state: 'placed', movedFromBlockId: null, movedToBlockId: null, moveReason: null, overlapConfirmed: false, createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z' });
    });
    const t0 = Date.now();
    await seedV24(page, text);
    const tImport = Date.now() - t0;
    const t1 = Date.now();
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('row-pg0a48')).toBeVisible();
    const tTree = Date.now() - t1;
    const t2 = Date.now();
    await page.getByTestId('tree-search').fill('大量TODO 9-48');
    await expect(page.getByTestId('search-results')).toContainText('大量TODO 9-48');
    const tSearch = Date.now() - t2;
    const t3 = Date.now();
    await page.goto('/#/today/plan');
    await expect(page.locator('[data-testid^="block-pb"]')).toHaveCount(40);
    const tSched = Date.now() - t3;
    console.log(`[N33] 510ノード・200予定枠（Chromium/Pixel 7相当・vite preview）：復元 ${tImport}ms／ツリー表示 ${tTree}ms／検索 ${tSearch}ms／時間割 ${tSched}ms`);
    expect(tTree).toBeLessThan(5000);
    expect(tSched).toBeLessThan(5000);
  });

  test('N30 iPhone幅の主要画面（端末間自動同期がないことを明示）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedV24(page);
    await placeAt(page, 're_todo_conditions', '14:00');
    await placeAt(page, 're_todo_candidates', '15:00');
    for (const [h, n] of [['#/compass/plan', 'v24-iphone-tree'], ['#/today/priority', 'v24-iphone-priority'], ['#/today/plan', 'v24-iphone-schedule']] as const) {
      await page.goto(`/${h}`);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, h).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `../docs-screenshots/${n}.png` });
    }
    await expect(page.getByTestId('timeline')).toBeVisible();
    await page.goto('/#/compass/plan');
    await expect(page.getByTestId('plantree')).toContainText('自動同期はされません');
  });
});

test('R01〜R05の補足：v2.4追加後も「今日」の主役は最重要行動1件（時間割の入口はその下）', async ({ page }) => {
  await seedV24(page);
  const action = await page.getByTestId('sched-focus').count();
  expect(action).toBe(0);
  const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
  await page.getByTestId('same-as-before').or(page.getByTestId('set-plan')).first().waitFor();
  expect(await y('today-plan-link')).toBeGreaterThan(await y('mode-switch'));
  await expect(page.getByTestId('tab-today')).toBeVisible();
  await expect(page.locator('.tabbar li')).toHaveCount(4);
  void PLAN_DATE;
});
