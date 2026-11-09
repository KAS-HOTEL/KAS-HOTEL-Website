ALTER TABLE reservation_cancellation_request
    ADD COLUMN expired_at timestamptz,
    ADD CONSTRAINT cancellation_request_expired_at_check
        CHECK ((status = 'EXPIRED') = (expired_at IS NOT NULL));

COMMENT ON COLUMN reservation_cancellation_request.expired_at IS
    'Time a pending hotel quote or customer fee decision expired at noon Asia/Ho_Chi_Minh on the reservation check-in date.';
