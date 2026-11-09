package com.kas.platform.property;

/**
 * The eleven policy types the schema permits, from the
 * {@code property_policy_type_valid} CHECK.
 *
 * <p><strong>Four types a hotel platform would normally have are deliberately
 * absent</strong>, and none was added:
 *
 * <ul>
 *   <li>{@code CHECK_IN} / {@code CHECK_OUT} — these are not policies in the KAS
 *       model. {@code property.check_in_time} and {@code check_out_time} are
 *       columns on the property itself, so adding policy types for them would
 *       create a second place for the same fact to live.</li>
 *   <li>{@code EXTRA_BED} / {@code DEPOSIT} — commercial terms. Doc 51 B11 and
 *       B12 record them as unresolved business inputs, and they belong with the
 *       rate and settings model, not here.</li>
 * </ul>
 *
 * <p>Adding a value means altering a frozen CHECK, which the phase brief forbids
 * doing to satisfy a UI idea. See OQ-110.
 */
public enum PolicyType {

    /** How a stay is requested and confirmed. */
    BOOKING,
    CANCELLATION,
    CHILDREN,
    PETS,
    SMOKING,
    PAYMENT,
    /** Doc 03 §5.3 requires this to be factual, never framed. */
    ACCESSIBILITY,

    // ---- platform-level. property_id IS NULL. Out of scope for 7.5D, see §5.
    PRIVACY,
    TERMS,
    COOKIES,

    /** Doc 51 A5 — the business value behind it is still unresolved. */
    NO_SHOW;

    /**
     * Whether this type describes an individual hotel rather than the platform.
     *
     * <p>{@code PRIVACY}, {@code TERMS} and {@code COOKIES} are legal documents
     * KAS publishes once, as global policies with {@code property_id IS NULL} —
     * V21 exists precisely to keep those unique. A Partner does not author them,
     * so they are not manageable through the property API.
     */
    public boolean isPropertyScoped() {
        return this != PRIVACY && this != TERMS && this != COOKIES;
    }
}
