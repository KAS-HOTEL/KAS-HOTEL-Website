package com.kas.platform.settings;

/**
 * The registered business configuration keys.
 *
 * <p>Transcribed from the {@code kas.system_setting} rows seeded in migration
 * V20 and listed in doc 88 §11. <strong>Every one of these currently holds
 * {@code NULL}.</strong> They are a registry of what is missing, not values.
 *
 * <p>The enum exists so a typo in a key name is a compile error rather than a
 * silent miss at runtime, and so the set of things the business still owes is
 * visible in one place.
 *
 * <p>Deliberately <em>not</em> represented here, because they are not
 * key/value settings and must not be faked: room types, room quantities, rates,
 * VAT and service charge, the cancellation policy, the no-show policy, and OTA
 * safety buffer values.
 */
public enum SettingKey {

    // ---- Category A: blocks development (doc 51 §2) ------------------------
    /** A6 / OQ-051 — cutoff hour, weekends, holidays, escalation threshold. */
    SALES_FIRST_CONTACT_SLA(SettingValueType.DURATION),
    /** A11 / OQ-065 — which locale serves a visitor with no signal. */
    DEFAULT_LOCALE(SettingValueType.STRING),
    /** Doc 55 §2 — the rolling inventory horizon. */
    INVENTORY_HORIZON_MONTHS(SettingValueType.INTEGER),

    // ---- Category B: blocks production (doc 51 §3) -------------------------
    /** B2 / OQ-018. */
    DIRECT_REQUEST_HOLD_DURATION(SettingValueType.DURATION),
    /** B1 / D-46 — the worked example in doc 51 §6 rule 2. */
    DIRECT_ALTERNATIVE_HOLD_DURATION(SettingValueType.DURATION),
    /** B19 / OQ-066 — how long the offer stands, distinct from the hold. */
    ALTERNATIVE_OFFER_RESPONSE_EXPIRY(SettingValueType.DURATION),
    /** B4 / OQ-081 — measured, never enforced by the system. */
    OTA_RECORDING_LAG_THRESHOLD(SettingValueType.DURATION),
    /** B5 — acceptable daily variance before an alert. */
    RECONCILIATION_VARIANCE_TOLERANCE(SettingValueType.DECIMAL),
    /** B18 / OQ-080. */
    INQUIRY_FOLLOWUP_ATTEMPT_LIMIT(SettingValueType.INTEGER),
    /** B15 / OQ-015 — above which a request routes to a group enquiry. */
    MAX_ROOMS_PER_REQUEST(SettingValueType.INTEGER),
    /** B21 / OQ-035. */
    MAX_STAY_NIGHTS(SettingValueType.INTEGER),
    /** B12 / OQ-017. */
    DEPOSIT_REQUIRED_TO_CONFIRM(SettingValueType.BOOLEAN),
    /** B12 / OQ-017. */
    DEPOSIT_PERCENTAGE(SettingValueType.DECIMAL),
    /** B16 / OQ-040 — how long after checkout a guest may review. */
    REVIEW_WINDOW_DAYS(SettingValueType.INTEGER),
    /** B22 / OQ-052 — provider. There is no fallback rate. */
    USD_FX_RATE_SOURCE(SettingValueType.STRING),
    /** B22 / OQ-052 — refresh cadence. */
    USD_FX_REFRESH_INTERVAL(SettingValueType.DURATION),
    /** B20 / OQ-047 — latest hour a same-day request is accepted. */
    SAME_DAY_BOOKING_CUTOFF(SettingValueType.STRING),
    /** A5 / OQ-045 — drives the NO_SHOW transition. */
    NO_SHOW_CUTOFF(SettingValueType.STRING);

    private final SettingValueType valueType;

    SettingKey(SettingValueType valueType) {
        this.valueType = valueType;
    }

    public SettingValueType valueType() {
        return valueType;
    }
}
