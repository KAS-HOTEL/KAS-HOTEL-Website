-- =============================================================================
-- V33 — KAS frontend-aligned catalog, CMS, customer accounts, membership and cashback
-- Target: PostgreSQL / Flyway / schema `kas` (same schema as V1–V32)
-- IMPORTANT: this migration has been adjusted to the current Frontend contract.
-- It is additive and has not been applied to a database.
-- =============================================================================
-- Staff roles are assigned through role_assignment. The business decision is
-- ADMIN for catalog/content/prices/review moderation and SUPER_ADMIN for all
-- operations. Each staff account gets its own sign-in key; multiple accounts
-- per role remain possible and each key is individually revocable.
--
-- Membership tiers and quarterly booking qualification are seeded per the
-- confirmed business rules. Tier upgrades apply immediately and carry through
-- the next calendar quarter. Cashback is credited after completed stays.
-- Cashback rewards accrue as KAS points, redeemable against a later order and
-- never as a bank payout. One point is one VND of order deduction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
CREATE TYPE membership_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE membership_tier_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE cashback_entry_type AS ENUM ('EARN', 'REDEEM', 'REVERSAL', 'EXPIRY', 'ADJUSTMENT');
CREATE TYPE cashback_direction AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE cashback_hold_status AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');
CREATE TYPE customer_deletion_status AS ENUM ('REQUESTED', 'IN_REVIEW', 'COMPLETED', 'REJECTED', 'CANCELLED');
CREATE TYPE alternative_offer_status AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE reservation_document_type AS ENUM ('INVOICE', 'RECEIPT', 'BOOKING_CONFIRMATION', 'OTHER');
CREATE TYPE reservation_document_status AS ENUM ('DRAFT', 'ISSUED', 'VOID');
CREATE TYPE reservation_email_action AS ENUM ('REVIEW', 'CONFIRM_BOOKING', 'PROPOSE_ALTERNATIVE');

-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Website CMS: use stable page/block keys; real content is populated by ADMIN.
-- These tables supplement property/room translations and the existing media
-- library. No page copy, URLs, translations or production content are seeded.
-- media_link.owner_type = PAGE_BLOCK can reference site_content_block.id.
-- -----------------------------------------------------------------------------
CREATE TABLE site_page (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    page_key    text        NOT NULL UNIQUE,
    status      rule_status NOT NULL DEFAULT 'DRAFT',
    sort_order  int         NOT NULL DEFAULT 0,
    created_by  uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by  uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT site_page_key_format CHECK (page_key ~ '^[a-z0-9][a-z0-9._-]*$')
);

CREATE TABLE site_page_translation (
    page_id          uuid    NOT NULL REFERENCES site_page (id) ON DELETE CASCADE,
    locale           char(2) NOT NULL,
    title            text,
    introduction     text,
    meta_title       text,
    meta_description text,
    PRIMARY KEY (page_id, locale),
    CONSTRAINT site_page_translation_locale CHECK (locale IN ('vi', 'en'))
);

