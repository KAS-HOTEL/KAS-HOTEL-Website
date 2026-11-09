package com.kas.platform.onboarding.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.PolicyService;
import com.kas.platform.property.PolicyStatus;
import com.kas.platform.property.PropertyPolicy;
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
import java.util.UUID;

/**
 * Policy management for the Partner.
 *
 * <h2>Permission — existing, not invented</h2>
 *
 * <p>Doc 59 §4.5 has no {@code policy.manage}, and the phase brief forbids
 * inventing one. A policy is property configuration: it hangs off
 * {@code property_id}, is edited on the property, and doc 58 §8 assigns property
 * administration to <strong>{@code property.manage}</strong>. That is what is
 * used. If the business wants policy authoring separated from property
 * administration, that is a new permission and an owner decision — OQ-114.
 *
 * <h2>Route — a documented addition</h2>
 *
 * <p><strong>Doc 58 §8 has no policies row at all</strong>, so these paths are an
 * addition to the frozen contract, sitting inside the existing property tree
 * rather than opening a namespace. Like the review routes of doc 93 §7 and the
 * room gallery of doc 95 §10, <strong>this needs an approved doc 58 amendment —
 * OQ-111.</strong>
 *
 * <p>There is no DELETE. A policy version may be pinned by a reservation's
 * {@code terms_version}, so it is retired to {@code ARCHIVED} and kept readable,
 * never removed.
 */
@RestController
@RequestMapping("/api/v1/admin/properties/{propertyId}/policies")
public class PartnerPolicyController {

    private final PolicyService policies;

    public PartnerPolicyController(PolicyService policies) {
        this.policies = policies;
    }

    /** Every policy version for the property, newest first within each type. */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public List<PolicyView> list(@PathVariable UUID propertyId) {
        AuthorizationScope scope = policies.scopeForProperty(propertyId, CurrentActor.requireScope());
        return policies.listForProperty(propertyId, scope).stream()
                .map(policy -> view(policy, scope))
                .toList();
    }

    @GetMapping("/{policyId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public PolicyView get(@PathVariable UUID propertyId, @PathVariable UUID policyId) {
        AuthorizationScope scope = policies.scopeForProperty(propertyId, CurrentActor.requireScope());
        return view(policies.require(policyId, scope), scope);
    }

    /** Creates the next version as a {@code DRAFT}. The platform assigns the number. */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public PolicyView create(@PathVariable UUID propertyId,
                             @Valid @RequestBody CreatePolicyRequest request) {
        AuthorizationScope scope = policies.scopeForProperty(propertyId, CurrentActor.requireScope());
        PropertyPolicy created = policies.create(propertyId, request.type(),
                request.effectiveFrom(), CurrentActor.require().actor(), scope);
        return view(created, scope);
    }

    @PatchMapping("/{policyId}/translations")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public PolicyView describe(@PathVariable UUID propertyId, @PathVariable UUID policyId,
                               @Valid @RequestBody PolicyTranslationRequest request) {
        AuthorizationScope scope = policies.scopeForProperty(propertyId, CurrentActor.requireScope());
        return view(policies.setTranslation(policyId, request.locale(), request.summary(),
                request.body(), CurrentActor.require().actor(), scope), scope);
    }

    /**
     * Activates, pauses or archives a version.
     *
     * <p>Activation requires body text in both locales — see
     * {@code PolicyService#setStatus}.
     */
    @PatchMapping("/{policyId}/status")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public PolicyView setStatus(@PathVariable UUID propertyId, @PathVariable UUID policyId,
                                @RequestParam PolicyStatus status) {
        AuthorizationScope scope = policies.scopeForProperty(propertyId, CurrentActor.requireScope());
        return view(policies.setStatus(policyId, status,
                CurrentActor.require().actor(), scope), scope);
    }

    private PolicyView view(PropertyPolicy policy, AuthorizationScope scope) {
        return PolicyView.of(policy, policies.translationsOf(policy.id(), scope));
    }
}
