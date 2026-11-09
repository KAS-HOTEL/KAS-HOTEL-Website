package com.kas.platform.media;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.sql.ResultSet;
import java.sql.SQLException;

@Repository
public class SiteImageSlotRepository {

    private final JdbcClient jdbc;

    public SiteImageSlotRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<SiteImageSlot> findAll() {
        return jdbc.sql("""
                        SELECT slot_key, group_key, label, selector, default_reference,
                               current_reference, COALESCE(current_reference, default_reference) AS image_reference,
                               is_enabled, sort_order
                          FROM site_image_slot
                         ORDER BY group_key, sort_order, slot_key
                        """)
                .query(SiteImageSlotRepository::map)
                .list();
    }

    public Optional<SiteImageSlot> findByKey(String key) {
        return jdbc.sql("""
                        SELECT slot_key, group_key, label, selector, default_reference,
                               current_reference, COALESCE(current_reference, default_reference) AS image_reference,
                               is_enabled, sort_order
                          FROM site_image_slot
                         WHERE slot_key = :key
                        """)
                .param("key", key)
                .query(SiteImageSlotRepository::map)
                .optional();
    }

    public List<SiteImageSlot> findPublic() {
        return findAll().stream().filter(SiteImageSlot::enabled)
                .filter(slot -> slot.imageReference() != null && !slot.imageReference().isBlank())
                .toList();
    }

    @Transactional
    public Optional<SiteImageSlot> updateIfCurrent(String key, String expectedReference,
            boolean expectedEnabled, String imageReference, boolean enabled, java.util.UUID actorId) {
        int count = jdbc.sql("""
                        UPDATE site_image_slot
                           SET current_reference = :reference, is_enabled = :enabled,
                               updated_at = now(), updated_by = :actorId
                         WHERE slot_key = :key
                           AND current_reference IS NOT DISTINCT FROM :expectedReference
                           AND is_enabled = :expectedEnabled
                        """)
                .param("reference", imageReference)
                .param("enabled", enabled)
                .param("actorId", actorId)
                .param("key", key)
                .param("expectedReference", expectedReference)
                .param("expectedEnabled", expectedEnabled)
                .update();
        if (count == 0) return Optional.empty();
        return findByKey(key);
    }

    private static SiteImageSlot map(ResultSet rs, int rowNum) throws SQLException {
        return new SiteImageSlot(rs.getString("slot_key"), rs.getString("group_key"),
                rs.getString("label"), rs.getString("selector"), rs.getString("default_reference"),
                rs.getString("current_reference"), rs.getString("image_reference"),
                rs.getBoolean("is_enabled"), rs.getInt("sort_order"));
    }
}
