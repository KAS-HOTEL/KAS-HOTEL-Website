package com.kas.platform.settings;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JdbcSystemSettingRepository implements SystemSettingRepository {

    private final JdbcClient jdbc;

    JdbcSystemSettingRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * {@code property_id IS NULL} selects the global row. Per-property overrides
     * (doc 51 §6) are a later phase; adding the branch now without a resolution
     * order agreed would be speculative.
     */
    @Override
    public Optional<String> findGlobalValue(SettingKey key) {
        return jdbc.sql("SELECT value FROM system_setting WHERE key = :key AND property_id IS NULL")
                .param("key", key.name())
                .query(String.class)
                .optional()
                .filter(value -> !value.isBlank());
    }
}
