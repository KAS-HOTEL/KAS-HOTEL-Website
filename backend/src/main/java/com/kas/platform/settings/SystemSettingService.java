package com.kas.platform.settings;

import com.kas.platform.shared.MissingConfigurationException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Optional;

/**
 * The only supported way to read a business configuration value.
 *
 * <p>Every accessor is named {@code require…} deliberately. There is no
 * {@code getOrDefault}, no {@code orElse}, and no overload taking a fallback:
 * doc 51 §6 rule 2 requires that a missing setting fails loudly naming the
 * setting, and an API that <em>offers</em> a default is an API that will
 * eventually be given one.
 *
 * <p>The resulting {@link MissingConfigurationException} maps to
 * {@code 422 CONFIG_MISSING} carrying the key name — doc 58 §2:
 *
 * <blockquote>Placing an alternative hold with
 * {@code DIRECT_ALTERNATIVE_HOLD_DURATION} unset returns it, naming the setting
 * — the system never invents a value.</blockquote>
 */
@Service
public class SystemSettingService {

    private final SystemSettingRepository repository;

    public SystemSettingService(SystemSettingRepository repository) {
        this.repository = repository;
    }

    public String requireString(SettingKey key) {
        return raw(key, SettingValueType.STRING);
    }

    public int requireInteger(SettingKey key) {
        String value = raw(key, SettingValueType.INTEGER);
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            throw malformed(key, SettingValueType.INTEGER);
        }
    }

    public BigDecimal requireDecimal(SettingKey key) {
        String value = raw(key, SettingValueType.DECIMAL);
        try {
            return new BigDecimal(value.trim());
        } catch (NumberFormatException e) {
            throw malformed(key, SettingValueType.DECIMAL);
        }
    }

    /**
     * Strict parsing: only {@code "true"} and {@code "false"} are accepted.
     * {@link Boolean#parseBoolean} treats every other string as {@code false},
     * which would turn a malformed value into a silent business decision.
     */
    public boolean requireBoolean(SettingKey key) {
        String value = raw(key, SettingValueType.BOOLEAN).trim();
        if ("true".equalsIgnoreCase(value)) {
            return true;
        }
        if ("false".equalsIgnoreCase(value)) {
            return false;
        }
        throw malformed(key, SettingValueType.BOOLEAN);
    }

    public Duration requireDuration(SettingKey key) {
        String value = raw(key, SettingValueType.DURATION);
        try {
            return Duration.parse(value.trim());
        } catch (java.time.format.DateTimeParseException e) {
            throw malformed(key, SettingValueType.DURATION);
        }
    }

    /**
     * Whether a value has been supplied, without demanding one.
     *
     * <p>For the admin settings screen and readiness reporting only. Business
     * logic must call a {@code require…} accessor so a missing value stops the
     * operation instead of altering it.
     */
    public boolean isSupplied(SettingKey key) {
        return repository.findGlobalValue(key).isPresent();
    }

    private String raw(SettingKey key, SettingValueType expected) {
        if (key.valueType() != expected) {
            // A programming error, not a configuration gap: caller asked for the wrong type.
            throw new IllegalArgumentException(
                    key + " is declared " + key.valueType() + ", read as " + expected);
        }
        Optional<String> value = repository.findGlobalValue(key);
        if (value.isEmpty()) {
            throw new MissingConfigurationException(key.name());
        }
        return value.get();
    }

    /**
     * A stored value that cannot be parsed is treated exactly like a missing one.
     * The alternative — a silent coercion — is the failure mode doc 51 §6 exists
     * to prevent. The exception names the key; it never echoes the stored value.
     */
    private MissingConfigurationException malformed(SettingKey key, SettingValueType expected) {
        return new MissingConfigurationException(key.name(),
                "is stored in a form that is not a valid " + expected);
    }
}
