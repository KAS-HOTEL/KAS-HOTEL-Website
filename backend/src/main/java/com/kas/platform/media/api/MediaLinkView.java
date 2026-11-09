package com.kas.platform.media.api;

import com.kas.platform.media.MediaLink;
import com.kas.platform.media.MediaOwnerType;
import com.kas.platform.media.MediaStatus;

import java.util.UUID;

/**
 * One attachment, on the admin surface.
 *
 * <p>Doc 58 §8 names a {@code /{id}/usages} endpoint — this is the shape it
 * returns: where an asset is used, so an admin can see what a change or a detach
 * would affect before doing it.
 */
public record MediaLinkView(
        UUID id,
        UUID mediaAssetId,
        MediaOwnerType ownerType,
        UUID ownerId,
        int displayOrder,
        boolean isCover,
        MediaStatus status) {

    static MediaLinkView of(MediaLink link) {
        return new MediaLinkView(
                link.id(),
                link.mediaAssetId(),
                link.ownerType(),
                link.ownerId(),
                link.displayOrder(),
                link.isCover(),
                link.status());
    }
}
