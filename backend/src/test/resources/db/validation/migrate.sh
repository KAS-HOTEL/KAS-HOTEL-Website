#!/usr/bin/env bash
# =============================================================================
# KAS — Migration runner (Phase 7.2 interim)
# =============================================================================
# Applies db/migration in Flyway version order using psql, each file in a
# SINGLE TRANSACTION so a failure rolls back cleanly and never leaves the
# schema half-applied.
#
# INTERIM ONLY. From Phase 7.3, Flyway (via Spring Boot) owns migration
# execution and history. This script exists because Phase 7.2 must execute and
# validate the schema before any JDK/Maven toolchain is installed.
#
# Usage:
#   ./migrate.sh          apply all migrations
#   ./migrate.sh --reset  DROP SCHEMA kas CASCADE, recreate, then apply all
#
# --reset targets ONLY schema `kas` in database `kas_web_dev`. It never touches
# any other schema, database, or the legacy KAS objects.
# =============================================================================
set -uo pipefail

DB="kas_web_dev"
PSQL="psql -h localhost -U kas_web_app -d $DB -w -X -qtA"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../main/resources/db/migration" && pwd)"

# Hard guard: refuse to run against anything but the intended database.
actual=$($PSQL -c "SELECT current_database();" 2>/dev/null)
if [ "$actual" != "$DB" ]; then
  echo "REFUSING TO RUN: connected to '$actual', expected '$DB'"
  exit 1
fi

if [ "${1:-}" = "--reset" ]; then
  echo "=== RESET: DROP SCHEMA kas CASCADE (database: $DB only) ==="
  $PSQL -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS kas CASCADE; CREATE SCHEMA kas;" \
    || { echo "  RESET FAILED"; exit 1; }
  echo "  schema kas recreated, empty"
  echo
fi

echo "=== APPLYING MIGRATIONS from $DIR ==="
applied=0
# Versioned first, in numeric order; repeatable last.
for f in $(ls "$DIR"/V*.sql 2>/dev/null | sort -V) $(ls "$DIR"/R__*.sql 2>/dev/null | sort); do
  name=$(basename "$f")
  printf "  %-46s" "$name"
  if psql -h localhost -U kas_web_app -d "$DB" -w -X -q --single-transaction \
          -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/kas_mig_err; then
    echo "OK"
    applied=$((applied+1))
  else
    echo "FAILED"
    sed 's/^/      /' /tmp/kas_mig_err
    exit 1
  fi
done

echo
echo "=== RESULT ==="
echo "  migrations applied : $applied"
echo "  tables             : $($PSQL -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='kas' AND table_type='BASE TABLE';")"
echo "  views              : $($PSQL -c "SELECT count(*) FROM information_schema.views WHERE table_schema='kas';")"
echo "  enum types         : $($PSQL -c "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='kas' AND t.typtype='e';")"
echo "  constraints        : $($PSQL -c "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='kas';")"
echo "  indexes            : $($PSQL -c "SELECT count(*) FROM pg_indexes WHERE schemaname='kas';")"
echo "  functions          : $($PSQL -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='kas';")"
echo "  triggers           : $($PSQL -c "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kas' AND NOT t.tgisinternal;")"
