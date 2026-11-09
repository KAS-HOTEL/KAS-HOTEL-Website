-- =============================================================================
-- KAS Database Invariant Validation
-- Source: 63-phase-4-validation.md, Phase 7.2 brief "DATABASE VALIDATION"
-- =============================================================================
-- 18 executable NEGATIVE tests: attempt the violation, assert the DATABASE
-- rejects it. A constraint that is never tested is a constraint that might not
-- exist.
--
-- All fixtures are clearly SYNTHETIC (TEST_*) and the entire script runs inside
-- a transaction that is ROLLED BACK. Nothing persists.
--
-- Run:  psql -h localhost -U kas_web_app -d kas_web_dev -f invariants.sql
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE test_result (
    id       int,
    name     text,
    expected text,
    outcome  text,
    detail   text
) ON COMMIT DROP;

-- Helper: assert that a statement is REJECTED with the expected SQLSTATE class.
CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
    p_id int, p_name text, p_sql text, p_expected_sqlstate text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_state text;
BEGIN
    BEGIN
        EXECUTE p_sql;
        INSERT INTO test_result VALUES
            (p_id, p_name, p_expected_sqlstate, 'FAIL', 'statement was ACCEPTED but must be rejected');
        RETURN;
    EXCEPTION WHEN OTHERS THEN
        v_state := SQLSTATE;
    END;

    IF v_state = p_expected_sqlstate THEN
        INSERT INTO test_result VALUES (p_id, p_name, p_expected_sqlstate, 'PASS', 'rejected: ' || v_state);
    ELSE
        INSERT INTO test_result VALUES (p_id, p_name, p_expected_sqlstate, 'FAIL',
            'rejected with ' || v_state || ' but expected ' || p_expected_sqlstate);
    END IF;
END;
$$;

-- Helper: assert a column does NOT exist (structural absence).
CREATE OR REPLACE FUNCTION pg_temp.assert_no_column(
    p_id int, p_name text, p_table text, p_columns text[]
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_found text;
BEGIN
    SELECT string_agg(column_name, ', ') INTO v_found
    FROM information_schema.columns
    WHERE table_schema = 'kas' AND table_name = p_table AND column_name = ANY(p_columns);

    IF v_found IS NULL THEN
        INSERT INTO test_result VALUES (p_id, p_name, 'absent', 'PASS', 'no forbidden column present');
    ELSE
        INSERT INTO test_result VALUES (p_id, p_name, 'absent', 'FAIL', 'FORBIDDEN COLUMN(S) PRESENT: ' || v_found);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- SYNTHETIC FIXTURES — clearly test-only, rolled back
-- ---------------------------------------------------------------------------
INSERT INTO partner (id, code, legal_name, display_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'test-partner', 'TEST_PARTNER', 'TEST_PARTNER');

INSERT INTO partner (id, code, legal_name, display_name)
VALUES ('22222222-2222-2222-2222-222222222222', 'test-partner-b', 'TEST_PARTNER_B', 'TEST_PARTNER_B');

INSERT INTO property (id, partner_id, slug, lifecycle_state)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'test-property', 'OPEN');

INSERT INTO room_type (id, property_id, slug, max_adults, max_children, max_occupancy, base_price_minor)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'test-room-type', 2, 1, 3, 1000000);

INSERT INTO room_type_inventory_day (room_type_id, date, total)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', DATE '2099-01-01', 5);

INSERT INTO app_user (id, email) VALUES
    ('cccccccc-0000-0000-0000-000000000001', 'test-agent@example.invalid');

INSERT INTO customer (id, email) VALUES
    ('dddddddd-0000-0000-0000-000000000001', 'test-guest@example.invalid');

-- =============================================================================
-- THE 18 INVARIANTS
-- =============================================================================

-- 1. Partner -> Property relationship
SELECT pg_temp.assert_rejects(1, 'Partner->Property FK integrity',
$sql$ INSERT INTO property (partner_id, slug)
      VALUES ('99999999-9999-9999-9999-999999999999', 'orphan-property') $sql$,
'23503');

-- 2. property.partner_id NOT NULL
SELECT pg_temp.assert_rejects(2, 'property.partner_id NOT NULL',
$sql$ INSERT INTO property (partner_id, slug) VALUES (NULL, 'null-partner-property') $sql$,
'23502');

