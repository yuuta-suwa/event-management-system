/** v2.4 行動設計の共通部品：ノード詳細シート、予定配置シート、スコア入力 */
import { useMemo, useState } from 'react';
import { useApp } from '../../state';
import * as prepo from '../../db/planningRepo';
import { linkPrimaryAction, primaryActionIdFor, resolveAnchor } from '../../db/bridge';
import {
  actionCompleted, ancestors, canMove, DAY_END_MIN, DAY_START_MIN, fmtMinute, isPlannable, missingForPlannable, NODE_KIND_LABEL, NODE_KINDS, overlaps,
  parseHm, quadrantOf, QUADRANT_LABEL, SAMPLE_GOAL_QUESTIONS, SPLIT_SUGGEST_MIN, TRIAGE, TRIAGE_LABEL, urgencySuggestion, validateBlockTime,
  type NodeKind, type PlanNode, type ScheduleBlock,
} from '../../domain/planning';
import { newId } from '../../domain/id';
import { addDays, formatJpDate, localTimeOf } from '../../domain/dates';
import { clock } from '../../db/repo';
import { AsyncButton, Choice, MultiChoice, Sheet, TextField } from '../../ui/kit';

export function KindBadge({ kind }: { kind: NodeKind }) {
  return <span className={`kind kind-${kind}`}>{NODE_KIND_LABEL[kind]}</span>;
}

export function Breadcrumb({ nodeId }: { nodeId: string }) {
  const { data } = useApp();
  const nodes = data.executionPlanning.planNodes;
  const chain = ancestors(nodes, nodeId);
  const root = chain[0] ?? nodes.find((n) => n.id === nodeId);
  const anchor = resolveAnchor(data, root?.sourceAnchorId);
  return (
    <nav className="crumbs" aria-label="このノードの目的をたどる">
      <a href="#/compass">人生の軸</a>
      {root?.sourceAnchorId && <span>{anchor ? anchor.label : <em className="broken">リンク切れ</em>}</span>}
      {chain.map((n) => <a key={n.id} href={`#/compass/plan/${n.id}`}>{n.title || '（無題）'}</a>)}
    </nav>
  );
}

export function ScoreInput(props: { legend: string; value: number | null; onChange: (v: number | null) => void; hint: string; testId?: string }) {
  return (
    <div data-testid={props.testId}>
      <Choice legend={props.legend} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} value={props.value === null ? null : String(props.value)} onChange={(v) => props.onChange(Number(v))} />
      <div className="hint">{props.hint}{props.value !== null && <button className="linkbtn small" style={{ marginLeft: 8, minHeight: 0, padding: 0 }} onClick={() => props.onChange(null)}>未判定に戻す</button>}</div>
    </div>
  );
}

