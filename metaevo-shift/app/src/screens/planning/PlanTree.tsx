/** 人生の軸 > 目標から行動へ：ツリー（スマホ）／マインドマップ（PC） */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../state';
import * as prepo from '../../db/planningRepo';
import { getExistingGoals, getLifeAnchors, LIFE_COMPASS_ANCHOR, resolveAnchor } from '../../db/bridge';
import { actionCompleted, ancestors, childrenMap, fmtMinute, isPlannable, quadrantOf, type PlanNode } from '../../domain/planning';
import { AsyncButton, Choice, Sheet, TextField } from '../../ui/kit';
import { KindBadge, NodeSheet, PlaceSheet } from './shared';

type View = 'list' | 'map';

export function PlanTree(props: { focusId?: string }) {
  const app = useApp();
  const { data } = app;
  const ep = data.executionPlanning;
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth >= 900 ? 'map' : 'list'));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<PlanNode | null>(null);
  const [place, setPlace] = useState<PlanNode | null>(null);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const cm = useMemo(() => childrenMap(ep.planNodes), [ep.planNodes]);
  const roots = cm.get(null) ?? [];
  const anchor = getLifeAnchors(data)[0];
  const archived = ep.planNodes.filter((n) => n.archivedAt && !(n.parentId && ep.planNodes.find((p) => p.id === n.parentId)?.archivedAt === n.archivedAt));

  // URLで指定されたノードを開く（データの読み込みが後から届いても1回だけ開く）
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!props.focusId || openedFor === props.focusId) return;
    const n = ep.planNodes.find((x) => x.id === props.focusId);
    if (n) {
      setOpen(n);
      setOpenedFor(props.focusId);
    }
  }, [props.focusId, ep.planNodes, openedFor]);

  const hits = q.trim() ? ep.planNodes.filter((n) => !n.archivedAt && n.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50) : [];

  return (
    <div data-testid="plantree">
      <nav className="crumbs" aria-label="現在地"><a href="#/compass">人生の軸</a><span>目標から行動へ</span></nav>
      <h1>目標から行動へ</h1>
      <section className="card hero anchor-card" data-testid="life-anchor">
        <div className="eyebrow">人生の軸（参照・複製していません）</div>
        <p className="action-title" style={{ fontSize: '1.15rem', margin: '4px 0' }}>{anchor.label}{data.lifeCompass.status !== 'committed' ? '（仮）' : ''}</p>
        {anchor.detail && <p className="small muted" style={{ margin: 0 }}>{anchor.detail}</p>}
        <p className="small faint" style={{ margin: '6px 0 0' }}>目的が決まっていなくても、仮の目標や探索の一歩から始められます。</p>
      </section>

      {app.undo && (
        <div className="banner info row" data-testid="undo-bar">
          <span className="grow small">{app.undo.label}</span>
          <AsyncButton className="btn sm" testId="undo" onClick={async () => { await prepo.restoreSnapshot(app.undo!.nodes); app.setUndo(null); app.toast('元に戻しました。'); }}>元に戻す</AsyncButton>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <Choice<View> legend="表示" hideLegend options={[{ value: 'list', label: 'リスト' }, { value: 'map', label: 'マップ' }]} value={view} onChange={setView} />
        <span className="grow" />
        <button className="btn primary sm" onClick={() => setAdding(true)} data-testid="add-goal">＋ 目標を追加</button>
      </div>
      <label className="field" style={{ marginTop: 0 }}>
        <span className="sr-only">検索</span>
        <input type="text" placeholder="ノードを検索" value={q} onChange={(e) => setQ(e.target.value)} data-testid="tree-search" />
      </label>
      {q.trim() && (
        <ul className="list card" data-testid="search-results">
          {hits.length === 0 && <li className="muted small">見つかりません</li>}
          {hits.map((n) => (
            <li key={n.id}><button className="linkbtn" onClick={() => setOpen(n)}>{n.title || '（無題）'}</button><div className="small faint">{ancestors(ep.planNodes, n.id).map((a) => a.title).join(' › ')}</div></li>
          ))}
        </ul>
      )}

      {roots.length === 0 ? (
        <div className="card" data-testid="tree-empty">
          <p>まだ目標がありません。人生の軸や初回ワークで決めた目標から、最初の目標を作りましょう。</p>
          <button className="btn primary block" onClick={() => setAdding(true)}>最初の目標を作る</button>
        </div>
      ) : view === 'list' ? (
        <ul className="tree" role="tree" aria-label="目標ツリー" data-testid="tree-list">
          {roots.map((n) => <TreeRow key={n.id} node={n} cm={cm} depth={0} onOpen={setOpen} />)}
        </ul>
      ) : (
        <div className="mm-scroll" data-testid="mindmap">
          <ul className="mm">
            <li>
              <div className="mm-node mm-root">{anchor.label}</div>
              <ul>{roots.map((n) => <MapNode key={n.id} node={n} cm={cm} onOpen={setOpen} />)}</ul>
            </li>
          </ul>
        </div>
      )}

      {archived.length > 0 && (
        <details className="card" open={showArchived} onToggle={(e) => setShowArchived((e.target as HTMLDetailsElement).open)}>
          <summary>アーカイブ（{archived.length}件）</summary>
          <ul className="list">{archived.map((n) => <li key={n.id} className="row"><span className="grow small">{n.title}</span><AsyncButton className="btn sm" testId={`restore-${n.id}`} onClick={() => prepo.restoreNode(n.id)}>復元</AsyncButton></li>)}</ul>
        </details>
      )}

      <p className="small faint">この目標ツリーはこの端末の中だけに保存され、iMacとiPhoneの間で自動同期はされません（移すときは設定のバックアップ／復元）。</p>
      <p className="small faint">細かく分けすぎなくて大丈夫です。今週注力する枝だけを深く分解し、残りは保留できます。</p>

      {adding && <AddGoalSheet onClose={() => setAdding(false)} />}
      {open && <NodeSheet key={open.id} node={open} onClose={() => { const id = open.id; setOpen((cur) => (cur?.id === id ? null : cur)); if (location.hash === `#/compass/plan/${id}`) history.replaceState(null, '', '#/compass/plan'); }} onPlace={(n) => { setOpen(null); setPlace(n); }} />}
      {place && <PlaceSheet action={place} onClose={() => setPlace(null)} />}
    </div>
  );
}

function NodeMeta({ node }: { node: PlanNode }) {
  const { data } = useApp();
  const ep = data.executionPlanning;
  const quad = quadrantOf(node);
  const done = node.kind === 'action' && actionCompleted(ep.executionEvents, node.id);
  const blocks = ep.scheduleBlocks.filter((b) => b.actionId === node.id && b.state === 'placed');
  return (
    <span className="node-meta">
      {node.kind === 'action' && (done ? <span className="tag cyan">完了</span> : isPlannable(node) ? <span className="tag">{node.estimateMinutes}分</span> : <span className="tag faint-tag">下書き</span>)}
      {quad && <span className="tag gold">Q{quad}</span>}
      {blocks[0] && <span className="tag">{blocks[0].planDate.slice(5).replace('-', '/')} {fmtMinute(blocks[0].startMinute)}</span>}
      {node.provisional && <span className="tag">仮</span>}
      {node.sourceAnchorId && !resolveAnchor(data, node.sourceAnchorId) && <span className="tag broken">リンク切れ</span>}
    </span>
  );
}

function TreeRow(props: { node: PlanNode; cm: Map<string | null, PlanNode[]>; depth: number; onOpen: (n: PlanNode) => void }) {
  const { node, cm } = props;
  const kids = cm.get(node.id) ?? [];
  return (
    <li role="treeitem" aria-expanded={kids.length ? !node.collapsed : undefined} aria-level={props.depth + 1} data-testid={`row-${node.id}`}>
      <div className={`tree-row kind-row-${node.kind}`}>
        {kids.length > 0 ? (
          <button className="twisty" aria-label={node.collapsed ? '開く' : '折り畳む'} onClick={() => prepo.updateNode(node.id, { collapsed: !node.collapsed })}>{node.collapsed ? '▸' : '▾'}</button>
        ) : <span className="twisty-sp" />}
        <button className="tree-title" onClick={() => props.onOpen(node)} data-testid={`open-${node.id}`}>
          <span className="tline"><KindBadge kind={node.kind} /><span className="t">{node.title || '（無題・タップして名前を入力）'}</span></span>
          <NodeMeta node={node} />
        </button>
        <AsyncButton className="iconbtn add-child" ariaLabel={`「${node.title}」に子を追加`} testId={`add-child-${node.id}`} onClick={() => prepo.createNode({ kind: node.kind === 'goal' ? 'milestone' : 'action', title: '', parentId: node.id }).then(async () => { if (node.collapsed) await prepo.updateNode(node.id, { collapsed: false }); })}>＋</AsyncButton>
      </div>
      {kids.length > 0 && !node.collapsed && (
        <ul role="group">{kids.map((k) => <TreeRow key={k.id} node={k} cm={cm} depth={props.depth + 1} onOpen={props.onOpen} />)}</ul>
      )}
    </li>
  );
}

function MapNode(props: { node: PlanNode; cm: Map<string | null, PlanNode[]>; onOpen: (n: PlanNode) => void }) {
  const { node, cm } = props;
  const kids = cm.get(node.id) ?? [];
  return (
    <li data-testid={`map-${node.id}`}>
      <div className={`mm-node kind-row-${node.kind}`}>
        <button className="tree-title" onClick={() => props.onOpen(node)}><KindBadge kind={node.kind} /><span className="t">{node.title || '（無題）'}</span></button>
        <NodeMeta node={node} />
        <div className="mm-actions">
          {kids.length > 0 && <button className="btn sm ghost" onClick={() => prepo.updateNode(node.id, { collapsed: !node.collapsed })} data-testid={`map-toggle-${node.id}`}>{node.collapsed ? `開く（${kids.length}）` : '折り畳む'}</button>}
          <AsyncButton className="btn sm ghost" testId={`map-add-${node.id}`} onClick={() => prepo.createNode({ kind: node.kind === 'goal' ? 'milestone' : 'action', title: '', parentId: node.id }).then(async () => { if (node.collapsed) await prepo.updateNode(node.id, { collapsed: false }); })}>＋子</AsyncButton>
        </div>
      </div>
      {kids.length > 0 && !node.collapsed && <ul>{kids.map((k) => <MapNode key={k.id} node={k} cm={cm} onOpen={props.onOpen} />)}</ul>}
    </li>
  );
}

function AddGoalSheet(props: { onClose: () => void }) {
  const app = useApp();
  const legacyGoals = getExistingGoals(app.data);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState<string>(LIFE_COMPASS_ANCHOR);
  const [provisional, setProvisional] = useState(app.data.lifeCompass.status === 'exploring');
  return (
    <Sheet title="目標を追加" eyebrow="目標ツリー" onClose={props.onClose} testId="add-goal-sheet">
      <TextField label="目標・探索テーマ" value={title} onChange={setTitle} placeholder="例：信頼される営業力を育てる" testId="goal-title" />
      <Choice
        legend="どこにつなげますか（参照のみ・回答は複製しません）"
        column
        options={[
          { value: LIFE_COMPASS_ANCHOR, label: `人生の軸：${getLifeAnchors(app.data)[0].label}` },
          ...legacyGoals.map((g) => ({ value: g.id, label: `初回ワークなどで決めた目標：${g.label}` })),
          { value: 'none', label: 'つなげない（あとで決める）' },
        ]}
        value={link}
        onChange={setLink}
      />
      {legacyGoals.length > 0 && <button className="linkbtn small" onClick={() => setTitle(legacyGoals[0].label)}>既存の目標名を使う</button>}
      <Choice legend="状態" options={[{ value: 'p', label: '仮の目標（探索中）' }, { value: 'f', label: '取り組む目標' }]} value={provisional ? 'p' : 'f'} onChange={(v) => setProvisional(v === 'p')} />
      <AsyncButton className="btn primary block" disabled={!title.trim()} testId="goal-save" onClick={async () => {
        await prepo.createNode({ kind: 'goal', title: title.trim(), parentId: null, sourceAnchorId: link === 'none' ? null : link, provisional });
        app.toast('目標を追加しました。');
        props.onClose();
      }}>追加する</AsyncButton>
    </Sheet>
  );
}