-- 3. Property slug uniqueness (GLOBAL, not per-partner)
SELECT pg_temp.assert_rejects(3, 'property.slug globally unique across partners',
$sql$ INSERT INTO property (partner_id, slug)
      VALUES ('22222222-2222-2222-2222-222222222222', 'test-property') $sql$,
'23505');

-- 4. Reservation property ownership (FK integrity)
SELECT pg_temp.assert_rejects(4, 'reservation.property_id FK integrity',
$sql$ INSERT INTO reservation (reference, property_id, distribution_channel_id, channel_type,
                               lead_source, sales_status, check_in, check_out, adults)
      VALUES ('KAS-TEST-0004', '99999999-9999-9999-9999-999999999999',
              (SELECT id FROM distribution_channel WHERE code='DIRECT'),
              'DIRECT', 'WEBSITE', 'REQUESTED', DATE '2099-01-01', DATE '2099-01-03', 2) $sql$,
'23503');

-- 5. Direct/OTA channel invariant — OTA must not carry a lead source
SELECT pg_temp.assert_rejects(5, 'OTA reservation cannot carry a lead_source',
$sql$ INSERT INTO reservation (reference, property_id, distribution_channel_id, channel_type,
                               lead_source, ota_reference, check_in, check_out, adults)
      VALUES ('KAS-TEST-0005', 'aaaaaaaa-0000-0000-0000-000000000001',
              (SELECT id FROM distribution_channel WHERE code='AGODA'),
              'OTA', 'WEBSITE', 'OTA-REF-5', DATE '2099-01-01', DATE '2099-01-03', 2) $sql$,
'23514');

-- 6. OTA sales owner must be NULL
SELECT pg_temp.assert_rejects(6, 'OTA reservation cannot have a sales_owner',
$sql$ INSERT INTO reservation (reference, property_id, distribution_channel_id, channel_type,
                               sales_owner_id, ota_reference, check_in, check_out, adults)
      VALUES ('KAS-TEST-0006', 'aaaaaaaa-0000-0000-0000-000000000001',
              (SELECT id FROM distribution_channel WHERE code='BOOKING_COM'),
              'OTA', 'cccccccc-0000-0000-0000-000000000001', 'OTA-REF-6',
              DATE '2099-01-01', DATE '2099-01-03', 2) $sql$,
'23514');

-- 7. DIRECT requires a lead source
SELECT pg_temp.assert_rejects(7, 'DIRECT reservation requires a lead_source',
$sql$ INSERT INTO reservation (reference, property_id, distribution_channel_id, channel_type,
                               sales_status, check_in, check_out, adults)
      VALUES ('KAS-TEST-0007', 'aaaaaaaa-0000-0000-0000-000000000001',
              (SELECT id FROM distribution_channel WHERE code='DIRECT'),
              'DIRECT', 'REQUESTED', DATE '2099-01-01', DATE '2099-01-03', 2) $sql$,
'23514');

-- 8. Sales/stay status separation — OTA must not carry a sales_status
SELECT pg_temp.assert_rejects(8, 'OTA reservation cannot carry a sales_status',
$sql$ INSERT INTO reservation (reference, property_id, distribution_channel_id, channel_type,
                               sales_status, stay_status, ota_reference, check_in, check_out, adults)
      VALUES ('KAS-TEST-0008', 'aaaaaaaa-0000-0000-0000-000000000001',
              (SELECT id FROM distribution_channel WHERE code='CTRIP'),
              'OTA', 'WON', 'CONFIRMED', 'OTA-REF-8',
              DATE '2099-01-01', DATE '2099-01-03', 2) $sql$,
'23514');

-- 9. Sales Inquiry holds no inventory — STRUCTURAL absence of stay columns
SELECT pg_temp.assert_no_column(9, 'sales_inquiry has NO stay/quantity columns',
    'sales_inquiry',
    ARRAY['check_in','check_out','quantity','room_type_id','nights','room_quantity']);

-- 10. Hold expiration is mandatory
SELECT pg_temp.assert_rejects(10, 'inventory_hold.expires_at NOT NULL',
$sql$ INSERT INTO inventory_hold (hold_type, reservation_id, property_id, room_type_id,
                                  date, quantity, expires_at)
      VALUES ('REQUEST', NULL, 'aaaaaaaa-0000-0000-0000-000000000001',
              'bbbbbbbb-0000-0000-0000-000000000001', DATE '2099-01-01', 1, NULL) $sql$,
'23502');

