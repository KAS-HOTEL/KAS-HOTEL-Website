package com.kas.platform.onboarding.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.RoomTypeService;
import com.kas.platform.property.RoomType;
import com.kas.platform.property.RoomTypeStatus;
import com.kas.platform.property.RoomTypeTranslation;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

/**
 * Room type management for the Partner.
 *
 * <p><strong>Path and permission both come from the frozen contract.</strong>
 * Doc 58 §8: {@code Room types | /admin/properties/{id}/room-types[/{rtId}] |
 * roomtype.manage}. Nothing was invented and no doc 58 amendment is needed here —
 * unlike the review routes of Phase 7.5A.
 *
 * <p>A property may have any number of room types. Nothing in the schema, the
 * repository or this controller caps it.
 */
@RestController
@RequestMapping("/api/v1/admin/properties/{propertyId}/room-types")
public class PartnerRoomTypeController {

    private final RoomTypeService roomTypes;

    public PartnerRoomTypeController(RoomTypeService roomTypes) {
        this.roomTypes = roomTypes;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('" + Permissions.ROOMTYPE_MANAGE + "', '" + Permissions.RATE_VIEW + "')")
    public List<RoomTypeView> list(@PathVariable UUID propertyId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        List<RoomType> found = roomTypes.list(propertyId, scope);

        // One batch lookup for every row rather than one query per room: the
        // name lives in room_type_translation, and this handler already makes
        // several queries per row without adding another.
        Map<UUID, Map<String, RoomTypeTranslation>> translations =
                roomTypes.translations(found.stream().map(RoomType::id).toList(), scope);

        return found.stream()
                .map(rt -> view(rt, translations.getOrDefault(rt.id(), Map.of()), scope))
                .toList();
    }

    /** 404 — not 403 — when the room type belongs to another partner. */
    @GetMapping("/{roomTypeId}")
    @PreAuthorize("hasAnyAuthority('" + Permissions.ROOMTYPE_MANAGE + "', '" + Permissions.RATE_VIEW + "')")
    public RoomTypeView get(@PathVariable UUID propertyId, @PathVariable UUID roomTypeId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return view(roomTypes.require(roomTypeId, scope), scope);
    }

    /** Creates a room type. Always {@code DRAFT}; a Partner cannot create a published room. */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.ROOMTYPE_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public RoomTypeView create(@PathVariable UUID propertyId,
                               @Valid @RequestBody RoomTypeRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        RoomType created = roomTypes.create(propertyId, request.slug(),
                translations(request), request.areaSqm(), request.maxAdults(),
                request.maxChildren(), request.maxOccupancy(), request.viewType(),
                request.smoking(), request.sortOrderOrDefault(), beds(request),
                request.amenityCodes(), CurrentActor.require().actor(), scope);

        return view(created, scope);
    }

    /**
     * Updates attributes, translations, beds and amenities in one transaction.
     * {@code version} guards against a lost update.
     *
     * <p>Returns {@code 409 VERSION_CONFLICT} if someone else edited first, per
     * doc 58 §2.
     *
     * <h2>Why {@code version} stays a query parameter</h2>
     *
     * <p>{@link UpdatePropertyRequest} carries its version in the body, and this
     * one does not. That asymmetry was examined rather than tidied away: doc 58 §2
     * says "{@code If-Match} / {@code version} on MASTER updates" and names the
     * <em>mechanism</em>, not where it travels — so neither form is required and
     * neither is forbidden. This form already produces the correct doc 58 §2.1
     * error shape: a missing parameter is answered {@code VALIDATION_FAILED} with
     * {@code field: "version"} by {@code GlobalExceptionHandler}.
     *
     * <p>Changing it would be a contract change with no correctness benefit, and
     * "the other endpoint does it differently" is an aesthetic argument. Recorded
     * as OQ-139 for an owner decision instead.
     */
    @PatchMapping("/{roomTypeId}")
    @PreAuthorize("hasAuthority('" + Permissions.ROOMTYPE_MANAGE + "')")
    public RoomTypeView update(@PathVariable UUID propertyId, @PathVariable UUID roomTypeId,
                               @RequestParam int version,
                               @Valid @RequestBody RoomTypeRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        // One call, one transaction. This used to be four separate transactional
        // calls, so an edit whose amenities were invalid still committed the
        // attribute change — and the third of them wrote only the "en"
        // translation, which is the whole of OQ-138.
        RoomType updated = roomTypes.updateAll(roomTypeId, version, translations(request),
                request.areaSqm(), request.maxAdults(), request.maxChildren(),
                request.maxOccupancy(), request.viewType(), request.smoking(),
                request.sortOrderOrDefault(), beds(request), request.amenityCodes(),
                CurrentActor.require().actor(), scope);

        return view(updated, scope);
    }

    /** Replaces the room's amenity selection from the controlled catalog. */
    @PatchMapping("/{roomTypeId}/amenities")
    @PreAuthorize("hasAuthority('" + Permissions.ROOMTYPE_MANAGE + "')")
    public RoomTypeView setAmenities(@PathVariable UUID propertyId,
                                     @PathVariable UUID roomTypeId,
                                     @RequestBody List<String> amenityCodes) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return view(roomTypes.replaceAmenities(roomTypeId, amenityCodes,
                CurrentActor.require().actor(), scope), scope);
    }

