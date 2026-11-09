package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * An archived asset cannot be turned back into content a guest is shown.
 *
 * <h2>The defect this closes</h2>
 *
 * Deduplication archives the second copy of a set of bytes <em>and deletes the
 * object from the bucket</em> — see {@code MediaService.foldIntoExisting}. Before
 * this suite, nothing stopped that archived row from being attached to a gallery,
 * published, or promoted to a property's cover. Each of those produced a live
 * delivery URL for bytes that no longer exist: a broken image on a public hotel
 * page, with no error anywhere to say why.
 *
 * <p>The library read hides archived rows, so the picker never offers one. That
 * was the whole of the protection and it was not enough — asset ids are stable
 * and the routes take them directly, so a stale tab or a retried request reaches
 * the write with an id the picker would no longer show. These tests go through
 * the real HTTP routes with exactly such an id.
 *
 * <h2>Why the archived asset here is made by deduplication</h2>
 *
 * Rather than writing {@code status = 'ARCHIVED'} into the row, every test
 * arrives at an archived asset the way production does — by completing an upload
 * whose checksum already exists. That keeps the fixture honest: if dedupe ever
 * stops archiving, these tests stop testing what they claim to, instead of
 * quietly passing against a hand-made row.
 */
@Import(FakeObjectStorage.class)
class ArchivedMediaIntegrityIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "archived-media-password-7741";
    private static final String MEDIA = "/api/v1/admin/media";

    /** A real 1×1 PNG — a genuine header, not a string that looks like one. */
    private static final byte[] PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00};

    @Autowired
    private com.kas.platform.media.StorageProvider storage;

    private FakeObjectStorage.InMemory objects;

    @BeforeEach
    void resetStorage() {
        objects = (FakeObjectStorage.InMemory) storage;
        objects.reset();
    }

    // --------------------------------------------------------------- the fixture

    @Test
    @DisplayName("deduplication archives the duplicate and removes its bytes from storage")
    void deduplicationLeavesAnArchivedAssetWithNoObject() throws Exception {
        Fixture f = partner();
        Archived archived = archivedDuplicate(f);

        // The premise every other test in this file rests on: the row survives,
        // the bytes do not. That is precisely why it must not become content.
        assertThat(objects.has(archived.storageKey())).isFalse();

        mockMvc.perform(get(MEDIA + "/" + archived.assetId()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
    }

    @Test
    @DisplayName("the library stops offering an archived asset")
    void archivedAssetLeavesTheLibrary() throws Exception {
        Fixture f = partner();
        Archived archived = archivedDuplicate(f);

        String library = mockMvc.perform(get(MEDIA).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        assertThat(library).doesNotContain(archived.assetId().toString());
    }

    // ------------------------------------------------------------------- attach

    @Test
    @DisplayName("an archived asset cannot be attached to a property")
    void archivedAssetCannotBeAttachedToAProperty() throws Exception {
        Fixture f = partner();
        Archived archived = archivedDuplicate(f);

        mockMvc.perform(attach(f, archived.assetId(), "PROPERTY", f.propertyId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("mediaAssetId"))
                .andExpect(jsonPath("$.details[0].code").value("ASSET_ARCHIVED"));

        // Refused, not merely reported as refused: no link exists afterwards.
        mockMvc.perform(get(MEDIA + "/" + archived.assetId()
                        + "/usages?ownerType=PROPERTY&ownerId=" + f.propertyId)
                        .cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("an archived asset cannot be attached to a room type either")
    void archivedAssetCannotBeAttachedToARoomType() throws Exception {
        Fixture f = partner();
        UUID roomTypeId = fixtures.addRoomType(f.propertyId, "archived-room");
        Archived archived = archivedDuplicate(f);

        mockMvc.perform(attach(f, archived.assetId(), "ROOM_TYPE", roomTypeId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("ASSET_ARCHIVED"));
    }

    @Test
    @DisplayName("a live asset still attaches — the guard refuses one thing only")
    void liveAssetsStillAttach() throws Exception {
        Fixture f = partner();
        Archived archived = archivedDuplicate(f);

        // The surviving original, from the same pair of identical uploads.
        mockMvc.perform(attach(f, archived.originalId(), "PROPERTY", f.propertyId))
                .andExpect(status().isCreated());
    }

    // ------------------------------------------------------------------ publish

    @Test
    @DisplayName("an archived asset cannot be published, even with alt text in both locales")
    void archivedAssetCannotBePublished() throws Exception {
        Fixture f = partner();
        Archived archived = archivedDuplicate(f);

        // Satisfying the publish gate that does exist, to prove the refusal is
        // the archive rule rather than the missing alt text.
        describe(f, archived.assetId(), "vi", "Ảnh đã lưu trữ");
        describe(f, archived.assetId(), "en", "Archived image");

        mockMvc.perform(post(MEDIA + "/" + archived.assetId() + "/publish")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("ASSET_ARCHIVED"));

        mockMvc.perform(get(MEDIA + "/" + archived.assetId()).cookie(f.session))
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
    }

    // -------------------------------------------------------------------- cover

    @Test
    @DisplayName("a link whose asset was archived after attaching cannot become the cover")
    void archivedAssetCannotBecomeTheCover() throws Exception {
        Fixture f = partner();
        Attached stale = attachedThenArchived(f);

        mockMvc.perform(patch(MEDIA + "/" + stale.assetId() + "/links/" + stale.linkId() + "/cover")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("ASSET_ARCHIVED"));

        // Nothing became the cover as a side effect of the refusal.
        assertThat(fixtures.coverCount("PROPERTY", f.propertyId)).isZero();
    }

    @Test
    @DisplayName("a live link still becomes the cover — the guard refuses one thing only")
    void liveLinksStillBecomeTheCover() throws Exception {
        Fixture f = partner();

        UUID assetId = uploaded(f, PNG);
        UUID linkId = idOf(mockMvc.perform(attach(f, assetId, "PROPERTY", f.propertyId))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "id");

        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/cover")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isCover").value(true));
    }

    @Test
    @DisplayName("a link whose asset was archived cannot be published")
    void archivedAssetLinkCannotBePublished() throws Exception {
        Fixture f = partner();
        Attached stale = attachedThenArchived(f);

        mockMvc.perform(patch(MEDIA + "/" + stale.assetId() + "/links/" + stale.linkId()
                        + "/status?status=PUBLISHED").with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("ASSET_ARCHIVED"));
    }

    // ------------------------------------------------------------------ tidying

    @Test
    @DisplayName("tidying a gallery is never blocked — detach and archive-the-link still work")
    void tidyingIsStillAllowed() throws Exception {
        Fixture f = partner();
        Attached stale = attachedThenArchived(f);

        // Archiving the link — the way a partner removes it from public view —
        // stays open. A guard that also blocked this would trap the very rows it
        // is meant to keep out of sight.
        mockMvc.perform(patch(MEDIA + "/" + stale.assetId() + "/links/" + stale.linkId()
                        + "/status?status=ARCHIVED").with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        mockMvc.perform(delete(MEDIA + "/" + stale.assetId() + "/links/" + stale.linkId())
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isNoContent());
    }

    // -------------------------------------------------------------------- scope

    @Test
    @DisplayName("another partner's archived asset is still absent, not merely refused")
    void anotherPartnersArchivedAssetIsNotFound() throws Exception {
        Fixture a = partner();
        Fixture b = partner();
        Archived archived = archivedDuplicate(a);

        // 404, not the archive message: the ownership boundary answers first, so
        // this cannot be used to learn that the id exists. Doc 85 §6.3.
        mockMvc.perform(attach(b, archived.assetId(), "PROPERTY", b.propertyId))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ helpers

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    /** The archived duplicate, the asset it was folded into, and the key that was deleted. */
    private record Archived(UUID assetId, UUID originalId, String storageKey) {
    }

    /** A link that was created while its asset was live, and outlived it. */
    private record Attached(UUID assetId, UUID linkId) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("a-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("archived-media-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "ARCHIVED_MEDIA_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    /** Uploads bytes and completes, returning the live asset id. */
    private UUID uploaded(Fixture f, byte[] bytes) throws Exception {
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(assetId), "image/png", bytes);
        mockMvc.perform(complete(f, assetId)).andExpect(status().isOk());
        return assetId;
    }

    /**
     * Uploads the same bytes twice, so the second is folded away and archived.
     *
     * @return the archived duplicate, alongside the original it was folded into
     */
    private Archived archivedDuplicate(Fixture f) throws Exception {
        UUID original = uploaded(f, PNG);

        UUID duplicate = assetOf(f, "image/png", "EXTERIOR");
        String duplicateKey = fixtures.storageKeyOf(duplicate);
        objects.put(duplicateKey, "image/png", PNG);

        mockMvc.perform(complete(f, duplicate))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(original.toString()));

        return new Archived(duplicate, original, duplicateKey);
    }

    /**
     * A gallery link whose asset is archived <em>after</em> it was attached.
     *
     * <p>This is the case the attach guard cannot catch and the one that actually
     * occurs: the asset is attached while it is still a live draft, and only later
     * turns out to be a duplicate of bytes already in the library. The link
     * survives the fold, pointing at a row whose object has been deleted — which
     * is exactly the state {@code setCover} and link-publish must refuse.
     *
     * <p>Built entirely from production routes: no row is edited by hand, so if
     * deduplication ever stops archiving the duplicate, the fixture's own
     * assertion fails rather than the tests passing vacuously.
     */
    private Attached attachedThenArchived(Fixture f) throws Exception {
        UUID original = uploaded(f, PNG);

        UUID duplicate = assetOf(f, "image/png", "EXTERIOR");
        UUID linkId = idOf(mockMvc.perform(attach(f, duplicate, "PROPERTY", f.propertyId))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "id");

        objects.put(fixtures.storageKeyOf(duplicate), "image/png", PNG);
        mockMvc.perform(complete(f, duplicate))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(original.toString()));

        mockMvc.perform(get(MEDIA + "/" + duplicate).cookie(f.session))
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        return new Attached(duplicate, linkId);
    }

    private MockHttpServletRequestBuilder attach(Fixture f, UUID assetId,
                                                 String ownerType, UUID ownerId) {
        return post(MEDIA + "/" + assetId + "/links").with(csrf()).cookie(f.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"ownerType\":\"" + ownerType + "\",\"ownerId\":\"" + ownerId + "\"}");
    }

    private MockHttpServletRequestBuilder complete(Fixture f, UUID assetId) {
        return post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session);
    }

    private UUID assetOf(Fixture f, String mimeType, String category) throws Exception {
        String body = """
                {"mimeType":"%s","category":"%s","width":2400,"height":1600,"sizeBytes":812345}
                """.formatted(mimeType, category);
        return idOf(mockMvc.perform(post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "mediaAssetId");
    }

    private void describe(Fixture f, UUID assetId, String locale, String alt) throws Exception {
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/translations")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"" + locale + "\",\"altText\":\"" + alt + "\"}"))
                .andExpect(status().isOk());
    }

    private static UUID idOf(String json, String field) {
        return UUID.fromString(json.replaceAll(
                "^.*?\"" + field + "\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }
}
