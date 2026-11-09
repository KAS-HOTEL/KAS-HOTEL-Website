-- =============================================================================
-- V28 — The registrant's own name and phone number on app_user
-- Source: STEP G PART F — "Step 1: Họ và tên, Email, Số điện thoại, Mật khẩu"
-- =============================================================================
-- Partner self-registration collects four things about a person, and until now
-- app_user could store only two of them: it held an email, a credential and a
-- status, and nothing else. A registration form that asks for a name and a
-- phone number and then discards both is a form that lies to whoever fills it
-- in, so the two columns exist here rather than the two questions being cut.
--
-- Why on app_user and not on partner:
--
--   These are attributes of the PERSON signing in, not of the business. The
--   business's names already have their columns — partner.legal_name and
--   partner.display_name — and the registration flow writes those at its second
--   step. Putting a human's phone number on the partner row would make it the
--   company switchboard, which it is not.
--
-- Both are NULLABLE. Every account that existed before this migration was
-- created without them (the V1 operator, any staff account), and back-filling a
-- name for a real person from a slug or an email local part would be inventing
-- one. NULL means "not recorded", which is the truth.
--
-- No existing table, constraint, index or trigger is touched, and V1–V27 are
-- untouched.
-- =============================================================================

ALTER TABLE app_user
    ADD COLUMN full_name text,
    ADD COLUMN phone     text;

-- Length ceilings only. Shape is not constrained here on purpose: Vietnamese
-- mobile numbers, landlines and +84 international form are all legitimate, and
-- a regex tight enough to be useful would reject a real operator's number the
-- day KAS takes a partner outside Vietnam. The application validates the shape
-- it is willing to accept; the database refuses only what could not be a name
-- or a number at all.
ALTER TABLE app_user
    ADD CONSTRAINT app_user_full_name_len CHECK (full_name IS NULL OR char_length(full_name) BETWEEN 1 AND 200),
    ADD CONSTRAINT app_user_phone_len     CHECK (phone     IS NULL OR char_length(phone)     BETWEEN 3 AND 32);

COMMENT ON COLUMN app_user.full_name IS
    'The account holder''s own name, as given at registration. NULL for accounts created before V28 or provisioned without one.';
COMMENT ON COLUMN app_user.phone IS
    'The account holder''s contact number, as given at registration. Not the property phone — that lives on property.phone.';
