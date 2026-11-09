-- V34: Align the V33 candidate schema with the business decisions confirmed
-- for KAS. Keep this forward-only so the same chain works on fresh AWS RDS
-- and on any development database that has already applied V33.

-- Stable, non-sequential customer lookup code. This backfill is collision
-- checked; new registrations must generate a code in the application and
-- retry on the unique constraint.
ALTER TABLE customer ADD COLUMN customer_code text;
DO $$
DECLARE c record;
candidate text;
BEGIN
  FOR c IN SELECT id FROM customer WHERE customer_code IS NULL LOOP
    LOOP
      candidate := 'KAS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM customer WHERE customer_code = candidate);
    END LOOP;
    UPDATE customer SET customer_code = candidate WHERE id = c.id;
  END LOOP;
END $$;
ALTER TABLE customer ALTER COLUMN customer_code SET NOT NULL;
ALTER TABLE customer ADD CONSTRAINT customer_code_format CHECK (customer_code ~ '^KAS-[A-F0-9]{12}$');
ALTER TABLE customer ADD CONSTRAINT customer_code_unique UNIQUE (customer_code);

-- Quarterly qualification uses actual occupied nights, split by local stay
-- date. Historical ledger rows are retained and corrections are append-only.
ALTER TABLE membership_tier ALTER COLUMN qualifying_completed_bookings DROP NOT NULL;
UPDATE membership_tier SET code = 'MEMBER', sort_order = 0,
  qualifying_nights = 0, qualifying_completed_bookings = NULL,
  cashback_rate_percent = 0
WHERE code = 'CLASSIC';
UPDATE membership_tier SET qualifying_nights = 20, qualifying_completed_bookings = NULL,
  cashback_rate_percent = 3 WHERE code = 'GOLD';
UPDATE membership_tier SET qualifying_nights = 30, qualifying_completed_bookings = NULL,
  cashback_rate_percent = 5 WHERE code = 'PLATINUM';
INSERT INTO membership_tier
  (code,status,sort_order,qualifying_nights,qualification_period_months,
   qualifying_completed_bookings,discount_percent,cashback_rate_percent,
   early_checkin_hours,late_checkout_hours,free_cancellation_days_before_checkin,
   free_cancellation_cutoff_time,qualification_period_kind)
VALUES ('SILVER','ACTIVE',1,10,3,NULL,10,1,2,2,0,TIME '12:00','CALENDAR_QUARTER')
ON CONFLICT (code) DO UPDATE SET status='ACTIVE', sort_order=1,
  qualifying_nights=10, qualifying_completed_bookings=NULL,
  qualification_period_months=3, discount_percent=10, cashback_rate_percent=1,
  updated_at=now();

UPDATE membership_tier_translation tr SET display_name='Member',
  description='Hạng mặc định; chưa tích điểm.'
FROM membership_tier t WHERE tr.tier_id=t.id AND t.code='MEMBER' AND tr.locale='vi';
UPDATE membership_tier_translation tr SET display_name='Member',
  description='Default tier; no points earned.'
FROM membership_tier t WHERE tr.tier_id=t.id AND t.code='MEMBER' AND tr.locale='en';
INSERT INTO membership_tier_translation(tier_id,locale,display_name,description)
SELECT t.id,v.locale,v.name,v.description FROM membership_tier t
CROSS JOIN (VALUES ('vi'::char(2),'Member','Hạng mặc định; chưa tích điểm.'),
 ('en'::char(2),'Member','Default tier; no points earned.'),
 ('vi'::char(2),'Silver','Từ 10 đêm lưu trú thực tế trong quý.'),
 ('en'::char(2),'Silver','10 actual stay nights in a calendar quarter.'),
 ('vi'::char(2),'Gold','Từ 20 đêm lưu trú thực tế trong quý.'),
 ('en'::char(2),'Gold','20 actual stay nights in a calendar quarter.'),
 ('vi'::char(2),'Platinum','Từ 30 đêm lưu trú thực tế trong quý.'),
 ('en'::char(2),'Platinum','30 actual stay nights in a calendar quarter.'))
 v(locale,name,description)
