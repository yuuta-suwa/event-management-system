# 11｜v2.4 行動設計・実行管理（executionPlanning）実装記録

人生の目的 → 目標 → 中間成果 → TODO → 優先順位（4象限）→ 07:00〜25:00の時間割 → 実行記録 → 現実の成果 → 振り返り、を一元管理する追加機能。既存v2.3（初回60分ワーク、Q01–Q18、A–Dルート、4タブ、Day7/14/30/60/90、LIFE CLOCK、成長4区分）は変更していない。

## 0. 仕様の出どころ
- 正本：ユーザーがチャットに貼り付けた「MetaEVO Shift v2.4 完全引継ぎ（1ファイル版）」（第1部 追加仕様、第2部 受け入れテスト N01〜N34、第3部 実装指示）。
- 指示にあった `proposals/MetaEVO_Shift_V2_4_Execution_Handoff/` フォルダ（`CLAUDE_CODE_START_PROMPT.md`、`spec/execution_planning_schema_v1.json`、`examples/real_estate_one_tossup.json`、`docs/ACCEPTANCE_TESTS_V2_4.md`）は作業環境に存在しなかった。
- そのため、データ構造は仕様本文7.1章と「追加のデータ整合性チェック12項目」から Zod スキーマ（`app/src/domain/planning.ts`）として定義した。具体例は仕様8章から `app/tests/fixtures/realEstate.ts` として作成した。原本のJSON Schemaが届いたら、差分を照合すること。

## 1. 既存v2.3との互換性照合表

| 仕様上の概念 | v2.3の実物（spec/DATA_SCHEMA.json v2.1 と実装） | v2.4での扱い | 衝突 |
|---|---|---|---|
| 人生の目的・価値観・ビジョン | `lifeCompass`（単一オブジェクト：desiredWayOfLiving / lifePrinciple / longTermPurpose / values / status） | `PlanNode.sourceAnchorId = "legacy:lifeCompass"` で参照のみ。表示時に解決し、回答は複製しない | なし |
| 既存の目標 | `goals[]`（id, title, status。retired は履歴） | `sourceAnchorId = "legacy:goal:<id>"`。見つからなければ「リンク切れ」と表示 | なし |
| SourceAnchor エンティティ | 該当なし | 保存しない（`LegacyBridge.getLifeAnchors / getExistingGoals` で導出） | 仕様のエンティティを「導出値」に変更 |
| 日モード | `dayPlans[].dayMode`（advance / prepare / recover）、日付キーは `localDate` | `LegacyBridge.getDayMode` で読むだけ | なし |
| 今日の最重要行動 | `dayPlans[].importantAction`（**文字列**。IDではない） | 正本は dayPlan のまま。追加プロパティ `primaryActionId` でTODOにリンク。行動名が変わるとリンクを自動解除 | DailyFocus を保存せず「投影」にした（二重の正本を作らないため） |
| DailyFocus | 該当なし | 保存しない。dayPlan＋primaryActionId から計算（同じ日に1つまで、を構造で保証） | 同上 |
| v2.3の開始・完了 | `events[]`（ACTION_STARTED / ACTION_COMPLETED 等） | リンク中のTODOには `executionEvents` にも追記。TODO側で開始・完了・中断すると dayPlan の状態と v2.3イベントも更新 | なし（片方向ずつ明示的に同期） |
| 振り返り | `events[kind=DAILY_REVIEW]` | payload に `executionSummary` を任意で追記（既存項目は変更しない） | なし |
| 成長4区分 | evidence（action / learning / outcome / alignment） | 変更しない。v2.4の現実成果は `outcomeRecords` に別保存し、「成長 > 目標と成果」に別表示 | なし |
| 保存先 | IndexedDB（Dexie version 1：kv, goals, experiments, dayPlans, events, evidence, reviews） | Dexie **version 2** でテーブルを追加：planNodes, scheduleBlocks, executionEvents, ifThenRules, outcomeRecords。既存テーブルは移動・変換しない | なし |
| バックアップ形式 | `schemaVersion: "2.1"` のJSON | `schemaVersion` は **2.1 のまま**、`featureVersion: "2.4"` と `executionPlanning` を追加（v2.1公式スキーマ上は追加プロパティとして許容、テストで検証済み） | 旧アプリ（v2.3）で読み込むと executionPlanning は無視される。v2.3アプリは公開されていないため実害なし。将来の公開版では schemaVersion 2.2 への引き上げを検討 |
| v2.0 / v2.3 バックアップ | 既存の非破壊マイグレーション | executionPlanning がなければ空の領域で初期化 | なし |

