-- BUG-003 (audit 2026-11-12). V20 seeded SALES_FIRST_CONTACT_SLA with no value, and the
-- owner's decision (A6 / OQ-051, doc 117 §2: PT24H from requested_at) was only ever loaded
-- by hand. A database built from the migrations alone therefore refused every booking
-- request with 422 CONFIG_MISSING.
--
-- Only an empty value is filled: a database that already carries a value keeps it.
UPDATE system_setting
   SET value = 'PT24H',
       updated_at = clock_timestamp()
 WHERE key = 'SALES_FIRST_CONTACT_SLA'
   AND property_id IS NULL
   AND value IS NULL;
