#!/bin/sh
# Dumps the database state of a running stack into a directory, in a form that can be diffed between two boots.
# usage: tools/dump-state.sh <output-dir>
# Files: schema.txt, rowcounts.txt, migrations.txt, data.txt (all deterministic for an identical state).
# pg_dump writes random "\restrict"/"\unrestrict" nonce lines (PostgreSQL 18); they are stripped so equal states compare equal.
# data.txt leaves out django_migrations because that table holds the time each migration was applied.
set -eu
out="${1:?usage: tools/dump-state.sh <output-dir>}"
# Make a relative output directory absolute before the cd below, so it means what the caller typed (relative to their cwd), not the repo root.
case "$out" in /*|[A-Za-z]:*) ;; *) out="$PWD/$out" ;; esac
here=$(cd "$(dirname "$0")" && pwd)
. "$here/project-guard.sh"
cd "$here/.."
require_project || exit 1
mkdir -p "$out"

psql() { docker compose -p "$PROJECT" exec -T db psql -U postgres -d postgres -At -F ' ' "$@"; }
dump() { docker compose -p "$PROJECT" exec -T db pg_dump -U postgres -d postgres "$@" | grep -v -E '^\\(un)?restrict '; }

dump --schema-only > "$out/schema.txt"
dump --data-only --exclude-table=django_migrations > "$out/data.txt"
psql -c "SELECT format('%I.%I', table_schema, table_name),
                (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY 1" > "$out/rowcounts.txt"
psql -c "SELECT app || '.' || name FROM django_migrations ORDER BY app, name" > "$out/migrations.txt"
echo "state written to $out"
