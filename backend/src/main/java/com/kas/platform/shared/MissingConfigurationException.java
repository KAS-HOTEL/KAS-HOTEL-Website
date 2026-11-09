package com.kas.platform.shared;

/**
 * A required business configuration value has not been supplied by KAS.
 *
 * <p>This is the enforcement point for doc 51 §6 rule 2:
 *
 * <blockquote>A missing required setting fails loudly at the point of use,
 * naming the setting — it never silently defaults.</blockquote>
 *
 * <p>All 18 registered settings currently hold {@code NULL} (doc 88 §11). They
 * are a registry of what is missing, not values. Anything that resolves a
 * missing setting to {@code 0}, {@code 1}, {@code 24 hours}, {@code 30 days} or
 * any other arbitrary figure is a defect, not a default.
 */
public class MissingConfigurationException extends KasException {

    private final transient String settingKey;

    public MissingConfigurationException(String settingKey) {
        this(settingKey, "has not been supplied");
    }

    /**
     * @param reason why the value is unusable, in caller-facing words. It must
     *               never echo the stored value — a malformed setting can still
     *               contain something sensitive.
     */
    public MissingConfigurationException(String settingKey, String reason) {
        super(ApiErrorCode.CONFIG_MISSING,
                "Required configuration '" + settingKey + "' " + reason + ". "
                        + "This value is a business input and is never defaulted.");
        this.settingKey = settingKey;
    }

    /** The setting name, so the caller can act without reading the log. */
    public String settingKey() {
        return settingKey;
    }
}