WHERE t.code=CASE v.name WHEN 'Member' THEN 'MEMBER' WHEN 'Silver' THEN 'SILVER'
 WHEN 'Gold' THEN 'GOLD' ELSE 'PLATINUM' END
ON CONFLICT (tier_id,locale) DO UPDATE SET display_name=EXCLUDED.display_name,
 description=EXCLUDED.description;

UPDATE membership_discount_policy SET stacking_policy='VOUCHER_THEN_MEMBER_10_PERCENT_THEN_POINTS'
WHERE status='ACTIVE';
UPDATE cashback_program cp SET earn_rate_percent=t.cashback_rate_percent
FROM membership_tier t WHERE cp.membership_tier_id=t.id;
UPDATE cashback_program SET code='MEMBERSHIP_MEMBER' WHERE code='MEMBERSHIP_CLASSIC';
UPDATE cashback_program SET eligible_basis_code='PAID_ROOM_SUBTOTAL_AFTER_VOUCHER_AND_MEMBER_DISCOUNT_EXCLUDING_TAX_FEES'
WHERE membership_tier_id IS NOT NULL;
INSERT INTO cashback_program
 (code,membership_tier_id,status,currency,earn_rate_percent,eligible_basis_code,redemption_enabled)
SELECT 'MEMBERSHIP_'||code,id,'ACTIVE','VND',cashback_rate_percent,
 'PAID_ROOM_SUBTOTAL_AFTER_VOUCHER_AND_MEMBER_DISCOUNT_EXCLUDING_TAX_FEES',false
FROM membership_tier WHERE code='SILVER'
ON CONFLICT (code) DO UPDATE SET membership_tier_id=EXCLUDED.membership_tier_id,
 status='ACTIVE',earn_rate_percent=EXCLUDED.earn_rate_percent,
 eligible_basis_code=EXCLUDED.eligible_basis_code,updated_at=now();
ALTER TABLE cashback_account ADD COLUMN debt_points bigint NOT NULL DEFAULT 0;
ALTER TABLE cashback_account ADD CONSTRAINT cashback_account_debt_nonneg CHECK (debt_points>=0);

DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM reservation r JOIN distribution_channel d ON d.id=r.distribution_channel_id
   WHERE d.code IN ('BOOKING_COM','AGODA','CTRIP','TRAVELOKA')
 ) THEN
   RAISE EXCEPTION 'OTA channel reservations exist; review historical records before disabling legacy OTA channels';
 END IF;
 UPDATE distribution_channel SET is_active=false, updated_at=now()
 WHERE code IN ('BOOKING_COM','AGODA','CTRIP','TRAVELOKA');
END $$;

CREATE TABLE customer_membership_night_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 membership_id uuid NOT NULL REFERENCES customer_membership(id) ON DELETE RESTRICT,
 reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE RESTRICT,
 stay_night date NOT NULL,
 night_delta smallint NOT NULL CHECK (night_delta IN (-1,1)),
 reverses_id uuid REFERENCES customer_membership_night_ledger(id) ON DELETE RESTRICT,
 event_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((night_delta=1 AND reverses_id IS NULL) OR (night_delta=-1 AND reverses_id IS NOT NULL))
);
CREATE INDEX customer_membership_night_quarter_idx
 ON customer_membership_night_ledger(membership_id,stay_night);
CREATE UNIQUE INDEX customer_membership_night_once_idx
 ON customer_membership_night_ledger(membership_id,reservation_id,stay_night)
 WHERE night_delta=1;