## 2. データ（executionPlanning v1）
- `PlanNode`：id, kind(goal/milestone/step/action), title, parentId（主要な親は1つ）, sourceAnchorId, relatedGoalIds, order, collapsed, archivedAt, provisional, doneCriteria, estimateMinutes, dependsOn, startCue, prep, dueDate, importance(1–5|null), urgency(1–5|null), triage, quadrantOrder, note, successCriteria, metric
- `ScheduleBlock`：planDate（JST計画日）, actionId, startMinute（420〜1499）, durationMinutes（終了≦1500）, state(placed/moved/cancelled), movedFromBlockId, movedToBlockId, moveReason, overlapConfirmed
- `ExecutionEvent`（追記型）：actionId, blockId, planDate, kind(started/partial/completed/interrupted/not_started/resumed/reopened), reason(external/internal/prep/condition/rest/other), criteriaMet, evidence, resumeAt, firstStep, occurredAt, **seq**（同じ時刻の記録の順序を確定する通し番号。実装時に追加）
- `IfThenRule`：condition(manual/free_time/cancelled/blocked/evening), label, maxMinutes, onlyImportant, originalPolicy, targetActionId
- `OutcomeRecord`：goalNodeId（TODOには付けられない）, date, metric, value, unit, qualitative, evidence

整合性チェック（`checkIntegrity`）：ID重複／親の存在と循環／アンカー参照（リンク切れは警告）／予定の行動の存在と kind=action／予定の範囲（start≧420、start<1500、start+duration≦1500）／実行記録と予定枠の行動の一致／成果の参照先は目標・中間成果／IF→THENの対象不在は警告。インポート時と追加マージ後に実行し、エラーなら保存しない。

## 3. 画面（既存4タブを維持）
| タブ | 入口 | 内容 |
|---|---|---|
| 今日 | 最重要行動カードの下「今日の計画」 | 時間割（`#/today/plan`）、優先順位（`#/today/priority`） |
| 人生の軸 | 「目標から行動へ」 | 目標ツリー（`#/compass/plan`）：スマホはリスト、PC（幅900px以上）はマインドマップ。詳細はPCで右ペイン |
| 成長 | 「目標と成果（v2.4）」 | TODOの完了数と現実の成果を別表示。成果は手動・根拠つきで記録 |
| 振り返り | 「実行計画を改善」 | 直近7日の記録率・予定実行率・延期・中断理由、延期が続くTODOへの改善候補 |

## 4. 計測定義の実装（FR-404）
- 有効予定枠＝その日の state=placed。記録率＝状態記録がある枠÷有効枠（未記録は「不明」で別表示）。予定実行率＝完了枠÷有効枠。延期率＝moved枠÷（有効枠＋moved枠）。分母0は「—（評価対象なし）」。
- 1タスク複数枠の完了はタスクとして1回。再オープン→再完了でも1回。
- 現実成果は `outcomeRecords` だけから集計し、TODO完了から自動生成しない。

## 5. 受け入れテスト結果（2026-11-10、Chromium・Playwright 1.63、Asia/Tokyo）

```
Existing v2.3 regression: PASS（E2E 28件 + ユニット87件。R01〜R05 を含む）
New v2.4 N01-N34（N04bを含む35項目）: 34 PASS / 0 FAIL / 1 NOT_RUN（N30の実機部分）
DB migration + rollback: PASS（Dexie v1→v2 の非破壊アップグレード、復元・マージ失敗時のロールバック）
JSON export/import idempotency: PASS（同じファイルの2回マージで追加0件・競合0件）
Offline: PASS（Chromiumのオフライン・エミュレーション）
Safari iOS: NOT_RUN（実機未実施）
Home-screen PWA: NOT_RUN（実機未実施）
iMac browser: NOT_RUN（Chromium 1280〜1440px のエミュレーションのみ PASS）
External data requests: NONE VERIFIED（Chromiumで主要フロー中の外部リクエスト0件）
```

