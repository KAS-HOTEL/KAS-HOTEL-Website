package com.kas.platform.onboarding.api;

import com.kas.platform.security.CurrentActor;
import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.FacilityService;
import com.kas.platform.property.Facility;
import com.kas.platform.property.FacilityTranslation;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.validation.Valid;
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
 * A property's facility blocks — doc 58 §8:
 * {@code /admin/properties/{id}/facilities}, permission {@code property.manage}.
 *
 * <p>Both the path and the permission are frozen; the verbs mirror the room-type
 * controller next door, because a facility is the same kind of thing — a
 * per-property child entity with its own per-locale text. Nothing new was named.
 *
 * <p><strong>404, never 403</strong>, for a property or facility outside the
 * caller's scope (doc 85 §6.3). The scope predicate sits in the same statement as
 * the identity, so a guessed id matches no rows rather than being rejected after
 * being found.
 */
@RestController
@RequestMapping("/api/v1/admin/properties/{propertyId}/facilities")
public class PartnerFacilityController {

    private final FacilityService facilities;

    public PartnerFacilityController(FacilityService facilities) {
        this.facilities = facilities;
    }

    /**
     * Every facility of the property, archived ones included.
     *
     * <p>Archived blocks are returned because the console is where a Partner sees
     * what they have withdrawn; the guest query excludes them, which is where the
     * distinction matters. Returns {@code []} — not 404 — for a property outside
     * the caller's scope, which is indistinguishable from one that genuinely has
     * none, and that is the intended amount of disclosure.
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public List<FacilityView> list(@PathVariable UUID propertyId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        List<Facility> found = facilities.list(propertyId, scope);

        // One batch lookup rather than one per row, matching the property list:
        // a per-facility query behind a list endpoint is an N+1.
        Map<UUID, Map<String, FacilityTranslation>> translations =
                facilities.translations(found.stream().map(Facility::id).toList(), scope);

        return found.stream()
                .map(facility -> FacilityView.of(
                        facility, translations.getOrDefault(facility.id(), Map.of())))
                .toList();
    }

    /**
     * Creates a facility.
     *
     * <p>Refusals: {@code 404} when the property is out of scope, {@code 400} when
     * no locale carries a name — {@code facility_translation.name} is
     * {@code NOT NULL}, so a facility without one is a block nothing can render.
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public FacilityView create(@PathVariable UUID propertyId,
                               @Valid @RequestBody FacilityRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        Facility created = facilities.create(propertyId, request.type(),
                request.openToNonResidents(), request.sortOrderOrDefault(),
                request.asTranslations(), CurrentActor.require().actor(), scope);

        return view(created, scope);
    }

    /**
     * Updates a facility's text and arrangement.
     *
     * <p><strong>The type is not updatable.</strong> Doc 23 §5 makes the type what
     * the block is; one that turned from {@code POOL} into {@code MEETING} would
     * keep the pool's name and description while claiming to be something else.
     * The field is still accepted on the request so the same record serves both
     * verbs, and it is ignored here.
     *
     * <p>There is <strong>no version</strong>, because {@code facility} has no
     * version column — see {@code FacilityRepository}.
     */
    @PatchMapping("/{facilityId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public FacilityView update(@PathVariable UUID propertyId,
                               @PathVariable UUID facilityId,
                               @Valid @RequestBody FacilityRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        Facility updated = facilities.update(facilityId, request.openToNonResidents(),
                request.sortOrderOrDefault(), request.asTranslations(),
                CurrentActor.require().actor(), scope);

        return view(updated, scope);
    }

    /**
     * Withdraws a facility from the guest page.
     *
     * <p>Archive, not delete: the row is part of what a guest saw and the public
     * query already excludes archived rows. Idempotent, so a retried click is not
     * a refusal a Partner has to interpret.
     */
    @DeleteMapping("/{facilityId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(@PathVariable UUID propertyId, @PathVariable UUID facilityId) {
        facilities.archive(facilityId, CurrentActor.require().actor(),
                CurrentActor.requireScope());
    }

    private FacilityView view(Facility facility, AuthorizationScope scope) {
        return FacilityView.of(facility,
                facilities.translations(List.of(facility.id()), scope)
                        .getOrDefault(facility.id(), Map.of()));
    }
}
