package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.Property;
import com.kas.platform.property.PropertyLifecycleState;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.property.RoomTypeRepository;
import com.kas.platform.property.PublishedPropertyRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.CorrelationId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Publishing a property — the operational act that makes a hotel bookable.
 *
 * <h2>What publishing is, and is not</h2>
 *
 * <p>It is <strong>not</strong> what makes a property visible. Doc 03 §8 already
 * lists {@code COMING_SOON} publicly, and {@code PublishedPropertyRepository}
 * admits it. Publishing does exactly one thing: it moves the property to
 * {@code OPEN}, which is the only state
 * {@code PublishedAvailabilityRepository}, {@code PublishedRateRepository} and
 * {@code PublicAllocationRepository} will quote against.
 *
 * <p>Doc 93 §4 separated the two gates deliberately — approval is the editorial
 * decision and reaches {@code COMING_SOON}; <em>"moving to {@code OPEN} is a
 * separate operational decision"</em>. This is that decision, made explicit.
 *
 * <h2>Inventory and rates are not preconditions — OQ-101, ruled</h2>
 *
 * <p>The owner ruled that inventory and rates are <strong>business inputs for
 * sellability, not conditions of the lifecycle</strong>. Doc 99 §20 had already
 * framed them that way: <em>"still required before anything is sellable —
 * business inputs, not engineering"</em>. So an {@code OPEN} hotel with no
 * inventory is valid and simply returns an empty availability result, which the
 * guest surface already renders correctly.
 *
 * <p><strong>No inventory or rate check appears below, and none should be
 * added.</strong>
 *
 * <h2>The gate is the one that already existed</h2>
 *
 * <p>{@link PropertyCompletenessChecker} implements doc 52 §3.1's invariants and
 * doc 23 §12's publish checklist — hero image, signature line, both-locale
 * descriptions, address, a published room type and a signature experience. It is
 * reused verbatim rather than restated, so the publish gate and the submit gate
 * cannot drift apart.
 */
@Service
public class PropertyPublicationService {

    private static final Logger log = LoggerFactory.getLogger(PropertyPublicationService.class);

    private static final String ENTITY = "property";

    /**
     * The states a property may be published from.
     *
     * <h2>The open point is now closed — the owner ruled</h2>
     *
     * <p>This constant used to hold {@code COMING_SOON} alone, and said so:
     * <em>"No document states whether a {@code DRAFT} property that already
     * satisfies the whole checklist may be published directly, skipping review.
     * This constant is the single place that answer lives."</em>
     *
     * <p>The V1 product decision has now been taken. There is <strong>one
     * partner operational scope</strong> running the whole portfolio, and Admin
     * is not part of the V1 flow, so requiring an approval before a hotel can go
     * live meant requiring the operator to approve their own submission through
     * a second console. That is ceremony, not a control. A Partner may therefore
     * take a complete hotel live directly.
     *
     * <p><strong>What did not change.</strong> Nothing about the chain itself:
     * {@code DRAFT → COMING_SOON → OPEN} is still the lifecycle, approval still
     * reaches {@code COMING_SOON}, and that path still works unchanged. Only the
     * requirement to walk through it was removed. Every readiness gate below —
     * the doc 52 §3.1 checklist, a published room type, a distinct signature
     * line, the version guard — is untouched and still decides whether a hotel
     * is fit to be seen.
     */
    private static final List<PropertyLifecycleState> PUBLISHABLE_FROM =
            List.of(PropertyLifecycleState.DRAFT, PropertyLifecycleState.COMING_SOON);

    private final PropertyRepository properties;
    private final RoomTypeRepository roomTypes;
    private final PublishedPropertyRepository published;
    private final PropertyCompletenessChecker completeness;
    private final AuditLogger audit;

    public PropertyPublicationService(PropertyRepository properties,
                                      RoomTypeRepository roomTypes,
                                      PublishedPropertyRepository published,
                                      PropertyCompletenessChecker completeness,
                                      AuditLogger audit) {
        this.properties = properties;
        this.roomTypes = roomTypes;
        this.published = published;
        this.completeness = completeness;
        this.audit = audit;
    }

