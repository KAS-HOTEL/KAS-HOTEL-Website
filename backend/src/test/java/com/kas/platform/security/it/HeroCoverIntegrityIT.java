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
 * Step 16A.50 — a hero image must be an image, not a record of one.
 *
 * <h2>The hole this closes</h2>
 *
 * <p>Before Step 16A.49 there was no way to upload bytes, so the publish gate
 * counted cover links and could do no better. Once uploads existed, the old
 * check let a Partner register a descriptor, attach it, mark it cover and pass
 * <em>"Publishable only with hero image"</em> (doc 52 §3.1) with no file behind
 * it — and the guest page would then show nothing.
 *
 * <p>The fix uses {@code media_asset.checksum}, which only
 * {@code MediaService.completeUpload} can write. No new status, no new column,
 * no migration.
 *
 * <p>These tests drive the <strong>real routes</strong> and assert the invariant
 * from both sides: the byte-less path is refused, and the completed path passes.
 */
@Import(FakeObjectStorage.class)
class HeroCoverIntegrityIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "hero-integrity-password-8813";
    private static final String MEDIA = "/api/v1/admin/media";

    private static final byte[] PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00};

    /** Bumped per upload so each asset gets its own checksum — see {@link #completedAsset}. */
    private int distinctBytes = 1;

    @Autowired
    private com.kas.platform.media.StorageProvider storage;

    private FakeObjectStorage.InMemory objects;

    @BeforeEach
    void resetStorage() {
        objects = (FakeObjectStorage.InMemory) storage;
        objects.reset();
    }

    // ------------------------------------------------------- the byte-less path

    @Test
    @DisplayName("a descriptor with no bytes cannot satisfy the hero-image gate")
    void bytelessDescriptorIsNotAHeroImage() throws Exception {
        Fixture f = partner();

        // The exact sequence that used to work: register a descriptor through the
        // still-supported import route, attach it, make it the cover.
        UUID assetId = registerDescriptor(f);
        UUID linkId = attach(f, assetId);
        setCover(f, linkId, assetId);

        // The cover link exists and is unique — that part was never wrong.
        assertThat(fixtures.coverCount("PROPERTY", f.propertyId)).isEqualTo(1);

        // But the checklist is not satisfied, because there is no image.
        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].missing[0]")
                        .value("hero image"));
    }

    @Test
    @DisplayName("a declared sizeBytes does not stand in for a file")
    void declaredSizeIsNotEvidence() throws Exception {
        Fixture f = partner();

        // size_bytes is client-supplied at registration, so it can be present with
        // nothing behind it. That is exactly why the check uses checksum, which
        // only completeUpload can write.
        UUID assetId = idOf(mockMvc.perform(post(MEDIA).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"mimeType":"image/png","category":"EXTERIOR",
                                 "width":2400,"height":1600,"sizeBytes":812345}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());

        setCover(f, attach(f, assetId), assetId);

        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false));
    }

    @Test
    @DisplayName("an upload that was started but never completed cannot publish a property")
    void incompleteUploadCannotPublish() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);

        // Everything else about the property is in order.
        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(true));

        // Replace the hero with one whose upload was minted and abandoned: the
        // bytes were never PUT, so complete was never called.
        UUID assetId = uploadUrlFor(f);
        UUID linkId = attach(f, assetId);
        setCover(f, linkId, assetId);

        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false));

        // And submit — the act publication depends on — refuses, naming it.
        mockMvc.perform(post("/api/v1/admin/properties/" + f.propertyId + "/submit")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[?(@.field=='hero image')]").exists());
    }

    @Test
    @DisplayName("an archived asset stops counting as the hero image")
    void archivedAssetIsNotAHeroImage() throws Exception {
        Fixture f = partner();
        UUID assetId = completedAsset(f);
        setCover(f, attach(f, assetId), assetId);

        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(true));

        // Deduplication archives a duplicate and deletes its object; an archived
        // asset's file is gone, so a cover pointing at one is a cover pointing at
        // nothing.
        fixtures.archiveMediaAsset(assetId);

        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false));
    }

    // ------------------------------------------------------- the completed path

    @Test
    @DisplayName("a genuinely uploaded image satisfies the gate and publishes the property")
    void completedUploadSatisfiesTheGate() throws Exception {
        Fixture f = partner();
        fixtures.makePropertyComplete(f.propertyId, f.partnerId);

        // Replace the fixture's hero with one produced by the real upload flow.
        UUID assetId = completedAsset(f);
        setCover(f, attach(f, assetId), assetId);

        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(true));

        // The whole checklist passes, so the property can be submitted for real.
        mockMvc.perform(post("/api/v1/admin/properties/" + f.propertyId + "/submit")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("completing the upload turns a failing checklist into a passing one")
    void completingTheUploadClosesTheGap() throws Exception {
        Fixture f = partner();
        UUID assetId = uploadUrlFor(f);
        setCover(f, attach(f, assetId), assetId);

        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false));

        // The bytes arrive and are confirmed — nothing else about the property or
        // the link changes.
        objects.put(fixtures.storageKeyOf(assetId), "image/png", PNG);
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());

        mockMvc.perform(completeness(f))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(true));
    }

    // ------------------------------------------- what must not have changed

    @Test
    @DisplayName("the alt-text publish gate is unchanged")
    void altTextGateIsUnchanged() throws Exception {
        Fixture f = partner();
        UUID assetId = completedAsset(f);

        // A completed upload still cannot be published without both locales —
        // doc 62 §5. Byte integrity and accessibility are separate gates and this
        // step touched only the first.
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
    @DisplayName("cover uniqueness is unchanged — one cover, and the last one wins")
    void coverUniquenessIsUnchanged() throws Exception {
        Fixture f = partner();

        UUID first = completedAsset(f);
        UUID firstLink = attach(f, first);
        setCover(f, firstLink, first);

        UUID second = completedAsset(f);
        UUID secondLink = attach(f, second);
        setCover(f, secondLink, second);

        // UNIQUE (owner_type, owner_id) WHERE is_cover — the previous cover is
        // cleared in the same statement, so there is never two and never none.
        assertThat(fixtures.coverCount("PROPERTY", f.propertyId)).isEqualTo(1);
        mockMvc.perform(get(MEDIA + "/" + second + "/usages")
                        .param("ownerType", "PROPERTY").param("ownerId", f.propertyId.toString())
                        .cookie(f.session))
                .andExpect(jsonPath("$[0].isCover").value(true));
    }

    @Test
    @DisplayName("partner scoping is unchanged — another partner's asset cannot become a cover")
    void partnerScopingIsUnchanged() throws Exception {
        Fixture owner = partner();
        Fixture stranger = partner();

        UUID assetId = completedAsset(owner);

        // Doc 85 §4.3: an asset's owner cannot be inferred from what it is linked
        // to, so both ends are checked. 404, never 403.
        mockMvc.perform(post(MEDIA + "/" + assetId + "/links").with(csrf()).cookie(stranger.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerType":"PROPERTY","ownerId":"%s","displayOrder":0}
                                """.formatted(stranger.propertyId)))
                .andExpect(status().isNotFound());

        mockMvc.perform(completeness(stranger))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false));
    }

    @Test
    @DisplayName("one partner's completed image cannot satisfy another partner's gate")
    void heroImagesDoNotCrossPartners() throws Exception {
        Fixture owner = partner();
        Fixture stranger = partner();

        UUID assetId = completedAsset(owner);
        setCover(owner, attach(owner, assetId), assetId);

        mockMvc.perform(completeness(owner))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(true));
        mockMvc.perform(completeness(stranger))
                .andExpect(jsonPath("$.sections[?(@.name=='Property images')].complete")
                        .value(false));
    }

    // -------------------------------------------------------------------- helpers

    private record Fixture(UUID partnerId, UUID propertyId, Cookie[] session) {
    }

    private Fixture partner() throws Exception {
        UUID partnerId = fixtures.createPartner("h-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("hero-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        UUID propertyId = fixtures.createProperties(partnerId, 1).get(0);
        fixtures.setPropertyNames(propertyId, "HERO_TEST_PROPERTY");
        return new Fixture(partnerId, propertyId, session);
    }

    private MockHttpServletRequestBuilder completeness(Fixture f) {
        return get("/api/v1/admin/properties/" + f.propertyId + "/completeness").cookie(f.session);
    }

    /** The descriptor-only route — still supported for the doc 62 §3 folder import. */
    private UUID registerDescriptor(Fixture f) throws Exception {
        return idOf(mockMvc.perform(post(MEDIA).with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mimeType\":\"image/png\",\"category\":\"EXTERIOR\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    /** An asset whose upload URL was minted and whose bytes never arrived. */
    private UUID uploadUrlFor(Fixture f) throws Exception {
        String body = mockMvc.perform(post(MEDIA + "/upload-url").with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mimeType\":\"image/png\",\"category\":\"EXTERIOR\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(body.replaceAll(
                "^.*?\"mediaAssetId\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }

    /** The whole doc 62 §4 flow, ending in a genuinely completed asset. */
    /**
     * A completed asset with bytes of its own.
     *
     * <p>The width byte is varied per call, so two assets in one test are two
     * distinct checksums. Before this, every call uploaded the identical
     * {@link #PNG}: the second one hit `completeUpload`'s deduplication, was
     * folded into the first and <strong>archived</strong>, and its object was
     * deleted from storage. The id this method returned was that archived row,
     * which the cover test then attached and made a property's cover — a live
     * cover pointing at bytes that no longer existed.
     *
     * <p>It passed only because nothing refused an archived asset. It is a
     * fixture bug either way: a test about two covers needs two photographs.
     */
    private UUID completedAsset(Fixture f) throws Exception {
        UUID assetId = uploadUrlFor(f);
        byte[] bytes = PNG.clone();
        bytes[19] = (byte) (bytes[19] + distinctBytes++);
        objects.put(fixtures.storageKeyOf(assetId), "image/png", bytes);
        mockMvc.perform(post(MEDIA + "/" + assetId + "/complete").with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
        return assetId;
    }

    private UUID attach(Fixture f, UUID assetId) throws Exception {
        return idOf(mockMvc.perform(post(MEDIA + "/" + assetId + "/links")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerType":"PROPERTY","ownerId":"%s","displayOrder":0}
                                """.formatted(f.propertyId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private void setCover(Fixture f, UUID linkId, UUID assetId) throws Exception {
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/links/" + linkId + "/cover")
                        .with(csrf()).cookie(f.session))
                .andExpect(status().isOk());
    }

    private void describe(Fixture f, UUID assetId, String locale, String alt) throws Exception {
        mockMvc.perform(patch(MEDIA + "/" + assetId + "/translations")
                        .with(csrf()).cookie(f.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"" + locale + "\",\"altText\":\"" + alt + "\"}"))
                .andExpect(status().isOk());
    }

    private static UUID idOf(String json) {
        return UUID.fromString(json.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }
}
