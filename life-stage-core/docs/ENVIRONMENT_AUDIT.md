# ENVIRONMENT AUDIT｜Phase 0 環境調査

| 版 | 日付 | 内容 |
|---|---|---|
| 1 | 2026-11-18 | 初回調査 |
| 2 | 2026-11-18 | 追加調査①〜⑤、A/B/C 3案比較、推奨案と実装方針 |

**調査は読み取りのみで実施した。** 既存DB（Supabase）の再開・変更、既存アプリ・既存リポジトリの変更・削除は行っていない。
公開リポジトリのため、プロジェクト ref・キー等の識別子は記載しない（各ダッシュボードで確認）。

---

## 0. 結論（要約）

| 項目 | 結論 |
|---|---|
| ① Supabase「LIFE STAGE Apps」 | **休止中（Free プラン）。DB に接続できず、テーブル・件数・RLS・認証設定の実物は未確認。** ソースから推定できる構成は `ls_profiles / ls_work / ls_ai_usage`（RLS あり）。本番アプリは 11/6 に切り離し済みで、現在どのアプリからも使われていない。再開しない限り中身は確認できない |
| ② app-access-system | main は README のみ。**未マージのブランチに「LEI APP HUB Ver.1.1」の実装あり**（Supabase＋Google OAuth＋RLS＋管理 RPC、品質は高い）。ただし「分類単位のリンクポータル」で、LIFE STAGE の要件（招待制・アプリ別権限・MFA・担当範囲・共有・連携）とはデータモデルが異なる。未デプロイ・データなし |
| ③ Vercel「life-stage-2」 | **GitHub 未接続・デプロイ0件・ドメインなし**の空プロジェクト。LIFE STAGE 2.0 の実配信は GitHub Pages |
| ④ APP01〜03 | APP01：実装なし。APP02：前身の LIFE STAGE 2.0 は**端末内保存（localStorage）**で、APP02 v1 仕様（サーバー保存必須・60セル）とは別物。APP03：実装なし（LIFE STAGE 3.0 は ChatGPT Sites＋D1 の別基盤）。**既存APPで共通基盤に「そのまま接続」できるものはない** |
| ⑤ アプリ登録マスター | 現行の `apps` を拡張し、状態・URL・アプリ固有ロール・連携経路・スキーマ版を**データで登録**する方式を設計（§6） |
| 推奨 | **案C（新規構築）＋既存資産の設計パターン選択的取り込み**。新規構築は前回作業で実装済み（自動テスト84件合格）のため、残工数が最も少ない |

---

## 1. 資料

| 資料 | 状態 | 備考 |
|---|---|---|
| COMMON_CORE_SPEC_v1.0.md | 読了 | 共通基盤の正本（設計案） |
| CLAUDE_CODE_DEVELOPMENT_INSTRUCTIONS_v1.0.md | 読了 | Phase 0〜6、AT01〜AT20 |
| STEP 01 開発指示書 Ver.1.1 | 読了 | 最新の発注者指示として優先 |
| APP01_Official_v7.pdf | 読了 | §10 APP02引継ぎ契約、§11 データモデル、§12 権限 |
| APP02_Official_v1.pdf（2026-11-12） | 読了（テキスト抽出） | §17「保存方式はサーバー上の永続化を必須」、§18 権限、§21 APP03引継ぎ |
| APP03_Official_v1.pdf（2026-11-13） | 読了（テキスト抽出） | 7能力×10年＝70マス、認定審査、§12 管理者権限 |
| LIFE_ACCOUNTING 3資料 Ver1.1 | 読了 | APP04以降の候補。本体は対象外 |

**資料間の矛盾（記録のみ・独断で解釈しない）**
- APP02 仕様 §01：「実践…成果認定は **LIFE STAGE 3.0 の APP03** が担当」
- APP03 仕様 §1：「**LIFE STAGE 3.0 は別の教育・実践プログラムであり、APP03 と混同しない**」
→ 既存の LIFE STAGE 3.0 実装（§5-3）を APP03 の前身とみなすかは発注者確認が必要（Q-13）。

---

## 2. ① Supabase「LIFE STAGE Apps」

