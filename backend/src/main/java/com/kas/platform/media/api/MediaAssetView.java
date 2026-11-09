package com.kas.platform.media.api;

import com.kas.platform.media.MediaAsset;
import com.kas.platform.media.MediaStatus;
import com.kas.platform.media.StorageProvider;

import java.util.UUID;

/**
 * An asset on the admin surface.
 *
 * <p>Even here there is no {@code storageKey}: doc 62 §2 marks it internal and
 * nothing outside the repository needs it, so it is not carried into any view at
 * all. {@code partnerId} is likewise omitted — an admin only ever sees assets
 * their own scope reaches.
 */
public record MediaAssetView(
        UUID id,
        String mimeType,
        String category,
        Integer width,
        Integer height,
        Long sizeBytes,
        MediaStatus status,

        /**
         * Where the image can actually be fetched.
         *
         * <p>Added in STEP H. Without it a Partner arranging a gallery could see
         * a list of ids and never the photographs — the admin surface could
         * upload an image and then not show it, which is not a gallery.
         *
         * <p>It is the same delivery URL the public gallery returns, built from
         * the opaque asset id by {@link StorageProvider} — never the storage key
         * (doc 62 §6). {@code null} when no delivery base URL is configured, so
         * a deployment without one degrades to "no preview" rather than to a
         * broken image or a 500.
         */
        String url) {

    static MediaAssetView of(StorageProvider storage, java.util.function.UnaryOperator<String> site, MediaAsset asset) {
        return new MediaAssetView(
                asset.id(),
                asset.mimeType(),
                asset.category(),
                asset.width(),
                asset.height(),
                asset.sizeBytes(),
                asset.status(),
                asset.externalUrl() != null ? site.apply(asset.externalUrl())
                        : storage.isConfigured() ? storage.deliveryUrl(asset.id()) : null);
    }
}
