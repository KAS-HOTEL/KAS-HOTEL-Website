-- =============================================================================
-- V2 — Dependency roots: partner and app_user
-- Source: 85-partner-property-model-amendment.md §4.1, 53-phase-4-database-erd.md §6
-- =============================================================================
-- NOTE ON ORDERING (deviation from the plan in doc 88 §6):
-- app_user is created here rather than in V7 because every downstream table
-- carries created_by / updated_by audit FKs referencing it (doc 53 §1).
-- partner and app_user are the only tables with no outbound dependencies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- partner — the management/ownership organisation above one or more properties
-- V1 contains exactly ONE row. Deliberately minimal: identity and ownership
-- only. NO billing, commission, contract, KYC or payout columns — those are
-- the marketplace explicitly excluded from V1 (doc 85 §2.3, §3.1).
-- ---------------------------------------------------------------------------
CREATE TABLE partner (
    id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text            NOT NULL,
    legal_name    text            NOT NULL,
    display_name  text            NOT NULL,
    status        partner_status  NOT NULL DEFAULT 'ACTIVE',
    created_at    timestamptz     NOT NULL DEFAULT now(),
    updated_at    timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT partner_code_key       UNIQUE (code),
    CONSTRAINT partner_code_format    CHECK (code ~ '^[a-z0-9][a-z0-9-]*$'),
    CONSTRAINT partner_legal_name_len CHECK (length(btrim(legal_name)) > 0),
    CONSTRAINT partner_display_len    CHECK (length(btrim(display_name)) > 0)
);

COMMENT ON TABLE  partner IS
    'Management/ownership organisation. V1 = exactly one partner owning 8 properties. Partner != Property.';
COMMENT ON COLUMN partner.code IS
    'Stable lowercase slug. Never exposed publicly (doc 58 denylist).';

-- ---------------------------------------------------------------------------
-- app_user — ONE table for customers and staff, differentiated by
-- role_assignment (doc 52 §3.17). Not two tables: that would duplicate
-- authentication, sessions and password handling.
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
    id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    email               citext       NOT NULL,
    password_hash       text,
    status              user_status  NOT NULL DEFAULT 'UNVERIFIED',
    email_verified_at   timestamptz,
    last_login_at       timestamptz,
    two_factor_enabled  boolean      NOT NULL DEFAULT false,
    locale              char(2)      NOT NULL DEFAULT 'vi',
    failed_login_count  int          NOT NULL DEFAULT 0,
    locked_until        timestamptz,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT app_user_email_key    UNIQUE (email),
    CONSTRAINT app_user_email_format CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT app_user_locale_valid CHECK (locale IN ('vi', 'en')),
    CONSTRAINT app_user_failed_login_nonneg CHECK (failed_login_count >= 0)
);

COMMENT ON TABLE  app_user IS
    'Customers and staff in one table, separated by role_assignment scope.';
COMMENT ON COLUMN app_user.password_hash IS
    'Argon2id. NULL permitted for guest-created customer records with no login yet.';

CREATE INDEX app_user_status_idx ON app_user (status);
