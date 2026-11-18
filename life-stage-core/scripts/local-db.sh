#!/usr/bin/env bash
# ローカル検証用 PostgreSQL（Supabase互換シム＋マイグレーション）
#   start : クラスタ作成・起動、開発DB lsc_dev を作成してマイグレーション適用
#   stop  : 停止
#   reset : lsc_dev を作り直す
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGDATA="${LSC_PGDATA:-$ROOT/.local-pg}"
PORT="${LSC_PGPORT:-54329}"
DB="${LSC_DEV_DB:-lsc_dev}"

run_pg() {  # postgres はrootで起動できないため postgres ユーザーで実行
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}
psqlc() { psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres "$@"; }

apply_all() {
  local db="$1"
  psqlc -d "$db" -f "$ROOT/supabase/local/supabase_shim.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do psqlc -d "$db" -f "$f"; done
}

case "${1:-}" in
  start)
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      mkdir -p "$PGDATA"; [ "$(id -u)" = "0" ] && chown postgres:postgres "$PGDATA"
      run_pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
    fi
    if ! run_pg "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
      run_pg "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -o "-p $PORT -c listen_addresses=127.0.0.1" -w start >/dev/null
    fi
    if ! psqlc -d postgres -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1; then
      psqlc -d postgres -c "create database $DB"
      apply_all "$DB"
    fi
    echo "PostgreSQL ready: postgres://postgres@127.0.0.1:$PORT/$DB"
    ;;
  stop)
    run_pg "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop || true ;;
  reset)
    psqlc -d postgres -c "drop database if exists $DB with (force)"
    psqlc -d postgres -c "create database $DB"
    apply_all "$DB"
    echo "reset done" ;;
  apply)
    apply_all "${2:?db name}" ;;
  *) echo "usage: $0 {start|stop|reset|apply <db>}"; exit 1 ;;
esac
