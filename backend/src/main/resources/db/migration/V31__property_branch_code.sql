-- =============================================================================
-- V31 — A stable two-digit branch code per property
-- Source: STEP "FINAL PARTNER COMPLETION" PARTS 12-14 — booking references
--         become KAS + 2-digit branch code + 5 random digits.
-- =============================================================================
-- The reference format needs a number that identifies the hotel and never
-- changes. Nothing in the schema carried one: `property` has a uuid, a slug and
-- a `sort_order`, and none of the three is suitable.
--
--   uuid        deriving digits from it would be arbitrary and unreadable, and
--               the brief forbids it outright
--   slug        text, and renameable
--   sort_order  presentation order, which an operator is free to change — a
--               booking code that moved when someone reordered a list would
--               re-point historical references at the wrong hotel
--
-- So the code becomes master data in its own column: assigned once, unique
-- within the partner, and never recomputed.
--
-- NULLABLE, deliberately. A property created after this migration has no code
-- until one is assigned, and that must be a loud, specific refusal at booking
-- time (CONFIG_MISSING) rather than a reference containing "null" or a code
-- silently derived from something else.
-- =============================================================================

ALTER TABLE property ADD COLUMN branch_code text;

-- Exactly two digits, leading zero included. `text` rather than char(2) so a
-- value is never blank-padded into '5 ' on read.
ALTER TABLE property
    ADD CONSTRAINT property_branch_code_format
    CHECK (branch_code IS NULL OR branch_code ~ '^[0-9]{2}$');

-- Unique per partner, which is the scope the brief names: "unique branch codes
-- within the Partner's current portfolio". Partial, so the eight assigned codes
-- are enforced while any number of future properties may sit at NULL.
CREATE UNIQUE INDEX property_branch_code_idx
    ON property (partner_id, branch_code)
    WHERE branch_code IS NOT NULL;

-- -----------------------------------------------------------------------------
-- The V1 mapping for the KAS portfolio.
--
-- 05 is fixed by the owner: Kas Passion Boutique Hotel is the 5 Trương Định
-- branch, and that code is not ours to choose. The other seven take the
-- remaining codes in ascending order, following the `sort_order` the portfolio
-- was seeded with in V23 — so the assignment is deterministic and reproducible
-- rather than arbitrary:
--
--   sort_order  property                        branch
--   1           kas-passion-boutique-hotel      05   (5 Trương Định — fixed)
--   2           kas-elegance-hotel              01
--   3           kas-ancient-boutique-hotel      02
--   4           kas-milestone-premium-hotel     03
--   5           kas-zody-boutique-hotel         04
--   6           kas-sonata-luxury-hotel         06
--   7           kas-eliana-luxury-hotel         07
--   8           kas-dilly-hotel                 08
--
-- Matched on `slug` rather than on a uuid: slugs are what V23 seeded and what a
-- reader can check by eye. Idempotent — a re-run writes the same values, and a
-- property that already has a code is left alone, so this can never renumber a
-- branch that bookings already refer to.
-- -----------------------------------------------------------------------------

UPDATE property p
   SET branch_code = seed.branch_code
  FROM (VALUES
      ('kas-passion-boutique-hotel',  '05'),
      ('kas-elegance-hotel',          '01'),
      ('kas-ancient-boutique-hotel',  '02'),
      ('kas-milestone-premium-hotel', '03'),
      ('kas-zody-boutique-hotel',     '04'),
      ('kas-sonata-luxury-hotel',     '06'),
      ('kas-eliana-luxury-hotel',     '07'),
      ('kas-dilly-hotel',             '08')
  ) AS seed(slug, branch_code)
 WHERE p.slug = seed.slug
   AND p.branch_code IS NULL;

-- -----------------------------------------------------------------------------
-- `reservation.reference` already carries the guarantee this format relies on:
-- V12 created it with `CONSTRAINT reservation_reference_key UNIQUE (reference)`,
-- table-wide and therefore global across every property and partner. No index is
-- added here — the constraint exists, and a second one would be redundant.
--
-- Historical references (KAS-YYMMDD-XXXX) stay exactly as they are. The column
-- is `text` with no format CHECK, which is what lets the old and the new shape
-- coexist; adding one now would invalidate rows that are real bookings.
-- -----------------------------------------------------------------------------
