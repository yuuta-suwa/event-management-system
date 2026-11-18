# ARCHITECTURE｜共通基盤アーキテクチャ

## 全体像

```
[Browser]
   │  HTTPS（Cookie: Supabase セッション）
   ▼
[Next.js 16 on Vercel]  ── proxy.ts：getClaims() でトークン検証・更新（楽観的チェックのみ）
   │  ├─ Server Components / Server Actions / Route Handlers
   │  │     getAccess() = rpc('my_access')  ← DB の現在状態から判定
   │  │     requirePage / requireApi        ← 画面・API のサーバー側認可
   │  └─ publishable key ＋ 利用者本人のJWT のみ使用（secret / service_role は不使用）
   ▼
[Supabase]
   ├─ Auth：Google OAuth（PKCE）、MFA（TOTP）
   ├─ PostgREST → PostgreSQL
   │     ├─ public テーブル：全テーブル RLS 有効、authenticated は SELECT のみ（最小限）
   │     ├─ public RPC（SECURITY DEFINER）：書き込みの唯一の経路。権限・MFA・監査を強制
   │     └─ private スキーマ：判定ヘルパー（API 非公開）
   └─ Storage：非公開バケット user-files（本人フォルダ＋アプリ権限のみ）
```

## 多層防御

| 層 | 役割 | 実装 |
|---|---|---|
| proxy | 未ログインで保護パスに来たら /login（API は 401） | `src/proxy.ts`, `src/lib/supabase/proxy.ts` |
| 画面 | 各ページ冒頭で `requirePage()`。レイアウトだけに依存しない | `src/lib/access.ts` |
| API / Server Action | `requireApi()`、CSRF（JSON 必須＋Origin 一致）、入力検証（zod） | `src/lib/api.ts`, `src/lib/transfer-contract.ts` |
| DB RPC | `private.require_admin()` / `require_active_user()`、担当範囲、MFA(aal2)、状態遷移、監査 | `supabase/migrations/2026111800040*` |
| RLS | 全ポリシーで「本人が active」を条件。他人・範囲外の行は返らない | `20261118000300_core_rls.sql` |
| 監査 | 追記専用（UPDATE/DELETE/TRUNCATE をトリガーで拒否） | `audit_logs` |

UI・API の判定が何らかの理由ですり抜けても、DB 層で同じ判定が必ず行われる。

## 主要フロー

### 招待 → 登録
1. 管理者（aal2）が `admin_create_invitation(email, apps[])` → 256bit トークンを生成し **SHA-256 のみ保存**、生トークンは一度だけ画面に表示。
2. 本人が `/invite?token=…` を開く → トークンを15分の HttpOnly Cookie（path=/invite）に保持し Google ログイン。
3. `/auth/callback` でセッション確立 → `/invite/accept` が `accept_invitation(token)` を呼ぶ。
4. DB が招待行を `FOR UPDATE` でロックし、メール確認済み・Google 認証・未使用・未取消・期限内・**認証済みメール＝招待先**を検証。条件付き UPDATE で単回消費し、profile 作成とアプリ権限付与を同一トランザクションで実行。失敗も監査記録（1時間10回で総当たり遮断）。

### 停止 → 再開
- `admin_set_user_status(user, 'suspend')`：status=suspended、`auth.sessions` 削除。以後、既存アクセストークンでも全 RLS / RPC が拒否（`my_access` は status=suspended を返す）。
- `resume`：status=active に戻すだけ。データ・権限は保持。

### 連携（契約検証）
- `confirm_snapshot`：本人の確定スナップショット（版管理、旧版は superseded）。
- `request_transfer(snapshot, target, schema_version, consent_version)`：冪等キー（snapshot×target×schema）。転送先アプリ権限・スキーマを検証して `transfer_inbox` へ追記。失敗は failed として記録し `retry_transfer` で同じ転送IDのまま再試行。
- 元データ更新時：旧転送に `source_superseded_at`（要再確認）。転送先の受信済みデータは上書きしない。

## ディレクトリ

```
life-stage-core/
  src/
    proxy.ts                   セッション更新
    app/                       画面・API（admin/*, api/*, invite/*, account, apps/[code], login, status）
    components/                UI 部品（admin-nav, invite-forms, mfa-panel, ui）
    lib/                       access(-policy), api, errors, paths, supabase/*, transfer-contract
  supabase/
    migrations/                本番適用する SQL（番号順）
    local/supabase_shim.sql    ローカル検証専用（本番に適用しない）
    bootstrap/                 初期 Super Admin 作成 SQL
  tests/unit, tests/db         単体テスト / 実DBセキュリティテスト
  scripts/                     local-db.sh, backup.sh
  docs/                        設計・運用・引き継ぎ資料
```

## 各APPの接続方針（Phase 7・別途承認）
- 各 APP は同じ Supabase プロジェクトの Auth セッションを共有し、起動時に `rpc('check_app_access', {p_app_code})` または `GET /api/apps/:code/access` で利用可否を確認する。
- 各 APP 固有テーブルは `user_id uuid references profiles(id)` ＋ RLS `user_id = auth.uid() and private.has_app_access('<APP>')` を標準とする（テンプレートは DATABASE_SCHEMA.md）。
- 別ドメインで動かす場合の SSO 方式（同一 Supabase プロジェクトでの再ログイン or 親ドメイン Cookie）は本番ドメイン決定後に確定（Q-08）。
