# TEST PLAN｜テスト計画と結果

## 実行方法
```bash
pnpm install
pnpm db:local:start     # ローカル PostgreSQL（Supabase互換シム＋全マイグレーション）
pnpm test               # unit（Supabaseモック）＋ db（実DB・RLS）
pnpm lint && pnpm typecheck && pnpm build
```

## 自動テスト結果（2026-11-18、ローカル PostgreSQL 16 ＋ Supabase 互換シム）

| 区分 | ファイル | 件数 | 結果 |
|---|---|---:|---|
| DB 招待・認証 | tests/db/invitations.test.ts | 14 | 合格 |
| DB 権限・停止・昇格・監査 | tests/db/access.test.ts | 20 | 合格 |
| DB 連携・共有・出力・削除 | tests/db/transfers.test.ts | 12 | 合格 |
| DB バックアップ復元 | tests/db/backup.test.ts | 2 | 合格 |
| Unit アクセス判定 | tests/unit/access-policy.test.ts | 9 | 合格 |
| Unit API 認可・CSRF | tests/unit/api-routes.test.ts | 9 | 合格 |
| Unit 共通ライブラリ | tests/unit/lib.test.ts | 14 | 合格 |
| Unit 連携契約 | tests/unit/transfer-contract.test.ts | 4 | 合格 |
| **合計** | | **84** | **全件合格** |

そのほか：ESLint 0件、TypeScript 0エラー、`next build` 成功、本番サーバーのスモークテスト（未認証で保護ページ→/login、保護API→401、セキュリティヘッダー付与）合格、既存イベント管理アプリの lint/tsc/テスト45件 合格（影響なし）。

テスト中に検出・修正した不具合：担当解除後に同じ担当者を再割当すると、解除前の共有が閲覧可能に戻る（DECISIONS D-14 で修正、回帰テスト追加）。

## 受入テスト AT01〜AT20 対応

「自動」はローカル実DBで合格済み。「手動（STG）」は Supabase 開発プロジェクト＋実 Google アカウントで試験運用時に実施する（**未実施**）。

| AT | 内容 | 自動テスト | 手動（STG） |
|---|---|---|---|
| AT01 | 未招待拒否 | invitations「AT01」4件、unit decide | 未招待 Google アカウントでログイン→/status「招待が確認できません」 |
| AT02 | 招待本人登録 | invitations「AT02」7件（照合・単回・同時5並列・ハッシュ保存・入力検証） | 招待リンク→Googleログイン→アプリ表示 |
| AT03 | 期限切れ拒否 | 「AT03」（期限切れ拒否→再発行→旧トークン無効→新トークン成功） | 期限1時間で発行し経過後に開く |
| AT04 | 取消拒否 | 「AT04」2件（取消・受諾済み再発行不可・履歴監査） | 取消後にリンクを開く |
| AT05 | APP別権限 | access「AT05/06」3件、unit | APP01のみ付与→/apps/APP02 が403 |
| AT06 | 直URL拒否 | unit api-routes（/api/apps/:code/access 403）、スモーク（/admin→/login） | 一般利用者で /admin, /apps/APP03 を直接入力 |
| AT07 | 他人データ拒否 | access「AT07」3件（全テーブル・管理者も個人データ不可・Storage） | 2アカウントで API を相互に叩く |
| AT08 | 停止後拒否 | access「AT08/09」（同一JWTで全拒否・セッション失効・再招待回避不可） | ログイン中に停止→次の操作で /status |
| AT09 | 再開 | 同上（データ保持のまま復帰） | 再開後に同じデータが見える |
| AT10 | 担当範囲外拒否 | access「AT10」（Admin の範囲外操作・一覧・他Admin招待） | Admin アカウントで範囲外利用者が一覧に出ない |
| AT11 | 権限昇格拒否 | access「AT11」5件（RPC・直接書込・メタデータ改ざん・自己変更・aal1・剥奪後・停止後） | 一般利用者で管理RPCを直接呼ぶ（ブラウザコンソール） |
| AT12 | APP01→02 | transfers「AT12」3件 | /api/snapshots→/api/transfers/app01-to-app02 |
| AT13 | APP02→03 | transfers「AT13」（60セル・70マス拒否・認定混入拒否） | 同上 |
| AT14 | 二重転送防止 | transfers「AT14」（4並列＋再送で1件） | 2回送信 |
| AT15 | 再試行時データ保持 | transfers「AT15」2件（失敗→付与→同ID再試行、元データ不変、更新時要再確認） | 転送先権限なし→付与→retry |
| AT16 | 本人共有・撤回 | transfers「AT16」2件（担当者のみ・撤回・担当解除・期限） | メンターアカウントで閲覧確認 |
| AT17 | 監査ログ | access「AT17」2件（記録内容・改ざん不可） | AUDIT LOGS 画面で確認 |
| AT18 | 本人出力 | transfers「AT18」 | /account からJSON出力 |
| AT19 | 削除方針 | transfers「AT19」2件（二段階・遮断・取消・Admin確定不可） | USERS 詳細から申請→確定 |
| AT20 | バックアップ復元 | backup「AT20」2件（pg_dump→pg_restore、全テーブル一致、RLS・不変性） | `scripts/backup.sh` で STG を取得→検証DBへ復元 |

## 試験運用（Phase 6）シナリオ：テスト利用者5名

| 役 | 人数 | アカウント |
|---|---|---|
| Super Admin | 1 | 発注者指定 |
| Admin | 1 | テスト用 |
| Mentor | 1 | テスト用 |
| User | 2 | テスト用（A：APP01のみ、B：APP01＋APP02） |

手順（各項目の結果・日時・実施者を TRIAL_LOG に記録）
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
13. `scripts/backup.sh backup`→`verify`（AT20）。

## 合格基準
AT01〜AT20 の自動・手動とも全件合格、Critical/High の権限不備 0 件。現時点では**自動テストのみ合格、手動（STG）は未実施**のため、完成条件は未達。