### 2-1. 確認できた事実（管理 API・読み取りのみ）
| 項目 | 結果 |
|---|---|
| 組織 | LEI STYLE（**Free プラン**） |
| 状態 | **INACTIVE（休止）** |
| リージョン | ap-south-1（ムンバイ）※日本の利用者からは遠い |
| Postgres | 17 系 |
| 作成日 | 2026-11-05 |
| Edge Functions | 0件（`ls-ai` はソースのみで未デプロイ。旧資料の記載と一致） |
| マイグレーション履歴・テーブル一覧 | **取得不可**（休止中のため DB 接続がタイムアウト） |

### 2-2. ソースから推定される構成（ticket-AI `feature/life-stage-2` の `0001_life_stage.sql`）
**実DBに適用済みかは未確認。** セットアップ手順書（SETUP.md）では SQL Editor で手動適用する手順になっている。

| テーブル | 内容 | RLS |
|---|---|---|
| `ls_profiles` | user_id（auth.users）, email, display_name, **role（member/core/admin）** | 本人 or admin が参照、本人が表示名のみ更新 |
| `ls_work` | user_id × program（all/core）の JSON 1件、version | 本人のみ。core は role が core/admin の時だけ |
| `ls_ai_usage` | AI 利用回数（日別） | service_role 専用 |

- 新規 `auth.users` 作成時に**トリガーで誰でも member の profile を作成**する方式（招待制ではない）。
- 管理者は `ls_set_role(email, role)` で役割を付与。
- 認証設定（ソースから推定）：Magic Link（メールリンク）＋メール/パスワード（11/5 追加）。Google OAuth の利用形跡なし。Site URL は GitHub Pages。

### 2-3. 利用状況（ソースと引き継ぎ資料より）
- 2026-11-06：LIFE STAGE 2.0 の本番を**ログイン不要・端末内保存版へ切替**。旧ログイン版は GitHub Pages の `/legacy/` に退避。新アプリは Supabase に接続せず、キーも含まない。
- 旧利用者データは自動移行しない方針（旧版で JSON を書き出し → 新版で復元）。
- **現在このプロジェクトを使う稼働中アプリはない。** 休止は Free プランの自動休止（7日間低アクティビティ）と推定。

### 2-4. 休止状態と復旧条件（Supabase 公式ドキュメント）
| 項目 | 内容 |
|---|---|
| 休止の原因 | Free プランは7日間の利用が少ないと自動休止 |
| 復旧方法 | ダッシュボードで **Resume project**（データ・設定とも休止前の状態に戻る） |
| 復旧期限 | **休止から90日以内**。休止日は管理APIで取得できず未確認。11/6 の切替後に休止したと仮定すると**最短で 2027年2月上旬頃が期限**（要ダッシュボード確認） |
| 期限後 | ワンクリック復旧は不可。バックアップファイルと Storage オブジェクトをダウンロードし、新プロジェクト or ローカルへ復元 |
| Free の制約 | 有効なプロジェクトは組織あたり2件まで（現在3件すべて休止のため再開は可能）。自動日次バックアップなし。再開後も7日間低アクティビティで再休止 |
| 費用 | 再開自体は無料（Free の範囲内） |

### 2-5. 推奨（既存資産保護）
1. **共通基盤には使わない**（リージョンが遠い、招待制でない設計、Free の自動休止、既存データとの混在リスク）。
2. **90日期限が切れる前に、発注者承認のもとで一度だけ再開**し、テーブル一覧・件数・認証設定・RLS を記録して**論理バックアップを取得**した後、再び休止する（R-02）。旧ログイン版 `/legacy/` が残っているため、旧利用者がデータを書き出せる状態でもある。
3. 旧データの共通基盤への移行は、件数を確認してから判断する（Q-12）。

---

## 3. ② GitHub「app-access-system」

### 3-1. 実装状況
| ブランチ | 内容 |
|---|---|
| `main` | README（1行）のみ。2026-11-10 |
| `claude/fervent-feynman-o497xz`（**未マージ**） | **LEI APP HUB Ver.1.1** の実装一式（73ファイル、2026-11-10） |

LEI APP HUB は「Google ログイン後、利用者ごとに許可された**共通8分類＋SELF**だけを表示し、分類 → やりたいこと → アプリ起動を行う Web ポータル」。

