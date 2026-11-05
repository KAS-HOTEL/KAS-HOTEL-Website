import { amenitiesApi, roomTypesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { AmenityCatalogEntry, RoomTypeView } from '@/lib/domain/roomType';
import { isPropertyId } from '@/features/property/load';

/**
 * Turns a room-type request into a state a page can render.
 *
 * Pure and transport-only, like the property loaders: it takes a cookie header,
 * calls `lib/api`, and returns a discriminated union. Nothing here reaches for
 * `next/headers`, which is what makes every branch — including the isolation
 * ones — testable without a running server.
 */

export type RoomTypeListResult =
  | { readonly status: 'ok'; readonly roomTypes: readonly RoomTypeView[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type RoomTypeDetailResult =
  | { readonly status: 'ok'; readonly roomType: RoomTypeView }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Every room type of one property.
 *
 * An empty list is a **success**, and for every one of the eight seed properties
 * it is today's correct answer. It is also what a property outside the caller's
 * scope returns, which is deliberate: the two are indistinguishable, so the list
 * discloses nothing about properties the caller may not know exist. The page
 * still resolves the property first, so a foreign id has already produced a 404
 * before this is reached.
 */
export async function loadRoomTypes(
  propertyId: string,
  cookieHeader?: string,
): Promise<RoomTypeListResult> {
  if (!isPropertyId(propertyId)) {
    // A malformed id cannot name a property, so it cannot have rooms. Answered
    // without a round-trip; the backend would return 400 for an unparseable path
    // variable, which is not a state this screen should render.
    return { status: 'ok', roomTypes: [] };
  }
  try {
    return { status: 'ok', roomTypes: await roomTypesApi.list(propertyId, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * One room type.
 *
 * A malformed id, an id that names nothing, and an id that names **another
 * partner's room type** all return `notFound`. Doc 85 §6.3 has the backend answer
 * 404 rather than 403 for the third case so the existence of another partner's
 * records is never disclosed — and that matters more here than it did for
 * properties, because a room type now carries a name a person would recognise.
 *
 * A 403 is deliberately **not** mapped to not-found: it means the account lacks
 * `roomtype.manage`, which is a real misconfiguration and a different problem
 * from a missing room.
 */
export async function loadRoomTypeDetail(
  propertyId: string,
  roomTypeId: string,
  cookieHeader?: string,
): Promise<RoomTypeDetailResult> {
  if (!isPropertyId(propertyId) || !isPropertyId(roomTypeId)) {
    return { status: 'notFound' };
  }
  try {
    return { status: 'ok', roomType: await roomTypesApi.get(propertyId, roomTypeId, cookieHeader) };
  } catch (error) {
    const apiError = asApiError(error);
    return apiError.isNotFound ? { status: 'notFound' } : { status: 'error', error: apiError };
  }
}

/**
 * Anything that is not already an `ApiError` becomes one, so callers have a
 * single type. Status `0` because there was no response — it is not a 500, and
 * pretending it was would send the user looking for a correlation id that never
 * existed.
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

export type AmenityCatalogResult =
  | { readonly status: 'ok'; readonly amenities: readonly AmenityCatalogEntry[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * The selectable amenity catalogue.
 *
 * A failure is returned rather than thrown so the form can still render: a
 * Partner who cannot load the catalogue can still fix a name or an occupancy,
 * and the amenity section says why it is unavailable instead of taking the whole
 * screen down.
 */
export async function loadAmenityCatalog(cookieHeader?: string): Promise<AmenityCatalogResult> {
  try {
    return { status: 'ok', amenities: await amenitiesApi.list(cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}
