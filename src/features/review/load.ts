import { propertiesApi, submissionsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView, PropertyCompleteness } from '@/lib/domain/property';
import type { SubmissionView } from '@/lib/domain/submission';

export type QueueResult =
  | { readonly status: 'ok'; readonly submissions: readonly SubmissionView[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type ReviewResult =
  | {
      readonly status: 'ok';
      readonly submission: SubmissionView;
      /** The property under review. `null` when that read failed on its own. */
      readonly property: PropertyAdminView | null;
      readonly completeness: PropertyCompleteness | null;
      /** Every decision on this property, newest first. */
      readonly history: readonly SubmissionView[];
    }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The review queue.
 *
 * Scope-filtered in SQL, so this asks for no partner and passes no filter — what
 * comes back is what this session may review, and there is nothing here that
 * could widen it.
 */
export async function loadQueue(cookieHeader: string): Promise<QueueResult> {
  try {
    return { status: 'ok', submissions: await submissionsApi.queue(cookieHeader) };
  } catch (caught) {
    if (caught instanceof ApiError) {
      return { status: 'error', error: caught };
    }
    throw caught;
  }
}

/**
 * One submission, with everything needed to judge it.
 *
 * <h2>Four reads, and only the first one decides the page</h2>
 *
 * The submission is the page. The property, its completeness checklist and the
 * decision history are context: if any of those three fails the review can still
 * happen, so each degrades to `null` or an empty list rather than taking the
 * screen down with it. Only a failed submission read is fatal.
 *
 * <p>A malformed id never reaches the API — it is the same `notFound` a
 * cross-scope id produces, so the URL cannot be used to tell one from the other.
 */
export async function loadReview(
  submissionId: string,
  cookieHeader: string,
): Promise<ReviewResult> {
  if (!UUID_PATTERN.test(submissionId)) {
    return { status: 'notFound' };
  }

  let submission: SubmissionView;
  try {
    submission = await submissionsApi.get(submissionId, cookieHeader);
  } catch (caught) {
    if (caught instanceof ApiError) {
      return caught.status === 404 ? { status: 'notFound' } : { status: 'error', error: caught };
    }
    throw caught;
  }

  // In parallel: none of the three feeds another.
  const [property, completeness, history] = await Promise.all([
    propertiesApi.get(submission.propertyId, cookieHeader).catch(() => null),
    propertiesApi.completeness(submission.propertyId, cookieHeader).catch(() => null),
    submissionsApi.history(submission.propertyId, cookieHeader).catch(() => []),
  ]);

  return { status: 'ok', submission, property, completeness, history };
}
