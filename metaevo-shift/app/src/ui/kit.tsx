import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; eyebrow?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref} data-testid={props.testId}>
        <div className="sheet-head">
          <div style={{ flex: 1 }}>
            {props.eyebrow && <div className="eyebrow">{props.eyebrow}</div>}
            <h2 id={titleId}>{props.title}</h2>
          </div>
          <button className="iconbtn" onClick={props.onClose} aria-label="閉じる">✕</button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function Choice<T extends string>(props: {
  legend: string;
  hideLegend?: boolean;
  options: readonly { value: T; label: ReactNode }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  column?: boolean;
  name?: string;
}) {
  const auto = useId();
  const name = props.name ?? auto;
  return (
    <fieldset className={props.column ? 'chips options-col' : 'chips'}>
      <legend className={props.hideLegend ? 'sr-only' : undefined}>{props.legend}</legend>
      {props.options.map((o) => (
        <label className="chip" key={o.value}>
          <input type="radio" name={name} value={o.value} checked={props.value === o.value} onChange={() => props.onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function MultiChoice<T extends string>(props: {
  legend: string;
  hideLegend?: boolean;
  options: readonly { value: T; label: ReactNode }[];
  value: T[];
  onChange: (v: T[]) => void;
  max?: number;
  column?: boolean;
}) {
  const full = props.max !== undefined && props.value.length >= props.max;
  return (
    <fieldset className={props.column ? 'chips options-col' : 'chips'}>
      <legend className={props.hideLegend ? 'sr-only' : undefined}>{props.legend}</legend>
      {props.options.map((o) => {
        const checked = props.value.includes(o.value);
        return (
          <label className="chip" key={o.value}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && full}
              onChange={() => props.onChange(checked ? props.value.filter((v) => v !== o.value) : [...props.value, o.value])}
            />
            {o.label}
          </label>
        );
      })}
    </fieldset>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
  type?: 'text' | 'number' | 'date' | 'time';
  testId?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} data-testid={props.testId} />
      ) : (
        <input type={props.type ?? 'text'} inputMode={props.inputMode} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} data-testid={props.testId} />
      )}
      {props.hint && <div className="hint">{props.hint}</div>}
    </label>
  );
}

/** 押下中は無効化して多重タップを防ぐボタン */
export function AsyncButton(props: { onClick: () => Promise<unknown> | unknown; className?: string; children: ReactNode; disabled?: boolean; testId?: string; ariaLabel?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={props.className ?? 'btn'}
      disabled={busy || props.disabled}
      aria-busy={busy}
      data-testid={props.testId}
      aria-label={props.ariaLabel}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await props.onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {props.children}
    </button>
  );
}

/** 2段階確認 */
export function ConfirmTwoStep(props: { label: string; confirmLabel: string; warning: string; onConfirm: () => Promise<void> | void; requireWord?: string; testId?: string }) {
  const [step, setStep] = useState(0);
  const [word, setWord] = useState('');
  if (step === 0) return <button className="btn danger block" data-testid={props.testId} onClick={() => setStep(1)}>{props.label}</button>;
  return (
    <div className="card flat" role="alertdialog" aria-label="確認">
      <p><strong>{props.warning}</strong></p>
      {props.requireWord && (
        <TextField label={`確認のため「${props.requireWord}」と入力してください`} value={word} onChange={setWord} testId={props.testId ? `${props.testId}-word` : undefined} />
      )}
      <div className="btnrow">
        <button className="btn ghost" onClick={() => { setStep(0); setWord(''); }}>やめる</button>
        <AsyncButton className="btn danger" testId={props.testId ? `${props.testId}-confirm` : undefined} disabled={!!props.requireWord && word.trim() !== props.requireWord} onClick={async () => { await props.onConfirm(); setStep(0); setWord(''); }}>
          {props.confirmLabel}
        </AsyncButton>
      </div>
    </div>
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function Toast(props: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!props.message) return;
    const t = setTimeout(props.onDone, 2600);
    return () => clearTimeout(t);
  }, [props.message, props.onDone]);
  if (!props.message) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--tabbar-h) + 18px + env(safe-area-inset-bottom))', zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div className="card" style={{ margin: 0, padding: '10px 14px', borderColor: 'var(--gold)', maxWidth: 520 }}>{props.message}</div>
    </div>
  );
}

export const icons = {
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" /></svg>
  ),
  compass: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" strokeLinejoin="round" /></svg>
  ),
  growth: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" /></svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 4v4.6h4.6M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" strokeLinecap="round" /></svg>
  ),
};

/** 線画アイコン（装飾用。意味はテキストで伝える） */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Ico = {
  play: <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>,
  check: <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path {...P} strokeWidth={2.4} d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  pause: <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path {...P} strokeWidth={2.2} d="M9 6v12M15 6v12" /></svg>,
  advance: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M4 17l6-6 4 4 6-7" /><path {...P} d="M15 8h5v5" /></svg>,
  prepare: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M4 19.5h16M6.5 16V9.5M12 16V6M17.5 16v-4" /></svg>,
  recover: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" /></svg>,
  shuffle: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.5-3.6M13 9.6C13.8 8 14.8 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" /></svg>,
  bolt: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z" /></svg>,
  question: <svg viewBox="0 0 24 24" aria-hidden="true"><circle {...P} cx="12" cy="12" r="9" /><path {...P} d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6M12 16.8v.2" /></svg>,
  edit: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>,
  cue: <svg viewBox="0 0 24 24" aria-hidden="true"><circle {...P} cx="12" cy="13" r="7.5" /><path {...P} d="M12 9.5V13l2.5 1.6M9.5 2.5h5" /></svg>,
  lock: <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...P} x="5" y="10.5" width="14" height="10" rx="2.5" /><path {...P} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>,
  seed: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M12 20v-7M12 13C12 8.5 8.5 6 4.5 6c0 4.5 3 7 7.5 7zM12 11c0-3.5 2.8-6 7-6 0 4-2.8 6-7 6" /></svg>,
  moonRest: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M18.5 14A7 7 0 0 1 10 5.5 7 7 0 1 0 18.5 14z" /><path {...P} d="M16 3.5v3M14.5 5h3" /></svg>,
  device: <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...P} x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path {...P} d="M10.5 18.5h3" /></svg>,
  shield: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M12 3 5 6v5.5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5V6z" /><path {...P} d="M9 12l2 2 4-4" /></svg>,
  save: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14" /></svg>,
  heart: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M12 19.5S4.5 15 4.5 9.6A4 4 0 0 1 12 7.5a4 4 0 0 1 7.5 2.1C19.5 15 12 19.5 12 19.5z" /></svg>,
  layers: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></svg>,
  flask: <svg viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M9.5 3.5h5M10.5 3.5v5.5L5 18.5A1.8 1.8 0 0 0 6.6 21h10.8a1.8 1.8 0 0 0 1.6-2.5L13.5 9V3.5M7.5 15h9" /></svg>,
  hourglass: <svg viewBox="0 0 64 64" aria-hidden="true"><path {...P} strokeWidth={1.6} d="M18 8h28M18 56h28M21 8c0 13 22 15 22 24S21 43 21 56M43 8c0 13-22 15-22 24s22 11 22 24" /><path d="M26 50c2-3 10-3 12 0z" fill="currentColor" opacity=".5" /></svg>,
};
