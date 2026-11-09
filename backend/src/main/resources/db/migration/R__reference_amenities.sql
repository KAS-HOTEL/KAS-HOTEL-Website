-- =============================================================================
-- R__ Reference data — amenity catalog
-- =============================================================================
-- Repeatable, idempotent. Re-runs whenever this file changes.
--
-- This is the CONTROLLED VOCABULARY a Partner selects from during onboarding
-- (phase brief §9, §11, §32). It is deliberately DATA, not a Java enum and not a
-- PostgreSQL enum: doc 03 §6 specifies "a shared, controlled vocabulary across
-- all properties, not free text per hotel", managed in admin with name, icon,
-- category and sort order. Adding an amenity must never require a code change.
--
-- THE SCHEMA DEFINES THE RULES, AND THEY ARE OBEYED HERE, NOT GUESSED:
--   amenity_code_format    code ~ '^[a-z0-9][a-z0-9_-]*$'   — lower case only
--   amenity_category_valid category IN (CONNECTIVITY, COMFORT, BATHROOM, MEDIA,
--                          FOOD_DRINK, PROPERTY_FACILITY, SERVICES,
--                          ACCESSIBILITY, FAMILY)
--
-- Those nine categories are the doc 03 §6 taxonomy, frozen into V4. A first
-- draft of this file used upper-case codes and invented two categories
-- (PROPERTY_FACILITIES, ROOM_FEATURES); both CHECKs rejected it and the
-- migration rolled back. The vocabulary below is the schema's, not mine.
--
-- CLASSIFICATION: codes are OWNER-PROVIDED (phase brief §9/§11) mapped onto the
-- frozen doc 03 §6 categories. WHICH amenities each property and room type
-- actually has remains OQ-031 / doc 51 A9 — UNRESOLVED — and is NOT seeded
-- anywhere. This file creates the words, never the claims.
--
-- Note on brief §9's candidate list: most of it is amenities, not facilities.
-- The frozen `facility_type` enum is RESTAURANT, BAR, ROOFTOP, GYM, POOL, SPA,
-- MEETING, LOUNGE, TERRACE — a facility is "a physical thing at a property with
-- editorial content", its own gallery and hours (doc 52 §3.14). Wi-Fi, a lift,
-- parking and luggage storage are not that, and doc 03 §6 lists them under the
-- amenity taxonomy. They are amenity rows here, and no enum change was needed.
--
-- Window / balcony / terrace (brief §11 "room features") map to COMFORT: the
-- frozen category list has no room-features bucket, and inventing one would mean
-- altering a frozen CHECK to accommodate a label.
-- =============================================================================

INSERT INTO amenity (code, category, is_highlight, sort_order) VALUES
    -- Connectivity
    ('wifi-free',             'CONNECTIVITY',      true,   10),
    ('wired-internet',        'CONNECTIVITY',      false,  20),
    ('work-desk',             'CONNECTIVITY',      false,  30),

    -- Comfort
    ('air-conditioning',      'COMFORT',           true,   10),
    ('heating',               'COMFORT',           false,  20),
    ('fan',                   'COMFORT',           false,  30),
    ('blackout-curtains',     'COMFORT',           false,  40),
    ('soundproofing',         'COMFORT',           false,  50),
    ('in-room-safe',          'COMFORT',           false,  60),
    ('window',                'COMFORT',           false,  70),
    ('balcony',               'COMFORT',           false,  80),
    ('terrace',               'COMFORT',           false,  90),

    -- Bathroom
    ('private-bathroom',      'BATHROOM',          true,   10),
    ('shower',                'BATHROOM',          false,  20),
    ('rain-shower',           'BATHROOM',          false,  30),
    ('bathtub',               'BATHROOM',          false,  40),
    ('hairdryer',             'BATHROOM',          false,  50),
    ('toiletries',            'BATHROOM',          false,  60),
    ('towels',                'BATHROOM',          false,  70),
    ('bathrobe',              'BATHROOM',          false,  80),
    ('slippers',              'BATHROOM',          false,  90),
    ('bidet',                 'BATHROOM',          false, 100),

    -- Media
    ('tv',                    'MEDIA',             false,  10),
    ('flat-screen-tv',        'MEDIA',             false,  20),
    ('smart-tv',              'MEDIA',             false,  30),
    ('cable-tv',              'MEDIA',             false,  40),
    ('satellite-tv',          'MEDIA',             false,  50),
    ('bluetooth-speaker',     'MEDIA',             false,  60),

    -- Food & drink
    ('refrigerator',          'FOOD_DRINK',        false,  10),
    ('minibar',               'FOOD_DRINK',        false,  20),
    ('kettle',                'FOOD_DRINK',        false,  30),
    ('coffee-machine',        'FOOD_DRINK',        false,  40),
    ('bottled-water',         'FOOD_DRINK',        false,  50),
    ('in-room-dining',        'FOOD_DRINK',        false,  60),
    ('breakfast',             'FOOD_DRINK',        true,   70),

    -- Property facility (amenity-level; see the header note)
    ('lift',                  'PROPERTY_FACILITY', false,  10),
    ('parking',               'PROPERTY_FACILITY', true,   20),
    ('laundry',               'PROPERTY_FACILITY', false,  30),
    ('luggage-storage',       'PROPERTY_FACILITY', false,  40),
    ('business-centre',       'PROPERTY_FACILITY', false,  50),
    ('kids-area',             'PROPERTY_FACILITY', false,  60),
    ('smoking-area',          'PROPERTY_FACILITY', false,  70),

    -- Services
    ('reception-24h',         'SERVICES',          true,   10),
    ('room-service',          'SERVICES',          false,  20),
    ('concierge',             'SERVICES',          false,  30),
    ('daily-housekeeping',    'SERVICES',          false,  40),
    ('airport-transfer',      'SERVICES',          false,  50),
    ('shuttle-service',       'SERVICES',          false,  60),
    ('tour-desk',             'SERVICES',          false,  70),

    -- Accessibility. Doc 03 §5.3: must be factual, never framed.
    ('step-free-entrance',    'ACCESSIBILITY',     false,  10),
    ('accessible-bathroom',   'ACCESSIBILITY',     false,  20),
    ('lift-access',           'ACCESSIBILITY',     false,  30),
    ('wheelchair-accessible', 'ACCESSIBILITY',     false,  40),

    -- Family
    ('cot-available',         'FAMILY',            false,  10),
    ('extra-bed',             'FAMILY',            false,  20),
    ('connecting-rooms',      'FAMILY',            false,  30)

ON CONFLICT (code) DO UPDATE SET
    category     = EXCLUDED.category,
    is_highlight = EXCLUDED.is_highlight,
    sort_order   = EXCLUDED.sort_order,
    updated_at   = now();
