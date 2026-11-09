package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.catalog.Amenity;
import com.kas.platform.catalog.AmenityRepository;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.BedConfiguration;
import com.kas.platform.property.RoomType;
import com.kas.platform.property.RoomTypeRepository;
import com.kas.platform.property.RoomTypeStatus;
import com.kas.platform.property.RoomTypeTranslation;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Room type configuration for the Partner.
 *
 * <p>Room names and descriptions are Partner-authored free text; everything the
 * Partner <em>selects</em> — amenities, and eventually views — comes from a
 * controlled catalogue.
 */
@Service
public class RoomTypeService {

    /** Doc 25 — the two frozen locales, matching the room_type_tr_locale CHECK. */
    private static final Set<String> SUPPORTED_LOCALES = Set.of("vi", "en");

    private static final String ENTITY = "room_type";

    /**
     * Amenities whose category is literally {@code PROPERTY_FACILITY} belong to
     * the hotel, not to a room. Attaching "parking" or "lift" to a room type is
     * the mistake the phase brief §10 asks to prevent, and the database does not
     * prevent it — {@code room_type_amenity} has only an FK to {@code amenity}.
     *
     * <p><strong>This is the only category rule applied, and it is PROPOSED.</strong>
     * Doc 03 §6 defines the nine categories but never says which are room-eligible,
     * so a fuller mapping would be invented. {@code ACCESSIBILITY} in particular is
     * genuinely both — a step-free entrance is the building, an accessible bathroom
     * is the room — and is therefore left permitted. Recorded as OQ-103.
     */
    private static final String PROPERTY_ONLY_CATEGORY = "PROPERTY_FACILITY";

    private final RoomTypeRepository roomTypes;
    private final AmenityRepository amenities;
    private final AuditLogger audit;

    public RoomTypeService(RoomTypeRepository roomTypes, AmenityRepository amenities,
                           AuditLogger audit) {
        this.roomTypes = roomTypes;
        this.amenities = amenities;
        this.audit = audit;
    }

    public List<RoomType> list(UUID propertyId, AuthorizationScope scope) {
        return roomTypes.findByProperty(propertyId, scope);
    }

