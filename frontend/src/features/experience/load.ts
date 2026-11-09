import { experiencesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { ExperienceView } from '@/lib/domain/experience';
import { isPropertyId } from '@/features/property/load';

/**
 * Turns an experience request into a state a page can render.
 *
 * Pure and transport-only, like the property, room-type, policy, media, facility
 * and landmark loaders: it takes a cookie header, calls `lib/api`, and returns a
 * discriminated union, so every branch is testable without a running server.
 */

export type ExperienceListResult =
  | { readonly status: 'ok'; readonly experiences: readonly ExperienceView[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Every signature experience of one property, in the operator's order.
 *
 * The backend already orders by `sort_order`, and nothing re-sorts here: which
 * experience leads is an editorial judgement, and doc 67 §1 calls these "named,
 * unique to this property" rather than a ranked list.
 *
 * An empty list is a **success** — and it is the state that keeps a property
 * unpublishable, which is why the panel says so rather than showing nothing.
 */
export async function loadExperiences(
  propertyId: string,
  cookieHeader?: string,
): Promise<ExperienceListResult> {
  if (!isPropertyId(propertyId)) {
    // A malformed id cannot name a property, so it cannot have experiences.
    return { status: 'ok', experiences: [] };
  }
  try {
    return { status: 'ok', experiences: await experiencesApi.list(propertyId, cookieHeader) };
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
