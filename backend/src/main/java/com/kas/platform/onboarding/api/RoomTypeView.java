package com.kas.platform.onboarding.api;

import com.kas.platform.property.BedConfiguration;
import com.kas.platform.property.RoomType;
import com.kas.platform.property.RoomTypeStatus;
import com.kas.platform.property.RoomTypeTranslation;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A room type on the admin surface.
 *
 * <p>Carries {@code version} because the update endpoint requires it — that is
 * how a Partner's edit is rejected if someone else changed the room first
 * (doc 58 §2, 409 on conflict).
 *
 * <p>This javadoc said exactly that from Phase 7.5B onwards while the field was
 * absent, so the token {@code PATCH} demanded was one no caller could read. The
 * field arrived when Step 8 needed it to build an edit form.
 *
 * <h2>Translations are here for the same reason property names are (OQ-137)</h2>
 *
 * <p>{@code POST} and {@code PATCH} on this route both accept a {@code name} and
 * a {@code shortDescription} and write them to {@code room_type_translation} —
 * and {@code GET} returned neither. That is the identical write-without-read
 * asymmetry OQ-132 closed for {@link PropertyAdminView}, and the same answer
 * applies: expose exactly what the write contract already takes, and nothing
 * more. A room type identified in an extranet only by its slug is not identified.
 *
 * <p>Keyed by locale rather than resolved to one. Doc 25 freezes two locales and
 * this is an authoring surface — "the Vietnamese name is set and the English one
 * is not" is a fact the Partner needs, and a single resolved string cannot carry
 * it. {@code long_description} is a column no endpoint writes, so it is not read
 * back either.
 *
 * <p>Deliberately absent: {@code propertyId} is implied by the route and the
 * caller's scope; there is no partner reference; and there is no field capable of
 * holding a room number, floor or unit id — doc 52 §6 excludes
 * {@code PhysicalRoom} from V1 entirely. {@code basePriceMinor} is absent too: it
 * is commercial data owned by {@code pricing}, and doc 52 §3.2 keeps it off this
 * record on purpose.
 *
 * <p>This record lives in a package scanned by {@code PublicResponseDenylistTest},
 * so it is held to the public standard even though it is an admin response.
 */
public record RoomTypeView(
        UUID id,
        String slug,
        /** Name and short description per locale, e.g. {@code {"vi": {…}, "en": {…}}}. */
        Map<String, RoomTypeTranslation> translations,
        RoomTypeStatus status,
        BigDecimal areaSqm,
        int maxAdults,
        int maxChildren,
        int maxOccupancy,
        String viewType,
        boolean smoking,
        int sortOrder,
        List<BedConfiguration> beds,
        List<String> amenityCodes,
        /** Doc 58 §2 concurrency token. Send it back on {@code PATCH}. */
        int version) {

    public RoomTypeView {
        translations = translations == null ? Map.of() : Map.copyOf(translations);
    }

    static RoomTypeView of(RoomType roomType, Map<String, RoomTypeTranslation> translations,
                           List<BedConfiguration> beds, List<String> amenityCodes) {
        return new RoomTypeView(
                roomType.id(),
                roomType.slug(),
                translations,
                roomType.status(),
                roomType.areaSqm(),
                roomType.maxAdults(),
                roomType.maxChildren(),
                roomType.maxOccupancy(),
                roomType.viewType(),
                roomType.smoking(),
                roomType.sortOrder(),
                beds,
                amenityCodes,
                roomType.version());
    }
}
