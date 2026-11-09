package com.kas.platform.media.api;

import com.kas.platform.media.MediaService;

import java.time.Instant;
import java.util.UUID;

/**
 * The doc 62 §4 step 1 response, field for field:
 * {@code { uploadUrl, mediaAssetId, expiresAt }}.
 *
 * <p><strong>The URL is the only thing about storage that leaves the server.</strong>
 * It is signed and short-lived, and it names one key and one content type. The
 * bucket, endpoint, region, access key and {@code storage_key} are absent — this
 * type has no field able to carry any of them, which is what doc 62 §6 and the
 * doc 58 §9 denylist require. That the URL's host happens to belong to a provider
 * is unavoidable for a direct upload; it is transient, credential-free, and never
 * shown to a guest.
 */
public record UploadUrlView(String uploadUrl, UUID mediaAssetId, Instant expiresAt) {

    static UploadUrlView of(MediaService.Upload upload) {
        return new UploadUrlView(upload.uploadUrl(), upload.mediaAssetId(), upload.expiresAt());
    }
}
