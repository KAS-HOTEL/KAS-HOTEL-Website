import { facilitiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { facilityOrder, type FacilityView } from '@/lib/domain/facility';
import { isPropertyId } from '@/features/property/load';

/**
 * Turns a facility request into a state a page can render.
 *
 * Pure and transport-only, like the property, room-type, policy and media
 * loaders: it takes a cookie header, calls `lib/api`, and returns a discriminated
 * union, so every branch is testable without a running server.
 */

export type FacilityListResult =
  | { readonly status: 'ok'; readonly facilities: readonly FacilityView[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Every facility of one property, live ones first.
 *
 * An empty list is a **success**, and today it is the correct answer for all
 * eight seed properties. It is also what a property outside the caller's scope
 * produces, which is why the page resolves the property first: a foreign id has
 * already produced a 404 before this is reached.
 */
export async function loadFacilities(
  propertyId: string,
  cookieHeader?: string,
): Promise<FacilityListResult> {
  if (!isPropertyId(propertyId)) {
    // A malformed id cannot name a property, so it cannot have facilities.
    return { status: 'ok', facilities: [] };
  }
  try {
    return {
      status: 'ok',
      facilities: facilityOrder(await facilitiesApi.list(propertyId, cookieHeader)),
    };
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