-- 11. Invalid quantity rejected
SELECT pg_temp.assert_rejects(11, 'reservation_line.quantity must be >= 1',
$sql$ INSERT INTO reservation_line (reservation_id, room_type_id, quantity, room_type_name_snapshot)
      VALUES ('99999999-9999-9999-9999-999999999999',
              'bbbbbbbb-0000-0000-0000-000000000001', 0, 'TEST') $sql$,
'23514');

-- 12. Invalid date range rejected
SELECT pg_temp.assert_rejects(12, 'reservation check_out must be > check_in',
$sql$ INSERT INTO reservation (reference, property_id, distribution_channel_id, channel_type,
                               lead_source, sales_status, check_in, check_out, adults)
      VALUES ('KAS-TEST-0012', 'aaaaaaaa-0000-0000-0000-000000000001',
              (SELECT id FROM distribution_channel WHERE code='DIRECT'),
              'DIRECT', 'WEBSITE', 'REQUESTED', DATE '2099-01-03', DATE '2099-01-03', 2) $sql$,
'23514');

-- 13. Foreign key integrity (room_type -> property)
SELECT pg_temp.assert_rejects(13, 'room_type.property_id FK integrity',
$sql$ INSERT INTO room_type (property_id, slug, max_adults, max_occupancy)
      VALUES ('99999999-9999-9999-9999-999999999999', 'orphan-room', 2, 2) $sql$,
'23503');

-- 14. Media partner isolation — partner_id is mandatory
SELECT pg_temp.assert_rejects(14, 'media_asset.partner_id NOT NULL',
$sql$ INSERT INTO media_asset (partner_id, storage_key, mime_type, category)
      VALUES (NULL, 'test/key-14.jpg', 'image/jpeg', 'ROOM') $sql$,
'23502');

-- 15. RBAC scope integrity — PARTNER scope requires partner_id
SELECT pg_temp.assert_rejects(15, 'role_assignment PARTNER scope requires partner_id',
$sql$ INSERT INTO role_assignment (user_id, role, scope_kind, partner_id)
      VALUES ('cccccccc-0000-0000-0000-000000000001', 'ADMIN', 'PARTNER', NULL) $sql$,
'23514');

-- 16. INVENTORY — the oversell guarantee
SELECT pg_temp.assert_rejects(16, 'OVERSELL GUARANTEE: commitment beyond availability rejected',
$sql$ UPDATE room_type_inventory_day
      SET direct_committed = 6
      WHERE room_type_id = 'bbbbbbbb-0000-0000-0000-000000000001'
        AND date = DATE '2099-01-01' $sql$,
'23514');

-- 17. Rate constraints — negative price rejected
SELECT pg_temp.assert_rejects(17, 'rate_rule.price_minor must be >= 0',
$sql$ INSERT INTO rate_rule (scope, room_type_id, name, price_minor)
      VALUES ('ROOM_TYPE', 'bbbbbbbb-0000-0000-0000-000000000001', 'TEST_NEGATIVE', -1) $sql$,
'23514');

-- 18. Customer is PLATFORM-LEVEL — structurally not partner/property scoped
SELECT pg_temp.assert_no_column(18, 'customer has NO partner_id / property_id column',
    'customer', ARRAY['partner_id','property_id']);

-- =============================================================================
-- SUPPLEMENTARY — mechanisms the frozen architecture depends on
-- =============================================================================

-- 19. The WITHDRAWN constraint must NOT exist: recording fails OPEN.
DO $$
DECLARE v_count int;
BEGIN
    SELECT count(*) INTO v_count FROM pg_constraint
    WHERE pg_get_constraintdef(oid) ILIKE '%ota_reserved%';
    IF v_count = 0 THEN
        INSERT INTO test_result VALUES (19, 'WITHDRAWN ota_reserved<=ota_allotment absent', 'absent', 'PASS',
            'recording fails open, availability fails closed');
    ELSE
        INSERT INTO test_result VALUES (19, 'WITHDRAWN ota_reserved<=ota_allotment absent', 'absent', 'FAIL',
            'withdrawn constraint is present — OTA recording would be refused');
    END IF;
END $$;

-- 20. No generic booking.source / status column anywhere
DO $$
DECLARE v_found text;
BEGIN
    SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_found
    FROM information_schema.columns
    WHERE table_schema = 'kas'
      AND ((table_name = 'reservation' AND column_name IN ('source','status','booking_source'))
        OR column_name = 'booking_source');
    IF v_found IS NULL THEN
        INSERT INTO test_result VALUES (20, 'No generic source/status column on reservation', 'absent', 'PASS', 'three concepts remain separate');
    ELSE
        INSERT INTO test_result VALUES (20, 'No generic source/status column on reservation', 'absent', 'FAIL', 'FOUND: ' || v_found);
    END IF;