    public RoomType require(UUID roomTypeId, AuthorizationScope scope) {
        return roomTypes.findById(roomTypeId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));
    }

    public List<BedConfiguration> beds(UUID roomTypeId, AuthorizationScope scope) {
        require(roomTypeId, scope);
        return roomTypes.findBedConfigurations(roomTypeId, scope);
    }

    /**
     * Partner-authored content for a set of room types, keyed by room type then
     * locale. Batched so the list endpoint does not add a query per row.
     */
    public Map<UUID, Map<String, RoomTypeTranslation>> translations(
            Collection<UUID> roomTypeIds, AuthorizationScope scope) {
        return roomTypes.findTranslations(roomTypeIds, scope);
    }

    public List<String> amenityCodes(UUID roomTypeId, AuthorizationScope scope) {
        require(roomTypeId, scope);
        return roomTypes.findAmenityCodes(roomTypeId, scope);
    }

    /**
     * Creates a room type under {@code propertyId}.
     *
     * <p>Created {@code DRAFT}. A Partner cannot create a published room, so
     * adding a room to an already-approved property has no immediate public
     * effect — see {@link RoomTypeStatus#isPartnerPermittedTransition}.
     */
    @Transactional
    public RoomType create(UUID propertyId, String slug,
                           Map<String, RoomTypeTranslation> translations,
                           BigDecimal areaSqm, int maxAdults, int maxChildren, int maxOccupancy,
                           String viewType, boolean smoking, int sortOrder,
                           List<BedConfiguration> beds, List<String> amenityCodes,
                           ResolvedActor actor, AuthorizationScope scope) {

        requireSupportedLocales(translations);
        if (translations.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "A room type needs a name in at least one locale.",
                    List.of(new KasException.ErrorDetail("translations", "REQUIRED",
                            "Supply a name for vi, en, or both.")));
        }
        Set<UUID> amenityIds = resolveAmenities(amenityCodes);

        UUID id = roomTypes.create(propertyId, slug, maxAdults, maxChildren, maxOccupancy,
                        areaSqm, viewType, smoking, sortOrder, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        // Exactly the locales the Partner supplied. This used to write one string
        // to both, which made "the English name" and "the Vietnamese name" the
        // same field and left no way to ever tell them apart (OQ-138).
        writeTranslations(id, translations, scope);

        roomTypes.replaceBedConfigurations(id, beds, scope);
        roomTypes.replaceAmenities(id, amenityIds, scope);

        audit(actor, "room_type.created", id,
                Map.of("propertyId", propertyId.toString(), "slug", slug), scope);

        return require(id, scope);
    }

    /**
     * Updates attributes, guarded by {@code expectedVersion}.
     *
     * @throws ConflictException {@code VERSION_CONFLICT} when someone else edited
     *         first — doc 58 §2's convention for MASTER updates
     */
    @Transactional
    public RoomType update(UUID roomTypeId, int expectedVersion, BigDecimal areaSqm,
                           int maxAdults, int maxChildren, int maxOccupancy, String viewType,
                           boolean smoking, int sortOrder, ResolvedActor actor,
                           AuthorizationScope scope) {
        RoomType current = require(roomTypeId, scope);

        if (!roomTypes.update(roomTypeId, expectedVersion, areaSqm, maxAdults, maxChildren,
                maxOccupancy, viewType, smoking, sortOrder, scope)) {
            // In scope (require() passed), so the only remaining cause is a
            // version that has moved on.
            throw ConflictException.versionConflict("Room type " + current.slug());
        }
        audit(actor, "room_type.updated", roomTypeId, Map.of("slug", current.slug()), scope);
        return require(roomTypeId, scope);
    }

    /**
     * The whole of a {@code PATCH}: attributes, translations, beds and amenities,
     * in <strong>one</strong> transaction.
     *
     * <p>Each of those used to be its own {@code @Transactional} call from the
     * controller, so a request whose amenities were invalid could still commit the
     * attribute change before failing — the Partner saw an error and their data
     * had moved anyway. One transaction makes a refused edit a refused edit.
     *
     * <p>Order matters and mirrors {@code PropertyInformationService}: scope
     * first ({@code require} → 404, doc 85 §6.3), then the version
     * compare-and-set (→ 409), then the writes. Checking the version before the
     * scope would let a guessed version distinguish "wrong version" from "not
     * yours" on another partner's room.
     */
    @Transactional
    public RoomType updateAll(UUID roomTypeId, int expectedVersion,
                              Map<String, RoomTypeTranslation> translations,
                              BigDecimal areaSqm, int maxAdults, int maxChildren,
                              int maxOccupancy, String viewType, boolean smoking, int sortOrder,
                              List<BedConfiguration> beds, List<String> amenityCodes,
                              ResolvedActor actor, AuthorizationScope scope) {

        requireSupportedLocales(translations);

        // Resolved before anything is written, so an unknown amenity refuses the
        // whole edit rather than being discovered halfway through it.
        Set<UUID> amenityIds = resolveAmenities(amenityCodes);

        RoomType current = require(roomTypeId, scope);

        if (!roomTypes.update(roomTypeId, expectedVersion, areaSqm, maxAdults, maxChildren,
                maxOccupancy, viewType, smoking, sortOrder, scope)) {
            // In scope (require() passed), so the only remaining cause is a
            // version that has moved on.
            throw ConflictException.versionConflict("Room type " + current.slug());
        }

        writeTranslations(roomTypeId, translations, scope);
        roomTypes.replaceBedConfigurations(roomTypeId, beds, scope);
        roomTypes.replaceAmenities(roomTypeId, amenityIds, scope);

        audit(actor, "room_type.updated", roomTypeId, Map.of("slug", current.slug()), scope);
        return require(roomTypeId, scope);
    }

    /** Writes each supplied locale. An absent locale is left alone, never deleted. */
    private void writeTranslations(UUID roomTypeId, Map<String, RoomTypeTranslation> translations,
                                   AuthorizationScope scope) {
        for (Map.Entry<String, RoomTypeTranslation> entry : translations.entrySet()) {
            roomTypes.setTranslation(roomTypeId, entry.getKey(), entry.getValue().name(),
                    entry.getValue().shortDescription(), null, scope);
        }
    }

    /**
     * Doc 25 freezes two locales and {@code room_type_tr_locale} enforces the same
     * pair in the schema. Checked here so an unknown key becomes a field-level
     * {@code 400} instead of a constraint violation surfacing as a {@code 500} —
     * and every bad locale is reported at once rather than the first one.
     */
    private static void requireSupportedLocales(Map<String, RoomTypeTranslation> translations) {
        List<KasException.ErrorDetail> problems = translations.keySet().stream()
                .filter(locale -> !SUPPORTED_LOCALES.contains(locale))
                .map(locale -> new KasException.ErrorDetail("translations." + locale,
                        "UNSUPPORTED_LOCALE", "Supported locales are vi and en."))
                .toList();
        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "One or more translations use a locale this platform does not support.",
                    problems);
        }
    }

    @Transactional
    public RoomType setTranslation(UUID roomTypeId, String locale, String name,
                                   String shortDescription, String longDescription,
                                   ResolvedActor actor, AuthorizationScope scope) {
        require(roomTypeId, scope);
        roomTypes.setTranslation(roomTypeId, locale, name, shortDescription, longDescription, scope);
        audit(actor, "room_type.translation_updated", roomTypeId, Map.of("locale", locale), scope);
        return require(roomTypeId, scope);
    }

    @Transactional
    public RoomType replaceBeds(UUID roomTypeId, List<BedConfiguration> beds,
                                ResolvedActor actor, AuthorizationScope scope) {
        require(roomTypeId, scope);
        roomTypes.replaceBedConfigurations(roomTypeId, beds, scope);
        audit(actor, "room_type.beds_changed", roomTypeId,
                Map.of("configurations", beds.size()), scope);
        return require(roomTypeId, scope);
    }

    @Transactional
    public RoomType replaceAmenities(UUID roomTypeId, List<String> codes, ResolvedActor actor,
                                     AuthorizationScope scope) {
        require(roomTypeId, scope);
        roomTypes.replaceAmenities(roomTypeId, resolveAmenities(codes), scope);
        audit(actor, "room_type.amenities_changed", roomTypeId,
                Map.of("count", codes.size()), scope);
        return require(roomTypeId, scope);
    }

    /**
     * Moves the lifecycle. A Partner may withdraw but never publish.
     *
     * @throws ConflictException {@code ILLEGAL_TRANSITION} for an invalid or
     *         partner-forbidden move
     */
    @Transactional
    public RoomType setStatus(UUID roomTypeId, RoomTypeStatus target, ResolvedActor actor,
                              AuthorizationScope scope) {
        RoomType current = require(roomTypeId, scope);

        if (!current.status().isPartnerPermittedTransition(target)) {
            throw ConflictException.illegalTransition(
                    "roomTypeStatus", current.status().name(), target.name());
        }
        roomTypes.updateStatus(roomTypeId, target, scope);
        audit(actor, "room_type.status_changed", roomTypeId,
                Map.of("from", current.status().name(), "to", target.name()), scope);
        return require(roomTypeId, scope);
    }

    /**
     * Moves a room type to a display position within its hotel (owner decision,
     * 2026-11-08). The website and console list room types by this order.
     */
    @Transactional
    public RoomType setSortOrder(UUID roomTypeId, int sortOrder, ResolvedActor actor,
                                 AuthorizationScope scope) {
        if (sortOrder < 0 || sortOrder > 10_000) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "sortOrder must be between 0 and 10000");
        }
        require(roomTypeId, scope);
        roomTypes.updateSortOrder(roomTypeId, sortOrder, scope);
        audit(actor, "room_type.reordered", roomTypeId, Map.of("sortOrder", sortOrder), scope);
        return require(roomTypeId, scope);
    }

    // ---------------------------------------------------------------- internal

    /**
     * Resolves codes to catalogue ids, refusing anything unknown or property-level.
     *
     * <p>Unknown codes are named back to the caller. Doc 03 §6 makes amenities "a
     * shared, controlled vocabulary, not free text per hotel"; silently dropping
     * an unrecognised code would let a Partner believe they had set something they
     * had not.
     */
    private Set<UUID> resolveAmenities(List<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return Set.of();
        }
        List<Amenity> resolved = amenities.findByCodes(codes);
        Set<String> known = resolved.stream().map(Amenity::code)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());

        List<KasException.ErrorDetail> problems = new java.util.ArrayList<>();

        codes.stream().distinct().filter(code -> !known.contains(code)).forEach(code ->
                problems.add(new KasException.ErrorDetail("amenityCodes", "UNKNOWN_AMENITY",
                        "'" + code + "' is not in the amenity catalog.")));

        resolved.stream()
                .filter(a -> PROPERTY_ONLY_CATEGORY.equals(a.category()))
                .forEach(a -> problems.add(new KasException.ErrorDetail(
                        "amenityCodes", "PROPERTY_LEVEL_AMENITY",
                        "'" + a.code() + "' is a property facility and belongs to the property, "
                                + "not to a room type.")));

        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "One or more amenities could not be assigned to this room type.", problems);
        }
        return resolved.stream().map(Amenity::id)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private void audit(ResolvedActor actor, String action, UUID entityId,
                       Map<String, Object> after, AuthorizationScope scope) {
        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), action, ENTITY, entityId,
                null, after, null, null, null, CorrelationId.current(), scope.toString()));
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
}
