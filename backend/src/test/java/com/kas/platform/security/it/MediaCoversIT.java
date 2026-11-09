package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <h1>{@code GET /admin/media/covers} — the cover of every hotel, in one request</h1>
 *
 * <p>The Partner overview shows a card per property and wants each one's cover on
 * it. A gallery is otherwise assembled from the library plus one {@code usages}
 * call per asset, which is the right shape for the single owner a media screen
 * edits and the wrong one for a portfolio: eight hotels would cost the library
 * eight times over.
 *
 * <p>The alternative — putting the cover on {@code PropertyAdminView} — is the
 * one thing this route exists to avoid. {@code onboarding} does not depend on
 * {@code media}, so a portfolio row carrying a media field would drag the module
 * graph across a boundary doc 12 §3 draws, to save one request.
 *
 * <p>What is asserted here is that the route answers only for owners the caller
 * can reach, keeps property and room covers apart, and never mentions storage.
 */
@Import(FakeObjectStorage.class)
class MediaCoversIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "media-covers-password-8830";
    private static final String MEDIA = "/api/v1/admin/media";
    private static final String COVERS = MEDIA + "/covers";

    /** A real 1×1 PNG — a genuine header, not a string that looks like one. */
    private static final byte[] PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00};

    @Autowired
    private com.kas.platform.media.StorageProvider storage;

    private FakeObjectStorage.InMemory objects;

    /** Makes every upload in a test distinct, so deduplication never fires. */
    private int uploadCount;

    @BeforeEach
    void resetStorage() {
        objects = (FakeObjectStorage.InMemory) storage;
        objects.reset();
        uploadCount = 0;
    }

    // ------------------------------------------------------------------ the answer

    @Test
    @DisplayName("a property's cover comes back with a delivery URL the card can use")
    void servesThePropertyCover() throws Exception {
        Fixture f = partner();
        UUID assetId = uploaded(f);
        cover(f, assetId, "PROPERTY", f.propertyId);

        mockMvc.perform(get(COVERS).param("ownerType", "PROPERTY").cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].ownerId").value(f.propertyId.toString()))
                .andExpect(jsonPath("$[0].mediaAssetId").value(assetId.toString()))
                // Doc 62 §6 — composed from the opaque asset id, never the key.
                .andExpect(jsonPath("$[0].url").value("https://test-delivery.invalid/m/" + assetId));
    }

    @Test
    @DisplayName("a property with no cover is absent rather than present and empty")
    void omitsPropertiesWithoutACover() throws Exception {
        Fixture f = partner();

        // Attached but never made the cover: a photograph in a gallery is not the
        // one the portfolio leads with, and the card must keep saying so.
        UUID assetId = uploaded(f);
        attach(f, assetId, "PROPERTY", f.propertyId);

        mockMvc.perform(get(COVERS).param("ownerType", "PROPERTY").cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("property covers and room covers are separate answers")
    void keepsOwnersApart() throws Exception {
        Fixture f = partner();
        UUID roomTypeId = fixtures.addRoomType(f.propertyId, "covers-room-"
                + UUID.randomUUID().toString().substring(0, 8));

        UUID propertyAsset = uploaded(f);
        cover(f, propertyAsset, "PROPERTY", f.propertyId);
        UUID roomAsset = uploaded(f);
        cover(f, roomAsset, "ROOM_TYPE", roomTypeId);

        // The whole reason media_link carries owner_type: a lobby photograph must
        // never surface as a room's, whatever else the two galleries share.
        mockMvc.perform(get(COVERS).param("ownerType", "PROPERTY").cookie(f.session))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].mediaAssetId").value(propertyAsset.toString()));

        mockMvc.perform(get(COVERS).param("ownerType", "ROOM_TYPE").cookie(f.session))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].ownerId").value(roomTypeId.toString()))
                .andExpect(jsonPath("$[0].mediaAssetId").value(roomAsset.toString()));
    }

    // ------------------------------------------------------------------ the limits

    @Test
    @DisplayName("another partner's cover is not in the answer")
    void staysWithinScope() throws Exception {
        Fixture mine = partner();
        Fixture theirs = partner();

        UUID theirAsset = uploaded(theirs);
        cover(theirs, theirAsset, "PROPERTY", theirs.propertyId);

        // Not a filter in a controller — the scope predicate is in the SQL, so a
        // route added later cannot forget it.
        mockMvc.perform(get(COVERS).param("ownerType", "PROPERTY").cookie(mine.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("an archived asset is not offered as anybody's cover")
    void skipsArchivedAssets() throws Exception {
        Fixture f = partner();
        UUID assetId = uploaded(f);
        cover(f, assetId, "PROPERTY", f.propertyId);

        // Archiving is what deduplication does to a duplicate. Its bytes are
        // deleted from storage, so serving it as a cover would be serving a 404.
        fixtures.archiveMediaAsset(assetId);

        mockMvc.perform(get(COVERS).param("ownerType", "PROPERTY").cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("the answer carries no storage internals")
    void leaksNothing() throws Exception {
        Fixture f = partner();
        UUID assetId = uploaded(f);
        cover(f, assetId, "PROPERTY", f.propertyId);

        String body = mockMvc.perform(get(COVERS).param("ownerType", "PROPERTY").cookie(f.session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("storageKey").doesNotContain("storage_key")
                .doesNotContain("bucket").doesNotContain("checksum")
                .doesNotContain(f.partnerId.toString());
    }

    @Test
    @DisplayName("anonymous cannot read covers")
    void requiresASession() throws Exception {
        mockMvc.perform(get(COVERS).param("ownerType", "PROPERTY"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("an owner kind with no Partner surface is refused, not silently empty")
    void refusesAnUnsupportedOwnerKind() throws Exception {
        Fixture f = partner();

        // FACILITY, OFFER, PAGE_BLOCK and REVIEW exist in the frozen enum and
        // have no Partner-facing surface. Binding rejects them outright rather
        // than returning [] as though the question had been answered.
        mockMvc.perform(get(COVERS).param("ownerType", "FACILITY").cookie(f.session))
                .andExpect(status().isBadRequest());
    }

    // -------------------------------------------------------------------- fixtures

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("cov-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("media-covers-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "COVERS_TEST_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    /**
     * A PNG whose trailing byte differs per photograph.
     *
     * <p>Doc 62 §4's deduplication is real and correct: identical bytes uploaded
     * twice archive the second and return the first. A test that wants two
     * distinct covers therefore has to upload two distinct images, exactly as an
     * operator with two photographs would. The header is untouched, so the
     * magic-byte check still sees a genuine PNG.
     */
    private static byte[] distinctPng(int marker) {
        byte[] bytes = java.util.Arrays.copyOf(PNG, PNG.length + 1);
        bytes[PNG.length] = (byte) marker;
        return bytes;
    }

    /** An asset with bytes actually behind it, through the real routes. */
    private UUID uploaded(Fixture f) throws Exception {
        String minted = mockMvc.perform(post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"mimeType":"image/png","category":"EXTERIOR",
                                 "width":2400,"height":1600,"sizeBytes":812345}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        UUID assetId = idOf(minted, "mediaAssetId");
        uploadCount += 1;
        objects.put(fixtures.storageKeyOf(assetId), "image/png", distinctPng(uploadCount));
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
        return assetId;
    }

    private UUID attach(Fixture f, UUID assetId, String ownerType, UUID ownerId) throws Exception {
        return idOf(mockMvc.perform(post(MEDIA + "/" + assetId + "/links")
                                .with(csrf()).cookie(f.session)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"ownerType":"%s","ownerId":"%s","displayOrder":0}
                                        """.formatted(ownerType, ownerId)))
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString(), "id");
    }

    private void cover(Fixture f, UUID assetId, String ownerType, UUID ownerId) throws Exception {
        UUID linkId = attach(f, assetId, ownerType, ownerId);
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/cover")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());
    }

    private static UUID idOf(String json, String field) {
        return UUID.fromString(json.replaceAll(
                "^.*?\"" + field + "\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }
}