END $$;

-- 21. PhysicalRoom must not exist; no room-number column anywhere
DO $$
DECLARE v_found text;
BEGIN
    SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_found
    FROM information_schema.columns
    WHERE table_schema = 'kas'
      AND column_name IN ('room_number','floor','unit_id','physical_room_id');
    IF v_found IS NULL THEN
        INSERT INTO test_result VALUES (21, 'No room_number/floor/unit column exists', 'absent', 'PASS',
            'room numbers cannot leak because they do not exist');
    ELSE
        INSERT INTO test_result VALUES (21, 'No room_number/floor/unit column exists', 'absent', 'FAIL', 'FOUND: ' || v_found);
    END IF;
END $$;

-- 22. audit_log is append-only (trigger-enforced)
INSERT INTO audit_log (action, entity_type) VALUES ('TEST_ACTION', 'TEST');
SELECT pg_temp.assert_rejects(22, 'audit_log rejects UPDATE (append-only)',
$sql$ UPDATE audit_log SET action = 'TAMPERED' WHERE action = 'TEST_ACTION' $sql$,
'42501');
SELECT pg_temp.assert_rejects(23, 'audit_log rejects DELETE (append-only)',
$sql$ DELETE FROM audit_log WHERE action = 'TEST_ACTION' $sql$,
'42501');

-- 24. Hold XOR: cannot reference BOTH a reservation and an inquiry
SELECT pg_temp.assert_rejects(24, 'inventory_hold XOR reservation/inquiry reference',
$sql$ INSERT INTO inventory_hold (hold_type, reservation_id, inquiry_id, property_id,
                                  room_type_id, date, quantity, expires_at)
      VALUES ('ALTERNATIVE_OFFER', '99999999-9999-9999-9999-999999999999',
              '88888888-8888-8888-8888-888888888888',
              'aaaaaaaa-0000-0000-0000-000000000001',
              'bbbbbbbb-0000-0000-0000-000000000001', DATE '2099-01-01', 1,
              now() + interval '1 hour') $sql$,
'23514');

-- 25. One review per reservation (Verified Stay, structurally)
DO $$
DECLARE v_has boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'review'::regclass AND contype = 'u'
                     AND pg_get_constraintdef(oid) ILIKE '%reservation_id%') INTO v_has;
    INSERT INTO test_result VALUES (25, 'review UNIQUE(reservation_id) = Verified Stay', 'present',
        CASE WHEN v_has THEN 'PASS' ELSE 'FAIL' END,
        CASE WHEN v_has THEN 'one review per completed stay' ELSE 'MISSING' END);
END $$;

-- 26. Media: exactly one cover per owner
SELECT pg_temp.assert_rejects(26, 'media_link allows only ONE cover per owner',
$sql$ WITH a AS (
        INSERT INTO media_asset (partner_id, storage_key, mime_type, category)
        VALUES ('11111111-1111-1111-1111-111111111111','test/c1.jpg','image/jpeg','ROOM'),
               ('11111111-1111-1111-1111-111111111111','test/c2.jpg','image/jpeg','ROOM')
        RETURNING id)
      INSERT INTO media_link (media_asset_id, owner_type, owner_id, is_cover)
      SELECT id, 'PROPERTY', 'aaaaaaaa-0000-0000-0000-000000000001', true FROM a $sql$,
'23505');

-- ---------------------------------------------------------------------------
-- RESULTS
-- ---------------------------------------------------------------------------
\echo ''
\echo '=================== KAS DATABASE INVARIANT VALIDATION ==================='
SELECT id, outcome, name, detail FROM test_result ORDER BY id;

\echo ''
SELECT
    count(*)                                    AS total,
    count(*) FILTER (WHERE outcome = 'PASS')    AS passed,
    count(*) FILTER (WHERE outcome = 'FAIL')    AS failed
FROM test_result;

-- Fail the script loudly if anything failed.
DO $$
DECLARE v_failed int;
BEGIN
    SELECT count(*) INTO v_failed FROM test_result WHERE outcome = 'FAIL';
    IF v_failed > 0 THEN
        RAISE EXCEPTION 'INVARIANT VALIDATION FAILED: % test(s) did not pass', v_failed;
    END IF;
END $$;

-- Nothing persists.
ROLLBACK;
