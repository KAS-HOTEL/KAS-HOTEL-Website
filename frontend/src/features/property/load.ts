import { propertiesApi, submissionsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView, PropertyCompleteness } from '@/lib/domain/property';
import type { SubmissionView } from '@/lib/domain/submission';

/**
 * Turns a property request into a state a page can render.
 *
 * Pure and transport-only: it takes a cookie header, calls `lib/api`, and
 * returns a discriminated union. Nothing here reaches for `next/headers`, which
 * is what makes every branch below — including the two that matter for security
 * — testable without a running server. The Next-bound wrappers live in
 * `server.ts`.
 */

export type PropertyListResult =
  | { readonly status: 'ok'; readonly properties: readonly PropertyAdminView[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type PropertyDetailResult =
  | {
      readonly status: 'ok';
      readonly property: PropertyAdminView;
      /** `null` when the completeness call failed — the page still renders. */
      readonly completeness: PropertyCompleteness | null;
      /**
       * Review history, newest first. `null` when that call failed, which is a
       * different statement from `[]` — "never submitted" is a fact the submit
       * panel acts on, "we could not ask" is not.
       */
      readonly history: readonly SubmissionView[] | null;
    }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * A syntactically valid property id.
 *
 * The backend's `@PathVariable UUID` rejects anything else with **400
 * `VALIDATION_FAILED`**, not 404 — verified in `GlobalExceptionHandler`. A URL
 * that cannot name any property is a not-found URL from the user's point of
 * view, so it is answered here rather than spending a round-trip to be told the
 * path parameter was unreadable.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPropertyId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Every property the session's scope reaches. The count is whatever it is. */
export async function loadPropertyList(cookieHeader?: string): Promise<PropertyListResult> {
  try {
    return { status: 'ok', properties: await propertiesApi.list(cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * One property, plus its onboarding completeness.
 *
 * <h2>Three different failures, one answer</h2>
 *
 * A malformed id, an id that names nothing, and an id that names **another
 * partner's hotel** all return `notFound`. That is not a simplification: doc 85
 * §6.3 has the backend answer 404 rather than 403 for a cross-partner read
 * precisely so the existence of another partner's records is never disclosed,
 * and a frontend that distinguished the cases — a different message, a different
 * layout, even a different page title — would hand back the fact the backend
 * spent a scope-filtered query hiding.
 *
 * <h2>Completeness is best-effort</h2>
 *
 * The property has already loaded by the time it is asked for, so a failure
 * there is a degraded section, not a dead page. It is deliberately not allowed
 * to turn a found property into a not-found one.
 */
export async function loadPropertyDetail(
  propertyId: string,
  cookieHeader?: string,
): Promise<PropertyDetailResult> {
  if (!isPropertyId(propertyId)) {
    return { status: 'notFound' };
  }

  let property: PropertyAdminView;
  try {
    property = await propertiesApi.get(propertyId, cookieHeader);
  } catch (error) {
    const apiError = asApiError(error);
    return apiError.isNotFound ? { status: 'notFound' } : { status: 'error', error: apiError };
  }

  // Both are supporting reads: the property itself already resolved, and
  // neither of these should be able to blank a page that has its subject. They
  // are fetched together because they are independent — waterfalling them would
  // add a round trip for nothing.
  const [completeness, history] = await Promise.all([
    propertiesApi.completeness(propertyId, cookieHeader).catch(() => null),
    submissionsApi.history(propertyId, cookieHeader).catch(() => null),
  ]);

  return { status: 'ok', property, completeness, history };
}

/**
 * Anything that is not already an `ApiError` — a DNS failure, a refused
 * connection, an aborted request — becomes one, so callers have a single type.
 *
 * Status `0` because there was no response: it is not a 500, and pretending it
 * was would send the user looking for a correlation id that never existed.
 */
function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(0, {
    code: 'INTERNAL_ERROR',
    message: 'The service could not be reached.',
    details: [],
    correlationId: null,
  });
}