| 項目 | 内容 |
|---|---|
| 構成 | React 18 ＋ Vite 8 の SPA、Supabase Auth（Google OAuth・PKCE）、PostgreSQL、Vercel 想定 |
| DB | 13テーブル：profiles(pending/active/suspended), categories, user_category_permissions, role_assignments(member/creator/admin), permission_presets, purposes, catalog_apps, app_purposes, personal_folders, personal_items, app_submissions, user_invitations, permission_audit_logs |
| 認可 | 全テーブル RLS、**列単位 GRANT**、anon 権限なし、JWT/metadata 不使用、管理 RPC 19本（SECURITY DEFINER）、追記専用監査ログ、`ALTER DEFAULT PRIVILEGES` で Supabase の自動公開を停止 |
| 招待 | `user_invitations`：Google ログイン時のトリガーで、**検証済みメールが一致すれば自動で active＋分類付与** |
| テスト | ローカル PostgreSQL 33件、Supabase ローカルスタック API 17件、Playwright E2E 13件（いずれも疑似環境で合格）。**実 Supabase・実 Google・Vercel は未実施** |
| 配備 | Supabase プロジェクト・Vercel プロジェクトとも**未作成**（Vercel に接続されたプロジェクトなしを確認）。**利用者データは存在しない** |

### 3-2. LIFE STAGE 共通基盤の要件との差
| 要件 | LEI APP HUB | 差 |
|---|---|---|
| 完全招待制 | 誰でもログインで pending の profile が作られる（承認制）。招待は自動 active 化 | 方式が異なる（承認制）。招待トークンなし＝メール一致のみ |
| 単回招待リンク・期限・取消・再発行 | 招待取消のみ。トークン・期限なし | 不足 |
| APP01/02/03 別権限 | **分類単位**（8分類）の閲覧許可 | データモデルが異なる |
| Super Admin / Admin（担当範囲）/ Mentor | admin / creator / member | 不足 |
| 管理者 MFA | なし | 不足 |
| 停止時のセッション失効 | DB 判定のみ（セッション失効は未実装） | 一部不足 |
| 本人共有・撤回、連携転送、本人出力、削除手続き | なし | 不足 |
| サーバー API（連携 API の受け口） | SPA のみ（サーバー層なし） | 不足 |

### 3-3. 再利用可能性
| 区分 | 判定 |
|---|---|
| **そのまま使う（案A）** | **不可**。製品目的（リンクポータル）と権限モデル（分類単位・承認制）が異なり、必須要件の過半が未実装 |
| **コードを改修して使う（案B）** | 可能だが、権限の中核テーブル（分類→アプリ）・招待方式・ロール体系の作り直しが必要で、実質的に中核の書き直し。LEI APP HUB という別製品の仕様も壊す |
| **設計パターンを取り込む** | **推奨**。共通基盤と同じ原則（DB が正本、列単位 GRANT、追記専用監査、metadata 不使用）で書かれており、次の点は共通基盤より優れているため取り込む価値がある：①`ALTER DEFAULT PRIVILEGES` による自動公開の停止、②Supabase 旧既定（自動 GRANT）を再現した DB でのテスト、③配布物の秘密鍵・ソースマップ検査、④Supabase CLI の `auto_expose_new_tables=false`、⑤権限変更時のクライアントキャッシュ破棄 |
| 将来 | LEI APP HUB は「アプリ一覧ポータル」として、共通基盤の利用者・権限を参照する**利用側**になれる（別途判断。今回の範囲外） |

---

## 4. ③ Vercel「life-stage-2」とリポジトリの接続

| 項目 | 結果 |
|---|---|
| プロジェクト | life-stage-2（Framework: Vite、作成 2026-11-03 頃） |
| Git 接続 | **なし**（プロジェクト情報に Git リンクがなく、ticket-AI・app-access-system を接続先とする Vercel プロジェクトも0件） |
| デプロイ | **0件**（latestDeployment なし、live=false） |
| ドメイン | なし |
| 保護 | Vercel Authentication（SSO 保護）有効 |
| 実際の LIFE STAGE 2.0 の配信 | GitHub Pages：`yuuta-suwa/ticket-AI`（`gh-pages`、統合版＋`/legacy/` 旧ログイン版）、`life-stage-2-0ALL/life-stage-2-0ALL.github.io`（全メンバー版） |

