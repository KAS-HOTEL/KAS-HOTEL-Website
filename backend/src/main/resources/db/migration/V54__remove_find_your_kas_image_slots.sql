-- V54 — Remove the two Find Your KAS image slots.
--
-- find-your-kas.html was removed with Homepage V3 (2026-11-05; old links redirect to
-- hotels.html), so nothing on the website reads these slots any more. Owner decision,
-- 2026-11-08: delete them rather than hide them.
--
-- Affected: two rows of site_image_slot (group_key 'findYourKas'). Nothing references
-- site_image_slot by foreign key. Rollback: re-insert the two rows from V33 (keys
-- find.zero.main and find.zero.card); any image reference they held is lost.
--
-- The trip groups once shown on that page (trip_intent) are untouched: they still drive
-- the "Cách lưu trú" filter on hotels.html.

DELETE FROM site_image_slot WHERE slot_key IN ('find.zero.main', 'find.zero.card');
