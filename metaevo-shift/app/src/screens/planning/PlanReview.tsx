/** 振り返り > 実行計画を改善：延期が続くTODOへの改善候補（性格・意志の問題と断定しない） */
import { useApp } from '../../state';
import { dayExecMetrics, rateText, repeatedlyPostponed } from '../../domain/planning';
import { primaryActionIdFor } from '../../db/bridge';
import { addDays, formatJpDate } from '../../domain/dates';

export function PlanReview() {
  const app = useApp();
  const ep = app.data.executionPlanning;
  if (ep.planNodes.length === 0) return null;
  const stuck = repeatedlyPostponed(ep);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(app.today, -i));
  const rows = days.map((d) => ({ d, m: dayExecMetrics(ep, d, primaryActionIdFor(app.data, d)) })).filter((r) => r.m.validBlocks || r.m.movedBlocks);
  return (
    <section className="card" data-testid="plan-review">
      <h2>実行計画を改善</h2>
      <p className="small faint">何を計画したか／どこまで実施したか／何が障害か／実際の成果は何か／次に何を変えるか。うまくいかなかった理由を性格の問題とは考えません。</p>
      {rows.length > 0 ? (
        <ul className="list small">
          {rows.map(({ d, m }) => <li key={d}>{formatJpDate(d)}：予定枠 {m.validBlocks}・記録率 {rateText(m.recordRate)}・予定実行率 {rateText(m.executionRate)}{m.movedBlocks ? `・延期 ${m.movedBlocks}` : ''}{m.interruptsByReason.external ? `・外的中断 ${m.interruptsByReason.external}` : ''}{m.interruptsByReason.internal ? `・内的切替 ${m.interruptsByReason.internal}` : ''}{m.interruptsByReason.rest ? `・休息 ${m.interruptsByReason.rest}` : ''}</li>)}
        </ul>
      ) : <p className="small muted">直近7日の予定枠はありません。</p>}
      {stuck.map(({ action, moves }) => (
        <div key={action.id} className="card flat" data-testid={`stuck-${action.id}`}>
          <p style={{ margin: 0 }}><strong>{action.title}</strong> は {moves}回延期されています。次のどれかを試しますか？</p>
          <div className="btnrow" style={{ marginTop: 8 }}>
            <a className="btn sm" href={`#/compass/plan/${action.id}`} data-testid="stuck-split">分割し直す</a>
            <a className="btn sm" href="#/today/plan">時間帯を変える</a>
            <a className="btn sm" href={`#/compass/plan/${action.id}`}>依存関係を解消する</a>
            <a className="btn sm" href="#/today/priority">そもそも重要か見直す</a>
          </div>
        </div>
      ))}
    </section>
  );
}
