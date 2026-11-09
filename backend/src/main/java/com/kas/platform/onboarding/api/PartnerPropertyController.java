package com.kas.platform.onboarding.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.CompletenessResult;
import com.kas.platform.onboarding.OnboardingService;
import com.kas.platform.onboarding.PropertyDeletionService;
import com.kas.platform.onboarding.PropertyInformationService;
import com.kas.platform.onboarding.PropertyPublicationService;
import com.kas.platform.onboarding.TripIntentAssignmentService;
import com.kas.platform.property.Property;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.property.TripIntentRepository;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.validation.Valid;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Property management for the Partner — doc 58 §8,
 * {@code GET/POST/PATCH /admin/properties[/{id}]}, permission
 * {@code property.manage}.
 *
 * <p>Thin by design: every rule lives in {@link OnboardingService} or in a
 * scope-enforcing repository. The controller resolves the actor, calls one
 * method, and maps the result.
 *
 * <p><strong>Nothing here is specific to any of the eight seed properties.</strong>
 * The ninth property created by {@code NinthPropertyE2EIT} travels these same
 * handlers, which is what makes "no code change for a new property" testable
 * rather than asserted.
 */
@RestController
@RequestMapping("/api/v1/admin/properties")
public class PartnerPropertyController {

    private final PropertyRepository properties;
    private final OnboardingService onboarding;
    private final PropertyInformationService information;
    private final PropertyPublicationService publication;
    private final TripIntentRepository tripIntents;
    private final TripIntentAssignmentService tripIntentAssignments;
    private final PropertyDeletionService deletion;

    public PartnerPropertyController(PropertyRepository properties, OnboardingService onboarding,
                                     PropertyInformationService information,
                                     PropertyPublicationService publication,
                                     TripIntentRepository tripIntents,
                                     TripIntentAssignmentService tripIntentAssignments,
                                     PropertyDeletionService deletion) {
        this.properties = properties;
        this.onboarding = onboarding;
        this.information = information;
        this.publication = publication;
        this.tripIntents = tripIntents;
        this.tripIntentAssignments = tripIntentAssignments;
        this.deletion = deletion;
    }

    /** Every property the caller's scope reaches, however many that is. */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('" + Permissions.PROPERTY_MANAGE + "', '" + Permissions.RATE_VIEW + "')")
    public List<PropertyAdminView> list() {
        AuthorizationScope scope = CurrentActor.requireScope();
        List<Property> found = properties.findAll(scope);

        // One batch lookup rather than one per row: the display name lives in
        // property_translation, and a per-property query behind a list endpoint
        // is an N+1 that only shows up once a partner has many hotels.
        List<UUID> ids = found.stream().map(Property::id).toList();
        Map<UUID, Map<String, String>> names = properties.findNames(ids, scope);
        Map<UUID, Map<String, PropertyRepository.EditorialText>> editorial =
                properties.findEditorial(ids, scope);
        Map<UUID, List<String>> amenityCodes = properties.findAmenityCodes(ids, scope);
        Map<UUID, List<String>> tripIntentCodes = tripIntents.findCodes(ids, scope);

        return found.stream()
                .map(property -> PropertyAdminView.of(
                        property,
                        names.getOrDefault(property.id(), Map.of()),
                        editorial.getOrDefault(property.id(), Map.of()),
                        amenityCodes.getOrDefault(property.id(), List.of()),
                        tripIntentCodes.getOrDefault(property.id(), List.of())))
                .toList();
    }

