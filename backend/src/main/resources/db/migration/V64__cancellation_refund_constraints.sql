-- V64 — Rules for the refund statuses added by V63 (first use of those enum values).

-- A refund is recorded only with an amount and a time, and only by someone.
ALTER TABLE reservation_cancellation_request
    ADD CONSTRAINT cancellation_request_refunded_recorded CHECK (
        status <> 'REFUNDED'
        OR (refund_amount_minor IS NOT NULL AND refunded_at IS NOT NULL AND refund_decided_by IS NOT NULL)),
    ADD CONSTRAINT cancellation_request_refund_rejected_reason CHECK (
        status <> 'REFUND_REJECTED' OR (refund_note IS NOT NULL AND refund_decided_by IS NOT NULL)),
    ADD CONSTRAINT cancellation_request_refund_due_known CHECK (
        status NOT IN ('REFUND_PENDING', 'REFUNDED', 'REFUND_REJECTED') OR refund_due_minor IS NOT NULL);

-- SUPER_ADMIN's refund queue.
CREATE INDEX cancellation_request_refund_queue_idx
    ON reservation_cancellation_request (status, updated_at)
    WHERE status = 'REFUND_PENDING';
