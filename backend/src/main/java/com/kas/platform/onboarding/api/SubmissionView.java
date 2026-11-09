package com.kas.platform.onboarding.api;

import com.kas.platform.onboarding.PropertySubmission;
import com.kas.platform.onboarding.SubmissionStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * A submission as the Partner or the reviewing Admin sees it.
 *
 * <p>{@code decisionReason} is included on purpose: a Partner who was refused
 * must be able to read why, or "request changes" tells them nothing. It is
 * reviewer-to-partner text and never reaches a guest — no public endpoint
 * returns this type.
 *
 * <p>{@code reviewedBy} carries the reviewer's id rather than their name or
 * email. Doc 58 §4 returns only an agent's first name even to a customer; there
 * is no need to build a staff directory here either.
 */
public record SubmissionView(
        UUID id,
        UUID propertyId,
        SubmissionStatus status,
        Instant submittedAt,
        UUID reviewedBy,
        Instant reviewedAt,
        String decisionReason) {

    static SubmissionView of(PropertySubmission submission) {
        return new SubmissionView(
                submission.id(),
                submission.propertyId(),
                submission.status(),
                submission.submittedAt(),
                submission.reviewedBy(),
                submission.reviewedAt(),
                submission.decisionReason());
    }
}