/** ノード詳細：深掘り・TODO条件・優先度・移動・アーカイブ */
export function NodeSheet(props: { node: PlanNode; onClose: () => void; onPlace?: (n: PlanNode) => void }) {
  const app = useApp();
  const ep = app.data.executionPlanning;
  const n = ep.planNodes.find((x) => x.id === props.node.id) ?? props.node;
  const [title, setTitle] = useState(n.title);
  const [kind, setKind] = useState<NodeKind>(n.kind);
  const [done, setDone] = useState(n.doneCriteria ?? '');
  const [est, setEst] = useState(n.estimateMinutes ? String(n.estimateMinutes) : '');
  const [cue, setCue] = useState(n.startCue ?? '');
  const [prep, setPrep] = useState(n.prep ?? '');
  const [due, setDue] = useState(n.dueDate ?? '');
  const [deps, setDeps] = useState<string[]>(n.dependsOn ?? []);
  const [related, setRelated] = useState<string[]>(n.relatedGoalIds ?? []);
  const [success, setSuccess] = useState(n.successCriteria ?? '');
  const [metric, setMetric] = useState(n.metric ?? '');
  const [imp, setImp] = useState<number | null>(n.importance);
  const [urg, setUrg] = useState<number | null>(n.urgency);
  const [triage, setTriage] = useState(n.triage);
  const [note, setNote] = useState(n.note ?? '');
  const [deep, setDeep] = useState<string[]>(['', '', '']);
  const [moving, setMoving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const draft = { ...n, kind, title, doneCriteria: done || null, estimateMinutes: est ? Number(est) : null };
  const plannable = isPlannable(draft);
  const missing = missingForPlannable(draft as PlanNode);
  const others = ep.planNodes.filter((x) => x.id !== n.id && !x.archivedAt);
  const completed = actionCompleted(ep.executionEvents, n.id);
  const sugg = urgencySuggestion({ dueDate: due || null, urgency: urg }, app.today);
  const primary = primaryActionIdFor(app.data, app.today) === n.id;

  const save = async () => {
    const minutes = est ? Number(est) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1)) { setMsg('所要時間は1分以上の整数で入力してください。'); return false; }
    await prepo.updateNode(n.id, {
      kind, title: title.trim(), doneCriteria: done.trim() || null, estimateMinutes: minutes, startCue: cue.trim() || null, prep: prep.trim() || null,
      dueDate: due || null, dependsOn: deps, relatedGoalIds: related, successCriteria: success.trim() || null, metric: metric.trim() || null,
      importance: imp, urgency: urg, triage, note: note.trim() || null,
    });
    return true;
  };
  return (
    <Sheet title={n.title || '（無題）'} eyebrow={NODE_KIND_LABEL[n.kind]} onClose={props.onClose} testId="node-sheet">
      <Breadcrumb nodeId={n.id} />
      {n.archivedAt && <p className="banner warn small">アーカイブ中です。予定・実行記録・成果は残っています。</p>}
      <TextField label={kind === 'action' ? '何をするか（動詞＋対象）' : '名前'} value={title} onChange={setTitle} testId="node-title" />
      <Choice legend="種類" options={NODE_KINDS.map((k) => ({ value: k, label: NODE_KIND_LABEL[k] }))} value={kind} onChange={(v) => setKind(v as NodeKind)} />

      {kind === 'action' ? (
        <>
          <div className={`banner small ${plannable ? 'info' : ''}`} data-testid="plannable-state">{plannable ? '計画可能：予定に配置できます' : `下書き（保存済み）：あと ${missing.join('・')} で計画可能`}</div>
          <TextField label="完了条件（何が確認できれば完了か）" value={done} onChange={setDone} placeholder="例：対象条件と受領方法をメモに記録" testId="node-done" />
          <TextField label="想定所要時間（分）" type="number" inputMode="numeric" value={est} onChange={setEst} testId="node-est" hint={Number(est) > SPLIT_SUGGEST_MIN ? `${SPLIT_SUGGEST_MIN}分を超えています。分けると始めやすくなります（分割は任意）。` : undefined} />
          <TextField label="開始条件・最初の2分の一歩（任意）" value={cue} onChange={setCue} placeholder="例：机に座ったら、相手の連絡先を開く" />
          <TextField label="準備物・連絡先（任意）" value={prep} onChange={setPrep} />
          <details>
            <summary className="small">依存関係・関連する目標・期限</summary>
            <MultiChoice legend="先に終わらせる必要があるTODO（任意）" options={others.filter((o) => o.kind === 'action').map((o) => ({ value: o.id, label: o.title || '（無題）' }))} value={deps} onChange={setDeps} column />
            <MultiChoice legend="ほかに貢献する目標（任意・主要な親は1つ）" options={others.filter((o) => o.kind !== 'action').map((o) => ({ value: o.id, label: o.title || '（無題）' }))} value={related} onChange={setRelated} column />
            <TextField label="期限（任意）" type="date" value={due} onChange={setDue} />
          </details>
        </>
      ) : (
        <>
          <TextField label="達成条件（任意）" value={success} onChange={setSuccess} placeholder="何がどうなれば前進と分かるか" />
          <TextField label="成果指標（任意・数値化は必須ではありません）" value={metric} onChange={setMetric} placeholder="例：トスアップ件数" />
          <TextField label="期限（任意）" type="date" value={due} onChange={setDue} />
          <div className="card flat" data-testid="deep-dive">
            <div className="eyebrow">深掘りと逆算</div>
            {SAMPLE_GOAL_QUESTIONS.map((q, i) => (
              <div key={q} className="row" style={{ alignItems: 'flex-end' }}>
                <div className="grow"><TextField label={q} value={deep[i]} onChange={(v) => setDeep(deep.map((x, j) => (j === i ? v : x)))} testId={`deep-${i}`} /></div>
                {i !== 1 && (
                  <AsyncButton className="btn sm" testId={`deep-add-${i}`} disabled={!deep[i].trim()} onClick={async () => {
                    await prepo.createNode({ kind: i === 0 ? 'milestone' : 'action', title: deep[i].trim(), parentId: n.id });
                    setDeep(deep.map((x, j) => (j === i ? '' : x)));
                    app.toast(i === 0 ? '中間成果を追加しました。' : 'TODOを追加しました。');
                  }}>子に追加</AsyncButton>
                )}
                {i === 1 && <AsyncButton className="btn sm" disabled={!deep[1].trim()} onClick={async () => { setNote([note, `障害：${deep[1].trim()}`].filter(Boolean).join('\n')); setDeep(['', '', deep[2]].map((x, j) => (j === 0 ? deep[0] : x))); }}>メモに残す</AsyncButton>}
              </div>
            ))}
            <p className="small faint">この分解は仮説です。TODOを終えても目標達成は保証されません。成果で見直します。</p>
          </div>
        </>
      )}

      <details open={kind === 'action'}>
        <summary className="small">重要度・緊急度・取捨選択</summary>
        <ScoreInput legend="重要度（人生の目的や目標にとっての意味）" value={imp} onChange={setImp} hint="1＝低い〜5＝高い。3以上を「重要」とします。" testId="score-imp" />
        <ScoreInput legend="緊急度（締切・時間制約の切迫）" value={urg} onChange={setUrg} hint="1＝低い〜5＝高い。3以上を「緊急」とします。" testId="score-urg" />
        {quadrantOf({ importance: imp, urgency: urg }) && <p className="small gold">{QUADRANT_LABEL[quadrantOf({ importance: imp, urgency: urg })!]}</p>}
        {sugg && <p className="small banner info" data-testid="urgency-suggestion">{sugg}（評価は変更していません）</p>}
        <Choice legend="取捨選択（任意）" options={TRIAGE.map((t) => ({ value: t, label: TRIAGE_LABEL[t] }))} value={triage} onChange={(v) => setTriage(v as typeof triage)} />
        {(triage === 'delegate' || triage === 'drop') && <p className="small faint">委任・やらないを選んでも、成果としては数えません。</p>}
      </details>
      <TextField label="メモ（任意・非公開）" value={note} onChange={setNote} multiline />
      {msg && <p className="small" role="alert" style={{ color: 'var(--danger)' }}>{msg}</p>}

      <div className="btnrow" style={{ marginTop: 8 }}>
        <AsyncButton className="btn primary" testId="node-save" onClick={async () => { if (await save()) { app.toast('保存しました。'); props.onClose(); } }}>保存</AsyncButton>
        <AsyncButton className="btn" testId="node-add-child" onClick={async () => { await save(); await prepo.createNode({ kind: kind === 'action' ? 'action' : kind === 'goal' ? 'milestone' : 'action', title: '', parentId: n.id }); app.toast('子ノードを追加しました。名前を入れてください。'); props.onClose(); }}>子を追加</AsyncButton>
      </div>
      {kind === 'action' && (
        <div className="btnrow" style={{ marginTop: 8 }}>
          <AsyncButton className="btn cyan" testId="node-to-schedule" disabled={!plannable} onClick={async () => { if (await save()) props.onPlace?.({ ...n, ...draft } as PlanNode); }}>予定へ送る</AsyncButton>
          <AsyncButton className="btn" testId="node-make-primary" disabled={primary} onClick={async () => { if (!(await save())) return; await linkPrimaryAction(app.today, { ...n, title: title.trim(), doneCriteria: done || null, startCue: cue || null }); app.toast('今日の最重要行動にしました（「今日」と同じ1件です）。'); }}>{primary ? '今日の最重要行動です' : '今日の最重要行動にする'}</AsyncButton>
        </div>
      )}
      {completed && (
        <AsyncButton className="btn sm ghost" testId="node-reopen" onClick={async () => { await prepo.recordExecution({ opId: newId('xe'), actionId: n.id, blockId: null, planDate: app.today, kind: 'reopened', note: '再オープン' }); app.toast('再オープンしました（履歴は残ります）。'); }}>完了を取り消して再オープン</AsyncButton>
      )}
      <hr className="divider" />
      <div className="btnrow">
        <AsyncButton className="btn sm ghost" onClick={() => prepo.reorderNode(n.id, -1)} ariaLabel="上へ移動">↑ 上へ</AsyncButton>
        <AsyncButton className="btn sm ghost" onClick={() => prepo.reorderNode(n.id, 1)} ariaLabel="下へ移動">↓ 下へ</AsyncButton>
        <button className="btn sm ghost" onClick={() => setMoving(!moving)} data-testid="node-move">親を変える</button>
        {n.archivedAt ? (
          <AsyncButton className="btn sm" testId="node-restore" onClick={async () => { await prepo.restoreNode(n.id); app.toast('復元しました。'); }}>復元</AsyncButton>
        ) : (
          <AsyncButton className="btn sm danger" testId="node-archive" onClick={async () => { const snap = await prepo.archiveNode(n.id); app.setUndo({ label: `「${n.title}」をアーカイブしました`, nodes: snap }); props.onClose(); }}>アーカイブ</AsyncButton>
        )}
      </div>
      {moving && <MovePicker node={n} onDone={(r) => { setMsg(r); if (!r) props.onClose(); }} />}
    </Sheet>
  );
}

