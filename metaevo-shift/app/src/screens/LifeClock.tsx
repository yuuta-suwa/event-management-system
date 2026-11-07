import { useMemo, useState, type ReactElement } from 'react';
import { useApp } from '../state';
import * as repo from '../db/repo';
import { computeLifeClock, HORIZON_MAX, HORIZON_MIN, HORIZON_PRESETS, lifeClockSummary, NOT_A_PREDICTION, REACHED_MESSAGE, validateHorizon, WEEKS_PER_YEAR, yearProgress, type LifeClockResult } from '../domain/lifeClock';
import { isValidYmd, localDateOf } from '../domain/dates';
import type { LifeTime, LifeTimeQuestionId } from '../domain/schema';
import { AsyncButton, Choice, ConfirmTwoStep, TextField } from '../ui/kit';

const QUESTIONS: { id: LifeTimeQuestionId; text: string; gentle: string; kind: 'values' | 'weekly' }[] = [
  { id: 'LT01', text: '人生の最後に振り返ったとき、「やっておけばよかった」と思いたくないことは何ですか？', gentle: '将来の自分が「やっておいてよかった」と思えそうなことは何ですか？', kind: 'values' },
  { id: 'LT02', text: '本当に大切にしたい人・時間・挑戦は何ですか？', gentle: '本当に大切にしたい人・時間・挑戦は何ですか？', kind: 'values' },
  { id: 'LT03', text: '一年後の自分が今日のあなたに感謝するとしたら、どんな行動ですか？', gentle: '一年後の自分が今日のあなたに感謝するとしたら、どんな行動ですか？', kind: 'values' },
  { id: 'LT04', text: '今週、仕事・家族・健康・挑戦・休息などの中から、何を意識して優先したいですか？', gentle: '今週、仕事・家族・健康・挑戦・休息などの中から、何を意識して優先したいですか？', kind: 'weekly' },
  { id: 'LT05', text: 'この一週間を振り返り、自分の生き方に沿う選択ができた場面はありましたか？', gentle: 'この一週間を振り返り、自分の生き方に沿う選択ができた場面はありましたか？', kind: 'weekly' },
];

const MODE_LABEL = { reflection: '問いだけ（いちばん穏やか）', year: '今年・今週の時間', weeks: '人生カレンダー（週）' } as const;

export function LifeClock() {
  const app = useApp();
  const lt = app.data.lifeTime;
  return (
    <div data-testid="lifeclock">
      <a href="#/compass" className="linkbtn small">← 人生の軸</a>
      <h1>人生の時間｜LIFE CLOCK</h1>
      {!lt.enabled ? <OptIn /> : <Enabled lt={lt} />}
    </div>
  );
}

function OptIn() {
  const app = useApp();
  return (
    <div className="card hero" data-testid="lifeclock-optin">
      <p>人生の時間は有限です。何歳まで生きるかは分かりません。この画面は、あなたが大切にしたい時間を考えるためのものです。</p>
      <ul className="small muted">
        <li>寿命・余命・死亡日を予測する機能ではありません。</li>
        <li>生年月日の入力は任意です。入力しなくても、問いだけで使えます。</li>
        <li>記録はこの端末の中だけに保存され、共有の対象にもなりません。いつでもオフ・削除できます。</li>
        <li>不安やつらさが強まる場合は、使わなくて大丈夫です。</li>
      </ul>
      <AsyncButton className="btn primary block" testId="lifeclock-enable" onClick={async () => { await repo.updateLifeTime({ enabled: true, displayMode: 'reflection' }); app.toast('人生の時間を有効にしました（問いだけの表示）。'); }}>
        有効にする（問いだけから始める）
      </AsyncButton>
      <a className="btn ghost block" href="#/compass" style={{ marginTop: 8 }}>今は使わない</a>
    </div>
  );
}

