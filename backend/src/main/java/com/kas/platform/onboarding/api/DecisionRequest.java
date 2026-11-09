package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The reason accompanying a rejection or a change request.
 *
 * <p>Mandatory at three layers, deliberately: {@code @NotBlank} here,
 * an explicit check in {@code OnboardingService}, and the
 * {@code property_submission_reason_required} CHECK in V22. A refusal a Partner
 * cannot act on is worse than no refusal, and the database is the layer that
 * makes an unexplained one impossible to record at all.
 */
public record DecisionRequest(

        @NotBlank
        @Size(max = 2000)
        String reason) {
}
