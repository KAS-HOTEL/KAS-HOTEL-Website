package com.kas.platform.onboarding.api;

import com.kas.platform.property.Property;
import com.kas.platform.property.PropertyLifecycleState;
import com.kas.platform.property.PropertyRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A property on the admin surface.
 *
 * <p>Mapped explicitly from {@link Property}, never spread — doc 58 §9 layer 3.
 *
 * <h2>Why identity fields are here (OQ-132)</h2>
 *
 * <p>This view previously carried only {@code id}, {@code slug},
 * {@code lifecycleState}, {@code isFlagship} and {@code sortOrder}, which left
 * the extranet unable to tell one hotel from another by anything a human wrote.
 * Meanwhile {@link CreatePropertyRequest} already accepts a {@code name} and
 * writes it to both locales, and {@link UpdatePropertyRequest} already accepts
 * {@code district}, {@code ward}, {@code city} and {@code phone} — on the same
 * frozen doc 58 §8 route. The contract could be written but not read back.
 *
 * <p>Every field added below is one the caller may already write here. Nothing
 * new is invented and no column was added: the asymmetry is closed, not the
 * model extended. Fields the API cannot write — {@code starRating},
 * {@code openedYear}, {@code totalRooms}, coordinates, {@code email},
 * {@code zalo}, check-in and check-out times, {@code collection},
 * {@code country} — stay out, because a read-only field nobody can set reads as
 * a gap in the product rather than a gap in the API.
 *
 * <h2>Both locales, explicitly</h2>
 *
 * <p>{@code names} is keyed by locale rather than resolved to one. Doc 25 freezes
 * two locales and this is an authoring surface: a Partner editing a hotel needs
 * to see that the Vietnamese name is set and the English one is not, which a
 * single resolved string cannot express. It is also exactly what
 * {@code PropertyCompletenessChecker} counts when it reports
 * {@code name (both locales)} as missing.
 *
 * <h2>What is still absent</h2>
 *
 * <p>{@code partnerId} — on the doc 58 §9 denylist (PARTNER group), and no
 * caller needs it: an admin only ever sees properties their own scope already
 * reaches, so the owning partner is implied.
 *
 * <h2>{@code version} is here now, and only now</h2>
 *
 * <p>Step 5.1 deliberately left it out: it belongs with the update contract, and
 * nothing read or wrote it. {@link UpdatePropertyRequest} now requires it, so
 * the client has to be able to obtain it — a concurrency token the caller cannot
 * read is a check nobody can pass.
 *
 * <p>This record lives in a package scanned by {@code PublicResponseDenylistTest},
 * so it is held to the public standard even though it is an admin response.
 */
public record PropertyAdminView(
        UUID id,
        String slug,
        /** Display name per locale, e.g. {@code {"en": "…", "vi": "…"}}. Possibly empty. */
        Map<String, String> names,
        /**
         * The one-line editorial hook per locale — doc 23 §3.2, ≤ 90 characters.
         *
         * <p>Returned as well as accepted: doc 52 §3.1 makes it a publish
         * invariant and {@code PropertyCompletenessChecker} blocks submission
         * without it, so a Partner has to be able to see what they have.
         */
        Map<String, String> signatureLines,
        /** The card and meta text per locale — doc 23 §3.2, ≤ 220 characters. */
        Map<String, String> shortDescriptions,
        PropertyLifecycleState lifecycleState,
        boolean isFlagship,
        String district,
        String ward,
        String city,
        String phone,
        /**
         * Doc 23 §3.3's {@code coordinates — lat/lng}. Returned as well as
         * accepted, for the reason every other writable field is: a client that
         * cannot read what it just wrote cannot show a Partner their own draft
         * (doc 101 §2, OQ-132).
         *
         * <p>Null means no point has been supplied — never a city centre standing
         * in for one.
         */
        BigDecimal latitude,
        BigDecimal longitude,
        int sortOrder,
        /**
         * The property's assigned amenity codes, in the operator's own order.
         *
         * <p>Returned as well as accepted, for the reason {@code signatureLines}
         * is: doc 58 §3.1 puts amenities on the guest detail, so a Partner has to
         * be able to see what a guest will see. Codes, never names — the catalogue
         * owns the words, and {@code GET /admin/amenities} already serves them.
         */
        List<String> amenityCodes,
        /** Assigned Find Your KAS editorial groups, in operator order. */
        List<String> tripIntentCodes,
        /** Doc 58 §2 concurrency token. Send it back on {@code PATCH}. */
        int version) {

    public PropertyAdminView {
        names = names == null ? Map.of() : Map.copyOf(names);
        signatureLines = signatureLines == null ? Map.of() : Map.copyOf(signatureLines);
        shortDescriptions = shortDescriptions == null ? Map.of() : Map.copyOf(shortDescriptions);
        amenityCodes = amenityCodes == null ? List.of() : List.copyOf(amenityCodes);
        tripIntentCodes = tripIntentCodes == null ? List.of() : List.copyOf(tripIntentCodes);
    }

    /**
     * A locale contributes a key only when it actually has that text, so an
     * empty map means "not written yet" rather than "written as nothing" —
     * the same distinction {@code PropertyCompletenessChecker} draws.
     */
    static PropertyAdminView of(Property property, Map<String, String> names,
                                Map<String, PropertyRepository.EditorialText> editorial,
                                List<String> amenityCodes, List<String> tripIntentCodes) {
        Map<String, String> signatureLines = new java.util.LinkedHashMap<>();
        Map<String, String> shortDescriptions = new java.util.LinkedHashMap<>();
        editorial.forEach((locale, text) -> {
            if (text.signatureLine() != null) {
                signatureLines.put(locale, text.signatureLine());
            }
            if (text.shortDescription() != null) {
                shortDescriptions.put(locale, text.shortDescription());
            }
        });

        return new PropertyAdminView(
                property.id(),
                property.slug(),
                names,
                signatureLines,
                shortDescriptions,
                property.lifecycleState(),
                property.isFlagship(),
                property.district(),
                property.ward(),
                property.city(),
                property.phone(),
                property.latitude(),
                property.longitude(),
                property.sortOrder(),
                amenityCodes,
                tripIntentCodes,
                property.version());
    }
}
