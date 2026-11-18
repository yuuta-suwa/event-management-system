# PROGRESS｜進捗報告

## 2026-11-18｜Phase 0〜5（ローカル検証まで）

### 実装済み
- **Phase 0**：GitHub / Supabase / Vercel / 既存 LIFE STAGE 実装の読み取り調査（docs/ENVIRONMENT_AUDIT.md）。既存アプリ・データは無変更。
- **Phase 1**：共通DB 16テーブル、制約・インデックス、全テーブル RLS、判定関数、監査ログ不変性、非公開 Storage ポリシー（migration 7本）。
- **Phase 2**：Google OAuth（PKCE）、単回招待（256bit・ハッシュ保存・72時間・取消・再発行）、認証済みメール照合、行ロックによる原子的な受諾＋権限付与、総当たり対策。
- **Phase 3**：APP01/02/03 個別権限、Super Admin / Admin（担当範囲）/ Mentor / User、停止・再開・剥奪、ロール管理、MFA(aal2)必須、権限昇格防止、削除手続き（二段階）。
- **Phase 4**：管理画面8画面（DASHBOARD, USERS(+詳細), INVITATIONS, PERMISSIONS, ASSIGNMENTS, TRANSFERS, AUDIT LOGS, SETTINGS）＋ MFA 画面、利用者向け（ログイン、招待受諾、状態、アカウント、アプリ入口ゲート）。
- **連携 API（契約検証）**：APP01→02、APP02→03、冪等キー、再試行、本人確認、変更時再確認、60セル検証。
- **Phase 5**：自動テスト84件（実DB 48件＋単体 36件）全件合格、lint/型/ビルド成功、未認証スモークテスト合格。

### テスト結果
docs/TEST_PLAN.md 参照。84/84 合格。テスト中に共有の復活不具合を1件検出し修正（D-14）。

### 未実装・未検証
- Supabase 実環境・実 Google アカウントでの動作（STG 未作成のため）。
- ログイン後の管理画面・MFA 画面の実描画確認。
- Phase 6 の5名試験運用。
- 招待メール自動送信、APP固有テーブル、各APP本体接続（対象外または承認待ち）。

### 問題点
- 共通基盤が public リポジトリ内にある（秘密情報は含まないが、仕様は非公開）。
- Supabase ローカルスタックがネットワーク制限で起動できず、Auth/Storage は互換シムでの検証。

### 次の作業
1. R-01〜R-06 の承認・提供を受けて STG（Supabase＋Vercel）を構築。
2. STG で AT01〜AT20 の手動テスト、UI 実機確認・修正。
3. 5名試験運用（Phase 6）と証跡保存。

### 発注者確認事項
docs/TODO.md の R-01〜R-07、Q-01〜Q-12。

### 完成判定
**未完成**。完成条件のうち「Googleログインの正常動作」「管理画面から主要操作が完結（実環境）」「試験運用」が未検証。自動テストで検証可能な範囲（DB・API の権限制御）は全件合格。
