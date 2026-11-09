-- Old link records cannot be consumed by the new email+code endpoint.
UPDATE customer_email_verification_token
   SET invalidated_at = now()
 WHERE used_at IS NULL AND invalidated_at IS NULL;

ALTER TABLE customer_email_verification_token
    ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT customer_email_verification_attempts_nonnegative CHECK (failed_attempts >= 0);
