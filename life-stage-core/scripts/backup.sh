#!/usr/bin/env bash
# =====================================================================
# LIFE STAGE COMMON CORE — 論理バックアップ取得と復元検証
#
#   backup  : 対象DBの public / private / auth(ユーザー) / storage(メタデータ) を
#             pg_dump（カスタム形式）で取得し、SHA-256 を記録する
#   verify  : 取得したバックアップを「検証用DB」へ復元し、主要テーブルの件数を比較する
#
# 接続文字列は環境変数で渡す（Git・コマンド履歴に残さないこと）
#   SOURCE_DB_URL : 取得元（Supabase: Settings > Database > Connection string / Session pooler）
#   VERIFY_DB_URL : 復元先（空の検証用DB。本番DBを指定しないこと）
#
# Supabase の自動日次バックアップ（Pro 以上）／PITR とは別に、
# 発注者管理の保管場所へ保存するための手順。詳細は docs/OPERATIONS.md。
# =====================================================================
set -euo pipefail
OUT_DIR="${OUT_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SCHEMAS=(--schema=public --schema=private --schema=auth --schema=storage)

case "${1:-}" in
  backup)
    : "${SOURCE_DB_URL:?SOURCE_DB_URL is required}"
    mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
    FILE="$OUT_DIR/lsc-$STAMP.dump"
    pg_dump --format=custom --no-owner --no-privileges "${SCHEMAS[@]}" --file "$FILE" "$SOURCE_DB_URL"
    sha256sum "$FILE" > "$FILE.sha256"
    chmod 600 "$FILE" "$FILE.sha256"
    echo "backup: $FILE"
    ;;
  verify)
    FILE="${2:?usage: backup.sh verify <dump file>}"
    : "${SOURCE_DB_URL:?SOURCE_DB_URL is required (for row count comparison)}"
    : "${VERIFY_DB_URL:?VERIFY_DB_URL is required}"
    if [ "$VERIFY_DB_URL" = "$SOURCE_DB_URL" ]; then echo "VERIFY_DB_URL must differ from SOURCE_DB_URL"; exit 1; fi
    sha256sum -c "$FILE.sha256"
    pg_restore --no-owner --no-privileges --exit-on-error --dbname "$VERIFY_DB_URL" "$FILE"
    Q="select string_agg(t || '=' || n, ' ' order by t) from (
         select 'profiles' t, count(*) n from public.profiles union all
         select 'app_entitlements', count(*) from public.app_entitlements union all
         select 'invitations', count(*) from public.invitations union all
         select 'audit_logs', count(*) from public.audit_logs union all
         select 'data_transfers', count(*) from public.data_transfers) x"
    SRC="$(psql -XAtq "$SOURCE_DB_URL" -c "$Q")"
    DST="$(psql -XAtq "$VERIFY_DB_URL" -c "$Q")"
    echo "source : $SRC"; echo "restore: $DST"
    # 取得後に本番側で増えた行がある場合は差分が出るため、取得直後に実行するか件数を目視確認する
    [ "$SRC" = "$DST" ] && echo "VERIFY OK" || { echo "VERIFY DIFF (確認してください)"; exit 2; }
    ;;
  *) echo "usage: $0 {backup|verify <file>}"; exit 1 ;;
esac
