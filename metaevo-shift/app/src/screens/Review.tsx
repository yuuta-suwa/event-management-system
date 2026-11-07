import { useMemo, useState } from 'react';
import { useApp } from '../state';
import * as repo from '../db/repo';
import { computeActionMetrics, computeOutcomes, evidenceDate, experimentPeriodStart, returnRateText, startRateText, latestPlanByDate } from '../domain/metrics';
import { HYPOTHESIS_EXPERIMENTS } from '../domain/rules';
import { REVIEW_TITLES } from '../domain/reviews';
import { addDays, dateRange, formatJpDate, localDateOf, localTimeOf } from '../domain/dates';
import { newId } from '../domain/id';
import type { AppEvent, HypothesisStatus, PlanStatus, ReviewKind } from '../domain/schema';
import { AsyncButton, Choice, Sheet, TextField } from '../ui/kit';
import { EveningSheet } from './Today';

const KIND_LABEL: Partial<Record<AppEvent['kind'], string>> = {
  PLAN_CREATED: '計画', ACTION_STARTED: '開始', ACTION_PAUSED: '一時停止', ACTION_COMPLETED: '完了', INTERNAL_SWITCH: '別のことへの切替（内的）',
  EXTERNAL_INTERRUPT: '予定外の対応（外部）', ACTION_RESUMED: '再開', REPLAN: '計画変更', REST_CHOSEN: '回復する日', DAILY_REVIEW: '夜の確認',
  HYPOTHESIS_REVISED: '仮説の見直し', GOAL_REVISED: '目標の見直し', EVIDENCE_ADDED: '証拠の記録',
};
const PLAN_STATUS_LABEL: Record<string, string> = { planned: '予定（未記録）', in_progress: '着手', paused: '着手（中断）', completed: '完了', not_started: '未実行', changed: '計画変更', rest: '回復日', unknown: '不明', unplanned: '未計画' };

