/** 成長 > 目標と成果：行動の完了と現実の成果を独立に表示（TODO完了から成果を作らない） */
import { useState } from 'react';
import { useApp } from '../../state';
import * as prepo from '../../db/planningRepo';
import { goalProgress, type PlanNode } from '../../domain/planning';
import { formatJpDate } from '../../domain/dates';
import { newId } from '../../domain/id';
import { AsyncButton, Sheet, TextField } from '../../ui/kit';

export function GoalOutcomes() {
  const app = useApp();
  const ep = app.data.executionPlanning;
  const [rec, setRec] = useState<PlanNode | null>(null);
  const goals = ep.planNodes.filter((n) => n.kind !== 'action' && !n.archivedAt && (n.kind === 'goal' || n.metric));
  if (goals.length === 0) return null;
  return (
    <section className="card" data-testid="goal-outcomes">
      <div className="eyebrow">目標と成果（v2.4）</div>
      <p className="small faint">TODOの完了は「行動」、紹介成立・売上・採用などは「現実の成果」として別々に記録します。行動が終わっても成果は自動では増えません。</p>
      <ul className="list">
        {goals.map((g) => {
          const p = goalProgress(ep, g.id);
          const total = p.outcomes.reduce((s, o) => s + (o.value ?? 0), 0);
          return (
            <li key={g.id} data-testid={`go-${g.id}`}>
              <p style={{ fontWeight: 700, margin: 0 }}>{g.title}</p>
              <p className="small" style={{ margin: '2px 0' }}>
                <span className="tag cyan">行動</span>TODO {p.actionsCompleted}/{p.actionsTotal}件 完了
                <span className="tag gold" style={{ marginLeft: 8 }}>現実の成果</span>
                <span data-testid={`go-outcome-${g.id}`}>{p.outcomes.length ? `${p.outcomes.length}件の記録${p.outcomes.some((o) => o.value !== null) ? `（合計 ${total}${p.outcomes.find((o) => o.unit)?.unit ?? ''}）` : ''}` : '記録なし'}</span>
              </p>
              {p.actionsCompleted > 0 && p.outcomes.length === 0 && <p className="small faint" style={{ margin: 0 }}>TODOは{p.actionsCompleted}件完了、成果の記録はまだ0件です。方法や相手の反応を確かめましょう。</p>}
              {p.outcomes.slice(-3).map((o) => <p key={o.id} className="small muted" style={{ margin: 0 }}>{formatJpDate(o.date)} {o.metric ?? ''} {o.value !== null ? `${o.value}${o.unit ?? ''}` : ''} {o.qualitative ?? ''}{o.evidence ? `（根拠：${o.evidence}）` : ''}</p>)}
              <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setRec(g)} data-testid={`add-outcome-${g.id}`}>成果を記録</button>
            </li>
          );
        })}
      </ul>
      {rec && <OutcomeSheet goal={rec} onClose={() => setRec(null)} />}
    </section>
  );
}

function OutcomeSheet(props: { goal: PlanNode; onClose: () => void }) {
  const app = useApp();
  const [opId] = useState(() => newId('out'));
  const [date, setDate] = useState(app.today);
  const [metric, setMetric] = useState(props.goal.metric ?? '');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('件');
  const [qual, setQual] = useState('');
  const [evidence, setEvidence] = useState('');
  return (
    <Sheet title="現実の成果を記録" eyebrow={props.goal.title} onClose={props.onClose} testId="outcome-sheet">
      <TextField label="日付" type="date" value={date} onChange={setDate} />
      <TextField label="指標（任意）" value={metric} onChange={setMetric} placeholder="例：トスアップ成立" />
      <div className="inline-fields">
        <TextField label="実績値（任意）" type="number" inputMode="decimal" value={value} onChange={setValue} testId="outcome-value" />
        <TextField label="単位" value={unit} onChange={setUnit} />
      </div>
      <TextField label="定性的な記述（数値がない場合）" value={qual} onChange={setQual} multiline />
      <TextField label="確認の根拠" value={evidence} onChange={setEvidence} placeholder="例：担当者から受領連絡" testId="outcome-evidence" />
      <AsyncButton className="btn primary block" testId="outcome-save" disabled={!value && !qual.trim()} onClick={async () => {
        await prepo.addOutcome({ opId, goalNodeId: props.goal.id, date, metric: metric.trim() || null, value: value === '' ? null : Number(value), unit: unit.trim() || null, qualitative: qual.trim() || null, evidence: evidence.trim() || null });
        app.toast('成果を記録しました（行動の記録とは別に保存）。');
        props.onClose();
      }}>記録する</AsyncButton>
    </Sheet>
  );
}
