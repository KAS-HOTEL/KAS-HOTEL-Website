package com.kas.platform.settings;

/** Matches the PostgreSQL enum {@code kas.setting_value_type}. */
public enum SettingValueType {
    STRING,
    INTEGER,
    DECIMAL,
    BOOLEAN,
    /** ISO-8601 duration text, parsed with {@link java.time.Duration#parse}. */
    DURATION,
    JSON
}
