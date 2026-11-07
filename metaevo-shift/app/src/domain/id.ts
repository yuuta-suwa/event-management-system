/** ローカル一意ID（外部送信なし） */
export function newId(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined;
  const rand = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}
