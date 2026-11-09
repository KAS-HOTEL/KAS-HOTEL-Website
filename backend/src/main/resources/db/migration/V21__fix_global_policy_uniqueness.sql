-- =============================================================================
-- V21 — Forward fix: global policy uniqueness
-- =============================================================================
-- DEFECT FOUND DURING PHASE 7.2 VALIDATION.
--
-- V3 declared:  UNIQUE (property_id, policy_type, version)
--
-- In PostgreSQL, NULLs are DISTINCT in a UNIQUE constraint by default. A global
-- policy has property_id = NULL, so that constraint permitted TWO global
-- CANCELLATION v1 policies to coexist — exactly the ambiguity a reservation's
-- terms_version pin is meant to eliminate.
--
-- Fixed FORWARD, not by editing V3. V3 has been applied; editing it would break
-- Flyway checksum validation in every environment that already ran it
-- (migration README rule 1).
-- =============================================================================

CREATE UNIQUE INDEX property_policy_global_unique_idx
    ON property_policy (policy_type, version)
    WHERE property_id IS NULL;

COMMENT ON INDEX property_policy_global_unique_idx IS
    'Global policies (property_id IS NULL) must be unique per type+version. The V3 UNIQUE constraint could not enforce this because NULLs are distinct.';
