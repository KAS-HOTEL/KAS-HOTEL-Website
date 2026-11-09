package com.kas.platform.media;

import java.util.UUID;

/**
 * One file in the central library.
 *
 * <p><strong>{@code storageKey} is absent from this record on purpose.</strong>
 * Doc 62 §2 marks it "INTERNAL. Never leaves the server", and doc 58 §9
 * denylists it along with bucket, originalPath and checksum. Nothing outside
 * {@link MediaRepository} needs it, so nothing outside can accidentally pass it
 * somewhere it would be serialised.
 *
 * <p>{@code partnerId} is the one place ownership does not derive — doc 85 §4.3.
 * An asset lives in a partner's library before it is attached to anything, so it
 * cannot borrow ownership from a property.
 */
public record MediaAsset(
        UUID id,
        UUID partnerId,
        String mimeType,
        Integer width,
        Integer height,
        Long sizeBytes,
        String category,
        String visibility,
        MediaStatus status,
        String externalUrl) {
    public MediaAsset(UUID id, UUID partnerId, String mimeType, Integer width, Integer height,
                      Long sizeBytes, String category, String visibility, MediaStatus status) {
        this(id, partnerId, mimeType, width, height, sizeBytes, category, visibility, status, null);
    }
}
