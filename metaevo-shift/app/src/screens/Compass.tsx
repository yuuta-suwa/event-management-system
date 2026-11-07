import { useState } from 'react';
import { useApp } from '../state';
import * as repo from '../db/repo';
import { ROUTE_LABEL, ROUTE_LETTER, DEFAULT_KIND } from '../domain/workshop';
import { HYPOTHESIS_EXPERIMENTS } from '../domain/rules';
import { formatJpDate, localDateOf } from '../domain/dates';
import { ROUTES, type LifeCompass, type Route } from '../domain/schema';
import { AsyncButton, Choice, MultiChoice, Sheet, TextField } from '../ui/kit';

const VALUE_OPTIONS = ['人への貢献', '自由', '成長', '誠実', '家族', '挑戦', '安定', '健康', '学び', '友情'];
const COMPASS_STATUS: Record<LifeCompass['status'], string> = { exploring: '探索中', provisional: '仮置き', committed: '大切にすると決めている', paused: '一時保留' };
const GOAL_STATUS: Record<string, string> = { exploring: '探索中', provisional: '仮の目標', committed: '取り組む目標', paused: '保留', retired: '履歴（終了・変更済み）' };

export function Compass() {
  const app = useApp();
  const { data, experiment, tz } = app;
  const c = data.lifeCompass;
  const [edit, setEdit] = useState(false);
  const [revise, setRevise] = useState(false);
  const activeGoals = data.goals.filter((g) => g.status !== 'retired');
  const pastGoals = data.goals.filter((g) => g.status === 'retired');
  const route = data.profile.selectedRoute ?? null;

  return (
    <div data-testid="compass">
      <h1>人生の軸</h1>
      <p className="small faint">ここに書いたことは誰にも公開されません。仮のまま、何度でも書き換えられます。</p>

      <section className="card hero">
        <div className="row"><div className="eyebrow grow">大切にしたい生き方</div><span className="tag gold">{COMPASS_STATUS[c.status]}</span></div>
        {c.desiredWayOfLiving ? <p className="action-title">{c.desiredWayOfLiving}</p> : <p className="muted">まだ言葉になっていなくて大丈夫です。日々の体験から探していけます。</p>}
        {(c.values ?? []).length > 0 && <p>{(c.values ?? []).map((v) => <span className="tag cyan" key={v}>{v}</span>)}</p>}
        {c.lifePrinciple && <p><span className="small faint">理念：</span>{c.lifePrinciple}</p>}
        {c.longTermPurpose && <p><span className="small faint">長期の目的：</span>{c.longTermPurpose}</p>}
        <button className="btn block" onClick={() => setEdit(true)} data-testid="edit-compass">書き換える</button>
      </section>

      <section className="card">
        <div className="eyebrow">今の方向性（目標）</div>
        {activeGoals.length === 0 && <p className="muted">目標はまだありません。探索テーマだけでも日々の行動と振り返りを使えます。</p>}
        {activeGoals.map((g) => (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <p className="action-title" style={{ fontSize: '1.1rem' }}>{g.title}</p>
            <span className="tag">{GOAL_STATUS[g.status]}</span><span className="tag">非公開</span>
            {g.outcomeMeasure && (g.outcomeMeasure.description || g.outcomeMeasure.unit) && (
              <p className="small muted" style={{ marginTop: 6 }}>成果の確かめ方：{g.outcomeMeasure.description ?? ''}{g.outcomeMeasure.unit ? `（単位：${g.outcomeMeasure.unit}${g.outcomeMeasure.baseline !== null ? `、基準値 ${g.outcomeMeasure.baseline}${g.outcomeMeasure.baselineDate ? `／${g.outcomeMeasure.baselineDate}` : ''}` : ''}）` : ''}</p>
            )}
          </div>
        ))}
        <button className="btn cyan block" onClick={() => setRevise(true)} data-testid="revise-goal">目標を選び直す</button>
        <p className="small faint">選び直しても、これまでの行動記録と以前の目標・実験は履歴として残ります。中止や変更も合理的な選択です。</p>
      </section>

      {experiment && (
        <section className="card">
          <div className="eyebrow">現在の14日間の実験</div>
          <p style={{ fontWeight: 700, margin: 0 }}>{experiment.theme}</p>
          <p className="small muted">{formatJpDate(experiment.startDate)} 〜 {formatJpDate(experiment.endDate)}</p>
          <p className="small">最初の一歩：{experiment.firstAction}<br />開始条件：{experiment.startCue}</p>
          {experiment.fallbackPlan && <p className="small">妨げが出たら：{experiment.fallbackPlan}</p>}
          {(experiment.hypothesisIds ?? []).length > 0 && (
            <p className="small">原因の仮説（本人が選んだもの・いつでも変更可）：{experiment.hypothesisIds!.map((h) => HYPOTHESIS_EXPERIMENTS[h]?.label ?? h).join('、')}</p>
          )}
        </section>
      )}

      <section className="card">
        <div className="eyebrow">現在の状態（ルート）</div>
        <p className="small faint">性格の分類ではありません。今の状態に合わせていつでも変更できます。</p>
        <Choice<Route>
          legend="現在の状態"
          hideLegend
          column
          options={ROUTES.map((r) => ({ value: r, label: <><span className="letter">{ROUTE_LETTER[r]}</span>{ROUTE_LABEL[r]}</> }))}
          value={route}
          onChange={(r) => repo.setRoute(r).then(() => app.toast('現在の状態を変更しました。'))}
        />
      </section>

      <a className="card" href="#/compass/lifeclock" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }} data-testid="open-lifeclock">
        <div className="eyebrow">任意機能</div>
        <h2 style={{ marginBottom: 4 }}>人生の時間｜LIFE CLOCK</h2>
        <p className="small muted" style={{ margin: 0 }}>{data.lifeTime.enabled ? '有効（本人だけに表示）' : '初期設定はオフです。希望する場合だけ有効にできます。'} →</p>
      </a>

      {(c.revisions ?? []).length > 0 || pastGoals.length > 0 ? (
        <section className="card">
          <details>
            <summary>更新履歴</summary>
            <ul className="list">
              {[...(c.revisions ?? [])].reverse().map((r, i) => (
                <li key={i}><span className="small faint">{r.changedAt ? localDateOf(r.changedAt, tz) : ''} 生き方を更新</span>{r.reason && <div className="small">理由：{r.reason}</div>}{r.previousText && <div className="small muted">以前：{r.previousText}</div>}</li>
              ))}
              {pastGoals.map((g) => (
                <li key={g.id}><span className="small faint">{g.revisedAt ? localDateOf(g.revisedAt, tz) : ''} 以前の目標</span><div className="small">{g.title}</div></li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {edit && <CompassEditor c={c} onClose={() => setEdit(false)} />}
      {revise && <ReviseGoalSheet onClose={() => setRevise(false)} />}
    </div>
  );
}

function CompassEditor(props: { c: LifeCompass; onClose: () => void }) {
  const { c } = props;
  const app = useApp();
  const [values, setValues] = useState<string[]>(c.values ?? []);
  const [way, setWay] = useState(c.desiredWayOfLiving ?? '');
  const [principle, setPrinciple] = useState(c.lifePrinciple ?? '');
  const [purpose, setPurpose] = useState(c.longTermPurpose ?? '');
  const [status, setStatus] = useState<LifeCompass['status']>(c.status);
  const [reason, setReason] = useState('');
  const options = Array.from(new Set([...VALUE_OPTIONS, ...values]));
  return (
    <Sheet title="人生の軸を書き換える" eyebrow="非公開・仮のままでOK" onClose={props.onClose} testId="compass-editor">
      <MultiChoice legend="大切にしたい価値（複数可）" options={options.map((v) => ({ value: v, label: v }))} value={values} onChange={setValues} />
      <TextField label="どんな生き方を大切にしたいか" value={way} onChange={setWay} multiline testId="compass-way" />
      <TextField label="人生の理念（任意）" value={principle} onChange={setPrinciple} multiline hint="名文である必要はありません。暫定的なキーワードで十分です。" />
      <TextField label="長期の目的（任意）" value={purpose} onChange={setPurpose} multiline />
      <Choice legend="今の状態" options={(Object.keys(COMPASS_STATUS) as LifeCompass['status'][]).map((k) => ({ value: k, label: COMPASS_STATUS[k] }))} value={status} onChange={setStatus} />
      <TextField label="変更の理由（任意）" value={reason} onChange={setReason} />
      <AsyncButton className="btn primary block" testId="compass-save" onClick={async () => {
        await repo.updateLifeCompass({ values, desiredWayOfLiving: way.trim() || null, lifePrinciple: principle.trim() || null, longTermPurpose: purpose.trim() || null, status }, reason.trim() || null);
        app.toast('人生の軸を更新しました（以前の内容は履歴に残ります）。');
        props.onClose();
      }}>保存する</AsyncButton>
    </Sheet>
  );
}

export function ReviseGoalSheet(props: { onClose: () => void }) {
  const app = useApp();
  const route0 = app.data.profile.selectedRoute ?? 'execute';
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [route, setRoute] = useState<Route>(route0);
  const [action, setAction] = useState('');
  const [cue, setCue] = useState(app.experiment?.startCue ?? '');
  const [unit, setUnit] = useState('');
  const [baseline, setBaseline] = useState('');
  return (
    <Sheet title="目標を選び直す" eyebrow="価値観に沿って選び直す" onClose={props.onClose} testId="revise-sheet">
      {app.data.lifeCompass.desiredWayOfLiving && <p className="small muted">あなたの大切なこと：{app.data.lifeCompass.desiredWayOfLiving}</p>}
      <TextField label="新しい目標・探索テーマ" value={title} onChange={setTitle} testId="revise-title" />
      <TextField label="選び直す理由（任意）" value={reason} onChange={setReason} />
      <Choice<Route> legend="今の状態" column options={ROUTES.map((r) => ({ value: r, label: `${ROUTE_LETTER[r]}：${ROUTE_LABEL[r]}` }))} value={route} onChange={setRoute} />
      <TextField label="最初の一歩" value={action} onChange={setAction} testId="revise-action" />
      <TextField label="始める条件" value={cue} onChange={setCue} />
      <div className="inline-fields">
        <TextField label="成果の単位（任意）" value={unit} onChange={setUnit} />
        <TextField label="今の値（任意）" type="number" inputMode="decimal" value={baseline} onChange={setBaseline} />
      </div>
      <AsyncButton className="btn primary block" testId="revise-save" disabled={!title.trim() || !action.trim()} onClick={async () => {
        await repo.reviseGoal({
          oldGoalId: app.goal?.id ?? null, title: title.trim(), reason: reason.trim() || null, route, firstAction: action.trim(),
          startCue: cue.trim() || '準備ができたら', experimentKind: DEFAULT_KIND[route], unit: unit.trim() || null, baseline: baseline === '' ? null : Number(baseline),
        });
        await repo.upsertPlan({ date: app.today, importantAction: action.trim(), startCue: cue.trim() || null, replanReason: '目標を選び直した' });
        app.toast('目標を選び直しました。以前の目標と実験は履歴に残っています。');
        props.onClose();
      }}>選び直して新しい実験を始める</AsyncButton>
    </Sheet>
  );
}
