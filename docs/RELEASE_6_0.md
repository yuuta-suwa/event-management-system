# 6.0 本番反映の手順（承認後に実施）

> **この手順は承認を得てから実施する。** 反映前の状態: ローカルの `main` は `origin/main` より先行しており、未 push。本番DBへの 2 件のマイグレーションも未適用。
> 秘密情報（DB接続文字列・各種キー）はこの文書・チャットに書かない。

## 0. 変更の概要

| コミット | 内容 | マイグレーション |
|---|---|---|
| PHASE 5（d5ea291） | 送金・受領照合、店舗支払、預り金の相殺、古い通知のガード | `20261105100000_remittances_store_payments` |
| 6.0 一式 | 受付3方式、LINEログイン標準化、メール、決裁権者・帳簿、報告、店舗支払の取消/訂正、通知GET、JST表示 | `20261106100000_workstreams_6_0` |

どちらも**追加のみ**（テーブル・列・Enum値の追加）。既存データの削除・変更・DROP はない。`20261106100000` の内容: `Ticket.receptionCode` 等の列追加、`Checkin.verification`、`CheckinType`/`EventRole` への値追加、`EmailLog`・`ApproverChangeRequest`・`ApproverChangeApproval`・`EventReport`・`ReportShare` の新設、`StorePayment`/`EventExpense`/`Participant` への列追加。

## 1. 反映前の確認（ローカル。済み）

```bash
npx tsc --noEmit && npx eslint src tests && npx next build --webpack
TEST_DATABASE_URL=postgresql://test:test@localhost:54329/eventtest npx vitest run   # 使い捨てローカルDBのみ
```

## 2. 本番DBのバックアップ（必須）

Neon のコンソールで、反映前の時点のブランチ（または復元ポイント）を作成しておく。失敗時はそこへ戻す。

## 3. マイグレーション適用（コードより先）

```bash
DATABASE_URL="<本番URL>" npx prisma migrate status   # 保留中が上の2件だけであること
DATABASE_URL="<本番URL>" npx prisma migrate deploy
DATABASE_URL="<本番URL>" npx prisma migrate status   # up to date
```

旧コードは新しい列を使わないため、適用直後に旧コードが動いていても影響しない（後方互換）。

## 4. コードの反映

`git push origin main`（Vercel の Production Branch が `main` であることを確認してから）。ビルド約3〜4分。

## 5. 管理者の設定作業

1. **決裁権者の指定**: `/events/<イベントID>/approver` で、各イベントの決裁権者を指定する（SUPER_ADMINが申請→本人が承諾）。指定した瞬間から、そのイベントの収支は決裁権者以外に見えなくなる。決裁権者を決めるまでは従来どおり。
2. **LINEログイン**（標準導線）: [docs/LINE_HANDOVER.md](LINE_HANDOVER.md) の「LINEログインの設定」。未設定の間はコード方式のまま動く。
3. **メール**: [docs/EMAIL_SETUP.md](EMAIL_SETUP.md)。未設定の間は送信せず、履歴に「送信しない」と記録される。
4. **通知の定期実行**: [docs/SCHEDULER.md](SCHEDULER.md)。期限切れの未送信ジョブは、送信時のガードで取り消される（開催済み・12時間以上遅れた時間依存通知・当日の前日通知）。
5. Google スプレッドシート出力の環境変数（任意）。

## 6. 反映後の確認

1. `https://<本番URL>/api/jobs/notifications` に認証なしでアクセス → 401。
2. 管理者ログイン → `/checkin` で3つのタブが表示される。テスト参加者で、QR・受付コード・検索のそれぞれで受付できる（本番のテストデータを使う場合は、事前に承認を得る）。
3. マイページに受付コードとLINE連携の4段階表示が出る。
4. `/sales` で、決裁権者を指定したイベントが（SUPER_ADMINから）見えなくなる。決裁権者本人は `/ledger` で見える。
5. `/reports` で下書き→提出→（別ユーザーで）承認ができる。
6. イベント日時の表示が日本時間になっている。
7. 実機（iPhone Safari・Android Chrome）で受付速度を実測する → [docs/CHECKIN_PERFORMANCE.md](CHECKIN_PERFORMANCE.md)。

## 7. 戻し方

- コード: Vercel の Deployments から直前のデプロイへ Instant Rollback（新しいテーブル・列は使われなくなるだけで、旧コードに影響しない）。
- DB: 追加のみなので通常は戻さない。やむを得ない場合は手順2のバックアップから復元する（反映後に入ったデータは失われる）。
