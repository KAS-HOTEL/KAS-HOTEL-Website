-- =============================================================================
-- V23 — Seed: the KAS partner and its eight properties
-- =============================================================================
-- Phase 7.5, owner decision D1: "Seed minimal rows AND I'll supply data after."
--
-- WHAT THIS SEEDS, AND ON WHOSE AUTHORITY
--
--   The eight names   OWNER-PROVIDED — phase brief §22, verbatim and canonical.
--                     Corroborated by doc 03 §1. NOT the Agoda listing names,
--                     which brief §5 forbids as a source of truth.
--   partner           FROZEN — doc 85 §1: V1 has exactly one partner owning all
--                     eight properties.
--   city / country    FACT — doc 03 §1: "Eight properties, all in Ho Chi Minh
--                     City, Vietnam."
--   is_flagship       FROZEN — doc 03 §4: Milestone is the flagship.
--   lifecycle_state   DERIVED — DRAFT. Doc 03 §8 makes DRAFT hidden and
--                     unbookable, which is the only correct state for a property
--                     with no address, rooms, rates or photography.
--   slug              DERIVED from the canonical name.
--
-- WHAT THIS DELIBERATELY DOES NOT SEED
--
--   Street addresses, wards, districts, coordinates, phone, email, star rating,
--   year opened, total room count, room types, bed configurations, occupancy,
--   inventory, rates, taxes, policies, photography, amenity assignments.
--
--   Doc 03 §5: "Currently none of these values are known for any property — this
--   is the single largest content gap in the project (OQ-030, OQ-031)."
--   Doc 51 grades them A1, A2, A9, A10, B6, B8 — all OPEN.
--
--   Inventing them would be manufacturing production data for eight real hotels.
--   The Partner supplies them through the onboarding flow this phase builds.
--
-- partner.legal_name carries an explicit placeholder rather than a guess: the
-- legal entity name is doc 51 B13, still OPEN. Partner is internal-only
-- (doc 85 §3.1 — never reaches a public or /me response), so the placeholder is
-- visible to administrators as a to-do and cannot reach a guest.
-- =============================================================================

INSERT INTO partner (code, legal_name, display_name, status)
VALUES ('kas', 'TBD — legal entity name pending (doc 51 B13)', 'KAS', 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO property (partner_id, slug, lifecycle_state, is_flagship, city, country, sort_order)
SELECT p.id, seed.slug, 'DRAFT', seed.is_flagship, 'Ho Chi Minh City', 'VN', seed.sort_order
FROM partner p
CROSS JOIN (VALUES
    ('kas-passion-boutique-hotel',  false, 1),
    ('kas-elegance-hotel',          false, 2),
    ('kas-ancient-boutique-hotel',  false, 3),
    ('kas-milestone-premium-hotel', true,  4),
    ('kas-zody-boutique-hotel',     false, 5),
    ('kas-sonata-luxury-hotel',     false, 6),
    ('kas-eliana-luxury-hotel',     false, 7),
    ('kas-dilly-hotel',             false, 8)
) AS seed(slug, is_flagship, sort_order)
WHERE p.code = 'kas'
ON CONFLICT (slug) DO NOTHING;

-- Canonical display names. Identical in both locales: these are brand names, not
-- translated text. Every other translated field is left NULL — a signature line,
-- description and neighbourhood story are editorial content that does not exist
-- yet (doc 03 §5.2, OQ-030).
INSERT INTO property_translation (property_id, locale, name)
SELECT pr.id, loc.locale, seed.name
FROM property pr
JOIN (VALUES
    ('kas-passion-boutique-hotel',  'Kas Passion Boutique Hotel'),
    ('kas-elegance-hotel',          'Kas Elegance Hotel'),
    ('kas-ancient-boutique-hotel',  'Kas Ancient Boutique Hotel'),
    ('kas-milestone-premium-hotel', 'Kas Milestone Premium Hotel'),
    ('kas-zody-boutique-hotel',     'Kas Zody Boutique Hotel'),
    ('kas-sonata-luxury-hotel',     'Kas Sonata Luxury Hotel'),
    ('kas-eliana-luxury-hotel',     'Kas Eliana Luxury Hotel'),
    ('kas-dilly-hotel',             'Kas Dilly Hotel')
) AS seed(slug, name) ON seed.slug = pr.slug
CROSS JOIN (VALUES ('en'), ('vi')) AS loc(locale)
ON CONFLICT (property_id, locale) DO NOTHING;
