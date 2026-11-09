-- Owner decision 2026-11-08: the default membership tier is called Classic
-- instead of Silver. Rules are unchanged (default tier, 0 completed bookings,
-- 0% cashback, 10% member discount).
--
-- The tier code changes too, because the customer profile and the admin
-- customer filter show and send the code itself. Every foreign key points at
-- membership_tier.id, so renaming the code keeps tier history, cashback and
-- reservation links intact. reservation_loyalty_snapshot.tier_code_snapshot is
-- left as it was: it records the tier name at booking time.
--
-- The code CLASSIC was used before V34 renamed it to MEMBER (now archived), so
-- it is free again.

UPDATE membership_tier SET code = 'CLASSIC', updated_at = now()
WHERE code = 'SILVER';

UPDATE cashback_program SET code = 'MEMBERSHIP_CLASSIC', updated_at = now()
WHERE code = 'MEMBERSHIP_SILVER';

UPDATE membership_tier_translation tr SET display_name = 'Classic'
  FROM membership_tier t
 WHERE tr.tier_id = t.id AND t.code = 'CLASSIC';
