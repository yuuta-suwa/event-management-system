import { useMemo, useState } from 'react';
import { useApp } from '../state';
import * as repo from '../db/repo';
import { computeActionMetrics, computeAlignment, computeOutcomes, evidenceDate, experimentPeriodStart, pct, returnRateText, startRateText, type DayCategory } from '../domain/metrics';
import { addDays, formatJpDate, parseYmd } from '../domain/dates';
import type { EvidenceLayer } from '../domain/schema';
import { AsyncButton, Choice, Sheet, TextField } from '../ui/kit';

type Period = 'cycle' | 'last7' | 'all';

const CAT_LABEL: Record<DayCategory, string> = { started: '着手', not_started: '未実行', unknown: '不明（未記録）', rest: '回復日', changed: '変更', unplanned: '未計画', pending: '今日', future: '' };

export function Growth() {
  const app = useApp();
  const { data, today, experiment } = app;
  const [period, setPeriod] = useState<Period>(experiment ? 'cycle' : 'last7');
  const [add, setAdd] = useState<EvidenceLayer | null>(null);

  const range = useMemo(() => {
    if (period === 'cycle' && experiment) return { start: experimentPeriodStart(experiment, data.dayPlans), end: experiment.endDate < today ? experiment.endDate : today };
    if (period === 'all') return { start: app.day0 ?? data.dayPlans[0]?.localDate ?? today, end: today };
    return { start: addDays(today, -6), end: today };
  }, [period, experiment, today, app.day0, data.dayPlans]);
  const start = range.start <= range.end ? range.start : range.end;
  const m = useMemo(() => computeActionMetrics(data.dayPlans, data.events, start, range.end, today), [data, start, range.end, today]);
  const inRange = (d: string) => d >= start && d <= range.end;
  const learning = data.evidence.filter((e) => e.layer === 'learning' && inRange(evidenceDate(e)));
  const actionsEv = data.evidence.filter((e) => e.layer === 'action' && inRange(evidenceDate(e)));
  const outcomes = computeOutcomes(data.goals, data.evidence);
  const alignment = computeAlignment(data.evidence, data.events, start, range.end);
  const daysShown = Object.entries(m.byDate).slice(-28);

  return (
    <div data-testid="growth">
      <h1>成長</h1>
      <p className="small faint">「実行した」「身についた」「実際に変わった」「大切なことに沿っていた」を分けて見ます。1つのスコアにはまとめません。記録がない項目は「未計測」です。</p>
      <Choice<Period>
        legend="期間"
        options={[...(experiment ? [{ value: 'cycle' as const, label: '今の14日間' }] : []), { value: 'last7', label: '直近7日' }, { value: 'all', label: 'Day0から' }]}
        value={period}
        onChange={setPeriod}
      />
      <p className="small faint">{formatJpDate(start)} 〜 {formatJpDate(range.end)}</p>

      <section className="card layer a" data-testid="layer-action">
        <div className="eyebrow cyan">A 行動</div>
        <div className="ring-wrap">
          <StartRing started={m.startedDays} notStarted={m.notStartedDays} unknown={m.unknownDays} />
          <div>
            <p className="metric-big" data-testid="start-rate" style={{ margin: 0 }}>{m.startRate === null ? '未計測' : `${pct(m.startRate)}%`}</p>
            <div className="ring-legend">
              <span><i style={{ background: 'var(--cyan)' }} />着手 {m.startedDays}日</span>
              <span><i style={{ background: 'var(--text-3)', opacity: 0.55 }} />未実行 {m.notStartedDays}日</span>
              <span><i style={{ background: 'repeating-linear-gradient(90deg, var(--text-3) 0 2px, transparent 2px 5px)' }} />不明（未記録） {m.unknownDays}日</span>
            </div>
          </div>
        </div>
        <p data-testid="start-rate-text">{startRateText(m)}</p>
        {m.lowCoverage && <p className="small banner warn">記録がない予定日が多いため、この着手率の信頼度は低めです。未記録は「やらなかった」という意味ではありません。</p>}
        <div className="statgrid">
          <div className="stat"><b>{m.plannedDays}</b><span>予定した日</span></div>
          <div className="stat"><b>{m.startedDays}</b><span>着手</span></div>
          <div className="stat"><b>{m.unknownDays}</b><span>不明</span></div>
          <div className="stat"><b>{m.restDays}</b><span>回復日<small>着手率の分母外</small></span></div>
          <div className="stat"><b>{m.changedDays}</b><span>計画変更<small>着手率の分母外</small></span></div>
          <div className="stat"><b>{m.unplannedDays}</b><span>未計画<small>着手率の分母外</small></span></div>
        </div>
        <div className="daystrip" aria-label="日ごとの状態">
          {daysShown.map(([d, c]) => (
            <div key={d} className={`daycell ${c}`} title={`${d} ${CAT_LABEL[c]}`} aria-label={`${formatJpDate(d)}：${CAT_LABEL[c] || '予定前'}`}>{parseYmd(d).d}</div>
          ))}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--cyan-soft)', borderColor: 'var(--cyan)' }} />着手</span>
          <span><i />未実行</span>
          <span><i style={{ borderStyle: 'dashed' }} />不明</span>
          <span><i style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold)' }} />回復日</span>
        </div>
        <hr className="divider" />
        <p className="small" style={{ margin: 0 }}>内的な切替：{m.internalSwitches}件 ／ {returnRateText(m)}</p>
        {m.protectedMinutes !== null && <p className="small">重要行動に充てた記録時間：{m.protectedMinutes}分（本人の記録）</p>}
        {actionsEv.length > 0 && <ul className="list small">{actionsEv.slice(-5).reverse().map((e) => <li key={e.id}>{formatJpDate(evidenceDate(e))}　{e.description}</li>)}</ul>}
      </section>

      <section className="card layer b" data-testid="layer-learning">
        <div className="eyebrow" style={{ color: '#a7b7ff' }}>B 能力・学習</div>
        {learning.length === 0 ? <p className="muted">未計測（できるようになったこと・学びの記録はまだありません）</p> : (
          <ul className="list">{learning.slice().reverse().map((e) => <li key={e.id}><span className="small faint">{formatJpDate(evidenceDate(e))}</span><br />{e.description}</li>)}</ul>
        )}
        <button className="btn sm" onClick={() => setAdd('learning')} data-testid="add-learning">学びを記録</button>
      </section>

      <section className="card layer c" data-testid="layer-outcome">
        <div className="eyebrow gold">C 現実の成果</div>
        {outcomes.length === 0 && <p className="muted">目標がまだないため、成果は未計測です。</p>}
        {outcomes.map((o) => (
          <div key={o.goalId} style={{ marginBottom: 10 }}>
            <p style={{ fontWeight: 700, margin: 0 }}>{o.goalTitle}</p>
            {o.entries.length === 0 ? (
              <p className="muted small">未計測（成果の記録はまだありません。結果は遅れて出ることもあります）</p>
            ) : o.change !== null ? (
              <p data-testid="outcome-change">{o.baseline}{o.unit ?? ''} → {o.latest}{o.unit ?? ''}（{o.change >= 0 ? '+' : ''}{o.change}{o.unit ?? ''}）<br /><span className="small faint">基準：{o.baselineDate ?? '日付未記録'}／最新の計測：{o.latestDate}／本人の記録</span></p>
            ) : (
              <ul className="list small">{o.entries.slice(-3).reverse().map((e) => <li key={e.id}>{formatJpDate(evidenceDate(e))}　{e.description}{typeof e.quantity === 'number' ? `：${e.quantity}${e.unit ?? ''}` : ''}</li>)}</ul>
            )}
          </div>
        ))}
        {m.startedDays >= 3 && outcomes.every((o) => o.entries.length === 0) && (
          <p className="small banner info" data-testid="feedback-note">実行した記録はあります。成果はまだ確認できません。方法・技能・相手の反応を点検し、現実の結果を何で確かめるか決めましょう。</p>
        )}
        <button className="btn sm" onClick={() => setAdd('outcome')} data-testid="add-outcome">成果を記録</button>
      </section>

      <section className="card layer d" data-testid="layer-alignment">
        <div className="eyebrow" style={{ color: '#f0a6c8' }}>D 価値との一致</div>
        <p className="small faint">本人の任意の振り返りです。科学的な尺度や点数ではありません。</p>
        {alignment.yes + alignment.partly + alignment.no === 0 ? <p className="muted">未回答</p> : (
          <p>沿っていた {alignment.yes}日 ／ 一部 {alignment.partly}日 ／ 沿っていなかった {alignment.no}日{alignment.unanswered ? ` ／ 未回答 ${alignment.unanswered}日` : ''}</p>
        )}
        {alignment.notes.length > 0 && <ul className="list small">{alignment.notes.slice(-3).reverse().map((e) => <li key={e.id}>{e.description}</li>)}</ul>}
        <button className="btn sm" onClick={() => setAdd('alignment')}>気づきを記録</button>
      </section>

      {add && <EvidenceSheet layer={add} onClose={() => setAdd(null)} />}
    </div>
  );
}

