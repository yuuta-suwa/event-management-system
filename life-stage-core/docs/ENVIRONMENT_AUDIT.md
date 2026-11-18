# ENVIRONMENT AUDIT｜Phase 0 環境調査（2026-11-18）

調査は**読み取りのみ**で実施した。既存アプリ・既存データ・外部サービス設定は一切変更していない。

## 1. 資料

| 資料 | 状態 | 備考 |
|---|---|---|
| COMMON_CORE_SPEC_v1.0.md | 読了 | 共通基盤の正本（設計案） |
| CLAUDE_CODE_DEVELOPMENT_INSTRUCTIONS_v1.0.md | 読了 | Phase 0〜6、AT01〜AT20 |
| STEP 01 開発指示書 Ver.1.1（チャット本文） | 読了 | **最新の発注者指示として優先** |
| APP01_Official_v7.pdf | 読了 | §10 APP02引継ぎ契約、§11 データモデル、§12 権限 |
| APP02_Official_v1.pdf | 読了（テキスト抽出） | §17 データ、§18 権限、§21 APP03引継ぎ、LEGACY資格は管理者設定 |
| APP03_Official_v1.pdf | 読了（テキスト抽出） | 7能力×10年＝70マス、認定審査、§12 管理者権限 |
| LIFE_ACCOUNTING 開発指示書／詳細仕様／デザイン指示書 Ver1.1 | 読了 | 説明なしで追加提供。**APP04以降の候補として扱い、本体は対象外**（DECISIONS D-08） |

APP02/APP03 の PDF はフォント未埋め込みのため画像表示では本文が見えず、テキスト抽出で読んだ。表の一部は崩れている可能性がある（未確認事項 U-10）。

## 2. GitHub

| リポジトリ | 内容 | 本件との関係 |
|---|---|---|
| `yuuta-suwa/event-management-system`（**public**） | イベント運営管理システム（Next.js 16 / Prisma / Auth.js）。APP01〜03 とは別アプリ | 本セッションで書き込み可能な唯一のリポジトリ。共通基盤は `life-stage-core/` に独立配置 |
| `yuuta-suwa/app-access-system`（public） | README のみ（Initial commit） | 共通アクセス基盤の予定地と推測。未使用 |
| `yuuta-suwa/ticket-AI` ブランチ `feature/life-stage-2` | LIFE STAGE 2.0（静的HTML＋Supabase、`ls_profiles`/`ls_work`、Magic Link/パスワード認証、ロール member/core/admin） | APP02 系の既存実装と推測。**ロールを profiles 列で持ち、新規登録トリガーで誰でも member 化**する方式 |
| `ticket-AI` ブランチ `claude/life-stage-3-gate0` | LIFE STAGE 3.0（Cloudflare D1/R2 構成） | APP03 の前身と推測（未確認） |
| `life-stage-2-0ALL/life-stage-2-0ALL.github.io` | LIFE STAGE 2.0 全メンバー版の配信物。**localStorage 保存・ログインなし** | 既存利用者データは各端末内にのみ存在する可能性 |

APP01（THE FINAL DISCOVERY）の実装リポジトリは見つからなかった（U-01）。

## 3. Supabase（組織：LEI STYLE）

| プロジェクト | 状態 | 備考 |
|---|---|---|
| LIFE STAGE Apps | **INACTIVE（一時停止）**／ap-south-1 | LIFE STAGE 2.0 の `config.js` が参照。`ls_*` テーブルと実データが存在する可能性。停止中のため中身は未確認 |
| office-visit-manager | INACTIVE | 無関係 |
| ai-company-os | INACTIVE | 無関係 |

- 既存プロジェクトの再開・変更は行っていない。
- 共通基盤用の**開発プロジェクトは未作成**（作成・課金は発注者承認事項。依頼事項 R-01）。
- 既存 `LIFE STAGE Apps` のバックアップ有無は未確認（停止中のため）。再開・調査は承認後に行う（R-02）。

## 4. Vercel（チーム：GMPDCASP）

| プロジェクト | 状態 | 備考 |
|---|---|---|
| event-management-system | 稼働 | 本リポジトリのルート（既存アプリ）を配備。`life-stage-core/` はビルド対象外に設定済み |
| life-stage-2 | デプロイなし（Vite 設定、SSO保護） | 未使用 |
| その他 12 件 | — | 無関係 |

共通基盤用の Vercel プロジェクトは未作成（R-03）。

## 5. ローカル検証環境

- Node.js 22.23 / pnpm 11.19 / PostgreSQL 16.15（ローカル）。
- Supabase CLI のローカルスタック（Docker）は、イメージ配信元がネットワークポリシーで遮断され起動不可。
- 代替として **PostgreSQL 16 ＋ Supabase Auth/Storage 互換シム**（`supabase/local/supabase_shim.sql`）で RLS・RPC を実DB検証している。`auth.uid()` は Supabase と同じく `request.jwt.claims` を読む実装。

## 6. 既存データのバックアップ確認

| 対象 | 確認結果 |
|---|---|
| event-management-system の本番DB | 本件では接続していない（既存アプリは対象外） |
| Supabase `LIFE STAGE Apps` | 停止中のため未確認 → R-02 |
| LIFE STAGE 2.0 全メンバー版 | 端末内 localStorage のみ。サーバー側にデータなし |

## 7. 未決事項・依頼事項

`docs/TODO.md` の「発注者確認事項」と `docs/DECISIONS.md` を参照。

> 公開リポジトリのため、プロジェクト ref 等の識別子は記載していない（ダッシュボードで確認）。
