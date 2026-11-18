# REQUIREMENTS｜要件と実装状況

優先順位：STEP 01 開発指示書 Ver.1.1（最新）＞ COMMON_CORE_SPEC v1.0 ＞ APP01 v7 ＞ APP02 v1 ＞ APP03 v1。

凡例：✅ 実装・自動テスト合格／🟡 実装済み・実環境（Supabase＋Google）未検証／⬜ 未実装／❓ 発注者確認待ち

## A｜共通認証
| 要件 | 状態 | 実装 |
|---|---|---|
| Google ログイン | 🟡 | `signInWithOAuth`（PKCE）＋`/auth/callback`。実 Google での動作は STG で確認 |
| 完全招待制 | ✅ | profile は受諾時のみ作成 |
| 招待メールと認証済みメールの照合 | ✅ | `accept_invitation` |
| 未招待ユーザーの拒否 | ✅ | RLS/RPC/画面 `/status` |
| ログアウト | 🟡 | `signOut` Server Action |
| セッション管理 | 🟡 | `proxy.ts`＋`getClaims()`、Cookie |
| 停止ユーザーの遮断 | ✅ | 全ポリシーで status 判定＋セッション失効 |

## B｜招待管理
| 要件 | 状態 |
|---|---|
| 管理者による招待発行・メール指定・リンク発行 | ✅ |
| 有効期限72時間（設定で1〜168） | ✅ |
| 取り消し・再発行 | ✅ |
| 招待履歴 | ✅（invitations＋audit_logs、画面のフィルタ） |
| 推測困難なトークン・ハッシュ保存 | ✅（256bit、SHA-256） |
| 招待メール自動送信 | ⬜❓（手動送付で運用。Q-03） |

## C｜アプリ別権限（APP01/02/03 個別）
✅ 付与・取消・独立性（APP01 で APP02/03 不可）・無効アプリ付与不可。

## D｜管理者権限
| 要件 | 状態 |
|---|---|
| Super Admin / Admin（担当範囲）/ Mentor（共有分のみ）/ User（本人のみ） | ✅ |
| 管理者が個人データを無条件に閲覧できない | ✅（app_snapshots 等に管理者ポリシーなし） |
| 重要操作の MFA | ✅（DB）／🟡（TOTP 画面は実環境未検証） |

## E｜利用者管理
一覧・新規招待・権限追加/取消・一時停止・再開・削除手続き・操作履歴：✅（DB）／画面 🟡（ログイン後の描画は STG で確認）

## F｜共通DB
必須9テーブル（profiles, invitations, admin_roles, app_entitlements, mentor_assignments, consent_records, data_transfers, data_shares, audit_logs）：✅。追加：apps, admin_user_scopes, invitation_apps, app_snapshots, transfer_inbox, deletion_requests, app_settings。APP固有テーブル：⬜（各APP開発時。テンプレートと API 契約は作成済み）

## G｜セキュリティ
RLS ✅／サーバー側認可 ✅／他人データ防止 ✅／権限昇格防止 ✅／停止遮断 ✅／秘密鍵非公開 ✅／非公開 Storage ✅（ポリシーはシムで検証）／監査ログ ✅／バックアップ・復旧手順 ✅（ローカル検証）＋ 🟡（STG 未実施）

## H｜管理者ダッシュボード
DASHBOARD / USERS / INVITATIONS / PERMISSIONS / ASSIGNMENTS / AUDIT LOGS / SETTINGS ＋ TRANSFERS：画面実装 🟡（ビルド成功・未ログイン挙動は確認済み。ログイン後の描画は STG で確認）。白・ネイビー・ゴールド、英日併記、iPad/PC 優先・スマホ対応（公開画面で横はみ出しなしを確認）。

## SPEC v1.0 追加要件
| 要件 | 状態 |
|---|---|
| M06 連携（APP01→02、APP02→03、冪等・再試行・本人確認・変更時再確認） | ✅（契約検証／モック。本番 APP 未接続） |
| 本人による共有・撤回 | ✅ |
| 本人データ出力 | ✅ |
| 削除の二段階確認・請求経路 | ✅（物理削除は運用手順） |
| 同意記録 | ✅ |
| 5名試験運用 | ⬜（STG 環境の承認待ち） |
