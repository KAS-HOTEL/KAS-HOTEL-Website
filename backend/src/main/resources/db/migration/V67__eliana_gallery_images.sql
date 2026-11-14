-- =============================================================================
-- V67 — KAS Eliana Luxury Hotel gallery (2026-11-13).
--
-- The website and console showed only the placeholder for Eliana: V60 registered the old admin's
-- uploads/property photos of hotel-01..04 only, so the 9 Eliana photos (old admin
-- uploads/property/hotel-07, KAS-HOTEL-Website commit 67bf058) never reached /img or the console.
-- The files now ship in frontend/img/hotels/kas-eliana-luxury-hotel/gallery/ and are registered
-- here exactly like V60: published PUBLIC property photos, placed after any photo the hotel
-- already has (display_order 100+); the first one becomes the cover only when the hotel has none.
-- Idempotent: every insert skips rows that already exist. Data only, no schema change.
-- =============================================================================

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT 'c347bbc8-ae1b-5cab-b7a5-085bb2b6bbaa', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-01.jpg', 'image/jpeg', CAST('ROOM' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Phòng nghỉ'), ('en', 'KAS Eliana Luxury Hotel – Room')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-01.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 100, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-01.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

UPDATE media_link l SET is_cover = true FROM media_asset a, property p
 WHERE l.media_asset_id = a.id AND a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-01.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
   AND l.owner_type = 'PROPERTY' AND l.owner_id = p.id
   AND NOT EXISTS (SELECT 1 FROM media_link c WHERE c.owner_type = 'PROPERTY' AND c.owner_id = p.id AND c.is_cover);

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT 'b2a854bd-f620-5a8a-a62d-8b2c4afe0cf3', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-02.jpg', 'image/jpeg', CAST('ROOM' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Phòng nghỉ'), ('en', 'KAS Eliana Luxury Hotel – Room')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-02.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 101, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-02.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT '810e25b0-effc-5c6b-8751-bb4bce383c56', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-03.jpg', 'image/jpeg', CAST('ROOM' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Phòng nghỉ'), ('en', 'KAS Eliana Luxury Hotel – Room')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-03.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 102, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-03.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT 'e9d074aa-0302-52dd-a4b7-6f1ea17f62b3', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-04.jpg', 'image/jpeg', CAST('ROOM' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Phòng nghỉ'), ('en', 'KAS Eliana Luxury Hotel – Room')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-04.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 103, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-04.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT '89330fca-f6f4-5ab8-8f08-e4d329bc0a67', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-05.jpg', 'image/jpeg', CAST('ROOM' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Phòng nghỉ'), ('en', 'KAS Eliana Luxury Hotel – Room')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-05.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 104, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-05.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT '26560882-522d-5743-bca9-48200cc4534c', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-06.jpg', 'image/jpeg', CAST('ROOM' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Phòng nghỉ'), ('en', 'KAS Eliana Luxury Hotel – Room')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-06.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 105, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/rooms/kas-eliana-luxury-hotel-rooms-06.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT 'b91b5e75-ad73-5de6-810d-3b579b44b752', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-01.jpg', 'image/jpeg', CAST('FACILITY' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Tiện ích'), ('en', 'KAS Eliana Luxury Hotel – Facilities')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-01.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 106, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-01.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT 'b002ceee-98d6-5281-91f6-088657d28e16', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-02.jpg', 'image/jpeg', CAST('FACILITY' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Tiện ích'), ('en', 'KAS Eliana Luxury Hotel – Facilities')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-02.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 107, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-02.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;

INSERT INTO media_asset (id, partner_id, external_url, mime_type, category, status, visibility)
SELECT 'd6786bdb-d573-5bc9-bea1-b3c23d0859b0', p.partner_id, '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-03.jpg', 'image/jpeg', CAST('FACILITY' AS media_category), 'PUBLISHED', 'PUBLIC'
  FROM property p WHERE p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT DO NOTHING;
INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT a.id, v.locale, v.alt FROM media_asset a CROSS JOIN (VALUES ('vi', 'KAS Eliana Luxury Hotel – Tiện ích'), ('en', 'KAS Eliana Luxury Hotel – Facilities')) v(locale, alt)
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-03.jpg'
ON CONFLICT (media_asset_id, locale) DO NOTHING;

INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order, is_cover, status)
SELECT a.id, 'PROPERTY', p.id, 108, false, 'PUBLISHED' FROM media_asset a, property p
 WHERE a.external_url = '/img/hotels/kas-eliana-luxury-hotel/gallery/amenities/kas-eliana-luxury-hotel-amenities-03.jpg' AND p.slug = 'kas-eliana-luxury-hotel'
ON CONFLICT (owner_type, owner_id, media_asset_id) DO NOTHING;