function Enabled(props: { lt: LifeTime }) {
  const { lt } = props;
  const app = useApp();
  const [showSettings, setShowSettings] = useState(false);
  const result = useMemo(() => computeLifeClock({ birthDate: lt.birthDate, birthYear: lt.birthYear, planningHorizonAge: lt.planningHorizonAge, today: app.today }), [lt, app.today]);

  return (
    <>
      <Choice
        legend="表示のしかた"
        options={(Object.keys(MODE_LABEL) as LifeTime['displayMode'][]).map((k) => ({ value: k, label: MODE_LABEL[k] }))}
        value={lt.displayMode}
        onChange={(v) => repo.updateLifeTime({ displayMode: v })}
      />
      {lt.displayMode === 'year' && <YearView today={app.today} />}
      {lt.displayMode === 'weeks' && (
        <section className="card" data-testid="weeks-view">
          <div className="notice-fixed" data-testid="not-prediction">{lt.planningHorizonAge ? `${lt.planningHorizonAge}歳を仮の節目に設定した人生カレンダーです。` : ''}{NOT_A_PREDICTION}</div>
          <HorizonAndBirth lt={lt} />
          <WeeksCalendar result={result} horizon={lt.planningHorizonAge ?? null} />
        </section>
      )}
      <Reflections lt={lt} />

      <section className="card">
        <button className="btn block ghost" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>表示・削除の設定</button>
        {showSettings && (
          <div style={{ marginTop: 10 }}>
            <Choice legend="「今日」画面のカード" options={[{ value: 'off', label: '表示しない' }, { value: 'gentle', label: '「今日、大切にすることは？」を小さく表示' }]} value={lt.homeCard} onChange={(v) => repo.updateLifeTime({ homeCard: v as LifeTime['homeCard'] })} />
            <p className="small faint">通知や自動の起動はありません。</p>
            <AsyncButton className="btn block" testId="lifeclock-disable" onClick={async () => { await repo.updateLifeTime({ enabled: false, homeCard: 'off' }); app.toast('人生の時間をオフにしました。記録は残っています。'); }}>オフにする（記録は残す）</AsyncButton>
            <div style={{ height: 10 }} />
            <ConfirmTwoStep testId="lifeclock-delete" label="人生の時間の記録だけ削除する" warning="生年月日・仮の節目・問いへの回答・今日の行動とのつながり（選んだ理由）を削除します。他の記録は消えません。元に戻せません。" confirmLabel="削除する" onConfirm={async () => { await repo.deleteLifeTimeData(); app.toast('人生の時間の記録を削除しました。'); }} />
          </div>
        )}
        <p className="small faint" style={{ marginTop: 10 }}>つらさや不安が強いときは、すぐにオフにして構いません。深刻な苦痛を感じるときは、専門の相談窓口や医療機関に相談してください。</p>
      </section>
    </>
  );
}

function YearView(props: { today: string }) {
  const y = yearProgress(props.today);
  return (
    <section className="card" data-testid="year-view">
      <div className="eyebrow">今年・今週</div>
      <p className="metric-big">第{y.weekOfYear}週 <span className="small faint">/ 約{y.weeksInYear}週</span></p>
      <div className="progress" aria-hidden="true"><i style={{ width: `${Math.min(100, (y.weekOfYear / y.weeksInYear) * 100)}%` }} /></div>
      <p>今年はあと{y.daysLeftInYear}日です。今週、どんな時間を大切にしますか？</p>
    </section>
  );
}

