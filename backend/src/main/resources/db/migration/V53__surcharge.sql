-- V53 — Surcharges (phụ thu) and the conditions they apply under.
--
-- Owner decision, 2026-11-08: room prices and surcharges are managed by SUPER_ADMIN.
-- A surcharge is a fee added on top of the room rate when its conditions hold:
-- early check-in, late check-out, guests above the room's standard occupancy, an
-- extra bed, a holiday period, or anything else SUPER_ADMIN defines.
--
-- property_id NULL means the surcharge applies to every hotel; a property-specific
-- row is for one hotel only. All condition columns are optional and combine with AND;
-- a row with none of them set always applies. condition_note is free text shown to
-- staff and guests for what the structured columns cannot express.
--
-- This table records the surcharges. It does not change how a quote or a reservation
-- total is calculated: that remains room rate, then voucher (TaxIsOutOfScopeForV1Test).

CREATE TABLE surcharge (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id      uuid        REFERENCES property (id) ON DELETE CASCADE,
    code             text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    name             text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    description      text        CHECK (description IS NULL OR char_length(description) <= 2000),
    category         text        NOT NULL CHECK (category IN
                         ('EARLY_CHECK_IN', 'LATE_CHECK_OUT', 'EXTRA_ADULT', 'EXTRA_CHILD',
                          'EXTRA_BED', 'HOLIDAY', 'OTHER')),
    calculation      text        NOT NULL CHECK (calculation IN
                         ('PER_STAY', 'PER_NIGHT', 'PER_PERSON_PER_NIGHT', 'PER_PERSON_PER_STAY',
                          'PERCENT_OF_ROOM_RATE')),
    amount_minor     bigint      CHECK (amount_minor IS NULL OR amount_minor >= 0),
    percent          numeric(5,2) CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
    currency         char(3)     NOT NULL DEFAULT 'VND' CHECK (currency IN ('VND', 'USD')),

    -- Conditions (all optional, combined with AND).
    check_in_from    time,
    check_in_to      time,
    check_out_from   time,
    check_out_to     time,
    min_age          smallint    CHECK (min_age IS NULL OR min_age BETWEEN 0 AND 120),
    max_age          smallint    CHECK (max_age IS NULL OR max_age BETWEEN 0 AND 120),
    above_standard_occupancy boolean NOT NULL DEFAULT false,
    stay_from        date,
    stay_to          date,
    days_of_week     smallint[]  CHECK (days_of_week IS NULL OR days_of_week <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
    min_nights       smallint    CHECK (min_nights IS NULL OR min_nights >= 1),
    condition_note   text        CHECK (condition_note IS NULL OR char_length(condition_note) <= 1000),

    status           text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    is_preset        boolean     NOT NULL DEFAULT false,
    sort_order       integer     NOT NULL DEFAULT 100,
    version          integer     NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    updated_by       uuid        REFERENCES app_user (id) ON DELETE SET NULL,

    -- A percentage surcharge carries a percent; every other one carries an amount.
    CONSTRAINT surcharge_value_matches_calculation CHECK (
        (calculation = 'PERCENT_OF_ROOM_RATE' AND percent IS NOT NULL AND amount_minor IS NULL)
        OR (calculation <> 'PERCENT_OF_ROOM_RATE' AND amount_minor IS NOT NULL AND percent IS NULL)),
    CONSTRAINT surcharge_check_in_window CHECK (
        check_in_from IS NULL OR check_in_to IS NULL OR check_in_from < check_in_to),
    CONSTRAINT surcharge_check_out_window CHECK (
        check_out_from IS NULL OR check_out_to IS NULL OR check_out_from < check_out_to),
    CONSTRAINT surcharge_age_range CHECK (
        min_age IS NULL OR max_age IS NULL OR min_age <= max_age),
    CONSTRAINT surcharge_stay_range CHECK (
        stay_from IS NULL OR stay_to IS NULL OR stay_from <= stay_to)
);

-- One code per hotel, and one code across the all-hotels rows.
CREATE UNIQUE INDEX surcharge_code_global_key ON surcharge (code) WHERE property_id IS NULL;
CREATE UNIQUE INDEX surcharge_code_property_key ON surcharge (property_id, code) WHERE property_id IS NOT NULL;
CREATE INDEX surcharge_property_idx ON surcharge (property_id);

COMMENT ON TABLE surcharge IS
    'Surcharges (phụ thu) on top of the room rate and their conditions. Managed by SUPER_ADMIN.';
COMMENT ON COLUMN surcharge.property_id IS 'NULL = every hotel.';
COMMENT ON COLUMN surcharge.is_preset IS 'Seeded by V53; may be edited or turned off, not deleted.';
COMMENT ON COLUMN surcharge.days_of_week IS 'ISO days, 1 = Monday … 7 = Sunday.';

-- Common surcharges, for every hotel. Extra adult/child match the figures already
-- published on the website (300,000đ and 150,000đ per person per night above the room
-- standard). The others are starting values for SUPER_ADMIN to confirm, so they are
-- created INACTIVE and do not show anywhere until someone turns them on.
INSERT INTO surcharge (code, name, description, category, calculation, amount_minor, percent,
                       check_in_from, check_in_to, check_out_from, check_out_to,
                       min_age, max_age, above_standard_occupancy, condition_note,
                       status, is_preset, sort_order)
VALUES
    ('EXTRA_ADULT', 'Phụ thu người lớn', 'Người lớn ở thêm vượt tiêu chuẩn phòng.',
     'EXTRA_ADULT', 'PER_PERSON_PER_NIGHT', 300000, NULL,
     NULL, NULL, NULL, NULL, 12, NULL, true,
     'Áp dụng cho khách từ 12 tuổi trở lên vượt số người tiêu chuẩn của phòng.',
     'ACTIVE', true, 10),
    ('EXTRA_CHILD', 'Phụ thu trẻ em', 'Trẻ em ở thêm vượt tiêu chuẩn phòng.',
     'EXTRA_CHILD', 'PER_PERSON_PER_NIGHT', 150000, NULL,
     NULL, NULL, NULL, NULL, 3, 11, true,
     'Trẻ từ 3 đến dưới 12 tuổi vượt tiêu chuẩn phòng. Trẻ dưới 3 tuổi miễn phí.',
     'ACTIVE', true, 20),
    ('EARLY_CHECK_IN', 'Nhận phòng sớm', 'Nhận phòng trước giờ nhận phòng tiêu chuẩn (14:00).',
     'EARLY_CHECK_IN', 'PERCENT_OF_ROOM_RATE', NULL, 30,
     '06:00', '14:00', NULL, NULL, NULL, NULL, false,
     'Tính theo giá 1 đêm. Tùy tình trạng phòng trống.',
     'INACTIVE', true, 30),
    ('LATE_CHECK_OUT', 'Trả phòng muộn', 'Trả phòng sau giờ trả phòng tiêu chuẩn (12:00) đến 18:00.',
     'LATE_CHECK_OUT', 'PERCENT_OF_ROOM_RATE', NULL, 30,
     NULL, NULL, '12:00', '18:00', NULL, NULL, false,
     'Tính theo giá 1 đêm. Tùy tình trạng phòng trống.',
     'INACTIVE', true, 40),
    ('LATE_CHECK_OUT_AFTER_18', 'Trả phòng sau 18:00', 'Trả phòng sau 18:00 tính thêm 1 đêm.',
     'LATE_CHECK_OUT', 'PERCENT_OF_ROOM_RATE', NULL, 100,
     NULL, NULL, '18:00', NULL, NULL, NULL, false,
     NULL,
     'INACTIVE', true, 50),
    ('EXTRA_BED', 'Giường phụ', 'Kê thêm một giường phụ trong phòng.',
     'EXTRA_BED', 'PER_NIGHT', 400000, NULL,
     NULL, NULL, NULL, NULL, NULL, NULL, false,
     'Tùy hạng phòng có thể kê thêm giường.',
     'INACTIVE', true, 60),
    ('HOLIDAY', 'Phụ thu Lễ, Tết', 'Phụ thu các ngày Lễ, Tết.',
     'HOLIDAY', 'PERCENT_OF_ROOM_RATE', NULL, 20,
     NULL, NULL, NULL, NULL, NULL, NULL, false,
     'Đặt khoảng ngày áp dụng trước khi bật.',
     'INACTIVE', true, 70);
