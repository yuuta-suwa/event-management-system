# CLAUDE.md｜LIFE STAGE COMMON CORE 開発ルール

このファイルは `life-stage-core/` 配下で作業する AI エージェント・開発者向けの指示です。

## 前提
- Next.js は 16 系（Middleware ではなく `src/proxy.ts`、`params`/`searchParams`/`cookies()` は Promise）。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを確認する。
- Supabase は `@supabase/ssr`、publishable key、`getClaims()` を使う。最新の公式ドキュメントを確認してから実装を変える。
- 親ディレクトリ（イベント管理システム）は別アプリ。**変更しない**。

## 作業開始時に読む
`docs/PROGRESS.md` → `docs/TODO.md` → `docs/DECISIONS.md` → 変更対象に関係する docs。

## 必須ルール
1. 権限判定は DB の現在状態のみ。`user_metadata` / `app_metadata` を権限に使わない。
2. テーブル書き込みは SECURITY DEFINER RPC 経由のみ。RPC 冒頭で `private.require_admin()` / `private.require_active_user()` を呼び、`private.audit()` で記録する。
3. 新しいテーブルは必ず RLS 有効＋`revoke all ... from anon, authenticated`＋最小限の grant。ポリシーに `private.is_active_user()`（またはそれを含む関数）を入れる。
4. 管理者に利用者の個人データ（各APPの本文）を見せるポリシー・画面を作らない。
5. secret / service_role キーをアプリに持ち込まない。`.env*` をコミットしない。
6. 画面は各ページで `requirePage()`、API は `requireApi()`。レイアウトだけで守らない。状態変更 API は `checkMutationRequest()`。
7. migration は追加のみ（既存ファイルを書き換えない）。`supabase/local/supabase_shim.sql` は本番に適用しない。
8. 変更後は `pnpm lint && pnpm typecheck && pnpm test && pnpm build` を通す。権限に関わる変更は `tests/db` に「拒否されること」のテストを追加する。
9. 外部アカウント接続・課金・秘密鍵登録・本番公開・破壊的変更は発注者の承認を得る。
10. 完成の虚偽報告をしない。未検証の項目は未検証と書く。各 Phase 終了時に PROGRESS / TODO / DECISIONS / TEST_PLAN を更新する。

## UI
白・ネイビー（#13294b）・ゴールド（#b8975a）、見出しは英日併記（例：USERS｜利用者管理）、iPad/PC 優先・スマホで横はみ出しなし。エラーは `src/lib/errors.ts` の日英文言を使い、内部エラー文を表示しない。
