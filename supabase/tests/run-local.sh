#!/usr/bin/env bash
# Valide les migrations + tests RLS sur un Postgres 15+ jetable (sans Docker).
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DATA="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
RUNAS=""; if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUNAS="runuser -u postgres --"; fi
trap '$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
$RUNAS "$PGBIN/initdb" -D "$DATA" -A trust -U postgres -E UTF8 --no-locale >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA" -l "$DATA/log" start >/dev/null || { cat "$DATA/log"; exit 1; }
PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
for t in supabase/tests/*_test.sql; do
  db="t_$(basename "$t" .sql)"
  echo "→ $t"
  "${PSQL[@]}" -c "create database $db" >/dev/null
  "${PSQL[@]}" -d "$db" -f supabase/tests/local_supabase_stub.sql
  for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d "$db" -f "$f"; done
  "${PSQL[@]}" -d "$db" -f "$t"
done