| ID | 結果 | テスト |
|---|---|---|
| R01 ワーク・Q01–Q18・A–D | PASS | scenarios.spec G1〜G10、unit workshop |
| R02 日モード | PASS | G6、v24 N11 |
| R03 Day7/14/30/60/90 | PASS | reviews.spec D1〜D3、G1〜G3 |
| R04 LIFE CLOCK | PASS | lifeclock.spec H1〜H5 |
| R05 成長4区分 | PASS | G4、G8 |
| N01 目的リンク・複製なし | PASS | v24 N01、unit planningRepo |
| N02 目的なしで仮目標 | PASS | v24 N02 |
| N03 4段階以上・順序保持 | PASS | v24 N03 |
| N04 循環移動の拒否 | PASS | v24 N04/N31、unit |
| N04b マインドマップ（iMac幅） | PASS（エミュレーション） | v24 N04b |
| N05 アーカイブと復元 | PASS | v24 N05、unit |
| N06 下書き→計画可能 | PASS | 受け入れ条件テスト、unit |
| N07 ツリーと4象限で同一ID | PASS | v24 N07 |
| N08 重要4・緊急2→第2象限 | PASS | v24 N08、unit |
| N09 期日が近くても評価は変えない | PASS | v24 N08/N09、unit |
| N10 最重要行動の一致 | PASS | 受け入れ条件テスト、unit N10 |
| N11 回復モード | PASS | v24 N11 |
| N12 07:00〜07:15 | PASS | v24 N12/N13 |
| N13 24:30〜25:00（翌01:00、計画日11/10） | PASS | v24 N12/N13、unit |
| N14 25:00開始・25:01終了の拒否 | PASS | v24 N14、unit |
| N15 重複は本人確認 | PASS | v24 N15、unit |
| N16 開始→完了→再読み込み | PASS | v24 N16/N19 |
| N17 翌日へ延期（履歴保持） | PASS | v24 N17/N18、unit |
| N18 未記録を未着手と推定しない | PASS | v24 N17/N18 |
| N19 中断理由の別集計 | PASS | v24 N16/N19 |
| N20 IF→THENは提案のみ | PASS | v24 N20/N21、unit |
| N21 二重確定の防止 | PASS | v24 N20/N21、unit |
| N22 準備TODO完了で成果は増えない | PASS | v24 N22、unit |
| N23 成果の手動記録 | PASS | v24 N22/N23/N34 |
| N24 延期が続くTODOの改善候補 | PASS | v24 N24、unit |
| N25 オフラインで作成・完了・再起動 | PASS（エミュレーション） | v24 N25 |
| N26 バックアップに追加領域 | PASS | v24 N26/N27、unit |
| N27 2回マージで重複なし | PASS | v24 N26/N27、unit |
| N28 破損・不正JSONの拒否 | PASS | v24 N28/N29、unit |
| N29 v2.3バックアップの取り込み | PASS | v24 N28/N29、unit |
| N30 iPhone Safari / ホーム画面PWA / iMac | 一部（390px・1440pxのエミュレーションPASS、実機NOT_RUN） | v24 N30、v24shots |
| N31 ドラッグなしで移動・予定登録 | PASS | v24 N04/N31（タップ／キーボード）、配置はすべてメニュー操作で可能 |
| N32 外部送信なし | PASS | v24 N32 |
| N33 500ノード・200予定枠 | PASS | 実測：510ノード・200予定枠で復元 約0.6〜0.8秒、ツリー表示 33〜109ms、検索 23〜36ms、時間割 33〜49ms（Linux上のChromium・Pixel 7相当・vite preview。実機の値ではない） |
| N34 再オープン→再完了 | PASS | v24 N22/N23/N34、unit |

## 6. 設計と実装の差分
- DailyFocus と SourceAnchor は保存せず、既存データからの導出・投影とした（単一の正本）。
- `ExecutionEvent.seq` を追加（同じミリ秒の連続操作で順序が逆転する不具合をテストで発見して対処）。
- バックアップの `schemaVersion` は 2.1 を維持し、`featureVersion: "2.4"` を追加した。
- 復元前の「直前バックアップ」は端末内（IndexedDB）に1世代保存し、設定画面からファイルとして保存できる。
- 「追加マージ」では、v2.3の記録は同じIDなら端末側を残す。人生の軸・設定などの単一項目は端末側を維持する。
- IF→THEN：手動の状況記録 → 候補提示 → 本人が選んだときだけ予定に反映、を実装した。条件をルールとして保存し、次回ワンタップで呼び出せる。

## 7. 未実装（P1/P2）・残る制約
- P1：PCフリーボードでの完全自由配置と自動レイアウト、時間割上の既存予定のドラッグ移動（メニュー操作で代替可）、IF→THENの高度なルール編集UI（保存・呼び出しのみ実装）、見積時間の誤差分析、キーボードショートカット。
- P2（別判断）：外部AI、iMac–iPhone自動同期、カレンダー双方向連携、外部DB、チーム共有。
- iMacとiPhoneのデータは自動同期しない。移すときはJSONバックアップ→復元（全置換または追加マージ）。設定画面と目標ツリーに明記した。
- 実機（iPhone Safari、ホーム画面PWA、iMacのSafari／Chrome）の検証は未実施。
