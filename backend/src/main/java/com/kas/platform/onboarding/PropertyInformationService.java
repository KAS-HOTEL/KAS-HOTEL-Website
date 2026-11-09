package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.catalog.Amenity;
import com.kas.platform.catalog.AmenityRepository;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Editing a property's own information — the fields the doc 58 §8 update
 * contract already accepts, and no others.
 *
 * <h2>Why this is a transaction</h2>
 *
 * <p>A single edit can touch two tables: {@code property} for the address and
 * contact, {@code property_translation} for each locale's name. Committing the
 * address and losing the rename would leave the Partner looking at a version
 * number that had advanced for a change that did not happen — and their next
 * save would then fail with a conflict they could not explain.
 *
 * <h2>Order matters</h2>
 *
 * <ol>
 *   <li><strong>Existence and scope first.</strong> Absent or another partner's →
 *       {@code 404}, doc 85 §6.3. This must come before the version check, or a
 *       cross-partner PATCH with a guessed version would answer {@code 409} and
 *       thereby confirm the property exists.</li>
 *   <li><strong>Compare-and-set on the version.</strong> Zero rows can now only
 *       mean a stale version → {@code 409 VERSION_CONFLICT}.</li>
 *   <li><strong>Names last</strong>, inside the same transaction, once the row
 *       lock from the update is already held.</li>
 * </ol>
 *
 * <p>The version advances even when only a name changed. Names live in another
 * table, so a rename touches no column on {@code property} — without the bump,
 * another editor's copy would still look current and the next writer would
 * overwrite the rename without ever seeing a conflict.
 */
@Service
public class PropertyInformationService {

    /**
     * Doc 25 freezes two locales, and {@code property_tr_locale_valid} enforces
     * the same pair in the schema. Validated here so an unknown key becomes a
     * field-level {@code 400} instead of a constraint violation surfacing as a
     * {@code 500}.
     */
    private static final Set<String> LOCALES = Set.of("vi", "en");

    private static final String ENTITY = "property";

    private final PropertyRepository properties;
    private final AmenityRepository amenities;
    private final AuditLogger audit;

    public PropertyInformationService(PropertyRepository properties, AmenityRepository amenities,
                                      AuditLogger audit) {
        this.properties = properties;
        this.amenities = amenities;
        this.audit = audit;
    }