→ 作成されたまま使われていない空のプロジェクト。削除・変更は不要（そのまま残す）。共通基盤には使わない。

### 4-1. 追加の発見：event-management-system のプレビューデプロイ失敗
- 前回の push（ブランチ `claude/funny-carson-opnl4w`）で、既存アプリの Vercel プロジェクトが**プレビュー**デプロイを自動作成し、**ERROR** になった。**本番（production）は main の正常版のままで影響なし。**
- 原因：作業ブランチの分岐元が **main より56コミット古い**状態で、Vercel のビルドキャッシュ（main の新しい Prisma スキーマ）と古いコードが食い違い、既存アプリ側で型エラー。共通基盤のコードが原因ではない。
- 意味：共通基盤を既存アプリと**同じリポジトリに置くと、既存アプリのデプロイと干渉する**。また前回の本調査で記載した既存アプリの構成（初期版）は古く、現在の main は Neon DB・Vercel Blob 等を使う新しい構成。
- 対応方針：共通基盤を専用リポジトリへ移す（§8）。移すまでの間、作業ブランチへの push でプレビュー失敗が再発する（本番には影響しない）。

---

## 5. ④ APP01〜03 のデータ保存方式と接続に必要な改修範囲

### 5-1. 現状
| | 仕様上の保存方式 | 既存実装 | 認証 |
|---|---|---|---|
| APP01 THE FINAL DISCOVERY | 自動保存、確定スナップショット、画像は認可付きURL、TLS・保存時暗号化（§12） | **見つからない**（全リポジトリを確認） | — |
| APP02 SELF-REALIZATION ENGINE | **サーバー永続化必須**、自動保存、競合時の差分選択（§17） | 前身の LIFE STAGE 2.0：①旧版＝Supabase `ls_work`（JSON）、②**現行＝端末内 localStorage、ログインなし**。内容も「7ステージ＋コア90日」で、APP02 v1 の「6能力×10年＝60セル」とは別物 | 旧版：メールリンク／パスワード。現行：なし |
| APP03 MAKE IT REAL | 証拠・審査履歴・版固定ルール、権限分離（§13・§15） | **見つからない**。参考：LIFE STAGE 3.0（ChatGPT Sites ＋ D1(SQLite) ＋ R2、ChatGPT アカウントでサインイン、会員状態 pending/active/suspended/cancelled、admin ロールのみ）。APP03 仕様は「3.0 と混同しない」と明記（Q-13） | ChatGPT サインイン（Sites が付与するヘッダー） |

### 5-2. 共通基盤への接続に必要な改修範囲
| | 改修範囲 | 規模 |
|---|---|---|
| APP01 | 新規開発時に最初から共通基盤を前提に作る：同一 Supabase の Auth を利用、起動時に `check_app_access('APP01')`、固有テーブルは `DATABASE_SCHEMA.md` のテンプレート（`user_id`＋RLS＋`has_app_access`）、確定時に `confirm_snapshot`／転送 API | 既存改修なし（新規） |
| APP02 | 既存 LIFE STAGE 2.0 は**改修ではなく作り直し**が妥当（保存方式・機能範囲が仕様と異なる）。新 APP02 を共通基盤前提で開発。既存の端末内データは、本人が JSON を書き出し → 新 APP02 で取り込む移行ツールを用意（取り込み項目の対応表は要設計） | 既存改修なし。移行ツールのみ |
| APP03 | 新規開発時に共通基盤前提。LIFE STAGE 3.0 を前身とする場合は、**認証（ChatGPT→Google/Supabase）、DB（D1/SQLite→PostgreSQL＋RLS）、ストレージ（R2→Supabase Storage）の全面移植**が必要。D1 には RLS がないため、アプリ層の所有者チェックを RLS へ置き換える | 前身とする場合は大（Q-13） |
| 共通（全APP） | ①同一 Supabase プロジェクトの Auth を共有、②各APPのドメイン構成に応じた SSO（同一オリジン配下 or 各ドメインで再ログイン）、③アプリ固有ロール（APP02 LEGACY 資格、APP03 審査者・事業管理者）の登録先、④連携ペイロードの能力コード確定 | Q-06, Q-07, Q-08 |

