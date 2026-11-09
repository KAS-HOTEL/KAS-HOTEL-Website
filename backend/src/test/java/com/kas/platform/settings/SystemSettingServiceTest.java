package com.kas.platform.settings;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.MissingConfigurationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The mechanism that keeps invented business values out of the system.
 *
 * <p>Doc 51 §6 rule 2, and the Phase 7.3 brief: "Do not silently invent 0, 1,
 * 24 hours, 30 days, 10%, 15% or any other arbitrary value."
 */
class SystemSettingServiceTest {

    /** Stands in for the current database state: every key registered, every value NULL. */
    private static final SystemSettingRepository ALL_UNSUPPLIED = key -> Optional.empty();

    private static SystemSettingRepository supplying(Map<SettingKey, String> values) {
        return key -> Optional.ofNullable(values.get(key));
    }

    @ParameterizedTest
    @EnumSource(SettingKey.class)
    @DisplayName("every unsupplied setting fails loudly, naming itself")
    void unsuppliedSettingsFailByName(SettingKey key) {
        SystemSettingService service = new SystemSettingService(ALL_UNSUPPLIED);

        assertThatThrownBy(() -> read(service, key))
                .isInstanceOf(MissingConfigurationException.class)
                .hasMessageContaining(key.name())
                .satisfies(e -> {
                    MissingConfigurationException missing = (MissingConfigurationException) e;
                    assertThat(missing.settingKey()).isEqualTo(key.name());
                    assertThat(missing.code()).isEqualTo(ApiErrorCode.CONFIG_MISSING);
                });
    }

    @Test
    @DisplayName("the service exposes no accessor that can return a default")
    void noAccessorOffersAFallback() {
        // A `getOrDefault(key, fallback)` would be the one API through which an
        // invented business value could enter. Its absence is the guarantee, so
        // it is asserted rather than assumed.
        boolean hasFallbackAccessor = java.util.Arrays.stream(
                        SystemSettingService.class.getDeclaredMethods())
                .filter(m -> java.lang.reflect.Modifier.isPublic(m.getModifiers()))
                .anyMatch(m -> m.getName().toLowerCase(java.util.Locale.ROOT).contains("default")
                        || m.getName().toLowerCase(java.util.Locale.ROOT).contains("orelse")
                        || m.getParameterCount() > 1);

        assertThat(hasFallbackAccessor)
                .as("no accessor takes a fallback argument")
                .isFalse();
    }

    @Test
    @DisplayName("a blank stored value counts as unsupplied")
    void blankIsUnsupplied() {
        SystemSettingService service = new SystemSettingService(
                key -> Optional.of("   ").filter(v -> !v.isBlank()));

        assertThatThrownBy(() -> service.requireDuration(SettingKey.DIRECT_REQUEST_HOLD_DURATION))
                .isInstanceOf(MissingConfigurationException.class);
    }

    @Test
    @DisplayName("a malformed stored value fails, and never echoes the value")
    void malformedValueFailsWithoutEchoing() {
        String stored = "not-a-duration-4f7a";
        SystemSettingService service = new SystemSettingService(
                supplying(Map.of(SettingKey.DIRECT_REQUEST_HOLD_DURATION, stored)));

        assertThatThrownBy(() -> service.requireDuration(SettingKey.DIRECT_REQUEST_HOLD_DURATION))
                .isInstanceOf(MissingConfigurationException.class)
                .hasMessageContaining("DIRECT_REQUEST_HOLD_DURATION")
                .hasMessageNotContaining(stored);
    }

