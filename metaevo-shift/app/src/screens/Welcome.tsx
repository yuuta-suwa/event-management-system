import { useApp } from '../state';
import { updateAppMeta } from '../db/repo';
import { requestPersistentStorage } from '../ui/platform';
import { InstallGuide } from './InstallGuide';
import brand from '../spec/BRAND_CONFIG.json';

export function Welcome() {
  const { navigate } = useApp();
  const begin = async () => {
    await requestPersistentStorage();
    await updateAppMeta({ onboardingDone: true });
    navigate({ name: 'workshop' });
  };
  return (
    <div>
      <div className="hero-brand">
        <img src="./icon.svg" alt="" />
        <h1><span className="brand-name">{brand.brand}</span><br /><span style={{ fontSize: '1.05rem' }}>｜{brand.tagline}｜</span></h1>
        <p className="muted">{brand.reading}</p>
      </div>
      <InstallGuide />
      <div className="card">
        <div className="eyebrow">始める前に</div>
        <h2>あなたの記録は、あなたの端末の中だけに</h2>
        <ul>
          <li>ログインはありません。回答・記録はこの端末の中（ブラウザー内の保存領域）だけに保存され、サーバーやAIへ送信されません。</li>
          <li>講師・メンターを含め、他の人があなたの記録を見ることはできません。公開や共有の機能もありません。</li>
          <li>端末の故障・データ消去・ブラウザーの設定で記録が消えることがあります。<strong>「設定 → バックアップを保存」</strong>で定期的にファイルを保存してください（ファイルは暗号化されないため、保存先に注意してください）。</li>
          <li>通知が自動で届く保証はありません。朝・夜にご自身でアプリを開いてください。</li>
          <li>このアプリは自己改善のための道具です。医療・心理療法・診断ではなく、効果を保証するものでもありません。</li>
        </ul>
      </div>
      <button className="btn primary xl block" onClick={begin} data-testid="start-onboarding">初回ワークを始める</button>
      <p className="small faint" style={{ textAlign: 'center', marginTop: 10 }}>すべての質問はスキップ・途中保存できます。</p>
      <button className="linkbtn" onClick={async () => { await updateAppMeta({ onboardingDone: true }); navigate({ name: 'settings' }); }}>
        バックアップから復元する
      </button>
    </div>
  );
}
