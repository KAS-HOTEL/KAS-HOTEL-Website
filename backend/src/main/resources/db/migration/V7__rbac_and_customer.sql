-- =============================================================================
-- V7 — RBAC scope model and Customer 360
-- Source: 59-phase-4-rbac.md, 61-phase-4-customer-review.md,
--         85-partner-property-model-amendment.md §5
-- =============================================================================

-- ---------------------------------------------------------------------------
-- role_assignment — role PLUS scope. Four scope kinds (doc 85 §5.1).
-- PARTNER is a SCOPE KIND, not a role. No role was added for it.
-- ---------------------------------------------------------------------------
CREATE TABLE role_assignment (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role         user_role   NOT NULL,
    scope_kind   scope_kind  NOT NULL,

    -- Required when scope_kind = PARTNER, forbidden otherwise
    partner_id   uuid        REFERENCES partner (id) ON DELETE CASCADE,

    -- Required when scope_kind = PROPERTY, forbidden otherwise
    property_ids uuid[],

    granted_by   uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    granted_at   timestamptz NOT NULL DEFAULT now(),
    revoked_at   timestamptz,

    -- The scope integrity constraint (doc 85 §4.4). Invariant test #15.
    CONSTRAINT role_assignment_scope_valid CHECK (
        (scope_kind = 'GLOBAL'   AND partner_id IS NULL     AND property_ids IS NULL)
     OR (scope_kind = 'PARTNER'  AND partner_id IS NOT NULL AND property_ids IS NULL)
     OR (scope_kind = 'PROPERTY' AND property_ids IS NOT NULL AND array_length(property_ids, 1) >= 1)
     OR (scope_kind = 'OWN'      AND partner_id IS NULL     AND property_ids IS NULL)
    )
);

COMMENT ON TABLE role_assignment IS
    'V1: SUPER_ADMIN=GLOBAL, ADMIN=PARTNER (all 8 properties), CUSTOMER=OWN. Scope is applied at the DATA layer, not only in controllers.';

CREATE INDEX role_assignment_user_idx    ON role_assignment (user_id) WHERE revoked_at IS NULL;
CREATE INDEX role_assignment_partner_idx ON role_assignment (partner_id) WHERE partner_id IS NOT NULL AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- user_session
-- ---------------------------------------------------------------------------
CREATE TABLE user_session (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    refresh_token_hash  text        NOT NULL,
    device              text,
    ip                  inet,
    user_agent          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL,
    revoked_at          timestamptz,
    CONSTRAINT user_session_token_key UNIQUE (refresh_token_hash),
    CONSTRAINT user_session_expiry_future CHECK (expires_at > created_at)
);

CREATE INDEX user_session_user_idx ON user_session (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- customer — PLATFORM-LEVEL. Deliberately has NO partner_id and NO
-- property_id (doc 85 §3.3, invariant test #18).
--
-- A customer is a person, not a partner's asset. They may stay at Property 1,
-- then 4, then 8 — and in future across partners. Partner-scoping them would
-- defeat Customer 360 and is the wrong privacy posture.
-- ---------------------------------------------------------------------------
CREATE TABLE customer (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid        REFERENCES app_user (id) ON DELETE SET NULL,

    full_name                   text,
    email                       citext,
    phone                       text,
    country                     char(2),
    preferred_channel           contact_channel,
    best_time_to_contact        text,

    -- First-touch attribution: WRITE-ONCE, never overwritten. This is what
    -- makes OTA -> direct conversion measurable (doc 61 §1.1).
    first_distribution_channel  uuid        REFERENCES distribution_channel (id) ON DELETE SET NULL,
    first_lead_source           lead_source,

    locale                      char(2)     NOT NULL DEFAULT 'vi',
    display_currency            char(3)     NOT NULL DEFAULT 'VND',

    -- Reversible merge (doc 61 §2.1)
    merged_into_id              uuid        REFERENCES customer (id) ON DELETE SET NULL,
    merged_at                   timestamptz,
    anonymised_at               timestamptz,

    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT customer_email_key      UNIQUE (email),
    CONSTRAINT customer_locale_valid   CHECK (locale IN ('vi', 'en')),
    CONSTRAINT customer_currency_valid CHECK (display_currency IN ('VND', 'USD')),
    CONSTRAINT customer_country_fmt    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
    CONSTRAINT customer_no_self_merge  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

COMMENT ON TABLE customer IS
    'PLATFORM-LEVEL. Deliberately NO partner_id and NO property_id — a customer is a person, not a partner asset (doc 85 §3.3).';
COMMENT ON COLUMN customer.first_distribution_channel IS
    'Write-once. Never overwritten — makes OTA-to-direct conversion measurable.';

CREATE INDEX customer_phone_idx  ON customer (phone) WHERE phone IS NOT NULL;
CREATE INDEX customer_merged_idx ON customer (merged_into_id) WHERE merged_into_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- customer_consent — PER PURPOSE, never a single boolean (doc 61 §3).
-- A guest who accepts booking emails has NOT accepted marketing.
-- OTA-supplied contact data is NEVER automatically marketable.
-- ---------------------------------------------------------------------------
CREATE TABLE customer_consent (
    id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid            NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
    purpose      consent_purpose NOT NULL,
    granted      boolean         NOT NULL,
    granted_at   timestamptz,
    revoked_at   timestamptz,
    source       text,
    created_at   timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT customer_consent_unique UNIQUE (customer_id, purpose)
);

COMMENT ON TABLE customer_consent IS
    'Transactional and marketing consent are SEPARATE. A reservation never implies marketing consent, on any channel.';

-- ---------------------------------------------------------------------------
-- customer_identity_match — confidence-tiered merge candidates (doc 61 §2).
-- NEVER auto-merge below HIGH: a wrong merge exposes one guest's history to
-- another, which is a privacy incident, not a data-quality issue.
-- ---------------------------------------------------------------------------
CREATE TABLE customer_identity_match (
    id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id       uuid             NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
    candidate_id      uuid             NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
    confidence        match_confidence NOT NULL,
    matched_on        text             NOT NULL,
    reviewed_by       uuid             REFERENCES app_user (id) ON DELETE SET NULL,
    reviewed_at       timestamptz,
    resolution        text,
    created_at        timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT customer_match_distinct CHECK (customer_id <> candidate_id),
    CONSTRAINT customer_match_unique   UNIQUE (customer_id, candidate_id),
    CONSTRAINT customer_match_resolution_valid
        CHECK (resolution IS NULL OR resolution IN ('MERGED', 'REJECTED', 'DEFERRED'))
);

COMMENT ON COLUMN customer_identity_match.confidence IS
    'HIGH = auto-link. MEDIUM = auto-link + flag. LOW = surface as candidate, NEVER auto-merge.';

CREATE INDEX customer_match_pending_idx
    ON customer_identity_match (confidence, created_at) WHERE reviewed_at IS NULL;