function HorizonAndBirth(props: { lt: LifeTime }) {
  const { lt } = props;
  const [custom, setCustom] = useState(lt.planningHorizonAge && !HORIZON_PRESETS.includes(lt.planningHorizonAge as 80) ? String(lt.planningHorizonAge) : '');
  const [birthDate, setBirthDate] = useState(lt.birthDate ?? '');
  const [birthYear, setBirthYear] = useState(lt.birthYear ? String(lt.birthYear) : '');
  const [err, setErr] = useState<string | null>(null);
  const presetValue = lt.planningHorizonAge && HORIZON_PRESETS.includes(lt.planningHorizonAge as 80) ? String(lt.planningHorizonAge) : lt.planningHorizonAge ? 'custom' : null;
  return (
    <div>
      <Choice
        legend="仮の節目（計画上の到達年齢）"
        options={[...HORIZON_PRESETS.map((a) => ({ value: String(a), label: `${a}歳` })), { value: 'custom', label: '任意' }]}
        value={presetValue}
        onChange={(v) => { if (v !== 'custom') repo.updateLifeTime({ planningHorizonAge: Number(v) }); else setCustom(custom || ''); }}
      />
      {(presetValue === 'custom' || custom) && (
        <div className="row">
          <div className="grow"><TextField label={`任意の年齢（${HORIZON_MIN}〜${HORIZON_MAX}）`} type="number" inputMode="numeric" value={custom} onChange={setCustom} testId="horizon-custom" /></div>
          <button className="btn sm" style={{ marginTop: 20 }} onClick={() => { const n = Number(custom); const e = validateHorizon(n); setErr(e); if (!e) repo.updateLifeTime({ planningHorizonAge: n }); }}>設定</button>
        </div>
      )}
      <details open={!lt.birthDate && !lt.birthYear}>
        <summary className="small">生年月日・生年（任意・端末内のみ）</summary>
        <TextField label="生年月日（任意）" type="date" value={birthDate} onChange={setBirthDate} testId="birth-date" />
        <TextField label="または生年のみ（任意・概算表示）" type="number" inputMode="numeric" value={birthYear} onChange={setBirthYear} testId="birth-year" />
        <div className="btnrow">
          <button className="btn sm" data-testid="birth-save" onClick={() => {
            if (birthDate && !isValidYmd(birthDate)) return setErr('生年月日の形式が正しくありません。');
            const by = birthYear ? Number(birthYear) : null;
            if (by !== null && (!Number.isInteger(by) || by < 1900 || by > 2100)) return setErr('生年は1900〜2100の範囲で入力してください。');
            setErr(null);
            void repo.updateLifeTime({ birthDate: birthDate || null, birthYear: birthDate ? null : by });
          }}>保存</button>
          <button className="btn sm ghost" onClick={() => { setBirthDate(''); setBirthYear(''); void repo.updateLifeTime({ birthDate: null, birthYear: null }); }}>消去</button>
        </div>
      </details>
      {err && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{err}</p>}
    </div>
  );
}

function WeeksCalendar(props: { result: LifeClockResult; horizon: number | null }) {
  const r = props.result;
  const summary = lifeClockSummary(r, props.horizon);
  if (r.kind === 'not_configured' || r.kind === 'invalid') return <p className="muted" data-testid="weeks-summary">{summary}</p>;
  if (r.kind === 'exact_reached' || (r.kind === 'approx' && r.reached)) {
    return <p className="gold" data-testid="weeks-summary">{REACHED_MESSAGE}</p>;
  }
  const horizon = props.horizon!;
  const lived = r.kind === 'exact' ? r.weeksLived : r.approxWeeksLived;
  const total = r.kind === 'exact' ? r.totalWeeks : horizon * WEEKS_PER_YEAR;
  const cols = WEEKS_PER_YEAR;
  const rows = Math.ceil(total / cols);
  const cell = 6;
  const gap = 1.5;
  const decadeGap = 4;
  const height = rows * (cell + gap) + Math.floor(rows / 10) * decadeGap;
  const rects: ReactElement[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const y = row * (cell + gap) + Math.floor(row / 10) * decadeGap;
    rects.push(<rect key={i} x={col * (cell + gap)} y={y} width={cell} height={cell} rx={1.2} className={i < lived ? 'lived' : i === lived ? 'now' : 'ahead'} />);
  }
  return (
    <div>
      <p data-testid="weeks-summary">{summary}</p>
      <p className="small faint">{r.kind === 'approx' ? '生年のみのため、概算（約）で表示しています。' : ''}1マス＝1週。1行＝1年、10年ごとに間隔を空けています。塗りつぶし＝これまでの時間、枠線＝仮に置いた節目までの時間。</p>
      <svg className="lifecal" viewBox={`0 0 ${cols * (cell + gap)} ${height}`} role="img" aria-label={summary}>{rects}</svg>
      <div className="legend" style={{ marginTop: 6 }}><span><i style={{ background: 'var(--gold)' }} />これまで</span><span><i style={{ background: 'var(--cyan)' }} />今週</span><span><i />仮の節目まで</span></div>
      <p style={{ marginTop: 10 }}>今日、どんな時間を大切にしますか？</p>
    </div>
  );
}

