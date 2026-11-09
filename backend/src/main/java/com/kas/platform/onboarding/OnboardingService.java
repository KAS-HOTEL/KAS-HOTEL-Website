package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.Property;
import com.kas.platform.property.PropertyLifecycleState;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.property.RoomTypeRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The onboarding workflow. All state transitions live here, never in a controller.
 *
 * <h2>What approval does, atomically</h2>
 *
 * <p>{@link #approve} performs three writes — decide the submission, move the
 * property's lifecycle, publish its room types — inside one transaction. The
 * phase brief §13 names the failure this prevents: a submission marked
 * {@code APPROVED} while the property stayed invisible, or the reverse.
 *
 * <p>The lifecycle moves {@code DRAFT → COMING_SOON}, not {@code OPEN}. Doc 03
 * §8 makes {@code COMING_SOON} publicly listed but <strong>not bookable</strong>,
 * and that is the only honest state for a property that has passed editorial
 * review but has no inventory and no rates — neither exists until a later phase.
 * Moving to {@code OPEN} is a separate operational decision, and approval does
 * not make it. A property already past {@code DRAFT} is left where it is, so
 * re-approving an edit to a live hotel cannot demote it.
 */
@Service
public class OnboardingService {

    private static final Logger log = LoggerFactory.getLogger(OnboardingService.class);

    private static final String ENTITY = "property_submission";

    private final PropertySubmissionRepository submissions;
    private final PropertyCompletenessChecker completeness;
    private final PropertyRepository properties;
    private final RoomTypeRepository roomTypes;
    private final AuditLogger audit;

    public OnboardingService(PropertySubmissionRepository submissions,
                             PropertyCompletenessChecker completeness,
                             PropertyRepository properties,
                             RoomTypeRepository roomTypes,
                             AuditLogger audit) {
        this.submissions = submissions;
        this.completeness = completeness;
        this.properties = properties;
        this.roomTypes = roomTypes;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ partner

    /** The progress display of phase brief §18.2, and the pre-submit gate. */
    public CompletenessResult completeness(UUID propertyId, AuthorizationScope scope) {
        return completeness.check(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
    }

    public List<PropertySubmission> history(UUID propertyId, AuthorizationScope scope) {
        // Establishes existence-and-scope first, so an out-of-scope property
        // returns 404 rather than an innocuous empty list.
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
        return submissions.findHistory(propertyId, scope);
    }

    /**
     * Submits a property for review.
     *
     * @throws NotFoundException  property absent or out of scope
     * @throws KasException       {@code VALIDATION_FAILED} listing every missing field
     * @throws ConflictException  {@code ILLEGAL_TRANSITION} if one is already open
     */
    @Transactional
    public PropertySubmission submit(UUID propertyId, ResolvedActor actor,
                                     AuthorizationScope scope) {
        CompletenessResult result = completeness(propertyId, scope);

        if (!result.isComplete()) {
            // 400 VALIDATION_FAILED with field-level detail — doc 58 §2.1. The
            // Partner is told everything that is missing at once, not the first
            // thing that failed.
            List<KasException.ErrorDetail> details = result.allMissing().stream()
                    .map(field -> new KasException.ErrorDetail(field, "REQUIRED",
                            "Required before this property can be submitted."))
                    .toList();
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "This property is not yet complete enough to submit.", details);
        }

        UUID submissionId;
        try {
            submissionId = submissions.create(propertyId, actor.userId(), scope)
                    .orElseThrow(() -> NotFoundException.outOfScope("Property"));
        } catch (DuplicateKeyException alreadyOpen) {
            // The V22 partial unique index allows one open submission per
            // property, and the insert is deliberately not preceded by a read —
            // a check-then-insert leaves a window in which two concurrent
            // submits both pass the check. So the constraint is the guard, and
            // this translates it into the refusal it actually is. Without this
            // the Partner saw a 500 for pressing the button twice.
            throw ConflictException.illegalTransition(
                    "Submission", "SUBMITTED", "SUBMITTED");
        }

        audit(actor, "property.submission.submitted", submissionId,
                Map.of("propertyId", propertyId.toString()), null, scope);

        return submissions.findById(submissionId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Submission"));
    }

    // -------------------------------------------------------------------- admin

    /** The review queue, restricted to the reviewer's scope. */
    public List<PropertySubmission> pendingQueue(AuthorizationScope scope) {
        return submissions.findPending(scope);
    }

    public PropertySubmission requireSubmission(UUID submissionId, AuthorizationScope scope) {
        return submissions.findById(submissionId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Submission"));
    }

    /**
     * Records that a reviewer opened a submission.
     *
     * <p>An audit event, not a state change. See {@link SubmissionStatus} for why
     * there is no {@code UNDER_REVIEW}.
     */
    @Transactional
    public PropertySubmission reviewStarted(UUID submissionId, ResolvedActor actor,
                                            AuthorizationScope scope) {
        PropertySubmission submission = requireSubmission(submissionId, scope);
        audit(actor, "property.submission.review_started", submissionId,
                Map.of("propertyId", submission.propertyId().toString()), null, scope);
        return submission;
    }

    /** Approves and publishes, atomically. */
    @Transactional
    public PropertySubmission approve(UUID submissionId, ResolvedActor actor,
                                      AuthorizationScope scope) {
        PropertySubmission submission = decide(submissionId, SubmissionStatus.APPROVED,
                null, actor, scope);

        Property property = properties.findById(submission.propertyId(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        if (property.lifecycleState() == PropertyLifecycleState.DRAFT) {
            properties.updateLifecycle(property.id(), PropertyLifecycleState.COMING_SOON, scope);
        }
        int published = roomTypes.publishAllForProperty(property.id(), scope);

        log.info("property approved propertyId={} submissionId={} roomTypesPublished={} "
                        + "correlationId={}",
                property.id(), submissionId, published, CorrelationId.current());

        return requireSubmission(submissionId, scope);
    }

    /** Refuses. A reason is mandatory, at this layer and again in the V22 CHECK. */
    @Transactional
    public PropertySubmission reject(UUID submissionId, String reason, ResolvedActor actor,
                                     AuthorizationScope scope) {
        return decide(submissionId, SubmissionStatus.REJECTED, reason, actor, scope);
    }

    /** Sends back for edits. The Partner resubmits, which creates a new submission. */
    @Transactional
    public PropertySubmission requestChanges(UUID submissionId, String reason, ResolvedActor actor,
                                             AuthorizationScope scope) {
        return decide(submissionId, SubmissionStatus.CHANGES_REQUESTED, reason, actor, scope);
    }

    // ----------------------------------------------------------------- internal

    private PropertySubmission decide(UUID submissionId, SubmissionStatus decision, String reason,
                                      ResolvedActor actor, AuthorizationScope scope) {
        PropertySubmission current = requireSubmission(submissionId, scope);

        if (decision.requiresReason() && (reason == null || reason.isBlank())) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "A reason is required to " + decision.name().toLowerCase().replace('_', ' ') + ".",
                    List.of(new KasException.ErrorDetail("reason", "REQUIRED",
                            "Explain the decision so the Partner can act on it.")));
        }

        if (!current.status().canTransitionTo(decision)) {
            throw ConflictException.illegalTransition(
                    "submissionStatus", current.status().name(), decision.name());
        }

        // Compare-and-set in the database. If another reviewer decided first this
        // returns false, and the loser is told so rather than overwriting a
        // decision that has already published a property.
        boolean applied = submissions.decide(submissionId, decision, actor.userId(),
                reason, Instant.now(), scope);

        if (!applied) {
            throw ConflictException.illegalTransition(
                    "submissionStatus", SubmissionStatus.SUBMITTED.name(), decision.name());
        }

        audit(actor, "property.submission." + decision.name().toLowerCase(), submissionId,
                Map.of("propertyId", current.propertyId().toString()), reason, scope);

        return requireSubmission(submissionId, scope);
    }

    private void audit(ResolvedActor actor, String action, UUID entityId,
                       Map<String, Object> after, String reason, AuthorizationScope scope) {
        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), action, ENTITY, entityId,
                null, after, reason, null, null,
                CorrelationId.current(), scope.toString()));
    }

    /**
     * {@code audit_log.actor_role} is a single {@code user_role} value, so an
     * actor holding several roles is recorded at the most privileged one — that
     * is the authority the action was actually taken under.
     */
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
