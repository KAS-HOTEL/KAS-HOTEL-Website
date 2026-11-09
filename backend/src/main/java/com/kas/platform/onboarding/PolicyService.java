package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.PolicyStatus;
import com.kas.platform.property.PolicyType;
import com.kas.platform.property.PropertyPolicy;
import com.kas.platform.property.PropertyPolicyRepository;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeKind;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Property policy configuration.
 *
 * <p>This is policy <strong>data</strong> only. Nothing here computes a refund,
 * a charge or a deadline — and there is nowhere for such logic to live, because
 * {@code property_policy} has no numeric columns. Commercial parameters are
 * {@code system_setting} values (doc 51 §6) and the engines that consume them
 * belong to later phases.
 */
@Service
public class PolicyService {

    private static final String ENTITY = "property_policy";

    private final PropertyPolicyRepository policies;
    private final PropertyRepository properties;
    private final AuditLogger audit;

    public PolicyService(PropertyPolicyRepository policies, PropertyRepository properties,
                         AuditLogger audit) {
        this.policies = policies;
        this.properties = properties;
        this.audit = audit;
    }

    /**
     * Everything the partner owns, shared and property-specific alike.
     *
     * <p>The canonical list behind the top-level policy module. Filtering by
     * scope is the caller's — a list that already knows which rows are shared
     * can present either view without a second round trip.
     */
    public AuthorizationScope scopeForProperty(UUID propertyId, AuthorizationScope scope) {
        var property = properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
        // Only GLOBAL is narrowed. A property-scoped actor never gains the whole partner.
        return scope.kind() == ScopeKind.GLOBAL
                ? AuthorizationScope.partner(scope.actorId(), property.partnerId()) : scope;
    }

    public List<PropertyPolicy> listForPartner(AuthorizationScope scope) {
        return policies.findByPartner(requirePartner(scope), scope);
    }

    /**
     * What applies to one hotel: its own policies, plus the partner's shared
     * ones for every type it has not overridden.
     *
     * <p>Not the same as "the policies stored against this property" — that is
     * {@link #listOverrides}. This is the resolved set, and the override rule
     * lives in the repository so no caller can implement it differently.
     */
    public List<PropertyPolicy> listForProperty(UUID propertyId, AuthorizationScope scope) {
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
        return policies.resolveForProperty(propertyId, requirePartner(scope), scope);
    }

    /** Only the rows stored against this property — its overrides, nothing inherited. */
    public List<PropertyPolicy> listOverrides(UUID propertyId, AuthorizationScope scope) {
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
        return policies.findByProperty(propertyId, scope);
    }

