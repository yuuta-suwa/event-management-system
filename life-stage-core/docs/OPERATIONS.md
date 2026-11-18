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

## 7. 開発プロジェクトの現状（2026-11-18）

| 項目 | 状態 |
|---|---|
| Supabase プロジェクト | `life-stage-common-core-dev`（組織 LEI STYLE、**東京 ap-northeast-1、Free プラン**） |
| migration | `supabase/migrations` の9本を適用済み（`supabase/local/` のシムは未適用） |
| 実DB検証 | 権限の静的検査・ロールバック方式の受入シナリオとも合格（TEST_PLAN §4） |
| Auth 設定 | **未設定**（下記 7-1 をダッシュボードで実施。Google OAuth のクライアントシークレット登録を伴うため発注者側の操作） |
| Vercel | 未作成（専用 private リポジトリ作成後に接続） |
| 利用者データ | なし（検証データはすべてロールバック済み） |

### 7-1. ダッシュボードで行う残りの設定（発注者または指定担当者）
1. **Google Cloud Console** で OAuth クライアント（ウェブアプリ）を作成
   - 承認済みのリダイレクト URI：`https://<開発プロジェクトのURL>/auth/v1/callback`（Supabase の Authentication > Providers > Google 画面に表示される値）
   - 同意画面の公開範囲：試験運用中は「テスト」＋テストユーザー5名の追加でも可
2. Supabase **Authentication > Sign In / Providers**
   - Google：有効化し、クライアントID・シークレットを入力（シークレットはここにだけ保存。チャットやリポジトリに貼らない）
   - Email：**無効化**（パスワード／メールリンクでの新規登録を止める。有効のままでも招待受諾は Google 必須のため利用はできないが、不要な auth ユーザー作成を防ぐ）
3. **Authentication > URL Configuration**
   - Site URL：STG の URL（Vercel 作成後）
   - Redirect URLs：`https://<STG>/auth/callback`（ローカル確認用に `http://localhost:3000/auth/callback` も可）
4. **Authentication > Multi-Factor**：TOTP が有効であることを確認（既定で有効）
5. **Authentication > Sessions**（任意）：アクセストークン有効期限の短縮を検討（停止後の JWT 残存時間を短くする。DB 側では即時遮断済み）
6. 初期 Super Admin：SQL Editor で `supabase/bootstrap/create_first_super_admin.sql` を実行（メールを書き換える）

### 7-2. Free プランの注意点
- 7日間利用が少ないと**自動休止**する（休止中はログイン不可。ダッシュボードから再開）。試験運用中は毎日数回の利用があれば通常は休止しない。
- 自動バックアップがないため、試験運用中は週1回 `scripts/backup.sh` で手動取得する（DB パスワードが必要）。
- 有効なプロジェクトは組織あたり2件まで（現在はこの開発プロジェクトのみ有効）。

## 8. 運用費用（2026-11-18 時点の概算。正式な金額は各社の料金ページで要確認）

| 項目 | 試験運用（現在） | 本番運用（推奨・要承認） | 備考 |
|---|---|---|---|
| Supabase | **$0**（Free） | Pro **$25/月**（組織単位。$10 分のコンピュート枠込みで小規模1プロジェクトは追加費用なしの見込み） | Pro で自動休止なし・日次バックアップ（7日保持）。PITR は任意で＋約 $100/月〜。本番とSTGを分けると2プロジェクト目の計算資源（約 $10/月）が追加 |
| Vercel | 既存チーム GMPDCASP の契約内（プラン未確認） | 同左 | Hobby プランは商用利用不可。商用なら Pro（$20/利用者/月） |
| Google OAuth | $0 | $0 | 同意画面の審査は外部公開時のみ |
| 招待メール送信 | $0（手動送付） | 送信サービスを採用する場合は月数百通まで無料枠のある製品が多い | 方式は未決（Q-03） |
| ドメイン | なし（Vercel の URL） | 年 数千円 | 本番ドメインは未決（Q-08） |
| 有料 AI API | 使用しない | 使用しない | 指示どおり |
| **合計（目安）** | **$0/月** | **約 $25〜45/月**（Supabase Pro＋必要に応じSTG）＋ Vercel 契約分 | Pro への変更は別途承認（D-22） |
