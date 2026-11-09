import { useApp } from '../state';
import { updateAppMeta } from '../db/repo';
import { requestPersistentStorage } from '../ui/platform';
import { Ico } from '../ui/kit';
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
      <section className="welcome-hero" aria-labelledby="welcome-h">
        <div className="orbit" aria-hidden="true"><img src="./icon.svg" alt="" /></div>
        <h1 id="welcome-h" className="wordmark"><span className="brand-name">{brand.brand}</span></h1>
        <p className="tagline">{brand.tagline}</p>
        <p className="reading">{brand.reading}</p>
        <p className="lead">人に見せるための目標ではなく、あなたが生きたい人生のための選択を。今日は正解を探さず、実際に試す一歩を決めましょう。</p>
      </section>

      <div className="promises">
        <div className="promise">{Ico.lock}<b>あなただけ</b>端末の中だけ</div>
        <div className="promise">{Ico.seed}<b>仮のままで</b>決めなくていい</div>
        <div className="promise">{Ico.moonRest}<b>休むのも選択</b>回復も大切に</div>
      </div>

      <InstallGuide />

      <section className="card" aria-labelledby="privacy-h">
        <div className="eyebrow">始める前に</div>
        <h2 id="privacy-h">あなたの記録は、あなたの端末の中だけに</h2>
        <ul className="privacy-rows">
          <li>{Ico.device}<span>ログインはありません。回答・記録はこの端末の中（ブラウザー内の保存領域）だけに保存され、サーバーやAIへ送信されません。</span></li>
          <li>{Ico.shield}<span>講師・メンターを含め、他の人があなたの記録を見ることはできません。公開や共有の機能もありません。</span></li>
          <li>{Ico.save}<span>端末の故障・データ消去・ブラウザーの設定で記録が消えることがあります。<strong>「設定 → バックアップを保存」</strong>で定期的にファイルを保存してください（ファイルは暗号化されないため、保存先に注意してください）。</span></li>
          <li>{Ico.cue}<span>通知が自動で届く保証はありません。朝・夜にご自身でアプリを開いてください。</span></li>
          <li>{Ico.heart}<span>このアプリは自己改善のための道具です。医療・心理療法・診断ではなく、効果を保証するものでもありません。</span></li>
        </ul>
      </section>

      <button className="linkbtn" onClick={async () => { await updateAppMeta({ onboardingDone: true }); navigate({ name: 'settings' }); }}>
        バックアップから復元する
      </button>

      <div className="sticky-cta">
        <button className="btn primary xl block" onClick={begin} data-testid="start-onboarding">初回ワークを始める</button>
        <p className="small faint" style={{ textAlign: 'center', margin: '8px 0 0' }}>すべての質問はスキップ・途中保存できます。</p>
      </div>
    </div>
  );
}
