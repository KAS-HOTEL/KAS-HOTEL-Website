package com.kas.platform.media;

import com.kas.platform.media.api.PublicMediaView;
import com.kas.platform.shared.scope.PublicReadRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Public media for a published property or room type.
 *
 * <p>Implements {@link PublicReadRepository}: a guest has no
 * {@code AuthorizationScope}, so the filter is publication state — and here that
 * means <strong>four independent conditions, all in SQL</strong>:
 *
 * <ol>
 *   <li>the asset is {@code PUBLISHED} and not archived;</li>
 *   <li>the asset's visibility is {@code PUBLIC}, not {@code INTERNAL};</li>
 *   <li>the <em>link</em> is {@code PUBLISHED} — attaching an image is not the
 *       same as publishing it;</li>
 *   <li>the owning property is publicly visible, and for room media the room type
 *       is {@code PUBLISHED} too.</li>
 * </ol>
 *
 * <p>That is what makes the phase brief's rule true: media does not become public
 * merely because it was uploaded, linked, or marked as cover. Every one of those
 * four can be satisfied individually without the image reaching a guest, and
 * {@code MediaPublicationIT} tests each in isolation.
 *
 * <p>The query never selects {@code storage_key}. The URL is composed from the
 * opaque asset id by {@link StorageProvider}, so the key has no path to a
 * response even by accident.
 */
@Repository
public class PublishedMediaRepository implements PublicReadRepository {

    /** Doc 03 §8, the same expression the property repository uses. */
    private static final String PROPERTY_PUBLICLY_VISIBLE =
            "p.lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')";

    private static final String PUBLISHABLE_MEDIA = """
            a.status = 'PUBLISHED' AND a.archived_at IS NULL
              AND a.visibility = 'PUBLIC' AND l.status = 'PUBLISHED'
            """;

    private final JdbcClient jdbc;
    private final StorageProvider storage;

