package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <h1>Photograph → cover → complete → submit → approve → public → gallery</h1>
 *
 * <p>Every link in this chain already has a test. None of them join it up, and
 * the join is what a release depends on: a hotel becomes visible to a guest only
 * if a real uploaded photograph satisfies the completeness gate, the gate lets
 * the submission through, an admin approves it, the lifecycle moves, and the
 * public reads then serve the very asset the Partner uploaded.
 *
 * <p>This test walks that path over HTTP in one transaction, and asserts the
 * **order of causation** rather than the end state alone: submission is refused
 * *before* the cover exists, naming `hero image`, and succeeds *after* it — so a
 * future change that quietly defaulted the gate would fail here rather than ship.
 *
 * <h2>Why this is the STEP L test</h2>
 *
 * STEP L set out to unblock this chain with live Cloudflare R2. R2 is not
 * provisioned for this project — {@code kas.media.r2.bucket} is unset and OQ-106
 * (which object-storage provider) is still OPEN — so the byte transfer itself
 * cannot be exercised against a real bucket here. {@link FakeObjectStorage}
 * stands in for the transport exactly as it does in {@code MediaUploadIT}: the
 * bytes are real, the magic-byte check is real, the checksum is computed from
 * the stored object, and every other participant is the production one.
 *
 * <p>What that proves is precise and worth stating: **the only input this
 * pipeline still lacks is a storage bucket.** Supply the four `KAS_R2_*`
 * variables and the same path runs against Cloudflare with nothing else changed
 * — see {@link R2ConfigurationGateIT}, which pins the failure that is left.
 *
 * <p>Everything runs inside the test transaction and is rolled back. No property
 * in {@code kas_web_dev} is submitted, approved or published by this file.
 */
