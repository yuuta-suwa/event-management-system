# v2.0 → v2.1 非破壊マイグレーション
- 対象：ユーザーの既存ローカルデータと旧JSONバックアップ。v2.0で既存の`lifeCompass`, `workshop`, `goals`, `events`, `evidence`等は**1件も変更しない**。
- `schemaVersion` を `2.1` に更新し、新規`lifeTime`を `{ "enabled":false, "displayMode":"reflection", "homeCard":"off", "visibility":"private", "birthDate":null, "birthYear":null, "planningHorizonAge":null, "optedInAt":null, "reflections":[], "reflectionToPlanLinks":[] }` で追加。
- インポートは元ファイルを解析→v2.0の妥当性確認→非破壊コピー→v2.1変換→v2.1の検証→トランザクション保存。途中失敗なら既存アプリデータは変更しない。
- v2.1からv2.1はそのまま復元。未知の未来バージョンは安全に拒否し、元ファイルはユーザーが保持できるようにする。
- 生年月日・仮の計画年齢を既存記録から勝手に推測しない。初期値は**無効**。
- **セキュリティ**：新しい記録は明示的にバックアップ対象。将来の外部共有・統合アダプタの既定対象から除外。人生の時間の質問・回答は他人へ公開しない。
- 注意：旧`build_machine_specs.py`はv2.0データを作る過去の生成器。v2.3の正規データ定義はこのフォルダ内のJSONであり、旧生成器を実行して上書きしないこと。
