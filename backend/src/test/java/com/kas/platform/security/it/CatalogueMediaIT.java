package com.kas.platform.security.it;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** GET /public/properties/catalogue/media: console images of every published hotel in one read. */
class CatalogueMediaIT extends SecurityIntegrationTest {
    @Autowired JdbcClient jdbc;
    @Autowired ObjectMapper json;

    private UUID externalImage(UUID partner, String url, String ownerType, UUID ownerId, int order, boolean cover, String status) {
        UUID asset = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO media_asset (id, partner_id, mime_type, category, visibility, status, external_url)
                VALUES (:id, :partner, 'image/jpeg', CAST(:category AS media_category), 'PUBLIC', CAST(:status AS media_status), :url)
                """).param("id", asset).param("partner", partner).param("url", url)
                .param("category", "PROPERTY".equals(ownerType) ? "EXTERIOR" : "ROOM").param("status", status).update();
        jdbc.sql("INSERT INTO media_asset_translation (media_asset_id, locale, alt_text) VALUES (:id, 'en', 'QA image')")
                .param("id", asset).update();
        jdbc.sql("""
                INSERT INTO media_link (id, media_asset_id, owner_type, owner_id, display_order, is_cover, status)
                VALUES (:link, :asset, CAST(:ownerType AS media_owner_type), :owner, :order, :cover, 'PUBLISHED')
                """).param("link", UUID.randomUUID()).param("asset", asset).param("ownerType", ownerType)
                .param("owner", ownerId).param("order", order).param("cover", cover).update();
        return asset;
    }

    private JsonNode entryFor(String slug) throws Exception {
        String body = mockMvc.perform(get("/api/v1/public/properties/catalogue/media").param("locale", "en"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        for (JsonNode entry : json.readTree(body)) if (slug.equals(entry.path("slug").asText())) return entry;
        return null;
    }

    @Test void publishedImagesComeBackCoverFirstAndPerRoomType() throws Exception {
        UUID partner = fixtures.createPartner("catalogue-media");
        UUID property = fixtures.createProperties(partner, 1).getFirst();
        fixtures.setPropertyNames(property, "TEST_MEDIA_HOTEL");
        fixtures.openProperty(property);
        String slug = fixtures.slugOf(property);
        UUID room = jdbc.sql("INSERT INTO room_type(property_id, slug, status, max_adults, max_children, max_occupancy) VALUES(:p, 'qa-media-room', 'PUBLISHED', 2, 0, 2) RETURNING id")
                .param("p", property).query(UUID.class).single();

        externalImage(partner, "https://example.invalid/second.jpg", "PROPERTY", property, 2, false, "PUBLISHED");
        externalImage(partner, "https://example.invalid/cover.jpg", "PROPERTY", property, 5, true, "PUBLISHED");
        externalImage(partner, "https://example.invalid/draft.jpg", "PROPERTY", property, 1, false, "DRAFT");
        externalImage(partner, "https://example.invalid/room.jpg", "ROOM_TYPE", room, 1, true, "PUBLISHED");

        JsonNode entry = entryFor(slug);
        assertThat(entry).isNotNull();
        assertThat(entry.path("gallery")).hasSize(2);
        assertThat(entry.path("gallery").get(0).path("url").asText()).isEqualTo("https://example.invalid/cover.jpg");
        assertThat(entry.path("gallery").get(1).path("url").asText()).isEqualTo("https://example.invalid/second.jpg");
        assertThat(entry.path("roomTypes").path("qa-media-room").get(0).path("url").asText()).isEqualTo("https://example.invalid/room.jpg");

        jdbc.sql("UPDATE property SET lifecycle_state='CLOSED' WHERE id=:id").param("id", property).update();
        assertThat(entryFor(slug)).as("a closed hotel's images are not public").isNull();
    }

    /** V67: the Eliana photos are registered, published, with one cover, and every file ships in frontend/img. */
    @Test void elianaGalleryIsRegisteredAndShipsWithTheWebsite() {
        String slug = "kas-eliana-luxury-hotel";
        List<String> urls = jdbc.sql("""
                SELECT a.external_url FROM media_link l
                  JOIN media_asset a ON a.id = l.media_asset_id
                  JOIN property p ON p.id = l.owner_id
                 WHERE l.owner_type = 'PROPERTY' AND p.slug = :slug
                   AND a.external_url LIKE '/img/hotels/kas-eliana-luxury-hotel/%'
                   AND l.status = 'PUBLISHED' AND a.status = 'PUBLISHED' AND a.visibility = 'PUBLIC'
                 ORDER BY l.display_order
                """).param("slug", slug).query(String.class).list();
        assertThat(urls).hasSize(9);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM media_link l JOIN property p ON p.id = l.owner_id
                 WHERE l.owner_type = 'PROPERTY' AND p.slug = :slug AND l.is_cover
                """).param("slug", slug).query(Long.class).single())
                .as("the hotel has exactly one cover").isEqualTo(1L);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM media_asset_translation t JOIN media_asset a ON a.id = t.media_asset_id
                 WHERE a.external_url LIKE '/img/hotels/kas-eliana-luxury-hotel/%'
                """).query(Long.class).single()).as("vi + en alt text for every photo").isEqualTo(18L);
        Path website = Path.of("..", "frontend");
        assertThat(urls).allSatisfy(url -> assertThat(Files.isRegularFile(website.resolve(url.substring(1))))
                .as("%s is missing from frontend/", url).isTrue());
    }
}