@Import(FakeObjectStorage.class)
class PublishPipelineIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "publish-pipeline-password-8823";
    private static final String MEDIA = "/api/v1/admin/media";

    /** A real 1×1 PNG — a genuine header, not a string that looks like one. */
    private static final byte[] PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00};

    /** Different bytes, so the room's photograph is a different asset from the hotel's. */
    private static final byte[] ROOM_PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x06, 0x00, 0x00, 0x00};

    @org.springframework.beans.factory.annotation.Autowired
    private com.kas.platform.media.StorageProvider storage;

    private FakeObjectStorage.InMemory objects;

    @org.junit.jupiter.api.BeforeEach
    void resetStorage() {
        objects = (FakeObjectStorage.InMemory) storage;
        objects.reset();
    }

    @Test
    @DisplayName("a hotel reaches the public site only after a real photograph completes the gate")
    void theWholeChain() throws Exception {
        Fixture f = partnerWithAlmostCompleteProperty();

        // --- 1. Before any photograph: refused, and it says why -----------------
        mockMvc.perform(get("/api/v1/admin/properties/" + f.propertyId + "/completeness")
                        .cookie(f.session))
                .andExpect(jsonPath("$.complete").value(false))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].missing[0]")
                        .value("hero image"));

        mockMvc.perform(post("/api/v1/admin/properties/" + f.propertyId + "/submit")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("hero image"));

        // The property is untouched by a refused submit.
        assertThat(fixtures.lifecycleStateOf(f.propertyId)).isEqualTo("DRAFT");

        // --- 2. The real upload: mint, transfer, complete ------------------------
        UUID coverAsset = uploadPhotograph(f.session, PNG);

        // The size and checksum are the *stored object's*, not the client's claim
        // — which is exactly why this cannot be satisfied without a bucket.
        mockMvc.perform(get(MEDIA + "/" + coverAsset).cookie(f.session))
                .andExpect(jsonPath("$.sizeBytes").value(PNG.length));

        // --- 3. Describe it, publish it, attach it, make it the cover -----------
        attachCover(f, coverAsset, "PROPERTY", f.propertyId);

        // --- 4. The gate opens because the data now exists, not because it was told
        mockMvc.perform(get("/api/v1/admin/properties/" + f.propertyId + "/completeness")
                        .cookie(f.session))
                .andExpect(jsonPath("$.complete").value(true));

        // --- 5. Submit ----------------------------------------------------------
        String submission = mockMvc.perform(post("/api/v1/admin/properties/" + f.propertyId
                        + "/submit").with(csrf()).cookie(f.session))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andReturn().getResponse().getContentAsString();
        UUID submissionId = idOf(submission);

        // Submitted is not published — the guest still cannot reach it.
        mockMvc.perform(get("/api/v1/public/properties/" + f.slug))
                .andExpect(status().isNotFound());

        // --- 6. It reaches the review queue --------------------------------------
        mockMvc.perform(get("/api/v1/admin/property-submissions").cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + submissionId + "')]").exists());

        // --- 7. Approve ----------------------------------------------------------
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));

        // Approval moves the lifecycle to COMING_SOON — listed, not yet bookable.
        assertThat(fixtures.lifecycleStateOf(f.propertyId)).isEqualTo("COMING_SOON");

        // --- 8. The guest can now read the hotel ---------------------------------
        mockMvc.perform(get("/api/v1/public/properties/" + f.slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(f.slug))
                // Denylisted fields stay off the public surface — doc 58 §9.
                .andExpect(jsonPath("$.partnerId").doesNotExist())
                .andExpect(jsonPath("$.id").doesNotExist());

        // --- 9. …and the photograph the Partner uploaded ------------------------
        mockMvc.perform(get("/api/v1/public/properties/" + f.slug + "/gallery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].isCover").value(true))
                // A delivery URL built from the opaque asset id, never a storage
                // key and never the bucket — doc 62 §6.
                .andExpect(jsonPath("$[0].url").exists())
                .andExpect(jsonPath("$[0].id").doesNotExist());
    }

    @Test
    @DisplayName("the room's photographs reach the guest, and stay separate from the hotel's")
    void roomGalleryIsItsOwn() throws Exception {
        Fixture f = partnerWithAlmostCompleteProperty();

        UUID propertyAsset = uploadPhotograph(f.session, PNG);
        attachCover(f, propertyAsset, "PROPERTY", f.propertyId);

        UUID roomAsset = uploadPhotograph(f.session, ROOM_PNG);
        attachCover(f, roomAsset, "ROOM_TYPE", f.roomTypeId);

        publish(f);

        String propertyGallery = mockMvc.perform(
                        get("/api/v1/public/properties/" + f.slug + "/gallery"))
                .andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        String roomGallery = mockMvc.perform(get("/api/v1/public/properties/" + f.slug
                        + "/room-types/" + f.roomTypeSlug + "/gallery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        // `media_link.owner_type` is the only thing keeping them apart, and both
        // guest components depend on it. A lobby must never illustrate a bedroom.
        assertThat(urlOf(roomGallery))
                .as("a room's photograph is not the hotel's")
                .isNotEqualTo(urlOf(propertyGallery));
    }

    @Test
    @DisplayName("archiving the cover closes the gate again")
    void theGateIsLiveRatherThanAOneTimeStamp() throws Exception {
        Fixture f = partnerWithAlmostCompleteProperty();
        UUID asset = uploadPhotograph(f.session, PNG);
        attachCover(f, asset, "PROPERTY", f.propertyId);

        mockMvc.perform(get("/api/v1/admin/properties/" + f.propertyId + "/completeness")
                        .cookie(f.session))
                .andExpect(jsonPath("$.complete").value(true));

        // The checker counts `archived_at IS NULL`, so this is a real state change
        // rather than a flag someone can leave stale.
        fixtures.archiveMediaAsset(asset);

        mockMvc.perform(get("/api/v1/admin/properties/" + f.propertyId + "/completeness")
                        .cookie(f.session))
                .andExpect(jsonPath("$.complete").value(false))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].missing[0]")
                        .value("hero image"));
    }

    // ------------------------------------------------------------------ fixtures

    private record Fixture(UUID partnerId, UUID propertyId, UUID roomTypeId,
                           String roomTypeSlug, String slug, Cookie[] session) {
    }

    /**
     * A property that satisfies every completeness section except the cover.
     *
     * Deliberately built one section short: the point of this file is that the
     * photograph is what opens the gate, and a fixture that handed over a
     * complete property would assert nothing about why.
     */
    private Fixture partnerWithAlmostCompleteProperty() throws Exception {
        UUID partnerId = fixtures.createPartner("pipeline");
        UUID admin = fixtures.createUser("pipeline-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "TEST_PROPERTY");
        // Every section except the cover, so the photograph is the only variable.
        fixtures.makePropertyCompleteExceptCover(propertyId);

        // Its own room type, published, so the guest room gallery has an owner.
        String roomTypeSlug = "pipeline-room-" + UUID.randomUUID().toString().substring(0, 8);
        UUID roomTypeId = fixtures.addRoomType(propertyId, roomTypeSlug);
        fixtures.publishRoomType(roomTypeId);

        return new Fixture(partnerId, propertyId, roomTypeId, roomTypeSlug,
                fixtures.slugOf(propertyId), session);
    }

    /** Mint, transfer the bytes, complete — the three real requests, in order. */
    private UUID uploadPhotograph(Cookie[] session, byte[] bytes) throws Exception {
        String minted = mockMvc.perform(post(MEDIA + "/upload-url")
                        .with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mimeType\":\"image/png\",\"category\":\"EXTERIOR\","
                                + "\"width\":1,\"height\":1}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        UUID assetId = UUID.fromString(
                minted.replaceAll("^.*?\"mediaAssetId\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));

        // The browser's own PUT, against the object store rather than KAS.
        objects.put(fixtures.storageKeyOf(assetId), "image/png", bytes);

        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(session))
                .andExpect(status().isOk());

        return assetId;
    }

    /**
     * The whole way to a photograph a guest can see: describe it in both
     * locales, publish the asset, attach it, publish the link, make it the cover.
     *
     * <p>Every one of those is a real gate. Alt text in both locales is required
     * before an asset may be published at all (accessibility is not optional
     * content), and the link carries its own status so a published asset can be
     * arranged on an owner before it goes live there. The guest gallery counts
     * only rows where both are `PUBLISHED`.
     */
    private void attachCover(Fixture f, UUID assetId, String ownerType, UUID ownerId)
            throws Exception {
        describe(f, assetId, "en", "A photograph of the property");
        describe(f, assetId, "vi", "Ảnh của khách sạn");
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));

        String link = mockMvc.perform(post(MEDIA + "/" + assetId + "/links")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerType\":\"" + ownerType + "\",\"ownerId\":\"" + ownerId
                                + "\",\"displayOrder\":0}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID linkId = idOf(link);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch(MEDIA + "/" + assetId + "/links/" + linkId + "/status?status=PUBLISHED")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch(MEDIA + "/" + assetId + "/links/" + linkId + "/cover")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
    }

    private void describe(Fixture f, UUID assetId, String locale, String alt) throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch(MEDIA + "/" + assetId + "/translations")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"" + locale + "\",\"altText\":\"" + alt + "\"}"))
                .andExpect(status().isOk());
    }

    /** Submit and approve, through the real routes. */
    private void publish(Fixture f) throws Exception {
        String submission = mockMvc.perform(post("/api/v1/admin/properties/" + f.propertyId
                        + "/submit").with(csrf()).cookie(f.session))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        mockMvc.perform(post("/api/v1/admin/property-submissions/" + idOf(submission) + "/approve")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
    }

    private static UUID idOf(String json) {
        return UUID.fromString(json.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    private static String urlOf(String json) {
        return json.replaceAll("^.*?\"url\"\\s*:\\s*\"([^\"]+)\".*$", "$1");
    }
}
