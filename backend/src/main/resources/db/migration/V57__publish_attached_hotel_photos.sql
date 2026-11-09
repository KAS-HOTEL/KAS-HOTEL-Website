-- =============================================================================
-- V57 — Hotel and room photos attached in the console go on the website (owner decision
-- 2026-11-08). The console never offered a publish step, so every photo attached so far is
-- still a draft and the website keeps showing its old images instead.
--
-- From now on the API publishes a photo when Admin attaches it (MediaService
-- .publishForWebsite). This migration does the same once for photos already attached:
--   1. alt text a photo lacks is filled in as "<hotel or room name> – <gallery group>",
--      in Vietnamese and English (doc 62 §5 still requires both);
--   2. the asset and its hotel/room links are published.
-- Only photos with bytes (a finished upload or an external URL) and not archived.
-- No row is deleted; an existing non-empty alt text is never changed.
-- =============================================================================

CREATE TEMPORARY TABLE v57_photo ON COMMIT DROP AS
SELECT DISTINCT ON (a.id) a.id AS asset_id, a.category::text AS category, l.owner_type::text AS owner_type, l.owner_id
  FROM media_link l
  JOIN media_asset a ON a.id = l.media_asset_id
 WHERE l.owner_type IN ('PROPERTY', 'ROOM_TYPE')
   AND l.status <> 'ARCHIVED'
   AND a.status <> 'ARCHIVED'
   AND a.archived_at IS NULL
   AND (a.checksum IS NOT NULL OR a.external_url IS NOT NULL)
 ORDER BY a.id, l.is_cover DESC, l.created_at;

INSERT INTO media_asset_translation (media_asset_id, locale, alt_text)
SELECT p.asset_id, loc.locale,
       coalesce(
           CASE p.owner_type
               WHEN 'PROPERTY' THEN coalesce(
                   (SELECT nullif(btrim(t.name), '') FROM property_translation t WHERE t.property_id = p.owner_id AND t.locale = loc.locale),
                   (SELECT nullif(btrim(t.name), '') FROM property_translation t WHERE t.property_id = p.owner_id ORDER BY t.locale DESC LIMIT 1))
               ELSE coalesce(
                   (SELECT nullif(btrim(t.name), '') FROM room_type_translation t WHERE t.room_type_id = p.owner_id AND t.locale = loc.locale),
                   (SELECT nullif(btrim(t.name), '') FROM room_type_translation t WHERE t.room_type_id = p.owner_id ORDER BY t.locale DESC LIMIT 1))
           END, 'KAS')
       || ' – ' ||
       CASE p.category
           WHEN 'ROOM'     THEN CASE loc.locale WHEN 'vi' THEN 'Phòng nghỉ'    ELSE 'Room' END
           WHEN 'LOBBY'    THEN CASE loc.locale WHEN 'vi' THEN 'Sảnh & lễ tân' ELSE 'Lobby' END
           WHEN 'DINING'   THEN CASE loc.locale WHEN 'vi' THEN 'Ẩm thực'       ELSE 'Dining' END
           WHEN 'FACILITY' THEN CASE loc.locale WHEN 'vi' THEN 'Tiện ích'      ELSE 'Facilities' END
           WHEN 'ROOFTOP'  THEN CASE loc.locale WHEN 'vi' THEN 'Sân thượng'    ELSE 'Rooftop' END
           WHEN 'EXTERIOR' THEN CASE loc.locale WHEN 'vi' THEN 'Ngoại thất'    ELSE 'Exterior' END
           ELSE                 CASE loc.locale WHEN 'vi' THEN 'Hình ảnh'      ELSE 'Photo' END
       END
  FROM v57_photo p
 CROSS JOIN (VALUES ('vi'), ('en')) AS loc(locale)
ON CONFLICT (media_asset_id, locale) DO UPDATE
   SET alt_text = EXCLUDED.alt_text
 WHERE length(btrim(media_asset_translation.alt_text)) = 0;

UPDATE media_asset a
   SET status = 'PUBLISHED', updated_at = now()
  FROM v57_photo p
 WHERE a.id = p.asset_id AND a.status = 'DRAFT';

UPDATE media_link l
   SET status = 'PUBLISHED', updated_at = now()
 WHERE l.owner_type IN ('PROPERTY', 'ROOM_TYPE')
   AND l.status = 'DRAFT'
   AND l.media_asset_id IN (SELECT asset_id FROM v57_photo);
