# SECURITY｜セキュリティ設計と対応表

## SEC01〜SEC15 対応

| ID | 要件 | 実装 | 検証 |
|---|---|---|---|
| SEC01 | 招待制 | profile は招待受諾時のみ作成。未招待は全 RLS/RPC で拒否 | AT01 |
| SEC02 | 本人認証 | Google OAuth（PKCE）。受諾時に email_confirmed＋provider=google＋**認証済みメール＝招待先**を DB で照合 | AT02 |
| SEC03 | APP別権限 | `app_entitlements`（アプリごとに独立）、`has_app_access()` | AT05 |
| SEC04 | RLS | 全16テーブル RLS 有効。authenticated は SELECT のみ（列単位で token_hash 除外）。anon 権限なし | AT07, backup test |
| SEC05 | API認可 | 各ページ・API で `requirePage`/`requireApi`、DB RPC 冒頭で再検証。UI 非表示に依存しない | AT06, unit api-routes |
| SEC06 | 秘密情報保護 | アプリは publishable key のみ。secret/service_role キーを公開用に設定すると起動拒否。`.env*` は gitignore | unit lib |
| SEC07 | 管理者MFA | 全管理 RPC が aal2 を要求。設定で無効化不可。MFA 画面（TOTP 登録・検証） | AT11 |
| SEC08 | 監査ログ | 招待・受諾（失敗含む）・権限・状態・ロール・担当・共有・転送・削除・出力・設定を記録。追記専用 | AT17 |
| SEC09 | 非公開画像 | Storage `user-files` は public=false。本人フォルダ＋アプリ権限のみ。公開URLは発行しない | AT07 storage |
| SEC10 | 削除管理 | 申請→Super Admin がメール再入力で確定→遮断。物理削除は運用手順 | AT19 |
| SEC11 | 停止後遮断 | 全ポリシーが毎回 status=active を確認。停止時にリフレッシュトークン失効 | AT08 |
| SEC12 | バックアップ復元 | pg_dump→別DB復元→全テーブル件数・内容ハッシュ一致、RLS・不変性も復元 | AT20 |
| SEC13 | 共有制御 | 担当関係のある相手のみ・本人操作のみ・撤回/期限/担当解除で即時閲覧不可 | AT16 |
| SEC14 | 権限昇格防止 | ロール変更は Super Admin のみ（自分不可）、管理ロール付き招待は SA のみ、テーブル直接書込不可、メタデータ無視、最後の SA 保護 | AT11 |
| SEC15 | 監査 | 管理画面 AUDIT LOGS（範囲制御付き）、失敗操作の KPI | AT17 |

## 招待トークン
- 256bit 乱数（`gen_random_bytes(32)`、base64url 43文字）。DB には SHA-256 のみ。生トークンは発行画面に一度だけ表示。
- URL は `Referrer-Policy: no-referrer`／`Cache-Control: no-store`。ログイン中は 15 分の HttpOnly・SameSite=Lax Cookie（path=/invite）に退避し、受諾後に削除。
- 単回使用（行ロック＋条件付き更新）、期限（初期72時間・1〜168時間）、取消、再発行（旧トークン即無効）。
- 総当たり：同一アカウントで1時間に10回失敗すると受諾を拒否。

## HTTP セキュリティヘッダー
CSP（default-src 'self'、frame-ancestors 'none'、connect-src は Supabase のみ）、HSTS、X-Frame-Options DENY、nosniff、Referrer-Policy、Permissions-Policy、COOP。管理画面・API は no-store。

## 既知の制約・残存リスク
| 項目 | 内容 | 対応 |
|---|---|---|
| 発行済みアクセストークン | 停止後も JWT 自体は期限（Supabase 既定 1 時間）まで有効だが、DB が毎回拒否するため利用不可 | JWT 有効期限の短縮を検討（Supabase Auth 設定） |
| CSP の 'unsafe-inline' | Next.js のインラインスクリプトのため許可。XSS 入力経路は React のエスケープで防御 | nonce 方式への移行を TODO |
| ローカル検証 | Supabase 本体（Auth/PostgREST/Storage）ではなく互換シムで検証。`auth.uid()` 等の挙動は同一実装 | 開発プロジェクトで AT を再実施（TEST_PLAN の手動項目） |
| 公開リポジトリ | 現在のリポジトリは public（秘密情報は含まない） | 専用 private リポジトリへ移設（R-04） |
| 監査ログの保持 | 無期限（削除不可）。個人情報保護との兼ね合い | 保持期間の決定（Q-05） |

## 秘密情報の取り扱い
- Git に含めない：`.env*`（`.env.example` は名前のみ）、DB 接続文字列、Supabase secret/service_role キー、Google OAuth クライアントシークレット。
- Google OAuth のクライアントシークレットは Supabase ダッシュボード（Auth > Providers）にのみ登録し、アプリには置かない。
- 初期 Super Admin のトークンは SQL Editor の画面でのみ扱う。

## インシデント時
`docs/OPERATIONS.md` の「インシデント対応」を参照（該当者の即時停止、キーのローテーション、監査ログ確認）。
