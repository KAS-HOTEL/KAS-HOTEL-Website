package com.kas.platform.onboarding;

import java.time.Instant;
import java.util.UUID;

/**
 * One review of one property.
 *
 * <p>Rows are never deleted and decisions are never rewritten, so the sequence
 * of rows for a property is its review history: submitted, changes requested,
 * submitted again, approved.
 */
public record PropertySubmission(
        UUID id,
        UUID propertyId,
        SubmissionStatus status,
        UUID submittedBy,
        Instant submittedAt,
        UUID reviewedBy,
        Instant reviewedAt,
        String decisionReason) {

    public boolean isOpen() {
        return status.isOpen();
    }
}
