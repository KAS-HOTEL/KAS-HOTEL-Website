package com.kas.platform.onboarding.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.LandmarkService;
import com.kas.platform.property.Landmark;
import com.kas.platform.property.LandmarkTranslation;
import com.kas.platform.security.CurrentActor;
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
 * A property's nearby landmarks.
 *
 * <h2>Why this route exists</h2>
 *
 * <p>Doc 58 §3.1 puts landmarks on the guest property detail —
 * <em>"includes facilities, amenities, landmarks, gallery, policies"</em> — and
 * gives them no route of their own, so the detail is where guests read them and
 * this is where a Partner writes them. {@code property_landmark} has existed
 * since V3 with nothing reaching it.
 *
 * <p>The shape is a sub-resource of the frozen {@code /admin/properties/{id}},
 * with the frozen {@code property.manage}, mirroring the facility controller next
 * door. Nothing new was named: doc 21 §7 lists landmarks among the property admin
 * area's own objects.
 *
 * <p><strong>404, never 403</strong>, for a property or landmark outside the
 * caller's scope (doc 85 §6.3). The scope predicate sits in the same statement as
 * the identity, so a guessed id matches no rows.
 */
@RestController
@RequestMapping("/api/v1/admin/properties/{propertyId}/landmarks")
public class PartnerLandmarkController {

    private final LandmarkService landmarks;

    public PartnerLandmarkController(LandmarkService landmarks) {
        this.landmarks = landmarks;
    }

    /**
     * Every landmark of the property, in the operator's order.
     *
     * <p>Returns {@code []} — not 404 — for a property outside the caller's
     * scope, which is indistinguishable from one that genuinely has none, and
     * that is the intended amount of disclosure.
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public List<LandmarkView> list(@PathVariable UUID propertyId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        List<Landmark> found = landmarks.list(propertyId, scope);

        // One batch lookup rather than one per row, matching the property and
        // facility lists: a per-landmark query here is an N+1.
        Map<UUID, Map<String, LandmarkTranslation>> translations =
                landmarks.translations(found.stream().map(Landmark::id).toList(), scope);

        return found.stream()
                .map(landmark -> LandmarkView.of(
                        landmark, translations.getOrDefault(landmark.id(), Map.of())))
                .toList();
    }

    /**
     * Creates a landmark.
     *
     * <p>Refusals: {@code 404} when the property is out of scope; {@code 400}
     * when no locale carries a name — {@code property_landmark_translation.name}
     * is {@code NOT NULL}, so a landmark without one is a distance to a place
     * nobody named — or when a measurement is negative.
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public LandmarkView create(@PathVariable UUID propertyId,
                               @Valid @RequestBody LandmarkRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        Landmark created = landmarks.create(propertyId, request.type(), request.distanceMetres(),
                request.walkingMinutes(), request.sortOrderOrDefault(), request.asTranslations(),
                CurrentActor.require().actor(), scope);

        return view(created, scope);
    }

    /**
     * Updates a landmark.
     *
     * <p>There is <strong>no version</strong>, because {@code property_landmark}
     * has no version column — the same reasoning as the facility route.
     */
    @PatchMapping("/{landmarkId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public LandmarkView update(@PathVariable UUID propertyId,
                               @PathVariable UUID landmarkId,
                               @Valid @RequestBody LandmarkRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        Landmark updated = landmarks.update(landmarkId, request.type(), request.distanceMetres(),
                request.walkingMinutes(), request.sortOrderOrDefault(), request.asTranslations(),
                CurrentActor.require().actor(), scope);

        return view(updated, scope);
    }

    /**
     * Removes a landmark.
     *
     * <p>A real delete, unlike a facility's archive: the table has no
     * {@code archived_at}, and a landmark is a claim about the neighbourhood
     * rather than a record of what a guest was shown.
     */
    @DeleteMapping("/{landmarkId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID propertyId, @PathVariable UUID landmarkId) {
        landmarks.delete(landmarkId, CurrentActor.require().actor(), CurrentActor.requireScope());
    }

    private LandmarkView view(Landmark landmark, AuthorizationScope scope) {
        return LandmarkView.of(landmark,
                landmarks.translations(List.of(landmark.id()), scope)
                        .getOrDefault(landmark.id(), Map.of()));
    }
}
