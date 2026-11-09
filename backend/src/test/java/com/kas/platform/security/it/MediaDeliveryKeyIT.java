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
 * <h1>The object the browser uploads to is the object the guest fetches</h1>
 *
 * <p>The bug this file exists to prevent, found by running the real media
 * pipeline against real Cloudflare R2:
 *
 * <blockquote>A Partner uploaded a photograph. The pre-signed {@code PUT}
 * returned 200, {@code complete} read back the real size and a real checksum
 * from storage, the asset published, the link became the property cover, and the
 * public gallery served a URL. <strong>The URL addressed nothing.</strong> The
 * bytes were at {@code p/{partnerId}/{random}}; the guest was sent to
 * {@code {base}/m/{assetId}}. Two names for one photograph, and nothing
 * anywhere mapped one to the other.</blockquote>
 *
 * <p>Every layer reported success because every layer was doing its own job
 * correctly. The upload knew the key. The gallery knew the contract. Neither
 * knew the other existed, so a broken image was the only symptom — and only on
 * a real bucket, since the in-memory fake resolves whatever it is handed.
 *
 * <p>{@code MediaService.storageKeyFor} now mints {@code m/{assetId}}, which is
 * the delivery path exactly. These tests hold the two together, and hold the
 * door open for the rows written before the change.
 *
 * <p>Storage is {@link FakeObjectStorage}: what is asserted here is that two
 * strings agree, which is a property of this code and not of S3.
 */
@Import(FakeObjectStorage.class)
class MediaDeliveryKeyIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "media-delivery-key-password-7714";
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

    // ------------------------------------------------------------ the agreement

    @Test
    @DisplayName("the storage key is the delivery path, so one object has one name")
    void theKeyIsTheDeliveryPath() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f);

        // The whole fix, in one assertion. `{base}/m/{assetId}` can only resolve
        // if the object sits at `m/{assetId}`.
        assertThat(fixtures.storageKeyOf(assetId)).isEqualTo("m/" + assetId);
    }

    @Test
    @DisplayName("the pre-signed upload and the public gallery name the same object")
    void uploadAndDeliveryAgree() throws Exception {
        Fixture f = partner();

        String minted = mockMvc.perform(post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"mimeType":"image/png","category":"EXTERIOR",
                                 "width":2400,"height":1600,"sizeBytes":812345}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        UUID assetId = idOf(minted, "mediaAssetId");
        String key = fixtures.storageKeyOf(assetId);

        // The browser PUTs to a URL whose path is the key.
        assertThat(minted).contains(key);

        objects.put(key, "image/png", PNG);
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        String gallery = publish(f, assetId);

        // And the guest is sent to a URL whose path is the same key. Before the
        // fix these two strings differed and every published image 404'd.
        assertThat(gallery).contains("/" + key);
        assertThat(gallery).contains("/m/" + assetId);
    }

    @Test
    @DisplayName("no partner id travels into the key, or into a URL a guest can read")
    void theKeyCarriesNoPartner() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f);

        // The old key was `p/{partnerId}/{random}`, which put a partner id into
        // the path of the guest's own image URL the moment the two were aligned.
        assertThat(fixtures.storageKeyOf(assetId)).doesNotContain(f.partnerId.toString());
        assertThat(publishAfterBytes(f, assetId)).doesNotContain(f.partnerId.toString());
    }

    // ------------------------------------------------------- the rows already written

    @Test
    @DisplayName("an asset stored under the old key still resolves to its own object")
    void legacyKeysStillWork() throws Exception {
        Fixture f = partner();

        // The shape `kas_web_dev` already holds. `storage_key` is per row and
        // every read goes through it, so nothing had to be moved or rewritten.
        String legacyKey = "p/" + f.partnerId + "/" + UUID.randomUUID();
        UUID assetId = fixtures.createAssetWithStorageKey(f.partnerId, legacyKey);

        assertThat(fixtures.storageKeyOf(assetId)).isEqualTo(legacyKey);

        objects.put(legacyKey, "image/png", PNG);

        // completeUpload heads and reads the header at the stored key, not at a
        // key recomputed from the id — which is what makes this safe.
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sizeBytes").value(PNG.length));
    }

    @Test
    @DisplayName("a legacy asset with no bytes at its own key is still refused")
    void legacyKeysAreNotWavedThrough() throws Exception {
        Fixture f = partner();
        UUID assetId = fixtures.createAssetWithStorageKey(
                f.partnerId, "p/" + f.partnerId + "/" + UUID.randomUUID());

        // Nothing put at the legacy key. Completing must fail exactly as it does
        // for a new asset: the backward-compatible path is not a softer path.
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().is4xxClientError());
    }

    // -------------------------------------------------------------------- helpers

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("dk-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("media-delivery-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "DELIVERY_KEY_TEST_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    private UUID assetOf(Fixture f) throws Exception {
        return idOf(mockMvc.perform(post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"mimeType":"image/png","category":"EXTERIOR",
                                         "width":2400,"height":1600,"sizeBytes":812345}
                                        """))
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString(), "mediaAssetId");
    }

    private String publishAfterBytes(Fixture f, UUID assetId) throws Exception {
        objects.put(fixtures.storageKeyOf(assetId), "image/png", PNG);
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
        return publish(f, assetId);
    }

    /** Takes the asset all the way to the guest gallery and returns that response. */
    private String publish(Fixture f, UUID assetId) throws Exception {
        describe(f, assetId, "en", "A photograph");
        describe(f, assetId, "vi", "Một bức ảnh");
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        UUID linkId = idOf(mockMvc.perform(post(MEDIA + "/" + assetId + "/links")
                                .with(csrf()).cookie(f.session)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"ownerType":"PROPERTY","ownerId":"%s","displayOrder":0}
                                        """.formatted(f.propertyId)))
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString(), "id");

        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/status?status=PUBLISHED")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());

        fixtures.openProperty(f.propertyId);

        return mockMvc.perform(get("/api/v1/public/properties/"
                                + fixtures.slugOf(f.propertyId) + "/gallery")
                        .param("locale", "en"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
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
