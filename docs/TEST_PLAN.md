# 最終テスト計画

## 自動テスト対象

RBAC、担当範囲、QR署名・改ざん・世代、二重受付、未入金、入金遷移、譲渡、LINE署名・通知時刻、KPI、売上、CSV、レート制限を対象とする。

## 権限マトリクス

| 機能 | SUPER_ADMIN | EVENT_MANAGER | RECEPTION_STAFF | PARTICIPANT |
|---|---:|---:|---:|---:|
| 全イベント閲覧 | 可 | 担当のみ | 担当のみ | 不可 |
| イベント作成・編集 | 可 | 担当のみ | 不可 | 不可 |
| 参加者・入金・譲渡 | 可 | 担当のみ | 不可 | 不可 |
| 受付・当日参加 | 可 | 担当のみ | 担当のみ | 不可 |
| 分析 | 可 | 担当のみ | 不可 | 不可 |
| 売上金額 | 可 | 不可 | 不可 | 不可 |
| 受付CSV | 可 | 担当のみ | 担当のみ | 不可 |
| その他CSV | 可 | 担当のみ | 不可 | 不可 |

## 手動シナリオ

1. 申込→未入金→入金確認→電子チケット→QR受付を通しで実行する。
2. 同じQRの再読取で初回担当者と受付時刻が表示される。
3. 未入金QRで3つの選択肢を確認し、現地支払時だけ入金済み・受付済みにする。
4. 譲渡後に旧QRが拒否、新QRが成功し、支払状態が変わらない。
5. 別イベント・未担当イベントのQRを拒否する。
6. LINE未連携、APIエラー、正常送信の履歴を確認する。
7. 各ロールでURLを直接入力し、サーバー側でも拒否されることを確認する。
8. 360px幅、iPhone Safari、Android Chromeで申込・チケット・受付を確認する。

## 合格基準

Critical/Highの未解決不具合が0件、自動テストと本番ビルドが成功し、手動シナリオがステージングで全件合格していること。

## 6.0 のテスト（2026-11-06 追加）

実行: `npx vitest run`（DB不要の単体）。実DB統合テストは、使い捨てローカルDBを `TEST_DATABASE_URL`（localhostのみ有効）に指定したときだけ動く。ファイルは直列実行（Serializable の競合による揺らぎを避けるため）。

| 領域 | ファイル | 主な内容 |
|---|---|---|
| 受付 | `tests/integration/checkin.test.ts` | QR/受付コード/検索、二重受付（4並行）、権限、総当たりロック、同姓同名、譲渡で旧コード失効、未入金、25名連続の処理時間 |
| LINE | `tests/integration/line-link.test.ts` | ログイン連携、友だち未追加は通知不可、既存友だち、ブロック、二重連携、Webhook重複・署名 |
| メール | `tests/integration/email.test.ts` | 保有者への送信、未定のチケットは送らない、譲渡後の旧宛先スキップ、失効QR非添付、失敗・再試行・同時実行、再送上限 |
| 決裁権者・帳簿 | `tests/integration/approver-ledger.test.ts`、`tests/unit/approver-domain.test.ts` | 初回指定、通常交代、自己昇格禁止、緊急（2名承認）、帳簿・CSVの拒否（SUPER_ADMIN含む）、売上画面の除外 |
| 報告 | `tests/integration/reports.test.ts`、`tests/unit/reports-domain.test.ts` | 集計定義、権限、スナップショット固定、承認・差戻し・再提出、共有リンク、LINE文面、印刷本文 |
| 集金・店舗支払 | `tests/integration/remittance.test.ts` | 送金照合に加え、店舗支払の取消・訂正 |
| 通知・JST | `tests/unit/notification-schedule.test.ts`、`tests/unit/jst-render.test.ts` | 当日に前日通知を送らない回帰、全ページの日時が JST |

防御の確認: 主要な防御（二重受付・ロック・権限・自己昇格・緊急承認数・送信前の再確認・同時送信など）は、わざと壊すとテストが落ちることを確認済み。新しい防御を足したら同じ確認をする。
