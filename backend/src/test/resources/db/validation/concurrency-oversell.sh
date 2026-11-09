#!/usr/bin/env bash
# =============================================================================
# KAS — Concurrency test: the last available room
# Source: 55-phase-4-inventory.md §7.1, 63-phase-4-validation.md §6
# =============================================================================
# N concurrent transactions each try to claim the LAST available room.
# Assert: EXACTLY ONE commits. The rest are rejected by the oversell CHECK.
#
# Doc 55 requires deterministic lock ordering (room_type_id, date) to prevent
# deadlock. This test exercises SELECT ... FOR UPDATE on a single row, which is
# the degenerate single-row case of that ordering.
#
# "Do not claim concurrency safety without an executable test." — this is it.
#
# Fixtures are synthetic (TEST_CONCURRENCY_*) and removed in teardown.
# =============================================================================
set -uo pipefail

PSQL="psql -h localhost -U kas_web_app -d kas_web_dev -w -X -qtA -v ON_ERROR_STOP=1"
N="${1:-8}"

RT='eeeeeeee-0000-0000-0000-00000000cccc'
PROP='eeeeeeee-0000-0000-0000-00000000bbbb'
PART='eeeeeeee-0000-0000-0000-00000000aaaa'
DAY='2099-12-31'

teardown() {
  $PSQL -c "
    DELETE FROM room_type_inventory_day WHERE room_type_id = '$RT';
    DELETE FROM room_type WHERE id = '$RT';
    DELETE FROM property  WHERE id = '$PROP';
    DELETE FROM partner   WHERE id = '$PART';
  " >/dev/null 2>&1
}
trap teardown EXIT

echo "=== SETUP: one room type, ONE room available on $DAY ==="
teardown
$PSQL -c "
  INSERT INTO partner (id, code, legal_name, display_name)
    VALUES ('$PART','test-concurrency','TEST_CONCURRENCY_PARTNER','TEST_CONCURRENCY_PARTNER');
  INSERT INTO property (id, partner_id, slug)
    VALUES ('$PROP','$PART','test-concurrency-property');
  INSERT INTO room_type (id, property_id, slug, max_adults, max_occupancy)
    VALUES ('$RT','$PROP','test-concurrency-room',2,2);
  INSERT INTO room_type_inventory_day (room_type_id, date, total)
    VALUES ('$RT','$DAY',1);
" >/dev/null || { echo "  SETUP FAILED"; exit 1; }

avail=$($PSQL -c "SELECT available_direct(i.*) FROM room_type_inventory_day i WHERE room_type_id='$RT' AND date='$DAY';")
echo "  available_direct = $avail  (expected 1)"
echo

echo "=== RUNNING $N CONCURRENT CLAIMS FOR THE LAST ROOM ==="
tmp=$(mktemp -d)
for i in $(seq 1 "$N"); do
  (
    $PSQL -c "
      BEGIN;
        SELECT 1 FROM room_type_inventory_day
          WHERE room_type_id='$RT' AND date='$DAY'
          ORDER BY room_type_id, date
          FOR UPDATE;
        SELECT pg_sleep(0.15);
        UPDATE room_type_inventory_day
          SET direct_committed = direct_committed + 1
          WHERE room_type_id='$RT' AND date='$DAY';
      COMMIT;
    " >/dev/null 2>"$tmp/err_$i"
    echo $? > "$tmp/rc_$i"
  ) &
done
wait

ok=0; rejected=0
for i in $(seq 1 "$N"); do
  rc=$(cat "$tmp/rc_$i" 2>/dev/null || echo 1)
  if [ "$rc" -eq 0 ]; then ok=$((ok+1)); else rejected=$((rejected+1)); fi
done

final=$($PSQL -c "SELECT direct_committed FROM room_type_inventory_day WHERE room_type_id='$RT' AND date='$DAY';")
after=$($PSQL -c "SELECT available_direct(i.*) FROM room_type_inventory_day i WHERE room_type_id='$RT' AND date='$DAY';")
deadlocks=$(grep -li "deadlock" "$tmp"/err_* 2>/dev/null | wc -l)

echo "  committed        : $ok"
echo "  rejected         : $rejected"
echo "  direct_committed : $final   (expected 1)"
echo "  available_direct : $after   (expected 0)"
echo "  deadlocks        : $deadlocks (expected 0)"
rm -rf "$tmp"
echo

fail=0
[ "$ok" -eq 1 ]        || { echo "  FAIL: expected exactly 1 commit, got $ok"; fail=1; }
[ "$final" -eq 1 ]     || { echo "  FAIL: direct_committed = $final, expected 1"; fail=1; }
[ "$after" -eq 0 ]     || { echo "  FAIL: available_direct = $after, expected 0"; fail=1; }
[ "$deadlocks" -eq 0 ] || { echo "  FAIL: $deadlocks deadlock(s)"; fail=1; }

if [ "$fail" -eq 0 ]; then
  echo "  ===================================================="
  echo "  PASS — NO OVERSELL, NO DOUBLE ALLOCATION, NO DEADLOCK"
  echo "  ===================================================="
  exit 0
else
  echo "  *** CONCURRENCY TEST FAILED ***"
  exit 1
fi
