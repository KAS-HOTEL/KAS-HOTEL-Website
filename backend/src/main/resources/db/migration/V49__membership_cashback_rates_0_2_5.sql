-- Membership cashback rates (owner decision 2026-11-05), following V48:
--   Silver 0% (the default tier earns no points), Gold 2%, Platinum 5%.
-- Kept separate from V48 because V48 was already applied to kas_web_test and
-- an applied migration must not change.

UPDATE membership_tier SET cashback_rate_percent = CASE code
    WHEN 'SILVER' THEN 0 WHEN 'GOLD' THEN 2 WHEN 'PLATINUM' THEN 5 END,
  updated_at = now()
WHERE code IN ('SILVER', 'GOLD', 'PLATINUM');

UPDATE cashback_program cp SET earn_rate_percent = t.cashback_rate_percent, updated_at = now()
  FROM membership_tier t
 WHERE cp.membership_tier_id = t.id AND t.code IN ('SILVER', 'GOLD', 'PLATINUM');

UPDATE membership_tier_translation tr SET description = CASE tr.locale
    WHEN 'vi' THEN 'Hạng mặc định khi tạo tài khoản; chưa tích điểm.'
    ELSE 'Default tier for every new account; no points earned.' END
  FROM membership_tier t
 WHERE tr.tier_id = t.id AND t.code = 'SILVER';