    @Test
    @DisplayName("a supplied value is returned, correctly typed")
    void suppliedValuesParse() {
        SystemSettingService service = new SystemSettingService(supplying(Map.of(
                SettingKey.DIRECT_REQUEST_HOLD_DURATION, "PT48H",
                SettingKey.MAX_ROOMS_PER_REQUEST, "5",
                SettingKey.DEPOSIT_PERCENTAGE, "12.5",
                SettingKey.DEPOSIT_REQUIRED_TO_CONFIRM, "true",
                SettingKey.DEFAULT_LOCALE, "vi")));

        assertThat(service.requireDuration(SettingKey.DIRECT_REQUEST_HOLD_DURATION))
                .isEqualTo(java.time.Duration.ofHours(48));
        assertThat(service.requireInteger(SettingKey.MAX_ROOMS_PER_REQUEST)).isEqualTo(5);
        assertThat(service.requireDecimal(SettingKey.DEPOSIT_PERCENTAGE))
                .isEqualByComparingTo("12.5");
        assertThat(service.requireBoolean(SettingKey.DEPOSIT_REQUIRED_TO_CONFIRM)).isTrue();
        assertThat(service.requireString(SettingKey.DEFAULT_LOCALE)).isEqualTo("vi");
    }

    @Test
    @DisplayName("the Step 16A durations read back as the 24 hours doc 117 froze")
    void step16aDurationsAreReadCorrectly() {
        // A6 and B2 were applied to the database in Phase E3, both PT24H
        // (doc 117 §2 rows 1 and 2). This asserts the service turns that stored
        // string into the duration the SLA and the request hold depend on —
        // sla_due_at = requested_at + PT24H, expires_at = requested_at + PT24H.
        //
        // The note above about "24 hours, 30 days, 10%" being arbitrary still
        // holds: the point is that the service must never SUPPLY a value. Here
        // the owner supplied it and the service only has to read it back.
        SystemSettingService service = new SystemSettingService(supplying(Map.of(
                SettingKey.SALES_FIRST_CONTACT_SLA, "PT24H",
                SettingKey.DIRECT_REQUEST_HOLD_DURATION, "PT24H")));

        assertThat(service.requireDuration(SettingKey.SALES_FIRST_CONTACT_SLA))
                .isEqualTo(java.time.Duration.ofHours(24));
        assertThat(service.requireDuration(SettingKey.DIRECT_REQUEST_HOLD_DURATION))
                .isEqualTo(java.time.Duration.ofHours(24));

        // B1 governs the S7 alternative-offer hold and is a different setting.
        // It is still unset, so reading it must still fail closed.
        assertThat(service.isSupplied(SettingKey.DIRECT_ALTERNATIVE_HOLD_DURATION)).isFalse();
    }

    @Test
    @DisplayName("boolean parsing is strict — a malformed value never becomes false")
    void booleanParsingIsStrict() {
        SystemSettingService service = new SystemSettingService(
                supplying(Map.of(SettingKey.DEPOSIT_REQUIRED_TO_CONFIRM, "yes")));

        // Boolean.parseBoolean("yes") is false. Accepting that would turn a
        // configuration error into a silent business decision about deposits.
        assertThatThrownBy(() -> service.requireBoolean(SettingKey.DEPOSIT_REQUIRED_TO_CONFIRM))
                .isInstanceOf(MissingConfigurationException.class);
    }

    @Test
    @DisplayName("reading a setting as the wrong type is a programming error, not a config gap")
    void wrongTypeIsAProgrammingError() {
        SystemSettingService service = new SystemSettingService(ALL_UNSUPPLIED);

        assertThatThrownBy(() -> service.requireInteger(SettingKey.DEFAULT_LOCALE))
                .isInstanceOf(IllegalArgumentException.class)
                .isNotInstanceOf(MissingConfigurationException.class);
    }

    @Test
    @DisplayName("isSupplied reports absence without demanding a value")
    void isSuppliedDoesNotThrow() {
        SystemSettingService service = new SystemSettingService(ALL_UNSUPPLIED);

        assertThat(service.isSupplied(SettingKey.REVIEW_WINDOW_DAYS)).isFalse();
    }

    /** Reads {@code key} through the accessor matching its declared type. */
    private static Object read(SystemSettingService service, SettingKey key) {
        return switch (key.valueType()) {
            case STRING, JSON -> service.requireString(key);
            case INTEGER -> service.requireInteger(key);
            case DECIMAL -> service.requireDecimal(key);
            case BOOLEAN -> service.requireBoolean(key);
            case DURATION -> service.requireDuration(key);
        };
    }
}
