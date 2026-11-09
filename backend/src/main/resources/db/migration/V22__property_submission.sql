-- =============================================================================
-- V22 — Property onboarding submission & review
-- =============================================================================
-- Phase 7.5. The ONLY persistence capability the Phase 7.2 schema did not
-- already provide (doc 92 §4.2): a Partner submits a property for review, and an
-- Admin approves it, rejects it, or asks for changes.
--
-- OPTION A, approved by the owner (doc 92 §3.2).
--
-- `property_lifecycle_state` is NOT touched. It stays exactly as doc 03 §8 and
-- doc 52 §3.1 froze it — DRAFT, COMING_SOON, OPEN, TEMPORARILY_CLOSED, CLOSED —
-- because it answers a different question:
--
--     lifecycle_state  = is this hotel open for business, and visible to guests?
--     submission.status = has this editorial change been reviewed?
--
-- Collapsing them (Option B) would have made an already-OPEN property with a
-- pending edit unrepresentable: it would need two states in one column. Keeping
-- them apart also preserves review HISTORY — a property submitted, rejected and
-- resubmitted keeps both outcomes as rows, which a single status column cannot.
--
-- Additive only. No existing table, column, constraint or index is modified.
-- =============================================================================

CREATE TYPE property_submission_status AS ENUM (
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CHANGES_REQUESTED'
);

CREATE TABLE property_submission (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id       uuid NOT NULL REFERENCES property (id) ON DELETE CASCADE,

    status            property_submission_status NOT NULL DEFAULT 'SUBMITTED',

    submitted_by      uuid REFERENCES app_user (id) ON DELETE SET NULL,
    submitted_at      timestamptz NOT NULL DEFAULT now(),

    reviewed_by       uuid REFERENCES app_user (id) ON DELETE SET NULL,
    reviewed_at       timestamptz,
    decision_reason   text,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    -- A decision carries a reviewer and a time; an open submission carries neither.
    CONSTRAINT property_submission_review_consistent CHECK (
        (status =  'SUBMITTED' AND reviewed_at IS NULL AND reviewed_by IS NULL)
     OR (status <> 'SUBMITTED' AND reviewed_at IS NOT NULL)
    ),

    -- Doc 92 §19 / phase brief §19: "Reject/request-change action must capture a
    -- reason." Enforced here rather than in application code, so a refusal
    -- without an explanation is impossible to record at all.
    CONSTRAINT property_submission_reason_required CHECK (
        status NOT IN ('REJECTED', 'CHANGES_REQUESTED')
     OR (decision_reason IS NOT NULL AND length(btrim(decision_reason)) > 0)
    )
);

-- At most ONE open submission per property. Without this, a Partner could
-- submit twice and an Admin would face two competing reviews of one property
-- with no defined winner. Closed submissions are unconstrained, so the full
-- resubmission history is retained.
CREATE UNIQUE INDEX property_submission_one_open_idx
    ON property_submission (property_id)
    WHERE status = 'SUBMITTED';

-- The admin review queue.
CREATE INDEX property_submission_queue_idx
    ON property_submission (submitted_at)
    WHERE status = 'SUBMITTED';

-- Per-property review history, newest first.
CREATE INDEX property_submission_history_idx
    ON property_submission (property_id, submitted_at DESC);

COMMENT ON TABLE property_submission IS
    'Editorial review of a property, separate from its operating lifecycle. One row per submission; history is retained.';
COMMENT ON COLUMN property_submission.decision_reason IS
    'Mandatory for REJECTED and CHANGES_REQUESTED, enforced by CHECK. Guest-invisible; reviewer-to-partner text.';
COMMENT ON INDEX property_submission_one_open_idx IS
    'A property may have at most one submission awaiting review.';
