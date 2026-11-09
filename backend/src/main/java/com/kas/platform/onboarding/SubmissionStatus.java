package com.kas.platform.onboarding;

import java.util.Set;

/**
 * Matches the PostgreSQL enum {@code kas.property_submission_status} created by
 * V22. Four values, and no more.
 *
 * <p><strong>{@code UNDER_REVIEW} is deliberately absent.</strong> The Phase 7.5
 * continuation brief sketches it in a conceptual flow, but the brief also says
 * not to invent states, and V22 froze these four. Adding a fifth would mean
 * altering an applied enum for a state that carries no data: an Admin opening a
 * submission changes nothing about it, and nothing in the workflow branches on
 * whether it has been looked at.
 *
 * <p>"Review started" is therefore recorded as an <em>audit event</em>, which
 * preserves the information — who opened what, and when — without a state that
 * could get stuck. A submission left in {@code UNDER_REVIEW} by an Admin who
 * closed their laptop would block the Partner with no way out.
 */
public enum SubmissionStatus {

    /** Awaiting review. The only open state; at most one per property (V22 index). */
    SUBMITTED,

    /** Reviewed and accepted. The property was published in the same transaction. */
    APPROVED,

    /** Reviewed and refused. Requires a reason (V22 CHECK). */
    REJECTED,

    /** Sent back for edits. Requires a reason. The Partner resubmits as a new row. */
    CHANGES_REQUESTED;

    /** The decisions an open submission may move to. */
    private static final Set<SubmissionStatus> DECISIONS =
            Set.of(APPROVED, REJECTED, CHANGES_REQUESTED);

    public boolean isOpen() {
        return this == SUBMITTED;
    }

    /**
     * Whether this submission may move to {@code target}.
     *
     * <p>Only {@code SUBMITTED} may transition, and only to a decision. Every
     * decision is terminal <em>for that row</em>: an approved submission can
     * never become rejected, and a rejected one can never become approved.
     * A Partner who wants another outcome submits again, which creates a new row
     * and leaves the original decision in the history.
     */
    public boolean canTransitionTo(SubmissionStatus target) {
        return this == SUBMITTED && DECISIONS.contains(target);
    }

    /** Doc 92 / V22: a refusal must explain itself. */
    public boolean requiresReason() {
        return this == REJECTED || this == CHANGES_REQUESTED;
    }
}