    /**
     * Replaces the property's amenity selection from the controlled catalogue.
     *
     * <p>The mirror of {@code RoomTypeService.replaceAmenities}, and it exists for
     * the reason that one already names: a room type refuses a
     * {@code PROPERTY_FACILITY} amenity because it <em>"is a property facility and
     * belongs to the property"</em> — and until now there was nowhere for it to
     * belong. {@code property_amenity} has existed since V4 and
     * {@link PropertyRepository#replaceAmenities} was written for it, but no route
     * reached either, so the amenities doc 58 §3.1 puts on the guest detail could
     * only be assigned with SQL.
     *
     * <p><strong>Replace, not merge.</strong> The whole selection is the unit, so
     * an empty list clears it — the same semantics room types have, and the only
     * way a Partner can remove an amenity they added by mistake.
     *
     * <p><strong>No category is refused here.</strong> The room-type rule is
     * one-directional: nothing in the catalogue or the frozen documents marks an
     * amenity as room-only, so a property may hold any code the catalogue knows.
     * Inventing the symmetric restriction would exclude assignments — a hotel's
     * own air-conditioning, say — that nothing forbids.
     *
     * @throws NotFoundException absent, or outside {@code scope}
     * @throws KasException      {@code VALIDATION_FAILED} naming every code the
     *                           catalogue does not contain
     */
    @Transactional
    public void replaceAmenities(UUID propertyId, List<String> codes, ResolvedActor actor,
                                 AuthorizationScope scope) {
        List<String> requested = codes == null ? List.of() : codes;

        // Existence and scope first, so an unknown code cannot tell a caller
        // whether someone else's property exists.
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        properties.replaceAmenities(propertyId, resolveAmenities(requested), scope);

        // The codes themselves, not just a count: this changes what a guest sees,
        // and "which amenities" is the question an audit reader will have.
        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), "property.amenities_changed", ENTITY,
                propertyId, null, Map.of("amenityCodes", requested), null, null, null,
                CorrelationId.current(), scope.toString()));
    }

    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) {
            return UserRole.SUPER_ADMIN.name();
        }
        if (actor.roles().contains(UserRole.ADMIN)) {
            return UserRole.ADMIN.name();
        }
        return UserRole.CUSTOMER.name();
    }

    /**
     * Catalogue codes to ids, reporting every unknown one at once.
     *
     * <p>All of them, not just the first: a Partner fixing a typed list should
     * learn about every bad code in one round trip.
     */
    private Set<UUID> resolveAmenities(List<String> codes) {
        if (codes.isEmpty()) {
            return Set.of();
        }
        List<Amenity> resolved = amenities.findByCodes(codes);
        Set<String> known = resolved.stream().map(Amenity::code)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());

        List<KasException.ErrorDetail> problems = codes.stream().distinct()
                .filter(code -> !known.contains(code))
                .map(code -> new KasException.ErrorDetail("amenityCodes", "UNKNOWN_AMENITY",
                        "'" + code + "' is not in the amenity catalog."))
                .toList();

        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "One or more amenity codes are not in the catalog.", problems);
        }

        // The caller's order is the display order the repository writes.
        Map<String, UUID> byCode = resolved.stream()
                .collect(java.util.stream.Collectors.toMap(Amenity::code, Amenity::id));
        return codes.stream().distinct().map(byCode::get)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    /**
     * @throws NotFoundException absent, or outside {@code scope}
     * @throws KasException      {@code VALIDATION_FAILED} for an unsupported locale
     * @throws ConflictException {@code VERSION_CONFLICT} when someone else saved first
     */
    @Transactional
    public void update(UUID propertyId, int expectedVersion, Map<String, String> names,
                       Map<String, String> signatureLines, Map<String, String> shortDescriptions,
                       String district, String ward, String city, String phone,
                       java.math.BigDecimal latitude, java.math.BigDecimal longitude,
                       AuthorizationScope scope) {

        rejectUnsupportedLocales("names", names);
        rejectUnsupportedLocales("signatureLines", signatureLines);
        rejectUnsupportedLocales("shortDescriptions", shortDescriptions);

        // Step 1 — existence and scope, before anything can distinguish itself.
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        // Step 2 — compare-and-set. The property is known to exist and to be in
        // scope, so a miss here is a stale version and nothing else.
        if (!properties.updateDetails(propertyId, expectedVersion, district, ward, city, phone,
                latitude, longitude, scope)) {
            throw ConflictException.versionConflict("Property");
        }

        // Step 3 — names, under the row lock the update above already took.
        for (Map.Entry<String, String> entry : names.entrySet()) {
            properties.setName(propertyId, entry.getKey(), entry.getValue(), scope);
        }

        // Step 4 — editorial text, after the names, because a translation row
        // cannot exist without one. A locale whose name arrived in this very
        // request is therefore writable in the same call.
        writeEditorial(propertyId, signatureLines, shortDescriptions, scope);
    }

    /**
     * Applies the editorial fields doc 52 §3.1 makes publish invariants.
     *
     * <p>The two maps are written together per locale so one statement carries
     * both, and a field the caller omitted keeps its stored value rather than
     * being cleared by its own absence.
     *
     * @throws KasException {@code VALIDATION_FAILED} naming any locale that has
     *                      no translation row — {@code name} is {@code NOT NULL},
     *                      so there is nothing to attach the text to, and saying
     *                      so beats accepting the text and dropping it
     */
    private void writeEditorial(UUID propertyId, Map<String, String> signatureLines,
                                Map<String, String> shortDescriptions, AuthorizationScope scope) {

        Set<String> locales = new LinkedHashSet<>(signatureLines.keySet());
        locales.addAll(shortDescriptions.keySet());

        List<KasException.ErrorDetail> missing = new ArrayList<>();
        for (String locale : locales) {
            boolean written = properties.setEditorial(propertyId, locale,
                    signatureLines.containsKey(locale), signatureLines.get(locale),
                    shortDescriptions.containsKey(locale), shortDescriptions.get(locale),
                    scope);
            if (!written) {
                missing.add(new KasException.ErrorDetail("names." + locale, "REQUIRED",
                        "Give this locale a name before writing its editorial text."));
            }
        }
        if (!missing.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Editorial text needs a name in the same locale.", missing);
        }
    }

    /**
     * Every bad locale at once, not the first one.
     *
     * <p>The same courtesy {@code submit} extends when a property is incomplete:
     * a caller fixing one field at a time because the server only reports one at
     * a time is a slow, avoidable loop.
     */
    private static void rejectUnsupportedLocales(String field, Map<String, String> values) {
        List<KasException.ErrorDetail> details = new ArrayList<>();
        for (String locale : values.keySet()) {
            if (!LOCALES.contains(locale)) {
                details.add(new KasException.ErrorDetail(field + "." + locale, "UNSUPPORTED_LOCALE",
                        "Supported locales are vi and en."));
            }
        }
        if (!details.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "One or more fields use a locale this platform does not support.", details);
        }
    }
}
