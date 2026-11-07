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
