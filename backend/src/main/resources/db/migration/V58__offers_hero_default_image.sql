-- =============================================================================
-- V58 — Membership ("Ưu đãi") page hero uses the approved demo image (owner, 2026-11-09).
--
-- The page was rebuilt from KAS_Membership_Interactive_2026_v2_UPDATED.html; its hero image ships
-- with the website as /assets/membership/membership-hero.jpg. Making it the slot's default means:
--   * the console shows it as "Ảnh mặc định" and "Dùng ảnh mặc định" returns to it;
--   * the website gets it from the console, which wins over the old admin's JSON value.
--
-- The current image is cleared only when it is the watermarked Unsplash+ photo set through the
-- old admin on 2026-10-05; any other image an Admin has chosen is kept.
-- =============================================================================

UPDATE site_image_slot
   SET default_reference = '/assets/membership/membership-hero.jpg',
       selector = '.mship-hero__visual',
       updated_at = now()
 WHERE slot_key = 'page.hero.offers';

UPDATE site_image_slot
   SET current_reference = NULL,
       updated_at = now()
 WHERE slot_key = 'page.hero.offers'
   AND current_reference LIKE 'https://plus.unsplash.com/premium_photo-1719955783083-6a0bd66c5f75%';
