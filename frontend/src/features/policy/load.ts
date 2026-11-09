import { policiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { PolicyView } from '@/lib/domain/policy';
import { isPropertyId } from '@/features/property/load';

/**
 * Turns a policy request into a state a page can render.
 *
 * Pure and transport-only, like the property and room-type loaders: it takes a
 * cookie header, calls `lib/api`, and returns a discriminated union, so every
 * branch is testable without a running server.
 */

export type PolicyListResult =
  | { readonly status: 'ok'; readonly policies: readonly PolicyView[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Every policy version of one property.
 *
 * An empty list is a **success** — and today it is the correct answer for all
 * eight seed properties, none of which has a policy. It is also what a property
 * outside the caller's scope would produce, which is why the page resolves the
 * property first: a foreign id has already produced a 404 before this is reached.
 */
export async function loadPolicies(
  propertyId: string,
  cookieHeader?: string,
): Promise<PolicyListResult> {
  if (!isPropertyId(propertyId)) {
    // A malformed id cannot name a property, so it cannot have policies.
    return { status: 'ok', policies: [] };
  }
  try {
    return { status: 'ok', policies: await policiesApi.list(propertyId, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * Anything that is not already an `ApiError` becomes one. Status `0` because
 * there was no response — it is not a 500, and pretending it was would send the
 * user looking for a correlation id that never existed.
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
