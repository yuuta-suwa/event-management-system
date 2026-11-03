# LINE連携 引き継ぎ書

> 対象: LINE公式アカウント（Messaging API）と本システムの接続を、新しい担当者へ引き継ぐための手順。
> **トークン・シークレットの値はこの文書にも、チャットにも書かない。** Vercel の環境変数にだけ入れる。

## 1. 構成

| 要素 | 役割 | 設定場所 |
|---|---|---|
| LINE公式アカウント | 参加者に通知を送る窓口 | LINE Official Account Manager |
| Messaging API チャネル | 通知の送信（push）・友だち追加などの受信（Webhook） | LINE Developers |
| LINEログイン チャネル（任意） | マイページから「LINEログインで本人確認して連携」 | LINE Developers（**Messaging APIと同じプロバイダー配下**） |
| 本システム | Webhook受信 `/api/line/webhook`、連携 `/api/line/login/*`、診断 `/line-status` | Vercel 環境変数 |

環境変数（名前のみ）: `LINE_CHANNEL_ID` `LINE_CHANNEL_SECRET` `LINE_MESSAGING_ACCESS_TOKEN` `NEXT_PUBLIC_LINE_BASIC_ID`、任意で `LINE_LOGIN_CHANNEL_ID` `LINE_LOGIN_CHANNEL_SECRET`、通知の定期実行用に `NOTIFICATION_JOB_SECRET`。

## 2. 接続の手順（初回・復旧時）

1. **値を用意する（LINE Developers）**
   - Messaging API チャネル →「チャネル基本設定」: チャネルID、チャネルシークレット
   - 「Messaging API設定」: **チャネルアクセストークン（長期）** を発行
   - LINE Official Account Manager: ベーシックID（@の後ろ）
2. **Vercel の Environment Variables（Production）** に上の4つを入れ、再デプロイする。値は新担当者本人が入力する。
3. **本システムの診断を開く**: SUPER_ADMIN でログイン →「LINE通知」→「LINE接続の診断」（`/line-status`）。
   - 赤い項目を上から順に解消する。トークン無効・ベーシックID不一致・URL違い・Webhook未使用・送信上限を自動で判定する。
4. **Webhook URL**: 診断ページの「Webhook URLを自動設定」を押す（LINE APIで `https://<本番URL>/api/line/webhook` を設定）。
5. **LINE側の画面で行う設定（自動化できない）**
   - LINE Developers →「Messaging API設定」→ **「Webhookの利用」をオン**、「検証」で成功を確認
   - LINE Official Account Manager →「応答設定」→ **「応答メッセージ」をオフ**（アプリが自動で返信するため。あいさつメッセージは任意）
6. 診断ページの「Webhook接続テスト」で成功を確認する。
7. **実機確認（必須）**: 自分のLINEで公式アカウントを友だち追加 → 本システムでテスト申込 → マイページの「連携コード（8文字）」をトークに送信 → 「LINE連携が完了しました」と返信されれば成功。管理画面の「参加者」で「連携済」になる。

## 3. 引き継ぎ（所有権の移管）

1. **LINE Developers**: プロバイダーに新担当者を「管理者」として招待する（相手のLINEアカウント／ビジネスアカウントが必要）。チャネル（Messaging API／LINEログイン）の権限も付与されていることを確認。
   - **プロバイダーは変えない。** 変えるとLINEログインとMessaging APIのユーザーIDが一致せず、既存の連携が壊れる。
2. **LINE Official Account Manager**: 新担当者を管理者に追加し、旧担当者の権限を外す。
3. **トークンの再発行（旧担当者が値を知っているため）**:
   - 「チャネルアクセストークン（長期）」を再発行 → Vercel の `LINE_MESSAGING_ACCESS_TOKEN` を更新 → 再デプロイ → `/line-status` で有効を確認。再発行後は旧トークンで送信できなくなる。
   - チャネルシークレットを再発行した場合は `LINE_CHANNEL_SECRET` も更新（Webhookの署名検証に使う。更新前は全Webhookが401になり、友だち追加・連携コードが動かない）。
4. 管理アカウント（本システム側）: 新担当者のSUPER_ADMINを作成し、旧担当者は `status` を `SUSPENDED`。
5. 完了確認: 「2. 接続の手順」の 3〜7 を新担当者が自分で実施し、すべて通ること。

## 4. 運用上の注意

- **月間メッセージ数の上限**: 無料プランは少ない（診断ページに今月の使用数/上限が出る）。超えると送信が失敗する。
- **通知の定期実行**: `POST /api/jobs/notifications`（`Authorization: Bearer <NOTIFICATION_JOB_SECRET>`）を数分おきに呼ぶ仕組みが必要。**未設定だと前日・当日・開始前の自動通知は送られない**（診断ページの「期限を過ぎた未送信ジョブ」で検知できる）。開催済みイベントの古い通知を送らないガードは実装済み。
- 友だちをブロックされると通知できない（本システムは unfollow を検知して通知を止め、再追加で自動復帰する）。
- LINEに未連携の参加者への通知は失敗として記録される（正常動作）。マイページURLを管理者が個別に案内できる（参加者名簿の「マイページ」列）。

## 5. トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| 診断で「トークンが無効」 | 期限切れ／再発行済み。LINE Developersで再発行→Vercel更新→再デプロイ |
| 友だち追加しても返信がない | Webhook未使用・URL違い・応答メッセージがオン・`LINE_CHANNEL_SECRET`不一致。診断ページの該当項目を確認 |
| Webhook接続テストが401 | `LINE_CHANNEL_SECRET` が実際のチャネルと違う |
| 連携コードを送っても「見つかりません」 | コードの入力ミス（8文字、英数字）。マイページに表示の最新コードか確認 |
| 「すでに別のLINEアカウントと連携」 | 乗っ取り防止の仕様。マイページまたは管理画面で連携を解除してから再連携 |
| 通知が届かない | 参加者が未連携／ブロック／月間上限超過／定期実行が未設定。`/notifications` の履歴と `/line-status` を確認 |

## 6. 引き継ぎ完了チェックリスト

- [ ] 新担当者がLINE Developers／Official Account Managerの管理者になっている
- [ ] 旧担当者の権限を外した
- [ ] アクセストークン・チャネルシークレットを再発行し、Vercelを更新・再デプロイした
- [ ] `/line-status` の全項目が緑（任意項目を除く）
- [ ] 実機で「友だち追加 → 連携コード → 連携完了」が通った
- [ ] 通知の定期実行を設定した（または、手動実行の運用を決めた）
- [ ] この文書と `docs/HANDOVER.md` を新担当者が読んだ
