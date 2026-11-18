# API CONTRACTS｜API 契約

共通ルール
- 認証：Supabase セッション Cookie（同一オリジン）。`user_id` は**リクエストから受け取らず**、セッション（DB では `auth.uid()`）から導出。
- 状態変更（POST）：`Content-Type: application/json` 必須、`Origin` が自サイトと一致しない場合 403（CSRF 対策）。
- エラー形式：`{ "error": { "code": "<CODE>" } }`。内部エラー文は返さない（未知のエラーは `UNKNOWN`/500）。
- 代表的なステータス：401 NOT_AUTHENTICATED／403 FORBIDDEN・ACCOUNT_NOT_ACTIVE・NOT_INVITED・MFA_REQUIRED・APP_ACCESS_DENIED／404 NOT_FOUND／409 SNAPSHOT_SUPERSEDED／415／429。

## 認証・アクセス

| Method | Path | 要件 | 応答 |
|---|---|---|---|
| GET | `/api/health` | なし | `{ ok: true }` |
| GET | `/api/me/access` | ログイン | `{ authenticated, user_id, email, display_name, status, aal, admin_mfa_required, roles[], apps[{code,name_en,name_ja,granted}] }`（未招待は status=`not_invited`） |
| GET | `/api/apps/:code/access` | active＋該当アプリ権限 | 200 `{ app_code, granted: true }`／403 |
| GET | `/api/me/export` | active | 本人データ一式の JSON（添付ファイル） |

## 連携（schema_version 1.0）

### POST `/api/transfers/app01-to-app02`・`/api/transfers/app02-to-app03`
要件：active＋転送元アプリの権限（転送先の権限が無い場合は failed として記録され、付与後に再試行可）
```json
{ "snapshot_id": "uuid", "schema_version": "1.0", "consent_version": "2026-11", "confirmed": true }
```
- `confirmed: true`（本人が内容を確認して同意）必須。
- 応答：201 新規成功／200 冪等（既に成功済み）／202 失敗を記録（再試行可能）
```json
{ "transfer_id": "uuid", "status": "succeeded|failed", "error": "TARGET_APP_ACCESS_DENIED", "idempotent": false }
```
- 冪等キー：`(snapshot_id, target_app, schema_version)`。同時送信・再送でも転送レコード・受信データは1件。
- 本人の最新確定版のみ転送可（旧版は 409 SNAPSHOT_SUPERSEDED）。

### GET `/api/transfers/:id`
本人（または担当管理者）のみ。`{ id, source_app, target_app, status, attempt_count, last_error, needs_reconfirm, ... }`。内容（payload）は返さない。

### POST `/api/transfers/:id/retry`
本人のみ。同じ転送IDで再試行（最大10回）。元スナップショットは変更しない。元データ更新後は 409。

### GET `/api/blueprints/current`（APP01 権限）／GET `/api/growth-plans/current`（APP02 権限）
本人の最新確定スナップショット `{ snapshot_id, schema_version, version, payload, confirmed_at }`。

### POST `/api/snapshots`（契約検証用）
APP 本体が未実装の間に確定スナップショットを登録する。各 APP 実装後は APP 側の確定処理から `confirm_snapshot` RPC を呼ぶ。
```json
{ "app_code": "APP01", "snapshot_type": "life_blueprint", "schema_version": "1.0", "payload": { ... } }
```

## ペイロード定義

### life_blueprint 1.0（APP01 → APP02｜APP01仕様書 §10）
| 項目 | 型 | 備考 |
|---|---|---|
| blueprint_id | uuid | |
| life_purpose | string（必須・非空） | 人生の目的 |
| priority_desires | string[] | 最優先の願望 |
| budget_summary | object | 月額・年額・必要資産・時期（未入力は0にしない） |
| vision_board_asset_refs | string[] | Storage 参照キー（公開URLは渡さない） |
| gap_analysis | object | お金・時間・人望・能力 |
| goals | {type: long/mid/short, description, deadline}[] | |
| priority_capabilities | string[] | |
| first_action / first_action_date | string / date | |
| consent_version | string | |
受信時に付与：`user_id, snapshot_id, source_app, schema_version, confirmed_at`。

### growth_plan 1.0（APP02 → APP03｜APP02仕様書 §21）
| 項目 | 型 | 備考 |
|---|---|---|
| plan_id | uuid | |
| vision_version | int/string | 参照した APP01 版 |
| start_year | int | 西暦4桁 |
| mode | DISCOVERY / CONVICTION / LEGACY | |
| focus_abilities | ability[] | |
| cells | `{ability, year_index("1"〜"10"), ...}[]` **ちょうど60件**、6能力×10年の重複なし | APP03 の 70 マスとは別物 |
| provisional_assessment | object | **暫定**自己診断（APP03 の正式認定ではない） |
| approved_at | datetime | 本人の計画承認日時 |
禁止：`certifications`, `titles`, `certified_levels`（正式認定は APP03 の正本）。
ability コード（暫定・Q-07）：`attraction`(集客力), `recruitment`(採用力), `education`(教育力), `development`(育成力), `operations`(運営力), `management`(経営力)。

APP03 は受信データを「目標」として読み込み、実績・認定と別管理する。APP03 の実績を APP02 の承認済み計画へ書き戻さない。

## DB RPC（各APPからの直接呼び出し用）
`supabase.rpc('check_app_access', { p_app_code: 'APP01' })` → boolean。その他の RPC 一覧は DATABASE_SCHEMA.md。
