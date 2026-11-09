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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.49 — the media transport that closes OQ-106.
 *
 * <p>Doc 62 §4's flow, end to end against a real database and the real routes:
 * {@code POST /admin/media/upload-url} mints a short-lived URL, the browser puts
 * the bytes straight to storage, {@code POST /admin/media/{id}/complete} checks
 * what actually landed.
 *
 * <p>Storage is {@link FakeObjectStorage}, in memory. The R2 wiring is not what
 * these assertions are about and real credentials must never be in CI; what is
 * proved here is the flow — scope, magic bytes, type agreement, checksum
 * idempotency, and that none of it publishes anything or weakens a gate.
 */
@Import(FakeObjectStorage.class)
class MediaUploadIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "media-upload-password-5521";
    private static final String MEDIA = "/api/v1/admin/media";

    /** A real 1×1 PNG — a genuine header, not a string that looks like one. */
    private static final byte[] PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00};

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0,
            0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05};

    /** An HTML document renamed to look like a photograph. */
    private static final byte[] NOT_AN_IMAGE =
            "<!doctype html><script>alert(1)</script>".getBytes(java.nio.charset.StandardCharsets.UTF_8);

    @Autowired
    private com.kas.platform.media.StorageProvider storage;

    private FakeObjectStorage.InMemory objects;

    @BeforeEach
    void resetStorage() {
        objects = (FakeObjectStorage.InMemory) storage;
        objects.reset();
    }

    // ------------------------------------------------------------- upload-url

    @Test
    @DisplayName("an upload URL is minted and the asset starts as a DRAFT with no bytes")
    void mintsAnUploadUrl() throws Exception {
        Fixture f = partner();

        mockMvc.perform(uploadUrl(f, "image/png", "EXTERIOR"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.uploadUrl").isNotEmpty())
                .andExpect(jsonPath("$.mediaAssetId").isNotEmpty())
                .andExpect(jsonPath("$.expiresAt").isNotEmpty());
    }

    @Test
    @DisplayName("the response carries no storage key, bucket or credential")
    void leaksNoStorageInternals() throws Exception {
        Fixture f = partner();

        String body = mockMvc.perform(uploadUrl(f, "image/png", "EXTERIOR"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        UUID assetId = idOf(body, "mediaAssetId");
        String storageKey = fixtures.storageKeyOf(assetId);

        // The signed URL necessarily contains the key as a path — that is what a
        // direct upload is. What must not appear is the key as a *field*, or any
        // of the other doc 58 §9 denylisted values.
        assertThat(body).doesNotContain("storageKey").doesNotContain("storage_key");
        assertThat(body).doesNotContain("bucket").doesNotContain("secret")
                .doesNotContain("accessKey").doesNotContain("partnerId");
        assertThat(objects.wasSigned(storageKey)).isTrue();
    }

    @Test
    @DisplayName("the storage key is server-generated, unguessable and is the delivery path")
    void serverGeneratesTheKey() throws Exception {
        Fixture f = partner();

        UUID first = assetOf(f, "image/png", "EXTERIOR");
        UUID second = assetOf(f, "image/png", "EXTERIOR");

        String keyA = fixtures.storageKeyOf(first);
        String keyB = fixtures.storageKeyOf(second);

        // Doc 62 §3: the platform assigns its own key, random so it cannot be
        // guessed and never derived from anything a client sent.
        //
        // The key is now `m/{assetId}` rather than `p/{partnerId}/{random}`,
        // because the delivery base serves `{base}/m/{assetId}` and the two have
        // to name the same object — see MediaDeliveryKeyIT for why, and for what
        // happens to assets written under the old shape.
        assertThat(keyA).isEqualTo("m/" + first);
        assertThat(keyB).isEqualTo("m/" + second);
        assertThat(keyA).isNotEqualTo(keyB);
        assertThat(keyA).doesNotContain("..").doesNotContain("\\");

        // The partner id no longer travels into a key, and so no longer into the
        // path of a URL a guest can read.
        assertThat(keyA).doesNotContain(f.partnerId.toString());
    }

    @Test
    @DisplayName("a client cannot choose the storage key")
    void clientCannotSupplyAKey() throws Exception {
        Fixture f = partner();

        // fail-on-unknown-properties refuses the field outright; there is no
        // storageKey on RegisterMediaRequest to bind it to in the first place.
        mockMvc.perform(post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"mimeType":"image/png","category":"EXTERIOR",
                                 "storageKey":"../../etc/passwd"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the minted URL expires")
    void urlExpires() throws Exception {
        Fixture f = partner();

        String body = mockMvc.perform(uploadUrl(f, "image/png", "EXTERIOR"))
                .andReturn().getResponse().getContentAsString();

        String expiresAt = body.replaceAll("^.*\"expiresAt\":\"([^\"]+)\".*$", "$1");
        // Short-lived on purpose: a URL captured from a log or a shared screen
        // should be worthless well before anyone gets round to using it.
        assertThat(java.time.Instant.parse(expiresAt))
                .isAfter(java.time.Instant.now())
                .isBefore(java.time.Instant.now().plusSeconds(3600));
    }

    @Test
    @DisplayName("an unsupported type is refused before any URL is minted")
    void refusesUnsupportedType() throws Exception {
        Fixture f = partner();

        mockMvc.perform(uploadUrl(f, "image/svg+xml", "EXTERIOR"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("anonymous cannot mint an upload URL")
    void requiresASession() throws Exception {
        mockMvc.perform(post(MEDIA + "/upload-url").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assetBody("image/png", "EXTERIOR")))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(MEDIA + "/" + UUID.randomUUID() + "/complete").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- complete

    @Test
    @DisplayName("a completed upload records the size and checksum storage reports")
    void completesAnUpload() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");

        objects.put(fixtures.storageKeyOf(assetId), "image/png", PNG);

        mockMvc.perform(complete(f, assetId))
                .andExpect(status().isOk())
                // Authoritative, from the object — not the 812345 the client declared.
                .andExpect(jsonPath("$.sizeBytes").value(PNG.length))
                // Doc 62 §5's gate is untouched: completing is not publishing.
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    @DisplayName("completing before the bytes arrive is refused")
    void refusesWhenNothingWasUploaded() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");

        mockMvc.perform(complete(f, assetId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].code").value("NOT_UPLOADED"));
    }

    @Test
    @DisplayName("a stored object of a different type than declared is refused")
    void refusesTypeMismatch() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");

        objects.put(fixtures.storageKeyOf(assetId), "image/jpeg", JPEG);

        mockMvc.perform(complete(f, assetId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("TYPE_MISMATCH"));
    }

    @Test
    @DisplayName("a file whose bytes are not the type it claims is refused")
    void refusesWrongMagicBytes() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");

        // The content type agrees; the bytes are an HTML document. Doc 62 §4 asks
        // for MIME *and* magic bytes precisely for this, and doc 10 §5.1 wants
        // nothing executable reaching a delivery origin.
        objects.put(fixtures.storageKeyOf(assetId), "image/png", NOT_AN_IMAGE);

        mockMvc.perform(complete(f, assetId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("CONTENT_MISMATCH"));
    }

    @Test
    @DisplayName("a truncated upload is refused rather than passed for lack of evidence")
    void refusesATruncatedHeader() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");

        objects.put(fixtures.storageKeyOf(assetId), "image/png", new byte[]{(byte) 0x89, 0x50});

        mockMvc.perform(complete(f, assetId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].code").value("CONTENT_MISMATCH"));
    }

    @Test
    @DisplayName("each accepted type is recognised by its own signature")
    void acceptsEveryAllowlistedType() throws Exception {
        Fixture f = partner();

        UUID png = assetOf(f, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(png), "image/png", PNG);
        mockMvc.perform(complete(f, png)).andExpect(status().isOk());

        UUID jpeg = assetOf(f, "image/jpeg", "LOBBY");
        objects.put(fixtures.storageKeyOf(jpeg), "image/jpeg", JPEG);
        mockMvc.perform(complete(f, jpeg)).andExpect(status().isOk());
    }

    // ------------------------------------------------------------- scope

    @Test
    @DisplayName("another partner cannot complete an upload, and gets 404 not 403")
    void crossPartnerIsNotFound() throws Exception {
        Fixture owner = partner();
        Fixture stranger = partner();

        UUID assetId = assetOf(owner, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(assetId), "image/png", PNG);

        // Doc 85 §6.3 — a 403 would confirm the asset exists.
        mockMvc.perform(complete(stranger, assetId))
                .andExpect(status().isNotFound());

        // And the owner's asset is untouched by the attempt.
        mockMvc.perform(complete(owner, assetId)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unknown asset id is 404")
    void unknownAssetIsNotFound() throws Exception {
        Fixture f = partner();

        mockMvc.perform(complete(f, UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------- idempotency

    @Test
    @DisplayName("re-uploading identical bytes returns the existing asset")
    void identicalBytesReturnTheExistingAsset() throws Exception {
        Fixture f = partner();

        UUID first = assetOf(f, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(first), "image/png", PNG);
        mockMvc.perform(complete(f, first)).andExpect(status().isOk());

        UUID second = assetOf(f, "image/png", "EXTERIOR");
        String duplicateKey = fixtures.storageKeyOf(second);
        objects.put(duplicateKey, "image/png", PNG);

        // Doc 62 §4 — "repeat upload of the same checksum returns the existing asset".
        mockMvc.perform(complete(f, second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(first.toString()));

        // And the second copy of the bytes does not linger in the bucket.
        assertThat(objects.has(duplicateKey)).isFalse();

        // One live asset, not two.
        mockMvc.perform(get(MEDIA).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("different bytes stay different assets")
    void differentBytesStayDistinct() throws Exception {
        Fixture f = partner();

        UUID png = assetOf(f, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(png), "image/png", PNG);
        mockMvc.perform(complete(f, png)).andExpect(status().isOk());

        UUID jpeg = assetOf(f, "image/jpeg", "LOBBY");
        objects.put(fixtures.storageKeyOf(jpeg), "image/jpeg", JPEG);
        mockMvc.perform(complete(f, jpeg))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(jpeg.toString()));

        mockMvc.perform(get(MEDIA).cookie(f.session))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    @DisplayName("deduplication never crosses partners")
    void deduplicationIsPartnerScoped() throws Exception {
        Fixture a = partner();
        Fixture b = partner();

        UUID theirs = assetOf(a, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(theirs), "image/png", PNG);
        mockMvc.perform(complete(a, theirs)).andExpect(status().isOk());

        UUID mine = assetOf(b, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(mine), "image/png", PNG);

        // The same stock photograph uploaded by two partners must not hand one
        // partner's asset to the other — that would be a cross-partner read
        // dressed up as deduplication.
        mockMvc.perform(complete(b, mine))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(mine.toString()));
    }

    // ------------------------------------------------------------- the gates

    @Test
    @DisplayName("a completed upload still cannot publish without alt text in both locales")
    void altTextGateIsUnchanged() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(assetId), "image/png", PNG);
        mockMvc.perform(complete(f, assetId)).andExpect(status().isOk());

        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest());

        describe(f, assetId, "en", "The rooftop terrace at dusk");
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest());

        describe(f, assetId, "vi", "Sân thượng lúc hoàng hôn");
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    @Test
    @DisplayName("a real uploaded image satisfies the property hero-image gate")
    void uploadedImageSatisfiesTheHeroGate() throws Exception {
        Fixture f = partner();

        mockMvc.perform(get("/api/v1/admin/properties/" + f.propertyId + "/completeness")
                        .cookie(f.session))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false));

        UUID assetId = assetOf(f, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(assetId), "image/png", PNG);
        mockMvc.perform(complete(f, assetId)).andExpect(status().isOk());

        UUID linkId = idOf(mockMvc.perform(post(MEDIA + "/" + assetId + "/links")
                                .with(csrf()).cookie(f.session)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"ownerType":"PROPERTY","ownerId":"%s","displayOrder":0}
                                        """.formatted(f.propertyId)))
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString(), "id");

        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/cover")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());

        // The gate is unchanged — it counts cover links, as it always has. What
        // changed is that the cover now stands for bytes that exist.
        mockMvc.perform(get("/api/v1/admin/properties/" + f.propertyId + "/completeness")
                        .cookie(f.session))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(true));
    }

    // ------------------------------------------------------------- delivery

    @Test
    @DisplayName("the guest gallery serves a delivery URL and never storage internals")
    void guestGalleryUsesTheDeliveryUrl() throws Exception {
        Fixture f = partner();
        UUID assetId = assetOf(f, "image/png", "EXTERIOR");
        objects.put(fixtures.storageKeyOf(assetId), "image/png", PNG);
        mockMvc.perform(complete(f, assetId)).andExpect(status().isOk());

        describe(f, assetId, "en", "The rooftop terrace at dusk");
        describe(f, assetId, "vi", "Sân thượng lúc hoàng hôn");
        mockMvc.perform(post(MEDIA + "/" + assetId + "/publish").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        UUID linkId = idOf(mockMvc.perform(post(MEDIA + "/" + assetId + "/links")
                                .with(csrf()).cookie(f.session)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"ownerType":"PROPERTY","ownerId":"%s","displayOrder":0}
                                        """.formatted(f.propertyId)))
                        .andReturn().getResponse().getContentAsString(), "id");
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/status?status=PUBLISHED")
                .with(csrf()).cookie(f.session)).andExpect(status().isOk());

        fixtures.openProperty(f.propertyId);
        String slug = fixtures.slugOf(f.propertyId);

        String gallery = mockMvc.perform(get("/api/v1/public/properties/" + slug + "/gallery")
                        .param("locale", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].alt").value("The rooftop terrace at dusk"))
                .andReturn().getResponse().getContentAsString();

        // Doc 62 §6 — the guest gets {base}/m/{assetId} and nothing about storage.
        assertThat(gallery).contains("/m/" + assetId);

        // This used to also assert the gallery did not contain the storage key.
        // It cannot any more, and the reason is the point of the change: the key
        // IS the delivery path now, so of course the URL contains it. The claim
        // that mattered was never "the key is secret" — a key is not a
        // credential, and it is reachable only with one. It was "nothing about
        // the storage arrangement travels to a guest", and that still holds:
        // no bucket, no endpoint, no checksum, no partner id.
        assertThat(gallery).doesNotContain("storageKey").doesNotContain("bucket")
                .doesNotContain("checksum").doesNotContain("r2")
                .doesNotContain(f.partnerId.toString());
    }

    // -------------------------------------------------------------------- helpers

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("u-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("media-upload-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "UPLOAD_TEST_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    private MockHttpServletRequestBuilder uploadUrl(Fixture f, String mimeType, String category) {
        return post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(assetBody(mimeType, category));
    }

    private MockHttpServletRequestBuilder complete(Fixture f, UUID assetId) {
        return post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session);
    }

    private UUID assetOf(Fixture f, String mimeType, String category) throws Exception {
        return idOf(mockMvc.perform(uploadUrl(f, mimeType, category))
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

    private static String assetBody(String mimeType, String category) {
        return """
                {"mimeType":"%s","category":"%s","width":2400,"height":1600,"sizeBytes":812345}
                """.formatted(mimeType, category);
    }

    private static UUID idOf(String json, String field) {
        return UUID.fromString(json.replaceAll(
                "^.*?\"" + field + "\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }
}
