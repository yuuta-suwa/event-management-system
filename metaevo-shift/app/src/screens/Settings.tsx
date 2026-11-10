import { useEffect, useState } from 'react';
import { useApp } from '../state';
import * as repo from '../db/repo';
import { downloadBackup, downloadPreImportSnapshot, getPreImportSnapshot, restoreValidated, validateBackupText, type RestoreMode, type RestoreReport } from '../db/backup';
import { seedDemo } from '../db/demo';
import { setDataMode } from '../db/db';
import { localDateOf } from '../domain/dates';
import type { ImportResult } from '../domain/migration';
import { AsyncButton, Choice, ConfirmTwoStep } from '../ui/kit';
import { requestPersistentStorage } from '../ui/platform';
import { InstallGuide } from './InstallGuide';
import brand from '../spec/BRAND_CONFIG.json';

export function Settings() {
  const app = useApp();
  const { data, mode } = app;
  const [pending, setPending] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace');
  const [lastReport, setLastReport] = useState<RestoreReport | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  useEffect(() => { getPreImportSnapshot().then((s) => setSnapshotAt(s?.savedAt ?? null)).catch(() => undefined); }, [lastReport]);
  const [importError, setImportError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);
  const isDemo = mode === 'demo';

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => e.usage !== undefined && setEstimate(`${Math.round((e.usage ?? 0) / 1024)}KB`)).catch(() => undefined);
  }, []);

  const switchMode = (m: 'personal' | 'demo') => {
    setDataMode(m);
    location.hash = '#/today';
    location.reload();
  };

  return (
    <div data-testid="settings">
      <h1>設定・データ</h1>

      <section className="card" aria-labelledby="backup-h">
        <h2 id="backup-h">バックアップ（JSON）</h2>
        <p className="small muted">記録はこの端末の中だけにあります。端末の故障・データ消去・機種変更に備えて、ファイルとして保存してください。</p>
        <p className="small">最終バックアップ：<strong data-testid="last-backup">{data.preferences.lastBackupAt ? localDateOf(data.preferences.lastBackupAt, app.tz) : 'まだありません'}</strong></p>
        <div className="btnrow">
          <AsyncButton className="btn primary" testId="btn-backup" onClick={async () => { const n = await downloadBackup(isDemo); app.toast(`${n} を保存しました。`); }}>バックアップを保存</AsyncButton>
          {'share' in navigator && <AsyncButton className="btn" onClick={async () => { try { await downloadBackup(isDemo, true); } catch { /* 共有キャンセル */ } }}>共有シートで保存</AsyncButton>}
        </div>
        <p className="small banner info" data-testid="no-sync-note">iMacとiPhoneなど、端末どうしのデータは自動では同期されません。別の端末で使うときは、この端末で「バックアップを保存」し、もう一方の端末で「復元」してください（追加マージも選べます）。</p>
        <p className="small faint">ファイルは暗号化されていません。願望・感情などの非公開の内容を含むため、保存先（共有フォルダ・メール添付など）に注意してください。</p>
      </section>

      <section className="card" aria-labelledby="restore-h">
        <h2 id="restore-h">バックアップから復元</h2>
        <p className="small muted">MetaEVO Shiftのバックアップ（v2.0 / v2.1）を読み込みます。内容とバージョンを確認してから置き換えます。v2.0は記録を変えずにv2.1へ移行し、人生の時間は無効状態になります。</p>
        <label className="btn block" style={{ cursor: 'pointer' }}>
          ファイルを選ぶ
          <input type="file" accept="application/json,.json" className="sr-only" data-testid="restore-input" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setImportError(null);
            const r = validateBackupText(await f.text(), f.size);
            if (r.ok) setPending(r);
            else { setPending(null); setImportError(r.error); }
          }} />
        </label>
        {importError && <p className="banner warn" role="alert" data-testid="restore-error">{importError}<br /><span className="small">現在の端末データは変更していません。</span></p>}
        {pending && (
          <div className="card flat" data-testid="restore-preview">
            <p><strong>読み込める内容を確認しました{pending.migratedFrom ? '（v2.0 → v2.1 に移行）' : ''}</strong></p>
            <p className="small">初回ワーク：{pending.summary.workshopStatus === 'completed' ? '完了' : pending.summary.workshopStatus === 'in_progress' ? '途中' : '未開始'}／目標 {pending.summary.goals}件／日々の計画 {pending.summary.dayPlans}件／記録 {pending.summary.events}件／証拠 {pending.summary.evidence}件／レビュー {pending.summary.reviews}件</p>
            <p className="small" data-testid="restore-planning-summary">行動計画（v2.4）：{pending.hadExecutionPlanning ? `ノード ${pending.summary.planNodes}件／予定枠 ${pending.summary.scheduleBlocks}件／実行記録 ${pending.summary.executionEvents}件／成果 ${pending.summary.outcomeRecords}件` : 'このファイルには含まれていません（空の領域として初期化します）'}</p>
            {pending.integrity.warnings.length > 0 && <p className="small banner info">注意：{pending.integrity.warnings[0]}{pending.integrity.warnings.length > 1 ? ` ほか${pending.integrity.warnings.length - 1}件` : ''}</p>}
            <Choice legend="復元のしかた" column options={[{ value: 'replace', label: '全置換：端末のデータを読み込んだ内容で置き換える' }, { value: 'merge', label: '追加マージ：端末のデータを残し、ないものだけ追加する（同じ記録は重複しません）' }]} value={restoreMode} onChange={(v) => setRestoreMode(v as RestoreMode)} />
            <p className="small banner warn">{restoreMode === 'replace' ? 'この端末の現在のデータは、読み込んだ内容で置き換わります。' : '同じIDで内容が違う記録は、端末側を残して「競合」として報告します。'}直前の状態は自動で端末内に退避され、あとから保存できます。</p>
            <div className="btnrow">
              <button className="btn ghost" onClick={() => setPending(null)}>やめる</button>
              <AsyncButton className="btn primary" testId="restore-confirm" onClick={async () => {
                try {
                  const rep = await restoreValidated(pending, restoreMode);
                  setPending(null);
                  setLastReport(rep);
                  app.toast(rep.mode === 'merge' ? `追加マージしました（追加 ${rep.added}件・同一 ${rep.identical}件・競合 ${rep.conflicts.length}件）` : '復元しました。');
                  if (rep.mode === 'replace') app.navigate({ name: 'today' });
                } catch {
                  setImportError('復元中にエラーが起きたため中止しました。現在の端末データは変更していません。');
                  setPending(null);
                }
              }}>{restoreMode === 'replace' ? '置き換えて復元する' : '追加マージする'}</AsyncButton>
            </div>
          </div>
        )}
        {lastReport && (
          <p className="small banner info" data-testid="restore-report">{lastReport.mode === 'merge' ? '追加マージ' : '全置換'}の結果：追加 {lastReport.added}件・既にあった同一の記録 {lastReport.identical}件・競合 {lastReport.conflicts.length}件{lastReport.conflicts.length ? `（端末側を残しました：${lastReport.conflicts.slice(0, 3).map((c) => c.id).join('、')}${lastReport.conflicts.length > 3 ? ' ほか' : ''}）` : ''}</p>
        )}
        {snapshotAt && (
          <AsyncButton className="btn sm ghost" testId="download-snapshot" onClick={async () => { await downloadPreImportSnapshot(); }}>直前（{localDateOf(snapshotAt, app.tz)}）の復元前の状態を保存</AsyncButton>
        )}
      </section>

      <section className="card">
        <h2>端末の保存領域</h2>
        <p className="small">ブラウザーによる自動削除の防止：<strong>{persisted === true ? '許可されています' : persisted === false ? '未許可' : '確認できません'}</strong>{estimate ? `（使用量 約${estimate}）` : ''}</p>
        {persisted !== true && <AsyncButton className="btn sm" onClick={async () => setPersisted(await requestPersistentStorage())}>保存の維持をリクエスト</AsyncButton>}
        <InstallGuide compact />
      </section>

      <section className="card">
        <h2>表示</h2>
        <Choice legend="テーマ" options={[{ value: 'dark', label: '濃紺（標準）' }, { value: 'light', label: '明るい' }, { value: 'system', label: '端末に合わせる' }]} value={data.preferences.displayTheme ?? 'dark'} onChange={(v) => repo.updatePreferences({ displayTheme: v as 'dark' })} />
        <p className="small faint">日付の基準：{data.preferences.timeZone}</p>
      </section>

      <section className="card" data-testid="data-mode">
        <h2>デモ・テスト用データ</h2>
        <p className="small muted">講師の画面投影や動作確認には、本人のデータとは<strong>別の保存場所</strong>にある架空のデモデータを使います。切り替えても本人のデータは変更されません。</p>
        {isDemo ? (
          <>
            <p className="banner demo">現在：デモデータを表示中（本人のデータではありません）</p>
            <div className="btnrow">
              <AsyncButton className="btn" testId="demo-reseed" onClick={async () => { await seedDemo(); app.toast('デモデータを入れ直しました。'); }}>デモデータを入れ直す</AsyncButton>
              <button className="btn primary" onClick={() => switchMode('personal')} data-testid="to-personal">本人のデータに戻る</button>
            </div>
          </>
        ) : (
          <button className="btn" data-testid="to-demo" onClick={() => switchMode('demo')}>デモ表示に切り替える</button>
        )}
      </section>

      <section className="card">
        <h2>プライバシー</h2>
        <ul className="small muted">
          <li>ログイン・アカウント・サーバー保存はありません。記録は外部（AIサービスを含む）へ送信しません。解析ツールも使っていません。</li>
          <li>講師・メンターを含め、他の人があなたの記録を閲覧する機能はありません。</li>
          <li>将来のAIメンター's会議室との連携は未実装です。導入する場合も、本人が選んだ要約だけを、内容を確認・同意した上で共有する設計にします（人生の時間・感情・非公開の願望は既定で除外）。</li>
        </ul>
      </section>

      <section className="card">
        <h2>{isDemo ? 'デモデータの削除' : 'この端末のデータをすべて削除'}</h2>
        <p className="small muted">人生の時間だけを削除する場合は「人生の軸 → 人生の時間」から行えます。</p>
        <ConfirmTwoStep
          testId="delete-all"
          label={isDemo ? 'デモデータをすべて削除' : 'すべての記録を削除する'}
          warning="初回ワーク・人生の軸・日々の記録・レビュー・人生の時間がこの端末から消えます。元に戻せません。"
          requireWord="削除"
          confirmLabel="完全に削除する"
          onConfirm={async () => { await repo.deleteAllData(); app.toast('削除しました。'); app.navigate({ name: 'welcome' }); }}
        />
      </section>

      <p className="small faint" style={{ textAlign: 'center' }}>{brand.fullDisplayName}<br />v{brand.productSpecVersion}（データ形式 {brand.dataSchemaVersion}）／自己改善のための道具であり、医療・診断・効果の保証ではありません。</p>
    </div>
  );
}
