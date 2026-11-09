package com.kas.platform.media.r2;

import com.kas.platform.media.DeliveryUrlStorageProvider;
import com.kas.platform.media.StorageProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The R2 adapter's signing, checked without an account.
 *
 * <h2>Why this can be a unit test</h2>
 *
 * <p>Pre-signing is a local HMAC computation: the SDK derives a signature from
 * the key, the content type, the expiry and the credentials, and never contacts
 * the endpoint. So the parts most likely to be wired wrong — the endpoint
 * override, path-style addressing, the bound content type, the TTL — are all
 * observable in the URL that comes out.
 *
 * <p>The credentials below are throwaway strings that exist only to feed that
 * computation. They are not an account, they authorise nothing, and the test
 * asserts the secret never appears in the result.
 *
 * <p>What this cannot prove is that R2 accepts the signature. Nothing short of
 * real credentials can, which is why the owner-provisioned deployment check in
 * the step report is where that lands.
 */
class R2StorageProviderTest {

    private static final String ENDPOINT = "https://accountid.r2.cloudflarestorage.example";
    private static final String BUCKET = "kas-media-test";
    private static final String SECRET = "test-secret-not-a-credential";
    private static final String KEY = "p/8f9813d4-a2f8-475f-bf33-01f7c67371a4/abc-123";

    private static R2StorageProvider provider(Duration ttl) {
        return new R2StorageProvider(
                new DeliveryUrlStorageProvider("https://images.example.test"),
                new R2Properties(ENDPOINT, "test-access-key", SECRET, BUCKET, ttl));
    }

    @Test
    @DisplayName("the signed URL addresses the configured endpoint and bucket, path-style")
    void signsAgainstTheConfiguredEndpoint() {
        StorageProvider.PresignedUpload upload =
                provider(Duration.ofMinutes(10)).presignedUpload(KEY, "image/png");

        URI url = URI.create(upload.url());

        // Path-style: the bucket is in the path, not the hostname. R2's S3 host
        // is the account's, and virtual-host style would put the bucket in a
        // domain the deployment does not control.
        assertThat(url.getHost()).isEqualTo("accountid.r2.cloudflarestorage.example");
        assertThat(url.getPath()).isEqualTo("/" + BUCKET + "/" + KEY);
    }

    @Test
    @DisplayName("the URL carries a signature and the declared expiry, and no secret")
    void carriesASignatureAndNoSecret() {
        StorageProvider.PresignedUpload upload =
                provider(Duration.ofMinutes(10)).presignedUpload(KEY, "image/png");

        assertThat(upload.url()).contains("X-Amz-Signature=");
        assertThat(upload.url()).contains("X-Amz-Expires=600");

        // The signature is derived from the secret; the secret itself must never
        // travel. It reaches a browser, and doc 62 §6 keeps provider credentials
        // off every customer-facing surface.
        assertThat(upload.url()).doesNotContain(SECRET);
    }

    @Test
    @DisplayName("the content type is bound into the signature")
    void bindsTheContentType() {
        R2StorageProvider provider = provider(Duration.ofMinutes(10));

        String asPng = provider.presignedUpload(KEY, "image/png").url();
        String asJpeg = provider.presignedUpload(KEY, "image/jpeg").url();

        // Same key, different declared type, different signature: a URL minted
        // for a PNG cannot be used to store a JPEG, let alone something else.
        assertThat(signatureOf(asPng)).isNotEqualTo(signatureOf(asJpeg));
        assertThat(asPng).contains("content-type");
    }

    @Test
    @DisplayName("each key gets its own signature, so one URL cannot write to another object")
    void oneUrlPerKey() {
        R2StorageProvider provider = provider(Duration.ofMinutes(10));

        String mine = provider.presignedUpload("p/partner-a/one", "image/png").url();
        String theirs = provider.presignedUpload("p/partner-b/two", "image/png").url();

        assertThat(signatureOf(mine)).isNotEqualTo(signatureOf(theirs));
        assertThat(mine).contains("p/partner-a/one").doesNotContain("partner-b");
    }

    @Test
    @DisplayName("the expiry is the configured TTL, and it is short")
    void expiryFollowsConfiguration() {
        Instant before = Instant.now();
        StorageProvider.PresignedUpload upload =
                provider(Duration.ofMinutes(5)).presignedUpload(KEY, "image/png");

        assertThat(upload.url()).contains("X-Amz-Expires=300");
        assertThat(upload.expiresAt())
                .isAfter(before)
                .isBefore(before.plus(Duration.ofMinutes(6)));
    }

    @Test
    @DisplayName("delivery is the vendor-free base, never the storage endpoint")
    void deliveryDoesNotLeakTheProvider() {
        R2StorageProvider provider = provider(Duration.ofMinutes(10));
        java.util.UUID assetId = java.util.UUID.randomUUID();

        String delivered = provider.deliveryUrl(assetId);

        // Doc 62 §6 — a guest is sent to the delivery base and learns nothing
        // about bucket, endpoint or provider.
        assertThat(delivered).isEqualTo("https://images.example.test/m/" + assetId);
        assertThat(delivered).doesNotContain(BUCKET)
                .doesNotContain("r2")
                .doesNotContain("cloudflare");
    }

    @Test
    @DisplayName("a configured adapter reports that it can move bytes")
    void reportsItsCapabilities() {
        assertThat(provider(Duration.ofMinutes(10)).canTransfer()).isTrue();
        assertThat(provider(Duration.ofMinutes(10)).isConfigured()).isTrue();

        // Without a delivery base the adapter still transfers but cannot resolve a
        // public URL, and readiness is driven by exactly that.
        R2StorageProvider noDelivery = new R2StorageProvider(
                new DeliveryUrlStorageProvider(""),
                new R2Properties(ENDPOINT, "k", SECRET, BUCKET, Duration.ofMinutes(10)));
        assertThat(noDelivery.canTransfer()).isTrue();
        assertThat(noDelivery.isConfigured()).isFalse();
    }

    private static String signatureOf(String url) {
        return url.replaceAll("^.*X-Amz-Signature=([^&]+).*$", "$1");
    }
}
