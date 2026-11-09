import { landmarksApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { LandmarkView } from '@/lib/domain/landmark';
import { isPropertyId } from '@/features/property/load';

/**
 * Turns a landmark request into a state a page can render.
 *
 * Pure and transport-only, like the property, room-type, policy, media and
 * facility loaders: it takes a cookie header, calls `lib/api`, and returns a
 * discriminated union, so every branch is testable without a running server.
 */

export type LandmarkListResult =
  | { readonly status: 'ok'; readonly landmarks: readonly LandmarkView[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Every landmark of one property, in the operator's order.
 *
 * The backend already orders by `sort_order`, and nothing re-sorts by distance:
 * which landmark matters most is an editorial judgement doc 03 §5.2 leaves to
 * the hotel.
 *
 * An empty list is a **success**, and today it is the correct answer for all
 * eight seed properties.
 */
export async function loadLandmarks(
  propertyId: string,
  cookieHeader?: string,
): Promise<LandmarkListResult> {
  if (!isPropertyId(propertyId)) {
    // A malformed id cannot name a property, so it cannot have landmarks.
    return { status: 'ok', landmarks: [] };
  }
  try {
    return { status: 'ok', landmarks: await landmarksApi.list(propertyId, cookieHeader) };
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
