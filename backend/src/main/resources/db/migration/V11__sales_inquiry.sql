-- =============================================================================
-- V11 — Sales Inquiry (V1 scope)
-- Source: 57-phase-4-reservation-sales.md §1, 53-phase-4-database-erd.md §5.1,
--         14-booking-state-machine.md §3
-- =============================================================================
-- A direct enquiry captured BEFORE enough information exists to create a
-- reservation: "Do you have rooms available in September?"
--
-- *** THIS TABLE HOLDS NO INVENTORY (invariant test #9). ***
-- It deliberately has NO check_in, NO check_out, NO room_type_id and NO
-- quantity column. It cannot consume availability because it has nothing to
-- consume it with. property_interest and date_hint are HINTS — date_hint is
-- unparsed text, not a date range.
--
-- The only inventory footprint an inquiry can have is an explicit
-- ALTERNATIVE_OFFER hold (V13), which carries its own stay parameters AND its
-- own mandatory expiry (doc 14 §3.2).
--
-- DIRECT channel only. Not a parallel booking entity — on qualification it
-- CONTINUES INTO the reservation workflow (doc 85 / Decision 4).
-- =============================================================================

CREATE TABLE sales_inquiry (
    id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    status                   inquiry_status NOT NULL DEFAULT 'NEW',

    -- Required on every direct lead. There is no OTA inquiry.
    lead_source              lead_source    NOT NULL,
    lead_source_detail       text,
    lead_source_note         text,

    sales_owner_id           uuid           REFERENCES app_user (id) ON DELETE SET NULL,
    customer_id              uuid           REFERENCES customer (id) ON DELETE SET NULL,

    -- Contact fragment. Every field individually nullable: enquiries are
    -- fragmentary by nature. At least one must be present.
    contact_name             text,
    contact_phone            text,
    contact_email            citext,
    contact_channel_ref      text,

    inquiry_text             text           NOT NULL,

    -- HINTS ONLY — not stay data.
    property_interest        uuid           REFERENCES property (id) ON DELETE SET NULL,
    date_hint                text,

    next_follow_up_at        timestamptz,
    attempt_count            int            NOT NULL DEFAULT 0,

    -- The handoff. Set on QUALIFIED; FK added in V12 once reservation exists.
    qualified_reservation_id uuid,

    lost_reason              text,

    created_by               uuid           REFERENCES app_user (id) ON DELETE SET NULL,
    created_at               timestamptz    NOT NULL DEFAULT now(),
    updated_at               timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT inquiry_has_contact CHECK (
        contact_name IS NOT NULL OR contact_phone IS NOT NULL
     OR contact_email IS NOT NULL OR contact_channel_ref IS NOT NULL
    ),
    CONSTRAINT inquiry_text_not_blank CHECK (length(btrim(inquiry_text)) > 0),
    CONSTRAINT inquiry_attempts_nonneg CHECK (attempt_count >= 0),
    CONSTRAINT inquiry_qualified_has_reservation CHECK (
        status <> 'QUALIFIED' OR qualified_reservation_id IS NOT NULL
    ),
    CONSTRAINT inquiry_lost_has_reason CHECK (
        status <> 'LOST' OR lost_reason IS NOT NULL
    )
);

COMMENT ON TABLE sales_inquiry IS
    'DIRECT only. HOLDS NO INVENTORY — no stay dates, no room type, no quantity columns exist.';
COMMENT ON COLUMN sales_inquiry.date_hint IS
    'Unparsed free text ("sometime in September"). Deliberately NOT a date range.';

CREATE INDEX inquiry_queue_idx      ON sales_inquiry (status, next_follow_up_at);
CREATE INDEX inquiry_owner_idx      ON sales_inquiry (sales_owner_id, status);
CREATE INDEX inquiry_lead_source_idx ON sales_inquiry (lead_source);
CREATE INDEX inquiry_customer_idx   ON sales_inquiry (customer_id) WHERE customer_id IS NOT NULL;