    /**
     * Withdraws a room type — {@code UNLISTED} or {@code ARCHIVED}.
     *
     * <p><strong>There is no publish action.</strong> Publishing happens only
     * through property approval, so a Partner cannot add a room to a live property
     * and make it public without review. Requesting {@code PUBLISHED} here returns
     * {@code 409 ILLEGAL_TRANSITION}.
     */
    @PatchMapping("/{roomTypeId}/status")
    @PreAuthorize("hasAuthority('" + Permissions.ROOMTYPE_MANAGE + "')")
    public RoomTypeView setStatus(@PathVariable UUID propertyId, @PathVariable UUID roomTypeId,
                                  @RequestParam RoomTypeStatus status) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return view(roomTypes.setStatus(roomTypeId, status,
                CurrentActor.require().actor(), scope), scope);
    }

    /** Moves the room type to a display position within its hotel (0 first). */
    @PatchMapping("/{roomTypeId}/order")
    @PreAuthorize("hasAuthority('" + Permissions.ROOMTYPE_MANAGE + "')")
    public RoomTypeView setOrder(@PathVariable UUID propertyId, @PathVariable UUID roomTypeId,
                                 @RequestParam int sortOrder) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return view(roomTypes.setSortOrder(roomTypeId, sortOrder,
                CurrentActor.require().actor(), scope), scope);
    }

    /** The request's per-locale content, in the domain's own shape. */
    private static Map<String, RoomTypeTranslation> translations(RoomTypeRequest request) {
        return request.translations().entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(
                        Map.Entry::getKey,
                        e -> new RoomTypeTranslation(e.getValue().name(),
                                e.getValue().shortDescription())));
    }

    private List<com.kas.platform.property.BedConfiguration> beds(RoomTypeRequest request) {
        return IntStream.range(0, request.beds().size())
                .mapToObj(i -> request.beds().get(i).toDomain(i))
                .toList();
    }

    /** One room type, with its translations looked up for it. */
    private RoomTypeView view(RoomType roomType, AuthorizationScope scope) {
        return view(roomType,
                roomTypes.translations(List.of(roomType.id()), scope)
                        .getOrDefault(roomType.id(), Map.of()),
                scope);
    }

    /** One room type, with translations already in hand. */
    private RoomTypeView view(RoomType roomType, Map<String, RoomTypeTranslation> translations,
                              AuthorizationScope scope) {
        return RoomTypeView.of(roomType, translations,
                roomTypes.beds(roomType.id(), scope),
                roomTypes.amenityCodes(roomType.id(), scope));
    }
}