    /**
     * Moves a property to {@code OPEN}.
     *
     * <h2>Order of checks, and why</h2>
     *
     * <ol>
     *   <li><strong>Existence and scope.</strong> Absent or another partner's →
     *       {@code 404}, doc 85 §6.3. First, so nothing after it can distinguish
     *       a property that is not yours from one that is not ready.</li>
     *   <li><strong>Source state.</strong> {@code 409 ILLEGAL_TRANSITION},
     *       naming the states, exactly as the sales lifecycle reports its own.</li>
     *   <li><strong>Completeness.</strong> {@code 400 VALIDATION_FAILED} listing
     *       <em>every</em> missing field, the same courtesy {@code submit}
     *       extends.</li>
     *   <li><strong>Signature-line uniqueness.</strong> After completeness,
     *       because a property with no signature line has a missing field rather
     *       than a duplicate one.</li>
     *   <li><strong>The write, version-guarded.</strong> A stale version is
     *       {@code 409 VERSION_CONFLICT} and changes nothing.</li>
     * </ol>
     *
     * <p>Every failure above throws, and the method is {@code @Transactional}, so
     * a refused publish leaves the lifecycle exactly as it found it.
     *
     * @throws NotFoundException absent, or outside {@code scope}
     * @throws ConflictException wrong source state, or a stale version
     * @throws KasException      {@code VALIDATION_FAILED} for an incomplete
     *                           property or a duplicate signature line
     */
    @Transactional
    public Property publish(UUID propertyId, int expectedVersion, ResolvedActor actor,
                            AuthorizationScope scope) {

        Property property = properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        if (!PUBLISHABLE_FROM.contains(property.lifecycleState())) {
            throw ConflictException.illegalTransition("lifecycleState",
                    property.lifecycleState().name(), PropertyLifecycleState.OPEN.name());
        }

        requireComplete(propertyId, scope);
        requireBranchCode(propertyId, scope);

        /*
          Publishing from DRAFT publishes the rooms with it.

          Approval is what normally moves a room type out of DRAFT — it calls
          the very same `publishAllForProperty` — and `RoomTypeStatus`
          deliberately refuses to let a Partner set PUBLISHED one room at a
          time. Both of those remain true. But with approval no longer on the
          path, a DRAFT property would have hit `requirePublishedRoomType`
          below with every room still DRAFT and no legal way to change that:
          the transition would have been permitted and permanently
          unreachable.

          So the act that publishes a property publishes its rooms, which is
          exactly the invariant approval already maintained. Only from DRAFT:
          a COMING_SOON property has been approved, its rooms were published
          then, and quietly publishing any room added since would widen what
          is public beyond what this transition is being asked to do.
        */
        if (property.lifecycleState() == PropertyLifecycleState.DRAFT) {
            int rooms = roomTypes.publishAllForProperty(propertyId, scope);
            log.info("room types published with property propertyId={} count={} correlationId={}",
                    propertyId, rooms, CorrelationId.current());
        }

        requirePublishedRoomType(propertyId, scope);
        requireDistinctSignatureLine(propertyId);

        if (!properties.updateLifecycle(propertyId, PropertyLifecycleState.OPEN,
                expectedVersion, scope)) {
            // Existence and scope are already established, so a miss here is the
            // version and nothing else.
            throw ConflictException.versionConflict("Property");
        }

        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), "property.published", ENTITY, propertyId,
                Map.of("lifecycleState", property.lifecycleState().name()),
                Map.of("lifecycleState", PropertyLifecycleState.OPEN.name()),
                null, null, null,
                CorrelationId.current(), scope.toString()));

        return properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    /**
     * Doc 52 §3.1's remaining invariant — <em>"≥1 <strong>published</strong>
     * room type"</em>.
     *
     * <h2>Why here and not in the completeness check</h2>
     *
     * <p>{@link PropertyCompletenessChecker} counts room types that merely exist,
     * and it must: room types are published by <em>approval</em>
     * ({@code publishAllForProperty}), and approval is what a completed property
     * is submitted for. Requiring published rooms to submit would deadlock —
     * nothing could be submitted until it had been approved.
     *
     * <p>Doc 52 §3.1 words the rule as a condition of being <em>publishable</em>,
     * so it belongs to this transition and only this one. Step 16A.32 found the
     * hole it closes: {@code /publish} could take a property to {@code OPEN}
     * while every room stayed {@code DRAFT}, and an {@code OPEN} hotel whose
     * rooms are all draft shows nothing and sells nothing — availability and
     * rates both require {@code rt.status = 'PUBLISHED'}.
     */
    private void requirePublishedRoomType(UUID propertyId, AuthorizationScope scope) {
        if (roomTypes.countPublished(propertyId, scope) > 0) {
            return;
        }
        throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                "This property is not yet complete enough to publish.",
                List.of(new KasException.ErrorDetail("at least one published room type",
                        "REQUIRED",
                        "Room types are published when the property's submission is approved.")));
    }

    /**
     * BUG-002: an OPEN hotel with no branch code is listed but refuses every booking
     * request ({@code ReservationReference}). Creation assigns one, so this only fires
     * when codes 01-99 are all taken; it fails here, in the console, not at the guest.
     */
    private void requireBranchCode(UUID propertyId, AuthorizationScope scope) {
        if (properties.hasBranchCode(propertyId, scope)) {
            return;
        }
        throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                "This property is not yet complete enough to publish.",
                List.of(new KasException.ErrorDetail("branchCode", "REQUIRED",
                        "The property has no two-digit branch code, so it could not take bookings.")));
    }

    /** The checklist doc 52 §3.1 and doc 23 §12 freeze, unchanged and unduplicated. */
    private void requireComplete(UUID propertyId, AuthorizationScope scope) {
        CompletenessResult result = completeness.check(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        if (!result.isComplete()) {
            List<KasException.ErrorDetail> details = result.allMissing().stream()
                    .map(field -> new KasException.ErrorDetail(field, "REQUIRED",
                            "Required before this property can be published."))
                    .toList();
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "This property is not yet complete enough to publish.", details);
        }
    }

    /**
     * Doc 52 §3.1 — <em>"{@code signatureLine} unique across published
     * properties"</em>.
     *
     * <p>The error names the caller's own locale and says nothing about the
     * property it collided with: a uniqueness check must not become a way to read
     * another partner's editorial text.
     */
    private void requireDistinctSignatureLine(UUID propertyId) {
        List<String> conflicts = published.conflictingSignatureLocales(propertyId);
        if (conflicts.isEmpty()) {
            return;
        }
        throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                "Another published property already uses this signature line.",
                conflicts.stream()
                        .map(locale -> new KasException.ErrorDetail(
                                "signatureLines." + locale, "DUPLICATE",
                                "Give this property a signature line of its own."))
                        .toList());
    }

    /** {@code audit_log.actor_role} is one value — the same reduction OnboardingService makes. */
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
