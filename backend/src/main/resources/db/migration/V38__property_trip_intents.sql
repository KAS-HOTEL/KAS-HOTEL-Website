-- The Find Your KAS editorial groups are data, not a list of hotel slugs in the
-- Next.js bundle. A new property can be assigned to one or more existing groups
-- through the property management flow without a frontend release.
CREATE TABLE trip_intent (
    code       varchar(40) PRIMARY KEY,
    sort_order smallint NOT NULL UNIQUE CHECK (sort_order > 0)
);

CREATE TABLE trip_intent_translation (
    intent_code varchar(40) NOT NULL REFERENCES trip_intent(code) ON DELETE CASCADE,
    locale      varchar(2) NOT NULL CHECK (locale IN ('vi', 'en')),
    label       varchar(80) NOT NULL CHECK (length(btrim(label)) > 0),
    description varchar(220) NOT NULL CHECK (length(btrim(description)) > 0),
    PRIMARY KEY (intent_code, locale)
);

CREATE TABLE property_trip_intent (
    property_id uuid NOT NULL REFERENCES property(id) ON DELETE CASCADE,
    intent_code varchar(40) NOT NULL REFERENCES trip_intent(code) ON DELETE RESTRICT,
    sort_order  smallint NOT NULL CHECK (sort_order > 0),
    PRIMARY KEY (property_id, intent_code),
    UNIQUE (property_id, sort_order)
);

CREATE INDEX property_trip_intent_by_intent_idx
    ON property_trip_intent (intent_code, property_id);

INSERT INTO trip_intent (code, sort_order) VALUES
    ('family', 1),
    ('slow', 2),
    ('business', 3),
    ('long', 4);

INSERT INTO trip_intent_translation (intent_code, locale, label, description) VALUES
    ('family', 'en', 'Family trip', 'Central sights, easy movement and a comfortable base for discovering Saigon together.'),
    ('family', 'vi', 'Chuyến đi gia đình', 'Gần các điểm tham quan trung tâm, thuận tiện di chuyển và là điểm nghỉ thoải mái để cùng khám phá Sài Gòn.'),
    ('slow', 'en', 'Slow traveller', 'Neighbourhood walks, cafés and a more local rhythm.'),
    ('slow', 'vi', 'Du lịch chậm', 'Tản bộ trong khu phố, ghé quán cà phê và tận hưởng nhịp sống địa phương.'),
    ('business', 'en', 'Business', 'Connected locations and a comfortable base between meetings.'),
    ('business', 'vi', 'Công tác', 'Vị trí thuận tiện kết nối và một nơi nghỉ thoải mái giữa những cuộc gặp.'),
    ('long', 'en', 'Longer stay', 'More space, familiar surroundings and room to settle in.'),
    ('long', 'vi', 'Lưu trú dài ngày', 'Nhiều không gian hơn, môi trường quen thuộc và đủ thoải mái để ở lâu hơn.');

-- Preserve the exact legacy frontend grouping for the existing eight hotels.
-- New hotels are not assigned automatically; a Partner chooses applicable
-- groups through the management surface.
INSERT INTO property_trip_intent (property_id, intent_code, sort_order)
SELECT p.id, seed.intent_code, seed.sort_order
  FROM (VALUES
      ('kas-passion-boutique-hotel', 'family', 1),
      ('kas-elegance-hotel', 'family', 1),
      ('kas-ancient-boutique-hotel', 'family', 1),
      ('kas-milestone-premium-hotel', 'family', 1),
      ('kas-passion-boutique-hotel', 'slow', 2),
      ('kas-ancient-boutique-hotel', 'slow', 2),
      ('kas-zody-boutique-hotel', 'slow', 2),
      ('kas-sonata-luxury-hotel', 'slow', 2),
      ('kas-eliana-luxury-hotel', 'slow', 2),
      ('kas-dilly-hotel', 'slow', 2),
      ('kas-elegance-hotel', 'business', 3),
      ('kas-milestone-premium-hotel', 'business', 3),
      ('kas-sonata-luxury-hotel', 'business', 3),
      ('kas-eliana-luxury-hotel', 'business', 3),
      ('kas-dilly-hotel', 'business', 3),
      ('kas-ancient-boutique-hotel', 'long', 4),
      ('kas-zody-boutique-hotel', 'long', 4),
      ('kas-sonata-luxury-hotel', 'long', 4),
      ('kas-eliana-luxury-hotel', 'long', 4),
      ('kas-dilly-hotel', 'long', 4)
  ) AS seed(slug, intent_code, sort_order)
  JOIN property p ON p.slug = seed.slug;
