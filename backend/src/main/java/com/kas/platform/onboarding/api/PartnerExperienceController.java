package com.kas.platform.onboarding.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.ExperienceService;
import com.kas.platform.property.Experience;
import com.kas.platform.property.ExperienceTranslation;
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
 * A property's signature experiences.
 *
 * <h2>Why this route exists</h2>
 *
 * <p>It is the last missing piece of the publish checklist. Doc 52 §3.1 and doc
 * 60 make <em>"≥1 signature experience"</em> a CONFIRMED publish invariant and
 * {@code PropertyCompletenessChecker} enforces it, but no route could create one
 * — so no property in the portfolio could be published at all.
 *
 * <p>Doc 58 does not name experiences, which is why Step 16A.41 correctly refused
 * to invent this route and Step 16A.47 put the gap to the owner instead. The
 * shape below is the owner's answer, built on the frozen parts that already
 * existed: a sub-resource of {@code /admin/properties/{id}}, the frozen
 * {@code property.manage}, and doc 21 §3.6, which lists <em>"signature
 * experiences"</em> among the property admin area's own objects. It mirrors the
 * landmark controller next door field for field.
 *
 * <p><strong>404, never 403</strong>, for a property or experience outside the
 * caller's scope (doc 85 §6.3). The scope predicate sits in the same statement as
 * the identity, so a guessed id matches no rows.
 *
 * <p><strong>No version.</strong> {@code property_experience} has no version
 * column, so there is nothing for a stale writer to clobber — the same reasoning
 * as the landmark and facility routes.
 */
@RestController
@RequestMapping("/api/v1/admin/properties/{propertyId}/experiences")
public class PartnerExperienceController {

    private final ExperienceService experiences;

    public PartnerExperienceController(ExperienceService experiences) {
        this.experiences = experiences;
    }

    /**
     * Every experience of the property, in the operator's order.
     *
     * <p>Returns {@code []} — not 404 — for a property outside the caller's
     * scope, which is indistinguishable from one that genuinely has none, and
     * that is the intended amount of disclosure.
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public List<ExperienceView> list(@PathVariable UUID propertyId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        List<Experience> found = experiences.list(propertyId, scope);

        // One batch lookup rather than one per row, matching the landmark and
        // property lists: a per-experience query here is an N+1.
        Map<UUID, Map<String, ExperienceTranslation>> translations =
                experiences.translations(found.stream().map(Experience::id).toList(), scope);

        return found.stream()
                .map(experience -> ExperienceView.of(
                        experience, translations.getOrDefault(experience.id(), Map.of())))
                .toList();
    }

    /**
     * Creates an experience.
     *
     * <p>Refusals: {@code 404} when the property is out of scope; {@code 400}
     * when no locale carries a title. The title is required because
     * {@code property_experience_translation.title} is {@code NOT NULL} — and
     * because the publish gate counts base rows, so a titleless one would satisfy
     * a checklist item it cannot honestly meet.
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public ExperienceView create(@PathVariable UUID propertyId,
                                 @Valid @RequestBody ExperienceRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        Experience created = experiences.create(propertyId, request.sortOrderOrDefault(),
                request.asTranslations(), CurrentActor.require().actor(), scope);

        return view(created, scope);
    }

    /**
     * Updates an experience — its ordering, and the locales the caller supplies.
     *
     * <p>A locale left out keeps its stored text. That is what makes reordering
     * a body carrying only {@code sortOrder}, rather than a round trip that has
     * to re-send every word to avoid erasing it.
     */
    @PatchMapping("/{experienceId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public ExperienceView update(@PathVariable UUID propertyId,
                                 @PathVariable UUID experienceId,
                                 @Valid @RequestBody ExperienceRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();

        Experience updated = experiences.update(experienceId, request.sortOrderOrDefault(),
                request.asTranslations(), CurrentActor.require().actor(), scope);

        return view(updated, scope);
    }

    /**
     * Removes an experience.
     *
     * <p>A real delete — the table has no {@code archived_at}.
     *
     * <p>Deleting a property's <strong>last</strong> experience is permitted. It
     * does not un-publish anything, because the checklist runs at submit rather
     * than continuously, but the next submission will fail on it. Refusing here
     * would invent a rule no document states and would trap a Partner replacing
     * their only experience with a better one.
     */
    @DeleteMapping("/{experienceId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID propertyId, @PathVariable UUID experienceId) {
        experiences.delete(experienceId, CurrentActor.require().actor(),
                CurrentActor.requireScope());
    }

    private ExperienceView view(Experience experience, AuthorizationScope scope) {
        return ExperienceView.of(experience,
                experiences.translations(List.of(experience.id()), scope)
                        .getOrDefault(experience.id(), Map.of()));
    }
}
