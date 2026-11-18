# OPERATIONS｜環境構築・管理者操作マニュアル・運用手順

## 1. 開発（STG）環境の構築 — 発注者承認後に実施

### 1-1. Supabase 開発プロジェクト
1. Supabase で新規プロジェクトを作成（例：`life-stage-core-dev`、リージョン Tokyo）。既存の `LIFE STAGE Apps` は使わない（既存データ保護）。
2. マイグレーション適用（いずれか）
   - Supabase CLI：`supabase link --project-ref <ref>` → `supabase db push`（`supabase/migrations` を番号順に適用）
   - SQL Editor：`supabase/migrations/*.sql` を番号順に貼り付けて実行
   - ※ `supabase/local/supabase_shim.sql` は**絶対に適用しない**（ローカル検証専用）
3. Authentication > Providers > Google を有効化（Google Cloud で OAuth クライアントを作成し、承認済みリダイレクトURIに `https://<ref>.supabase.co/auth/v1/callback` を登録。クライアントシークレットは Supabase にのみ登録）。
4. Authentication > URL Configuration：Site URL＝STG の URL、Redirect URLs に `https://<STG>/auth/callback` を追加。
5. Authentication > Multi-Factor：TOTP を有効化。
6. Authentication > Sign In / Providers：メール／パスワード等の他の方式は無効化（Google のみ）。
7. Settings > API Keys：publishable key を控える（secret key はアプリに設定しない）。
8. Advisors（Security / Performance）で警告がないことを確認。

### 1-2. Vercel
1. 新規プロジェクト（Root Directory＝`life-stage-core`、Framework＝Next.js、Install＝`pnpm install`）。
2. 環境変数：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`NEXT_PUBLIC_SITE_URL`（STG の https URL）。
3. Deployment Protection は試験運用中は有効のままでよい（招待リンクの受信者がアクセスできる設定にすること）。

### 1-3. 初期 Super Admin
1. SQL Editor で `supabase/bootstrap/create_first_super_admin.sql` のメールを書き換えて実行。
2. 返ってきた token で `https://<STG>/invite?token=<token>` を本人に送付（24時間有効）。
3. 本人が受諾 → `/admin/mfa` で認証アプリを登録。

## 2. 管理者操作マニュアル

ログイン後、右上「ADMIN」から管理画面へ。管理操作の前に二段階認証コードの入力を求められます。

| やりたいこと | 画面 | 操作 |
|---|---|---|
| 新しい利用者を招待 | INVITATIONS｜招待管理 | メールアドレスと許可するアプリを選び「招待リンクを発行」→表示されたリンクをコピーして**本人だけに**送付（リンクはこの時だけ表示） |
| 招待を取り消す | INVITATIONS | 対象行の「取消」 |
| 期限切れ・誤送信の再発行 | INVITATIONS | 「再発行」→新しいリンクを送付（旧リンクは無効） |
| アプリ権限の追加・取消 | PERMISSIONS｜権限管理 | 利用者×アプリのボタンを押す（即時反映） |
| 一時停止・再開 | USERS → 詳細 | 理由を入力して「一時停止」／「利用再開」（データは保持） |
| 役割（Admin/Mentor）の付与 | USERS → 詳細（Super Admin のみ） | 「admin を付与」等 |
| Admin の担当範囲 | ASSIGNMENTS（Super Admin のみ） | Admin と利用者を選んで追加 |
| メンター等の担当 | ASSIGNMENTS | 担当者・利用者・区分を選んで設定。解除すると共有も撤回 |
| 削除手続き | USERS → 詳細 | 申請（理由必須）→ Super Admin が対象メールを再入力して確定 |
| 操作の確認 | AUDIT LOGS｜操作履歴 | 種類・失敗のみで絞り込み |
| 連携の失敗確認 | TRANSFERS｜連携状況 | 失敗を絞り込み、エラー内容を確認（本人に再試行を案内） |
| 招待期限の変更 | SETTINGS（Super Admin のみ） | 1〜168時間 |

注意
- 管理画面には個人の人生設計などの本文は表示されません（設計上、管理者も閲覧できません）。
- 自分自身の停止・ロール変更はできません。最後の Super Admin は停止できません。

## 3. バックアップ・復旧
- Supabase 側：Pro 以上で日次自動バックアップ（PITR はオプション）。プランは発注者確認（Q-04）。
- 独自取得（週1回＋重要変更前）：
  ```bash
  SOURCE_DB_URL='postgresql://...' scripts/backup.sh backup
  SOURCE_DB_URL='postgresql://...' VERIFY_DB_URL='postgresql://<空の検証用DB>' scripts/backup.sh verify backups/lsc-<日時>.dump
  ```
  バックアップファイルは暗号化ストレージに保管し、保持期間（Q-05）経過後に削除。
- 復旧訓練：月1回、検証用プロジェクトへ復元し `verify` で件数一致を確認。結果を記録。
- 本番障害時：新しいプロジェクト／DBへ復元→接続先を切り替え（既存DBへの上書き復元はしない）。

## 4. 削除の運用（暫定・Q-05 確定まで）
1. 削除手続き確定で利用者は遮断（status=deletion_pending）。
2. 保持期間経過後、Super Admin 立ち会いのもと SQL Editor で対象利用者の auth.users を削除（profiles 以下は cascade）。監査ログは保持。
3. バックアップ内のデータは保持期間満了で自然消滅することを本人に説明。

## 5. インシデント対応
| 事象 | 初動 |
|---|---|
| 端末紛失・アカウント乗っ取り疑い | 該当者を即時「一時停止」（既存セッションも遮断）。管理者なら Super Admin がロール剥奪 |
| 管理者の誤操作 | AUDIT LOGS で before/after を確認し、権限・状態を戻す |
| 秘密情報漏えい | Supabase のキーをローテーション（API Keys）、Google OAuth シークレット再発行、Vercel 環境変数更新 |
| 招待リンクの誤送付 | INVITATIONS で取消（受諾済みなら該当者を停止→確認） |
| 重大な脆弱性の発見 | Vercel デプロイを停止（Deployment Protection／Pause）してから調査 |

## 6. ローカル開発
```bash
pnpm install
pnpm db:local:start   # 127.0.0.1:54329 に PostgreSQL（互換シム＋マイグレーション）
pnpm test
pnpm dev              # Supabase 接続先がない場合はトップに設定未了の案内を表示
```