    /** 404 — not 403 — when the property belongs to another partner (doc 85 §6.3). */
    @GetMapping("/{propertyId}")
    @PreAuthorize("hasAnyAuthority('" + Permissions.PROPERTY_MANAGE + "', '" + Permissions.RATE_VIEW + "')")
    public PropertyAdminView get(@PathVariable UUID propertyId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return properties.findById(propertyId, scope)
                .map(property -> view(property, scope))
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    /**
     * Creates a property draft.
     *
     * <p>The partner is taken from the caller's own scope, never from the request
     * body — a Partner cannot create a hotel under someone else's organisation by
     * naming them. A GLOBAL caller has no implied partner and is refused here;
     * that is a deliberate gap, not an oversight (see the exception message).
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public PropertyAdminView create(@Valid @RequestBody CreatePropertyRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        UUID partnerId = scope.partnerId();
        if (partnerId == null) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Only a partner-scoped account can create a property.");
        }

        UUID id;
        try {
            id = properties.create(partnerId, request.slug(), scope)
                    .orElseThrow(() -> NotFoundException.outOfScope("Partner"));
        } catch (DuplicateKeyException taken) {
            // `property_slug_key` is UNIQUE across every partner, not per
            // partner, so a slug another organisation already holds reaches the
            // database and is refused there. Without this it surfaced as a 500
            // for something a caller can act on — and the caller cannot check
            // first, because listing other partners' slugs is exactly what the
            // scope filter exists to prevent.
            //
            // Reported against `slug` so a form can attach it to the field that
            // produced it. The message names no other partner and no other
            // property: that this string is spoken for is all it discloses, and
            // the same is true of any public URL.
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "That web address is already in use. Choose a different name.",
                    List.of(new KasException.ErrorDetail("slug", "SLUG_TAKEN",
                            "This address is already taken.")));
        }

        properties.setName(id, "en", request.name(), scope);
        properties.setName(id, "vi", request.name(), scope);

        return properties.findById(id, scope)
                .map(property -> view(property, scope))
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    /**
     * Partial update. Null fields are left unchanged, so a draft can be built up.
     *
     * <p>{@code version} is mandatory — doc 58 §2. A stale one is answered with
     * {@code 409 VERSION_CONFLICT} rather than overwriting the other edit; an
     * unknown or out-of-scope property is still {@code 404}, and the order in
     * which {@link PropertyInformationService} checks the two is what keeps those
     * answers from leaking into each other.
     */
    @PatchMapping("/{propertyId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public PropertyAdminView update(@PathVariable UUID propertyId,
                                    @Valid @RequestBody UpdatePropertyRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        information.update(propertyId, request.version(), request.names(),
                request.signatureLines(), request.shortDescriptions(), request.district(),
                request.ward(), request.city(), request.phone(),
                request.latitude(), request.longitude(), scope);

        return properties.findById(propertyId, scope)
                .map(property -> view(property, scope))
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    /**
     * One property with its per-locale text attached.
     *
     * <p>The editorial fields are read back as well as written. Doc 101 §2
     * recorded the cost of the opposite — {@code PATCH} accepted address fields
     * that {@code GET} never returned, which became OQ-132 — and a client that
     * cannot read what it just wrote cannot show a Partner their own draft.
     */
    private PropertyAdminView view(Property property, AuthorizationScope scope) {
        return PropertyAdminView.of(
                property,
                properties.findNames(List.of(property.id()), scope)
                        .getOrDefault(property.id(), Map.of()),
                properties.findEditorial(List.of(property.id()), scope)
                        .getOrDefault(property.id(), Map.of()),
                properties.findAmenityCodes(List.of(property.id()), scope)
                        .getOrDefault(property.id(), List.of()),
                tripIntents.findCodes(property.id(), scope));
    }

    /** Replaces the hotel's Find Your KAS groups; one hotel may belong to several. */
    @PatchMapping("/{propertyId}/trip-intents")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public PropertyAdminView setTripIntents(@PathVariable UUID propertyId,
                                            @RequestBody List<String> intentCodes) {
        AuthorizationScope scope = CurrentActor.requireScope();
        tripIntentAssignments.replace(propertyId, intentCodes,
                CurrentActor.require().actor(), scope);
        return properties.findById(propertyId, scope)
                .map(property -> view(property, scope))
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    /**
     * Replaces the property's amenity selection — the mirror of the room-type
     * route, permission {@code property.manage}.
     *
     * <p>{@code property_amenity} has existed since V4 and doc 58 §3.1 puts
     * amenities on the guest property detail, which the guest page has rendered
     * since Step 16A.31 — but nothing wrote them, so the only way to assign one
     * was an {@code INSERT}. The whole selection is the unit, so an empty list
     * clears it.
     *
     * <p>Refusals: {@code 404} out of scope, {@code 400} naming every code the
     * catalogue does not contain. <strong>No version</strong> — this replaces a
     * join table rather than updating the property row, exactly as the room-type
     * amenity route does, so there is no column for a stale writer to clobber.
     */
    @PatchMapping("/{propertyId}/amenities")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public PropertyAdminView setAmenities(@PathVariable UUID propertyId,
                                          @RequestBody List<String> amenityCodes) {
        AuthorizationScope scope = CurrentActor.requireScope();

        information.replaceAmenities(propertyId, amenityCodes,
                CurrentActor.require().actor(), scope);

        return properties.findById(propertyId, scope)
                .map(property -> view(property, scope))
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    /**
     * Publishes the property — doc 58 §8's {@code /publish}, permission
     * {@code property.manage}.
     *
     * <p>Moves it to {@code OPEN}, the only state anything quotes availability or
     * rates against. It does <strong>not</strong> change visibility:
     * {@code COMING_SOON} is already publicly listed, so this is the step that
     * makes the hotel bookable and nothing more.
     *
     * <p>Refusals: {@code 404} out of scope, {@code 409} for the wrong source
     * state or a stale version, {@code 400} listing every unmet checklist item or
     * a signature line another published property already uses.
     *
     * <p><strong>Inventory and rates are not checked</strong> — the OQ-101 ruling
     * makes them business inputs for sellability, not conditions of the
     * lifecycle. A published hotel with no inventory returns an empty
     * availability result, which is correct.
     */
    @PostMapping("/{propertyId}/publish")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public PropertyAdminView publish(@PathVariable UUID propertyId,
                                     @Valid @RequestBody PublishPropertyRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();
        Property published = publication.publish(propertyId, request.version(),
                CurrentActor.require().actor(), scope);
        return view(published, scope);
    }

    /**
     * Permanently deletes a hotel draft with its room types — ADMIN only.
     * {@code 409} when it was ever published or has booking or review history.
     */
    @DeleteMapping("/{propertyId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_DELETE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDraft(@PathVariable UUID propertyId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        deletion.deleteDraft(propertyId, CurrentActor.require().actor(), scope);
    }

    /** The section-by-section progress display of phase brief §18.2. */
    @GetMapping("/{propertyId}/completeness")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public CompletenessResult completeness(@PathVariable UUID propertyId) {
        return onboarding.completeness(propertyId, CurrentActor.requireScope());
    }

    /** Submits for review. 400 with every missing field if incomplete. */
    @PostMapping("/{propertyId}/submit")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public SubmissionView submit(@PathVariable UUID propertyId) {
        return SubmissionView.of(onboarding.submit(
                propertyId, CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Review history, newest first. Decisions are retained, never overwritten. */
    @GetMapping("/{propertyId}/submissions")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public List<SubmissionView> submissions(@PathVariable UUID propertyId) {
        return onboarding.history(propertyId, CurrentActor.requireScope()).stream()
                .map(SubmissionView::of)
                .toList();
    }
}
