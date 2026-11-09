-- Membership qualification changes (owner decision 2026-11-05):
--   * Silver is the default tier every new account starts on; the MEMBER tier
--     introduced in V34 is retired.
--   * Tiers qualify on completed bookings in a calendar quarter instead of stay
--     nights: Silver 0, Gold 15, Platinum 30.
-- Cashback rates (Silver 1%, Gold 3%, Platinum 5%) and the 10% member discount
-- are unchanged. MEMBER is archived, not deleted, because tier history rows
-- reference it with ON DELETE RESTRICT and must stay auditable.

UPDATE membership_tier SET sort_order = 0, qualifying_nights = NULL,
  qualifying_completed_bookings = 0, updated_at = now()
WHERE code = 'SILVER';
UPDATE membership_tier SET sort_order = 1, qualifying_nights = NULL,
  qualifying_completed_bookings = 15, updated_at = now()
WHERE code = 'GOLD';
UPDATE membership_tier SET sort_order = 2, qualifying_nights = NULL,
  qualifying_completed_bookings = 30, updated_at = now()
WHERE code = 'PLATINUM';

-- Customers currently on MEMBER move to SILVER from now on. Their MEMBER
-- history row is closed rather than rewritten.
WITH closed AS (
  UPDATE customer_membership_tier_history h
     SET effective_to = now()
    FROM membership_tier t
   WHERE h.tier_id = t.id AND t.code = 'MEMBER' AND h.effective_to IS NULL
  RETURNING h.membership_id
)
INSERT INTO customer_membership_tier_history
  (membership_id, tier_id, effective_from, change_reason)
SELECT c.membership_id, s.id, now(), 'V48: Silver replaces Member as the default tier'
  FROM closed c
 CROSS JOIN membership_tier s
 WHERE s.code = 'SILVER';

UPDATE membership_tier SET status = 'ARCHIVED', sort_order = 99, updated_at = now()
WHERE code = 'MEMBER';
UPDATE cashback_program SET status = 'ARCHIVED', updated_at = now()
WHERE code = 'MEMBERSHIP_MEMBER';

INSERT INTO membership_tier_translation(tier_id, locale, display_name, description)
SELECT t.id, v.locale, v.name, v.description FROM membership_tier t
CROSS JOIN (VALUES
 ('SILVER',   'vi'::char(2), 'Silver',   'Hạng mặc định khi tạo tài khoản.'),
 ('SILVER',   'en'::char(2), 'Silver',   'Default tier for every new account.'),
 ('GOLD',     'vi'::char(2), 'Gold',     'Từ 15 đơn đặt phòng hoàn tất trong quý.'),
 ('GOLD',     'en'::char(2), 'Gold',     '15 completed bookings in a calendar quarter.'),
 ('PLATINUM', 'vi'::char(2), 'Platinum', 'Từ 30 đơn đặt phòng hoàn tất trong quý.'),
 ('PLATINUM', 'en'::char(2), 'Platinum', '30 completed bookings in a calendar quarter.'))
 v(code, locale, name, description)
WHERE t.code = v.code
ON CONFLICT (tier_id, locale) DO UPDATE SET display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

COMMENT ON COLUMN membership_tier.qualifying_completed_bookings IS
  'Completed bookings (checked out, not cancelled or no-show) needed in one calendar quarter; a booking counts in the quarter of its checkout date.';
COMMENT ON TABLE customer_membership_night_ledger IS
  'Retained for history only. Since V48 tiers qualify on completed bookings, not stay nights.';