function MovePicker(props: { node: PlanNode; onDone: (err: string | null) => void }) {
  const app = useApp();
  const nodes = app.data.executionPlanning.planNodes.filter((x) => !x.archivedAt);
  return (
    <div className="card flat" data-testid="move-picker">
      <p className="small">移動先の親を選んでください（自分の子孫は選べません）。</p>
      <div className="options-col" style={{ display: 'grid', gap: 6 }}>
        <AsyncButton className="btn sm" onClick={async () => { const snap = [props.node]; const r = await prepo.moveNode(props.node.id, null); if (r.ok) app.setUndo({ label: '移動しました', nodes: snap }); props.onDone(r.ok ? null : r.reason); }}>いちばん上（ルート）へ</AsyncButton>
        {nodes.filter((x) => x.id !== props.node.id && x.kind !== 'action').map((x) => {
          const ok = canMove(nodes, props.node.id, x.id).ok;
          return (
            <AsyncButton key={x.id} className="btn sm ghost" testId={`move-to-${x.id}`} onClick={async () => {
              const snap = [props.node];
              const r = await prepo.moveNode(props.node.id, x.id);
              if (r.ok) app.setUndo({ label: '移動しました', nodes: snap });
              props.onDone(r.ok ? null : r.reason);
            }}>{NODE_KIND_LABEL[x.kind]}：{x.title || '（無題）'}{ok ? '' : '（子孫のため不可）'}</AsyncButton>
          );
        })}
      </div>
    </div>
  );
}

