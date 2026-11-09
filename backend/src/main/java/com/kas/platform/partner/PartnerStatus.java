package com.kas.platform.partner;

/**
 * Matches the PostgreSQL enum {@code kas.partner_status}.
 *
 * <p>Two values only. Doc 85 §3.1: "no onboarding lifecycle in V1".
 */
public enum PartnerStatus {
    ACTIVE,
    SUSPENDED
}