export function Review() {
  const app = useApp();
  const { data, today } = app;
  const [backfill, setBackfill] = useState(false);
  const [editEvent, setEditEvent] = useState<AppEvent | null>(null);
  const [eveningFor, setEveningFor] = useState<string | null>(null);
  const kind = (location.hash.split('/')[2] ?? '') as ReviewKind | '';
  if (kind === 'day7') return <Day7 />;
  if (kind === 'day14') return <Day14 />;
  if (kind === 'day30' || kind === 'day60' || kind === 'day90') return <DayLong kind={kind} />;

  const days = dateRange(addDays(today, -13), today).reverse();
  const plans = latestPlanByDate(data.dayPlans);
  const visibleKinds: AppEvent['kind'][] = ['ACTION_STARTED', 'ACTION_COMPLETED', 'INTERNAL_SWITCH', 'EXTERNAL_INTERRUPT', 'ACTION_RESUMED', 'REPLAN', 'REST_CHOSEN', 'DAILY_REVIEW'];

  return (
    <div data-testid="review">
      <h1>振り返り</h1>
      {app.due.length > 0 && (
        <section className="card hero">
          <div className="eyebrow">今できる振り返り</div>
          {app.due.map((d) => <a key={d.kind} className="btn primary block" style={{ marginBottom: 8 }} href={`#/review/${d.kind}`} data-testid={`due-${d.kind}`}>{d.title}</a>)}
          <p className="small faint">省略しても不利になることはありません。</p>
        </section>
      )}
      <section className="card">
        <div className="row"><h2 className="grow" style={{ margin: 0 }}>直近14日の記録</h2><button className="btn sm cyan" onClick={() => setBackfill(true)} data-testid="btn-backfill">後から追記</button></div>
        <p className="small faint">記録のない日は「不明」です。思い出したときに後から直せます。直すと「成長」の集計も再計算されます。</p>
        <ul className="list">
          {days.map((d) => {
            const p = plans.get(d);
            const evs = data.events.filter((e) => e.localDate === d && visibleKinds.includes(e.kind));
            return (
              <li key={d} data-testid={`day-${d}`}>
                <div className="row">
                  <div className="grow"><strong>{formatJpDate(d)}</strong>{p?.importantAction && <span className="small muted">　{p.importantAction}</span>}</div>
                  <span className="tag">{p ? PLAN_STATUS_LABEL[p.dayMode === 'recover' ? 'rest' : p.status] : '未計画'}</span>
                </div>
                {p && p.importantAction && d < today && (
                  <div className="btnrow" style={{ marginTop: 6 }}>
                    <select aria-label={`${formatJpDate(d)}の状態を直す`} value={p.status} onChange={(e) => repo.setPlanStatus(p.id, e.target.value as PlanStatus)} style={{ flex: 1, minHeight: 44 }}>
                      {(['planned', 'in_progress', 'completed', 'not_started', 'changed', 'rest', 'unknown'] as PlanStatus[]).map((s) => <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>)}
                    </select>
                    <button className="btn sm" onClick={() => setEveningFor(d)}>夜の確認を追記</button>
                  </div>
                )}
                {evs.length > 0 && (
                  <ul className="list" style={{ marginTop: 4 }}>
                    {evs.map((e) => (
                      <li key={e.id} className="row" style={{ padding: '6px 0' }}>
                        <div className="grow small">
                          <span className="faint">{localTimeOf(e.occurredAt, app.tz)}</span> {KIND_LABEL[e.kind]}
                          {e.kind === 'INTERNAL_SWITCH' && e.payload.reason ? `（理由：${e.payload.reason}）` : ''}
                          {e.kind === 'EXTERNAL_INTERRUPT' ? `（${e.payload.critical ? '緊急' : '通常'}・${e.payload.resumeOutcome === 'resumed' ? '復帰した' : e.payload.resumeOutcome === 'not_resumed' ? '戻れなかった' : '復帰は未記録'}）` : ''}
                          {e.payload.backfilled ? <span className="tag">後から追記</span> : null}
                        </div>
                        {(e.kind === 'INTERNAL_SWITCH' || e.kind === 'EXTERNAL_INTERRUPT') && <button className="btn sm ghost" onClick={() => setEditEvent(e)}>編集</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card">
        <h2>レビュー</h2>
        <div className="btnrow">
          {(['day7', 'day14', 'day30', 'day60', 'day90'] as const).map((k) => <a key={k} className="btn sm" href={`#/review/${k}`}>{REVIEW_TITLES[k].split(' ')[0]}</a>)}
        </div>
        {data.reviews.length > 0 && (
          <ul className="list" style={{ marginTop: 10 }}>
            {[...data.reviews].reverse().map((r) => <li key={r.id} className="small"><strong>{REVIEW_TITLES[r.reviewKind] ?? r.reviewKind}</strong>　{localDateOf(r.reviewedAt, app.tz)}{r.nextAction ? <div className="muted">次の一手：{r.nextAction}</div> : null}</li>)}
          </ul>
        )}
      </section>
      {backfill && <BackfillSheet onClose={() => setBackfill(false)} />}
      {editEvent && <EditEventSheet ev={editEvent} onClose={() => setEditEvent(null)} />}
      {eveningFor && <EveningSheet date={eveningFor} onClose={() => setEveningFor(null)} />}
    </div>
  );
}

function BackfillSheet(props: { onClose: () => void }) {
  const app = useApp();
  const [opId] = useState(() => newId('ev'));
  const [kind, setKind] = useState<'internal' | 'external'>('internal');
  const [date, setDate] = useState(app.today);
  const [time, setTime] = useState('10:00');
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [outcome, setOutcome] = useState<'resumed' | 'not_resumed' | null>(null);
  return (
    <Sheet title="記録を後から追記" onClose={props.onClose} testId="backfill-sheet">
      <Choice legend="種類" options={[{ value: 'internal', label: '別のことへの切替（自分から）' }, { value: 'external', label: '予定外の対応（外から）' }]} value={kind} onChange={(v) => setKind(v as typeof kind)} column />
      <div className="inline-fields">
        <TextField label="日付" type="date" value={date} onChange={setDate} testId="backfill-date" />
        <TextField label="時刻" type="time" value={time} onChange={setTime} />
      </div>
      {kind === 'internal' ? (
        <>
          <TextField label="何をしたか（任意）" value={other} onChange={setOther} />
          <Choice legend="理由（任意）" options={['難しい', '面倒', '不安', '今はこちらが重要', '疲労', '不明'].map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
        </>
      ) : (
        <>
          <TextField label="何の対応か（任意）" value={other} onChange={setOther} />
          <Choice legend="元の行動に戻れた？" options={[{ value: 'resumed', label: '戻れた' }, { value: 'not_resumed', label: '戻れなかった' }]} value={outcome} onChange={(v) => setOutcome(v as typeof outcome)} />
        </>
      )}
      <AsyncButton className="btn primary block" testId="backfill-save" onClick={async () => {
        const occurredAt = new Date(`${date}T${time || '12:00'}:00${offsetOf(app.tz, date)}`).toISOString();
        const plan = latestPlanByDate(app.data.dayPlans).get(date);
        if (kind === 'internal') await repo.recordInternalSwitch({ opId, planId: plan?.id ?? null, date, otherActivity: other || null, reason, decision: 'other_activity', occurredAt, backfilled: true });
        else await repo.recordExternalInterrupt({ opId, planId: plan?.id ?? null, date, critical: false, summary: other || null, occurredAt, backfilled: true, resumeOutcome: outcome });
        app.toast('追記しました。集計は自動で再計算されます。');
        props.onClose();
      }}>追記する</AsyncButton>
    </Sheet>
  );
}

/** 指定タイムゾーンのUTCオフセット（+09:00形式） */
function offsetOf(tz: string, date: string): string {
  try {
    const d = new Date(`${date}T12:00:00Z`);
    const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    const mins = Math.round((local.getTime() - utc.getTime()) / 60000);
    const sign = mins >= 0 ? '+' : '-';
    const a = Math.abs(mins);
    return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  } catch {
    return '+09:00';
  }
}

function EditEventSheet(props: { ev: AppEvent; onClose: () => void }) {
  const { ev } = props;
  const [reason, setReason] = useState<string | null>((ev.payload.reason as string) ?? null);
  const [outcome, setOutcome] = useState<string | null>((ev.payload.resumeOutcome as string) ?? null);
  return (
    <Sheet title={`${KIND_LABEL[ev.kind]}を編集`} onClose={props.onClose} testId="edit-event-sheet">
      {ev.kind === 'INTERNAL_SWITCH' ? (
        <Choice legend="理由" options={['難しい', '面倒', '不安', '今はこちらが重要', '疲労', '不明'].map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
      ) : (
        <Choice legend="元の行動に戻れた？" options={[{ value: 'resumed', label: '戻れた' }, { value: 'not_resumed', label: '戻れなかった' }]} value={outcome} onChange={setOutcome} />
      )}
      <div className="btnrow">
        <AsyncButton className="btn primary" testId="edit-event-save" onClick={async () => { await repo.updateEvent(ev.id, { payload: ev.kind === 'INTERNAL_SWITCH' ? { reason } : { resumeOutcome: outcome } }); props.onClose(); }}>保存</AsyncButton>
        <AsyncButton className="btn danger" onClick={async () => { if (window.confirm('この記録を削除しますか？')) { await repo.deleteEvent(ev.id); props.onClose(); } }}>削除</AsyncButton>
      </div>
    </Sheet>
  );
}

function ReviewShell(props: { title: string; children: React.ReactNode }) {
  return (
    <div data-testid="review-flow">
      <a href="#/review" className="linkbtn small">← 振り返り</a>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  );
}

function Day7() {
  const app = useApp();
  const exp = app.experiment;
  const [fit, setFit] = useState<string | null>(null);
  const [burden, setBurden] = useState<string | null>(null);
  const [barrier, setBarrier] = useState('');
  const [evidenceHow, setEvidenceHow] = useState('');
  const save = async (skipped: boolean) => {
    await repo.saveReview({
      reviewKind: 'day7', periodStart: exp?.startDate ?? null, periodEnd: exp?.endDate ?? null,
      facts: app.cycleMetrics ? startRateText(app.cycleMetrics) : null, hypothesisStatus: 'not_applicable',
      answers: skipped ? { skipped: true } : { fit, burden, barrier, evidenceHow }, note: skipped ? '省略' : null, nextAction: null,
    });
    app.toast(skipped ? 'Day7は省略しました。問題ありません。' : 'Day7の確認を保存しました。');
    app.navigate({ name: 'review' });
  };
  return (
    <ReviewShell title="Day7 軽い確認（約3分）">
      <div className="card" data-testid="day7">
        <p className="small faint">3つだけ。どれも任意です。</p>
        <Choice legend="1. 行動の難しさは合っていますか？（実行可能でしたか）" options={[{ value: 'ok', label: '合っている' }, { value: 'hard', label: '難しすぎる' }, { value: 'easy', label: '簡単すぎる' }, { value: 'unknown', label: '分からない' }]} value={fit} onChange={setFit} column />
        <Choice legend="2. 負担は大きくありませんか？" options={[{ value: 'low', label: '負担は小さい' }, { value: 'mid', label: 'ほどほど' }, { value: 'high', label: '負担が大きい' }]} value={burden} onChange={setBurden} />
        <TextField label="先週の障壁（任意）" value={barrier} onChange={setBarrier} />
        <TextField label="3. 本当の進捗を何で確かめますか？（証拠は取れていますか）" value={evidenceHow} onChange={setEvidenceHow} placeholder="例：送った提案の数と返信" />
        {burden === 'high' && <p className="small banner info">負担が大きいときは、行動量を増やす前に減らす・休む・予定を組み直すことを検討しましょう。記録項目も減らして構いません。</p>}
        <AsyncButton className="btn primary block" testId="day7-save" onClick={() => save(false)}>保存する</AsyncButton>
        <button className="linkbtn" onClick={() => save(true)} data-testid="day7-skip">今回は省略する</button>
      </div>
    </ReviewShell>
  );
}

const HYP_STATUS: { value: HypothesisStatus; label: string }[] = [
  { value: 'supported', label: '支持する観察あり' }, { value: 'contradicted', label: '反対する観察あり' },
  { value: 'insufficient', label: '判断する情報が足りない' }, { value: 'rejected', label: '本人が仮説を見直した' },
];
const CONDITIONS = ['開始時刻', '難度', '環境', '学習', '目標の見直し', '休息'];

function Day14() {
  const app = useApp();
  const { data, today } = app;
  const exp = app.experiment;
  const [step, setStep] = useState(1);
  const [notes, setNotes] = useState({ facts: '', change: '', action: '', learning: '', outcome: '', alignment: '' });
  const [hyp, setHyp] = useState<Record<string, HypothesisStatus>>({});
  const [nextAction, setNextAction] = useState(exp?.firstAction ?? '');
  const [cue, setCue] = useState(exp?.startCue ?? '');
  const [cond, setCond] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(exp?.evidencePlan?.text ?? '');
  const [ltNote, setLtNote] = useState('');
  const start = exp ? experimentPeriodStart(exp, data.dayPlans) : addDays(today, -13);
  const end = exp ? (exp.endDate < today ? exp.endDate : today) : today;
  const m = useMemo(() => computeActionMetrics(data.dayPlans, data.events, start, end, today), [data, start, end, today]);
  const outcomes = computeOutcomes(data.goals.filter((g) => g.id === exp?.goalId), data.evidence);
  const learning = data.evidence.filter((e) => e.layer === 'learning' && evidenceDate(e) >= start && evidenceDate(e) <= end);
  const actionEv = data.evidence.filter((e) => e.layer === 'action' && evidenceDate(e) >= start && evidenceDate(e) <= end);
  const alignEv = data.events.filter((e) => e.kind === 'DAILY_REVIEW' && e.localDate >= start && e.localDate <= end && e.payload.alignment);
  const hyps = exp?.hypothesisIds ?? [];
  const set = (k: keyof typeof notes) => (v: string) => setNotes({ ...notes, [k]: v });

  if (!exp) return <ReviewShell title="Day14 振り返り"><div className="card"><p>実行中の14日間の実験がありません。初回ワークを完了すると使えます。</p></div></ReviewShell>;

  return (
    <ReviewShell title="Day14 振り返り">
      <p className="small faint">この14日間の結果を、自己評価ではなく改善の材料にします。着手・学び・成果を別々に見ます。記録のない日は「不明」です。（{step}/5）</p>
      <div className="progress"><i style={{ width: `${step * 20}%` }} /></div>
      {step === 1 && (
        <div className="card" data-testid="d14-step1">
          <h2>1. 事実</h2>
          <div className="statgrid">
            <div className="stat"><b>{m.plannedDays}</b><span>予定した日</span></div>
            <div className="stat"><b>{m.knownDays}</b><span>着手可否が分かった日</span></div>
            <div className="stat"><b>{m.startedDays}</b><span>着手した日</span></div>
            <div className="stat"><b>{m.changedDays}</b><span>合理的に変更した日</span></div>
            <div className="stat"><b>{m.restDays}</b><span>回復日</span></div>
            <div className="stat"><b>{m.unknownDays + m.unplannedDays}</b><span>未記録・未計画</span></div>
          </div>
          <p data-testid="d14-start-rate">{startRateText(m)}</p>
          {m.lowCoverage && <p className="banner info small" data-testid="d14-insufficient">未記録の日が多いため、データが不足しています。これは失敗ではありません。次の14日間は、記録の負担を減らす（夜の確認を1項目だけにする等）ことも選べます。</p>}
          <TextField label="実際に何が起きたか（任意）" value={notes.facts} onChange={set('facts')} multiline />
        </div>
      )}
      {step === 2 && (
        <div className="card" data-testid="d14-step2">
          <h2>2. 行動の変化</h2>
          <p>自分からの切替：{m.internalSwitches}件（観察した件数）<br />{returnRateText(m)}</p>
          <TextField label="着手までの障壁・中断と復帰のパターンで気づいたこと（任意）" value={notes.change} onChange={set('change')} multiline />
        </div>
      )}
      {step === 3 && (
        <div className="card" data-testid="d14-step3">
          <h2>3. 成長と成果</h2>
          <div className="layer a"><b>行動</b><p className="small">{startRateText(m)}{actionEv.length > 0 && <><br />証拠：{actionEv.map((e) => e.description).join('／')}</>}</p></div>
          <div className="layer b"><b>能力・学習</b><p className="small">{learning.length ? learning.map((e) => e.description).join('／') : '未計測'}</p></div>
          <div className="layer c"><b>現実の成果</b><p className="small" data-testid="d14-outcome">{outcomes[0]?.entries.length ? (outcomes[0].change !== null ? `${outcomes[0].baseline}${outcomes[0].unit ?? ''} → ${outcomes[0].latest}${outcomes[0].unit ?? ''}` : outcomes[0].entries.map((e) => e.description).join('／')) : '未測定'}</p></div>
          <div className="layer d"><b>価値との一致（本人の回答）</b><p className="small">{alignEv.length ? `沿っていた ${alignEv.filter((e) => e.payload.alignment === 'yes').length}日／一部 ${alignEv.filter((e) => e.payload.alignment === 'partly').length}日／沿っていなかった ${alignEv.filter((e) => e.payload.alignment === 'no').length}日` : '未回答'}</p></div>
          {m.startedDays >= 3 && !outcomes[0]?.entries.length && <p className="banner info small" data-testid="d14-feedback">行動は記録されていますが、成果はまだ確認できません。課題とのつながり・方法・相手（市場）の反応を見直しましょう。</p>}
          <TextField label="何ができるようになったか（任意）" value={notes.learning} onChange={set('learning')} />
          <TextField label="本人や周囲にどんな変化があったか（任意）" value={notes.outcome} onChange={set('outcome')} />
          <TextField label="その活動は望む生き方に合っていたか（任意）" value={notes.alignment} onChange={set('alignment')} />
          {data.lifeTime.enabled && <TextField label="後悔したくないことに、どんな一歩を選べたか（任意）" value={ltNote} onChange={setLtNote} />}
        </div>
      )}
      {step === 4 && (
        <div className="card" data-testid="d14-step4">
          <h2>4. 原因仮説は妥当だったか</h2>
          <p className="small faint">14日で無意識・人格・心理的な原因を確定しません。今の時点での見立てを本人が選びます。</p>
          {hyps.length === 0 && <p className="muted">初回に選んだ仮説はありません。</p>}
          {hyps.map((h) => (
            <div key={h} className="card flat">
              <p style={{ fontWeight: 650, margin: 0 }}>{HYPOTHESIS_EXPERIMENTS[h]?.label ?? h}</p>
              <p className="small faint">確かめること：{HYPOTHESIS_EXPERIMENTS[h]?.check}</p>
              <Choice legend={`${h} の見立て`} hideLegend column options={HYP_STATUS} value={hyp[h] ?? null} onChange={(v) => setHyp({ ...hyp, [h]: v })} />
            </div>
          ))}
        </div>
      )}
      {step === 5 && (
        <div className="card" data-testid="d14-step5">
          <h2>5. 次の自分の一歩</h2>
          <TextField label="続けたい（または新しい）重要行動" value={nextAction} onChange={setNextAction} testId="d14-next-action" />
          <TextField label="始める条件" value={cue} onChange={setCue} />
          <Choice legend="変える条件を1つだけ" options={CONDITIONS.map((c) => ({ value: c, label: c }))} value={cond} onChange={setCond} />
          <TextField label="次の14日間で「前進」と判断できる証拠" value={evidence} onChange={setEvidence} />
          <p className="small faint">理念・目標の仮案は「人生の軸」でいつでも更新できます。</p>
          <AsyncButton className="btn primary block" disabled={!nextAction.trim()} testId="d14-finish" onClick={async () => {
            const statuses = Object.values(hyp);
            await repo.saveReview({
              reviewKind: 'day14', periodStart: exp.startDate, periodEnd: exp.endDate,
              facts: `${startRateText(m)}。${notes.facts}`.trim(), hypothesisStatus: statuses[0] ?? 'insufficient', hypotheses: hyp,
              nextAction: nextAction.trim(), note: [notes.change, notes.learning, notes.outcome, notes.alignment, ltNote].filter(Boolean).join(' ／ ') || null,
              answers: { ...notes, changedCondition: cond, evidence, lifeTimeNote: ltNote || null },
            });
            if (notes.learning.trim()) await repo.addEvidence({ layer: 'learning', description: notes.learning.trim(), experimentId: exp.id, goalId: exp.goalId ?? null });
            const next = await repo.startNextExperiment({ fromExperimentId: exp.id, firstAction: nextAction.trim(), startCue: cue.trim() || exp.startCue, changedCondition: cond, evidenceText: evidence.trim() || null, hypothesisIds: hyps.filter((h) => hyp[h] !== 'rejected') });
            await repo.upsertPlan({ date: next.startDate, importantAction: nextAction.trim(), startCue: cue.trim() || exp.startCue });
            app.toast('次の14日間の実験を始めました。');
            app.navigate({ name: 'review' });
          }}>次の14日間を始める</AsyncButton>
        </div>
      )}
      <div className="btnrow">
        {step > 1 && <button className="btn ghost" onClick={() => setStep(step - 1)}>戻る</button>}
        {step < 5 && <button className="btn primary" onClick={() => setStep(step + 1)} data-testid="d14-next">次へ</button>}
      </div>
    </ReviewShell>
  );
}

const LONG_Q: Record<'day30' | 'day60' | 'day90', { title: string; qs: string[] }> = {
  day30: { title: 'Day30 継続の確認', qs: ['生活に埋め込める行動の条件は見つかりましたか？', '記録の負担を軽くできますか？必要な支援はありますか？'] },
  day60: { title: 'Day60 自分で判断できているか', qs: ['自分で原因を調べ、対策を選び、目標を修正できた例はありますか？', 'アプリに頼りすぎていないと感じますか？'] },
  day90: { title: 'Day90 成果と価値の確認', qs: ['目標に対して、実際の成果は生まれましたか？', '目標はまだ自分の価値観と一致していますか？必要なら中止・変更も合理的な選択です。'] },
};

function DayLong(props: { kind: 'day30' | 'day60' | 'day90' }) {
  const app = useApp();
  const { data, today } = app;
  const cfg = LONG_Q[props.kind];
  const start = app.day0 ?? addDays(today, -29);
  const m = useMemo(() => computeActionMetrics(data.dayPlans, data.events, start, today, today), [data, start, today]);
  const outcomes = computeOutcomes(data.goals, data.evidence);
  const autonomy = data.events.filter((e) => ['REPLAN', 'HYPOTHESIS_REVISED', 'GOAL_REVISED'].includes(e.kind)).length;
  const [a, setA] = useState(['', '']);
  const [goalDecision, setGoalDecision] = useState<string | null>(null);
  const [autonomyEx, setAutonomyEx] = useState('');
  return (
    <ReviewShell title={cfg.title}>
      <div className="card" data-testid={`review-${props.kind}`}>
        <div className="layer a"><b>行動・実行条件</b><p className="small">{startRateText(m)}</p></div>
        <div className="layer c"><b>成果</b><p className="small">{outcomes.filter((o) => o.entries.length).map((o) => `${o.goalTitle}：${o.change !== null ? `${o.baseline}→${o.latest}${o.unit ?? ''}` : `${o.entries.length}件の記録`}`).join('／') || '未計測'}</p></div>
        <div className="layer b"><b>自分で判断した記録</b><p className="small">計画変更・仮説や目標の見直し：{autonomy}件（回数より中身が大切です）</p></div>
        <hr className="divider" />
        {cfg.qs.map((q, i) => <TextField key={q} label={q} value={a[i]} onChange={(v) => setA(a.map((x, j) => (j === i ? v : x)))} multiline />)}
        <TextField label="自分で障壁・変更案・検証方法を選んだ具体例（任意）" value={autonomyEx} onChange={setAutonomyEx} multiline />
        <Choice legend="今の目標をどうしますか" column options={[{ value: 'continue', label: '続ける' }, { value: 'adjust', label: '方法・目標を修正する' }, { value: 'stop', label: '中止・変更する（合理的な選択）' }]} value={goalDecision} onChange={setGoalDecision} />
        <AsyncButton className="btn primary block" testId={`${props.kind}-save`} onClick={async () => {
          await repo.saveReview({ reviewKind: props.kind, periodStart: start, periodEnd: today, facts: startRateText(m), hypothesisStatus: 'not_applicable', nextAction: goalDecision, note: autonomyEx || null, answers: { q1: a[0], q2: a[1], goalDecision, autonomyEx } });
          app.toast('保存しました。');
          app.navigate(goalDecision === 'stop' || goalDecision === 'adjust' ? { name: 'compass' } : { name: 'review' });
        }}>保存する</AsyncButton>
      </div>
    </ReviewShell>
  );
}
