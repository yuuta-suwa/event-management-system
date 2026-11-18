# TEST PLAN｜テスト計画と結果

## 1. 実行方法
```bash
pnpm install
pnpm db:local:start     # ローカル PostgreSQL（Supabase 互換シム＋全マイグレーション）
pnpm test               # unit（Supabase モック）＋ db（実DB・RLS）
pnpm lint && pnpm typecheck && pnpm build && pnpm check:bundle
```
実 Supabase での検証：`supabase/verify/rollback_acceptance_check.sql` を SQL Editor で実行（全件ロールバック）。

## 2. 検証環境の区分
| 区分 | 内容 | 状態 |
|---|---|---|
| L1 ローカル実DB | PostgreSQL 16 ＋ Supabase Auth/Storage 互換シム。**Supabase 旧既定（public の新規テーブル・関数を anon/authenticated へ自動 GRANT）を再現**した上で migration を適用 | ✅ 実施 |
| L2 単体 | アクセス判定、API の認可・CSRF（Supabase モック）、連携契約、共通ライブラリ | ✅ 実施 |
| L3 実 Supabase（DB） | 開発プロジェクト（東京）に migration 9本を適用。権限・RLS の静的検査＋主要シナリオを**1トランザクションで実行し全件ロールバック** | ✅ 実施 |
| L4 実 Supabase ＋ 実 Google ＋ Vercel（画面） | 招待リンク→Google ログイン→受諾、管理画面・MFA の実操作 | ❌ 未実施（Google OAuth 設定・Vercel STG・専用リポジトリ待ち） |
| L5 試験運用（5名） | TEST_PLAN §6 | ❌ 未実施（L4 の後） |

## 3. 自動テスト結果（2026-11-18）
| 区分 | ファイル | 件数 | 結果 |
|---|---|---:|---|
| DB 招待・認証 | tests/db/invitations.test.ts | 14 | 合格 |
| DB 権限・停止・昇格・監査 | tests/db/access.test.ts | 20 | 合格 |
| DB 連携・共有・出力・削除 | tests/db/transfers.test.ts | 12 | 合格 |
| DB アプリ登録マスター・既定権限 | tests/db/registry.test.ts | 13 | 合格 |
| DB バックアップ復元 | tests/db/backup.test.ts | 2 | 合格 |
| Unit アクセス判定 | tests/unit/access-policy.test.ts | 9 | 合格 |
| Unit API 認可・CSRF | tests/unit/api-routes.test.ts | 9 | 合格 |
| Unit 共通ライブラリ | tests/unit/lib.test.ts | 14 | 合格 |
| Unit 連携契約 | tests/unit/transfer-contract.test.ts | 4 | 合格 |
| **合計** | | **97** | **全件合格** |

そのほか：ESLint 0件、TypeScript 0エラー、`next build` 成功、`check:bundle`（配布物に秘密鍵・service_role・ソースマップなし）合格、未認証スモークテスト合格（保護ページ→/login、保護API→401、セキュリティヘッダー）、既存イベント管理アプリへの影響なし（lint/tsc/テスト45件）。

テスト中に検出・修正した不具合
1. 担当解除後に同じ担当者を再割当すると、解除前の共有が閲覧可能に戻る → 担当解除で共有を自動撤回（D-14）。
2. スキーマ単位の既定権限では関数の PUBLIC 実行権限が取り消せず、新規関数が匿名でも実行可能になる → 全体既定で取り消し（D-24）。

## 4. 実 Supabase（開発プロジェクト・東京）での検証結果
### 4-1. 静的検査（適用後）
| 項目 | 結果 |
|---|---|
| public テーブル数 / RLS 無効テーブル | 20 / **0** |
| anon のテーブル・シーケンス権限 | **0** |
| authenticated の INSERT/UPDATE/DELETE/TRUNCATE 権限 | **0**（profiles.display_name の列 UPDATE のみ） |
| anon が実行できる public/private 関数 | **0** |
| 初期 Super Admin 作成関数を authenticated が実行 | **不可** |
| Storage `user-files` | 非公開 |
| アプリ登録 | APP01〜03＝active、LIFE_ACCOUNTING＝planned |
| Supabase Security Advisors | ERROR 0件。WARN 1種（0029：SECURITY DEFINER 関数を authenticated が実行可能・29件）は設計上の意図として受容（D-29） |

