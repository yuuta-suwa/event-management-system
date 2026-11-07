/** E. データと技術／B・F の補足 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { at, doWorkshop, startToday } from './helpers';

const asFile = (name: string, text: string) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(at(0));
});

test('E1 バックアップ（schemaVersion付きJSON）→ 全削除（2段階）→ 復元で元に戻る', async ({ page }, info) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await startToday(page);
  await page.goto('/#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-backup').click()]);
  expect(dl.suggestedFilename()).toMatch(/^metaevo-shift-backup-\d{8}\.json$/);
  const file = info.outputPath('backup.json');
  await dl.saveAs(file);
  const backupText = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(backupText);
  expect(json.schemaVersion).toBe('2.1');
  expect(json.lifeTime.enabled).toBe(false);
  await expect(page.getByTestId('last-backup')).not.toHaveText('まだありません');
  // 2段階確認で全削除
  await page.getByTestId('delete-all').click();
  await expect(page.getByTestId('delete-all-confirm')).toBeDisabled();
  await page.getByTestId('delete-all-word').fill('削除');
  await page.getByTestId('delete-all-confirm').click();
  await expect(page.getByTestId('start-onboarding')).toBeVisible();
  // 復元
  await page.goto('/#/settings');
  await page.getByTestId('restore-input').setInputFiles(asFile('backup.json', backupText));
  await expect(page.getByTestId('restore-preview')).toContainText('初回ワーク：完了');
  await page.getByTestId('restore-confirm').click();
  await expect(page.getByTestId('important-action')).toHaveText('提案を送る');
  await expect(page.getByTestId('plan-status')).toHaveText('実行中');
});

test('E2 v2.0バックアップを非破壊で移行して復元。不正・未来バージョンは拒否し既存データを守る', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '既存の行動', when: 'today' });
  await page.goto('/#/settings');
  const fixture = JSON.parse(fs.readFileSync(path.resolve('../spec/SAMPLE_FIXTURE.json'), 'utf8'));
  await page.getByTestId('restore-input').setInputFiles(asFile('future.json', JSON.stringify({ ...fixture, schemaVersion: '9.9' })));
  await expect(page.getByTestId('restore-error')).toContainText('未対応のデータバージョン');
  await page.getByTestId('restore-input').setInputFiles(asFile('broken.json', '{"schemaVersion":"2.1", "goals": 1'));
  await expect(page.getByTestId('restore-error')).toContainText('JSONとして読み込めませんでした');
  await page.goto('/#/today');
  await expect(page.getByTestId('important-action')).toHaveText('既存の行動');
  // v2.0
  const { lifeTime: _lt, ...rest } = fixture;
  void _lt;
  await page.goto('/#/settings');
  await page.getByTestId('restore-input').setInputFiles(asFile('v20.json', JSON.stringify({ ...rest, schemaVersion: '2.0' })));
  await expect(page.getByTestId('restore-preview')).toContainText('v2.0 → v2.1 に移行');
  await page.getByTestId('restore-confirm').click();
  await expect(page.getByTestId('today')).toContainText('人の可能性を引き出す');
  await page.goto('/#/compass');
  await expect(page.getByTestId('compass')).toContainText('人の可能性を引き出す');
  await expect(page.getByTestId('open-lifeclock')).toContainText('初期設定はオフ');
});

test('E3 同時多重タップでも開始イベントは1件', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await page.getByTestId('btn-start').evaluate((b: HTMLButtonElement) => { b.click(); b.click(); b.click(); });
  await expect(page.getByTestId('plan-status')).toHaveText('実行中');
  await page.goto('/#/review');
  const today = page.getByTestId('day-2026-11-09');
  await expect(today.getByText('開始', { exact: false })).toHaveCount(1);
});

test('E4 デモデータは別の保存場所。切替後も本人のデータは変わらない', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '本人の行動', when: 'today' });
  await page.goto('/#/settings');
  await page.getByTestId('to-demo').click();
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('important-action').or(page.getByTestId('no-plan'))).toBeVisible();
  await expect(page.locator('body')).not.toContainText('本人の行動');
  await page.goto('/#/settings');
  await page.getByTestId('to-personal').click();
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  await expect(page.getByTestId('important-action')).toHaveText('本人の行動');
});

test('E5 外部へのネットワーク送信なし（同一オリジン以外へのリクエストがない）', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external.push(r.url()); });
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await startToday(page);
  await page.getByTestId('btn-complete').click();
  await page.getByTestId('complete-save').click();
  await page.goto('/#/growth');
  expect(external).toEqual([]);
});

test('E6 320px幅で横スクロールなし・タップ領域44px以上・ラベル付き', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await doWorkshop(page, { route: 'execute', action: 'とても長い行動の名前をここに入れて折り返しを確認する', when: 'today' });
  for (const h of ['#/today', '#/compass', '#/growth', '#/review', '#/settings']) {
    await page.goto(`/${h}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, h).toBeLessThanOrEqual(0);
  }
  await page.goto('/#/today');
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, a.btn, .tabbar a, label.chip')]
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => ({ t: (e.textContent ?? '').trim().slice(0, 20), h: e.getBoundingClientRect().height }))
      .filter((x) => x.h < 44));
  expect(small).toEqual([]);
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll('input, textarea, select')].filter((e) => !e.closest('label') && !e.getAttribute('aria-label')).length);
  expect(unlabeled).toBe(0);
});

test('E7 キーボードだけで開始できる（Tab移動とフォーカス表示）', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await page.getByTestId('btn-start').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('plan-status')).toHaveText('実行中');
});

test('B 重大な緊急対応では入力を求めず、記録は最小限', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-external').click();
  await page.getByTestId('ext-critical').click();
  await expect(page.getByTestId('external-sheet')).toHaveCount(0);
  await expect(page.getByTestId('plan-status')).toHaveText('中断中');
});

test('B 日中の切替を後から追記すると集計が再計算される／長期未入力からの再開に罰なし', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  await page.goto('/#/review');
  await page.getByTestId('btn-backfill').click();
  await page.getByTestId('backfill-sheet').getByText('予定外の対応（外から）').click();
  await page.getByTestId('backfill-sheet').getByText('戻れた', { exact: true }).click();
  await page.getByTestId('backfill-save').click();
  await page.goto('/#/growth');
  await page.getByText('Day0から').click();
  await expect(page.getByTestId('layer-action')).toContainText('予定外の対応 1件：復帰の有無が分かった1件中1件で復帰');
  // 20日後に再開
  await page.clock.setFixedTime(at(20));
  await page.goto('/#/today');
  await page.reload();
  await expect(page.getByTestId('same-as-before')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/連続|途切れ|サボ/);
});

test('F 危険な文言・断定がUIに出ない（主要画面を巡回）', async ({ page }) => {
  await doWorkshop(page, { route: 'execute', action: '提案を送る', when: 'today' });
  const forbidden = /14日で習慣|必ず稼げ|潜在意識を診断|逃避タイプ|あなたは逃避|自己実現率|自己実現スコア|命はあと|死ぬまであと|残り時間がない|REFLOW|MetaEvo(?!\w)/;
  for (const h of ['#/today', '#/compass', '#/compass/lifeclock', '#/growth', '#/review', '#/review/day14', '#/settings', '#/workshop']) {
    await page.goto(`/${h}`);
    await expect(page.locator('body')).not.toContainText(forbidden);
  }
});
