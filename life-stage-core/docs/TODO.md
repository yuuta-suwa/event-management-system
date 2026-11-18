# TODO｜未完了作業・依頼事項・確認事項

## 発注者への依頼（操作・承認が必要）
| ID | 内容 | 理由 |
|---|---|---|
| R-01 | Supabase に共通基盤用の**開発プロジェクト**を作成してよいか（無料枠 or 有料。既存3プロジェクトは停止中） | 課金・外部アカウント操作のため承認が必要 |
| R-02 | 停止中の Supabase「LIFE STAGE Apps」を一時再開して既存データ・バックアップを調査してよいか | 既存データ保護。再開は外部状態の変更 |
| R-03 | Vercel に共通基盤 STG 用プロジェクトを作成してよいか（Root Directory=`life-stage-core`） | 外部アカウント操作 |
| R-04 | 共通基盤を専用の **private** リポジトリへ移設してよいか（現リポジトリは public） | 仕様は非公開リポジトリ |
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
| Q-09 | LIFE ACCOUNTING（人生経理）を APP04 として共通基盤に載せるか | 無効状態で登録のみ（D-08） |
| Q-10 | APP02/APP03 PDF の表の正確な内容（テキスト抽出で一部崩れの可能性） | 抽出テキストで判断 |
| Q-11 | 利用期限（招待後のアカウント有効期限）の要否 | 未実装 |
| Q-12 | 既存 LIFE STAGE 2.0（localStorage 版・Supabase 版）利用者の移行方針 | 未着手 |

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
