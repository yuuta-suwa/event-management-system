import { useEffect, useState } from 'react';
import { AppProvider, useApp, type Route } from './state';
import { ensureInitialized, loadAll } from './db/repo';
import { getDataMode } from './db/db';
import { seedDemo } from './db/demo';
import { icons, Toast, useOnline } from './ui/kit';
import { Welcome } from './screens/Welcome';
import { Workshop } from './screens/Workshop';
import { Today } from './screens/Today';
import { Compass } from './screens/Compass';
import { LifeClock } from './screens/LifeClock';
import { Growth } from './screens/Growth';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import brand from './spec/BRAND_CONFIG.json';
import { cycleDay } from './domain/reviews';

const TABS = [
  { name: 'today', label: '今日', href: '#/today', icon: icons.today, match: ['today'] },
  { name: 'compass', label: '人生の軸', href: '#/compass', icon: icons.compass, match: ['compass', 'lifeclock'] },
  { name: 'growth', label: '成長', href: '#/growth', icon: icons.growth, match: ['growth'] },
  { name: 'review', label: '振り返り', href: '#/review', icon: icons.review, match: ['review'] },
] as const;

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      await ensureInitialized();
      if (getDataMode() === 'demo') {
        const a = await loadAll();
        if (!a.appMeta.isDemo) await seedDemo();
      }
      setReady(true);
    })().catch(() => setError('この端末の保存領域を開けませんでした。プライベートブラウズを解除するか、ブラウザーの保存設定を確認してください。'));
  }, []);
  if (error) return <div className="app"><main className="main no-tabs"><div className="card banner warn" role="alert">{error}</div></main></div>;
  if (!ready) return <div className="app"><main className="main no-tabs"><p className="muted">読み込み中…</p></main></div>;
  return <AppProvider>{(route, loaded) => (loaded ? <Shell route={route} /> : <div className="app"><main className="main"><p className="muted">読み込み中…</p></main></div>)}</AppProvider>;
}

function Shell(props: { route: Route }) {
  const app = useApp();
  const online = useOnline();
  let route = props.route;
  if (!app.data.appMeta.onboardingDone && route.name !== 'settings') route = { name: 'welcome' };
  const showTabs = route.name !== 'welcome' && route.name !== 'workshop';
  const dayLabel = app.dayN === null ? null : app.experiment && app.dayN >= 1
    ? (cycleDay(app.experiment, app.today) <= 14 ? `Day ${String(Math.max(0, cycleDay(app.experiment, app.today))).padStart(2, '0')} / 14` : `Day ${app.dayN}`)
    : `Day ${String(app.dayN).padStart(2, '0')}`;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/today" style={{ textDecoration: 'none', color: 'inherit' }} aria-label={`${brand.brand} ホーム`}>
          <img src="./icon.svg" alt="" className="brand-mark" />
          <span className="brand-name">{brand.brand}</span>
        </a>
        <span className="spacer" />
        {!online && <span className="offline-pill" data-testid="offline-pill">オフライン（端末に保存中）</span>}
        {dayLabel && showTabs && <span className="daybadge" data-testid="day-badge">{dayLabel}</span>}
        {showTabs && <a className="iconbtn" href="#/settings" aria-label="設定・バックアップ・プライバシー">{icons.menu}</a>}
      </header>
      <main className={`main ${showTabs ? '' : 'no-tabs'}`} id="main">
        {app.mode === 'demo' && <div className="banner demo" data-testid="demo-banner">デモデータ表示中（架空の内容・本人のデータではありません）</div>}
        {route.name === 'welcome' && <Welcome />}
        {route.name === 'workshop' && <Workshop />}
        {route.name === 'today' && <Today />}
        {route.name === 'compass' && <Compass />}
        {route.name === 'lifeclock' && <LifeClock />}
        {route.name === 'growth' && <Growth />}
        {route.name === 'review' && <Review />}
        {route.name === 'settings' && <Settings />}
      </main>
      {showTabs && (
        <nav className="tabbar" aria-label="メイン">
          <ul>
            {TABS.map((t) => (
              <li key={t.name}>
                <a href={t.href} aria-current={(t.match as readonly string[]).includes(route.name) ? 'page' : undefined} data-testid={`tab-${t.name}`}>
                  {t.icon}
                  <span>{t.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Toast message={app.toastMessage} onDone={app.clearToast} />
    </div>
  );
}
