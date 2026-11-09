package com.kas.platform.shared;

/**
 * The PostgreSQL enum {@code kas.rule_status}, shared by every commercial rule
 * table: {@code rate_rule}, {@code tax_rule}, {@code ota_safety_buffer_rule} and
 * {@code property_policy}.
 *
 * <h2>Relationship to {@code property.PolicyStatus}</h2>
 *
 * <p>{@code PolicyStatus} was written in Phase 7.5D and maps this same database
 * type from inside the policy module, carrying the policy lifecycle guard
 * {@code canTransitionTo}. This enum is the shared-kernel view used by the rate,
 * tax and buffer rules added in Phase 7.5E.
 *
 * <p>Two Java enums over one PostgreSQL type is duplication, and it is recorded
 * as such (doc 97 §16, OQ-121) rather than hidden. It was preferred to the
 * alternatives: importing a type named {@code PolicyStatus} into a rate rule
 * misdescribes the data at every call site, and rewriting the shipped and
 * green policy module to consume a new shared type is churn that this phase was
 * not asked to make. {@code RuleStatusConsistencyTest} asserts the two enums
 * hold identical constants, so they cannot drift apart unnoticed.
 */
public enum RuleStatus {

    DRAFT,
    ACTIVE,
    PAUSED,
    ARCHIVED;

    /** Only an ACTIVE rule participates in resolution — doc 56 §3.1. */
    public boolean isEffective() {
        return this == ACTIVE;
    }

    /**
     * Doc 56 §5.3: "Rate rules are <strong>never deleted</strong>, only
     * {@code status = ARCHIVED}, so a snapshot's {@code ruleId} always resolves."
     *
     * <p>The same shape as the policy lifecycle: {@code DRAFT → ACTIVE ⇄ PAUSED
     * → ARCHIVED}, with {@code ARCHIVED} terminal.
     */
    public boolean canTransitionTo(RuleStatus target) {
        if (this == target) {
            return false;
        }
        return switch (this) {
            case DRAFT -> target == ACTIVE || target == ARCHIVED;
            case ACTIVE -> target == PAUSED || target == ARCHIVED;
            case PAUSED -> target == ACTIVE || target == ARCHIVED;
            case ARCHIVED -> false;
        };
    }
}
