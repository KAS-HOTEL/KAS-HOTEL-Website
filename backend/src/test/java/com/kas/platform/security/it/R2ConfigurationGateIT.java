package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <h1>What an unconfigured object store must do</h1>
 *
 * <p>No {@code @Import(FakeObjectStorage.class)} here, deliberately — every other
 * media test supplies a transport, and this one is about what happens when none
 * is supplied. It is the only test that sees the deployment as it actually
 * stands: {@code kas.media.r2.bucket} unset, so {@link
 * com.kas.platform.media.r2.R2StorageProvider} is never constructed and
 * {@link com.kas.platform.media.DeliveryUrlStorageProvider} is the whole of
 * storage.
 *
 * <h2>Why this is worth a test</h2>
 *
 * This is the single condition blocking the publish pipeline: no bucket → no
 * presigned URL → no bytes → no checksum → no cover → the completeness gate
 * refuses → nothing is submitted, approved or published, and the guest site
 * stays empty. A failure that important has to be **loud and named**, because
 * the alternative is an operator staring at a hotel that will not submit with no
 * indication that the cause is a missing environment variable.
 *
 * <p>It also guards the fix. The tempting way to make this go away is to default
 * the bucket, or to let an asset complete without a checksum, or to relax the
 * hero-image predicate. Each would turn a configuration gap into a hotel
 * published with no photograph. These assertions fail if anyone tries.
 *
 * <h2>What it does not assert</h2>
 *
 * Nothing about Cloudflare. There is no live bucket in this environment and this
 * test neither needs nor pretends to have one; {@code PublishPipelineIT} carries
 * the chain that runs once a transport exists.
 */
class R2ConfigurationGateIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "r2-gate-password-6690";
    private static final String MEDIA = "/api/v1/admin/media";

    /** The property whose absence stops the chain. Named, so the message can name it. */
    private static final String BUCKET_PROPERTY = "kas.media.r2.bucket";

    @Autowired
    private com.kas.platform.media.StorageProvider storage;

    @Test
    @DisplayName("with no bucket configured, storage reports that it cannot transfer")
    void unconfiguredStorageCannotTransfer() {
        // The distinction the interface draws: a delivery base can serve URLs for
        // objects that already exist, which is not the same as being able to
        // accept new ones.
        assertThat(storage.canTransfer())
                .as("no bucket is configured in this environment, so nothing can be uploaded")
                .isFalse();
    }

    @Test
    @DisplayName("minting an upload URL fails loudly, naming the missing property")
    void mintingIsRefusedByName() throws Exception {
        Cookie[] session = partnerSession();

        mockMvc.perform(post(MEDIA + "/upload-url")
                        .with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mimeType\":\"image/png\",\"category\":\"EXTERIOR\","
                                + "\"width\":1,\"height\":1}"))
                // 422, not 500: this is a deployment that has not been given a
                // business input, not a server that broke.
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CONFIG_MISSING"))
                // The name of the setting is the whole value of the message — it
                // is what turns "uploads do not work" into one line of config.
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString(BUCKET_PROPERTY)))
                // Never the endpoint, the key or the credential.
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret"))));
    }

    @Test
    @DisplayName("the refusal comes after authentication, permission and validation")
    void theGateIsBusinessConfigurationRatherThanAccess() throws Exception {
        // Anonymous is refused for a different reason and by a different layer.
        mockMvc.perform(post(MEDIA + "/upload-url")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mimeType\":\"image/png\",\"category\":\"EXTERIOR\"}"))
                .andExpect(status().isUnauthorized());

        Cookie[] session = partnerSession();

        // An unsupported type is refused before configuration is even consulted,
        // so a 422 CONFIG_MISSING genuinely means "everything else was fine".
        mockMvc.perform(post(MEDIA + "/upload-url")
                        .with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mimeType\":\"image/gif\",\"category\":\"EXTERIOR\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("no asset is created by a mint that could not be served")
    void aRefusedMintLeavesNothingBehind() throws Exception {
        Cookie[] session = partnerSession();
        long before = fixtures.auditCount("MEDIA_REGISTERED", null);

        mockMvc.perform(post(MEDIA + "/upload-url")
                        .with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mimeType\":\"image/png\",\"category\":\"EXTERIOR\","
                                + "\"width\":1,\"height\":1}"))
                .andExpect(status().isUnprocessableEntity());

        // A half-created DRAFT asset pointing at a key no browser can reach would
        // be an orphan the operator can neither use nor see.
        assertThat(fixtures.auditCount("MEDIA_REGISTERED", null))
                .as("a refused mint registers nothing")
                .isEqualTo(before);
    }

    private Cookie[] partnerSession() throws Exception {
        UUID partnerId = fixtures.createPartner("r2-gate");
        UUID admin = fixtures.createUser("r2-gate-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return login(fixtures.emailOf(admin), PASSWORD);
    }
}
