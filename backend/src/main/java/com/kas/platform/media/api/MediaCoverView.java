package com.kas.platform.media.api;

import com.kas.platform.media.MediaRepository;
import com.kas.platform.media.StorageProvider;

import java.util.UUID;

/**
 * One owner's cover image, for a list that shows many owners at once.
 *
 * <h2>Why this is not {@code MediaAssetView}</h2>
 *
 * <p>A portfolio card needs the picture and the space to reserve for it. It does
 * not need the category, the status, the byte count or the mime type, and a card
 * grid that carried all of them for every hotel would be answering a question
 * nobody asked. The one field this record adds over the asset view —
 * {@code ownerId} — is the only reason the caller can match a cover to a row.
 *
 * <p>{@code url} is the same delivery URL every other surface serves, composed
 * from the opaque asset id by {@link StorageProvider}. Never the storage key
 * (doc 62 §6), and {@code null} when the deployment has no delivery base, so a
 * portfolio degrades to the placeholder it already had rather than to a broken
 * frame.
 *
 * <p>This record lives in a package {@code PublicResponseDenylistTest} scans, so
 * it is held to the public standard even though it is an admin response.
 */
public record MediaCoverView(
        /** The property or room type this cover belongs to. */
        UUID ownerId,
        UUID mediaAssetId,
        /** Intrinsic pixel size, for reserving space. Null when never recorded. */
        Integer width,
        Integer height,
        String url) {

    static MediaCoverView of(StorageProvider storage, java.util.function.UnaryOperator<String> site, MediaRepository.Cover cover) {
        return new MediaCoverView(
                cover.ownerId(),
                cover.mediaAssetId(),
                cover.width(),
                cover.height(),
                cover.externalUrl() != null ? site.apply(cover.externalUrl())
                        : storage.isConfigured() ? storage.deliveryUrl(cover.mediaAssetId()) : null);
    }
}
