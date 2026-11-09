package com.kas.platform.onboarding.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.PolicyService;
import com.kas.platform.property.PropertyPolicy;
import com.kas.platform.property.PolicyStatus;
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

/** Shared and property policies, with an explicit hotel context for GLOBAL administrators. */
@RestController
@RequestMapping("/api/v1/admin/policies")
@PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
public class PartnerPolicyModuleController {
    private final PolicyService policies;
    public PartnerPolicyModuleController(PolicyService policies) { this.policies = policies; }

    private AuthorizationScope scope(UUID contextPropertyId) {
        return contextPropertyId == null ? CurrentActor.requireScope()
                : policies.scopeForProperty(contextPropertyId, CurrentActor.requireScope());
    }
    @GetMapping
    public List<PolicyView> list(@RequestParam(required = false) UUID contextPropertyId) {
        AuthorizationScope scope = scope(contextPropertyId);
        return policies.listForPartner(scope).stream().map(policy -> view(policy, scope)).toList();
    }
    @GetMapping("/{policyId}")
    public PolicyView get(@PathVariable UUID policyId, @RequestParam(required = false) UUID contextPropertyId) {
        AuthorizationScope scope = scope(contextPropertyId);
        return view(policies.require(policyId, scope), scope);
    }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PolicyView create(@Valid @RequestBody CreateScopedPolicyRequest request,
                             @RequestParam(required = false) UUID contextPropertyId) {
        AuthorizationScope scope = scope(contextPropertyId);
        var actor = CurrentActor.require().actor();
        PropertyPolicy created = request.propertyId() == null
                ? policies.createShared(request.type(), request.effectiveFrom(), actor, scope)
                : policies.create(request.propertyId(), request.type(), request.effectiveFrom(), actor, scope);
        return view(created, scope);
    }
    @PatchMapping("/{policyId}/translations")
    public PolicyView describe(@PathVariable UUID policyId, @Valid @RequestBody PolicyTranslationRequest request,
                               @RequestParam(required = false) UUID contextPropertyId) {
        AuthorizationScope scope = scope(contextPropertyId);
        return view(policies.setTranslation(policyId, request.locale(), request.summary(), request.body(),
                CurrentActor.require().actor(), scope), scope);
    }
    @PatchMapping("/{policyId}/status")
    public PolicyView setStatus(@PathVariable UUID policyId, @RequestParam PolicyStatus status,
                               @RequestParam(required = false) UUID contextPropertyId) {
        AuthorizationScope scope = scope(contextPropertyId);
        return view(policies.setStatus(policyId, status, CurrentActor.require().actor(), scope), scope);
    }
    private PolicyView view(PropertyPolicy policy, AuthorizationScope scope) {
        return PolicyView.of(policy, policies.translationsOf(policy.id(), scope));
    }
}