/** 予定に配置（時刻・所要時間・重複警告・本人確認） */
export function PlaceSheet(props: { action: PlanNode; date?: string; startMinute?: number; onClose: () => void; fromBlock?: ScheduleBlock }) {
  const app = useApp();
  const [opId] = useState(() => newId('blk'));
  const [date, setDate] = useState(props.date ?? props.fromBlock?.planDate ?? app.today);
  const [time, setTime] = useState(fmtMinute(props.startMinute ?? props.fromBlock?.startMinute ?? defaultStart()));
  const [dur, setDur] = useState(String(props.fromBlock?.durationMinutes ?? props.action.estimateMinutes ?? 15));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleBlock[] | null>(null);
  const titleOf = (id: string) => app.data.executionPlanning.planNodes.find((n) => n.id === id)?.title ?? '（不明）';
  const start = parseHm(time);
  const minutes = Number(dur);
  const live = useMemo(() => (start !== null && minutes > 0 ? overlaps(app.data.executionPlanning.scheduleBlocks, date, start, minutes, props.fromBlock?.id) : []), [app.data, date, start, minutes, props.fromBlock]);
  const submit = async (confirm: boolean) => {
    if (start === null) return setErr('時刻は 07:00〜24:59 の形式（例 14:00、24:30）で入力してください。');
    const t = validateBlockTime(start, minutes);
    if (t) return setErr(t);
    setErr(null);
    const r = props.fromBlock
      ? await prepo.moveBlock({ opId, blockId: props.fromBlock.id, planDate: date, startMinute: start, reason: reason.trim() || null, confirmOverlap: confirm })
      : await prepo.placeBlock({ opId, actionId: props.action.id, planDate: date, startMinute: start, durationMinutes: minutes, confirmOverlap: confirm });
    if (!r.ok) {
      if (r.overlaps) setConflicts(r.overlaps);
      else setErr(r.reason);
      return;
    }
    app.toast(props.fromBlock ? '予定を移動しました（元の予定は履歴に残ります）。' : `${formatJpDate(date)} ${time} に配置しました。`);
    props.onClose();
  };
  function defaultStart() {
    const hm = parseHm(localTimeOf(clock.now(), app.tz)) ?? DAY_START_MIN;
    const m = Math.ceil(hm / 15) * 15;
    return Math.min(Math.max(m, DAY_START_MIN), DAY_END_MIN - 15);
  }
  return (
    <Sheet title={props.fromBlock ? '予定を移動・延期' : '予定に配置'} eyebrow={props.action.title} onClose={props.onClose} testId="place-sheet">
      <div className="inline-fields">
        <TextField label="計画日" type="date" value={date} onChange={setDate} testId="place-date" />
        <TextField label="開始（07:00〜24:59）" value={time} onChange={setTime} testId="place-time" placeholder="14:00" />
      </div>
      <div className="btnrow" style={{ marginTop: -4 }}>
        <button className="btn sm ghost" onClick={() => setDate(app.today)}>今日</button>
        <button className="btn sm ghost" onClick={() => setDate(addDays(app.today, 1))} data-testid="place-tomorrow">明日</button>
      </div>
      {!props.fromBlock && <TextField label="所要時間（分）" type="number" inputMode="numeric" value={dur} onChange={setDur} testId="place-dur" />}
      {props.fromBlock && <TextField label="変更の理由（任意）" value={reason} onChange={setReason} testId="place-reason" />}
      <p className="small faint">24:00以降は翌日の深夜（例：24:30＝翌00:30）ですが、計画日は {formatJpDate(date)} のままです。25:00は終了時刻としてだけ使えます。</p>
      {live.length > 0 && !conflicts && <p className="small banner warn">この時間には「{live.map((b) => titleOf(b.actionId)).join('」「')}」があります。</p>}
      {err && <p className="small banner warn" role="alert" data-testid="place-error">{err}</p>}
      {conflicts ? (
        <div className="card flat" data-testid="overlap-confirm">
          <p><strong>同じ時間帯に予定があります：</strong>{conflicts.map((b) => `${fmtMinute(b.startMinute)} ${titleOf(b.actionId)}`).join('、')}</p>
          <p className="small">重ねて置きますか？（どちらの予定も消えません）</p>
          <div className="btnrow">
            <button className="btn ghost" onClick={() => setConflicts(null)}>時間を変える</button>
            <AsyncButton className="btn primary" testId="overlap-accept" onClick={() => submit(true)}>重ねて配置する</AsyncButton>
          </div>
        </div>
      ) : (
        <AsyncButton className="btn primary block" testId="place-save" onClick={() => submit(false)}>{props.fromBlock ? '移動する' : '配置する'}</AsyncButton>
      )}
    </Sheet>
  );
}
