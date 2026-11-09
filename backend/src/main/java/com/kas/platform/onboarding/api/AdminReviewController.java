package com.kas.platform.onboarding.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.onboarding.OnboardingService;
import com.kas.platform.security.CurrentActor;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Admin review of property submissions.
 *
 * <h2>Permission — resolved from the frozen catalogue, not invented</h2>
 *
 * <p>The phase brief forbids inventing {@code property.review},
 * {@code property.approve} or {@code property.publish}. None was needed:
 * <strong>doc 58 §8 maps {@code /admin/properties[/{id}]}, {@code /publish} and
 * {@code /preview} to {@code property.manage}</strong>. Approving a submission is
 * what publishes a property, so {@code property.manage} is the permission the
 * frozen contract already assigns to that act.
 *
 * <h2>Route — a documented addition to doc 58 §8</h2>
 *
 * <p>Doc 58 §8 defines no review endpoints at all, so any path here is an
 * addition to the frozen contract. {@code /api/v1/admin/property-submissions}
 * sits inside the existing admin tree rather than opening a new namespace, and
 * avoids colliding with {@code /admin/properties/{propertyId}}. Like the staff
 * auth route in doc 91 §7, <strong>this needs an approved doc 58 amendment
 * before it can be considered frozen.</strong>
 *
 * <h2>Who reviews</h2>
 *
 * <p>Scope decides. An {@code ADMIN} holding {@code PARTNER} scope reviews their
 * own partner's submissions; a {@code GLOBAL} actor reviews across partners. In
 * V1 that means KAS reviews its own submissions — a separation-of-duties
 * question recorded as an open item in doc 93, not something this phase resolves
 * by inventing a reviewer role.
 */
@RestController
@RequestMapping("/api/v1/admin/property-submissions")
public class AdminReviewController {

    private final OnboardingService onboarding;

    public AdminReviewController(OnboardingService onboarding) {
        this.onboarding = onboarding;
    }

    /** The pending queue, oldest first, restricted to the reviewer's scope. */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public List<SubmissionView> queue() {
        return onboarding.pendingQueue(CurrentActor.requireScope()).stream()
                .map(SubmissionView::of)
                .toList();
    }

    /**
     * Opens a submission for review.
     *
     * <p>Records a {@code review_started} audit event. It does not change the
     * submission's state — see {@code SubmissionStatus} for why there is no
     * {@code UNDER_REVIEW}.
     */
    @GetMapping("/{submissionId}")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public SubmissionView detail(@PathVariable UUID submissionId) {
        return SubmissionView.of(onboarding.reviewStarted(
                submissionId, CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Approves and publishes, in one transaction. */
    @PostMapping("/{submissionId}/approve")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public SubmissionView approve(@PathVariable UUID submissionId) {
        return SubmissionView.of(onboarding.approve(
                submissionId, CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Refuses. A reason is mandatory — validated here and again by the V22 CHECK. */
    @PostMapping("/{submissionId}/reject")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public SubmissionView reject(@PathVariable UUID submissionId,
                                 @Valid @RequestBody DecisionRequest request) {
        return SubmissionView.of(onboarding.reject(submissionId, request.reason(),
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Sends back for edits. The Partner resubmits, creating a new submission. */
    @PostMapping("/{submissionId}/request-changes")
    @PreAuthorize("hasAuthority('" + Permissions.PROPERTY_MANAGE + "')")
    public SubmissionView requestChanges(@PathVariable UUID submissionId,
                                         @Valid @RequestBody DecisionRequest request) {
        return SubmissionView.of(onboarding.requestChanges(submissionId, request.reason(),
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }
}