function Reflections(props: { lt: LifeTime }) {
  const app = useApp();
  const [gentle, setGentle] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [stopped, setStopped] = useState(false);
  const latest = (id: LifeTimeQuestionId) => [...props.lt.reflections].reverse().find((r) => r.questionId === id);

  if (stopped) {
    return (
      <section className="card">
        <p>問いの表示を止めました。いつでも戻せます。</p>
        <button className="btn" onClick={() => setStopped(false)}>問いを表示する</button>
      </section>
    );
  }
  return (
    <section className="card" data-testid="lt-questions">
      <div className="row"><div className="eyebrow grow">後悔しない生き方の問い（すべて任意）</div></div>
      <div className="btnrow" style={{ marginBottom: 8 }}>
        <button className="btn sm ghost" onClick={() => setGentle(!gentle)} data-testid="lt-gentle">{gentle ? '元の問いに戻す' : '「最期」を含まない穏やかな問いに切り替える'}</button>
        <button className="btn sm ghost" onClick={() => setStopped(true)}>問いの表示を止める</button>
      </div>
      {QUESTIONS.map((q) => {
        const last = latest(q.id);
        return (
          <div key={q.id} className="card flat" style={{ marginBottom: 10 }} data-testid={`lt-${q.id}`}>
            <span className="qid">{q.id}</span>
            <p style={{ fontWeight: 650, margin: '4px 0' }}>{gentle ? q.gentle : q.text}</p>
            {last?.answer && <p className="small muted">前回の回答：{last.answer}</p>}
            <TextField label="回答（任意・非公開）" value={drafts[q.id] ?? ''} onChange={(v) => setDrafts({ ...drafts, [q.id]: v })} multiline testId={`lt-${q.id}-input`} />
            <div className="btnrow">
              <AsyncButton className="btn sm" testId={`lt-${q.id}-save`} disabled={!drafts[q.id]?.trim()} onClick={async () => {
                await repo.addLifeReflection(q.id, drafts[q.id].trim(), q.kind);
                setDrafts({ ...drafts, [q.id]: '' });
                app.toast('回答を保存しました（この端末のみ）。');
              }}>保存</AsyncButton>
              {(last?.answer || drafts[q.id]?.trim()) && (
                <AsyncButton className="btn sm primary" testId={`lt-${q.id}-to-today`} onClick={async () => {
                  let rid = last?.id ?? null;
                  const text = drafts[q.id]?.trim() || last?.answer || '';
                  if (drafts[q.id]?.trim()) rid = await repo.addLifeReflection(q.id, text, q.kind);
                  app.setPendingLink({ reflectionId: rid, reason: text });
                  app.navigate({ name: 'today', edit: true });
                }}>今日、大切にする一歩を選ぶ</AsyncButton>
              )}
              {last?.answer && (
                <AsyncButton className="btn sm ghost" testId={`lt-${q.id}-to-compass`} onClick={async () => {
                  if (!window.confirm('この回答を「人生の軸」の理念欄に追記しますか？（上書きはしません）')) return;
                  const c = app.data.lifeCompass;
                  await repo.updateLifeCompass({ lifePrinciple: [c.lifePrinciple, last.answer].filter(Boolean).join(' ／ ') }, '人生の時間の問いから追記');
                  app.toast('人生の軸に追記しました。');
                }}>人生の軸に取り込む</AsyncButton>
              )}
            </div>
          </div>
        );
      })}
      {props.lt.reflections.length > 0 && (
        <details>
          <summary className="small">これまでの回答（{props.lt.reflections.length}件）</summary>
          <ul className="list">
            {[...props.lt.reflections].reverse().map((r) => (
              <li key={r.id} className="row">
                <div className="grow small"><span className="faint">{localDateOf(r.recordedAt, app.tz)} {r.questionId}</span><br />{r.answer ?? '（未回答）'}{r.linkedPlanId && <span className="tag cyan">今日の行動に反映</span>}</div>
                <button className="btn sm ghost" onClick={() => repo.deleteLifeReflection(r.id)} aria-label="この回答を削除">削除</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="small faint">選んだ行動は、他の日の行動と同じように記録・振り返りされます。ここで操作しただけでは「実行済み」になりません。閲覧回数は成長として数えません。</p>
    </section>
  );
}
