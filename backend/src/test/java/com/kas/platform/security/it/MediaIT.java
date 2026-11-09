package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

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
 * Phase 7.5C — media, over HTTP, against PostgreSQL.
 *
 * <p>Covers registration, the alt-text publish gate, attachment, cover
 * semantics, ordering, detach, cross-partner isolation and — most importantly —
 * the four independent conditions that must all hold before an image reaches a
 * guest.
 */
@org.springframework.context.annotation.Import(FakeObjectStorage.class)
class MediaIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "media-password-7734";
    private static final String MEDIA = "/api/v1/admin/media";

    @org.springframework.beans.factory.annotation.Autowired
    private com.kas.platform.media.StorageProvider storage;

    // ------------------------------------------------------------- registration

    @Test
    @DisplayName("an asset is registered, and the response never carries the storage key")
    void registerAsset() throws Exception {
        Fixture f = partner();

        String body = mockMvc.perform(post(MEDIA).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(asset("image/jpeg", "EXTERIOR")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString();

        UUID assetId = idOf(body);

        // Doc 62 §6 / doc 58 §9: the key is not a field on any response.
        //
        // It is no longer absent from the *bytes* of one, and cannot be: the key
        // is `m/{assetId}` now, which is exactly the path of the delivery URL
        // this response carries. What the denylist protects is unchanged — no
        // storage key as a field, no partner id, no checksum.
        assertThat(body).doesNotContain("storageKey").doesNotContain("storage_key");
        assertThat(body).doesNotContain("partnerId").doesNotContain("checksum");
    }

    @Test
    @DisplayName("the platform assigns the storage key, and it is the delivery path")
    void platformAssignsStorageKey() throws Exception {
        Fixture f = partner();
        UUID assetId = registerAsset(f);

        // Doc 62 §3: an attacker-supplied name must never become an object key.
        // The key is a random v4 UUID the platform mints, and it is the delivery
        // path — `{base}/m/{assetId}` only resolves if the object is at
        // `m/{assetId}`. See MediaDeliveryKeyIT for the failure that proved it.
        assertThat(fixtures.storageKeyOf(assetId)).isEqualTo("m/" + assetId);
        assertThat(fixtures.storageKeyOf(assetId)).doesNotContain(f.partnerId.toString());
    }

    @Test
    @DisplayName("SVG is refused — it is a script vector, not a photograph")
    void svgIsRefused() throws Exception {
        Fixture f = partner();

        mockMvc.perform(post(MEDIA).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(asset("image/svg+xml", "EXTERIOR")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("a category outside the frozen enum is refused")
    void unknownCategoryIsRefused() throws Exception {
        Fixture f = partner();

        mockMvc.perform(post(MEDIA).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(asset("image/jpeg", "DRONE_FOOTAGE")))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------- alt text publish gate

    @Test
    @DisplayName("an asset cannot be published without alt text in both locales")
    void altTextIsAPublishGate() throws Exception {
        Fixture f = partner();
        UUID assetId = registerAsset(f);

        // Doc 62 §5: alt text is a publish gate, in both locales.
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("altText"));

        describe(f, assetId, "en", "The rooftop terrace at dusk");

        // One locale is still not enough — English alt text on a Vietnamese page
        // is itself a failure (doc 62 §5).
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest());

        describe(f, assetId, "vi", "Sân thượng lúc hoàng hôn");

        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    // ------------------------------------------------------------------- linking

    @Test
    @DisplayName("an asset attaches to a property in the same partner")
    void attachToOwnProperty() throws Exception {
        Fixture f = partner();
        UUID assetId = registerAsset(f);

        mockMvc.perform(post(MEDIA + "/" + assetId + "/links").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(link("PROPERTY", f.propertyId, 0)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.isCover").value(false))
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    @DisplayName("detaching leaves the asset in the library")
    void detachKeepsTheAsset() throws Exception {
        Fixture f = partner();
        UUID assetId = registerAsset(f);
        UUID linkId = attach(f, assetId, "PROPERTY", f.propertyId, 0);

        mockMvc.perform(delete(MEDIA + "/" + assetId + "/links/" + linkId)
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isNoContent());

        // Doc 62 §2: one asset, many galleries. Removing it from one must not
        // destroy it for the others.
        assertThat(fixtures.mediaAssetExists(assetId)).isTrue();
    }

    // --------------------------------------------------------------------- cover

    @Test
    @DisplayName("an owner has at most one cover, however many times it is reassigned")
    void exactlyOneCover() throws Exception {
        Fixture f = partner();
        UUID first = registerAsset(f);
        UUID second = registerAsset(f);
        UUID linkA = attach(f, first, "PROPERTY", f.propertyId, 0);
        UUID linkB = attach(f, second, "PROPERTY", f.propertyId, 1);

        mockMvc.perform(patch(MEDIA + "/" + first + "/links/" + linkA + "/cover")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isCover").value(true));
        assertThat(fixtures.coverCount("PROPERTY", f.propertyId)).isEqualTo(1);

        // Reassigning clears the previous cover in the same transaction — the
        // partial unique index would reject it otherwise.
        mockMvc.perform(patch(MEDIA + "/" + second + "/links/" + linkB + "/cover")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        assertThat(fixtures.coverCount("PROPERTY", f.propertyId))
                .as("media_link_one_cover_idx guarantees this without application coordination")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("repeated cover assignment is idempotent and never duplicates")
    void repeatedCoverAssignment() throws Exception {
        Fixture f = partner();
        UUID assetId = registerAsset(f);
        UUID linkId = attach(f, assetId, "PROPERTY", f.propertyId, 0);

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/cover")
                    .with(csrf()).cookie(f.session)).andExpect(status().isOk());
        }
        assertThat(fixtures.coverCount("PROPERTY", f.propertyId)).isEqualTo(1);
    }

    @Test
    @DisplayName("property and room covers are independent")
    void coversAreScopedToTheOwner() throws Exception {
        Fixture f = partner();
        UUID roomTypeId = fixtures.addRoomType(f.propertyId, "deluxe");
        UUID a1 = registerAsset(f);
        UUID a2 = registerAsset(f);

        UUID propertyLink = attach(f, a1, "PROPERTY", f.propertyId, 0);
        UUID roomLink = attach(f, a2, "ROOM_TYPE", roomTypeId, 0);

        mockMvc.perform(patch(MEDIA + "/" + a1 + "/links/" + propertyLink + "/cover")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());
        mockMvc.perform(patch(MEDIA + "/" + a2 + "/links/" + roomLink + "/cover")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());

        // One cover each — the index keys on (owner_type, owner_id).
        assertThat(fixtures.coverCount("PROPERTY", f.propertyId)).isEqualTo(1);
        assertThat(fixtures.coverCount("ROOM_TYPE", roomTypeId)).isEqualTo(1);
    }

    // ----------------------------------------------------------------- isolation

    @Test
    @DisplayName("a Partner cannot touch another Partner's media or attach across partners")
    void crossPartnerIsolation() throws Exception {
        Fixture a = partner();
        Fixture b = partner();
        UUID bAsset = registerAsset(b);
        UUID bLink = attach(b, bAsset, "PROPERTY", b.propertyId, 0);
        UUID aAsset = registerAsset(a);

        // A reading B's asset
        mockMvc.perform(get(MEDIA + "/" + bAsset).cookie(a.session))
                .andExpect(status().isNotFound());
        // A publishing B's asset
        mockMvc.perform(post(MEDIA + "/" + bAsset + "/publish").with(csrf()).cookie(a.session))
                .andExpect(status().isNotFound());
        // A taking over B's cover
        mockMvc.perform(patch(MEDIA + "/" + bAsset + "/links/" + bLink + "/cover")
                        .with(csrf()).cookie(a.session))
                .andExpect(status().isNotFound());
        // A detaching B's link
        mockMvc.perform(delete(MEDIA + "/" + bAsset + "/links/" + bLink)
                        .with(csrf()).cookie(a.session))
                .andExpect(status().isNotFound());
        // A attaching its OWN asset to B's property — both ends are checked
        mockMvc.perform(post(MEDIA + "/" + aAsset + "/links").with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(link("PROPERTY", b.propertyId, 0)))
                .andExpect(status().isNotFound());
        // A attaching B's asset to A's own property
        mockMvc.perform(post(MEDIA + "/" + bAsset + "/links").with(csrf()).cookie(a.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(link("PROPERTY", a.propertyId, 0)))
                .andExpect(status().isNotFound());

        // A's library shows only A's assets
        mockMvc.perform(get(MEDIA).cookie(a.session))
                .andExpect(jsonPath("$.length()").value(1));
        assertThat(fixtures.coverCount("PROPERTY", b.propertyId))
                .as("B's cover is untouched")
                .isZero();
    }

    // -------------------------------------------------- publication safety (the four)

    @Test
    @DisplayName("media becomes public only when asset, link and property all allow it")
    void publicationRequiresAllFourConditions() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        String slug = fixtures.slugOf(f.propertyId);

        // A genuinely completed upload: since Step 16A.50 a cover whose asset has
        // no bytes does not satisfy the hero gate, so a descriptor here would fail
        // at approval on a condition this test is not about.
        UUID assetId = completedAsset(f);
        UUID linkId = attach(f, assetId, "PROPERTY", f.propertyId, 0);
        describe(f, assetId, "en", "Alt");
        describe(f, assetId, "vi", "Alt vi");

        // 1. uploaded and linked, but nothing published, property still DRAFT
        assertGalleryEmpty(slug);

        // 2. marked as cover — still not public
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/cover")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());
        assertGalleryEmpty(slug);

        // 3. asset published — link still DRAFT, property still DRAFT
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
        assertGalleryEmpty(slug);

        // 4. link published — property still DRAFT
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/status?status=PUBLISHED")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());
        assertGalleryEmpty(slug);

        // Only when the property itself is approved does the image appear.
        approveProperty(f);

        mockMvc.perform(get("/api/v1/public/properties/" + slug + "/gallery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].isCover").value(true))
                .andExpect(jsonPath("$[0].alt").value("Alt"));
    }

    @Test
    @DisplayName("the public gallery exposes nothing internal")
    void publicGalleryIsClean() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        UUID assetId = registerAsset(f);
        UUID linkId = attach(f, assetId, "PROPERTY", f.propertyId, 0);
        describe(f, assetId, "en", "Alt");
        describe(f, assetId, "vi", "Alt vi");
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session));
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/status?status=PUBLISHED")
                .with(csrf()).cookie(f.session));
        approveProperty(f);

        String body = mockMvc.perform(get("/api/v1/public/properties/"
                        + fixtures.slugOf(f.propertyId) + "/gallery"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // The key itself is now the delivery path, so it is necessarily present
        // — that is the contract, not a leak. Everything the denylist is really
        // about stays out.
        assertThat(body)
                .doesNotContain("storageKey")
                .doesNotContain("partnerId")
                .doesNotContain("checksum")
                .doesNotContain("uploadedBy")
                .doesNotContain(f.partnerId.toString());
        // The URL is built from the opaque asset id, which doc 62 §6 permits.
        assertThat(body).contains("https://test-delivery.invalid/m/" + assetId);
        // The gallery category, so the website can group photos (2026-11-08).
        assertThat(body).contains("\"category\":\"EXTERIOR\"");
    }

    @Test
    @DisplayName("an image can be filed under another category, within scope and the frozen enum")
    void recategorize() throws Exception {
        Fixture f = partner();
        UUID assetId = registerAsset(f);

        mockMvc.perform(patch(MEDIA + "/" + assetId + "/category").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"category\":\"LOBBY\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category").value("LOBBY"));

        mockMvc.perform(patch(MEDIA + "/" + assetId + "/category").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"category\":\"POOL\"}"))
                .andExpect(status().isBadRequest());

        Fixture other = partner();
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/category").with(csrf()).cookie(other.session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"category\":\"ROOM\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("room media stays invisible while its room type is unpublished")
    void roomMediaRequiresPublishedRoom() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);
        String slug = fixtures.slugOf(f.propertyId);
        approveProperty(f);

        // A room added after approval stays DRAFT (Phase 7.5B rule).
        UUID roomTypeId = fixtures.addRoomType(f.propertyId, "late-room");
        UUID assetId = registerAsset(f);
        UUID linkId = attach(f, assetId, "ROOM_TYPE", roomTypeId, 0);
        describe(f, assetId, "en", "Alt");
        describe(f, assetId, "vi", "Alt vi");
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session));
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/status?status=PUBLISHED")
                .with(csrf()).cookie(f.session));

        // Asset published, link published, property published — but the room is not.
        mockMvc.perform(get("/api/v1/public/properties/" + slug + "/room-types/late-room/gallery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // -------------------------------------------------------------------- helpers

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("media");
        UUID admin = fixtures.createUser("media-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    /**
     * An asset that has actually been uploaded — doc 62 §4, start to finish.
     *
     * <p>Storage is the in-memory fake; what matters here is that the asset ends
     * up with the checksum only { completeUpload} can write, because the
     * hero-image gate counts those.
     */
    private UUID completedAsset(Fixture f) throws Exception {
        String minted = mockMvc.perform(post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(asset("image/png", "EXTERIOR")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID assetId = UUID.fromString(minted.replaceAll(
                "^.*?\"mediaAssetId\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));

        ((FakeObjectStorage.InMemory) storage).put(fixtures.storageKeyOf(assetId), "image/png",
                new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                           0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52});
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
        return assetId;
    }

    private UUID registerAsset(Fixture f) throws Exception {
        return idOf(mockMvc.perform(post(MEDIA).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(asset("image/jpeg", "EXTERIOR")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private UUID attach(Fixture f, UUID assetId, String ownerType, UUID ownerId, int order)
            throws Exception {
        return idOf(mockMvc.perform(post(MEDIA + "/" + assetId + "/links")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(link(ownerType, ownerId, order)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private void describe(Fixture f, UUID assetId, String locale, String alt) throws Exception {
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/translations")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"" + locale + "\",\"altText\":\"" + alt + "\"}"))
                .andExpect(status().isOk());
    }

    /** Drives the real Phase 7.5A workflow: submit then approve. */
    private void approveProperty(Fixture f) throws Exception {
        String submission = mockMvc.perform(
                        post("/api/v1/admin/properties/" + f.propertyId + "/submit")
                                .with(csrf()).cookie(f.session))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + idOf(submission) + "/approve")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());
    }

    private void assertGalleryEmpty(String slug) throws Exception {
        mockMvc.perform(get("/api/v1/public/properties/" + slug + "/gallery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private static UUID idOf(String json) {
        return UUID.fromString(json.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    private static String asset(String mimeType, String category) {
        return """
                {"mimeType":"%s","category":"%s","width":2400,"height":1600,"sizeBytes":812345}
                """.formatted(mimeType, category);
    }

    private static String link(String ownerType, UUID ownerId, int order) {
        return """
                {"ownerType":"%s","ownerId":"%s","displayOrder":%d}
                """.formatted(ownerType, ownerId, order);
    }
}
