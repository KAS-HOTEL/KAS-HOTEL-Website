package com.kas.platform.partner;

import java.time.Instant;
import java.util.UUID;

/**
 * The ownership organisation above one or more properties.
 *
 * <p>V1 contains exactly one row (doc 85 §4.1). Lifecycle is
 * {@code ACTIVE | SUSPENDED} — there is no onboarding lifecycle, and partners
 * are suspended rather than deleted (doc 85 §4.2).
 */
public record Partner(
        UUID id,
        String code,
        String legalName,
        String displayName,
        PartnerStatus status,
        Instant createdAt,
        Instant updatedAt) {
}