**結論：今回の「APP01〜03 接続準備」は、既存アプリを改修せず、共通基盤側の受け口（アプリ登録・権限確認 API・連携契約・固有テーブルのテンプレート）を整えることに限定するのが妥当。**

---

## 6. ⑤ アプリ登録マスター方式の設計（将来アプリ対応）

### 6-1. 現状と課題
現行の `apps`（code, 名称, 説明, is_active, sort_order）で「アプリ別権限」は登録だけで追加可能。ただし次はコードに固定されている：①連携経路（APP01→02、APP02→03）、②スナップショット種別とスキーマ検証、③アプリ固有ロールの置き場所がない、④アプリの URL・リダイレクト先・公開段階を持たない。

### 6-2. 設計（追加マイグレーションで拡張。既存の列・データは変更しない）
```
apps（拡張）
  code PK, name_en, name_ja, description, sort_order
  lifecycle      planned | development | trial | active | retired   ← is_active を置換（互換ビュー/列を残す）
  base_url       各APPの公開URL（https のみ）
  allowed_redirect_origins text[]  招待・ログイン後に戻してよいオリジン
  data_classification  standard | sensitive（人生設計・家計など）
  requires_consent_version  利用開始時に必要な同意の版
  owner_label    管理責任者（表示用）
  launched_at, retired_at

app_role_definitions（新規）── アプリ固有ロールのマスター
  app_code FK, role_code（例：APP02 'legacy_eligible'、APP03 'reviewer' 'business_admin'）
  name_en, name_ja, description, grantable_by（super_admin | admin）
user_app_roles（新規）── 付与（監査・取消・担当範囲の判定は共通 RPC）
  user_id, app_code, role_code, scope jsonb（例：APP03 の事業ID）, granted_by, revoked_at

app_snapshot_types（新規）── 各APPが確定・送出するデータの登録
  app_code, snapshot_type, schema_version, json_schema jsonb, is_active
transfer_routes（新規）── 連携経路をデータで登録（コード固定を廃止）
  source_app, snapshot_type, target_app, schema_version, is_active, requires_consent_type
```
- 判定関数 `has_app_access(app)` は「lifecycle が trial/active、かつ entitlement が active」に変更（trial は試験運用者のみに付与）。
- `has_app_role(app, role, scope)` を追加し、各APPの RLS から呼べるようにする。
- スキーマ検証は `json_schema` を参照する汎用検証（PostgreSQL 側は必須キー・型の検証、詳細はAPI側で zod/JSON Schema）。
- 新アプリ追加手順：①`apps` に lifecycle=planned で登録（migration）→ ②発注者承認 → ③development/trial → ④active。**コード変更なしで権限付与・管理画面表示・入口ゲートが機能する。**

### 6-3. LIFE ACCOUNTING を当てはめた例（登録のみ・本体は対象外）
| 項目 | 値 |
|---|---|
| code / lifecycle | `LIFE_ACCOUNTING` / planned |
| data_classification | sensitive（収入・負債・資産） |
| 固有ロール候補 | 共有閲覧者（期限付きリンク）※仕様書 §09 |
| 連携候補 | APP01 の家計（未来家計簿）→ LIFE ACCOUNTING（承認後に transfer_routes へ追加） |
| 注意 | 仕様書が「第三者共有リンク」を要求しており、共通基盤の `data_shares`（担当者宛て）とは別に、期限・パスコード付き匿名リンクの共通部品が将来必要 |

---

## 7. 3案比較

### 7-1. 各案の定義
| 案 | 内容 | 土台 |
|---|---|---|
| A：既存の共通基盤を再利用 | 既存資産をそのまま共通基盤として使う | 候補は LEI APP HUB（未デプロイ）または LIFE STAGE Apps（`ls_profiles` の role 方式） |
| B：既存基盤を改修・拡張 | LEI APP HUB（または LIFE STAGE Apps）を LIFE STAGE 要件に合わせて改修 | 同上 |
| C：新規構築 | 共通基盤を専用に作る | **前回作業で `life-stage-core/` として実装済み**（Supabase migration 7本、RLS、RPC、管理画面8画面、自動テスト84件合格）。実環境は未構築 |

