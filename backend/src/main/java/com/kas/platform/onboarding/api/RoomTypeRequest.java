package com.kas.platform.onboarding.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Creating or updating a room type.
 *
 * <p>Names and short descriptions are <strong>Partner-authored free text</strong>,
 * carried per locale in {@link #translations}. There is no room-name enum
 * anywhere in this codebase, and {@code ForbiddenConceptsTest} would fail if one
 * appeared — "Deluxe King" is how a Partner sells the room, not a value the
 * platform chooses for them.
 *
 * <p>{@code viewType} is different: it is a frozen enum
 * ({@code CITY, STREET, COURTYARD, ROOFTOP, INTERIOR}), so it is validated
 * against those values and <strong>not</strong> extended. The phase brief §8 is
 * explicit that {@code LANDMARK_VIEW} and {@code GARDEN_VIEW} must not be
 * invented; if the owner's source material needs them, that is an approved
 * decision, not a silent remap.
 *
 * <p>Bounds mirror the database CHECKs so a bad value fails at the boundary with
 * a field-level message rather than as a constraint violation.
 */
public record RoomTypeRequest(

        @NotBlank
        @Size(max = 120)
        @Pattern(regexp = "^[a-z0-9][a-z0-9-]*$",
                message = "must be lower-case letters, digits and hyphens")
        String slug,

        /**
         * Partner-authored content per locale, e.g.
         * {@code {"vi": {…}, "en": {…}}} — the same shape {@link RoomTypeView}
         * returns, so a client can read, edit and send back without reshaping.
         *
         * <p><strong>This replaced a single {@code name}/{@code shortDescription}
         * pair (OQ-138).</strong> One monolingual field could only ever be written
         * to one locale on update, and it was written to {@code en} — so a Partner
         * editing a room silently lost the ability to change its Vietnamese name,
         * on a platform where doc 25 freezes two locales and doc 52 §3.1 requires
         * both-locale content before publication.
         *
         * <p>On create, at least one locale is required: {@code room_type_translation.name}
         * is {@code NOT NULL}, so a room type with no translation at all cannot
         * exist. On update an absent locale means "leave it alone", never "delete
         * it". Locale keys are checked against the two frozen locales in the
         * service, so an unknown key is a field error rather than a CHECK
         * violation surfacing as a 500.
         */
        @Valid
        Map<String, RoomTypeTranslationRequest> translations,

        /** {@code room_type_area_pos}: strictly positive when supplied. */
        @Positive
        BigDecimal areaSqm,

        /** {@code room_type_adults_pos}. */
        @NotNull
        @Min(1)
        Integer maxAdults,

        /** {@code room_type_children_nonneg}. */
        @NotNull
        @Min(0)
        Integer maxChildren,

        /** {@code room_type_occupancy_pos} and {@code room_type_occupancy_fit}. */
        @NotNull
        @Min(1)
        Integer maxOccupancy,

        @Pattern(regexp = "CITY|STREET|COURTYARD|ROOFTOP|INTERIOR",
                message = "must be one of the frozen view types")
        String viewType,

        boolean smoking,

        @Min(0)
        Integer sortOrder,

        @Valid
        List<BedConfigurationRequest> beds,

        /** Codes from the shared catalog. Unknown or property-level codes are refused. */
        List<@NotBlank String> amenityCodes) {

    public RoomTypeRequest {
        translations = translations == null ? Map.of() : Map.copyOf(translations);
        beds = beds == null ? List.of() : List.copyOf(beds);
        amenityCodes = amenityCodes == null ? List.of() : List.copyOf(amenityCodes);
    }

    public int sortOrderOrDefault() {
        return sortOrder == null ? 0 : sortOrder;
    }
}
