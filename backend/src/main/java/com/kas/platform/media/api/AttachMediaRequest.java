package com.kas.platform.media.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Attaches an asset to a property or room type.
 *
 * <p>{@code ownerType} is restricted to the two kinds whose ownership resolves to
 * a partner. {@code FACILITY}, {@code OFFER}, {@code PAGE_BLOCK} and
 * {@code REVIEW} exist in the frozen enum but have no Partner-facing surface yet;
 * accepting them would mean writing links this module cannot scope-check.
 */
public record AttachMediaRequest(

        @NotNull
        OwnerType ownerType,

        @NotNull
        UUID ownerId,

        @Min(0)
        Integer displayOrder) {

    /** The subset of {@code media_owner_type} a Partner may attach to today. */
    public enum OwnerType {
        PROPERTY,
        ROOM_TYPE
    }

    public int displayOrderOrDefault() {
        return displayOrder == null ? 0 : displayOrder;
    }
}
