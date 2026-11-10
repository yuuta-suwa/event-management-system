/** 今日 > 優先順位：重要度×緊急度の4象限（第1＝重要・緊急、第2＝重要・緊急でない） */
import { useState } from 'react';
import { useApp } from '../../state';
import * as prepo from '../../db/planningRepo';
import { actionCompleted, ancestors, isPlannable, quadrantOf, QUADRANT_LABEL, scoresForQuadrant, TRIAGE_LABEL, urgencySuggestion, type PlanNode } from '../../domain/planning';
import { Choice } from '../../ui/kit';
import { KindBadge, NodeSheet, PlaceSheet } from './shared';

type Q = 1 | 2 | 3 | 4;

export function Priority() {
  const app = useApp();
  const ep = app.data.executionPlanning;
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [open, setOpen] = useState<PlanNode | null>(null);
  const [place, setPlace] = useState<PlanNode | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const [dragOver, setDragOver] = useState<Q | 'none' | null>(null);
  const focusGoals = ep.planNodes.filter((n) => n.kind !== 'action' && n.triage === 'focus_week' && !n.archivedAt);
  const inFocus = (n: PlanNode) => !focusOnly || focusGoals.some((g) => ancestors(ep.planNodes, n.id).some((a) => a.id === g.id));
  const actions = ep.planNodes.filter((n) => n.kind === 'action' && !n.archivedAt && !actionCompleted(ep.executionEvents, n.id) && n.triage !== 'drop' && inFocus(n));
  const by = (q: Q | null) => actions.filter((n) => quadrantOf(n) === q).sort((a, b) => a.quadrantOrder - b.quadrantOrder);
  const drop = async (q: Q, id: string) => {
    const n = ep.planNodes.find((x) => x.id === id);
    if (!n) return;
    await prepo.setPriority(id, scoresForQuadrant(q, n));
  };
  const q2count = by(2).length;

  return (
    <div data-testid="priority">
      <nav className="crumbs"><a href="#/today">今日</a><span>優先順位</span></nav>
      <h1>優先順位</h1>
      <p className="small muted">重要度＝人生の目的や選んだ目標にとっての意味、緊急度＝締切・時間制約の切迫。どちらも1〜5で本人が決めます（3以上を高とします）。アプリは評価を書き換えません。</p>
      <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        <Choice legend="表示" hideLegend options={[{ value: 'grid', label: '4象限' }, { value: 'list', label: '象限別リスト' }]} value={view} onChange={(v) => setView(v as 'grid' | 'list')} />
        {focusGoals.length > 0 && <label className="chip"><input type="checkbox" checked={focusOnly} onChange={(e) => setFocusOnly(e.target.checked)} />今週注力の枝だけ</label>}
      </div>

      {by(null).length > 0 && (
        <section className={`card tray ${dragOver === 'none' ? 'over' : ''}`} data-testid="unrated">
          <div className="eyebrow">未判定（{by(null).length}）— タップして重要度・緊急度を決めるか、象限へドラッグ</div>
          <div className="cards">{by(null).map((n) => <Card key={n.id} n={n} onOpen={setOpen} />)}</div>
        </section>
      )}

      {view === 'grid' ? (
        <div className="matrix" data-testid="matrix">
          <div className="axis-top"><span>緊急</span><span>緊急でない</span></div>
          <div className="axis-side"><span>重要</span><span>重要でない</span></div>
          <div className="quads">
            {([1, 2, 3, 4] as Q[]).map((q) => (
              <section
                key={q}
                className={`quad q${q} ${dragOver === q ? 'over' : ''}`}
                data-testid={`quad-${q}`}
                aria-label={QUADRANT_LABEL[q]}
                onDragOver={(e) => { e.preventDefault(); setDragOver(q); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); void drop(q, e.dataTransfer.getData('text/plain')); }}
              >
                <h2>{QUADRANT_LABEL[q]}</h2>
                <div className="cards">{by(q).map((n) => <Card key={n.id} n={n} onOpen={setOpen} />)}</div>
                {by(q).length === 0 && <p className="small faint">なし</p>}
              </section>
            ))}
          </div>
        </div>
      ) : (
        ([1, 2, 3, 4] as Q[]).map((q) => (
          <section key={q} className="card" data-testid={`qlist-${q}`}>
            <h2 style={{ fontSize: '1rem' }}>{QUADRANT_LABEL[q]}</h2>
            <div className="cards">{by(q).map((n) => <Card key={n.id} n={n} onOpen={setOpen} />)}</div>
            {by(q).length === 0 && <p className="small faint">なし</p>}
          </section>
        ))
      )}

      <div className="card flat" data-testid="q2-advice">
        <p style={{ margin: 0 }}>重要・緊急でない（第2象限）の行動は後回しになりやすいため、先に時間枠を確保するのがおすすめです。{q2count ? `いま${q2count}件あります。` : ''}</p>
        <a className="btn sm cyan" href="#/today/plan" style={{ marginTop: 8 }}>時間割で枠を確保する</a>
      </div>

      {focusGoals.length === 0 && <p className="small faint">目標が多いときは、目標ツリーで目標の「取捨選択」を「今週注力」にすると、その枝だけに絞って表示できます。</p>}

      {open && <NodeSheet node={open} onClose={() => setOpen(null)} onPlace={(n) => { setOpen(null); setPlace(n); }} />}
      {place && <PlaceSheet action={place} onClose={() => setPlace(null)} />}
    </div>
  );
}

function Card(props: { n: PlanNode; onOpen: (n: PlanNode) => void }) {
  const app = useApp();
  const { n } = props;
  const ep = app.data.executionPlanning;
  const parent = ancestors(ep.planNodes, n.id).filter((a) => a.kind !== 'action').pop();
  const sugg = urgencySuggestion(n, app.today);
  const depsOpen = n.dependsOn.filter((d) => !actionCompleted(ep.executionEvents, d)).length;
  return (
    <button
      className="pcard"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', n.id)}
      onClick={() => props.onOpen(n)}
      data-testid={`pcard-${n.id}`}
    >
      <span className="row" style={{ gap: 6 }}><KindBadge kind={n.kind} /><b className="grow">{n.title || '（無題）'}</b></span>
      <span className="small faint">{parent ? `目標：${parent.title}` : '目標なし'}{n.estimateMinutes ? `・${n.estimateMinutes}分` : ''}{n.dueDate ? `・期限 ${n.dueDate.slice(5).replace('-', '/')}` : ''}</span>
      <span className="small">
        {isPlannable(n) ? <span className="tag cyan">計画可能</span> : <span className="tag">下書き</span>}
        {depsOpen > 0 && <span className="tag">先行TODO {depsOpen}件</span>}
        {n.triage && <span className="tag gold">{TRIAGE_LABEL[n.triage]}</span>}
        {n.importance !== null && n.urgency !== null && <span className="tag">重要{n.importance}・緊急{n.urgency}</span>}
      </span>
      {sugg && <span className="small cyan">{sugg}</span>}
    </button>
  );
}