-- Rolling three-month earn-lot expiry in Vietnam local time.
DROP TRIGGER cashback_earn_quarter_expiry_trg ON cashback_ledger;
DROP FUNCTION kas_set_cashback_quarter_expiry();
CREATE FUNCTION kas_set_cashback_three_month_expiry()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.entry_type='EARN' AND NEW.expires_at IS NULL THEN
   NEW.expires_at := (NEW.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' + interval '3 months')
                     AT TIME ZONE 'Asia/Ho_Chi_Minh';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cashback_earn_three_month_expiry_trg
 BEFORE INSERT ON cashback_ledger FOR EACH ROW EXECUTE FUNCTION kas_set_cashback_three_month_expiry();
COMMENT ON COLUMN cashback_ledger.expires_at IS
 'Earned points expire three calendar months after their earned timestamp in Asia/Ho_Chi_Minh.';

-- Explicit FEFO provenance for spending and holds, including returns to the
-- original earn lot. Application transactions must lock the account row.
CREATE TABLE cashback_ledger_allocation (
 ledger_entry_id uuid NOT NULL REFERENCES cashback_ledger(id) ON DELETE RESTRICT,
 earn_entry_id uuid NOT NULL REFERENCES cashback_ledger(id) ON DELETE RESTRICT,
 points_amount bigint NOT NULL CHECK(points_amount>0),
 PRIMARY KEY(ledger_entry_id,earn_entry_id)
);
CREATE TABLE cashback_hold_allocation (
 hold_id uuid NOT NULL REFERENCES cashback_hold(id) ON DELETE RESTRICT,
 earn_entry_id uuid NOT NULL REFERENCES cashback_ledger(id) ON DELETE RESTRICT,
 points_amount bigint NOT NULL CHECK(points_amount>0),
 PRIMARY KEY(hold_id,earn_entry_id)
);

-- Phone quotes are auditable, expire after 15 minutes and do not hold rooms or
-- points. Booking creation must reprice/recheck and atomically consume quote.
CREATE TYPE reservation_quote_status AS ENUM ('DRAFT','ACCEPTED','DECLINED','EXPIRED','CONSUMED','SUPERSEDED');
CREATE TABLE reservation_quote (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 quote_code text NOT NULL UNIQUE,
 customer_id uuid REFERENCES customer(id) ON DELETE RESTRICT,
 status reservation_quote_status NOT NULL DEFAULT 'DRAFT',
 currency char(3) NOT NULL DEFAULT 'VND' CHECK(currency='VND'),
 price_snapshot jsonb NOT NULL CHECK(jsonb_typeof(price_snapshot)='object'),
 points_choice text NOT NULL CHECK(points_choice IN ('ACCEPTED','DECLINED','NOT_OFFERED')),
 points_offered bigint NOT NULL DEFAULT 0 CHECK(points_offered>=0),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 declined_at timestamptz,
 consumed_reservation_id uuid UNIQUE REFERENCES reservation(id) ON DELETE RESTRICT,
 created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at > created_at),
 CHECK((status<>'ACCEPTED') OR accepted_at IS NOT NULL),
 CHECK((status<>'DECLINED') OR declined_at IS NOT NULL),
 CHECK((status<>'CONSUMED') OR consumed_reservation_id IS NOT NULL)
);
CREATE INDEX reservation_quote_customer_idx ON reservation_quote(customer_id,created_at DESC);
CREATE INDEX reservation_quote_expiry_idx ON reservation_quote(expires_at) WHERE status='DRAFT';
CREATE TABLE reservation_quote_line (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 quote_id uuid NOT NULL REFERENCES reservation_quote(id) ON DELETE RESTRICT,
 property_id uuid NOT NULL REFERENCES property(id) ON DELETE RESTRICT,
 room_type_id uuid NOT NULL REFERENCES room_type(id) ON DELETE RESTRICT,
 check_in date NOT NULL,
 check_out date NOT NULL,
 room_count smallint NOT NULL CHECK(room_count>0),
 adults smallint NOT NULL CHECK(adults>0),
 children smallint NOT NULL DEFAULT 0 CHECK(children>=0),
 CHECK(check_out>check_in)
);
CREATE INDEX reservation_quote_line_quote_idx ON reservation_quote_line(quote_id);

COMMENT ON TABLE reservation_quote IS
 'Phone booking offer captured for customer approval; no inventory or points are held before accepted quote is submitted for booking.';

