-- =============================================================================
-- V20 — System settings  (the fail-safe configuration mechanism)
-- Source: 51-phase-4-configuration.md §6
-- =============================================================================
-- Every business value that is still OUTSTANDING lives here, UNSET.
--
-- The governing rule (doc 51 §6): a missing required setting FAILS LOUDLY at
-- the point of use, naming the setting. It NEVER silently defaults, and no
-- production value is invented in a migration.
--
-- The rows seeded below carry value = NULL deliberately. They are a REGISTRY of
-- what the business must supply — not values. Seeding a plausible number here
-- would silently resolve an open business decision.
-- =============================================================================

CREATE TABLE system_setting (
    key           text               PRIMARY KEY,
    value         text,                              -- NULL = NOT YET SUPPLIED
    value_type    setting_value_type NOT NULL,
    scope         text               NOT NULL DEFAULT 'GLOBAL',
    property_id   uuid               REFERENCES property (id) ON DELETE CASCADE,
    description   text               NOT NULL,
    source_ref    text,                              -- config id in doc 51
    required_by   text               NOT NULL,       -- DEVELOPMENT | PRODUCTION | FUTURE
    updated_by    uuid               REFERENCES app_user (id) ON DELETE SET NULL,
    updated_at    timestamptz        NOT NULL DEFAULT now(),
    CONSTRAINT system_setting_key_format CHECK (key ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT system_setting_scope_valid CHECK (scope IN ('GLOBAL', 'PROPERTY')),
    CONSTRAINT system_setting_property_scope CHECK (
        (scope = 'GLOBAL'   AND property_id IS NULL)
     OR (scope = 'PROPERTY' AND property_id IS NOT NULL)
    ),
    CONSTRAINT system_setting_required_by_valid
        CHECK (required_by IN ('DEVELOPMENT', 'PRODUCTION', 'FUTURE'))
);

COMMENT ON TABLE system_setting IS
    'Registry of outstanding business configuration. value = NULL means NOT SUPPLIED — the application must fail loudly, never default.';
COMMENT ON COLUMN system_setting.value IS
    'NULL = the business has not supplied this. No production value is ever invented in a migration.';

-- ---------------------------------------------------------------------------
-- Registry rows. Every value is NULL. These record WHAT IS MISSING.
-- ---------------------------------------------------------------------------
INSERT INTO system_setting (key, value, value_type, description, source_ref, required_by) VALUES
  ('DIRECT_REQUEST_HOLD_DURATION',     NULL, 'DURATION',
   'How long a submitted direct request holds inventory before expiry.', 'B2 / OQ-018', 'PRODUCTION'),

  ('DIRECT_ALTERNATIVE_HOLD_DURATION', NULL, 'DURATION',
   'How long an alternative-offer inventory hold survives before automatic release.', 'B1 / D-46', 'PRODUCTION'),

  ('ALTERNATIVE_OFFER_RESPONSE_EXPIRY', NULL, 'DURATION',
   'How long the alternative OFFER stands, distinct from the inventory hold.', 'B19 / OQ-066', 'PRODUCTION'),

  ('SALES_FIRST_CONTACT_SLA',          NULL, 'DURATION',
   'The "within the day" promise, as an operational rule. Drives on-screen text, email, timer and escalation from ONE value.', 'A6 / OQ-051', 'DEVELOPMENT'),

  ('OTA_RECORDING_LAG_THRESHOLD',      NULL, 'DURATION',
   'Acceptable delay between an OTA reservation being received and recorded. MEASURED, not enforced.', 'B4 / OQ-081', 'PRODUCTION'),

  ('RECONCILIATION_VARIANCE_TOLERANCE', NULL, 'DECIMAL',
   'Acceptable daily variance between KAS and the OTA extranets before alerting.', 'B5', 'PRODUCTION'),

  ('INQUIRY_FOLLOWUP_ATTEMPT_LIMIT',   NULL, 'INTEGER',
   'Follow-up attempts before an inquiry auto-transitions to LOST.', 'B18 / OQ-080', 'PRODUCTION'),

  ('MAX_ROOMS_PER_REQUEST',            NULL, 'INTEGER',
   'Ceiling above which a request routes to a group enquiry.', 'B15 / OQ-015', 'PRODUCTION'),

  ('MAX_STAY_NIGHTS',                  NULL, 'INTEGER',
   'Maximum stay length for validation.', 'B21 / OQ-035', 'PRODUCTION'),

  ('DEPOSIT_REQUIRED_TO_CONFIRM',      NULL, 'BOOLEAN',
   'Whether a deposit is required before a direct sale may reach WON.', 'B12 / OQ-017', 'PRODUCTION'),

  ('DEPOSIT_PERCENTAGE',               NULL, 'DECIMAL',
   'Deposit percentage, if required.', 'B12 / OQ-017', 'PRODUCTION'),

  ('REVIEW_WINDOW_DAYS',               NULL, 'INTEGER',
   'How long after checkout a guest may review.', 'B16 / OQ-040', 'PRODUCTION'),

  ('INVENTORY_HORIZON_MONTHS',         NULL, 'INTEGER',
   'Rolling horizon for generated inventory days.', 'doc 55 §2', 'DEVELOPMENT'),

  ('USD_FX_RATE_SOURCE',               NULL, 'STRING',
   'Provider for the indicative USD display conversion. VND remains the only transactional currency.', 'B22 / OQ-052', 'PRODUCTION'),

  ('USD_FX_REFRESH_INTERVAL',          NULL, 'DURATION',
   'How often the indicative USD rate refreshes.', 'B22 / OQ-052', 'PRODUCTION'),

  ('DEFAULT_LOCALE',                   NULL, 'STRING',
   'Locale served when a visitor presents no signal.', 'A11 / OQ-065', 'DEVELOPMENT'),

  ('SAME_DAY_BOOKING_CUTOFF',          NULL, 'STRING',
   'Latest hour a same-day request is accepted.', 'B20 / OQ-047', 'PRODUCTION'),

  ('NO_SHOW_CUTOFF',                   NULL, 'STRING',
   'Hour after which an operator is PROMPTED to mark a no-show. Never automatic.', 'A5 / OQ-045', 'PRODUCTION');

COMMENT ON COLUMN system_setting.required_by IS
    'DEVELOPMENT = blocks implementation. PRODUCTION = blocks launch. FUTURE = not needed in V1.';