### 7-2. 評価
評価は ◎ 優 ／ ○ 良 ／ △ 課題あり ／ × 不適。工数は今回の範囲（共通基盤＋APP01〜03 接続準備、STG 構築と受入テストまで）の**残作業**の概算。

| 観点 | A：再利用 | B：改修・拡張 | C：新規構築（実装済みを継続） |
|---|---|---|---|
| **開発工数（残）** | △ 見かけは0hだが要件の過半が未実装で、そのままでは受入不可。不足分を補うと実質Bになる | △ **90〜140h**（権限モデルを分類→アプリへ作り直し、招待トークン・MFA・担当範囲・共有・連携・削除手続き、SPA にサーバー API 層を追加、テスト作り直し） | ◎ **35〜60h**（アプリ登録マスター拡張 10〜15h、LEI APP HUB からのパターン取り込み 5〜8h、専用リポジトリ移設 2〜4h、STG 構築・AT01〜20 手動・修正 15〜25h、試験運用支援 5〜8h） |
| **セキュリティ** | × 招待トークン・MFA・担当範囲がなく、要件 SEC01/07/13 を満たさない。LIFE STAGE Apps は「誰でも member 化」で招待制違反 | ○ 土台の品質は高いが、大規模改修で権限の穴が入りやすい（中核テーブルの置換） | ◎ 要件（SEC01〜15）に合わせて設計済み。DB 実テスト48件で拒否系を検証済み。残リスクは実環境での未検証 |
| **既存データへの影響** | △ LIFE STAGE Apps を使う場合、旧データと新データが混在し、旧ロール（core/admin）が新権限と衝突 | △ LEI APP HUB はデータなしで影響なし。LIFE STAGE Apps を改修する場合は旧データへの migration が必要（破壊的変更の危険） | ◎ **新しい Supabase プロジェクトで構築するため既存データに一切触れない**。旧データ移行は件数確認後に別途判断 |
| **運用費用** | ○ Free 内で動くが、自動休止のため試験運用に不向き | ○ 同左 | ○ 同左。いずれの案でも、試験運用以降は Supabase Pro（約 US$25/月〜。自動休止なし・日次バックアップあり。PITR は＋約 US$100/月〜で任意）を推奨。Vercel は既存チームの契約内（プラン未確認） |
| **将来の拡張性** | × リンクポータル前提で、アプリ固有ロール・連携の拡張余地が小さい | ○ 拡張は可能だが、LEI APP HUB という別製品と要件が絡み、両方の変更が互いに影響する | ◎ `apps` 登録だけで新アプリに権限付与可能。§6 の登録マスター拡張でロール・連携もデータ化できる |
| **製品の独立性** | — | △ LEI APP HUB の仕様（8分類ポータル）を壊すか、2製品を1つのコードで両立させる必要 | ◎ 独立。LEI APP HUB は後から共通基盤の「利用側」にできる |
| **総合** | **不適** | **可（非推奨）** | **推奨** |

### 7-3. 推奨案
**案C（新規構築・実装済みの `life-stage-core` を継続）に、既存資産の良い設計を選択的に取り込む。**

理由
1. 必須要件（招待制・アプリ別権限・MFA・担当範囲・停止遮断・共有・連携・削除）を満たす唯一の案で、すでに自動テストで検証済み。
2. 新しい Supabase プロジェクトで構築するため、**既存データ（LIFE STAGE Apps）に影響ゼロ**。
3. 残工数が最小（B の約半分以下）。
4. 既存の LEI APP HUB と LIFE STAGE 2.0/3.0 を壊さない。それぞれの良い設計（自動公開停止、列 GRANT、配布物検査、会員状態モデル）は取り込める。

---

## 8. 実装方針（承認後に実施。調査完了までは既存DB・既存アプリを変更しない）

### 8-1. 範囲
- 対象：共通基盤と、APP01〜03 の**接続準備**（受け口・契約・テンプレート）まで。
- 対象外：APP01〜03 本体、LIFE ACCOUNTING 本体、既存 LIFE STAGE 2.0/3.0・LEI APP HUB・イベント管理システムの改修、旧データの移行実施。
- APP04 以降は「登録マスターで追加できる」ことまでを保証（登録は lifecycle=planned）。