### 4-2. ロールバック方式の受入シナリオ（実 auth スキーマ使用）
| 検証 | 結果 |
|---|---|
| 初期 Super Admin の受諾 | ACCEPTED |
| AT02 招待受諾 / 同じリンクの再使用 | ACCEPTED / INVITATION_USED |
| AT05 APP01 のみ付与 | APP01=true、APP02=false |
| AT11 user_metadata に `role=super_admin` を入れても | roles=[]（無視） |
| AT11 一般利用者の管理RPC / テーブル直接書き込み | FORBIDDEN / 42501（権限なし） |
| AT01 未招待の Google ユーザー | status=not_invited、見えるプロフィール0件、他人のリンクは使用不可 |
| AT07 他人のスナップショット / Super Admin による個人データ閲覧 | 0件 / 0件 |
| 管理操作の MFA（aal1） | MFA_REQUIRED |
| AT08 停止 | セッション0件に失効、status=suspended、APP01=false、見えるデータ0件 |
| AT09 再開 | APP01=true、データ保持（1件） |
| AT17 監査ログの改ざん | AUDIT_LOG_IMMUTABLE |
| 実行後の残存データ | auth.users=0、profiles=0、invitations=0、audit_logs=0 |

## 5. 受入テスト AT01〜AT20 の状況
「自動」＝L1/L2 で合格、「実DB」＝L3 で合格、「画面（STG）」＝L4 で実施予定。

| AT | 内容 | 自動 | 実DB | 画面（STG） |
|---|---|:-:|:-:|:-:|
| AT01 | 未招待拒否 | ✅ | ✅ | 未 |
| AT02 | 招待本人登録 | ✅ | ✅ | 未 |
| AT03 | 期限切れ拒否 | ✅ | — | 未 |
| AT04 | 取消拒否 | ✅ | — | 未 |
| AT05 | APP別権限 | ✅ | ✅ | 未 |
| AT06 | 直URL拒否 | ✅（API・スモーク） | — | 未 |
| AT07 | 他人データ拒否 | ✅ | ✅ | 未 |
| AT08 | 停止後拒否 | ✅ | ✅ | 未 |
| AT09 | 再開 | ✅ | ✅ | 未 |
| AT10 | 担当範囲外拒否 | ✅ | — | 未 |
| AT11 | 権限昇格拒否 | ✅ | ✅ | 未 |
| AT12 | APP01→02（契約検証・モック） | ✅ | — | 未 |
| AT13 | APP02→03（契約検証・モック） | ✅ | — | 未 |
| AT14 | 二重転送防止 | ✅ | — | 未 |
| AT15 | 再試行時データ保持 | ✅ | — | 未 |
| AT16 | 本人共有・撤回 | ✅ | — | 未 |
| AT17 | 監査ログ | ✅ | ✅ | 未 |
| AT18 | 本人出力 | ✅ | — | 未 |
| AT19 | 削除方針 | ✅ | — | 未 |
| AT20 | バックアップ復元 | ✅（ローカル） | — | 未（STG で backup.sh） |

**判定：自動テストは20件すべて合格。実環境の画面テスト（L4）と試験運用（L5）は未実施のため、受入は未完了。**

## 6. 試験運用（Phase 6）シナリオ：テスト利用者5名
| 役 | 人数 | アカウント |
|---|---|---|
| Super Admin | 1 | 発注者指定 |
| Admin | 1 | テスト用 |
| Mentor | 1 | テスト用 |
| User | 2 | テスト用（A：APP01のみ、B：APP01＋APP02） |

手順（各項目の結果・日時・実施者を記録）
1. Super Admin を bootstrap SQL で作成→受諾→MFA 登録。
2. Super Admin が Admin・Mentor をロール付き招待、User A/B を招待（A は Admin の担当範囲へ）。
3. 招待されていない Google アカウントでログイン→拒否（AT01）。User A のリンクを B のアカウントで開く→EMAIL_MISMATCH。
4. 各自受諾→自分のアプリだけ表示（AT02/05）。/apps/APP03 直入力→403（AT06）。
5. User B が `/api/snapshots` で APP01 スナップショット登録→APP02 へ転送→二重送信（AT12/14）。
6. User A：APP02 権限なしで転送→失敗→Admin が APP02 付与→再試行成功（AT15）。
7. Super Admin が Mentor を User B に担当設定→B が共有→Mentor が閲覧→撤回→閲覧不可（AT16）。
8. Admin が担当外の User B を操作できないこと（AT10）。
9. Admin が User A を停止→A のログイン中画面で次の操作が拒否→再開（AT08/09）。
10. User A のアプリ権限削除→即時 403。
11. User B が削除申請→Super Admin がメール再入力で確定→B は /status（AT19）→取消。
12. AUDIT LOGS で 2〜11 の全操作が記録されていることを確認（AT17）。User B のデータ出力（AT18）。
13. 期限1時間の招待を発行→期限後に開く（AT03）。招待を取消→開く（AT04）。
14. `scripts/backup.sh backup`→`verify`（AT20）。
15. iPad（横・縦）・PC・スマホで各画面の表示崩れがないこと。

## 7. 合格基準
AT01〜AT20 の自動・実DB・画面とも全件合格、Critical/High の権限不備 0 件、管理者操作マニュアルと引き継ぎ資料が完成していること。
