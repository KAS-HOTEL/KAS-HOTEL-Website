-- V55 — Website image slots follow the current website (owner decisions, 2026-11-08).
--
-- 1. Add a slot for the Guidebook place "Chợ Ẩm thực Bến Thành" (ben-thanh-street-food), the only
--    place in js/guide-data.js with no slot of its own. Places that appear in several chapters
--    (e.g. ben-thanh-market-walk) share their base place's slot, so they need none.
-- 2. Delete the three homepage slots the Homepage V3 no longer shows: the "neighbourhood story"
--    cards 02–04 (taste, slow, night). Homepage V3 keeps one image of that section,
--    home.neighborhood.city.
--
-- Affected: site_image_slot only (one row added, three deleted). Nothing references
-- site_image_slot by foreign key. Rollback: delete guidebook.entry.ben-thanh-street-food and
-- re-insert the three rows from V33; any image reference they held is lost.

INSERT INTO site_image_slot (slot_key, group_key, label, selector, default_reference, sort_order)
VALUES ('guidebook.entry.ben-thanh-street-food', 'guidebook', 'Guidebook · ben-thanh-street-food',
        '.entry#ben-thanh-street-food .photo', '', 27)
ON CONFLICT (slot_key) DO NOTHING;

DELETE FROM site_image_slot
 WHERE slot_key IN ('home.neighborhood.taste', 'home.neighborhood.slow', 'home.neighborhood.night');
