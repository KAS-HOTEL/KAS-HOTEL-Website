-- =============================================================================
-- V1 — Extensions and enum types
-- Source: 53-phase-4-database-erd.md, 54-phase-4-state-machines.md,
--         85-partner-property-model-amendment.md
-- =============================================================================
-- gen_random_uuid() is built into PostgreSQL 13+; no pgcrypto/uuid-ossp needed.
-- citext is a TRUSTED extension in PG13+, creatable by the database owner.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Partner / property
-- ---------------------------------------------------------------------------
CREATE TYPE partner_status AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TYPE property_lifecycle_state AS ENUM (
    'DRAFT', 'COMING_SOON', 'OPEN', 'TEMPORARILY_CLOSED', 'CLOSED'
);

CREATE TYPE facility_type AS ENUM (
    'RESTAURANT', 'BAR', 'ROOFTOP', 'GYM', 'POOL', 'SPA',
    'MEETING', 'LOUNGE', 'TERRACE'
);

-- ---------------------------------------------------------------------------
-- Room type
-- ---------------------------------------------------------------------------
CREATE TYPE room_type_status AS ENUM ('DRAFT', 'PUBLISHED', 'UNLISTED', 'ARCHIVED');

CREATE TYPE view_type AS ENUM ('CITY', 'STREET', 'COURTYARD', 'ROOFTOP', 'INTERIOR');

-- ---------------------------------------------------------------------------
-- Distribution / lead / sales owner — THREE SEPARATE CONCEPTS (doc 29, 85)
-- There is deliberately NO generic "source" type.
-- ---------------------------------------------------------------------------
CREATE TYPE channel_type AS ENUM ('DIRECT', 'OTA');

CREATE TYPE lead_source AS ENUM (
    'WEBSITE', 'FACEBOOK', 'ZALO', 'TIKTOK', 'INSTAGRAM',
    'PHONE', 'WALK_IN', 'REFERRAL', 'RETURNING_CUSTOMER', 'OTHER'
);

-- ---------------------------------------------------------------------------
-- Reservation — TWO independent lifecycles (doc 54)
-- salesStatus terminal success is WON, never CONFIRMED.
-- CONFIRMED belongs to stayStatus alone.
-- ---------------------------------------------------------------------------
CREATE TYPE sales_status AS ENUM (
    'REQUESTED', 'ASSIGNED', 'AVAILABILITY_CHECK', 'CUSTOMER_CONTACTED',
    'ALTERNATIVE_OFFERED', 'WON', 'DECLINED', 'CANCELLED', 'EXPIRED'
);

CREATE TYPE stay_status AS ENUM (
    'CONFIRMED', 'CHECK_IN_READY', 'CHECKED_IN', 'CHECKED_OUT',
    'COMPLETED', 'CANCELLED', 'NO_SHOW'
);

CREATE TYPE status_field AS ENUM ('SALES', 'STAY');

CREATE TYPE inquiry_status AS ENUM ('NEW', 'QUALIFIED', 'LOST');

-- ---------------------------------------------------------------------------
-- Holds (doc 55 §5)
-- ---------------------------------------------------------------------------
CREATE TYPE hold_type AS ENUM ('REQUEST', 'ALTERNATIVE_OFFER');

CREATE TYPE hold_status AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');

-- ---------------------------------------------------------------------------
-- RBAC (doc 59, 85 §5)
-- ---------------------------------------------------------------------------
CREATE TYPE scope_kind AS ENUM ('GLOBAL', 'PARTNER', 'PROPERTY', 'OWN');

-- V1 roles only. Future roles (HOTEL_MANAGER, RECEPTIONIST, RESERVATIONS_STAFF,
-- CONTENT_MANAGER, ACCOUNTANT, SALES) are added by a later migration when
-- the team structure is supplied (config B24/B25).
CREATE TYPE user_role AS ENUM ('CUSTOMER', 'ADMIN', 'SUPER_ADMIN');

CREATE TYPE user_status AS ENUM ('UNVERIFIED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- ---------------------------------------------------------------------------
-- Customer (doc 61)
-- ---------------------------------------------------------------------------
CREATE TYPE consent_purpose AS ENUM ('TRANSACTIONAL', 'MARKETING');

CREATE TYPE match_confidence AS ENUM ('HIGH', 'MEDIUM', 'LOW');

CREATE TYPE contact_channel AS ENUM ('PHONE', 'EMAIL', 'ZALO', 'SMS', 'IN_PERSON');

CREATE TYPE contact_direction AS ENUM ('OUTBOUND', 'INBOUND');

CREATE TYPE actor_type AS ENUM ('SYSTEM', 'ADMIN', 'CUSTOMER');

-- ---------------------------------------------------------------------------
-- Review (doc 61 §5)
-- ---------------------------------------------------------------------------
CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- ---------------------------------------------------------------------------
-- Media (doc 62)
-- ---------------------------------------------------------------------------
CREATE TYPE media_category AS ENUM (
    'EXTERIOR', 'LOBBY', 'ROOM', 'DINING', 'FACILITY', 'ROOFTOP',
    'NEIGHBOURHOOD', 'DETAIL', 'STAFF', 'EVENT', 'DOCUMENT'
);

CREATE TYPE media_visibility AS ENUM ('PUBLIC', 'INTERNAL');

CREATE TYPE media_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE media_owner_type AS ENUM (
    'PROPERTY', 'ROOM_TYPE', 'FACILITY', 'OFFER', 'PAGE_BLOCK', 'REVIEW'
);

-- ---------------------------------------------------------------------------
-- Pricing (doc 56)
-- ---------------------------------------------------------------------------
CREATE TYPE rate_scope AS ENUM ('PROPERTY', 'ROOM_TYPE');

CREATE TYPE rule_status AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

CREATE TYPE tax_type AS ENUM ('VAT', 'SERVICE_CHARGE', 'CITY_TAX', 'OTHER');

CREATE TYPE tax_calculation AS ENUM ('PERCENTAGE', 'FIXED_PER_NIGHT', 'FIXED_PER_STAY');

CREATE TYPE tax_applies_to AS ENUM ('ROOM_SUBTOTAL', 'ROOM_SUBTOTAL_PLUS_SERVICE');

CREATE TYPE buffer_type AS ENUM ('FIXED_ROOMS', 'PERCENTAGE');

-- ---------------------------------------------------------------------------
-- Payment (doc 57 §5) — V1 RECORDS payments made elsewhere. No gateway.
-- ---------------------------------------------------------------------------
CREATE TYPE payment_method AS ENUM (
    'BANK_TRANSFER', 'QR', 'VNPAY', 'MOMO', 'ZALOPAY', 'CARD', 'AT_HOTEL', 'OTHER'
);

CREATE TYPE payment_status AS ENUM ('RECORDED', 'VERIFIED', 'REVERSED');

-- ---------------------------------------------------------------------------
-- Voucher (doc 53 §3.8)
-- ---------------------------------------------------------------------------
CREATE TYPE voucher_type AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'VALUE_ADD');

CREATE TYPE voucher_status AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- ---------------------------------------------------------------------------
-- Communications (doc 53 §3.9)
-- ---------------------------------------------------------------------------
CREATE TYPE email_status AS ENUM (
    'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'COMPLAINED'
);

-- ---------------------------------------------------------------------------
-- Settings (doc 51 §6)
-- ---------------------------------------------------------------------------
CREATE TYPE setting_value_type AS ENUM (
    'STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DURATION', 'JSON'
);
