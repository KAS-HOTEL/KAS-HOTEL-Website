package com.kas.platform.inventory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.util.UUID;
/** Published property identity for manual booking requests. No stock allocation. */
@Repository
public class PublicAllocationRepository {
    private static final String BOOKABLE = "p.lifecycle_state = 'OPEN'";
    private final JdbcClient jdbc;
    public PublicAllocationRepository(JdbcClient jdbc) { this.jdbc = jdbc; }
    /** The property behind a publicly bookable slug, or empty. */
    public java.util.Optional<UUID> bookablePropertyId(String propertySlug) {
        return jdbc.sql("SELECT p.id FROM property p WHERE p.slug = :slug AND " + BOOKABLE)
                .param("slug", propertySlug)
                .query(UUID.class)
                .optional();
    }

    /**
     * The property's name in one locale, for the snapshot's {@code propertyName}
     * — doc 125 §7.2.
     *
     * <p>{@code property} has no name column; the name lives in
     * {@code property_translation}, one row per locale, so this is an inner join
     * at the requested locale — the same mechanism
     * {@code PublishedRateRepository.names} already uses for the room type name
     * that becomes {@code room_type_name_snapshot}.
     *
     * <p>The {@code BOOKABLE} predicate is repeated deliberately: S1 must not
     * acquire the name through a second, subtly different visibility rule than
     * the one {@link #bookablePropertyId} applied.
     */
    public java.util.Optional<String> bookablePropertyName(String propertySlug, String locale) {
        return jdbc.sql("""
                        SELECT t.name
                          FROM property p
                          JOIN property_translation t
                            ON t.property_id = p.id AND t.locale = :locale
                         WHERE p.slug = :slug AND %s
                        """.formatted(BOOKABLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query(String.class)
                .optional();
    }

}
