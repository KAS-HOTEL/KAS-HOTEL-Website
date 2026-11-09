-- =============================================================================
-- R__reference_distribution_channels — REPEATABLE
-- Source: 85-partner-property-model-amendment.md §1,
--         29-direct-sales-crm-architecture.md §2.1
-- =============================================================================
-- THE ONLY DATA MIGRATION IN PHASE 7.2.
--
-- Distribution channel codes are TECHNICAL ENUMERATION VALUES fixed by the
-- frozen architecture, not business content. They are safe to seed.
--
-- NOT SEEDED, and never invented: partner names, property names, addresses,
-- room type names, room quantities, rates, VAT rates, cancellation and no-show
-- policies, hold durations, OTA buffer values, amenity content. All are
-- outstanding business configuration (doc 51).
--
-- Repeatable: re-applied whenever this file's checksum changes. Idempotent by
-- ON CONFLICT, so it is safe to run any number of times.
-- =============================================================================

INSERT INTO distribution_channel (code, display_name, channel_type, sort_order) VALUES
    ('DIRECT',      'Direct',       'DIRECT', 0)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    channel_type = EXCLUDED.channel_type,
    sort_order   = EXCLUDED.sort_order,
    updated_at   = now();
