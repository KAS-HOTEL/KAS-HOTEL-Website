package com.kas.platform.inventory;
import com.kas.platform.shared.scope.PublicReadRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;
/** Public room descriptions for manual requests; no room-stock queries. */
@Repository
public class PublishedAvailabilityRepository implements PublicReadRepository {
    private final JdbcClient jdbc;
    public PublishedAvailabilityRepository(JdbcClient jdbc) { this.jdbc = jdbc; }
    /** Published metadata only. No room stock or holds are read. */
    public List<RequestRoom> requestRooms(String propertySlug, List<String> slugs) {
        return jdbc.sql("""
                SELECT rt.id, rt.slug, rt.max_adults, rt.max_children, rt.max_occupancy
                  FROM room_type rt JOIN property p ON p.id = rt.property_id
                 WHERE p.slug = :slug AND p.lifecycle_state = 'OPEN'
                   AND rt.status = 'PUBLISHED'
                 ORDER BY rt.sort_order, rt.slug
                """).param("slug", propertySlug)
                .query((rs, n) -> new RequestRoom(rs.getObject("id", UUID.class), rs.getString("slug"),
                        rs.getShort("max_adults"), rs.getShort("max_children"), rs.getShort("max_occupancy")))
                .list().stream().filter(room -> slugs == null || slugs.contains(room.roomTypeSlug())).toList();
    }
}
