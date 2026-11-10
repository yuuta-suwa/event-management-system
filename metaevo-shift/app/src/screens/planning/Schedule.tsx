/** 今日 > 今日の計画：07:00〜25:00 の時間割、実行記録、IF→THEN、翌日への持ち越し候補 */
import { useMemo, useState } from 'react';
import { useApp } from '../../state';
import * as prepo from '../../db/planningRepo';
import { getDayMode, primaryActionIdFor } from '../../db/bridge';
import { updatePreferences } from '../../db/repo';
import {
  actionCompleted, activeBlocks, blockDateTime, blockExecState, carryOverCandidates, dayExecMetrics, DAY_END_MIN, DAY_START_MIN, EXEC_STATE_LABEL, fmtMinute,
  freeSlots, IF_CONDITIONS, IF_LABEL, INTERRUPT_LABEL, INTERRUPT_REASONS, isPlannable, overlaps, parseHm, plannedMinutes, quadrantOf, rateText, suggestForCondition,
  type IfCondition, type InterruptReason, type PlanNode, type ScheduleBlock,
} from '../../domain/planning';
import { addDays, formatJpDate, localTimeOf } from '../../domain/dates';
import { newId } from '../../domain/id';
import { AsyncButton, Choice, Ico, Sheet, TextField } from '../../ui/kit';
import { PlaceSheet } from './shared';
import { clock } from '../../db/repo';

const PX_PER_MIN = 1.1;
const MODE_LABEL = { advance: '前進する日', prepare: '整える日', recover: '回復する日' } as const;

