# TODO｜未完了作業・依頼事項・確認事項

## 発注者への依頼（操作・承認が必要）
| ID | 内容 | 理由 |
|---|---|---|
| R-01 | ~~Supabase 開発プロジェクトの作成~~ | **完了**：`life-stage-common-core-dev`（東京・Free）を作成、migration 適用済み |
| R-02 | 休止中の Supabase「LIFE STAGE Apps」を**90日の復旧期限内に**一度だけ再開し、構成記録・バックアップ取得後に再休止してよいか | 期限後はワンクリック復旧不可。再開は外部状態の変更（データは変更しない） |
| R-03 | Vercel に共通基盤 STG 用プロジェクトを作成（専用リポジトリに接続） | 承認済み（試験運用環境）。リポジトリ作成待ち。本番公開は別途承認 |
| R-04 | 共通基盤を専用 private リポジトリへ移設 | 承認済み。**R-08 のリポジトリ作成待ち** |
| R-08 | GitHub に**空の private リポジトリ**を作成（推奨名：`yuuta-suwa/life-stage-common-core`、README 等は作らない）し、このセッションから push できるよう Claude GitHub App の対象に追加 | このセッションは新規リポジトリを作成できないため |
| R-05 | Google Cloud で OAuth クライアント作成（または作成者の指定） | 秘密情報の登録 |
| R-06 | 初期 Super Admin の Google アカウント（メール）の指定 | 初期管理者の作成 |
| R-07 | 試験運用のテスト利用者5名（Admin1・Mentor1・User2 ＋ Super Admin） | Phase 6 |

## 発注者確認事項（未決）
| ID | 内容 | 暫定対応 |
|---|---|---|
| Q-01 | Super Admin の担当者（人数） | 1名以上。最後の1名は停止不可 |
| Q-02 | Admin の管理範囲の単位（個人割当／組織・チーム単位／事業単位） | 個人割当（D-09） |
| Q-03 | 招待メール送信方式（手動送付 or Resend 等の送信サービス） | 手動送付（D-10） |
| Q-04 | Supabase プラン・バックアップ（日次/PITR）・費用上限 | 未定 |
| Q-05 | データ保持期間・削除期間・監査ログ保持期間・バックアップ残存期間 | 物理削除は手動（D-11） |
| Q-06 | APP02 LEGACY 権限付与者、APP03 認定審査者・事業管理者の権限を共通基盤で持つか | 未実装 |
| Q-07 | APP02 の6能力の英語コード名 | attraction/recruitment/education/development/operations/management（D-13） |
| Q-08 | 本番ドメイン、各APPのドメイン構成（SSO方式に影響） | 未定 |
| Q-09 | LIFE ACCOUNTING を試験運用・公開する時期 | 登録マスターに planned で登録済み。公開段階の変更は承認後 |
| Q-10 | APP02/APP03 PDF の表の正確な内容（テキスト抽出で一部崩れの可能性） | 抽出テキストで判断 |
| Q-11 | 利用期限（招待後のアカウント有効期限）の要否 | 未実装 |
| Q-12 | 既存 LIFE STAGE 2.0（localStorage 版・Supabase 版）利用者の移行方針 | 未着手 |
| Q-13 | ~~LIFE STAGE 3.0 と APP03 の関係~~ | **解決**：別アプリとして扱う（D-28） |
| Q-14 | LEI APP HUB（app-access-system の未マージブランチ）を将来、共通基盤を参照するポータルにするか | 対象外 |
| Q-15 | 既存 LIFE STAGE 2.0 利用者に新 APP02 へのデータ移行を提供するか | 未着手 |
| Q-16 | Supabase 組織のプラン（現在 Free。自動休止・バックアップなし）を試験運用前に Pro へ上げるか | 未定 |

## 開発 TODO（承認後・次フェーズ）
- [ ] STG に migration 適用、Advisors 確認、AT01〜AT20 手動テスト（TEST_PLAN）
- [ ] ログイン後の管理画面・MFA 画面の実機確認（iPad 横/縦、PC、スマホ）と UI 調整
- [ ] 5名試験運用と TRIAL_LOG の記録
- [ ] Storage の署名付きURL発行 API（各APPの画像共有実装時）
- [ ] CSP の nonce 化（'unsafe-inline' 削減）
- [ ] JWT 有効期限の短縮検討（Supabase Auth 設定）
- [ ] 招待メール送信（Q-03 確定後）
- [ ] 利用者一覧の CSV 出力（要否確認）
- [ ] Phase 7：各APP本体の段階接続（別途承認）
