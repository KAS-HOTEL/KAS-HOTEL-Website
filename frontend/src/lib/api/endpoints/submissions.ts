import { api } from '../client';
import type { SubmissionView } from '@/lib/domain/submission';

/**
 * Property review — `/api/v1/admin/property-submissions`.
 *
 * <h2>Scope decides who reviews, not a separate permission</h2>
 *
 * Every route here carries `property.manage`, the same authority the Partner
 * uses to edit a property. `AdminReviewController` says why: the frozen
 * permission catalogue has no `property.review`, and inventing one was out of
 * bounds — approving a submission *is* publishing a property, which
 * `property.manage` already covers. Separation is by `AuthorizationScope`: a
 * GLOBAL actor reviews across partners, a PARTNER-scoped one sees only its own.
 * That V1 actors can review their own submissions is a recorded open item
 * (doc 93), not something this client resolves.
 *
 * <h2>A reason is mandatory on two of the three</h2>
 *
 * `reject` and `requestChanges` both require one — `@NotBlank` on
 * `DecisionRequest`, and again as a CHECK on `property_submission` in V22. It is
 * a required argument here rather than an optional field so a caller cannot
 * forget it and discover the constraint as a 400.
 */
const BASE = '/api/v1/admin/property-submissions';

export const submissionsApi = {
  /**
   * `GET /api/v1/admin/property-submissions`
   *
   * Submissions awaiting review, oldest first, restricted to the reviewer's
   * scope by SQL. Never paginated — the endpoint takes no page parameters.
   */
  queue: (cookieHeader?: string) =>
    api.get<SubmissionView[]>(BASE, cookieHeader === undefined ? {} : { cookieHeader }),

  /**
   * `GET /api/v1/admin/properties/{propertyId}/submissions` — the decision
   * history for one property, newest first.
   *
   * It lives on this client rather than `propertiesApi`, which documents the
   * route as deliberately unwrapped: a typed `submissions()` beside `update()`
   * was an invitation for the Partner screens to call it. Review is the caller
   * that actually needs it, so it is wrapped here, where it reads as part of the
   * review workflow rather than as part of property editing.
   */
  history: (propertyId: string, cookieHeader?: string) =>
    api.get<SubmissionView[]>(
      `/api/v1/admin/properties/${encodeURIComponent(propertyId)}/submissions`,
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /**
   * `POST /api/v1/admin/properties/{propertyId}/submit` — the Partner sends a
   * property for review. Answers `201` with the new submission.
   *
   * <h2>Refusals are the product, not noise</h2>
   *
   * A `400` lists every unmet checklist item at once, as `details[]` naming the
   * fields — the same list `GET /completeness` returns, because the endpoint
   * gates on that check. A `409` means a submission for this property is
   * already open. Neither is retryable by clicking again, and the caller is
   * expected to show both rather than collapse them into "something went wrong".
   */
  submit: (propertyId: string) =>
    api.post<SubmissionView>(
      `/api/v1/admin/properties/${encodeURIComponent(propertyId)}/submit`,
      {},
    ),

  /** `GET /api/v1/admin/property-submissions/{id}` — out of scope reads as 404. */
  get: (submissionId: string, cookieHeader?: string) =>
    api.get<SubmissionView>(
      `${BASE}/${encodeURIComponent(submissionId)}`,
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /**
   * `POST …/{id}/approve`
   *
   * Approves *and* publishes, in one transaction: the property moves
   * `DRAFT → COMING_SOON` and every room type is published with it. A
   * `COMING_SOON` property is publicly listed and not yet bookable — the
   * Partner's own publish step is what makes it sellable.
   *
   * The write is a compare-and-set on `status = 'SUBMITTED'`, so a second
   * decision on the same submission comes back **409**, not a silent overwrite.
   */
  approve: (submissionId: string) =>
    api.post<SubmissionView>(`${BASE}/${encodeURIComponent(submissionId)}/approve`, {}),

  /** `POST …/{id}/reject` — refused outright. The reason is shown to the Partner. */
  reject: (submissionId: string, reason: string) =>
    api.post<SubmissionView>(`${BASE}/${encodeURIComponent(submissionId)}/reject`, { reason }),

  /** `POST …/{id}/request-changes` — sent back; the Partner resubmits as a new row. */
  requestChanges: (submissionId: string, reason: string) =>
    api.post<SubmissionView>(`${BASE}/${encodeURIComponent(submissionId)}/request-changes`, {
      reason,
    }),
};
