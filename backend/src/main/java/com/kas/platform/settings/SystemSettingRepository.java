package com.kas.platform.settings;

import java.util.Optional;

/**
 * Reads raw setting values.
 *
 * <p>An interface rather than a class so {@link SystemSettingService} — which
 * holds the fail-loud rule that keeps invented business values out of the
 * system — is unit-testable without a database.
 */
public interface SystemSettingRepository {

    /**
     * The raw text value for a global setting.
     *
     * @return empty when the key is unregistered <em>or</em> registered with a
     *         {@code NULL} value. Both mean "KAS has not supplied this", and the
     *         caller must treat them identically.
     */
    Optional<String> findGlobalValue(SettingKey key);
}