    public PropertyPolicy require(UUID policyId, AuthorizationScope scope) {
        return policies.findById(policyId, requirePartner(scope), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Policy"));
    }

    public Map<String, String> translations(UUID policyId, AuthorizationScope scope) {
        require(policyId, scope);
        return policies.findTranslations(policyId, requirePartner(scope), scope);
    }

    /**
     * Translations for a row already read through a scoped query — no second
     * existence check, but still behind the scope: empty when it is not the
     * caller's.
     */
    public Map<String, String> translationsOf(UUID policyId, AuthorizationScope scope) {
        return policies.findTranslations(policyId, requirePartner(scope), scope);
    }

    /**
     * Creates the next version of a policy type, as a {@code DRAFT}.
     *
     * <p>The version number is assigned by the platform, never by the caller: a
     * client-chosen version could collide with, or silently supersede, an
     * existing one. A concurrent creator racing for the same number is stopped by
     * {@code property_policy_unique}.
     */
    @Transactional
    public PropertyPolicy create(UUID propertyId, PolicyType type, LocalDate effectiveFrom,
                                 ResolvedActor actor, AuthorizationScope scope) {
        requireAuthorable(type);
        UUID partnerId = requirePartner(scope);
        // Before any policy row is read: a property outside the scope is a 404,
        // the same as one that does not exist.
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        int version = policies.nextVersion(partnerId, propertyId, type, scope);
        UUID id = policies.create(propertyId, type, version, effectiveFrom, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        audit(actor, "policy.created", id,
                Map.of("propertyId", propertyId.toString(), "type", type.name(),
                        "version", version, "scope", "PROPERTY"), scope);
        return require(id, scope);
    }

    /**
     * Creates a shared policy — one row that applies to the whole portfolio.
     *
     * <p>Deliberately <strong>not</strong> eight rows. The brief is explicit
     * that a shared policy must not be duplicated per property, and the
     * resolution query is what makes one row reach every hotel. Copying would
     * also make "edit the shared policy" an eight-row write that could half
     * succeed.
     */
    @Transactional
    public PropertyPolicy createShared(PolicyType type, LocalDate effectiveFrom,
                                       ResolvedActor actor, AuthorizationScope scope) {
        requireAuthorable(type);
        UUID partnerId = requirePartner(scope);

        int version = policies.nextVersion(partnerId, null, type, scope);
        UUID id = policies.createShared(partnerId, type, version, effectiveFrom, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Partner"));

        audit(actor, "policy.created", id,
                Map.of("type", type.name(), "version", version, "scope", "SHARED"), scope);
        return require(id, scope);
    }

    /**
     * PRIVACY, TERMS and COOKIES are platform documents, and a partner does not
     * author them at either scope.
     *
     * <p>The check predates shared policies and still holds: "shared across my
     * hotels" is a different thing from "the platform's own terms", and letting
     * a partner create the latter under the former's name would put their text
     * where the platform's belongs.
     */
    private static void requireAuthorable(PolicyType type) {
        if (type.isPropertyScoped()) {
            return;
        }
        throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                "That policy type is managed at platform level.",
                List.of(new KasException.ErrorDetail("policyType", "NOT_PROPERTY_SCOPED",
                        type.name() + " applies to the whole platform.")));
    }

    /**
     * The partner whose policies these are.
     *
     * <p>A GLOBAL actor is refused rather than silently given someone's: which
     * partner they meant is not knowable, and guessing would put one partner's
     * terms on another's hotels. The same reasoning, and the same shape, as
     * {@code MessageTemplateService.requirePartner}.
     */
    private static UUID requirePartner(AuthorizationScope scope) {
        if (scope.partnerId() == null) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    scope.kind() == ScopeKind.GLOBAL
                            ? "Policies belong to a partner; choose one to manage them."
                            : "This account is not attached to a partner.",
                    List.of());
        }
        return scope.partnerId();
    }

    @Transactional
    public PropertyPolicy setTranslation(UUID policyId, String locale, String summary, String body,
                                         ResolvedActor actor, AuthorizationScope scope) {
        require(policyId, scope);
        policies.setTranslation(policyId, requirePartner(scope), locale, summary, body, scope);
        audit(actor, "policy.translation_updated", policyId, Map.of("locale", locale), scope);
        return require(policyId, scope);
    }

    /**
     * Moves a policy version through its lifecycle.
     *
     * <p><strong>Activation requires body text in both frozen locales.</strong>
     * This is <em>PROPOSED</em>, not frozen — the schema permits a NULL body and
     * no document states the rule. It is applied because the alternative is
     * worse: an {@code ACTIVE} policy with no text publishes an empty policy to
     * guests, and doc 25's both-locale principle plus doc 62 §5's precedent
     * (alt text as a publish gate) both point the same way. The phase brief §8
     * also requires the system to "fail safely rather than pretending a missing
     * policy is complete". Recorded as OQ-113.
     *
     * <p>Retiring a policy is never a delete. A reservation may have pinned this
     * version through {@code terms_version}, so the row must remain readable.
     */
    @Transactional
    public PropertyPolicy setStatus(UUID policyId, PolicyStatus target, ResolvedActor actor,
                                    AuthorizationScope scope) {
        PropertyPolicy current = require(policyId, scope);

        if (!current.status().canTransitionTo(target)) {
            throw ConflictException.illegalTransition(
                    "policyStatus", current.status().name(), target.name());
        }
        if (target == PolicyStatus.ACTIVE && policies.bodyLocaleCount(policyId, requirePartner(scope), scope) < 2) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Policy text is required in both locales before this policy can be activated.",
                    List.of(new KasException.ErrorDetail("body", "REQUIRED",
                            "Provide policy text for 'en' and 'vi'.")));
        }

        policies.setStatus(policyId, requirePartner(scope), target, scope);
        audit(actor, "policy.status_changed", policyId,
                Map.of("from", current.status().name(), "to", target.name(),
                        "type", current.policyType().name()), scope);
        return require(policyId, scope);
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
