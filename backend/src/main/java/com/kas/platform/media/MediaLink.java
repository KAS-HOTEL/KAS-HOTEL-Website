package com.kas.platform.media;

import java.util.UUID;

/**
 * An attachment of one asset to one owner — {@code media_link}.
 *
 * <p>The link, not the asset, carries {@code displayOrder}, {@code isCover} and
 * its own {@code status}. That is what lets doc 62 §2 work: the same photograph
 * can be the cover of a property gallery and the third image of a room gallery
 * without being stored twice, because those facts belong to the relationship
 * rather than to the file.
 *
 * <p>Uniqueness is enforced by the database, not here:
 * {@code media_link_unique (owner_type, owner_id, media_asset_id)} stops the same
 * asset being attached twice to one owner, and
 * {@code media_link_one_cover_idx (owner_type, owner_id) WHERE is_cover} gives
 * doc 62 §2.2 its "exactly one cover, without application-level coordination".
 */
public record MediaLink(
        UUID id,
        UUID mediaAssetId,
        MediaOwnerType ownerType,
        UUID ownerId,
        int displayOrder,
        boolean isCover,
        MediaStatus status) {
}
