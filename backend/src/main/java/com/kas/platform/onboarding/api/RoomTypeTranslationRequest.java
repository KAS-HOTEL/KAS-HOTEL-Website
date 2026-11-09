package com.kas.platform.onboarding.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A room type's Partner-authored content in one locale.
 *
 * <p>{@code name} is <strong>Partner-authored free text</strong>. There is no
 * room-name enum anywhere in this codebase and {@code ForbiddenConceptsTest}
 * would fail if one appeared — "Deluxe King" is how a Partner sells the room, not
 * a value the platform chooses for them.
 *
 * <p>{@code @NotBlank} mirrors the {@code room_type_tr_name_len} CHECK, so a
 * blank name fails at the boundary with a field-level message instead of as a
 * constraint violation. {@code shortDescription} is optional, matching the
 * nullable column.
 *
 * <p>There is no {@code longDescription}: the column exists but no endpoint has
 * ever written it, and adding a write for a field nothing reads back would be
 * inventing a capability rather than exposing one.
 */
public record RoomTypeTranslationRequest(

        @NotBlank
        @Size(max = 200)
        String name,

        @Size(max = 2000)
        String shortDescription) {
}
