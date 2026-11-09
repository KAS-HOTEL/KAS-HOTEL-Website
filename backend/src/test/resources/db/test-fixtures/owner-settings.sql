-- Integration-test fixture for kas_web_test ONLY. Never run against kas_web_dev
-- or any other environment: business values arrive there through the owner,
-- not from source control (doc 99 §6).
--
-- Exactly the owner-answered keys DatabaseConnectivityIT.OWNER_ANSWERED_KEYS
-- lists, with the values the owner documents record; every other key stays NULL:
--   INVENTORY_HORIZON_MONTHS     = 24      (doc 99, Phase 7.5E-DECISION)
--   MAX_ROOMS_PER_REQUEST        = 5       (doc 99, closes OQ-015)
--   SALES_FIRST_CONTACT_SLA      = PT24H   (A6, doc 117 §2 row 1)
--   DIRECT_REQUEST_HOLD_DURATION = PT24H   (B2, doc 117 §2 row 2)
--   DEPOSIT_REQUIRED_TO_CONFIRM  = false   (B12 option A, doc 132)
--
-- Guarded by `value IS NULL`, so re-running never overwrites a value.
UPDATE system_setting SET value = '24', updated_at = now()
 WHERE key = 'INVENTORY_HORIZON_MONTHS' AND value IS NULL;

UPDATE system_setting SET value = '5', updated_at = now()
 WHERE key = 'MAX_ROOMS_PER_REQUEST' AND value IS NULL;

UPDATE system_setting SET value = 'PT24H', updated_at = now()
 WHERE key = 'SALES_FIRST_CONTACT_SLA' AND value IS NULL;

UPDATE system_setting SET value = 'PT24H', updated_at = now()
 WHERE key = 'DIRECT_REQUEST_HOLD_DURATION' AND value IS NULL;

UPDATE system_setting SET value = 'false', updated_at = now()
 WHERE key = 'DEPOSIT_REQUIRED_TO_CONFIRM' AND value IS NULL;
