import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { completeWorkshop, saveWorkshopAnswer, setWorkshopStep, addLifeReflection } from '../db/repo';
import {
  INTRO_SLIDES, LT00, QUESTIONS, QUESTION_MINUTES, ROUTE_LETTER, STEPS, branchFor, getRoute, incidentFollowupsApplicable,
  missingForFinalize, sectionOfStep, DEFAULT_KIND, SECTIONS, type Answer, type Answers, type BankQuestion,
} from '../domain/workshop';
import { HYPOTHESIS_EXPERIMENTS } from '../domain/rules';
import { Choice, Ico, MultiChoice, TextField } from '../ui/kit';
import type { Route } from '../domain/schema';

const SLIDE_ICONS = [Ico.lock, Ico.seed, Ico.layers, Ico.cue, Ico.flask, Ico.moonRest, Ico.advance, Ico.check];

const KIND_LABEL = { exploration: '探索（試して確かめる）', learning: '学習（方法を知る・試す）', execution: '実行（成果につながる行動）' } as const;
const EVIDENCE_KINDS = ['探索結果', '能力の変化', '実際の成果'] as const;
const Q17_MINIMAL = ['2分だけ始める', '誰かに相談・支援を頼む', '合理的に再計画する', '休息する'] as const;

export function Workshop() {
  const { data, navigate, toast } = useApp();
  const answers = data.workshop.answers as Answers;
  const completed = data.workshop.status === 'completed';
  const initialStep = data.workshop.currentStepId && STEPS.includes(data.workshop.currentStepId) ? data.workshop.currentStepId : 'intro';
  const [step, setStep] = useState<string>(completed ? 'summary' : initialStep);
  const [slide, setSlide] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const idx = STEPS.indexOf(step);
  const section = sectionOfStep(step);
  const route = getRoute(answers);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const save = async (id: string, a: Answer | undefined) => {
    await saveWorkshopAnswer(id, a, step);
    setSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
  };

  const go = async (to: string) => {
    // 分岐からの初期値は保存処理の中で最新の回答から作る（既存の回答は上書きしない）
    await setWorkshopStep(to);
    setStep(to);
  };
  const next = () => {
    let n = idx + 1;
    // Q10『該当なし』『思い出せない』なら Q11–Q13 は飛ばしてよい（強制しない）
    while (['Q11', 'Q12', 'Q13'].includes(STEPS[n]) && !incidentFollowupsApplicable(answers)) n++;
    return go(STEPS[Math.min(n, STEPS.length - 1)]);
  };
  const prev = () => {
    let n = idx - 1;
    while (['Q11', 'Q12', 'Q13'].includes(STEPS[n]) && !incidentFollowupsApplicable(answers)) n--;
    return go(STEPS[Math.max(n, 0)]);
  };
  const skip = async () => {
    await save(step, { skipped: true });
    await next();
  };

  const progress = Math.round((idx / (STEPS.length - 1)) * 100);
  const q = QUESTIONS.find((x) => x.id === step);
  // 60分の7区間。現在の区間は区間内の進み具合で塗る
  const secSteps = STEPS.filter((s) => sectionOfStep(s).id === section.id);
  const inSection = step === 'intro' ? (slide + 1) / INTRO_SLIDES.length : (secSteps.indexOf(step) + 1) / secSteps.length;
  const secIndex = SECTIONS.findIndex((s) => s.id === section.id);

  return (
    <div data-testid="workshop">
      <div className="wk-head">
        <span className="clock">{section.window}</span>
        <span className="grow" />
        <button className="close" onClick={() => navigate({ name: 'today' })}>途中保存して閉じる</button>
      </div>
      <div className="wk-title">{section.title}<span>{section.minutes}分</span>
      </div>
      <div className="timeline" role="progressbar" aria-label={`初回ワークの進み具合：${SECTIONS.length}区間中${secIndex + 1}区間目`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        {SECTIONS.map((s, i) => (
          <div key={s.id} className={`seg ${i < secIndex ? 'done' : i === secIndex ? 'now' : ''}`} style={{ flex: s.minutes }} title={`${s.window} ${s.title}`}>
            <i style={i === secIndex ? { width: `${Math.max(8, inSection * 100)}%` } : undefined} />
          </div>
        ))}
      </div>

      {step === 'intro' && (
        <div className="slide-stage" data-testid="intro">
          <div key={slide} className="slide-enter">
            <div className="slide-illus" aria-hidden="true">{SLIDE_ICONS[slide]}</div>
            <div className="slide-no">{String(slide + 1).padStart(2, '0')} / {String(INTRO_SLIDES.length).padStart(2, '0')}　各1分以内</div>
            <h2 className="slide-title">{INTRO_SLIDES[slide].title}</h2>
            <p className="slide-body">{INTRO_SLIDES[slide].body}</p>
          </div>
          <div className="slide-dots" aria-hidden="true" style={{ margin: '22px 0 18px' }}>
            {INTRO_SLIDES.map((_, i) => <i key={i} className={i === slide ? 'on' : ''} />)}
          </div>
          <div className="btnrow">
            {slide > 0 && <button className="btn ghost" onClick={() => setSlide(slide - 1)}>戻る</button>}
            {slide < INTRO_SLIDES.length - 1 ? (
              <button className="btn primary" onClick={() => setSlide(slide + 1)} data-testid="intro-next">次へ</button>
            ) : (
              <button className="btn primary" onClick={() => go('Q01')} data-testid="intro-done">ワークを始める</button>
            )}
          </div>
          {slide < INTRO_SLIDES.length - 1 && (
            <button className="linkbtn small" onClick={() => go('Q01')}>説明を飛ばして質問へ</button>
          )}
        </div>
      )}

      {q && data.workshop.currentStepId === q.id && (
        <QuestionCard key={q.id} q={q} answers={answers} route={route} onSave={save} />
      )}

      {(step === 'BR1' || step === 'BR2') && data.workshop.currentStepId === step && (
        <BranchCard key={step} step={step} answers={answers} route={route} onSave={save} onPickRoute={() => go('Q07')} />
      )}

      {step === 'summary' && <Summary answers={answers} completed={completed} onEdit={(id) => go(id)} onDone={async () => {
        try {
          await completeWorkshop();
          toast('初回ワークを保存しました。「今日」に最重要行動が表示されます。');
          navigate({ name: 'today' });
        } catch (e) {
          toast((e as Error).message);
        }
      }} />}

      {step !== 'intro' && step !== 'summary' && (
        <div className="wfooter">
          <button className="btn ghost" onClick={prev} aria-label="前の質問へ">←</button>
          <div className="btnrow" style={{ flexWrap: 'nowrap' }}>
            {(q?.maySkip ?? true) && <button className="btn ghost" onClick={skip} data-testid="skip">スキップ</button>}
            <button className="btn primary" onClick={next} data-testid="next">次へ</button>
          </div>
        </div>
      )}
      <p className="savestate" aria-live="polite">{savedAt ? `自動保存しました（${savedAt}）` : '回答は入力するたびに自動保存されます'}</p>
    </div>
  );
}

function QHeader(props: { id: string; label: string; required?: boolean; minutes?: number }) {
  return (
    <>
      <div className="row">
        <span className="qid">{props.id}</span>
        {props.minutes !== undefined && <span className="faint small">目安 {props.minutes}分</span>}
        <span className="grow" />
        {props.required ? <span className="tag gold">完了時に必要</span> : <span className="tag">任意・スキップ可</span>}
      </div>
      <h1 className="qtitle">{props.label}</h1>
    </>
  );
}

function QuestionCard(props: { q: BankQuestion; answers: Answers; route: Route | null; onSave: (id: string, a: Answer | undefined) => Promise<void> }) {
  const { q, answers, onSave } = props;
  const a: Answer = answers[q.id] && !answers[q.id]!.skipped ? answers[q.id]! : {};
  const [draft, setDraft] = useState<Answer>(a);
  const stored = answers[q.id];
  // 分岐からの初期値など、描画後に保存値が届いた場合は未入力のときだけ反映する
  useEffect(() => {
    if (stored && !stored.skipped && Object.keys(draft).length === 0) setDraft(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  // テキストは入力のたびに保存（オフラインでもIndexedDBへ即時保存）
  const setText = (patch: Partial<Answer>) => {
    const n = { ...draft, ...patch, skipped: false };
    setDraft(n);
    void onSave(q.id, n);
  };
  const opts = (list: string[]) => list.map((o) => ({ value: o, label: q.optionLabels[o] ?? o }));
  const wasSkipped = answers[q.id]?.skipped;

  return (
    <div className="card" data-testid={`q-${q.id}`}>
      <QHeader id={q.id} label={q.label} required={q.requiredToFinalize} minutes={QUESTION_MINUTES[q.id]} />
      {wasSkipped && <p className="small faint">スキップ済み（いつでも回答できます）</p>}
      {renderBody()}
      {q.id === 'Q02' && <Lt00Card answers={answers} onSave={onSave} />}
      {q.id === 'Q06' && <p className="small faint">「人に話さない」は正常な選択です。このアプリには公開機能がありません。</p>}
      {q.id === 'Q07' && <p className="small faint">ルートは性格の分類ではありません。今の状態に近いものを選び、いつでも変更できます。</p>}
      {q.section === 'incident' && <p className="small faint">原因はまだ仮説です。休息・緊急対応・方法が分からないことを、逃避と決めつけません。</p>}
    </div>
  );

  function renderBody() {
    switch (q.inputType) {
      case 'select_or_text':
        return (
          <>
            <Choice legend={q.label} hideLegend options={opts(q.options)} value={draft.choice} onChange={(v) => setText({ choice: v })} />
            <TextField label="具体的に（任意）" value={draft.text ?? ''} onChange={(v) => setText({ text: v })} placeholder="例：提案がいつも後回しになる" multiline />
          </>
        );
      case 'multi_or_text':
        return (
          <>
            <MultiChoice legend={q.label} hideLegend options={opts(q.options)} value={draft.choices ?? []} onChange={(v) => setText({ choices: v })} />
            <TextField label="自分の言葉で（任意）" value={draft.text ?? ''} onChange={(v) => setText({ text: v })} multiline />
          </>
        );
      case 'text':
        return <TextField label="短く書く（任意）" value={draft.text ?? ''} onChange={(v) => setText({ text: v })} multiline />;
      case 'single':
        return <Choice legend={q.label} hideLegend options={opts(q.options)} value={draft.choice} onChange={(v) => setText({ choice: v })} column={q.id === 'Q18'} />;
      case 'route':
        return (
          <Choice
            legend={q.label}
            hideLegend
            column
            options={q.options.map((o) => ({ value: o, label: <><span className="letter">{ROUTE_LETTER[o as Route]}</span>{q.optionLabels[o]}</> }))}
            value={draft.choice}
            onChange={(v) => setText({ choice: v })}
          />
        );
      case 'experiment_theme': {
        const kind = draft.kind ?? (props.route ? DEFAULT_KIND[props.route] : undefined);
        return (
          <>
            <Choice legend="実験の種類" options={(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={kind} onChange={(v) => setText({ kind: v })} column />
            <TextField label="14日間のテーマ" value={draft.text ?? ''} onChange={(v) => setText({ text: v, kind })} placeholder={props.route === 'explore' ? '例：充実感のある活動を2種類試し、気づきを書く' : '例：提案の手順を1本作って試す'} multiline testId="q08-theme" />
          </>
        );
      }
      case 'evidence_plan':
        return (
          <>
            <MultiChoice legend="どんな証拠で確かめますか（1つ以上）" options={EVIDENCE_KINDS.map((k) => ({ value: k, label: k }))} value={draft.choices ?? []} onChange={(v) => setText({ choices: v })} />
            <TextField label="具体的な証拠" value={draft.text ?? ''} onChange={(v) => setText({ text: v })} placeholder="例：2つの活動を試し印象をメモ／商談を3件実施" multiline />
            <div className="inline-fields">
              <TextField label="今の値（任意）" type="number" inputMode="decimal" value={draft.baseline?.toString() ?? ''} onChange={(v) => setText({ baseline: v === '' ? null : Number(v) })} />
              <TextField label="14日目の目標値（任意）" type="number" inputMode="decimal" value={draft.target?.toString() ?? ''} onChange={(v) => setText({ target: v === '' ? null : Number(v) })} />
            </div>
            <TextField label="単位（任意）" value={draft.unit ?? ''} onChange={(v) => setText({ unit: v })} placeholder="件・円・回 など" hint="曖昧なら空欄で「未測定」のままでOK。Day7で測り方を見直せます。" />
          </>
        );
      case 'text_or_none':
        return (
          <>
            <Choice legend={q.label} hideLegend options={[{ value: 'text', label: 'ある' }, { value: 'none', label: '該当なし' }, { value: 'not_remember', label: '思い出せない' }]} value={draft.mode} onChange={(v) => setText({ mode: v as Answer['mode'] })} />
            {draft.mode === 'text' && <TextField label="具体例（任意）" value={draft.text ?? ''} onChange={(v) => setText({ text: v })} multiline hint="うまく実行できた例でも構いません。" />}
          </>
        );
      case 'multi': {
        const max = q.maxSelections ?? 2;
        return (
          <>
            <MultiChoice legend={`最大${max}つまで`} options={opts(q.options)} value={draft.choices ?? []} max={max} onChange={(v) => setText({ choices: v.slice(0, max) })} column />
            {(draft.choices ?? []).length > 0 && (
              <div className="card flat" style={{ marginTop: 10 }}>
                <div className="small faint">14日間に試せる改善実験の例（採用は自由）</div>
                {(draft.choices ?? []).map((h) => <p key={h} className="small" style={{ margin: '6px 0 0' }}>・{HYPOTHESIS_EXPERIMENTS[h]?.experiment}</p>)}
              </div>
            )}
          </>
        );
      }
      case 'action':
        return (
          <>
            <TextField label="何をするか（動詞＋対象）" value={draft.action ?? ''} onChange={(v) => setText({ action: v })} placeholder="例：見込み顧客へ提案を1件送る" testId="q15-action" />
            <TextField label="どうなったら終わりか（終了判定）" value={draft.doneWhen ?? ''} onChange={(v) => setText({ doneWhen: v })} placeholder="例：送信ボタンを押したら終了" />
            <Choice legend="いつ実行しますか" options={[{ value: 'today', label: '今日' }, { value: 'tomorrow', label: '明日' }]} value={draft.when ?? 'tomorrow'} onChange={(v) => setText({ when: v as 'today' | 'tomorrow' })} />
          </>
        );
      case 'if_then':
        return <TextField label="もし（時間・場所・きっかけ）になったら、その一歩を始める" value={draft.text ?? ''} onChange={(v) => setText({ text: v })} placeholder="例：朝食後、机で5分、仮目標を3行書く" multiline testId="q16-cue" />;
      case 'backup_and_evidence':
        return (
          <>
            <Choice legend="妨げが出たときの最小行動" options={Q17_MINIMAL.map((v) => ({ value: v, label: v }))} value={draft.minimal} onChange={(v) => setText({ minimal: v })} column />
            <TextField label="どの時間を置き換えますか（任意）" value={draft.displaced ?? ''} onChange={(v) => setText({ displaced: v })} placeholder="例：朝のSNSの10分" hint="予定に時間を「追加」するだけでなく、何と入れ替えるかを確認します。" />
            <TextField label="何を記録しますか（任意）" value={draft.evidence ?? ''} onChange={(v) => setText({ evidence: v })} placeholder="例：送った件数と相手の反応" />
          </>
        );
      default:
        return null;
    }
  }
}

/** LT00：Q02の中の任意補助カード（最大60秒、時間を延長しない） */
function Lt00Card(props: { answers: Answers; onSave: (id: string, a: Answer | undefined) => Promise<void> }) {
  const lt = props.answers.LT00 ?? {};
  const [open, setOpen] = useState(!!lt.text);
  const [text, setText] = useState(lt.text ?? '');
  const gentle = !!lt.useGentle;
  const label = gentle ? LT00.gentleAlternative : LT00.label;
  if (!open) {
    return (
      <button className="linkbtn small" onClick={() => setOpen(true)} data-testid="lt00-open">
        補助カードを見る（任意・60秒以内）
      </button>
    );
  }
  return (
    <div className="lt-card" data-testid="lt00">
      <div className="row"><span className="qid">LT00</span><span className="tag">任意・非公開・スキップ可</span></div>
      <p style={{ fontWeight: 650, margin: '6px 0' }}>{label}</p>
      <TextField label="思いついたこと（任意）" value={text} onChange={(v) => { setText(v); void props.onSave('LT00', { ...lt, text: v }); }} multiline />
      <div className="btnrow">
        <button className="btn sm ghost" onClick={() => props.onSave('LT00', { ...lt, useGentle: !gentle })}>
          {gentle ? '元の問いに戻す' : '「将来の自分」から考える問いに切り替える'}
        </button>
        {text.trim() && !lt.importedToQ02 && (
          <button
            className="btn sm cyan"
            data-testid="lt00-import"
            onClick={async () => {
              if (!window.confirm('この言葉をQ02の「自分の言葉で」に追記しますか？（上書きはしません）')) return;
              const q02 = props.answers.Q02 ?? {};
              await props.onSave('Q02', { ...q02, skipped: false, text: [q02.text?.trim(), text.trim()].filter(Boolean).join(' ／ ') });
              await props.onSave('LT00', { ...lt, text, importedToQ02: true });
              await addLifeReflection('LT00', text.trim(), 'values');
            }}
          >
            Q02に取り込む
          </button>
        )}
        <button className="btn sm ghost" onClick={() => setOpen(false)}>閉じる</button>
      </div>
      {lt.importedToQ02 && <p className="small faint">Q02に取り込みました。Q02の欄でいつでも修正できます。</p>}
    </div>
  );
}

function BranchCard(props: { step: 'BR1' | 'BR2'; answers: Answers; route: Route | null; onSave: (id: string, a: Answer | undefined) => Promise<void>; onPickRoute: () => void }) {
  const br = branchFor(props.route);
  const a = props.answers[props.step] ?? {};
  const [text, setText] = useState(a.skipped ? '' : a.text ?? '');
  if (!br) {
    return (
      <div className="card">
        <p>Q07で現在の状態を選ぶと、状態に合った追加の問いが表示されます（任意）。</p>
        <button className="btn cyan" onClick={props.onPickRoute}>Q07へ戻る</button>
      </div>
    );
  }
  const i = props.step === 'BR1' ? 0 : 1;
  const id = br.labels[i];
  const hints: Record<string, string> = {
    A1: '最近「充実した」「時間を忘れた」「価値があると思った」場面。なければ「まだない」でOK。',
    B1: '責任・失敗・他者評価・期限・不明 など。',
    C1: '最初の一歩／全体の方法／できる見込み、のどれが近いか。',
    D1: '迷い・不安・別作業・突発依頼・疲労 など。',
  };
  return (
    <div className="card" data-testid={`branch-${id}`}>
      <QHeader id={`${ROUTE_LETTER[br.route]}ルート ${id}`} label={br.prompts[i]} />
      <TextField label="短く書く（任意）" value={text} onChange={(v) => { setText(v); void props.onSave(props.step, { text: v, skipped: false }); }} hint={hints[id]} multiline />
      <p className="small faint">このルートで作るもの：{br.output}</p>
      {props.route === 'protect' && <p className="small faint">誰にも公開する必要はありません。本人だけの仮案として保存されます。</p>}
    </div>
  );
}

function Summary(props: { answers: Answers; completed: boolean; onEdit: (id: string) => void; onDone: () => Promise<void> }) {
  const missing = useMemo(() => missingForFinalize(props.answers), [props.answers]);
  const a = props.answers;
  const route = getRoute(a);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card hero" data-testid="summary">
      <div className="eyebrow">56:00〜60:00 アプリ利用と初回2分</div>
      <h2>あなたが選んだ14日間の実験</h2>
      <dl className="summary-list">
        <div><dt>現在の状態</dt><dd>{route ? `${ROUTE_LETTER[route]}：${QUESTIONS[6].optionLabels[route]}` : '未選択'}</dd></div>
        <div><dt>14日間のテーマ</dt><dd>{a.Q08?.text || '未入力'}</dd></div>
        <div><dt>最も大切な一歩</dt><dd>{a.Q15?.action || '未入力'}{a.Q15?.when === 'today' ? '（今日）' : a.Q15?.action ? '（明日）' : ''}</dd></div>
        <div><dt>始める条件</dt><dd>{a.Q16?.text || '未入力'}</dd></div>
      </dl>
      {missing.length > 0 && !props.completed && (
        <div className="banner warn">
          完了には次の項目が必要です：
          <div className="btnrow" style={{ marginTop: 8 }}>
            {missing.map((m) => <button key={m.id} className="btn sm" onClick={() => props.onEdit(m.id)}>{m.label}</button>)}
          </div>
          <p className="small" style={{ margin: '8px 0 0' }}>無理に決めなくても大丈夫です。途中保存して、後から続きを再開できます。</p>
        </div>
      )}
      <hr className="divider" />
      <p className="small muted">使い方：朝30〜60秒で今日の行動を選ぶ／必要なときだけ15〜30秒で「別のことをしたい」「予定外の対応」／夜1〜2分で振り返り。Day7に軽い確認、Day14に振り返りがあります。</p>
      {props.completed ? (
        <p className="gold">初回ワークは保存済みです。内容は「人生の軸」と「今日」から修正できます。</p>
      ) : (
        <button className="btn primary xl block" disabled={missing.length > 0 || busy} data-testid="finish-workshop" onClick={async () => { setBusy(true); try { await props.onDone(); } finally { setBusy(false); } }}>
          保存して「今日」へ
        </button>
      )}
      <p className="small faint" style={{ marginTop: 10 }}>大きな夢を宣言することが成果ではありません。現実に一歩を選び、その結果を見て、次を自分で決めることが成果です。</p>
    </div>
  );
}