const LAYER_TITLE: Record<EvidenceLayer, string> = { action: '行動の証拠', learning: '能力・学習', outcome: '現実の成果', alignment: '価値との一致' };

function EvidenceSheet(props: { layer: EvidenceLayer; onClose: () => void }) {
  const app = useApp();
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState(app.goal?.outcomeMeasure?.unit ?? '');
  const [date, setDate] = useState(app.today);
  return (
    <Sheet title={`${LAYER_TITLE[props.layer]}を記録`} onClose={props.onClose} testId="evidence-sheet">
      <TextField label="内容" value={desc} onChange={setDesc} multiline testId="evidence-desc" placeholder={props.layer === 'outcome' ? '例：商談の件数' : '例：最初の提案を一人で送れるようになった'} />
      {props.layer === 'outcome' && (
        <div className="inline-fields">
          <TextField label="数値（任意）" type="number" inputMode="decimal" value={qty} onChange={setQty} testId="evidence-qty" />
          <TextField label="単位" value={unit} onChange={setUnit} />
        </div>
      )}
      <TextField label="日付" type="date" value={date} onChange={setDate} />
      <AsyncButton className="btn primary block" disabled={!desc.trim()} testId="evidence-save" onClick={async () => {
        await repo.addEvidence({
          layer: props.layer, description: desc.trim(), goalId: app.goal?.id ?? null, experimentId: app.experiment?.id ?? null,
          quantity: qty === '' ? null : Number(qty), unit: unit.trim() || null, baselineQuantity: app.goal?.outcomeMeasure?.baseline ?? null, localDate: date,
        });
        props.onClose();
      }}>保存する</AsyncButton>
    </Sheet>
  );
}

/** 予定した日の内訳リング：着手（シアン）／未実行（灰）／不明（破線）。不明を失敗の色にしない。 */
function StartRing(props: { started: number; notStarted: number; unknown: number }) {
  const total = props.started + props.notStarted + props.unknown;
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = total > 1 ? 3 : 0;
  let offset = 0;
  const arcs = ([['started', props.started], ['notstarted', props.notStarted], ['unknown', props.unknown]] as const)
    .filter(([, n]) => n > 0)
    .map(([cls, n]) => {
      const len = (n / total) * c;
      const el = <circle key={cls} className={cls} cx="66" cy="66" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.max(0.1, len - gap)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 66 66)" />;
      offset += len;
      return el;
    });
  return (
    <svg className="ring" viewBox="0 0 132 132" aria-hidden="true">
      <circle className="track" cx="66" cy="66" r={r} fill="none" strokeWidth="10" />
      {arcs}
      <text x="66" y="66" textAnchor="middle" fontSize="22">{total ? `${props.started}/${props.started + props.notStarted}` : '—'}</text>
      <text className="sub" x="66" y="86" textAnchor="middle" fontSize="10">{total ? '記録がある予定日' : '予定日なし'}</text>
    </svg>
  );
}