CREATE TABLE site_content_block (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id      uuid        NOT NULL REFERENCES site_page (id) ON DELETE CASCADE,
    block_key    text        NOT NULL,
    block_type   text        NOT NULL,
    status       rule_status NOT NULL DEFAULT 'DRAFT',
    sort_order   int         NOT NULL DEFAULT 0,
    config       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_by   uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by   uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT site_content_block_key_unique UNIQUE (page_id, block_key),
    CONSTRAINT site_content_block_key_not_blank CHECK (length(btrim(block_key)) > 0),
    CONSTRAINT site_content_block_type_not_blank CHECK (length(btrim(block_type)) > 0),
    CONSTRAINT site_content_block_config_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE TABLE site_content_block_translation (
    block_id   uuid    NOT NULL REFERENCES site_content_block (id) ON DELETE CASCADE,
    locale     char(2) NOT NULL,
    heading    text,
    body       text,
    cta_label  text,
    cta_url    text,
    PRIMARY KEY (block_id, locale),
    CONSTRAINT site_block_translation_locale CHECK (locale IN ('vi', 'en'))
);

CREATE INDEX site_page_publish_idx ON site_page (status, sort_order);
CREATE INDEX site_content_block_page_idx ON site_content_block (page_id, status, sort_order);

COMMENT ON TABLE site_page IS 'Editable page registry for ADMIN-managed website content. Does not invent or seed production copy.';
COMMENT ON TABLE site_content_block IS 'Ordered page block registry; block-specific data is kept in a validated JSON object and localized text in a separate table.';

-- -----------------------------------------------------------------------------
-- Membership tiers and customer membership history.
-- -----------------------------------------------------------------------------
CREATE TABLE membership_tier (
    id                          uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    code                        text                 NOT NULL UNIQUE,
    status                      membership_tier_status NOT NULL DEFAULT 'DRAFT',
    sort_order                  int                  NOT NULL DEFAULT 0,
    qualifying_spend_minor      bigint,
    qualifying_nights           int,
    qualification_period_months smallint,
    qualifying_completed_bookings int,
    discount_percent            numeric(5,2) NOT NULL DEFAULT 10.00,
    cashback_rate_percent       numeric(6,3) NOT NULL DEFAULT 0,
    early_checkin_hours         smallint NOT NULL DEFAULT 2,
    late_checkout_hours         smallint NOT NULL DEFAULT 2,
    free_cancellation_days_before_checkin smallint NOT NULL DEFAULT 0,
    free_cancellation_cutoff_time time NOT NULL DEFAULT TIME '12:00',
    qualification_period_kind   text NOT NULL DEFAULT 'CALENDAR_QUARTER',
    created_by                  uuid REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by                  uuid REFERENCES app_user (id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT membership_tier_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
    CONSTRAINT membership_tier_spend_nonneg CHECK (qualifying_spend_minor IS NULL OR qualifying_spend_minor >= 0),
    CONSTRAINT membership_tier_nights_nonneg CHECK (qualifying_nights IS NULL OR qualifying_nights >= 0),
    CONSTRAINT membership_tier_period_pos CHECK (qualification_period_months IS NULL OR qualification_period_months >= 1),
    CONSTRAINT membership_tier_bookings_nonneg CHECK (qualifying_completed_bookings IS NULL OR qualifying_completed_bookings >= 0),
    CONSTRAINT membership_tier_discount_range CHECK (discount_percent BETWEEN 0 AND 100),
    CONSTRAINT membership_tier_cashback_range CHECK (cashback_rate_percent BETWEEN 0 AND 100),
    CONSTRAINT membership_tier_early_checkin_range CHECK (early_checkin_hours BETWEEN 0 AND 24),
    CONSTRAINT membership_tier_late_checkout_range CHECK (late_checkout_hours BETWEEN 0 AND 24),
    CONSTRAINT membership_tier_free_cancel_days_nonneg CHECK (free_cancellation_days_before_checkin >= 0),
    CONSTRAINT membership_tier_period_kind CHECK (qualification_period_kind IN ('CALENDAR_QUARTER'))
);

CREATE TABLE membership_tier_translation (
    tier_id      uuid    NOT NULL REFERENCES membership_tier (id) ON DELETE CASCADE,
    locale       char(2) NOT NULL,
    display_name text    NOT NULL,
    description  text,
    PRIMARY KEY (tier_id, locale),
    CONSTRAINT membership_tier_translation_locale CHECK (locale IN ('vi', 'en')),
    CONSTRAINT membership_tier_translation_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE customer_membership (
    id           uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid              NOT NULL UNIQUE REFERENCES customer (id) ON DELETE RESTRICT,
    status       membership_status NOT NULL DEFAULT 'ACTIVE',
    joined_at    timestamptz       NOT NULL DEFAULT now(),
    enrollment_source text,
    created_at   timestamptz       NOT NULL DEFAULT now(),
    updated_at   timestamptz       NOT NULL DEFAULT now()
);

CREATE TABLE customer_membership_tier_history (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id      uuid        NOT NULL REFERENCES customer_membership (id) ON DELETE RESTRICT,
    tier_id            uuid        NOT NULL REFERENCES membership_tier (id) ON DELETE RESTRICT,
    effective_from     timestamptz NOT NULL,
    effective_to       timestamptz,
    assigned_by        uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    change_reason      text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT membership_tier_history_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX customer_membership_one_current_tier_uk
    ON customer_membership_tier_history (membership_id)
    WHERE effective_to IS NULL;
CREATE INDEX customer_membership_tier_history_lookup_idx
    ON customer_membership_tier_history (membership_id, effective_from DESC);
CREATE INDEX customer_membership_active_idx
    ON customer_membership (status, joined_at DESC);

-- Versioned policy: 10% member discount, then one voucher, then points.
CREATE TABLE membership_discount_policy (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    version           int         NOT NULL,
    status            rule_status NOT NULL DEFAULT 'DRAFT',
    discount_percent  numeric(5,2) NOT NULL DEFAULT 10.00,
    discount_basis    text,
    stacking_policy   text,
    effective_from    date        NOT NULL,
    effective_to      date,
    created_by        uuid REFERENCES app_user (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT membership_discount_policy_version_uk UNIQUE (version),
    CONSTRAINT membership_discount_percent_range CHECK (discount_percent BETWEEN 0 AND 100),
    CONSTRAINT membership_discount_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT membership_discount_active_configured CHECK (
        status <> 'ACTIVE' OR (discount_basis IS NOT NULL AND stacking_policy IS NOT NULL)
    )
);

CREATE UNIQUE INDEX membership_discount_policy_one_active_idx
    ON membership_discount_policy ((true))
    WHERE status = 'ACTIVE';

COMMENT ON TABLE membership_discount_policy IS
    'Versioned discount policy; tier-level confirmed discount values are stored on membership_tier.';

-- -----------------------------------------------------------------------------
-- Cashback points, account and immutable ledger. One point is worth one VND
-- when applied to a later order; points cannot be paid out as cash.
-- -----------------------------------------------------------------------------
CREATE TABLE cashback_program (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                        text        NOT NULL UNIQUE,
    membership_tier_id          uuid        REFERENCES membership_tier (id) ON DELETE RESTRICT,
    status                      rule_status NOT NULL DEFAULT 'DRAFT',
    currency                    char(3)     NOT NULL DEFAULT 'VND',
    earn_rate_percent           numeric(6,3),
    eligible_basis_code         text,
    minimum_eligible_minor      bigint,
    maximum_earn_points         bigint,
    redemption_enabled          boolean     NOT NULL DEFAULT false,
    minimum_redemption_points  bigint,
    maximum_redeem_percent      numeric(6,3),
    valid_from                  date,
    valid_to                    date,
    created_by                  uuid REFERENCES app_user (id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cashback_program_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
    CONSTRAINT cashback_program_currency_fmt CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT cashback_program_earn_rate_range CHECK (earn_rate_percent IS NULL OR earn_rate_percent BETWEEN 0 AND 100),
    CONSTRAINT cashback_program_basis_not_blank CHECK (eligible_basis_code IS NULL OR length(btrim(eligible_basis_code)) > 0),
    CONSTRAINT cashback_program_minimum_nonneg CHECK (minimum_eligible_minor IS NULL OR minimum_eligible_minor >= 0),
    CONSTRAINT cashback_program_max_earn_nonneg CHECK (maximum_earn_points IS NULL OR maximum_earn_points >= 0),
    CONSTRAINT cashback_program_min_redeem_nonneg CHECK (minimum_redemption_points IS NULL OR minimum_redemption_points >= 0),
    CONSTRAINT cashback_program_max_redeem_range CHECK (maximum_redeem_percent IS NULL OR maximum_redeem_percent BETWEEN 0 AND 100),
    CONSTRAINT cashback_program_dates CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT cashback_program_active_configured CHECK (
        status <> 'ACTIVE' OR (earn_rate_percent IS NOT NULL AND eligible_basis_code IS NOT NULL)
    ),
    CONSTRAINT cashback_program_redemption_configured CHECK (
        NOT redemption_enabled OR (minimum_redemption_points IS NOT NULL AND maximum_redeem_percent IS NOT NULL)
    )
);

CREATE INDEX cashback_program_active_idx
    ON cashback_program (status, valid_from, valid_to) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX cashback_program_membership_tier_uk
    ON cashback_program (membership_tier_id) WHERE membership_tier_id IS NOT NULL;

CREATE TABLE cashback_account (
    customer_id    uuid        PRIMARY KEY REFERENCES customer (id) ON DELETE RESTRICT,
    balance_points bigint      NOT NULL DEFAULT 0,
    reserved_points bigint     NOT NULL DEFAULT 0,
    version        int         NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cashback_account_balance_nonneg CHECK (balance_points >= 0),
    CONSTRAINT cashback_account_reserved_nonneg CHECK (reserved_points >= 0),
    CONSTRAINT cashback_account_reserved_le_balance CHECK (reserved_points <= balance_points),
    CONSTRAINT cashback_account_version_nonneg CHECK (version >= 0)
);

ALTER TABLE reservation
    ADD CONSTRAINT reservation_id_customer_pair_uk UNIQUE (id, customer_id);

CREATE TABLE cashback_ledger (
    id                       uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id              uuid                 NOT NULL REFERENCES customer (id) ON DELETE RESTRICT,
    program_id               uuid                 REFERENCES cashback_program (id) ON DELETE RESTRICT,
    reservation_id           uuid                 REFERENCES reservation (id) ON DELETE RESTRICT,
    entry_type               cashback_entry_type  NOT NULL,
    direction                cashback_direction   NOT NULL,
    points_amount            bigint               NOT NULL,
    eligible_amount_minor    bigint,
    earn_rate_percent_snapshot numeric(6,3),
    source_entry_id          uuid                 REFERENCES cashback_ledger (id) ON DELETE RESTRICT,
    idempotency_key          text                 NOT NULL UNIQUE,
    reason                   text,
    created_by               uuid                 REFERENCES app_user (id) ON DELETE SET NULL,
    created_at               timestamptz          NOT NULL DEFAULT now(),
    expires_at               timestamptz,
    CONSTRAINT cashback_ledger_points_pos CHECK (points_amount > 0),
    CONSTRAINT cashback_ledger_eligible_nonneg CHECK (eligible_amount_minor IS NULL OR eligible_amount_minor >= 0),
    CONSTRAINT cashback_ledger_rate_range CHECK (earn_rate_percent_snapshot IS NULL OR earn_rate_percent_snapshot BETWEEN 0 AND 100),
    CONSTRAINT cashback_ledger_source_not_self CHECK (source_entry_id IS NULL OR source_entry_id <> id),
    CONSTRAINT cashback_ledger_type_direction CHECK (
        (entry_type = 'EARN' AND direction = 'CREDIT') OR
        (entry_type = 'REDEEM' AND direction = 'DEBIT') OR
        (entry_type = 'EXPIRY' AND direction = 'DEBIT') OR
        (entry_type IN ('REVERSAL', 'ADJUSTMENT'))
    ),
    CONSTRAINT cashback_ledger_earn_snapshot CHECK (
        entry_type <> 'EARN' OR
        (program_id IS NOT NULL AND reservation_id IS NOT NULL AND
         eligible_amount_minor IS NOT NULL AND earn_rate_percent_snapshot IS NOT NULL AND expires_at IS NOT NULL)
    ),
    CONSTRAINT cashback_ledger_expiry_only_for_earn CHECK (entry_type = 'EARN' OR expires_at IS NULL),
    CONSTRAINT cashback_ledger_redeem_context CHECK (
        entry_type <> 'REDEEM' OR reservation_id IS NOT NULL
    ),
    CONSTRAINT cashback_ledger_reversal_source CHECK (
        entry_type <> 'REVERSAL' OR source_entry_id IS NOT NULL
    )
);

CREATE INDEX cashback_ledger_customer_idx ON cashback_ledger (customer_id, created_at DESC);
CREATE INDEX cashback_ledger_expiring_idx ON cashback_ledger (expires_at, customer_id)
    WHERE entry_type = 'EARN' AND direction = 'CREDIT' AND expires_at IS NOT NULL;
COMMENT ON COLUMN cashback_ledger.expires_at IS
    'Expiry for earned points: points earned in quarter months 1–2 expire at that quarter end; points earned in month 3 expire at the end of the next calendar quarter.';

CREATE FUNCTION kas_set_cashback_quarter_expiry()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    local_earned_at timestamp;
    next_quarter timestamp;
BEGIN
    IF NEW.entry_type = 'EARN' AND NEW.expires_at IS NULL THEN
        local_earned_at := NEW.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
        next_quarter := date_trunc('quarter', local_earned_at) + interval '3 months';
        IF EXTRACT(MONTH FROM local_earned_at) = EXTRACT(MONTH FROM next_quarter - interval '1 day') THEN
            next_quarter := next_quarter + interval '3 months';
        END IF;
        -- Expiry at the next quarter's first instant leaves all of quarter-end
        -- available; the daily expiry worker consumes it as the new quarter starts.
        NEW.expires_at := next_quarter AT TIME ZONE 'Asia/Ho_Chi_Minh';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER cashback_earn_quarter_expiry_trg
    BEFORE INSERT ON cashback_ledger
    FOR EACH ROW EXECUTE FUNCTION kas_set_cashback_quarter_expiry();
CREATE INDEX cashback_ledger_reservation_idx ON cashback_ledger (reservation_id, created_at DESC) WHERE reservation_id IS NOT NULL;
CREATE UNIQUE INDEX cashback_one_earn_per_reservation_program_uk
    ON cashback_ledger (reservation_id, program_id)
    WHERE entry_type = 'EARN' AND reservation_id IS NOT NULL AND program_id IS NOT NULL;
CREATE UNIQUE INDEX cashback_one_redeem_per_reservation_program_uk
    ON cashback_ledger (reservation_id, program_id)
    WHERE entry_type = 'REDEEM' AND reservation_id IS NOT NULL AND program_id IS NOT NULL;
CREATE UNIQUE INDEX cashback_one_redeem_without_program_per_reservation_uk
    ON cashback_ledger (reservation_id)
    WHERE entry_type = 'REDEEM' AND reservation_id IS NOT NULL AND program_id IS NULL;

CREATE FUNCTION kas_prevent_cashback_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'cashback_ledger is append-only; record a reversal or adjustment instead';
END;
$$;

CREATE TRIGGER cashback_ledger_append_only_trg
    BEFORE UPDATE OR DELETE ON cashback_ledger
    FOR EACH ROW EXECUTE FUNCTION kas_prevent_cashback_ledger_mutation();

COMMENT ON TABLE cashback_ledger IS
    'Append-only wallet ledger. Idempotency key prevents duplicate earn/redeem; corrections are new reversal/adjustment entries.';
COMMENT ON COLUMN cashback_ledger.points_amount IS
    'Positive integer point magnitude; one point equals one VND when deducted from a future order. Direction controls credit/debit.';

CREATE TABLE cashback_hold (
    id           uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid               NOT NULL REFERENCES customer (id) ON DELETE RESTRICT,
    reservation_id uuid             NOT NULL,
    points_amount bigint            NOT NULL,
    status       cashback_hold_status NOT NULL DEFAULT 'ACTIVE',
    expires_at   timestamptz        NOT NULL,
    created_by   uuid               REFERENCES app_user (id) ON DELETE SET NULL,
    created_at   timestamptz        NOT NULL DEFAULT now(),
    updated_at   timestamptz        NOT NULL DEFAULT now(),
    CONSTRAINT cashback_hold_booking_customer_fk FOREIGN KEY (reservation_id, customer_id)
        REFERENCES reservation (id, customer_id) ON DELETE CASCADE,
    CONSTRAINT cashback_hold_points_pos CHECK (points_amount > 0),
    CONSTRAINT cashback_hold_expiry CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX cashback_hold_one_active_per_reservation_uk
    ON cashback_hold (reservation_id) WHERE status = 'ACTIVE';
CREATE INDEX cashback_hold_customer_status_idx ON cashback_hold (customer_id, status, expires_at);

-- Snapshot membership pricing on each booking. A historic reservation must not
-- change when the customer tier or a discount policy changes later.
CREATE TABLE reservation_loyalty_snapshot (
    reservation_id             uuid PRIMARY KEY REFERENCES reservation (id) ON DELETE CASCADE,
    customer_membership_id     uuid REFERENCES customer_membership (id) ON DELETE SET NULL,
    tier_id                    uuid REFERENCES membership_tier (id) ON DELETE SET NULL,
    tier_code_snapshot         text,
    discount_policy_id         uuid REFERENCES membership_discount_policy (id) ON DELETE SET NULL,
    member_discount_percent    numeric(5,2),
    member_discount_base_minor bigint      NOT NULL DEFAULT 0,
    member_discount_minor      bigint      NOT NULL DEFAULT 0,
    cashback_rate_percent_snapshot numeric(6,3),
    cashback_redeemed_points   bigint      NOT NULL DEFAULT 0,
    currency                   char(3)     NOT NULL DEFAULT 'VND',
    created_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservation_loyalty_percent_range CHECK (member_discount_percent IS NULL OR member_discount_percent BETWEEN 0 AND 100),
    CONSTRAINT reservation_loyalty_cashback_rate_range CHECK (cashback_rate_percent_snapshot IS NULL OR cashback_rate_percent_snapshot BETWEEN 0 AND 100),
    CONSTRAINT reservation_loyalty_amounts_nonneg CHECK (member_discount_base_minor >= 0 AND member_discount_minor >= 0 AND cashback_redeemed_points >= 0),
    CONSTRAINT reservation_loyalty_discount_not_over_base CHECK (member_discount_minor <= member_discount_base_minor),
    CONSTRAINT reservation_loyalty_currency_fmt CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT reservation_loyalty_membership_consistency CHECK (
        customer_membership_id IS NOT NULL OR (member_discount_minor = 0 AND member_discount_percent IS NULL AND tier_code_snapshot IS NULL)
    )
);

-- Customer self-service: favourites and saved companion profiles.
CREATE TABLE customer_favorite_property (
    customer_id uuid NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
    property_id uuid NOT NULL REFERENCES property (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, property_id)
);

CREATE INDEX customer_favorite_property_property_idx ON customer_favorite_property (property_id);

CREATE TABLE customer_guest_profile (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   uuid NOT NULL REFERENCES customer (id) ON DELETE CASCADE,
    full_name     text NOT NULL,
    email         citext,
    phone         text,
    country       char(2),
    relationship_label text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_guest_profile_name CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
    CONSTRAINT customer_guest_profile_phone CHECK (phone IS NULL OR length(phone) BETWEEN 3 AND 32),
    CONSTRAINT customer_guest_profile_country CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);

CREATE INDEX customer_guest_profile_owner_idx ON customer_guest_profile (customer_id, created_at DESC);

CREATE TABLE reservation_companion (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id        uuid NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    guest_profile_id      uuid REFERENCES customer_guest_profile (id) ON DELETE SET NULL,
    full_name_snapshot    text NOT NULL,
    email_snapshot        citext,
    phone_snapshot        text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservation_companion_name CHECK (length(btrim(full_name_snapshot)) BETWEEN 1 AND 200)
);

CREATE INDEX reservation_companion_reservation_idx ON reservation_companion (reservation_id);

CREATE TABLE customer_account_deletion_request (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id    uuid NOT NULL REFERENCES customer (id) ON DELETE RESTRICT,
    status         customer_deletion_status NOT NULL DEFAULT 'REQUESTED',
    requested_at   timestamptz NOT NULL DEFAULT now(),
    processed_at   timestamptz,
    processed_by   uuid REFERENCES app_user (id) ON DELETE SET NULL,
    resolution_note text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT deletion_processed_consistency CHECK (
        (status NOT IN ('COMPLETED', 'REJECTED') OR processed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX customer_one_open_deletion_request_uk
    ON customer_account_deletion_request (customer_id)
    WHERE status IN ('REQUESTED', 'IN_REVIEW');

-- Rebooking preserves lineage while creating a new reservation and new price snapshot.
ALTER TABLE reservation
    ADD COLUMN rebooked_from_reservation_id uuid REFERENCES reservation (id) ON DELETE RESTRICT;
CREATE INDEX reservation_rebooked_from_idx ON reservation (rebooked_from_reservation_id)
    WHERE rebooked_from_reservation_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Hotel proposes alternative room/rate. Customer acceptance is explicit; the
-- original request is not silently overwritten. Inventory can be held against
-- the exact offer using inventory_hold.alternative_offer_id.
-- -----------------------------------------------------------------------------
CREATE TABLE reservation_alternative_offer (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id     uuid NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    status             alternative_offer_status NOT NULL DEFAULT 'DRAFT',
    currency           char(3) NOT NULL DEFAULT 'VND',
    subtotal_minor     bigint,
    tax_minor          bigint,
    service_charge_minor bigint,
    discount_minor     bigint NOT NULL DEFAULT 0,
    total_minor        bigint,
    price_snapshot     jsonb NOT NULL,
    quote_expires_at   timestamptz NOT NULL,
    proposed_by        uuid REFERENCES app_user (id) ON DELETE SET NULL,
    sent_at            timestamptz,
    guest_responded_at timestamptz,
    guest_response_note text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT alternative_offer_id_reservation_uk UNIQUE (id, reservation_id),
    CONSTRAINT alternative_offer_currency_fmt CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT alternative_offer_money_nonneg CHECK (
        (subtotal_minor IS NULL OR subtotal_minor >= 0) AND
        (tax_minor IS NULL OR tax_minor >= 0) AND
        (service_charge_minor IS NULL OR service_charge_minor >= 0) AND
        discount_minor >= 0 AND (total_minor IS NULL OR total_minor >= 0)
    ),
    CONSTRAINT alternative_offer_expiry_future CHECK (quote_expires_at > created_at),
    CONSTRAINT alternative_offer_sent_timestamp CHECK (status NOT IN ('SENT', 'ACCEPTED') OR sent_at IS NOT NULL)
);

CREATE UNIQUE INDEX reservation_one_open_alternative_offer_uk
    ON reservation_alternative_offer (reservation_id)
    WHERE status IN ('DRAFT', 'SENT');
CREATE INDEX reservation_alternative_offer_history_idx
    ON reservation_alternative_offer (reservation_id, created_at DESC);

CREATE TABLE reservation_alternative_offer_line (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id              uuid NOT NULL REFERENCES reservation_alternative_offer (id) ON DELETE CASCADE,
    room_type_id          uuid NOT NULL REFERENCES room_type (id) ON DELETE RESTRICT,
    quantity              int NOT NULL,
    room_type_name_snapshot text NOT NULL,
    nightly_price_minor   bigint,
    line_total_minor      bigint,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT alternative_offer_line_qty_pos CHECK (quantity >= 1),
    CONSTRAINT alternative_offer_line_money_nonneg CHECK (
        (nightly_price_minor IS NULL OR nightly_price_minor >= 0) AND
        (line_total_minor IS NULL OR line_total_minor >= 0)
    )
);
CREATE INDEX alternative_offer_line_offer_idx ON reservation_alternative_offer_line (offer_id);

ALTER TABLE inventory_hold
    ADD COLUMN alternative_offer_id uuid;
ALTER TABLE inventory_hold
    ADD CONSTRAINT inventory_hold_alternative_offer_fk
    FOREIGN KEY (alternative_offer_id, reservation_id)
    REFERENCES reservation_alternative_offer (id, reservation_id) ON DELETE CASCADE;
ALTER TABLE inventory_hold
    ADD CONSTRAINT inventory_hold_alternative_offer_consistency CHECK (
        alternative_offer_id IS NULL OR (hold_type = 'ALTERNATIVE_OFFER' AND reservation_id IS NOT NULL AND inquiry_id IS NULL)
    );
CREATE INDEX inventory_hold_alternative_offer_idx ON inventory_hold (alternative_offer_id)
    WHERE alternative_offer_id IS NOT NULL;

-- Secure email links: only a hashed token is persisted. GET/opening a link must
-- never confirm a booking; the page must authenticate SUPER_ADMIN and require an
-- explicit POST confirmation. Expiry and single-use are enforced server-side.
CREATE TABLE reservation_email_action_token (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    action         reservation_email_action NOT NULL,
    token_hash     text NOT NULL UNIQUE,
    recipient_email citext,
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz,
    invalidated_at timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservation_email_action_token_expiry CHECK (expires_at > created_at),
    CONSTRAINT reservation_email_action_single_use CHECK (used_at IS NULL OR invalidated_at IS NULL)
);
CREATE INDEX reservation_email_action_token_queue_idx
    ON reservation_email_action_token (reservation_id, created_at DESC);
CREATE INDEX reservation_email_action_token_active_idx
    ON reservation_email_action_token (expires_at)
    WHERE used_at IS NULL AND invalidated_at IS NULL;

-- Generated documents (e.g. invoice / receipt) point to protected media storage.
-- A document marked ISSUED must have an actual protected file and issue timestamp.
CREATE TABLE reservation_document (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id   uuid NOT NULL REFERENCES reservation (id) ON DELETE RESTRICT,
    document_type    reservation_document_type NOT NULL,
    status           reservation_document_status NOT NULL DEFAULT 'DRAFT',
    document_number  text,
    media_asset_id   uuid REFERENCES media_asset (id) ON DELETE RESTRICT,
    currency         char(3) NOT NULL DEFAULT 'VND',
    amount_minor     bigint,
    metadata_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    issued_at        timestamptz,
    created_by       uuid REFERENCES app_user (id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservation_document_currency_fmt CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT reservation_document_amount_nonneg CHECK (amount_minor IS NULL OR amount_minor >= 0),
    CONSTRAINT reservation_document_metadata_object CHECK (jsonb_typeof(metadata_snapshot) = 'object'),
    CONSTRAINT reservation_document_issued_has_file CHECK (status <> 'ISSUED' OR (media_asset_id IS NOT NULL AND issued_at IS NOT NULL))
);
CREATE UNIQUE INDEX reservation_document_number_uk ON reservation_document (document_number)
    WHERE document_number IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Frontend catalog compatibility. The FE's hotel-XX identifiers and two-digit
-- display codes are separate from the Backend branch_code used in booking refs.
-- -----------------------------------------------------------------------------
ALTER TABLE property
    ADD COLUMN frontend_key text,
    ADD COLUMN frontend_branch_code text,
    ADD COLUMN address_line text,
    ADD COLUMN official_url text,
    ADD COLUMN legacy_names text[] NOT NULL DEFAULT '{}',
    ADD COLUMN quick_search_tags text[] NOT NULL DEFAULT '{}',
    ADD COLUMN trip_com_rating numeric(3,1),
    ADD COLUMN trip_com_review_count int,
    ADD COLUMN trip_com_source_url text,
    ADD COLUMN trip_com_observed_on date,
    ADD CONSTRAINT property_frontend_key_format
        CHECK (frontend_key IS NULL OR frontend_key ~ '^hotel-[0-9]{2}$'),
    ADD CONSTRAINT property_frontend_branch_code_format
        CHECK (frontend_branch_code IS NULL OR frontend_branch_code ~ '^[0-9]{2}$'),
    ADD CONSTRAINT property_trip_com_rating_range
        CHECK (trip_com_rating IS NULL OR trip_com_rating BETWEEN 0 AND 10),
    ADD CONSTRAINT property_trip_com_review_count_nonneg
        CHECK (trip_com_review_count IS NULL OR trip_com_review_count >= 0),
    ADD CONSTRAINT property_trip_com_rating_pair
        CHECK (trip_com_rating IS NOT NULL OR trip_com_review_count IS NULL);

CREATE UNIQUE INDEX property_frontend_key_uk
    ON property (frontend_key) WHERE frontend_key IS NOT NULL;
CREATE UNIQUE INDEX property_frontend_branch_code_uk
    ON property (partner_id, frontend_branch_code) WHERE frontend_branch_code IS NOT NULL;

CREATE TABLE trip_com_rating_quarterly_snapshot (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     uuid NOT NULL REFERENCES property (id) ON DELETE RESTRICT,
    quarter_start   date NOT NULL,
    rating          numeric(3,1) NOT NULL,
    review_count    int NOT NULL,
    source_url      text NOT NULL,
    observed_on     date NOT NULL,
    updated_by      uuid REFERENCES app_user (id) ON DELETE SET NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trip_rating_quarter_boundary CHECK (
        EXTRACT(MONTH FROM quarter_start) IN (1, 4, 7, 10) AND EXTRACT(DAY FROM quarter_start) = 1),
    CONSTRAINT trip_rating_range CHECK (rating BETWEEN 0 AND 10),
    CONSTRAINT trip_review_count_nonneg CHECK (review_count >= 0),
    CONSTRAINT trip_source_not_blank CHECK (length(btrim(source_url)) > 0),
    UNIQUE (property_id, quarter_start)
);
CREATE INDEX trip_rating_snapshot_history_idx
    ON trip_com_rating_quarterly_snapshot (property_id, quarter_start DESC);

COMMENT ON COLUMN property.branch_code IS
    'Backend-owned booking reference branch code. Kept unchanged; Frontend identifiers are stored separately.';
COMMENT ON COLUMN property.trip_com_rating IS
    'Editable Trip.com aggregate score on its native 0–10 scale. Individual Trip.com review text is not imported.';
COMMENT ON COLUMN property.trip_com_source_url IS
    'Trip.com listing used for the aggregate score; display this source label with the score in the Frontend.';

ALTER TABLE property_translation
    ADD COLUMN tagline text,
    ADD COLUMN source_description text;

ALTER TABLE room_type
    ADD COLUMN frontend_key text,
    ADD COLUMN frontend_rate_branch_key text,
    ADD COLUMN rate_sheet_stt int,
    ADD COLUMN rate_mapping_confidence text,
    ADD COLUMN frontend_bed_description text,
    ADD COLUMN frontend_view text,
    ADD COLUMN breakfast_included boolean,
    ADD CONSTRAINT room_type_frontend_key_format
        CHECK (frontend_key IS NULL OR frontend_key ~ '^h[0-9]{2}-r[0-9]+$'),
    ADD CONSTRAINT room_type_rate_mapping_pair
        CHECK ((frontend_rate_branch_key IS NULL AND rate_sheet_stt IS NULL AND rate_mapping_confidence IS NULL)
            OR (frontend_rate_branch_key IS NOT NULL AND rate_sheet_stt IS NOT NULL
                AND rate_mapping_confidence IS NOT NULL
                AND frontend_rate_branch_key ~ '^hotel-[0-9]{2}$' AND rate_sheet_stt > 0
                AND rate_mapping_confidence IN ('EXACT', 'HIGH')));

CREATE UNIQUE INDEX room_type_frontend_key_uk
    ON room_type (frontend_key) WHERE frontend_key IS NOT NULL;
CREATE UNIQUE INDEX room_type_rate_sheet_row_uk
    ON room_type (frontend_rate_branch_key, rate_sheet_stt)
    WHERE frontend_rate_branch_key IS NOT NULL AND rate_sheet_stt IS NOT NULL;

CREATE TABLE frontend_rate_season (
    season_key text PRIMARY KEY,
    display_label text NOT NULL,
    date_from date NOT NULL,
    date_to date NOT NULL,
    status rule_status NOT NULL DEFAULT 'ACTIVE',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT frontend_rate_season_key_check
        CHECK (season_key IN ('jul_sep', 'oct', 'nov_jan')),
    CONSTRAINT frontend_rate_season_dates_check CHECK (date_to >= date_from),
    CONSTRAINT frontend_rate_season_label_not_blank CHECK (length(btrim(display_label)) > 0)
);

-- The existing pricing engine remains canonical: each FE seasonal weekday or
-- weekend amount is represented by a ROOM_TYPE rate_rule, so quotes can resolve
-- it without maintaining a second pricing store. Date ranges live on rate_rule
-- and are editable by the existing rate-management workflow.
ALTER TABLE rate_rule
    ADD COLUMN frontend_season_key text,
    ADD COLUMN frontend_day_group text,
    ADD CONSTRAINT rate_rule_frontend_season_key
        CHECK (frontend_season_key IS NULL OR frontend_season_key IN ('jul_sep', 'oct', 'nov_jan')),
    ADD CONSTRAINT rate_rule_frontend_day_group
        CHECK (frontend_day_group IS NULL OR frontend_day_group IN ('WEEKDAY', 'WEEKEND')),
    ADD CONSTRAINT rate_rule_frontend_pair
        CHECK ((frontend_season_key IS NULL AND frontend_day_group IS NULL)
            OR (frontend_season_key IS NOT NULL AND frontend_day_group IS NOT NULL
                AND scope = 'ROOM_TYPE' AND room_type_id IS NOT NULL));

CREATE UNIQUE INDEX rate_rule_frontend_season_group_uk
    ON rate_rule (room_type_id, frontend_season_key, frontend_day_group)
    WHERE frontend_season_key IS NOT NULL;

ALTER TABLE rate_rule
    ADD CONSTRAINT rate_rule_frontend_season_fk
        FOREIGN KEY (frontend_season_key) REFERENCES frontend_rate_season (season_key)
        ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE FUNCTION kas_sync_frontend_rate_rule_dates()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.frontend_season_key IS NOT NULL THEN
        SELECT s.date_from, s.date_to INTO NEW.date_from, NEW.date_to
          FROM frontend_rate_season s WHERE s.season_key = NEW.frontend_season_key;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Unknown Frontend rate season: %', NEW.frontend_season_key;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER rate_rule_frontend_dates_sync_trg
    BEFORE INSERT OR UPDATE OF frontend_season_key, date_from, date_to ON rate_rule
    FOR EACH ROW EXECUTE FUNCTION kas_sync_frontend_rate_rule_dates();

CREATE FUNCTION kas_refresh_frontend_rate_season_rules()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE rate_rule SET frontend_season_key = NEW.season_key
     WHERE frontend_season_key = NEW.season_key;
    RETURN NEW;
END;
$$;

CREATE TRIGGER frontend_rate_season_rules_refresh_trg
    AFTER UPDATE OF date_from, date_to ON frontend_rate_season
    FOR EACH ROW EXECUTE FUNCTION kas_refresh_frontend_rate_season_rules();

CREATE TABLE property_collection_media (
    property_id uuid PRIMARY KEY REFERENCES property (id) ON DELETE CASCADE,
    media_asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app_user (id) ON DELETE SET NULL
);

ALTER TABLE media_asset
    ALTER COLUMN storage_key DROP NOT NULL,
    ADD COLUMN external_url text,
    ADD CONSTRAINT media_asset_exactly_one_source
        CHECK ((storage_key IS NOT NULL) <> (external_url IS NOT NULL)),
    ADD CONSTRAINT media_asset_external_https
        CHECK (external_url IS NULL OR external_url ~ '^https://[^[:space:]]+$');

CREATE UNIQUE INDEX media_asset_external_url_uk
    ON media_asset (external_url) WHERE external_url IS NOT NULL;

COMMENT ON COLUMN media_asset.external_url IS
    'Optional HTTPS source URL for externally hosted imagery. Exactly one of storage_key or external_url is required.';

CREATE TABLE site_image_slot (
    slot_key text PRIMARY KEY,
    group_key text NOT NULL,
    label text NOT NULL,
    selector text NOT NULL,
    default_reference text NOT NULL DEFAULT '',
    media_asset_id uuid REFERENCES media_asset (id) ON DELETE RESTRICT,
    is_enabled boolean NOT NULL DEFAULT true,
    sort_order int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT site_image_slot_key_format CHECK (slot_key ~ '^[a-z][A-Za-z0-9._-]*$'),
    CONSTRAINT site_image_slot_group_format CHECK (group_key ~ '^[a-zA-Z][a-zA-Z0-9_-]*$'),
    CONSTRAINT site_image_slot_label_not_blank CHECK (length(btrim(label)) > 0),
    CONSTRAINT site_image_slot_selector_not_blank CHECK (length(btrim(selector)) > 0)
);

CREATE INDEX site_image_slot_group_idx ON site_image_slot (group_key, sort_order);

-- Provenance and editability: seed operator rate-sheet rows only. Demo fallback
-- prices in the FE are intentionally excluded. Mapping confidence is retained
-- for admin review while the Frontend's mapped operator prices are imported.
COMMENT ON COLUMN room_type.rate_mapping_confidence IS
    'Copied from the FE rate map for admin review; imported prices stay on the mapped operator rate-sheet row.';
CREATE INDEX reservation_document_reservation_idx ON reservation_document (reservation_id, created_at DESC);

CREATE FUNCTION kas_reservation_document_asset_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    asset_visibility media_visibility;
    asset_category media_category;
BEGIN
    IF NEW.status = 'ISSUED' THEN
        SELECT visibility, category
          INTO asset_visibility, asset_category
          FROM media_asset
         WHERE id = NEW.media_asset_id;
        IF NOT FOUND OR asset_visibility <> 'INTERNAL' OR asset_category <> 'DOCUMENT' THEN
            RAISE EXCEPTION 'Issued reservation documents require an INTERNAL DOCUMENT media asset';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER reservation_document_internal_asset_guard_trg
    BEFORE INSERT OR UPDATE ON reservation_document
    FOR EACH ROW EXECUTE FUNCTION kas_reservation_document_asset_guard();

COMMENT ON TABLE reservation_document IS
    'Protected issued documents associated with a reservation. Download must be authorized and must not expose internal storage keys.';
COMMENT ON TABLE reservation_email_action_token IS
    'Single-use hashed email action link. Link opening is read-only; confirmation is a separate authenticated action.';

-- =============================================================================
-- END V33
-- =============================================================================


-- Frontend-derived catalog snapshot; operator season sheet generated 2026-07-01, 2026-10-01, 2026-11-01.
-- Source files: Kas_Web_Fronend/js/data.js, js/rates.js, data/rate-sheet.json, site-image-slots.json.
-- Trip.com aggregate snapshots are seeded with the current Frontend values;
-- hotel 01 uses its matched Trip.com listing. Scores and counts are editable.
INSERT INTO frontend_rate_season (season_key, display_label, date_from, date_to, status) VALUES
    ('jul_sep', 'Jul – Sep', DATE '2026-07-01', DATE '2026-09-30', 'ACTIVE'),
    ('oct', 'October', DATE '2026-10-01', DATE '2026-10-31', 'ACTIVE'),
    ('nov_jan', 'Nov – Dec – Jan 2027', DATE '2026-11-01', DATE '2027-01-31', 'ACTIVE')
ON CONFLICT (season_key) DO UPDATE SET display_label=EXCLUDED.display_label, date_from=EXCLUDED.date_from, date_to=EXCLUDED.date_to, status=EXCLUDED.status;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-01', frontend_branch_code='01', address_line='05 Truong Dinh', ward='Ben Thanh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=3, total_rooms=NULL, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/our-properties/kas-passion-boutique-hotel', legacy_names=ARRAY['Cabana Hotel Saigon', 'Kas Passion Boutique Hotel']::text[], quick_search_tags=ARRAY['district1', 'ben-thanh', 'boutique', 'breakfast', 'staycation', 'ben-thanh-market', 'walkable', 'food', 'central']::text[], trip_com_rating=8.1, trip_com_review_count=128, trip_com_source_url='https://ca.trip.com/hotels/ho-chi-minh-city-hotel-detail-135237286/kas-passion-boutique-hotel/', trip_com_observed_on=DATE '2026-10-15' WHERE slug='kas-passion-boutique-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Passion Boutique Hotel', 'Boutique calm, one block from Ben Thanh.', 'Boutique calm, one block from Ben Thanh.', 'A boutique address in the heart of District 1, minutes from Ben Thanh Market. KAS Passion blends a quiet, relaxing atmosphere with modern, generously sized rooms — a comfortable retreat for travellers who want the centre of Saigon on their doorstep.', 'A boutique address in the heart of District 1, minutes from Ben Thanh Market. KAS Passion blends a quiet, relaxing atmosphere with modern, generously sized rooms — a comfortable retreat for travellers who want the centre of Saigon on their doorstep.' FROM property WHERE slug='kas-passion-boutique-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Passion Boutique Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-passion-boutique-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-02', frontend_branch_code='02', address_line='260 Ly Tu Trong', ward='Ben Thanh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=3, total_rooms=22, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/our-properties/kas-premium-boutique-hotel', legacy_names=ARRAY['Pravina Hotel', 'KAS Premium Saigon', 'KAS Elegance Hotel']::text[], quick_search_tags=ARRAY['district1', 'ben-thanh', 'boutique', 'rooftop', 'breakfast', 'walkable', 'food', 'central']::text[], trip_com_rating=8.6, trip_com_review_count=91, trip_com_source_url='https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-2603403/cabana-hotel-saigon/', trip_com_observed_on=NULL WHERE slug='kas-elegance-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Premium Boutique Hotel', 'Ly Tu Trong elegance, steps from the opera quarter.', 'Ly Tu Trong elegance, steps from the opera quarter.', 'Set in the heart of District 1, a few minutes on foot from the city''s most iconic addresses. KAS Premium offers a broad range of rooms suited to couples, families and groups, with continental breakfast served daily and a rooftop bar above the street.', 'Set in the heart of District 1, a few minutes on foot from the city''s most iconic addresses. KAS Premium offers a broad range of rooms suited to couples, families and groups, with continental breakfast served daily and a rooftop bar above the street.' FROM property WHERE slug='kas-elegance-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Premium Boutique Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-elegance-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-03', frontend_branch_code='03', address_line='47A Nguyen Trai', ward='Ben Thanh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=3, total_rooms=NULL, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/our-properties/kas-ancient-luxury-hotel', legacy_names=ARRAY['Song Anh 1 Hotel', 'KAS Ancient Boutique Hotel', 'KAS Nguyen Trai Hotel']::text[], quick_search_tags=ARRAY['district1', 'ben-thanh', 'nguyen-trai', 'boutique', 'rooftop', 'breakfast', 'staycation', 'walkable', 'food', 'central']::text[], trip_com_rating=8.1, trip_com_review_count=109, trip_com_source_url='https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-100937358/kas-ancient-luxury-hotel/', trip_com_observed_on=NULL WHERE slug='kas-ancient-boutique-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Ancient Luxury Hotel', 'A rooftop bar above Nguyen Trai.', 'A rooftop bar above Nguyen Trai.', 'A recently renovated boutique address on Nguyen Trai, with a rooftop bar, a ground-floor café and a prime walkable position in District 1. Rooms run from compact city bolt-holes to a 42 m² family layout.', 'A recently renovated boutique address on Nguyen Trai, with a rooftop bar, a ground-floor café and a prime walkable position in District 1. Rooms run from compact city bolt-holes to a 42 m² family layout.' FROM property WHERE slug='kas-ancient-boutique-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Ancient Luxury Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-ancient-boutique-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-04', frontend_branch_code='04', address_line='170–174 Nguyen Thai Binh', ward='Nguyen Thai Binh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=4, total_rooms=41, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/home', legacy_names=ARRAY['The KAS Hotel Saigon', 'KAS Milestone Luxury Hotel']::text[], quick_search_tags=ARRAY['district1', 'nguyen-thai-binh', 'rooftop', 'balcony', 'breakfast', 'central', 'food']::text[], trip_com_rating=8.5, trip_com_review_count=95, trip_com_source_url='https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266341/kas-milestone-premium-hotel/', trip_com_observed_on=NULL WHERE slug='kas-milestone-premium-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Milestone Premium Hotel', 'The flagship. Rooftop bar, gym, and a 50 m² suite.', 'The flagship. Rooftop bar, gym, and a 50 m² suite.', 'The collection''s flagship: a four-star house opened in 2023 with 41 rooms, a rooftop bar over District 1, a fitness centre, an all-day restaurant serving Vietnamese and international menus, and a breakfast guests write home about.', 'The collection''s flagship: a four-star house opened in 2023 with 41 rooms, a rooftop bar over District 1, a fitness centre, an all-day restaurant serving Vietnamese and international menus, and a breakfast guests write home about.' FROM property WHERE slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Milestone Premium Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-05', frontend_branch_code='05', address_line='278 Le Thanh Ton', ward='Ben Thanh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=3, total_rooms=NULL, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/our-properties/kas-zody-boutique-hotel', legacy_names=ARRAY['Tuyet Lan Corner', 'KAS Zody Boutique Hotel']::text[], quick_search_tags=ARRAY['district1', 'ben-thanh', 'le-thanh-ton', 'boutique', 'spa', 'breakfast', 'walkable', 'food', 'central']::text[], trip_com_rating=8.8, trip_com_review_count=86, trip_com_source_url='https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-119255177/kas-zody-boutique-hotel/', trip_com_observed_on=NULL WHERE slug='kas-zody-boutique-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Zody Boutique Hotel', 'Quiet rooms on Le Thanh Ton.', 'Quiet rooms on Le Thanh Ton.', 'Nestled in the heart of the city on Le Thanh Ton, with convenience stores, restaurants and cafés a short walk in every direction. Guests single out how quiet the rooms are — a rare thing this close to the centre.', 'Nestled in the heart of the city on Le Thanh Ton, with convenience stores, restaurants and cafés a short walk in every direction. Guests single out how quiet the rooms are — a rare thing this close to the centre.' FROM property WHERE slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Zody Boutique Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-06', frontend_branch_code='06', address_line='40–42 Bui Thi Xuan', ward='Ben Thanh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=3, total_rooms=NULL, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/our-properties/kas-sonata-luxury-hotel', legacy_names=ARRAY['Tuong Vy Hotel', 'Kas Sonata Luxury Hotel']::text[], quick_search_tags=ARRAY['district1', 'ben-thanh', 'bui-thi-xuan', 'breakfast', 'food', 'central']::text[], trip_com_rating=9.1, trip_com_review_count=81, trip_com_source_url='https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266420/kas-sonata-luxury-hotel/', trip_com_observed_on=NULL WHERE slug='kas-sonata-luxury-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Sonata Luxury Hotel', 'Thai kitchen downstairs, the comfiest bed in Vietnam upstairs.', 'Thai kitchen downstairs, the comfiest bed in Vietnam upstairs.', 'Opened in 2022 on Bui Thi Xuan, with an in-house Thai restaurant, free luggage storage and a room mix that runs from a 15 m² city single up to a 45 m² family suite. Guests repeatedly call the beds the most comfortable of their trip.', 'Opened in 2022 on Bui Thi Xuan, with an in-house Thai restaurant, free luggage storage and a room mix that runs from a 15 m² city single up to a 45 m² family suite. Guests repeatedly call the beds the most comfortable of their trip.' FROM property WHERE slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Sonata Luxury Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-07', frontend_branch_code='07', address_line='13 Bui Thi Xuan', ward='Ben Thanh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=3, total_rooms=NULL, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/our-properties/kas-eliana-luxury-hotel', legacy_names=ARRAY['Apec Hotel', 'KAS Luxury Saigon', 'KAS Eliana Luxury Hotel']::text[], quick_search_tags=ARRAY['district1', 'ben-thanh', 'bui-thi-xuan', 'spa', 'balcony', 'breakfast', 'staycation', 'ben-thanh-market', 'walkable', 'central']::text[], trip_com_rating=8.7, trip_com_review_count=96, trip_com_source_url='https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266582/kas-eliana-luxury-hotel/', trip_com_observed_on=NULL WHERE slug='kas-eliana-luxury-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Eliana Luxury Hotel', 'Balconies over Bui Thi Xuan.', 'Balconies over Bui Thi Xuan.', 'A romantic, newly renovated address in the heart of District 1 — modern design, balconies in selected rooms, and a 45 m² Premium Suite. Ben Thanh Market, Independence Palace and Pham Ngu Lao are all within a few minutes'' walk.', 'A romantic, newly renovated address in the heart of District 1 — modern design, balconies in selected rooms, and a 45 m² Premium Suite. Ben Thanh Market, Independence Palace and Pham Ngu Lao are all within a few minutes'' walk.' FROM property WHERE slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Eliana Luxury Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
UPDATE property SET lifecycle_state='OPEN', published_at=COALESCE(published_at, now()), frontend_key='hotel-08', frontend_branch_code='08', address_line='191 Le Thanh Ton', ward='Ben Thanh', district='District 1', city='Ho Chi Minh City', country='VN', star_rating=3, total_rooms=40, check_in_time=TIME '14:00', check_out_time=TIME '12:00', official_url='https://www.kashotelpremium.com/our-properties/kas-dilly-luxury-hotel', legacy_names=ARRAY['KAS Mays Saigon', 'Kas Dilly Hotel', 'KAS Dilly Hotel & Spa']::text[], quick_search_tags=ARRAY['district1', 'ben-thanh', 'le-thanh-ton', 'spa', 'balcony', 'breakfast', 'staycation', 'ben-thanh-market', 'walkable', 'central']::text[], trip_com_rating=9.2, trip_com_review_count=67, trip_com_source_url='https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266918/kas-dilly-luxury-hotel/', trip_com_observed_on=NULL WHERE slug='kas-dilly-hotel';
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'en', 'KAS Dilly Luxury Hotel', 'Forty rooms and a spa, a block from Ben Thanh.', 'Forty rooms and a spa, a block from Ben Thanh.', 'Elegant yet warm, renovated through 2025, with 40 rooms, a spa, express check-in and a position a single block from Ben Thanh Market. The Premium King adds a 37 m² footprint and a private balcony.', 'Elegant yet warm, renovated through 2025, with 40 rooms, a spa, express check-in and a position a single block from Ben Thanh Market. The Premium King adds a 37 m² footprint and a private balcony.' FROM property WHERE slug='kas-dilly-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO property_translation (property_id, locale, name, tagline, short_description, source_description, introduction) SELECT id, 'vi', 'KAS Dilly Luxury Hotel', NULL, NULL, NULL, NULL FROM property WHERE slug='kas-dilly-hotel' ON CONFLICT (property_id, locale) DO UPDATE SET name=EXCLUDED.name, tagline=EXCLUDED.tagline, short_description=EXCLUDED.short_description, source_description=EXCLUDED.source_description, introduction=EXCLUDED.introduction;
INSERT INTO amenity (code, category) VALUES
    ('free-high-speed-wi-fi', 'CONNECTIVITY'),
    ('24-hour-front-desk', 'SERVICES'),
    ('airport-transportation', 'SERVICES'),
    ('laundry-service', 'SERVICES'),
    ('non-smoking-hotel', 'COMFORT'),
    ('air-conditioning', 'COMFORT'),
    ('daily-housekeeping', 'SERVICES'),
    ('luggage-storage', 'SERVICES'),
    ('elevator', 'COMFORT'),
    ('rooftop-bar', 'FOOD_DRINK'),
    ('restaurant', 'FOOD_DRINK'),
    ('cafe', 'FOOD_DRINK'),
    ('airport-pick-up-drop-off', 'SERVICES'),
    ('dry-cleaning', 'SERVICES'),
    ('currency-exchange', 'SERVICES'),
    ('24-hour-security', 'SERVICES'),
    ('baggage-storage', 'SERVICES'),
    ('concierge', 'SERVICES'),
    ('fitness-centre-gym', 'SERVICES'),
    ('free-parking', 'SERVICES'),
    ('bar-lounge', 'FOOD_DRINK'),
    ('afternoon-tea', 'SERVICES'),
    ('spa', 'SERVICES'),
    ('non-smoking-property', 'COMFORT'),
    ('on-site-parking', 'SERVICES'),
    ('thai-restaurant', 'FOOD_DRINK'),
    ('free-luggage-storage', 'SERVICES'),
    ('breakfast-available', 'FOOD_DRINK'),
    ('balconies-in-selected-rooms', 'SERVICES'),
    ('express-check-in-check-out', 'SERVICES'),
    ('ironing-service', 'SERVICES'),
    ('cctv', 'SERVICES'),
    -- Room amenity vocabulary used by the legacy frontend baseline.
    ('wifi-free', 'CONNECTIVITY'),
    ('flat-screen-tv', 'MEDIA'),
    ('refrigerator', 'FOOD_DRINK'),
    ('kettle', 'FOOD_DRINK'),
    ('hairdryer', 'BATHROOM'),
    ('in-room-safe', 'COMFORT'),
    ('in-room-telephone', 'MEDIA'),
    ('private-bathroom', 'BATHROOM'),
    ('non-smoking-room', 'COMFORT'),
    ('rain-shower', 'BATHROOM'),
    ('bathtub', 'BATHROOM'),
    ('balcony', 'COMFORT')
ON CONFLICT (code) DO UPDATE SET category=EXCLUDED.category;
INSERT INTO amenity_translation (amenity_id, locale, name) SELECT a.id, 'en', s.name FROM amenity a JOIN (VALUES
    ('free-high-speed-wi-fi', 'Free high-speed Wi-Fi'),
    ('24-hour-front-desk', '24-hour front desk'),
    ('airport-transportation', 'Airport transportation'),
    ('laundry-service', 'Laundry service'),
    ('non-smoking-hotel', 'Non-smoking hotel'),
    ('air-conditioning', 'Air conditioning'),
    ('daily-housekeeping', 'Daily housekeeping'),
    ('luggage-storage', 'Luggage storage'),
    ('elevator', 'Elevator'),
    ('rooftop-bar', 'Rooftop bar'),
    ('restaurant', 'Restaurant'),
    ('cafe', 'Cafe'),
    ('airport-pick-up-drop-off', 'Airport pick-up / drop-off'),
    ('dry-cleaning', 'Dry cleaning'),
    ('currency-exchange', 'Currency exchange'),
    ('24-hour-security', '24-hour security'),
    ('baggage-storage', 'Baggage storage'),
    ('concierge', 'Concierge'),
    ('fitness-centre-gym', 'Fitness centre / gym'),
    ('free-parking', 'Free parking'),
    ('bar-lounge', 'Bar & lounge'),
    ('afternoon-tea', 'Afternoon tea'),
    ('spa', 'Spa'),
    ('non-smoking-property', 'Non-smoking property'),
    ('on-site-parking', 'On-site parking'),
    ('thai-restaurant', 'Thai restaurant'),
    ('free-luggage-storage', 'Free luggage storage'),
    ('breakfast-available', 'Breakfast available'),
    ('balconies-in-selected-rooms', 'Balconies in selected rooms'),
    ('express-check-in-check-out', 'Express check-in / check-out'),
    ('ironing-service', 'Ironing service'),
    ('cctv', 'CCTV'),
    ('wifi-free', 'Free Wi-Fi'),
    ('flat-screen-tv', 'Flat-screen TV'),
    ('refrigerator', 'Mini fridge'),
    ('kettle', 'Electric kettle'),
    ('hairdryer', 'Hair dryer'),
    ('in-room-safe', 'Safe box'),
    ('in-room-telephone', 'In-room telephone'),
    ('private-bathroom', 'Private bathroom'),
    ('non-smoking-room', 'Non-smoking'),
    ('rain-shower', 'Rain shower'),
    ('bathtub', 'Bathtub'),
    ('balcony', 'Private balcony')
) AS s(code,name) USING (code) ON CONFLICT (amenity_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO amenity_translation (amenity_id, locale, name) SELECT a.id, 'vi', s.name FROM amenity a JOIN (VALUES
    ('free-high-speed-wi-fi', 'Wi-Fi tốc độ cao miễn phí'),
    ('24-hour-front-desk', 'Quầy lễ tân 24 giờ'),
    ('airport-transportation', 'Dịch vụ đưa đón sân bay'),
    ('laundry-service', 'Dịch vụ giặt ủi'),
    ('non-smoking-hotel', 'Khách sạn không hút thuốc'),
    ('air-conditioning', 'Máy điều hòa'),
    ('daily-housekeeping', 'Dọn phòng hằng ngày'),
    ('luggage-storage', 'Giữ hành lý'),
    ('elevator', 'Thang máy'),
    ('rooftop-bar', 'Quầy bar trên tầng thượng'),
    ('restaurant', 'Nhà hàng'),
    ('cafe', 'Quán cà phê'),
    ('airport-pick-up-drop-off', 'Đón và trả khách tại sân bay'),
    ('dry-cleaning', 'Giặt khô'),
    ('currency-exchange', 'Đổi ngoại tệ'),
    ('24-hour-security', 'An ninh 24 giờ'),
    ('baggage-storage', 'Giữ hành lý'),
    ('concierge', 'Dịch vụ hỗ trợ khách'),
    ('fitness-centre-gym', 'Trung tâm thể dục / phòng gym'),
    ('free-parking', 'Chỗ đỗ xe miễn phí'),
    ('bar-lounge', 'Quầy bar và lounge'),
    ('afternoon-tea', 'Trà chiều'),
    ('spa', 'Spa'),
    ('non-smoking-property', 'Khuôn viên không hút thuốc'),
    ('on-site-parking', 'Chỗ đỗ xe tại khách sạn'),
    ('thai-restaurant', 'Nhà hàng Thái'),
    ('free-luggage-storage', 'Giữ hành lý miễn phí'),
    ('breakfast-available', 'Có phục vụ bữa sáng'),
    ('balconies-in-selected-rooms', 'Ban công tại một số phòng'),
    ('express-check-in-check-out', 'Nhận phòng / trả phòng nhanh'),
    ('ironing-service', 'Dịch vụ ủi quần áo'),
    ('cctv', 'Camera giám sát CCTV'),
    ('wifi-free', 'Wi-Fi miễn phí'),
    ('flat-screen-tv', 'TV màn hình phẳng'),
    ('refrigerator', 'Tủ lạnh mini'),
    ('kettle', 'Ấm đun nước điện'),
    ('hairdryer', 'Máy sấy tóc'),
    ('in-room-safe', 'Két an toàn'),
    ('in-room-telephone', 'Điện thoại trong phòng'),
    ('private-bathroom', 'Phòng tắm riêng'),
    ('non-smoking-room', 'Phòng không hút thuốc'),
    ('rain-shower', 'Vòi sen mưa'),
    ('bathtub', 'Bồn tắm'),
    ('balcony', 'Ban công riêng')
) AS s(code,name) USING (code) ON CONFLICT (amenity_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO property_amenity (property_id, amenity_id, sort_order) SELECT p.id, a.id, x.sort_order FROM (VALUES
    ('kas-passion-boutique-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-passion-boutique-hotel', '24-hour-front-desk', 2),
    ('kas-passion-boutique-hotel', 'airport-transportation', 3),
    ('kas-passion-boutique-hotel', 'laundry-service', 4),
    ('kas-passion-boutique-hotel', 'non-smoking-hotel', 5),
    ('kas-passion-boutique-hotel', 'air-conditioning', 6),
    ('kas-passion-boutique-hotel', 'daily-housekeeping', 7),
    ('kas-passion-boutique-hotel', 'luggage-storage', 8),
    ('kas-passion-boutique-hotel', 'elevator', 9),
    ('kas-elegance-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-elegance-hotel', 'rooftop-bar', 2),
    ('kas-elegance-hotel', 'restaurant', 3),
    ('kas-elegance-hotel', 'cafe', 4),
    ('kas-elegance-hotel', '24-hour-front-desk', 5),
    ('kas-elegance-hotel', 'airport-pick-up-drop-off', 6),
    ('kas-elegance-hotel', 'laundry-service', 7),
    ('kas-elegance-hotel', 'dry-cleaning', 8),
    ('kas-elegance-hotel', 'currency-exchange', 9),
    ('kas-elegance-hotel', 'luggage-storage', 10),
    ('kas-elegance-hotel', 'elevator', 11),
    ('kas-elegance-hotel', '24-hour-security', 12),
    ('kas-ancient-boutique-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-ancient-boutique-hotel', 'rooftop-bar', 2),
    ('kas-ancient-boutique-hotel', 'restaurant', 3),
    ('kas-ancient-boutique-hotel', 'cafe', 4),
    ('kas-ancient-boutique-hotel', '24-hour-front-desk', 5),
    ('kas-ancient-boutique-hotel', 'airport-transportation', 6),
    ('kas-ancient-boutique-hotel', 'baggage-storage', 7),
    ('kas-ancient-boutique-hotel', 'laundry-service', 8),
    ('kas-ancient-boutique-hotel', 'non-smoking-hotel', 9),
    ('kas-ancient-boutique-hotel', 'concierge', 10),
    ('kas-milestone-premium-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-milestone-premium-hotel', 'rooftop-bar', 2),
    ('kas-milestone-premium-hotel', 'fitness-centre-gym', 3),
    ('kas-milestone-premium-hotel', 'restaurant', 4),
    ('kas-milestone-premium-hotel', 'cafe', 5),
    ('kas-milestone-premium-hotel', 'free-parking', 6),
    ('kas-milestone-premium-hotel', 'airport-pick-up-drop-off', 7),
    ('kas-milestone-premium-hotel', '24-hour-front-desk', 8),
    ('kas-milestone-premium-hotel', 'concierge', 9),
    ('kas-milestone-premium-hotel', 'luggage-storage', 10),
    ('kas-milestone-premium-hotel', 'laundry-service', 11),
    ('kas-milestone-premium-hotel', 'bar-lounge', 12),
    ('kas-milestone-premium-hotel', 'afternoon-tea', 13),
    ('kas-zody-boutique-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-zody-boutique-hotel', 'spa', 2),
    ('kas-zody-boutique-hotel', '24-hour-front-desk', 3),
    ('kas-zody-boutique-hotel', 'airport-transportation', 4),
    ('kas-zody-boutique-hotel', 'laundry-service', 5),
    ('kas-zody-boutique-hotel', 'non-smoking-property', 6),
    ('kas-zody-boutique-hotel', 'elevator', 7),
    ('kas-zody-boutique-hotel', 'daily-housekeeping', 8),
    ('kas-zody-boutique-hotel', 'on-site-parking', 9),
    ('kas-sonata-luxury-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-sonata-luxury-hotel', 'thai-restaurant', 2),
    ('kas-sonata-luxury-hotel', '24-hour-front-desk', 3),
    ('kas-sonata-luxury-hotel', 'airport-transportation', 4),
    ('kas-sonata-luxury-hotel', 'currency-exchange', 5),
    ('kas-sonata-luxury-hotel', 'free-luggage-storage', 6),
    ('kas-sonata-luxury-hotel', 'dry-cleaning', 7),
    ('kas-sonata-luxury-hotel', 'non-smoking-hotel', 8),
    ('kas-sonata-luxury-hotel', 'elevator', 9),
    ('kas-sonata-luxury-hotel', 'daily-housekeeping', 10),
    ('kas-eliana-luxury-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-eliana-luxury-hotel', 'spa', 2),
    ('kas-eliana-luxury-hotel', 'breakfast-available', 3),
    ('kas-eliana-luxury-hotel', 'airport-transportation', 4),
    ('kas-eliana-luxury-hotel', '24-hour-front-desk', 5),
    ('kas-eliana-luxury-hotel', 'currency-exchange', 6),
    ('kas-eliana-luxury-hotel', 'luggage-storage', 7),
    ('kas-eliana-luxury-hotel', 'dry-cleaning', 8),
    ('kas-eliana-luxury-hotel', 'laundry-service', 9),
    ('kas-eliana-luxury-hotel', 'non-smoking-property', 10),
    ('kas-eliana-luxury-hotel', 'balconies-in-selected-rooms', 11),
    ('kas-dilly-hotel', 'free-high-speed-wi-fi', 1),
    ('kas-dilly-hotel', 'spa', 2),
    ('kas-dilly-hotel', 'express-check-in-check-out', 3),
    ('kas-dilly-hotel', 'concierge', 4),
    ('kas-dilly-hotel', '24-hour-front-desk', 5),
    ('kas-dilly-hotel', 'airport-transportation', 6),
    ('kas-dilly-hotel', 'baggage-storage', 7),
    ('kas-dilly-hotel', 'laundry-service', 8),
    ('kas-dilly-hotel', 'ironing-service', 9),
    ('kas-dilly-hotel', 'elevator', 10),
    ('kas-dilly-hotel', 'cctv', 11),
    ('kas-dilly-hotel', 'non-smoking-hotel', 12),
    ('kas-dilly-hotel', 'balconies-in-selected-rooms', 13)
) AS x(property_slug, amenity_code, sort_order) JOIN property p ON p.slug=x.property_slug JOIN amenity a ON a.code=x.amenity_code ON CONFLICT (property_id, amenity_id) DO UPDATE SET sort_order=EXCLUDED.sort_order;
-- Room rows include catalog entries appended from the operator sheet; no DEMO prices are copied.
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'standard-double-room-no-window', 'PUBLISHED', 17, 2, 0, 2, NULL, NULL, 'VND', 1, 'h01-r1', 'hotel-01', 1, 'HIGH', '1 Double bed', 'No window', false FROM property p WHERE p.slug='kas-passion-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h01-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h01-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-queen-room-with-window', 'PUBLISHED', 15, 2, 0, 2, NULL, NULL, 'VND', 2, 'h01-r2', 'hotel-01', 2, 'HIGH', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-passion-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Queen Room with Window' FROM room_type WHERE frontend_key='h01-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Queen Room with Window' FROM room_type WHERE frontend_key='h01-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'family-room-with-city-view', 'PUBLISHED', 35, 4, 2, 4, 'CITY'::view_type, NULL, 'VND', 3, 'h01-r3', 'hotel-01', 3, 'EXACT', '2 Small double beds', 'City view', false FROM property p WHERE p.slug='kas-passion-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Family Room with City View' FROM room_type WHERE frontend_key='h01-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Family Room with City View' FROM room_type WHERE frontend_key='h01-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'standard-double-room-no-window', 'PUBLISHED', 15, 2, 0, 2, NULL, NULL, 'VND', 1, 'h02-r1', 'hotel-02', 1, 'EXACT', '1 Double bed', 'No window', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h02-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h02-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-double-room-small-window', 'PUBLISHED', 15, 2, 0, 2, NULL, NULL, 'VND', 2, 'h02-r2', 'hotel-02', 2, 'EXACT', '1 Double bed', 'Not published', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Double Room Small Window' FROM room_type WHERE frontend_key='h02-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Double Room Small Window' FROM room_type WHERE frontend_key='h02-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-king-room-with-window', 'PUBLISHED', 20, 2, 1, 2, NULL, NULL, 'VND', 3, 'h02-r3', 'hotel-02', 3, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe King Room with Window' FROM room_type WHERE frontend_key='h02-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe King Room with Window' FROM room_type WHERE frontend_key='h02-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-twin-room-with-window', 'PUBLISHED', 20, 2, 1, 2, NULL, NULL, 'VND', 4, 'h02-r4', 'hotel-02', 5, 'EXACT', '2 Single beds or 1 King bed', 'Not published', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Twin Room with Window' FROM room_type WHERE frontend_key='h02-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Twin Room with Window' FROM room_type WHERE frontend_key='h02-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-king-room-with-city-view', 'PUBLISHED', 22, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 5, 'h02-r5', 'hotel-02', 4, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium King Room with City View' FROM room_type WHERE frontend_key='h02-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium King Room with City View' FROM room_type WHERE frontend_key='h02-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-twin-room-with-city-view', 'PUBLISHED', 22, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 6, 'h02-r6', 'hotel-02', 6, 'EXACT', '2 Single beds or 1 King bed', 'City view', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium Twin Room with City View' FROM room_type WHERE frontend_key='h02-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium Twin Room with City View' FROM room_type WHERE frontend_key='h02-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'family-room-with-city-view', 'PUBLISHED', 27, 4, 2, 4, 'CITY'::view_type, NULL, 'VND', 7, 'h02-r7', 'hotel-02', 7, 'EXACT', '1 Small double bed and 1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Family Room with City View' FROM room_type WHERE frontend_key='h02-r7' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Family Room with City View' FROM room_type WHERE frontend_key='h02-r7' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-family-room-with-city-view', 'PUBLISHED', 45, 4, 2, 4, 'CITY'::view_type, NULL, 'VND', 8, 'h02-r8', 'hotel-02', 8, 'EXACT', '2 Queen beds', 'City view', false FROM property p WHERE p.slug='kas-elegance-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Family Room with City View' FROM room_type WHERE frontend_key='h02-r8' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Family Room with City View' FROM room_type WHERE frontend_key='h02-r8' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'standard-double-room-no-window', 'PUBLISHED', 14, 2, 0, 2, NULL, NULL, 'VND', 1, 'h03-r1', 'hotel-03', 1, 'EXACT', '1 Small double bed', 'No window', false FROM property p WHERE p.slug='kas-ancient-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h03-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h03-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-queen-room-with-city-view', 'PUBLISHED', 20, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 2, 'h03-r2', 'hotel-03', 2, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-ancient-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Queen Room with City View' FROM room_type WHERE frontend_key='h03-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Queen Room with City View' FROM room_type WHERE frontend_key='h03-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-king-room-with-window', 'PUBLISHED', 25, 2, 1, 2, NULL, NULL, 'VND', 3, 'h03-r3', 'hotel-03', 3, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-ancient-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe King Room with Window' FROM room_type WHERE frontend_key='h03-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe King Room with Window' FROM room_type WHERE frontend_key='h03-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-family-room-with-city-view', 'PUBLISHED', 42, 4, 2, 4, 'CITY'::view_type, NULL, 'VND', 4, 'h03-r4', 'hotel-03', 4, 'EXACT', '2 Queen beds', 'City view', false FROM property p WHERE p.slug='kas-ancient-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Family Room with City View' FROM room_type WHERE frontend_key='h03-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Family Room with City View' FROM room_type WHERE frontend_key='h03-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room-with-window', 'PUBLISHED', 21, 2, 1, 2, NULL, NULL, 'VND', 1, 'h04-r1', 'hotel-04', 2, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room with Window' FROM room_type WHERE frontend_key='h04-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room with Window' FROM room_type WHERE frontend_key='h04-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-queen-room-with-balcony-city-view', 'PUBLISHED', 26, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 2, 'h04-r2', 'hotel-04', 5, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium Queen Room with Balcony & City View' FROM room_type WHERE frontend_key='h04-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium Queen Room with Balcony & City View' FROM room_type WHERE frontend_key='h04-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-twin-room-with-window', 'PUBLISHED', 29, 2, 1, 2, NULL, NULL, 'VND', 3, 'h04-r3', 'hotel-04', 4, 'EXACT', '2 Single beds or 1 King bed', 'Not published', false FROM property p WHERE p.slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium Twin Room with Window' FROM room_type WHERE frontend_key='h04-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium Twin Room with Window' FROM room_type WHERE frontend_key='h04-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'junior-suite-with-balcony-city-view', 'PUBLISHED', 50, 2, 2, 2, 'CITY'::view_type, NULL, 'VND', 4, 'h04-r4', 'hotel-04', 6, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Junior Suite with Balcony & City View' FROM room_type WHERE frontend_key='h04-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Junior Suite with Balcony & City View' FROM room_type WHERE frontend_key='h04-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-queen-room-no-window', 'PUBLISHED', 18, 2, 0, 2, NULL, NULL, 'VND', 5, 'h04-r5', 'hotel-04', 1, 'EXACT', '1 Queen bed', 'No window', false FROM property p WHERE p.slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Queen Room No Window' FROM room_type WHERE frontend_key='h04-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Queen Room No Window' FROM room_type WHERE frontend_key='h04-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room-with-city-view', 'PUBLISHED', 23, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 6, 'h04-r6', 'hotel-04', 3, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-milestone-premium-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h04-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h04-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'standard-double-room', 'PUBLISHED', NULL, 2, 0, 2, NULL, NULL, 'VND', 1, 'h05-r1', 'hotel-05', 1, 'EXACT', '1 Double bed', 'Not published', false FROM property p WHERE p.slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Standard Double Room' FROM room_type WHERE frontend_key='h05-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Standard Double Room' FROM room_type WHERE frontend_key='h05-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-double-room', 'PUBLISHED', NULL, 2, 0, 2, NULL, NULL, 'VND', 2, 'h05-r2', 'hotel-05', 2, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Double Room' FROM room_type WHERE frontend_key='h05-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Double Room' FROM room_type WHERE frontend_key='h05-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'double-or-twin-room', 'PUBLISHED', NULL, 2, 1, 2, NULL, NULL, 'VND', 3, 'h05-r3', 'hotel-05', 3, 'EXACT', '2 Single beds or 1 King bed', 'Not published', false FROM property p WHERE p.slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Double Or Twin Room' FROM room_type WHERE frontend_key='h05-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Double Or Twin Room' FROM room_type WHERE frontend_key='h05-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room', 'PUBLISHED', NULL, 2, 1, 2, NULL, NULL, 'VND', 4, 'h05-r4', 'hotel-05', 4, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room' FROM room_type WHERE frontend_key='h05-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room' FROM room_type WHERE frontend_key='h05-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'studio', 'PUBLISHED', NULL, 2, 1, 2, NULL, NULL, 'VND', 5, 'h05-r5', 'hotel-05', 5, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Studio' FROM room_type WHERE frontend_key='h05-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Studio' FROM room_type WHERE frontend_key='h05-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'queen-suite-non-smoking', 'PUBLISHED', NULL, 2, 2, 2, NULL, NULL, 'VND', 6, 'h05-r6', 'hotel-05', 6, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-zody-boutique-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Queen Suite-Non-Smoking' FROM room_type WHERE frontend_key='h05-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Queen Suite-Non-Smoking' FROM room_type WHERE frontend_key='h05-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'standard-double-room-no-window', 'PUBLISHED', 15, 2, 0, 2, NULL, NULL, 'VND', 1, 'h06-r1', 'hotel-06', 1, 'HIGH', '1 Queen bed', 'No window', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h06-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h06-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-double-room-with-window', 'PUBLISHED', 20, 2, 1, 2, NULL, NULL, 'VND', 2, 'h06-r2', 'hotel-06', 3, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Double Room with Window' FROM room_type WHERE frontend_key='h06-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Double Room with Window' FROM room_type WHERE frontend_key='h06-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-twin-room-with-window', 'PUBLISHED', 26, 2, 1, 2, NULL, NULL, 'VND', 3, 'h06-r3', 'hotel-06', 6, 'EXACT', '2 Small double beds or 1 King bed', 'Not published', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Twin Room with Window' FROM room_type WHERE frontend_key='h06-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Twin Room with Window' FROM room_type WHERE frontend_key='h06-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room-with-balcony-city-view', 'PUBLISHED', NULL, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 4, 'h06-r4', 'hotel-06', 5, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room with Balcony & City View' FROM room_type WHERE frontend_key='h06-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room with Balcony & City View' FROM room_type WHERE frontend_key='h06-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-king-room-with-city-view', 'PUBLISHED', 30, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 5, 'h06-r5', 'hotel-06', 7, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium King Room with City View' FROM room_type WHERE frontend_key='h06-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium King Room with City View' FROM room_type WHERE frontend_key='h06-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-family-room-with-city-view', 'PUBLISHED', 45, 4, 2, 4, 'CITY'::view_type, NULL, 'VND', 6, 'h06-r6', 'hotel-06', 9, 'EXACT', '2 Queen beds', 'City view', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Family Room with City View' FROM room_type WHERE frontend_key='h06-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Family Room with City View' FROM room_type WHERE frontend_key='h06-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-double-room-with-window', 'PUBLISHED', 16, 2, 0, 2, NULL, NULL, 'VND', 7, 'h06-r7', 'hotel-06', 2, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Double Room with Window' FROM room_type WHERE frontend_key='h06-r7' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Double Room with Window' FROM room_type WHERE frontend_key='h06-r7' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room-with-city-view', 'PUBLISHED', 21, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 8, 'h06-r8', 'hotel-06', 4, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h06-r8' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h06-r8' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-twin-room-with-window', 'PUBLISHED', 29, 2, 1, 2, NULL, NULL, 'VND', 9, 'h06-r9', 'hotel-06', 8, 'EXACT', '2 Single beds or 1 King bed', 'Not published', false FROM property p WHERE p.slug='kas-sonata-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium Twin Room with Window' FROM room_type WHERE frontend_key='h06-r9' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium Twin Room with Window' FROM room_type WHERE frontend_key='h06-r9' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'standard-double-room-no-window', 'PUBLISHED', 14, 2, 0, 2, NULL, NULL, 'VND', 1, 'h07-r1', 'hotel-07', 1, 'EXACT', '1 Queen bed', 'No window', false FROM property p WHERE p.slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h07-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h07-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room-with-city-view', 'PUBLISHED', 23, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 2, 'h07-r2', 'hotel-07', 3, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h07-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h07-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-king-room-with-city-view', 'PUBLISHED', 32, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 3, 'h07-r3', 'hotel-07', 5, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium King Room with City View' FROM room_type WHERE frontend_key='h07-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium King Room with City View' FROM room_type WHERE frontend_key='h07-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-suite-room', 'PUBLISHED', 45, 2, 2, 2, NULL, NULL, 'VND', 4, 'h07-r4', 'hotel-07', 6, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium Suite Room' FROM room_type WHERE frontend_key='h07-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium Suite Room' FROM room_type WHERE frontend_key='h07-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-queen-room-no-window', 'PUBLISHED', 22, 2, 0, 2, NULL, NULL, 'VND', 5, 'h07-r5', 'hotel-07', 2, 'EXACT', '1 Queen bed', 'No window', false FROM property p WHERE p.slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Queen Room No Window' FROM room_type WHERE frontend_key='h07-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Queen Room No Window' FROM room_type WHERE frontend_key='h07-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-king-room-with-balcony', 'PUBLISHED', 27, 2, 1, 2, NULL, NULL, 'VND', 6, 'h07-r6', 'hotel-07', 4, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-eliana-luxury-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe King Room with Balcony' FROM room_type WHERE frontend_key='h07-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe King Room with Balcony' FROM room_type WHERE frontend_key='h07-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'standard-double-room-no-window', 'PUBLISHED', 15, 2, 0, 2, NULL, NULL, 'VND', 1, 'h08-r1', 'hotel-08', 1, 'EXACT', '1 Small double bed', 'No window', false FROM property p WHERE p.slug='kas-dilly-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h08-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Standard Double Room No Window' FROM room_type WHERE frontend_key='h08-r1' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'superior-queen-room-no-window', 'PUBLISHED', 21, 2, 0, 2, NULL, NULL, 'VND', 2, 'h08-r2', 'hotel-08', 2, 'EXACT', '1 Queen bed', 'No window', false FROM property p WHERE p.slug='kas-dilly-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Superior Queen Room No Window' FROM room_type WHERE frontend_key='h08-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Superior Queen Room No Window' FROM room_type WHERE frontend_key='h08-r2' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room-with-city-view', 'PUBLISHED', 20, 2, 1, 2, 'CITY'::view_type, NULL, 'VND', 3, 'h08-r3', 'hotel-08', 3, 'EXACT', '1 Queen bed', 'City view', false FROM property p WHERE p.slug='kas-dilly-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h08-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room with City View' FROM room_type WHERE frontend_key='h08-r3' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-king-room-with-window', 'PUBLISHED', 27, 2, 1, 2, NULL, NULL, 'VND', 4, 'h08-r4', 'hotel-08', 4, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-dilly-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe King Room with Window' FROM room_type WHERE frontend_key='h08-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe King Room with Window' FROM room_type WHERE frontend_key='h08-r4' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'premium-king-room-with-balcony', 'PUBLISHED', 37, 2, 2, 2, NULL, NULL, 'VND', 5, 'h08-r5', 'hotel-08', 6, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-dilly-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Premium King Room with Balcony' FROM room_type WHERE frontend_key='h08-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Premium King Room with Balcony' FROM room_type WHERE frontend_key='h08-r5' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type (property_id, slug, status, area_sqm, max_adults, max_children, max_occupancy, view_type, base_price_minor, currency, sort_order, frontend_key, frontend_rate_branch_key, rate_sheet_stt, rate_mapping_confidence, frontend_bed_description, frontend_view, breakfast_included) SELECT p.id, 'deluxe-queen-room-with-balcony', 'PUBLISHED', 25, 2, 1, 2, NULL, NULL, 'VND', 6, 'h08-r6', 'hotel-08', 5, 'EXACT', '1 Queen bed', 'Not published', false FROM property p WHERE p.slug='kas-dilly-hotel' ON CONFLICT (property_id, slug) DO UPDATE SET status=EXCLUDED.status, area_sqm=EXCLUDED.area_sqm, max_adults=EXCLUDED.max_adults, max_children=EXCLUDED.max_children, max_occupancy=EXCLUDED.max_occupancy, view_type=EXCLUDED.view_type, frontend_key=EXCLUDED.frontend_key, frontend_rate_branch_key=EXCLUDED.frontend_rate_branch_key, rate_sheet_stt=EXCLUDED.rate_sheet_stt, rate_mapping_confidence=EXCLUDED.rate_mapping_confidence, frontend_bed_description=EXCLUDED.frontend_bed_description, frontend_view=EXCLUDED.frontend_view, breakfast_included=EXCLUDED.breakfast_included;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'en', 'Deluxe Queen Room with Balcony' FROM room_type WHERE frontend_key='h08-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO room_type_translation (room_type_id, locale, name) SELECT id, 'vi', 'Deluxe Queen Room with Balcony' FROM room_type WHERE frontend_key='h08-r6' ON CONFLICT (room_type_id, locale) DO UPDATE SET name=EXCLUDED.name;
-- Three seasons x weekday/weekend rows per Frontend room. Fri/Sat/Sun are weekend.
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 800000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1000000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1200000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1200000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1200000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h01-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 3000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h01-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1200000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 950000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1150000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1250000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1450000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1450000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1650000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1150000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1350000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1450000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1650000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1650000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1850000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1900000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2100000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1200000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1400000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1500000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1700000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1450000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1650000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1750000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1950000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1950000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2150000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1750000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1950000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2050000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2250000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2250000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2450000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2300000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2500000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h02-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2700000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h02-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1200000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2300000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h03-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h03-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2200000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2400000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 3100000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2200000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2400000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2900000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 3500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 3800000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 3600000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 3900000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 4000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 4300000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2300000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h04-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2700000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h04-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 800000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1000000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1200000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1100000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1300000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1200000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1200000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1300000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1050000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1250000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1250000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1450000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1350000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1550000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1250000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1450000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1450000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1650000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1550000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1750000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1900000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h05-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2100000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h05-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 800000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1050000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1250000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1650000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1850000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1850000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2050000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2200000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1900000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2100000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2100000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2300000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2100000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2300000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2300000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2600000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2800000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 3000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 850000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1050000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1450000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1650000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1650000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1850000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r7' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1900000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2100000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r8' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r9' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r9' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2300000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r9' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2500000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r9' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2500000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h06-r9' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2700000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h06-r9' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2200000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2400000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2400000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2200000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h07-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h07-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1200000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1400000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r1' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1100000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1400000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1600000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r2' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1300000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1600000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1800000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r3' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1500000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 1800000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2000000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2200000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r4' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1900000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2200000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2400000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2600000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2800000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r5' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekday', 0, ARRAY[1,2,3,4]::smallint[], 1700000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Jul – Sep · weekend', 0, ARRAY[0,5,6]::smallint[], 2000000, 'VND', 'ACTIVE', 'jul_sep', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2200000, 'VND', 'ACTIVE', 'oct', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'October · weekend', 0, ARRAY[0,5,6]::smallint[], 2400000, 'VND', 'ACTIVE', 'oct', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekday', 0, ARRAY[1,2,3,4]::smallint[], 2400000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKDAY' FROM room_type rt WHERE rt.frontend_key='h08-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO rate_rule (scope, room_type_id, name, priority, days_of_week, price_minor, currency, status, frontend_season_key, frontend_day_group) SELECT 'ROOM_TYPE', rt.id, 'Nov – Dec – Jan 2027 · weekend', 0, ARRAY[0,5,6]::smallint[], 2600000, 'VND', 'ACTIVE', 'nov_jan', 'WEEKEND' FROM room_type rt WHERE rt.frontend_key='h08-r6' ON CONFLICT (room_type_id, frontend_season_key, frontend_day_group) WHERE frontend_season_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name, days_of_week=EXCLUDED.days_of_week, price_minor=EXCLUDED.price_minor, currency=EXCLUDED.currency, status=EXCLUDED.status;
INSERT INTO site_image_slot (slot_key, group_key, label, selector, default_reference, sort_order) VALUES
    ('home.dayInSaigon', 'home', 'Trang chủ · A Day in Saigon — ảnh hành trình', 'img[alt="A day in Saigon"]', 'assets/home/a-day-in-saigon.jpg', 1),
    ('home.neighborhood.city', 'home', 'Trang chủ · Bốn câu chuyện khu phố / 01 · Bắt đầu từ thành phố', 'a[href="city-guide.html#city"] img', 'https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?auto=format&fit=crop&w=1500&q=85', 2),
    ('home.neighborhood.taste', 'home', 'Trang chủ · Bốn câu chuyện khu phố / 02 · Thưởng thức thành phố qua ẩm thực', 'a[href="city-guide.html#taste"] img', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1100&q=85', 3),
    ('home.neighborhood.slow', 'home', 'Trang chủ · Bốn câu chuyện khu phố / 03 · Để dành chỗ cho những bước lang thang', 'a[href="city-guide.html#slow"] img', 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1100&q=85', 4),
    ('home.neighborhood.night', 'home', 'Trang chủ · Bốn câu chuyện khu phố / 04 · Ở ngoài lâu hơn một chút', 'a[href="city-guide.html#night"] img', 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1600&q=85', 5),
    ('home.roomsSuites', 'home', 'Trang chủ · Rooms & Suites — “A room that feels right”', '#roomImage img', 'Ảnh phòng đầu tiên đang lấy từ dữ liệu khách sạn', 6),
    ('page.hero.hotels', 'home', 'Trang chủ · Nội dung bên dưới Hero · Find Your Stay', '#heroBg', '', 7),
    ('guidebook.hero', 'guidebook', 'Guidebook · Hero', '.hero-visual', '', 1),
    ('guidebook.entry.ben-thanh-market', 'guidebook', 'Guidebook · ben-thanh-market', '.entry#ben-thanh-market .photo', '', 2),
    ('guidebook.entry.tao-dan-park', 'guidebook', 'Guidebook · tao-dan-park', '.entry#tao-dan-park .photo', '', 3),
    ('guidebook.entry.independence-palace', 'guidebook', 'Guidebook · independence-palace', '.entry#independence-palace .photo', '', 4),
    ('guidebook.entry.war-remnants-museum', 'guidebook', 'Guidebook · war-remnants-museum', '.entry#war-remnants-museum .photo', '', 5),
    ('guidebook.entry.central-post-office', 'guidebook', 'Guidebook · central-post-office', '.entry#central-post-office .photo', '', 6),
    ('guidebook.entry.notre-dame-cathedral', 'guidebook', 'Guidebook · notre-dame-cathedral', '.entry#notre-dame-cathedral .photo', '', 7),
    ('guidebook.entry.saigon-opera-house', 'guidebook', 'Guidebook · saigon-opera-house', '.entry#saigon-opera-house .photo', '', 8),
    ('guidebook.entry.nguyen-hue', 'guidebook', 'Guidebook · nguyen-hue', '.entry#nguyen-hue .photo', '', 9),
    ('guidebook.entry.bitexco', 'guidebook', 'Guidebook · bitexco', '.entry#bitexco .photo', '', 10),
    ('guidebook.entry.saigon-square', 'guidebook', 'Guidebook · saigon-square', '.entry#saigon-square .photo', '', 11),
    ('guidebook.entry.pham-ngu-lao', 'guidebook', 'Guidebook · pham-ngu-lao', '.entry#pham-ngu-lao .photo', '', 12),
    ('guidebook.entry.bui-vien', 'guidebook', 'Guidebook · bui-vien', '.entry#bui-vien .photo', '', 13),
    ('guidebook.entry.fine-arts-museum', 'guidebook', 'Guidebook · fine-arts-museum', '.entry#fine-arts-museum .photo', '', 14),
    ('guidebook.entry.nguyen-trai-street', 'guidebook', 'Guidebook · nguyen-trai-street', '.entry#nguyen-trai-street .photo', '', 15),
    ('guidebook.entry.saigon-centre', 'guidebook', 'Guidebook · saigon-centre', '.entry#saigon-centre .photo', '', 16),
    ('guidebook.entry.saigon-eco-craft', 'guidebook', 'Guidebook · saigon-eco-craft', '.entry#saigon-eco-craft .photo', '', 17),
    ('guidebook.entry.vietnamese-coffee', 'guidebook', 'Guidebook · vietnamese-coffee', '.entry#vietnamese-coffee .photo', '', 18),
    ('guidebook.entry.saigon-street-food', 'guidebook', 'Guidebook · saigon-street-food', '.entry#saigon-street-food .photo', '', 19),
    ('guidebook.entry.gia-long-palace', 'guidebook', 'Guidebook · gia-long-palace', '.entry#gia-long-palace .photo', '', 20),
    ('guidebook.entry.le-thanh-ton', 'guidebook', 'Guidebook · le-thanh-ton', '.entry#le-thanh-ton .photo', '', 21),
    ('guidebook.entry.saigon-zoo', 'guidebook', 'Guidebook · saigon-zoo', '.entry#saigon-zoo .photo', '', 22),
    ('guidebook.entry.bui-thi-xuan', 'guidebook', 'Guidebook · bui-thi-xuan', '.entry#bui-thi-xuan .photo', '', 23),
    ('guidebook.entry.september-23-park', 'guidebook', 'Guidebook · september-23-park', '.entry#september-23-park .photo', '', 24),
    ('guidebook.entry.ao-show', 'guidebook', 'Guidebook · ao-show', '.entry#ao-show .photo', '', 25),
    ('guidebook.entry.late-night-food', 'guidebook', 'Guidebook · late-night-food', '.entry#late-night-food .photo', '', 26),
    ('home.hero.01', 'homeHero', 'Home Hero · 01 · KAS Passion Boutique', '.home-hero__slide[data-index="0"] img', '', 1),
    ('home.hero.02', 'homeHero', 'Home Hero · 02 · KAS Premium Boutique', '.home-hero__slide[data-index="1"] img', '', 2),
    ('home.hero.03', 'homeHero', 'Home Hero · 03 · KAS Ancient Luxury', '.home-hero__slide[data-index="2"] img', '', 3),
    ('home.hero.04', 'homeHero', 'Home Hero · 04 · KAS Milestone Premium', '.home-hero__slide[data-index="3"] img', '', 4),
    ('home.hero.05', 'homeHero', 'Home Hero · 05 · KAS Zody Boutique', '.home-hero__slide[data-index="4"] img', '', 5),
    ('home.hero.06', 'homeHero', 'Home Hero · 06 · KAS Sonata Luxury', '.home-hero__slide[data-index="5"] img', '', 6),
    ('home.hero.07', 'homeHero', 'Home Hero · 07 · KAS Eliana Luxury', '.home-hero__slide[data-index="6"] img', '', 7),
    ('home.hero.08', 'homeHero', 'Home Hero · 08 · KAS Dilly Luxury', '.home-hero__slide[data-index="7"] img', '', 8),
    ('home.heroExtra1', 'homeHero', 'Home Hero · 09 · Ha Long Bay, Vietnam', '.home-hero__slide[data-index="8"] img', '', 9),
    ('home.heroExtra2', 'homeHero', 'Home Hero · 10 · Hoi An, Vietnam', '.home-hero__slide[data-index="9"] img', '', 10),
    ('home.heroExtra3', 'homeHero', 'Home Hero · 11 · Vietnam coast', '.home-hero__slide[data-index="10"] img', '', 11),
    ('home.heroExtra4', 'homeHero', 'Home Hero · 12 · Vietnam landscape', '.home-hero__slide[data-index="11"] img', '', 12),
    ('page.hero.experiences', 'pageHero', 'Trải nghiệm · Ảnh Hero', '.content-page-hero', '', 1),
    ('page.hero.offers', 'pageHero', 'Ưu đãi · Ảnh Hero', '.content-page-hero', '', 2),
    ('page.hero.my-kas', 'pageHero', 'My KAS · Ảnh Hero', '.hero--mykas-intro', '', 3),
    ('page.hero.about', 'pageHero', 'Về KAS · Ảnh Hero', '.content-page-hero', '', 4),
    ('page.hero.support', 'pageHero', 'Hỗ trợ · Ảnh Hero', '.content-page-hero', '', 5),
    ('page.hero.welcome', 'pageHero', 'Welcome Popup · Ảnh cửa sổ chào mừng', '.kas-welcome__visual img', 'https://images.unsplash.com/photo-1503539680555-732099a55a56?auto=format&fit=crop&w=1400&q=90', 6),
    ('find.zero.main', 'findYourKas', 'Find Your KAS · Ảnh Zero chính', '.find-page-hero-main', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=88', 1),
    ('find.zero.card', 'findYourKas', 'Find Your KAS · Ảnh Zero nổi', '.find-page-hero-card', 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=900&q=88', 2)
ON CONFLICT (slot_key) DO UPDATE SET group_key=EXCLUDED.group_key, label=EXCLUDED.label, selector=EXCLUDED.selector, default_reference=EXCLUDED.default_reference, sort_order=EXCLUDED.sort_order;
-- Counts expected from this snapshot: 8 properties, 48 room types, 288 rate rules, 53 site slots.

-- -----------------------------------------------------------------------------
-- Confirmed admin key sign-in, review moderation and membership business rules.
-- -----------------------------------------------------------------------------
CREATE TABLE staff_access_key (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    key_hash      text NOT NULL UNIQUE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz,
    revoked_at    timestamptz,
    CONSTRAINT staff_access_key_hash_not_blank CHECK (length(btrim(key_hash)) >= 40)
);
CREATE UNIQUE INDEX staff_access_key_one_current_per_user_uk
    ON staff_access_key (user_id) WHERE revoked_at IS NULL;
COMMENT ON TABLE staff_access_key IS
    'One active unique sign-in key per staff account. Store only a cryptographic hash; plaintext is shown only once at creation/rotation. Role and permissions come from role_assignment.';

ALTER TABLE review
    ADD COLUMN hidden_at timestamptz,
    ADD COLUMN deleted_at timestamptz,
    ADD COLUMN deleted_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
    ADD COLUMN deletion_reason text;
CREATE TABLE review_moderation_event (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id     uuid NOT NULL REFERENCES review (id) ON DELETE RESTRICT,
    actor_id      uuid REFERENCES app_user (id) ON DELETE SET NULL,
    action        text NOT NULL,
    reason        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_moderation_action CHECK (action IN ('HIDE', 'SHOW', 'DELETE'))
);
CREATE INDEX review_moderation_event_review_idx
    ON review_moderation_event (review_id, created_at DESC);
COMMENT ON TABLE review_moderation_event IS
    'Audit history for ADMIN review hide/show/delete operations. Delete is soft delete on review.';

-- A submitted first-party review must belong to the same customer and property
-- as a completed stay. V16 already guarantees at most one review per reservation.
CREATE FUNCTION kas_require_completed_review_stay()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    stay_customer_id uuid;
    stay_property_id uuid;
    stay_state stay_status;
BEGIN
    SELECT customer_id, property_id, stay_status
      INTO stay_customer_id, stay_property_id, stay_state
      FROM reservation
     WHERE id = NEW.reservation_id;

    IF NOT FOUND OR stay_state IS DISTINCT FROM 'COMPLETED' THEN
        RAISE EXCEPTION 'review requires a completed stay';
    END IF;
    IF stay_customer_id IS DISTINCT FROM NEW.customer_id
       OR stay_property_id IS DISTINCT FROM NEW.property_id THEN
        RAISE EXCEPTION 'review customer and property must match its reservation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER review_completed_stay_required_trg
    BEFORE INSERT OR UPDATE OF reservation_id, customer_id, property_id ON review
    FOR EACH ROW EXECUTE FUNCTION kas_require_completed_review_stay();

-- voucher_redemption's original uniqueness permits two different vouchers on
-- one reservation. The business rule is exactly one voucher per reservation.
CREATE UNIQUE INDEX voucher_redemption_one_per_reservation_uk
    ON voucher_redemption (reservation_id);
COMMENT ON COLUMN voucher.stackable IS
    'Does not disable the confirmed member-discount + one-voucher + points order; that combination is governed by membership_discount_policy. V33 prevents multiple voucher redemptions on one reservation.';

UPDATE membership_tier
SET status = 'ACTIVE',
    qualification_period_months = 3,
    qualification_period_kind = 'CALENDAR_QUARTER',
    discount_percent = 10.00,
    early_checkin_hours = 2,
    late_checkout_hours = 2,
    free_cancellation_days_before_checkin = 0,
    free_cancellation_cutoff_time = TIME '12:00',
    qualifying_completed_bookings = CASE code
        WHEN 'CLASSIC' THEN 10 WHEN 'GOLD' THEN 20 WHEN 'PLATINUM' THEN 30 END,
    cashback_rate_percent = CASE code
        WHEN 'CLASSIC' THEN 1.000 WHEN 'GOLD' THEN 2.000 WHEN 'PLATINUM' THEN 3.000 END
WHERE code IN ('CLASSIC', 'GOLD', 'PLATINUM');

INSERT INTO membership_tier
    (code, status, sort_order, qualification_period_months, qualifying_completed_bookings,
     discount_percent, cashback_rate_percent, early_checkin_hours, late_checkout_hours,
     free_cancellation_days_before_checkin, free_cancellation_cutoff_time,
     qualification_period_kind)
VALUES
    ('CLASSIC', 'ACTIVE', 1, 3, 10, 10.00, 1.000, 2, 2, 0, TIME '12:00', 'CALENDAR_QUARTER'),
    ('GOLD', 'ACTIVE', 2, 3, 20, 10.00, 2.000, 2, 2, 0, TIME '12:00', 'CALENDAR_QUARTER'),
    ('PLATINUM', 'ACTIVE', 3, 3, 30, 10.00, 3.000, 2, 2, 0, TIME '12:00', 'CALENDAR_QUARTER')
ON CONFLICT (code) DO UPDATE SET
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order,
    qualification_period_months = EXCLUDED.qualification_period_months,
    qualifying_completed_bookings = EXCLUDED.qualifying_completed_bookings,
    discount_percent = EXCLUDED.discount_percent,
    early_checkin_hours = EXCLUDED.early_checkin_hours,
    late_checkout_hours = EXCLUDED.late_checkout_hours,
    free_cancellation_days_before_checkin = EXCLUDED.free_cancellation_days_before_checkin,
    free_cancellation_cutoff_time = EXCLUDED.free_cancellation_cutoff_time,
    cashback_rate_percent = EXCLUDED.cashback_rate_percent,
    qualification_period_kind = EXCLUDED.qualification_period_kind,
    updated_at = now();

INSERT INTO membership_discount_policy
    (version, status, discount_percent, discount_basis, stacking_policy, effective_from)
VALUES
    (1, 'ACTIVE', 10.00, 'ROOM_SUBTOTAL',
     'MEMBER_10_PERCENT_THEN_ONE_VOUCHER_THEN_POINTS', DATE '2026-10-15')
ON CONFLICT (version) DO UPDATE SET
    status = EXCLUDED.status,
    discount_percent = EXCLUDED.discount_percent,
    discount_basis = EXCLUDED.discount_basis,
    stacking_policy = EXCLUDED.stacking_policy,
    effective_from = EXCLUDED.effective_from,
    updated_at = now();

INSERT INTO cashback_program
    (code, membership_tier_id, status, currency, earn_rate_percent, eligible_basis_code,
     redemption_enabled)
SELECT 'MEMBERSHIP_' || t.code, t.id, 'ACTIVE', 'VND', t.cashback_rate_percent,
       'PAID_ROOM_SUBTOTAL_AFTER_MEMBER_VOUCHER_AND_POINTS', false
FROM membership_tier t
WHERE t.code IN ('CLASSIC', 'GOLD', 'PLATINUM')
ON CONFLICT (code) DO UPDATE SET
    membership_tier_id = EXCLUDED.membership_tier_id,
    status = EXCLUDED.status,
    currency = EXCLUDED.currency,
    earn_rate_percent = EXCLUDED.earn_rate_percent,
    eligible_basis_code = EXCLUDED.eligible_basis_code,
    redemption_enabled = false,
    updated_at = now();

INSERT INTO cashback_program
    (code, status, currency, earn_rate_percent, eligible_basis_code,
     redemption_enabled, minimum_redemption_points, maximum_redeem_percent)
VALUES
    ('KAS_POINTS_REDEMPTION', 'ACTIVE', 'VND', 0,
     'NEXT_ORDER_PAYABLE', true, 1, 50.000)
ON CONFLICT (code) DO UPDATE SET
    status = EXCLUDED.status,
    currency = EXCLUDED.currency,
    earn_rate_percent = EXCLUDED.earn_rate_percent,
    eligible_basis_code = EXCLUDED.eligible_basis_code,
    redemption_enabled = true,
    minimum_redemption_points = EXCLUDED.minimum_redemption_points,
    maximum_redeem_percent = EXCLUDED.maximum_redeem_percent,
    updated_at = now();

INSERT INTO membership_tier_translation (tier_id, locale, display_name, description)
SELECT t.id, x.locale, x.display_name, x.description
FROM membership_tier t
CROSS JOIN (VALUES
    ('CLASSIC', 'vi'::char(2), 'Classic', 'Từ 10 lượt lưu trú hoàn tất trong quý.'),
    ('CLASSIC', 'en'::char(2), 'Classic', 'From 10 completed stays in a calendar quarter.'),
    ('GOLD', 'vi'::char(2), 'Gold', 'Từ 20 lượt lưu trú hoàn tất trong quý.'),
    ('GOLD', 'en'::char(2), 'Gold', 'From 20 completed stays in a calendar quarter.'),
    ('PLATINUM', 'vi'::char(2), 'Platinum', 'Từ 30 lượt lưu trú hoàn tất trong quý.'),
    ('PLATINUM', 'en'::char(2), 'Platinum', 'From 30 completed stays in a calendar quarter.')
) AS x(code, locale, display_name, description)
WHERE t.code = x.code
ON CONFLICT (tier_id, locale) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

-- Existing customer rows join the loyalty program as Classic with a zero-point
-- wallet. New registrations create the same rows in CustomerRegistrationService.
INSERT INTO customer_membership (customer_id, enrollment_source)
SELECT c.id, 'V33_MIGRATION'
  FROM customer c
 WHERE NOT EXISTS (SELECT 1 FROM customer_membership cm WHERE cm.customer_id = c.id);

INSERT INTO customer_membership_tier_history
    (membership_id, tier_id, effective_from, change_reason)
SELECT cm.id, t.id, now(), 'Initial Classic membership during V33 rollout'
  FROM customer_membership cm
  JOIN membership_tier t ON t.code = 'CLASSIC' AND t.status = 'ACTIVE'
 WHERE NOT EXISTS (SELECT 1 FROM customer_membership_tier_history h
                    WHERE h.membership_id = cm.id AND h.effective_to IS NULL);

INSERT INTO cashback_account (customer_id)
SELECT c.id FROM customer c
ON CONFLICT (customer_id) DO NOTHING;

COMMENT ON COLUMN membership_tier.qualifying_completed_bookings IS
    'Minimum completed reservations in the calendar quarter: 10 Classic, 20 Gold, 30 Platinum. Promotion takes effect immediately when reached and remains through the next calendar quarter; cancellations/refunds are excluded.';
COMMENT ON COLUMN membership_tier.cashback_rate_percent IS
    'Earn rate on the room amount actually paid after member discount, one voucher, and redeemed points; cashback is credited after stay completion.';
COMMENT ON COLUMN reservation_loyalty_snapshot.cashback_rate_percent_snapshot IS
    'Cashback tier rate snapshotted at booking so later tier changes do not rewrite this reservation reward.';
COMMENT ON COLUMN membership_tier.early_checkin_hours IS
    'Member perk: early check-in up to this many hours, subject to property availability.';
COMMENT ON COLUMN membership_tier.late_checkout_hours IS
    'Member perk: late check-out up to this many hours, subject to property availability.';

-- Frontend room amenity claims, keyed by the legacy hNN-rN identity retained in V33.
-- The claim set is copied from KAS_FRONTEND_CONTENT_BASELINE.json; no inferred room feature is added.
INSERT INTO room_type_amenity (room_type_id, amenity_id, sort_order)
SELECT rt.id, a.id, u.ordinality::int
  FROM (VALUES
    ('h01-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h01-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h01-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h02-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h02-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h02-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h02-r4', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h02-r5', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h02-r6', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h02-r7', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h02-r8', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h03-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h03-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h03-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h03-r4', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h04-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h04-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower', 'balcony']::text[]),
    ('h04-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h04-r4', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower', 'balcony']::text[]),
    ('h04-r5', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h04-r6', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h05-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h05-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h05-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h05-r4', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h05-r5', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h05-r6', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r4', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower', 'balcony']::text[]),
    ('h06-r5', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r6', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r7', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r8', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h06-r9', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h07-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h07-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h07-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub', 'balcony']::text[]),
    ('h07-r4', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'bathtub']::text[]),
    ('h07-r5', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h07-r6', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower', 'balcony']::text[]),
    ('h08-r1', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h08-r2', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h08-r3', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h08-r4', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower']::text[]),
    ('h08-r5', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower', 'balcony']::text[]),
    ('h08-r6', ARRAY['wifi-free', 'air-conditioning', 'flat-screen-tv', 'refrigerator', 'kettle', 'hairdryer', 'in-room-safe', 'in-room-telephone', 'private-bathroom', 'non-smoking-room', 'rain-shower', 'balcony']::text[])
  ) AS x(frontend_key, codes)
  JOIN room_type rt ON rt.frontend_key = x.frontend_key
 CROSS JOIN LATERAL unnest(x.codes) WITH ORDINALITY AS u(code, ordinality)
  JOIN amenity a ON a.code = u.code
ON CONFLICT (room_type_id, amenity_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
