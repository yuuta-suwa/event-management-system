const KEY = "eventFormDraft:new";
export type EventDraft = Record<string, string | boolean>;

export function readEventDraft(): EventDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeEventDraft(data: EventDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private mode, quota, etc.) — silently skip
  }
}

export function clearEventDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function serializeForm(form: HTMLFormElement): EventDraft {
  const draft: EventDraft = {};
  const data = new FormData(form);
  for (const [key, value] of data.entries()) if (typeof value === "string") draft[key] = value;
  form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    if (cb.name) draft[cb.name] = cb.checked;
  });
  return draft;
}

export function applyDraftToForm(form: HTMLFormElement, draft: EventDraft) {
  for (const [name, value] of Object.entries(draft)) {
    const el = form.elements.namedItem(name);
    if (!el || el instanceof RadioNodeList) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = value === true;
    else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.value = String(value);
  }
}
