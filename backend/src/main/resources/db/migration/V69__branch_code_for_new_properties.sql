-- BUG-002 (audit 2026-11-12). A hotel created in the console had no branch code (V31 left
-- the column empty for new rows and nothing assigned one), so it could be published but
-- every booking request for it was refused: a reference is KAS + branch code + 5 digits.
--
-- From now on PropertyRepository.create assigns the partner's lowest free two-digit code.
-- This gives one to each hotel created before that, oldest first. Existing codes are not
-- touched. Unique within the partner, the scope V31 set (property_branch_code_idx).
DO $$
DECLARE
    hotel record;
    free_code text;
BEGIN
    FOR hotel IN SELECT id, partner_id FROM property WHERE branch_code IS NULL ORDER BY created_at, id LOOP
        SELECT to_char(n, 'FM00') INTO free_code
          FROM generate_series(1, 99) AS n
         WHERE NOT EXISTS (SELECT 1 FROM property p
                            WHERE p.partner_id = hotel.partner_id
                              AND p.branch_code = to_char(n, 'FM00'))
         ORDER BY n
         LIMIT 1;
        CONTINUE WHEN free_code IS NULL;
        UPDATE property SET branch_code = free_code WHERE id = hotel.id;
    END LOOP;
END $$;
