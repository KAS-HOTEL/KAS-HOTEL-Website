-- =============================================================================
-- V24 — Reservation-request idempotency persistence
-- Source: 117-phase-7-5f-step-16a-contract-amendment.md §5, §17 row 9
-- =============================================================================
-- Doc 58 §3.3 marks `Idempotency-Key` **Required** for
-- POST /public/reservations/requests, and doc 58 §11 freezes the behaviour of a
-- retry: "Returns the original reservation". Doc 117 §17 row 9 records that the
-- schema had **no** reservation-adjacent place to persist that key —
-- `email_log.idempotency_key` is the only such column in the database and it is
-- server-derived per (event, reservation, recipient), not client-supplied.
--
-- This table is that place. The owner approved it in doc 117 §2 row 5.
--
-- WHY EACH COLUMN EXISTS — one per frozen requirement, and nothing more:
--
--   idempotency_key      durable, client-supplied, opaque. PRIMARY KEY, so the
--                        database — not the application — is what makes two
--                        concurrent first requests with the same key resolve to
--                        one reservation. The loser's INSERT fails, its whole
--                        transaction rolls back, and it re-reads the winner's row.
--
--   request_fingerprint  so the same-key/**different**-body case is DETECTABLE.
--                        Storing it decides nothing: OQ-170 — what such a request
--                        returns — is OPEN, and doc 117 §5.5 forbids choosing a
--                        status code, a comparison strategy or a tolerance here.
--                        This column exists so that question stays answerable
--                        later instead of being silently answered now by
--                        returning the original to a request that differs.
--
--   reservation_id       the association doc 117 §5.2 requires. ON DELETE CASCADE
--                        because a key without its reservation records nothing.
--
--   response_snapshot    "preserve enough data to return the original result".
--                        Five of the frozen 201's six fields are derivable from
--                        `reservation`, but `trackingUrlIssued` (doc 117 §12) is
--                        not stored anywhere, and whether a tracking link is
--                        issued depends on OQ-162 — notification delivery —
--                        which is OPEN. Storing the response verbatim makes a
--                        retry byte-identical without this migration having to
--                        pre-empt OQ-162, and without adding a column to
--                        `reservation` for a semantic that is not yet decided.
--
-- No length ceiling is imposed on the key: any specific number would be an
-- invented policy. Non-blank is asserted; nothing else is.
--
-- NOT INCLUDED, deliberately: no UNIQUE on reservation_id. One reservation does
-- arise from one key, but doc 117 does not freeze that as an invariant and this
-- migration does not add constraints the contract did not ask for.
-- =============================================================================

CREATE TABLE reservation_request_idempotency (
    idempotency_key     text        PRIMARY KEY,
    request_fingerprint text        NOT NULL,
    reservation_id      uuid        NOT NULL REFERENCES reservation (id) ON DELETE CASCADE,
    response_snapshot   jsonb       NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reservation_request_idempotency_key_not_blank
        CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT reservation_request_idempotency_fingerprint_not_blank
        CHECK (btrim(request_fingerprint) <> '')
);

COMMENT ON TABLE reservation_request_idempotency IS
    'Durable client Idempotency-Key for POST /public/reservations/requests. The PRIMARY KEY is what makes concurrent first requests safe.';
COMMENT ON COLUMN reservation_request_idempotency.request_fingerprint IS
    'Makes the same-key/different-body case DETECTABLE. Decides nothing — OQ-170 is open and no response policy is chosen here.';
COMMENT ON COLUMN reservation_request_idempotency.response_snapshot IS
    'The original 201 body, so a retry is byte-identical without depending on OQ-162 (trackingUrlIssued).';

-- Reverse lookup, and the FK column is not indexed automatically.
CREATE INDEX reservation_request_idempotency_reservation_idx
    ON reservation_request_idempotency (reservation_id);