    public PublishedMediaRepository(JdbcClient jdbc, StorageProvider storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    /** Gallery for a published property, cover first then display order. */
    public List<PublicMediaView> forProperty(String propertySlug, String locale) {
        return jdbc.sql("""
                        SELECT a.id, a.width, a.height, a.external_url, t.alt_text, t.caption, l.is_cover, a.category::text AS category
                          FROM media_link l
                          JOIN media_asset a ON a.id = l.media_asset_id
                          JOIN property p ON p.id = l.owner_id
                          LEFT JOIN media_asset_translation t
                                 ON t.media_asset_id = a.id AND t.locale = :locale
                         WHERE l.owner_type = 'PROPERTY' AND p.slug = :slug
                           AND %s AND %s
                         ORDER BY l.is_cover DESC, l.display_order, a.id
                        """.formatted(PUBLISHABLE_MEDIA, PROPERTY_PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query(this::map)
                .list();
    }

    /**
     * Gallery for a published room type of a published property.
     *
     * <p>Both the property and the room type must be publicly visible. A
     * published image on a published room of a {@code DRAFT} property stays
     * invisible, which is the case a controller check would most easily miss.
     */
    public List<PublicMediaView> forRoomType(String propertySlug, String roomTypeSlug,
                                             String locale) {
        return jdbc.sql("""
                        SELECT a.id, a.width, a.height, a.external_url, t.alt_text, t.caption, l.is_cover, a.category::text AS category
                          FROM media_link l
                          JOIN media_asset a ON a.id = l.media_asset_id
                          JOIN room_type rt ON rt.id = l.owner_id
                          JOIN property p ON p.id = rt.property_id
                          LEFT JOIN media_asset_translation t
                                 ON t.media_asset_id = a.id AND t.locale = :locale
                         WHERE l.owner_type = 'ROOM_TYPE'
                           AND p.slug = :propertySlug AND rt.slug = :roomTypeSlug
                           AND rt.status = 'PUBLISHED'
                           AND %s AND %s
                         ORDER BY l.is_cover DESC, l.display_order, a.id
                        """.formatted(PUBLISHABLE_MEDIA, PROPERTY_PUBLICLY_VISIBLE))
                .param("propertySlug", propertySlug)
                .param("roomTypeSlug", roomTypeSlug)
                .param("locale", locale)
                .query(this::map)
                .list();
    }

    /**
     * Every publicly visible hotel's gallery and room type galleries, in one pass each,
     * for the website. Hotels with no published image are left out; ordering matches the
     * single-owner reads (cover first, then display order).
     */
    public List<com.kas.platform.media.api.PublicCatalogueMediaView> forCatalogue(String locale) {
        java.util.Map<String, List<PublicMediaView>> galleries = new java.util.LinkedHashMap<>();
        java.util.Map<String, java.util.Map<String, List<PublicMediaView>>> rooms = new java.util.LinkedHashMap<>();
        jdbc.sql("""
                        SELECT p.slug, a.id, a.width, a.height, a.external_url, t.alt_text, t.caption, l.is_cover, a.category::text AS category
                          FROM media_link l
                          JOIN media_asset a ON a.id = l.media_asset_id
                          JOIN property p ON p.id = l.owner_id
                          LEFT JOIN media_asset_translation t
                                 ON t.media_asset_id = a.id AND t.locale = :locale
                         WHERE l.owner_type = 'PROPERTY' AND %s AND %s
                         ORDER BY p.sort_order, p.slug, l.is_cover DESC, l.display_order, a.id
                        """.formatted(PUBLISHABLE_MEDIA, PROPERTY_PUBLICLY_VISIBLE))
                .param("locale", locale)
                .query((rs, rowNum) -> {
                    galleries.computeIfAbsent(rs.getString("slug"), k -> new java.util.ArrayList<>()).add(map(rs, rowNum));
                    return null;
                })
                .list();
        jdbc.sql("""
                        SELECT p.slug, rt.slug AS room_type_slug, a.id, a.width, a.height, a.external_url,
                               t.alt_text, t.caption, l.is_cover, a.category::text AS category
                          FROM media_link l
                          JOIN media_asset a ON a.id = l.media_asset_id
                          JOIN room_type rt ON rt.id = l.owner_id
                          JOIN property p ON p.id = rt.property_id
                          LEFT JOIN media_asset_translation t
                                 ON t.media_asset_id = a.id AND t.locale = :locale
                         WHERE l.owner_type = 'ROOM_TYPE' AND rt.status = 'PUBLISHED' AND %s AND %s
                         ORDER BY p.sort_order, p.slug, rt.sort_order, rt.slug, l.is_cover DESC, l.display_order, a.id
                        """.formatted(PUBLISHABLE_MEDIA, PROPERTY_PUBLICLY_VISIBLE))
                .param("locale", locale)
                .query((rs, rowNum) -> {
                    rooms.computeIfAbsent(rs.getString("slug"), k -> new java.util.LinkedHashMap<>())
                            .computeIfAbsent(rs.getString("room_type_slug"), k -> new java.util.ArrayList<>())
                            .add(map(rs, rowNum));
                    return null;
                })
                .list();
        java.util.Set<String> slugs = new java.util.LinkedHashSet<>(galleries.keySet());
        slugs.addAll(rooms.keySet());
        List<com.kas.platform.media.api.PublicCatalogueMediaView> out = new java.util.ArrayList<>();
        for (String slug : slugs) {
            out.add(new com.kas.platform.media.api.PublicCatalogueMediaView(slug,
                    galleries.getOrDefault(slug, List.of()), rooms.getOrDefault(slug, java.util.Map.of())));
        }
        return out;
    }

    private PublicMediaView map(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new PublicMediaView(
                rs.getString("external_url") != null ? rs.getString("external_url")
                        : storage.deliveryUrl(rs.getObject("id", UUID.class)),
                (Integer) rs.getObject("width"),
                (Integer) rs.getObject("height"),
                rs.getString("alt_text"),
                rs.getString("caption"),
                rs.getBoolean("is_cover"),
                rs.getString("category"));
    }
}
