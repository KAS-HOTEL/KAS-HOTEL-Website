CREATE TABLE email_delivery_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_reference text,
    event_key text NOT NULL UNIQUE,
    payload_nonce bytea,
    payload_ciphertext bytea,
    status text NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    sent_at timestamptz,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((payload_nonce IS NULL) = (payload_ciphertext IS NULL)),
    CHECK (status <> 'PENDING' OR payload_ciphertext IS NOT NULL),
    CHECK (status <> 'RETRY' OR payload_ciphertext IS NOT NULL),
    CHECK (status <> 'PROCESSING' OR payload_ciphertext IS NOT NULL)
);

CREATE INDEX email_delivery_outbox_due
    ON email_delivery_outbox (next_attempt_at, created_at)
    WHERE status IN ('PENDING', 'RETRY');

CREATE INDEX email_delivery_outbox_lease
    ON email_delivery_outbox (locked_at)
    WHERE status = 'PROCESSING';

CREATE INDEX email_delivery_outbox_reference
    ON email_delivery_outbox (aggregate_reference, created_at DESC)
    WHERE aggregate_reference IS NOT NULL;