export function Schedule() {
  const app = useApp();
  const { data, today } = app;
  const ep = data.executionPlanning;
  const [date, setDate] = useState(today);
  const [place, setPlace] = useState<{ action: PlanNode; start?: number; from?: ScheduleBlock } | null>(null);
  const [pickAt, setPickAt] = useState<number | null>(null);
  const [blockOpen, setBlockOpen] = useState<ScheduleBlock | null>(null);
  const [ifthen, setIfthen] = useState(false);
  const [dragOverMin, setDragOverMin] = useState<number | null>(null);
  const mode = getDayMode(data, date);
  const primaryId = primaryActionIdFor(data, date);
  const dayPlan = data.dayPlans.filter((p) => p.localDate === date).pop();
  const blocks = activeBlocks(ep.scheduleBlocks, date);
  const m = dayExecMetrics(ep, date, primaryId);
  const titleOf = (id: string) => ep.planNodes.find((n) => n.id === id)?.title ?? '（見つかりません）';
  const free = freeSlots(ep.scheduleBlocks, date);
  const planned = plannedMinutes(ep.scheduleBlocks, date);
  const total = DAY_END_MIN - DAY_START_MIN;
  const buffer = Number((data.preferences as { bufferPercent?: number }).bufferPercent ?? 20);
  const plannables = ep.planNodes.filter((n) => isPlannable(n) && !n.archivedAt && !actionCompleted(ep.executionEvents, n.id) && n.triage !== 'drop' && n.triage !== 'delegate');
  const unscheduled = plannables.filter((n) => !ep.scheduleBlocks.some((b) => b.actionId === n.id && b.state === 'placed' && b.planDate >= today));
  const carry = date <= today ? carryOverCandidates(ep, date) : [];
  const nowMin = date === today ? (parseHm(localTimeOf(clock.now(), app.tz)) ?? 0) : null;
  const showCarry = carry.length > 0 && (date < today || (nowMin !== null && nowMin >= 20 * 60));

  const hours = useMemo(() => Array.from({ length: 19 }, (_, i) => 7 + i), []);
  const minuteAtY = (y: number) => Math.min(DAY_END_MIN - 15, Math.max(DAY_START_MIN, DAY_START_MIN + Math.floor(y / PX_PER_MIN / 15) * 15));

  return (
    <div data-testid="schedule">
      <nav className="crumbs"><a href="#/today">今日</a><span>今日の計画</span></nav>
      <div className="row">
        <h1 className="grow" style={{ marginBottom: 0 }}>今日の計画</h1>
        <a className="btn sm ghost" href="#/today/priority">優先順位</a>
      </div>
      <div className="datenav">
        <button className="btn sm ghost" onClick={() => setDate(addDays(date, -1))} aria-label="前の日">←</button>
        <strong data-testid="sched-date">{formatJpDate(date)}{date === today ? '（今日）' : ''}</strong>
        <button className="btn sm ghost" onClick={() => setDate(addDays(date, 1))} aria-label="次の日" data-testid="next-day">→</button>
        {date !== today && <button className="btn sm ghost" onClick={() => setDate(today)}>今日へ</button>}
      </div>

      <section className="card hero" data-testid="sched-focus">
        <div className="row"><span className="eyebrow grow">今日の最重要行動（1件）</span>{mode && <span className={`status-pill ${mode === 'recover' ? 'rest' : ''}`}>{MODE_LABEL[mode]}</span>}</div>
        {dayPlan?.importantAction ? (
          <p className="action-title" style={{ fontSize: '1.15rem', margin: '4px 0' }}>{dayPlan.importantAction}{primaryId ? '' : <span className="small faint">（TODOと未リンク）</span>}</p>
        ) : (
          <p className="muted" style={{ margin: '4px 0' }}>{mode === 'recover' ? '回復する日です。最重要行動を決めなくても問題ありません。' : 'まだ決めていません。TODOの詳細から「今日の最重要行動にする」で選べます。'}</p>
        )}
        {primaryId && <p className="small" data-testid="primary-status">着手：{m.primaryStarted ? 'あり' : 'まだ'}／完了：{m.primaryCompleted ? 'あり' : 'まだ'}</p>}
        <a className="small" href="#/today">「今日」で開始・記録する →</a>
      </section>

      <section className="card" data-testid="sched-metrics">
        <div className="statgrid">
          <div className="stat"><b>{m.validBlocks}</b><span>予定枠</span></div>
          <div className="stat"><b data-testid="record-rate">{rateText(m.recordRate)}</b><span>記録率</span></div>
          <div className="stat"><b data-testid="exec-rate">{rateText(m.executionRate)}</b><span>予定実行率</span></div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>未記録 {m.unrecordedBlocks}枠は「不明」です（未着手とはみなしません）。延期率 {rateText(m.postponeRate)}。数字で本人の価値は評価しません。</p>
        <p className="small muted" style={{ margin: '6px 0 0' }}>予定 {planned}分／{total}分。空き時間 {free.reduce((s, f) => s + f.end - f.start, 0)}分。予備時間のおすすめ {buffer}%（約{Math.round(total * buffer / 100)}分）
          <select aria-label="予備時間の割合" value={buffer} onChange={(e) => updatePreferences({ bufferPercent: Number(e.target.value) } as never)} style={{ width: 'auto', minHeight: 32, marginLeft: 6, padding: '0 6px' }}>
            {[0, 10, 20, 30, 40].map((p) => <option key={p} value={p}>{p}%</option>)}
          </select>
        </p>
        {mode === 'recover' && <p className="small gold" style={{ margin: '6px 0 0' }}>回復する日の予定実行率は、評価のためではなく記録として表示しています。</p>}
      </section>

      <div className="btnrow" style={{ marginBottom: 12 }}>
        <button className="btn cyan" onClick={() => setIfthen(true)} data-testid="btn-ifthen">{Ico.bolt}状況が変わった（IF→THEN）</button>
        <button className="btn" onClick={() => setPickAt(nowMin !== null ? Math.max(DAY_START_MIN, Math.ceil(nowMin / 15) * 15) : 9 * 60)} data-testid="btn-add-block">＋ 予定を追加</button>
      </div>

      {showCarry && (
        <section className="card" data-testid="carry-over">
          <div className="eyebrow">翌日への移動候補（本人が確定するまで移動しません）</div>
          <CarryOver blocks={carry} date={date} />
        </section>
      )}

      <section className="timeline-card card" aria-label="07:00〜25:00の時間割">
        <div
          className="tl"
          style={{ height: total * PX_PER_MIN }}
          data-testid="timeline"
          onDragOver={(e) => { e.preventDefault(); setDragOverMin(minuteAtY(e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top)); }}
          onDragLeave={() => setDragOverMin(null)}
          onDrop={(e) => {
            e.preventDefault();
            const min = minuteAtY(e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top);
            setDragOverMin(null);
            const n = ep.planNodes.find((x) => x.id === e.dataTransfer.getData('text/plain'));
            if (n) setPlace({ action: n, start: min });
          }}
        >
          {hours.map((h) => (
            <div key={h} className="tl-hour" style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }}>
              <span>{String(h).padStart(2, '0')}:00{h >= 24 ? `（翌${String(h - 24).padStart(2, '0')}時）` : ''}</span>
            </div>
          ))}
          {free.map((f) => (
            <button key={f.start} className="tl-free" style={{ top: (f.start - DAY_START_MIN) * PX_PER_MIN, height: (f.end - f.start) * PX_PER_MIN }} onClick={(e) => setPickAt(minuteAtY(e.clientY - (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().top))} aria-label={`${fmtMinute(f.start)}〜${fmtMinute(f.end)} 空き時間に予定を追加`} />
          ))}
          {dragOverMin !== null && <div className="tl-drop" style={{ top: (dragOverMin - DAY_START_MIN) * PX_PER_MIN }}>{fmtMinute(dragOverMin)}</div>}
          {nowMin !== null && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN && <div className="tl-now" style={{ top: (nowMin - DAY_START_MIN) * PX_PER_MIN }} aria-hidden="true" />}
          {blocks.map((b) => {
            const st = blockExecState(ep.executionEvents, b.id);
            const ov = overlaps(ep.scheduleBlocks, date, b.startMinute, b.durationMinutes, b.id).length > 0;
            const end = blockDateTime(date, b.startMinute + b.durationMinutes);
            return (
              <button
                key={b.id}
                className={`tl-block st-${st} ${b.actionId === primaryId ? 'primary' : ''} ${ov ? 'ov' : ''}`}
                style={{ top: (b.startMinute - DAY_START_MIN) * PX_PER_MIN, height: Math.max(26, b.durationMinutes * PX_PER_MIN) }}
                onClick={() => setBlockOpen(b)}
                data-testid={`block-${b.id}`}
              >
                <span className="tl-time">{fmtMinute(b.startMinute)}〜{fmtMinute(b.startMinute + b.durationMinutes)}{b.startMinute + b.durationMinutes > 1440 ? `（翌${end.time}）` : ''}</span>
                <span className="tl-title">{b.actionId === primaryId ? '★ ' : ''}{titleOf(b.actionId)}</span>
                <span className="tl-state">{EXEC_STATE_LABEL[st]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card" data-testid="unscheduled">
        <div className="eyebrow">予定に入れる候補（計画可能なTODO）</div>
        {unscheduled.length === 0 && <p className="small muted">候補はありません。目標ツリーでTODOに完了条件と所要時間を入れると、ここに出ます。</p>}
        <ul className="list">
          {unscheduled.slice(0, 20).map((n) => (
            <li key={n.id} className="row" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', n.id)}>
              <span className="grow">{n.title}<span className="small faint">　{n.estimateMinutes}分{quadrantOf(n) ? `・Q${quadrantOf(n)}` : ''}</span></span>
              <button className="btn sm" onClick={() => setPlace({ action: n, start: undefined })} data-testid={`place-${n.id}`}>配置</button>
            </li>
          ))}
        </ul>
        <a className="small" href="#/compass/plan">目標ツリーを開く →</a>
      </section>

      {pickAt !== null && (
        <Sheet title={`${fmtMinute(pickAt)} から何をしますか`} onClose={() => setPickAt(null)} testId="pick-sheet">
          {plannables.length === 0 && <p className="muted">計画可能なTODOがありません。目標ツリーで作成してください。</p>}
          <div className="options-col" style={{ display: 'grid', gap: 6 }}>
            {plannables.map((n) => <button key={n.id} className="btn ghost" onClick={() => { setPickAt(null); setPlace({ action: n, start: pickAt }); }} data-testid={`pick-${n.id}`}>{n.title}（{n.estimateMinutes}分）</button>)}
          </div>
        </Sheet>
      )}
      {place && <PlaceSheet action={place.action} date={date} startMinute={place.start} fromBlock={place.from} onClose={() => setPlace(null)} />}
      {blockOpen && <BlockSheet block={ep.scheduleBlocks.find((b) => b.id === blockOpen.id) ?? blockOpen} onClose={() => setBlockOpen(null)} onMove={(b) => { setBlockOpen(null); setPlace({ action: ep.planNodes.find((n) => n.id === b.actionId)!, from: b }); }} />}
      {ifthen && <IfThenSheet date={date} nowMin={nowMin} onClose={() => setIfthen(false)} />}
    </div>
  );
}

function BlockSheet(props: { block: ScheduleBlock; onClose: () => void; onMove: (b: ScheduleBlock) => void }) {
  const app = useApp();
  const ep = app.data.executionPlanning;
  const b = props.block;
  const action = ep.planNodes.find((n) => n.id === b.actionId);
  const st = blockExecState(ep.executionEvents, b.id);
  const [mode, setMode] = useState<null | 'complete' | 'interrupt'>(null);
  const [criteria, setCriteria] = useState<'yes' | 'no' | null>(null);
  const [evidence, setEvidence] = useState('');
  const [reason, setReason] = useState<InterruptReason | null>(null);
  const [resumeAt, setResumeAt] = useState('');
  const [firstStep, setFirstStep] = useState('');
  const [note, setNote] = useState('');
  const [opId, setOpId] = useState(() => newId('xe'));
  const history = ep.executionEvents.filter((e) => e.blockId === b.id);
  const rec = async (kind: Parameters<typeof prepo.recordExecution>[0]['kind'], extra: Partial<Parameters<typeof prepo.recordExecution>[0]> = {}) => {
    await prepo.recordExecution({ opId, actionId: b.actionId, blockId: b.id, planDate: b.planDate, kind, ...extra });
    setOpId(newId('xe'));
    setMode(null);
  };
  return (
    <Sheet title={action?.title ?? '（見つかりません）'} eyebrow={`${formatJpDate(b.planDate)} ${fmtMinute(b.startMinute)}〜${fmtMinute(b.startMinute + b.durationMinutes)}`} onClose={props.onClose} testId="block-sheet">
      <p><span className="status-pill" data-testid="block-state">{EXEC_STATE_LABEL[st]}</span></p>
      {action?.doneCriteria && <p className="small muted">完了条件：{action.doneCriteria}</p>}
      {action?.startCue && <p className="cue-line">{Ico.cue}<span><b>最初の一歩</b>{action.startCue}</span></p>}
      {mode === null && (
        <div className="grid2">
          <AsyncButton className="btn primary" testId="ex-start" onClick={() => rec(st === 'interrupted' ? 'resumed' : 'started')}>{Ico.play}{st === 'interrupted' ? '再開' : '開始'}</AsyncButton>
          <button className="btn primary" onClick={() => setMode('complete')} data-testid="ex-complete">{Ico.check}完了</button>
          <AsyncButton className="btn" testId="ex-partial" onClick={() => rec('partial')}>一部実行</AsyncButton>
          <button className="btn" onClick={() => setMode('interrupt')} data-testid="ex-interrupt">中断・困難</button>
          <AsyncButton className="btn ghost" testId="ex-notstarted" onClick={() => rec('not_started')}>未着手</AsyncButton>
          <button className="btn ghost" onClick={() => props.onMove(b)} data-testid="ex-move">延期・時間変更</button>
        </div>
      )}
      {mode === 'complete' && (
        <div className="card flat">
          <Choice legend="完了条件を満たしましたか？" options={[{ value: 'yes', label: '満たした' }, { value: 'no', label: 'まだ（一部）' }]} value={criteria} onChange={(v) => setCriteria(v as 'yes' | 'no')} />
          <TextField label="証拠・メモ（任意）" value={evidence} onChange={setEvidence} testId="ex-evidence" />
          <p className="small faint">行動の完了は、現実の成果（例：紹介成立）とは別に記録します。</p>
          <AsyncButton className="btn primary block" testId="ex-complete-save" onClick={() => (criteria === 'no' ? rec('partial', { criteriaMet: false, evidence: evidence || null }) : rec('completed', { criteriaMet: criteria === 'yes' ? true : null, evidence: evidence || null }))}>記録する</AsyncButton>
        </div>
      )}
      {mode === 'interrupt' && (
        <div className="card flat">
          <Choice legend="理由" column options={INTERRUPT_REASONS.map((r) => ({ value: r, label: INTERRUPT_LABEL[r] }))} value={reason} onChange={(v) => setReason(v as InterruptReason)} />
          <TextField label="再開する候補時間（任意）" value={resumeAt} onChange={setResumeAt} placeholder="例：16:00" />
          <TextField label="再開時の最初の一歩（任意）" value={firstStep} onChange={setFirstStep} />
          <TextField label="メモ（任意）" value={note} onChange={setNote} />
          <AsyncButton className="btn primary block" testId="ex-interrupt-save" onClick={() => rec('interrupted', { reason, resumeAt: resumeAt || null, firstStep: firstStep || null, note: note || null })}>記録する</AsyncButton>
        </div>
      )}
      {st === 'completed' && <AsyncButton className="btn sm ghost" testId="ex-reopen" onClick={() => rec('reopened', { note: '再オープン' })}>再オープンする</AsyncButton>}
      <AsyncButton className="btn sm ghost" onClick={async () => { await prepo.cancelBlock(b.id, '本人が取り消し'); props.onClose(); }}>この予定を取り消す（記録は残ります）</AsyncButton>
      {history.length > 0 && (
        <details open>
          <summary className="small">この予定の記録（{history.length}）</summary>
          <ul className="list small">{history.map((e) => <li key={e.id}>{localTimeOf(e.occurredAt, app.tz)} {EXEC_STATE_LABEL[e.kind === 'started' || e.kind === 'resumed' || e.kind === 'reopened' ? 'in_progress' : e.kind === 'partial' ? 'partial' : e.kind === 'completed' ? 'completed' : e.kind === 'interrupted' ? 'interrupted' : 'not_started']}{e.kind === 'reopened' ? '（再オープン）' : ''}{e.reason ? `：${INTERRUPT_LABEL[e.reason]}` : ''}{e.evidence ? `／${e.evidence}` : ''}</li>)}</ul>
        </details>
      )}
      {b.movedFromBlockId && <p className="small faint">この予定は別の日時から移動しました。</p>}
    </Sheet>
  );
}

function CarryOver(props: { blocks: ScheduleBlock[]; date: string }) {
  const app = useApp();
  const [sel, setSel] = useState<string[]>([]);
  const [opId] = useState(() => newId('carry'));
  const [result, setResult] = useState<string | null>(null);
  const titleOf = (id: string) => app.data.executionPlanning.planNodes.find((n) => n.id === id)?.title ?? '';
  return (
    <>
      <ul className="list">
        {props.blocks.map((b) => (
          <li key={b.id}><label className="chip"><input type="checkbox" checked={sel.includes(b.id)} onChange={() => setSel(sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id])} data-testid={`carry-${b.id}`} />{fmtMinute(b.startMinute)} {titleOf(b.actionId)}（{EXEC_STATE_LABEL[blockExecState(app.data.executionPlanning.executionEvents, b.id)]}）</label></li>
        ))}
      </ul>
      <AsyncButton className="btn sm" disabled={!sel.length} testId="carry-confirm" onClick={async () => {
        const skipped: string[] = [];
        for (const id of sel) {
          const b = props.blocks.find((x) => x.id === id)!;
          const r = await prepo.moveBlock({ opId: `${opId}-${id}`, blockId: id, planDate: addDays(props.date, 1), startMinute: b.startMinute, reason: '翌日へ持ち越し' });
          if (!r.ok) skipped.push(titleOf(b.actionId));
        }
        setResult(skipped.length ? `翌日の同じ時刻に予定があるため移動しませんでした：${skipped.join('、')}` : '選んだ予定を翌日の同じ時刻へ移動しました。');
        setSel([]);
      }}>選んだ予定を翌日へ移す</AsyncButton>
      {result && <p className="small muted">{result}</p>}
    </>
  );
}

/** IF→THEN：手動で状況を記録 → 候補を提案 → 本人が選んだときだけ予定に反映（二重確定しない） */
function IfThenSheet(props: { date: string; nowMin: number | null; onClose: () => void }) {
  const app = useApp();
  const ep = app.data.executionPlanning;
  const [cond, setCond] = useState<IfCondition | null>(null);
  const [maxMin, setMaxMin] = useState('15');
  const [onlyImportant, setOnlyImportant] = useState(true);
  const [pick, setPick] = useState<string | null>(null);
  const [time, setTime] = useState(fmtMinute(props.nowMin !== null ? Math.min(DAY_END_MIN - 15, Math.max(DAY_START_MIN, Math.ceil(props.nowMin / 15) * 15)) : 9 * 60));
  const [opId] = useState(() => newId('ift'));
  const [msg, setMsg] = useState<string | null>(null);
  const sugg = cond ? suggestForCondition(ep, { condition: cond, maxMinutes: maxMin ? Number(maxMin) : null, onlyImportant }) : [];
  return (
    <Sheet title="状況が変わった（IF→THEN）" eyebrow="提案 → 本人確認 → 反映" onClose={props.onClose} testId="ifthen-sheet">
      <p className="small muted">アプリは外部の予定を監視していません。起きたことを選ぶと、候補を出します。選ばなければ予定は変わりません。</p>
      {ep.ifThenRules.length > 0 && (
        <div className="btnrow" style={{ marginBottom: 8 }}>
          {ep.ifThenRules.map((r) => <button key={r.id} className="btn sm ghost" onClick={() => { setCond(r.condition); setMaxMin(r.maxMinutes ? String(r.maxMinutes) : ''); setOnlyImportant(r.onlyImportant); }}>{r.label}</button>)}
        </div>
      )}
      <Choice legend="もし…" column options={IF_CONDITIONS.map((c) => ({ value: c, label: IF_LABEL[c] }))} value={cond} onChange={(v) => setCond(v as IfCondition)} />
      {cond && (
        <>
          <div className="inline-fields">
            <TextField label="使える時間（分・空欄で制限なし）" type="number" inputMode="numeric" value={maxMin} onChange={setMaxMin} />
            <TextField label="開始時刻" value={time} onChange={setTime} testId="ift-time" />
          </div>
          <label className="chip" style={{ marginBottom: 8 }}><input type="checkbox" checked={onlyImportant} onChange={(e) => setOnlyImportant(e.target.checked)} />重要なTODOだけ</label>
          <div className="eyebrow">…なら、この候補はどうですか（元の予定は維持します）</div>
          {sugg.length === 0 && <p className="small muted" data-testid="ift-none">条件に合う候補はありません。</p>}
          <div className="options-col" style={{ display: 'grid', gap: 6 }} data-testid="ift-suggestions">
            {sugg.map((s) => (
              <label key={s.actionId} className="chip"><input type="radio" name="ift" checked={pick === s.actionId} onChange={() => setPick(s.actionId)} data-testid={`ift-pick-${s.actionId}`} />{s.title}（{s.minutes}分）{s.reason && <span className="small faint">　{s.reason}</span>}</label>
            ))}
          </div>
          {msg && <p className="small banner warn" role="alert">{msg}</p>}
          <div className="btnrow" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={props.onClose} data-testid="ift-dismiss">今回は何もしない</button>
            <AsyncButton className="btn primary" disabled={!pick} testId="ift-accept" onClick={async () => {
              const s = sugg.find((x) => x.actionId === pick)!;
              const start = parseHm(time);
              if (start === null) return setMsg('開始時刻を 14:00 の形式で入力してください。');
              const r = await prepo.placeBlock({ opId, actionId: s.actionId, planDate: props.date, startMinute: start, durationMinutes: s.minutes, confirmOverlap: false });
              if (!r.ok) return setMsg(r.overlaps ? 'その時間には別の予定があります。時刻を変えてください。' : r.reason);
              app.toast('候補を予定に追加しました。');
              props.onClose();
            }}>この候補で予定に追加</AsyncButton>
          </div>
          <AsyncButton className="btn sm ghost" onClick={async () => { await prepo.saveRule({ condition: cond, label: `${IF_LABEL[cond]}→${maxMin || '制限なし'}分以内${onlyImportant ? 'の重要TODO' : 'のTODO'}`, maxMinutes: maxMin ? Number(maxMin) : null, onlyImportant, originalPolicy: 'keep', targetActionId: null }); app.toast('ルールとして保存しました。'); }}>この条件をルールとして保存</AsyncButton>
        </>
      )}
    </Sheet>
  );
}
