-- =============================================================================
-- V32 — A policy may belong to a partner, not only to one property
-- Source: STEP "FINAL PARTNER COMPLETION" PARTS 3-5 — shared policies that
--         apply across the portfolio without being copied into every hotel.
-- =============================================================================
-- Today a policy is addressed by `property_id`, and that column is already
-- nullable: V3 uses NULL to mean a *platform* policy (PRIVACY, TERMS, COOKIES —
-- V3:121). So "no property" is taken, and a partner-level policy cannot simply
-- reuse it.
--
-- `partner_id` is therefore added, and the two columns together name the scope:
--
--   partner_id   property_id   meaning
--   ----------   -----------   ---------------------------------------------
--   NULL         NULL          platform policy, as before (PRIVACY/TERMS/…)
--   set          NULL          SHARED — applies to every property of that
--                              partner, stored once
--   set          set           PROPERTY-SPECIFIC — overrides the shared policy
--                              of the same type for that one hotel
--
-- One row per shared policy. The brief is explicit that a shared policy must
-- not be duplicated into eight property rows, and this shape is what makes that
-- true by construction rather than by convention.
-- =============================================================================

ALTER TABLE property_policy
    ADD COLUMN partner_id uuid REFERENCES partner (id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- Backfill: every existing property-specific policy learns its owner.
--
-- Derived from the property it already points at, so nothing is guessed and no
-- policy changes scope. Platform policies (property_id IS NULL) match nothing
-- here and correctly stay at partner_id NULL.
-- -----------------------------------------------------------------------------

UPDATE property_policy pp
   SET partner_id = p.partner_id
  FROM property p
 WHERE p.id = pp.property_id
   AND pp.partner_id IS NULL;

-- -----------------------------------------------------------------------------
-- A property-specific policy always carries its partner.
--
-- Added after the backfill, so the existing rows satisfy it. This is what lets
-- every partner-scoped query be a single `partner_id = ?` predicate instead of
-- a join through `property` — and it makes "shared" and "property-specific"
-- distinguishable by `property_id` alone once the partner is known.
-- -----------------------------------------------------------------------------

ALTER TABLE property_policy
    ADD CONSTRAINT property_policy_scope_valid
    CHECK (property_id IS NULL OR partner_id IS NOT NULL);

-- -----------------------------------------------------------------------------
-- V21's uniqueness rule, split in two.
--
-- V21 created:
--
--   CREATE UNIQUE INDEX property_policy_global_unique_idx
--       ON property_policy (policy_type, version) WHERE property_id IS NULL;
--
-- because NULLs are DISTINCT in a UNIQUE constraint, so V3's
-- (property_id, policy_type, version) enforced nothing for NULL-property rows.
-- That reasoning is still right — but "property_id IS NULL" now covers two
-- different things, and as written the index would let only ONE partner in the
-- whole system hold a shared CANCELLATION v1. The second partner's would be
-- refused by an index that was never meant to be about partners at all.
--
-- So it is replaced by the same rule applied separately to each scope. Dropped
-- and recreated forward, never by editing V21 — migration README rule 1.
-- -----------------------------------------------------------------------------

DROP INDEX IF EXISTS property_policy_global_unique_idx;

CREATE UNIQUE INDEX property_policy_platform_unique_idx
    ON property_policy (policy_type, version)
    WHERE property_id IS NULL AND partner_id IS NULL;

COMMENT ON INDEX property_policy_platform_unique_idx IS
    'Platform policies (no partner, no property) are unique per type+version. '
    'Replaces property_policy_global_unique_idx, which V32 split by scope.';

CREATE UNIQUE INDEX property_policy_partner_unique_idx
    ON property_policy (partner_id, policy_type, version)
    WHERE property_id IS NULL AND partner_id IS NOT NULL;

COMMENT ON INDEX property_policy_partner_unique_idx IS
    'A partner holds at most one shared policy per type+version. Partner-scoped '
    'rather than global, so two partners may each hold their own CANCELLATION v1.';

-- -----------------------------------------------------------------------------
-- Lookup support for the resolution query.
--
-- Reading "the policies that apply to this hotel" asks for the partner's shared
-- rows plus that property's own rows, which is one scan per scope without this.
-- -----------------------------------------------------------------------------

CREATE INDEX property_policy_partner_idx
    ON property_policy (partner_id, policy_type)
    WHERE partner_id IS NOT NULL;

COMMENT ON COLUMN property_policy.partner_id IS
    'Owner of the policy. NULL only for platform policies. Set with property_id '
    'NULL for a shared policy that applies to the whole portfolio; set with '
    'property_id for a single-hotel override.';

-- -----------------------------------------------------------------------------
-- Reservation pinning is untouched, and cannot be affected by any of this.
--
-- `reservation.terms_version` (V12:80) is written once at S1 from the string the
-- client accepted, verbatim, and is never read back or joined against
-- property_policy anywhere in the backend. Adding, editing or archiving a shared
-- policy therefore cannot change what an existing reservation pinned — there is
-- no path from one to the other.
-- -----------------------------------------------------------------------------
