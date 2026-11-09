import { useMemo, useState, type ReactElement } from 'react';
import { useApp } from '../state';
import * as repo from '../db/repo';
import { evaluateRules, type UserContext } from '../domain/rules';
import { formatJpDate, localTimeOf } from '../domain/dates';
import { newId } from '../domain/id';
import type { AppEvent, DayMode, DayPlan } from '../domain/schema';
import { AsyncButton, Choice, Ico, Sheet, TextField } from '../ui/kit';
import { installContext } from '../ui/platform';
import { SafetySheet } from './Safety';

const STATUS_LABEL: Record<string, string> = {
  planned: '予定', in_progress: '実行中', paused: '中断中', completed: '完了', not_started: '未実行', changed: '計画を変更', rest: '回復する日', unknown: '不明', unplanned: '未計画',
};

type SheetKind = null | 'plan' | 'internal' | 'external' | 'unsure' | 'change' | 'complete' | 'evening' | 'safety' | 'rest';

export function Today() {
  const app = useApp();
  const { data, today, todayPlan: plan, previousPlan, experiment, navigate, toast } = app;
  const [sheet, setSheet] = useState<SheetKind>(app.pendingLink || location.hash === '#/today/edit' ? 'plan' : null);
  const [ctx, setCtx] = useState<UserContext>(null);
  const workshopDone = data.workshop.status === 'completed';
  const compass = data.lifeCompass;
  const valueLine = compass.desiredWayOfLiving || (compass.values ?? []).join('・');
  const isRest = plan?.dayMode === 'recover' || plan?.status === 'rest';
  const hasAction = !!plan?.importantAction && !isRest && plan.status !== 'changed';
  const exploring = !app.goal || compass.status === 'exploring' || experiment?.experimentKind === 'exploration';

  const todayEvents = data.events.filter((e) => e.localDate === today);
  const openInterrupt = [...todayEvents].reverse().find((e) => e.kind === 'EXTERNAL_INTERRUPT' && e.planId === plan?.id && !e.payload.resumeOutcome && !e.payload.backfilled);
  const todayEvidence = data.evidence.filter((e) => ((e as { localDate?: string }).localDate ?? e.observedAt.slice(0, 10)) === today);
  const reviewedToday = todayEvents.some((e) => e.kind === 'DAILY_REVIEW');
  const alignmentToday = todayEvents.find((e) => e.kind === 'DAILY_REVIEW')?.payload.alignment as string | undefined;

  const advice = useMemo(() => evaluateRules({
    currentRoute: data.profile.selectedRoute ?? null,
    compassStatus: compass.status,
    hasActiveGoal: !!app.goal,
    sharingResistance: data.profile.sharingResistance ?? null,
    hypothesisIds: experiment?.hypothesisIds ?? [],
    todayPlan: plan,
    context: ctx,
    selfReportedState: {},
    recentStartedDays: app.cycleMetrics?.startedDays ?? 0,
    hasOutcomeMeasure: !!(app.goal?.outcomeMeasure?.unit || app.goal?.outcomeMeasure?.description),
    recentOutcomeEvidence: data.evidence.filter((e) => e.layer === 'outcome' && e.observedAt >= (experiment?.startDate ?? '')).length,
    recentEvents: data.events.filter((e) => experiment && e.localDate >= experiment.startDate),
  }), [data, plan, ctx, app.goal, app.cycleMetrics, experiment, compass.status]);

  const suggested = previousPlan?.importantAction ?? experiment?.firstAction ?? null;
  const suggestedCue = previousPlan?.startCue ?? experiment?.startCue ?? null;
  const close = () => { setSheet(null); setCtx(null); app.setPendingLink(null); if (location.hash === '#/today/edit') history.replaceState(null, '', '#/today'); };

  return (
    <div data-testid="today">
      {installContext() === 'ios-safari' && workshopDone && (
        <div className="banner warn small">Safariで利用中です。ホーム画面のアプリ版とは保存場所が別になることがあります。<a href="#/settings">こまめにバックアップ</a>してください。</div>
      )}
      {app.due.length > 0 && (
        <a className="banner info" href={`#/review/${app.due[0].kind}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }} data-testid="due-banner">
          {app.due[0].title}ができます（省略しても問題ありません）→
        </a>
      )}

      {!workshopDone && (
        <div className="card hero" data-testid="continue-workshop">
          <div className="eyebrow">初回ワーク</div>
          <h2>{data.workshop.status === 'in_progress' ? '初回ワークの続きから再開できます' : '初回ワークから始めましょう'}</h2>
          <p className="muted small">回答は途中保存されています。目的・目標が決まっていなくても始められます。</p>
          <button className="btn primary block" onClick={() => navigate({ name: 'workshop' })} data-testid="resume-workshop">
            {data.workshop.status === 'in_progress' ? '続きから再開' : '初回ワークを始める'}
          </button>
        </div>
      )}

      <section className="card hero" aria-labelledby="today-h">
        <div className="row">
          <div className="grow">
            <div className="kicker">{formatJpDate(today)}</div>
            <h1 id="today-h" className="sr-only">今日</h1>
          </div>
        </div>
        <p style={{ margin: '4px 0 10px' }}>
          <span className="faint small">あなたの大切なこと：</span>
          {valueLine ? <span>{valueLine}{compass.status !== 'committed' ? '（仮）' : ''}</span> : <span className="faint">探索中</span>}
        </p>

        <ModeSwitch plan={plan} today={today} onRecover={() => setSheet('rest')} />

        {app.goal && <p className="small muted" style={{ margin: '8px 0 0' }}>今の方向性：{app.goal.title}</p>}
        <hr className="divider" />

        {isRest ? (
          <div data-testid="rest-card">
            <span className="status-pill rest">回復する日</span>
            <p style={{ marginTop: 10 }}>休むことも、本人の大切な価値を守る選択です。仕事の未達成としては扱いません。</p>
            {plan?.note && <p className="muted small">守りたいもの：{plan.note}</p>}
            <button className="linkbtn" onClick={() => setSheet('rest')}>何を守る休息かメモする（任意）</button>
          </div>
        ) : hasAction ? (
          <ActionBlock plan={plan!} openInterrupt={openInterrupt} onSheet={setSheet} exploring={exploring} />
        ) : (
          <div data-testid="no-plan">
            <div className="eyebrow">{exploring ? '今日の探索' : '今日の最重要行動'}</div>
            {plan?.status === 'changed' && <p className="small muted">今日は計画を変更しました（合理的な変更として記録済み）。</p>}
            {suggested && workshopDone ? (
              <>
                <p className="small faint" style={{ marginBottom: 2 }}>前回選んだ行動</p>
                <p className="action-title">{suggested}</p>
                {suggestedCue && <p className="cue-line">{Ico.cue}<span><b>始める合図</b>{suggestedCue}</span></p>}
                <div className="btnrow">
                  <AsyncButton className="btn primary" testId="same-as-before" onClick={async () => { await repo.upsertPlan({ date: today, importantAction: suggested, startCue: suggestedCue, doneWhen: previousPlan?.doneWhen ?? experiment?.doneWhen ?? null, dayMode: plan?.dayMode === 'prepare' ? 'prepare' : 'advance' }); }}>今日もこれ</AsyncButton>
                  <button className="btn" onClick={() => setSheet('plan')} data-testid="change-plan">変更する</button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">{exploring ? '価値観を探す小さな体験を1つ選びましょう。仮の一行で大丈夫です。' : '最初の5分で何をするか、1つだけ決めましょう。'}</p>
                <button className="btn primary block" onClick={() => setSheet('plan')} data-testid="set-plan">{exploring ? '今日の探索行動を決める' : '最初の5分を決める'}</button>
              </>
            )}
          </div>
        )}
      </section>

      {hasAction && (
        <>
          <div className="section-label">必要なときだけ（15〜30秒）</div>
          <div className="assist">
            <button className="btn" onClick={() => { setCtx('internal'); setSheet('internal'); }} data-testid="btn-internal">{Ico.shuffle}別のことをしたい</button>
            <button className="btn" onClick={() => { setCtx('external'); setSheet('external'); }} data-testid="btn-external">{Ico.bolt}予定外の対応が入った</button>
            <button className="btn" onClick={() => { setCtx('unsure_method'); setSheet('unsure'); }} data-testid="btn-unsure">{Ico.question}何から始めるか分からない</button>
            <button className="btn" onClick={() => setSheet('change')} data-testid="btn-change">{Ico.edit}今日は計画を変更する</button>
          </div>
        </>
      )}

      {advice.ruleId !== 'R_NORMAL' && !sheet && workshopDone && (
        <div className="card advice" data-testid={`advice-${advice.ruleId}`}>
          <div className="eyebrow">提案（採用は自由です）</div>
          <p style={{ marginBottom: 4 }}>{advice.message}</p>
          {advice.observedFacts.length > 0 && <p className="facts">{advice.observedFacts.join(' ')}</p>}
          {advice.uncertainty && <p className="facts">{advice.uncertainty}</p>}
          {advice.ruleId === 'R_FEEDBACK' && <a className="btn sm cyan" href="#/growth">成果の確かめ方を決める</a>}
        </div>
      )}

      <section className="card" aria-labelledby="progress-h">
        <h2 id="progress-h" style={{ fontSize: '1rem' }}>今日の前進</h2>
        <div className="layers-line">
          <div><b>行動</b>{plan?.status === 'completed' ? '完了' : plan?.status === 'in_progress' || plan?.status === 'paused' ? '着手' : isRest ? '回復日' : '未記録'}</div>
          <div><b>学び</b>{todayEvidence.some((e) => e.layer === 'learning') ? '記録あり' : '未記録'}</div>
          <div><b>成果</b>{todayEvidence.some((e) => e.layer === 'outcome') ? '記録あり' : '未計測'}</div>
          <div><b>価値</b>{alignmentToday === 'yes' ? '沿っていた' : alignmentToday === 'partly' ? '一部' : alignmentToday === 'no' ? '沿わず' : '未回答'}</div>
        </div>
        <button className="btn cyan block" style={{ marginTop: 12 }} onClick={() => setSheet('evening')} data-testid="btn-evening">
          {reviewedToday ? '夜の確認（記録済み・追記する）' : '夜の1分確認'}
        </button>
      </section>

      {data.lifeTime.enabled && data.lifeTime.homeCard === 'gentle' && (
        <a className="card flat" href="#/compass/lifeclock" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }} data-testid="lifetime-home-card">
          <span className="small gold">大切な時間の使い方</span>
          <p style={{ margin: 0 }}>今日、大切にすることは？</p>
        </a>
      )}

      <button className="linkbtn small" onClick={() => setSheet('safety')} data-testid="btn-safety">安全上の問題がある・とてもつらいとき</button>

      {sheet === 'plan' && <PlanSheet onClose={close} />}
      {sheet === 'rest' && <RestSheet plan={plan} today={today} onClose={close} />}
      {sheet === 'internal' && plan && <InternalSheet plan={plan} adviceMessage={advice.message} facts={advice.observedFacts} onClose={close} onEdit={() => setSheet('plan')} />}
      {sheet === 'external' && <ExternalSheet plan={plan} today={today} facts={advice.observedFacts} onClose={close} />}
      {sheet === 'unsure' && <UnsureSheet onClose={close} onEdit={() => setSheet('plan')} />}
      {sheet === 'change' && plan && <ChangeSheet plan={plan} onClose={close} onEdit={() => setSheet('plan')} />}
      {sheet === 'complete' && plan && <CompleteSheet plan={plan} onClose={close} onDone={() => toast('完了を記録しました。')} />}
      {sheet === 'evening' && <EveningSheet onClose={close} />}
      {sheet === 'safety' && <SafetySheet onClose={close} />}
    </div>
  );
}

function ModeSwitch(props: { plan: DayPlan | null; today: string; onRecover: () => void }) {
  const mode = props.plan?.dayMode ?? null;
  const opts: { value: DayMode; label: string; sub: string; icon: ReactElement }[] = [
    { value: 'advance', label: '前進', sub: '成果へ進む', icon: Ico.advance },
    { value: 'prepare', label: '整える', sub: '学び・準備', icon: Ico.prepare },
    { value: 'recover', label: '回復', sub: '休息・家族', icon: Ico.recover },
  ];
  return (
    <fieldset className="chips mode-switch" style={{ display: 'grid' }} data-testid="mode-switch">
      <legend className="small" style={{ gridColumn: '1 / -1' }}>今日はどんな日？</legend>
      {opts.map((o) => (
        <label className="chip" key={o.value}>
          <input
            type="radio"
            name="daymode"
            checked={mode === o.value}
            onChange={async () => {
              if (o.value === 'recover') {
                await repo.setDayMode(props.today, 'recover');
                props.onRecover();
              } else await repo.setDayMode(props.today, o.value);
            }}
            data-testid={`mode-${o.value}`}
          />
          {o.icon}
          {o.label}
          <small>{o.sub}</small>
        </label>
      ))}
    </fieldset>
  );
}

function ActionBlock(props: { plan: DayPlan; openInterrupt?: AppEvent; onSheet: (s: SheetKind) => void; exploring: boolean }) {
  const { plan, openInterrupt } = props;
  const app = useApp();
  const s = plan.status;
  const lastStart = [...app.data.events].reverse().find((e) => e.planId === plan.id && (e.kind === 'ACTION_STARTED' || e.kind === 'ACTION_RESUMED'));
  return (
    <div data-testid="action-block" className="action-hero">
      <div className="row">
        <div className="eyebrow grow" style={{ marginBottom: 0 }}>{props.exploring ? '今日の探索' : '今日の最重要行動'}</div>
        <span className={`status-pill ${s === 'in_progress' ? 'active' : s === 'completed' ? 'done' : ''}`} data-testid="plan-status">{STATUS_LABEL[s]}</span>
      </div>
      <p className="action-title" data-testid="important-action">{plan.importantAction}</p>
      {plan.startCue && <p className="cue-line">{Ico.cue}<span><b>始める合図</b>{plan.startCue}</span></p>}
      {s === 'in_progress' && lastStart && <div className="live">{localTimeOf(lastStart.occurredAt, app.tz)} から取り組んでいます</div>}
      {plan.doneWhen && <p className="small faint">終了の目安：{plan.doneWhen}</p>}
      {plan.priorityReason && <details><summary className="small">なぜ今これを優先するか</summary><p className="small muted">{plan.priorityReason}</p></details>}
      {plan.displacedActivity && <p className="small faint">置き換える時間：{plan.displacedActivity}</p>}

      {openInterrupt && (
        <div className="resume-box" data-testid="resume-box">
          <div className="small cyan">予定外の対応で中断中</div>
          {typeof openInterrupt.payload.resumeFirstStep === 'string' && openInterrupt.payload.resumeFirstStep && <p style={{ margin: '4px 0' }}>再開する最初の1操作：<strong>{openInterrupt.payload.resumeFirstStep}</strong></p>}
          {typeof openInterrupt.payload.resumeAt === 'string' && openInterrupt.payload.resumeAt && <p className="small muted" style={{ margin: 0 }}>再開予定：{openInterrupt.payload.resumeAt}（過ぎても問題ありません）</p>}
          <div className="btnrow" style={{ marginTop: 8 }}>
            <AsyncButton className="btn primary sm" testId="resume-from-interrupt" onClick={() => repo.setInterruptOutcome(openInterrupt.id, 'resumed')}>戻って再開する</AsyncButton>
            <AsyncButton className="btn sm ghost" testId="not-resumed" onClick={() => repo.setInterruptOutcome(openInterrupt.id, 'not_resumed')}>今日は戻れなかった</AsyncButton>
          </div>
        </div>
      )}

      {(s === 'planned' || s === 'not_started' || s === 'unknown') && (
        <AsyncButton className="btn primary xl block" testId="btn-start" onClick={() => repo.startAction(plan.id)}>{Ico.play}今から始める</AsyncButton>
      )}
      {s === 'in_progress' && (
        <div className="btnrow">
          <AsyncButton className="btn" testId="btn-pause" onClick={() => repo.pauseAction(plan.id)}>{Ico.pause}一時停止</AsyncButton>
          <button className="btn primary" data-testid="btn-complete" onClick={() => props.onSheet('complete')}>{Ico.check}完了した</button>
        </div>
      )}
      {s === 'paused' && !openInterrupt && (
        <div className="btnrow">
          <AsyncButton className="btn primary" testId="btn-resume" onClick={() => repo.resumeAction(plan.id)}>{Ico.play}再開する</AsyncButton>
          <button className="btn" onClick={() => props.onSheet('complete')}>完了した</button>
        </div>
      )}
      {s === 'completed' && (
        <div className="done-moment" data-testid="completed-msg">
          <div className="medal" aria-hidden="true">{Ico.check}</div>
          <p className="done-title">今日の一歩を、自分で選んで実行しました。</p>
          <p className="small muted" style={{ margin: 0 }}>何をしたか・学んだことは、夜の確認で追記できます。</p>
        </div>
      )}
    </div>
  );
}

/** 今日の最重要行動の編集（LIFE CLOCKからの導線もここに入る） */
export function PlanSheet(props: { onClose: () => void; date?: string }) {
  const app = useApp();
  const date = props.date ?? app.today;
  const plan = date === app.today ? app.todayPlan : null;
  const link = app.pendingLink;
  const [action, setAction] = useState(plan?.importantAction ?? '');
  const [cue, setCue] = useState(plan?.startCue ?? app.experiment?.startCue ?? '');
  const [doneWhen, setDoneWhen] = useState(plan?.doneWhen ?? '');
  const [reason, setReason] = useState(link?.reason ?? plan?.priorityReason ?? '');
  const [displaced, setDisplaced] = useState(plan?.displacedActivity ?? '');
  const exploring = !app.goal || app.data.lifeCompass.status === 'exploring';
  return (
    <Sheet title={exploring ? '今日の探索行動' : '今日の最重要行動'} eyebrow="1件だけ選ぶ" onClose={props.onClose} testId="plan-sheet">
      {link && <p className="banner info small">人生の時間から選んだ一歩です。保存しても「実行済み」にはなりません。</p>}
      <TextField label="何をするか（動詞＋対象）" value={action} onChange={setAction} placeholder={exploring ? '例：気になる講座の紹介ページを1つ読む' : '例：提案の下書きを5分書く'} testId="plan-action" />
      <TextField label="いつ・どんな状況で始めるか（任意）" value={cue} onChange={setCue} placeholder="例：朝食後、机で5分" />
      <TextField label="終わりの目安（任意）" value={doneWhen} onChange={setDoneWhen} />
      <details>
        <summary className="small">なぜ今これを優先するか・何の時間を置き換えるか（任意）</summary>
        <TextField label="選んだ理由（任意）" value={reason} onChange={setReason} multiline />
        <TextField label="置き換える時間（任意）" value={displaced} onChange={setDisplaced} />
      </details>
      <p className="small faint">仕事以外の行動（家族・健康・休息など）も、価値ある一歩として選べます。</p>
      <AsyncButton
        className="btn primary block"
        testId="plan-save"
        disabled={!action.trim()}
        onClick={async () => {
          const p = await repo.upsertPlan({ date, importantAction: action.trim(), startCue: cue.trim() || null, doneWhen: doneWhen.trim() || null, priorityReason: reason.trim() || null, displacedActivity: displaced.trim() || null });
          if (link) await repo.linkReflectionToPlan(link.reflectionId, p.id);
          app.toast('今日の行動を保存しました。');
          props.onClose();
          if (link) app.navigate({ name: 'today' });
        }}
      >
        保存する
      </AsyncButton>
    </Sheet>
  );
}

function RestSheet(props: { plan: DayPlan | null; today: string; onClose: () => void }) {
  const [note, setNote] = useState(props.plan?.note ?? '');
  return (
    <Sheet title="回復する日" eyebrow="休むことも価値ある選択" onClose={props.onClose} testId="rest-sheet">
      <p>休むことも、本人の大切な価値を守る選択です。今日は何を回復させたいですか？（回答任意）</p>
      <TextField label="何を守る休息か（任意）" value={note} onChange={setNote} placeholder="例：家族との時間、体調" />
      <AsyncButton className="btn primary block" testId="rest-save" onClick={async () => { await repo.setDayMode(props.today, 'recover', note.trim() || null); props.onClose(); }}>保存する</AsyncButton>
    </Sheet>
  );
}

const SWITCH_REASONS = ['難しい', '面倒', '不安', '今はこちらが重要', '疲労', '不明'] as const;

function InternalSheet(props: { plan: DayPlan; adviceMessage: string; facts: string[]; onClose: () => void; onEdit: () => void }) {
  const [opId] = useState(() => newId('ev'));
  const [other, setOther] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [feeling, setFeeling] = useState('');
  const record = (decision: repo.InternalSwitchInput['decision']) =>
    repo.recordInternalSwitch({ opId, planId: props.plan.id, date: props.plan.localDate, otherActivity: other.trim() || null, reason, feeling: feeling.trim() || null, decision });
  return (
    <Sheet title="別のことをしたくなった" eyebrow="内的な切替" onClose={props.onClose} testId="internal-sheet">
      <p>{props.adviceMessage}</p>
      {props.facts.length > 0 && <p className="small faint">{props.facts.join(' ')}</p>}
      <p className="small muted">予定していた行動：{props.plan.importantAction}</p>
      <TextField label="今やりたい別のこと（任意）" value={other} onChange={setOther} placeholder="例：資料整理" />
      <Choice legend="理由を1つ（任意）" options={SWITCH_REASONS.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
      <TextField label="今の気持ち（任意）" value={feeling} onChange={setFeeling} />
      <p className="small faint">選んだことだけを記録します。「逃避」などのラベルは付けません。</p>
      <div className="options-col" style={{ display: 'grid', gap: 8 }}>
        <AsyncButton className="btn primary" testId="sw-two-minutes" onClick={async () => { await record('two_minutes'); props.onClose(); }}>2分だけ始める</AsyncButton>
        <AsyncButton className="btn" testId="sw-smaller" onClick={async () => { await record('smaller'); props.onEdit(); }}>今の行動をさらに小さくする</AsyncButton>
        <AsyncButton className="btn" testId="sw-replan" onClick={async () => { await record('replan'); props.onEdit(); }}>合理的に再計画する</AsyncButton>
        <AsyncButton className="btn" testId="sw-other" onClick={async () => { await record('other_activity'); props.onClose(); }}>今は別のことをする（記録だけ）</AsyncButton>
        <AsyncButton className="btn ghost" testId="sw-rest" onClick={async () => { await record('rest'); props.onClose(); }}>休息する</AsyncButton>
      </div>
    </Sheet>
  );
}

function ExternalSheet(props: { plan: DayPlan | null; today: string; facts: string[]; onClose: () => void }) {
  const [opId] = useState(() => newId('ev'));
  const [step, setStep] = useState<'ask' | 'detail'>('ask');
  const [triage, setTriage] = useState<'now' | 'delegate' | 'later' | null>(null);
  const [first, setFirst] = useState('');
  const [at, setAt] = useState('');
  const [summary, setSummary] = useState('');
  if (step === 'ask') {
    return (
      <Sheet title="予定外の対応が入った" eyebrow="外部からの中断" onClose={props.onClose} testId="external-sheet">
        <p><strong>人命・安全・重大な損失に関わる場合は、今すぐ対応してください。</strong>入力は不要です。</p>
        <AsyncButton className="btn danger block" testId="ext-critical" onClick={async () => {
          await repo.recordExternalInterrupt({ opId, planId: props.plan?.id ?? null, date: props.today, critical: true });
          props.onClose();
        }}>緊急の対応へ（記録は最小限）</AsyncButton>
        <hr className="divider" />
        <p className="muted">それ以外の場合、少しだけ確認しましょう。</p>
        {props.facts.length > 0 && <p className="small faint">{props.facts.join(' ')}</p>}
        <Choice legend="この対応は…" column options={[{ value: 'now', label: '今対応が必要' }, { value: 'delegate', label: '誰かに任せられる' }, { value: 'later', label: '後に回せる' }]} value={triage} onChange={(v) => { setTriage(v as typeof triage); setStep('detail'); }} />
      </Sheet>
    );
  }
  return (
    <Sheet title="戻る場所を残す" eyebrow="外部からの中断" onClose={props.onClose} testId="external-detail">
      {triage === 'later' && <p className="muted small">後に回せるなら、今の行動を続けても大丈夫です。中断として記録だけ残せます。</p>}
      {triage === 'delegate' && <p className="muted small">任せる相手に依頼したら、元の行動に戻りましょう。</p>}
      <TextField label="何の対応か（任意）" value={summary} onChange={setSummary} placeholder="例：顧客からの問い合わせ" />
      {props.plan && <>
        <TextField label="再開する最初の1操作" value={first} onChange={setFirst} placeholder="例：下書きの2行目から書く" testId="ext-first-step" />
        <TextField label="再開予定（任意）" type="time" value={at} onChange={setAt} testId="ext-resume-at" />
      </>}
      <AsyncButton className="btn primary block" testId="ext-save" onClick={async () => {
        await repo.recordExternalInterrupt({ opId, planId: props.plan?.id ?? null, date: props.today, critical: false, triage, summary: summary.trim() || null, resumeFirstStep: first.trim() || null, resumeAt: at || null });
        props.onClose();
      }}>保存して対応する</AsyncButton>
    </Sheet>
  );
}

const UNSURE = [
  { id: 'first_step', label: '① 最初の操作が分からない', advice: '3ステップに分けて、最初の1つだけを今日の行動にしましょう。', action: 'split' },
  { id: 'skill', label: '② 必要な能力・情報が足りない', advice: '学ぶ・相談することを今日の一歩にできます（例：詳しい人に1つ質問する）。', action: 'learn' },
  { id: 'efficacy', label: '③ 達成できる気がしない', advice: 'できないと決める前に、方法を知るための5分の実験を選びますか？', action: 'experiment' },
  { id: 'load', label: '④ 負担が大きい', advice: '量を減らしましょう。半分、または2分で終わる形に変えて構いません。', action: 'reduce' },
] as const;

function UnsureSheet(props: { onClose: () => void; onEdit: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [steps, setSteps] = useState(['', '', '']);
  const app = useApp();
  const chosen = UNSURE.find((u) => u.id === pick);
  return (
    <Sheet title="何から始めるか分からない" eyebrow="方法を小さくする" onClose={props.onClose} testId="unsure-sheet">
      <Choice legend="近いものを選んでください" column options={UNSURE.map((u) => ({ value: u.id, label: u.label }))} value={pick} onChange={setPick} />
      {chosen && <div className="card flat"><p style={{ margin: 0 }}>{chosen.advice}</p></div>}
      {pick === 'first_step' && (
        <>
          {steps.map((s, i) => <TextField key={i} label={`ステップ${i + 1}`} value={s} onChange={(v) => setSteps(steps.map((x, j) => (j === i ? v : x)))} />)}
          <AsyncButton className="btn primary block" disabled={!steps[0].trim()} testId="unsure-save-steps" onClick={async () => {
            await repo.upsertPlan({ date: app.today, importantAction: steps[0].trim(), note: `3ステップ：${steps.filter((s) => s.trim()).join(' → ')}`, replanReason: '3ステップに分けた' });
            props.onClose();
          }}>ステップ1を今日の行動にする</AsyncButton>
        </>
      )}
      {pick && pick !== 'first_step' && <button className="btn primary block" onClick={props.onEdit}>今日の行動を変更する</button>}
    </Sheet>
  );
}

function ChangeSheet(props: { plan: DayPlan; onClose: () => void; onEdit: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet title="今日は計画を変更する" eyebrow="合理的な変更" onClose={props.onClose} testId="change-sheet">
      <p className="muted small">予定の変更は未着手とは区別して記録します。元の予定も残ります。</p>
      <button className="btn primary block" onClick={props.onEdit} data-testid="change-edit">別の行動に変える</button>
      <hr className="divider" />
      <TextField label="今日は予定しない理由（任意）" value={reason} onChange={setReason} />
      <AsyncButton className="btn block" testId="change-cancel" onClick={async () => { await repo.markPlanChanged(props.plan.id, reason.trim() || null); props.onClose(); }}>今日はこの行動を予定しない</AsyncButton>
    </Sheet>
  );
}

function CompleteSheet(props: { plan: DayPlan; onClose: () => void; onDone: () => void }) {
  const [what, setWhat] = useState('');
  const [minutes, setMinutes] = useState('');
  return (
    <Sheet title="完了を記録" eyebrow="行動の証拠" onClose={props.onClose} testId="complete-sheet">
      <TextField label="具体的に何をしたか（任意）" value={what} onChange={setWhat} placeholder="例：提案書を1件送った" testId="complete-what" />
      <TextField label="かかった時間・分（任意）" type="number" inputMode="numeric" value={minutes} onChange={setMinutes} />
      <AsyncButton className="btn primary block" testId="complete-save" onClick={async () => {
        await repo.completeAction(props.plan.id, { what: what.trim() || null, minutes: minutes ? Number(minutes) : null });
        props.onDone();
        props.onClose();
      }}>完了として保存</AsyncButton>
    </Sheet>
  );
}

const EVENING_OPTIONS: { value: repo.EveningStatus; label: string }[] = [
  { value: 'started', label: '着手した' }, { value: 'completed', label: '完了した' }, { value: 'changed', label: '変更した' },
  { value: 'rest', label: '休息した' }, { value: 'not_started', label: '未実行' }, { value: 'unknown', label: '分からない' },
];

function guessStatus(p: DayPlan | null): repo.EveningStatus | null {
  if (!p) return null;
  if (p.status === 'completed') return 'completed';
  if (p.status === 'in_progress' || p.status === 'paused') return 'started';
  if (p.status === 'rest') return 'rest';
  if (p.status === 'changed') return 'changed';
  return null;
}

export function EveningSheet(props: { onClose: () => void; date?: string }) {
  const app = useApp();
  const date = props.date ?? app.today;
  const plan = app.data.dayPlans.filter((p) => p.localDate === date).pop() ?? null;
  const [opId] = useState(() => newId('ev'));
  const [status, setStatus] = useState<repo.EveningStatus | null>(guessStatus(plan));
  const [progress, setProgress] = useState('');
  const [learning, setLearning] = useState('');
  const [outcomeText, setOutcomeText] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState(app.goal?.outcomeMeasure?.unit ?? '');
  const [alignment, setAlignment] = useState<'yes' | 'partly' | 'no' | null>(null);
  const [tomorrow, setTomorrow] = useState('');
  const [ltNote, setLtNote] = useState('');
  return (
    <Sheet title="夜の確認（1〜2分）" eyebrow={formatJpDate(date)} onClose={props.onClose} testId="evening-sheet">
      {plan?.importantAction && <p className="small muted">予定した行動：{plan.importantAction}</p>}
      <Choice legend="予定した重要行動は？" options={EVENING_OPTIONS} value={status} onChange={setStatus} />
      <TextField label="具体的に進んだこと（任意）" value={progress} onChange={setProgress} placeholder="例：提案書を送った" testId="ev-progress" />
      <TextField label="できるようになったこと・学び（任意・1行）" value={learning} onChange={setLearning} testId="ev-learning" />
      <details>
        <summary className="small">結果が出た場合の成果（任意。なければ未計測のまま）</summary>
        <div className="inline-fields">
          <TextField label="数値" type="number" inputMode="decimal" value={qty} onChange={setQty} testId="ev-qty" />
          <TextField label="単位" value={unit} onChange={setUnit} />
        </div>
        <TextField label="または文章で" value={outcomeText} onChange={setOutcomeText} />
      </details>
      <Choice legend="自分の大切なことに沿う選択だったと思う？（任意）" options={[{ value: 'yes', label: '沿っていた' }, { value: 'partly', label: '一部' }, { value: 'no', label: '沿っていなかった' }]} value={alignment} onChange={(v) => setAlignment(v as typeof alignment)} />
      {app.data.lifeTime.enabled && (
        <TextField label="限りある時間の使い方で、自分で選べたことは？（任意）" value={ltNote} onChange={setLtNote} />
      )}
      <TextField label="明日の最重要行動（任意・スキップ可）" value={tomorrow} onChange={setTomorrow} testId="ev-tomorrow" placeholder={plan?.importantAction ?? ''} />
      {plan?.importantAction && !tomorrow && <button className="btn sm ghost" onClick={() => setTomorrow(plan.importantAction ?? '')} data-testid="ev-same">今日と同じ行動にする</button>}
      <AsyncButton className="btn primary block" testId="ev-save" onClick={async () => {
        await repo.saveEveningReview({
          opId, date, status, progress, learning, outcomeText, outcomeQuantity: qty === '' ? null : Number(qty), outcomeUnit: unit || null,
          alignment, tomorrowAction: tomorrow.trim() || null, lifeTimeNote: ltNote.trim() || null,
        });
        app.toast(`夜の確認を保存しました（${localTimeOf(new Date(), app.tz)}）`);
        props.onClose();
      }}>保存する</AsyncButton>
    </Sheet>
  );
}
