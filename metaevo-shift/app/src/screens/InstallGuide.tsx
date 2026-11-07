import { useEffect, useState } from 'react';
import { getInstallPrompt, installContext, onInstallPromptChange } from '../ui/platform';

/** インストール導線：iPhoneはSafariとホーム画面版で保存領域が異なり得る */
export function InstallGuide(props: { compact?: boolean }) {
  const ctx = installContext();
  const [, force] = useState(0);
  useEffect(() => onInstallPromptChange(() => force((n) => n + 1)), []);
  const prompt = getInstallPrompt();

  if (ctx === 'ios-pwa' || ctx === 'standalone') {
    return (
      <div className="banner info" data-testid="install-ok">
        ✓ アプリ版（ホーム画面から起動）で開いています。この画面で入力したデータは、この端末のアプリ版の中に保存されます。
      </div>
    );
  }

  if (ctx === 'ios-safari') {
    return (
      <div className="card" data-testid="install-ios">
        <div className="eyebrow">iPhone / iPad の方へ・最初に必ずお読みください</div>
        <h2>初回入力の前に、ホーム画面に追加してアプリ版を開いてください</h2>
        <p className="muted">iPhoneでは、<strong>Safariで開いた画面</strong>と<strong>ホーム画面に追加したアプリ版</strong>で、保存される場所が別になることがあります。Safariで入力した回答は、アプリ版には自動で引き継がれません。</p>
        <ol className="steps">
          <li>画面下（iPadは上）の <strong>共有ボタン</strong>（□に↑のマーク）をタップ</li>
          <li><strong>「ホーム画面に追加」</strong>を選び、右上の「追加」をタップ</li>
          <li>Safariを閉じ、ホーム画面の <strong>MetaEVO Shift</strong> アイコンから開く</li>
          <li>アプリ版で「初回ワークを始める」をタップ</li>
        </ol>
        {!props.compact && (
          <div className="banner warn" style={{ marginTop: 12 }}>
            Safariのまま使う場合：データはSafari側にだけ保存されます。あとでアプリ版に移すときは「設定 → バックアップを保存」→ アプリ版で「バックアップから復元」を行ってください。こまめなバックアップをおすすめします。
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card" data-testid="install-browser">
      <div className="eyebrow">インストールのおすすめ</div>
      <h2>ホーム画面（アプリ）として追加できます</h2>
      <p className="muted">アプリとして追加すると、オフラインでも開きやすくなります。データはこの端末のこのブラウザーの中だけに保存されます。</p>
      {prompt ? (
        <button className="btn cyan block" onClick={async () => { await prompt.prompt(); force((n) => n + 1); }}>アプリとしてインストール</button>
      ) : (
        <p className="small faint">Android Chrome：メニュー（⋮）→「アプリをインストール」または「ホーム画面に追加」。PC Chrome/Edge：アドレスバー右のインストールアイコン。</p>
      )}
    </div>
  );
}