### 8-2. 手順
| 順 | 作業 | 既存への影響 | 承認 |
|---|---|---|---|
| 1 | 共通基盤を**専用の private リポジトリ**へ移設（履歴ごと）。移設後、event-management-system の作業ブランチは削除提案（既存アプリ側の除外設定3行も不要になる） | なし（既存アプリの main は無変更） | R-04 |
| 2 | LEI APP HUB からのパターン取り込み：`ALTER DEFAULT PRIVILEGES` で自動公開停止、旧既定の自動 GRANT を再現したテスト、配布物の秘密鍵検査、`supabase/config.toml`（`auto_expose_new_tables=false`） | なし | 不要 |
| 3 | アプリ登録マスター拡張（§6：lifecycle・URL・固有ロール・スナップショット種別・連携経路）。追加 migration のみ、既存列は互換維持 | なし | 不要 |
| 4 | 新しい Supabase 開発プロジェクトを**東京リージョン**に作成 → migration 適用 → Google OAuth・MFA 設定 | なし（新規） | R-01, R-05 |
| 5 | Vercel に共通基盤の STG プロジェクト（専用リポジトリに接続）を作成 | なし（新規） | R-03 |
| 6 | 初期 Super Admin 作成 → AT01〜AT20 手動テスト → 修正 | なし | R-06 |
| 7 | 5名試験運用 | なし | R-07 |
| 別途 | 「LIFE STAGE Apps」を90日期限内に一度だけ再開し、構成記録とバックアップ取得後に再休止 | 再開・休止のみ（データ変更なし） | R-02 |

### 8-3. 発注者確認が必要な事項（今回の調査で追加）
| ID | 内容 |
|---|---|
| Q-13 | 既存の LIFE STAGE 3.0（ChatGPT Sites）を APP03 の前身とみなすか（資料間で矛盾） |
| Q-14 | LEI APP HUB を、将来共通基盤の利用者・権限を参照するポータルにするか（今回は対象外） |
| Q-15 | 既存 LIFE STAGE 2.0 の利用者に、新 APP02 へのデータ移行を提供するか（現行は端末内保存のため本人操作が必要） |
| Q-16 | Supabase 組織のプラン（試験運用前に Pro へ上げるか） |

---

## 9. 付録：調査対象一覧（初回調査分を含む）

### GitHub
| リポジトリ | 内容 |
|---|---|
| `yuuta-suwa/event-management-system`（public） | イベント運営管理システム（別アプリ）。main は Neon DB・Vercel Blob 構成へ進んでいる。共通基盤は作業ブランチの `life-stage-core/` に一時配置 |
| `yuuta-suwa/app-access-system`（public） | main は README のみ。未マージブランチに LEI APP HUB Ver.1.1（§3） |
| `yuuta-suwa/ticket-AI` | `feature/life-stage-2`（Supabase 版 LIFE STAGE 2.0）、`feature/life-stage-2-no-login`（端末内保存版・現行）、`claude/life-stage-3-gate0`（LIFE STAGE 3.0、ChatGPT Sites）、`gh-pages`（配信） |
| `life-stage-2-0ALL/life-stage-2-0ALL.github.io`（public） | LIFE STAGE 2.0 全メンバー版の配信物（端末内保存） |

### Supabase（組織 LEI STYLE・Free）
| プロジェクト | 状態 | 備考 |
|---|---|---|
| LIFE STAGE Apps | 休止 | §2 |
| office-visit-manager | 休止 | 無関係 |
| ai-company-os | 休止 | 無関係 |

### Vercel（チーム GMPDCASP）
| プロジェクト | 状態 | 備考 |
|---|---|---|
| event-management-system | 稼働（本番正常） | 作業ブランチのプレビューは ERROR（§4-1） |
| life-stage-2 | 未接続・デプロイ0件 | §4 |
| その他12件 | — | 無関係 |

### ローカル検証環境
Node.js 22 / pnpm 11 / PostgreSQL 16。Supabase ローカルスタック（Docker）はイメージ配信元がネットワーク制限で取得できず使用不可。代替として Supabase 互換シムで実DB検証。
