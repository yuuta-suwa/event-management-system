"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="login-form">
      <label>メールアドレス<input name="email" type="email" autoComplete="email" required /></label>
      <label>パスワード<input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "確認中…" : "ログイン"}</button>
    </form>
  );
}
