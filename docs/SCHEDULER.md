# 通知・メールの定期実行

`/api/jobs/notifications` を数分おきに呼ぶと、(1) 前日・当日・開始前などの通知ジョブの作成と送信、(2) 未送信のメールの送信・再試行が行われる。**定期実行が無いと、前日・当日・開始前の自動通知は送られない。**

- 認証: `Authorization: Bearer <NOTIFICATION_JOB_SECRET>`（POST と GET の両方）。Vercel Cron は `Authorization: Bearer <CRON_SECRET>` を付けるので、`CRON_SECRET` も受け付ける。未認証は 401。
- 古い通知は送らない: 開催済みイベントの通知、予定から12時間以上遅れた時間依存の通知、開催日に入ったあとの「前日通知」は、送信時に取り消される。したがって、定期実行を後から有効にしても過去の通知が一斉に送られることはない。

## 選択肢の比較

| 方法 | 費用 | 間隔 | セキュリティ | 注意 |
|---|---|---|---|---|
| **GitHub Actions**（同梱: `.github/workflows/notification-cron.yml`） | 無料枠内 | 最短5分（混雑時に遅れる。同梱は10分おき） | Secrets に保管 | **既定ブランチのワークフローだけが定期実行される**。現在の既定ブランチは `production-release` なので、`main` を既定ブランチにするか、このファイルをそちらにも置く必要がある |
| Vercel Cron | Hobby は無料だが**1日1回まで**（それ以上の頻度の指定はデプロイ失敗）／Pro は1分おき可 | プラン次第 | `CRON_SECRET` | `vercel.json` の `crons` に `{"path":"/api/jobs/notifications","schedule":"*/5 * * * *"}`。**プラン確認前に追加しないこと**（Hobbyでデプロイが失敗する） |
| 外部のcronサービス（cron-job.org 等） | 無料枠あり | 1分〜 | ヘッダーにBearerを設定 | 外部サービスにURLとシークレットを預けることになる |

推奨: Vercel が Pro なら Vercel Cron。そうでなければ GitHub Actions（既定ブランチを `main` に変更）。

## GitHub Actions を有効にする手順

1. GitHub → Settings → Branches で、既定ブランチを `main` にする（`production-release` を使い続ける理由がなければ）。
2. Settings → Secrets and variables → Actions に次を登録する（値はチャットに貼らない）。
   - `APP_URL`: `https://event-management-system-gmpdcasp.vercel.app`
   - `NOTIFICATION_JOB_SECRET`: Vercel の同名の環境変数と同じ値
3. `.github/workflows/notification-cron.yml` を含むコミットを `main` に push する（push する認証情報に `workflow` 権限が必要）。
4. Actions タブで `notification-cron` を手動実行（Run workflow）し、`HTTP 200` が出ることを確認する。

## 動作確認

- `/line-status` の「期限を過ぎた未送信ジョブ」が増え続けていないこと。
- `/notifications` の履歴に、開催前日・開始前の通知が予定の時刻付近で送られていること。
- 手動で1回だけ実行する場合（本番に通知が飛ぶ可能性があるため、対象の PENDING ジョブを確認してから）:
  ```bash
  curl -sS -X POST -H "Authorization: Bearer $NOTIFICATION_JOB_SECRET" https://<本番URL>/api/jobs/notifications
  ```
