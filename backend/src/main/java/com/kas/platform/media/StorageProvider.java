package com.kas.platform.media;

import com.kas.platform.shared.MissingConfigurationException;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The object-storage boundary — doc 62 §6:
 *
 * <blockquote>Delivery URLs are content-hashed and long-cached. Behind a
 * {@code StorageProvider} port, so changing object-storage vendor changes one
 * adapter and no URLs the guest has bookmarked.</blockquote>
 *
 * <p><strong>Still no vendor named here.</strong> Step 16A.49 answered OQ-106
 * with Cloudflare R2 and the adapter lives in {@code media.r2} — but this port
 * mentions no bucket, endpoint, region or SDK type, so changing provider remains
 * one adapter and no URLs a guest has bookmarked. Doc 12 §3 confines vendor SDKs
 * to adapters and that is where the S3 client stays.
 *
 * <p><strong>Why the transport methods default to failing.</strong>
 * {@link DeliveryUrlStorageProvider} can resolve a delivery URL from a configured
 * base and can move no bytes — which is exactly true of it, and is what the
 * defaults below say. A deployment with a delivery base but no object storage
 * therefore serves existing images and refuses the first upload loudly, naming
 * the missing property, rather than appearing to work.
 *
 * <p>{@code storage_key} crosses this boundary <strong>inward only</strong>: a
 * caller inside the media module passes it so an adapter can address the object.
 * It never crosses outward — {@link MediaAsset} has no field for it and doc 58 §9
 * denylists it.
 */
public interface StorageProvider {

    /**
     * The customer-facing delivery URL for an asset.
     *
     * @param assetId the opaque asset id — doc 62 §6 permits "internal IDs beyond
     *                the opaque asset ID" to be withheld, and this is that id
     * @throws com.kas.platform.shared.MissingConfigurationException when no
     *         delivery base is configured, naming the property. Failing loudly
     *         beats returning a broken URL that reaches a guest.
     */
    String deliveryUrl(UUID assetId);

    /** Whether this instance can currently resolve delivery URLs. Drives readiness. */
    boolean isConfigured();

    /** Whether this instance can move bytes — mint upload URLs, read, delete. */
    default boolean canTransfer() {
        return false;
    }

    /**
     * A short-lived URL the browser may {@code PUT} the bytes to — doc 62 §4
     * step 1, <em>"the application server never proxies image bytes"</em>.
     *
     * <p>The signature binds the key <strong>and</strong> the content type, so a
     * URL minted for one asset cannot be replayed against another object or used
     * to store something other than what was declared.
     */
    default PresignedUpload presignedUpload(String storageKey, String contentType) {
        throw new MissingConfigurationException(TRANSPORT_PROPERTY);
    }

    /**
     * What storage says about an object — the authoritative size and type, and a
     * content checksum where the provider exposes one.
     *
     * <p>Empty when no object exists at that key, which is how an unfinished
     * upload is told apart from a finished one.
     */
    default Optional<StoredObject> head(String storageKey) {
        throw new MissingConfigurationException(TRANSPORT_PROPERTY);
    }

    /**
     * The first {@code byteCount} bytes of an object, for the magic-byte check
     * doc 62 §4 requires.
     *
     * <p>A ranged read of a few bytes, not a download: the upload path still goes
     * browser-to-storage, and nothing here puts image bytes on the request path
     * of a user. Refusing to look at the header at all would mean trusting a
     * declared content type, which is precisely what doc 62 §4 says not to do.
     */
    default Optional<byte[]> readHeader(String storageKey, int byteCount) {
        throw new MissingConfigurationException(TRANSPORT_PROPERTY);
    }

    /** Removes an object. Used when a completed upload turns out to be a duplicate. */
    default void delete(String storageKey) {
        throw new MissingConfigurationException(TRANSPORT_PROPERTY);
    }

    /** The property whose absence disables byte transfer, named in the failure. */
    String TRANSPORT_PROPERTY = "kas.media.r2.bucket";

    /** A minted upload URL and the moment it stops working. */
    record PresignedUpload(String url, Instant expiresAt) {
    }

    /**
     * Storage's own account of an object.
     *
     * @param checksum the provider's content checksum, or null when it exposes
     *                 none for this object — doc 62 §4's idempotency rule can
     *                 only apply when there is one
     */
    record StoredObject(long sizeBytes, String contentType, String checksum) {
    }
}
