import { publicHotelsApi, reservationsApi } from '@/lib/api/endpoints';
import type { PortfolioFilters } from '@/lib/api/endpoints/publicHotels';
import { ApiError } from '@/lib/api/errors';
import type { RequestReceipt } from '@/lib/domain/reservationRequest';
import type {
  PublishedProperty,
  AmenityTaxonomyEntry,
  PublicFacility,
  PublicPolicy,
  PublishedPropertyDetail,
  PublishedRoomType,
  RequestRoomOption,
  PublicTripIntent,
} from '@/lib/domain/availability';

/**
 * Turns the three public reads into states a guest page can render.
 *
 * Pure and transport-only, so every branch is testable without a running server.
 * Nothing here decides whether a room is available or what it costs — the
 * frozen `available_direct()` function and `RateResolver` do both.
 */

export type PublishedPropertiesResult =
  | { readonly status: 'ok'; readonly properties: readonly PublishedProperty[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type PropertyResult =
  | { readonly status: 'ok'; readonly property: PublishedPropertyDetail }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

export type AvailabilityResult =
  | { readonly status: 'ok'; readonly rooms: readonly RequestRoomOption[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type RoomTypesResult =
  | { readonly status: 'ok'; readonly roomTypes: readonly PublishedRoomType[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type ReceiptResult =
  | { readonly status: 'ok'; readonly receipt: RequestReceipt }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

export type PoliciesResult =
  | { readonly status: 'ok'; readonly policies: readonly PublicPolicy[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type AmenityTaxonomyResult =
  | { readonly status: 'ok'; readonly amenities: readonly AmenityTaxonomyEntry[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type TripIntentsResult =
  | { readonly status: 'ok'; readonly intents: readonly PublicTripIntent[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type FacilitiesResult =
  | { readonly status: 'ok'; readonly facilities: readonly PublicFacility[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * The published portfolio.
 *
 * An **empty array is a success**, and today it is the correct answer: all eight
 * seed properties are `DRAFT`, so the public list is legitimately empty. It is
 * not an error and it is not "no hotels exist".
 */
export async function loadPublishedProperties(
  locale: string,
  filters: PortfolioFilters = {},
): Promise<PublishedPropertiesResult> {
  try {
    return { status: 'ok', properties: await publicHotelsApi.properties(locale, filters) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/** The localized, database-backed Find Your KAS groups. */
export async function loadTripIntents(locale: string): Promise<TripIntentsResult> {
  try {
    return { status: 'ok', intents: await publicHotelsApi.tripIntents(locale) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * One published property.
 *
 * **404 is the existence gate and the privacy boundary at once.** A `DRAFT` or
 * `CLOSED` property, a property of another partner, and a slug that was never
 * used are all the same answer, because the publication predicate lives inside
 * the repository's SQL. Nothing here may re-describe that as "not permitted".
 */
export async function loadProperty(slug: string, locale: string): Promise<PropertyResult> {
  try {
    return { status: 'ok', property: await publicHotelsApi.property(slug, locale) };
  } catch (error) {
    const api = asApiError(error);
    return api.isNotFound ? { status: 'notFound' } : { status: 'error', error: api };
  }
}

/**
 * Whole-stay availability for one property.
 *
 * An **empty array is a success**, and it is what a non-`OPEN` property returns
 * as well — the response deliberately does not distinguish the two. It also
 * means "nothing is sellable for these dates", which is the honest answer while
 * the seed properties have no room types, no inventory and no rates.
 */
export async function loadAvailability(
  slug: string,
  checkIn: string,
  checkOut: string,
  locale: string,
): Promise<AvailabilityResult> {
  try {
    return {
      status: 'ok',
      rooms: await publicHotelsApi.availability(slug, checkIn, checkOut, locale),
    };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/** The published room descriptions. Occupancy and dimensions; never inventory. */
export async function loadRoomTypes(slug: string, locale: string): Promise<RoomTypesResult> {
  try {
    return { status: 'ok', roomTypes: await publicHotelsApi.roomTypes(slug, locale) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * The hotel's published policies.
 *
 * An **empty array is a success**, and a common one: a property that has
 * authored no policy yet legitimately has none. The page says so rather than
 * showing a default nobody wrote.
 */
/**
 * The receipt a reference was issued.
 *
 * A **404 becomes `notFound`**, never an error page: a reference that was never
 * issued a receipt and a mistyped one are the same answer, which is what keeps a
 * reference an identifier rather than a credential (doc 85 §6.3).
 */
export async function loadReceipt(reference: string): Promise<ReceiptResult> {
  try {
    return { status: 'ok', receipt: await reservationsApi.receipt(reference) };
  } catch (caught) {
    const error = asApiError(caught);
    return error.status === 404 ? { status: 'notFound' } : { status: 'error', error };
  }
}

export async function loadPolicies(slug: string, locale: string): Promise<PoliciesResult> {
  try {
    return { status: 'ok', policies: await publicHotelsApi.policies(slug, locale) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * A hotel's facility blocks.
 *
 * An empty list is a **success**, and the common state today: no property has
 * authored a facility yet. It is also what an unpublished hotel produces, which
 * is why the page resolves the property first — a hidden hotel has already
 * produced a not-found before this is reached.
 */
/**
 * The shared amenity vocabulary — doc 58 §3.1's amenity taxonomy.
 *
 * An empty list is a success and is the answer today: the backend omits an entry
 * with no approved word in the requested locale, and the wording is still config
 * A9 / OQ-031. The portfolio filter reads that as 'no amenity control', not as a
 * failure.
 */
export async function loadAmenityTaxonomy(locale: string): Promise<AmenityTaxonomyResult> {
  try {
    return { status: 'ok', amenities: await publicHotelsApi.amenities(locale) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

export async function loadFacilities(slug: string, locale: string): Promise<FacilitiesResult> {
  try {
    return { status: 'ok', facilities: await publicHotelsApi.facilities(slug, locale) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * What a guest is told when a request fails.
 *
 * Deliberately narrower than the console's mapping. A guest is shown the
 * backend's own words **only** for the statuses whose messages are authored for
 * the caller and are safe by construction — `400` and `422`, where
 * "Check-out must be after check-in" and "Those dates are not yet open for
 * booking" are the actionable part. Everything else becomes one constant, so no
 * SQL fragment, class name, host name or configuration key can reach a public
 * page even if the backend's exception handling were to change.
 *
 * A `404` is never re-described as a permission problem: the publication
 * boundary depends on the two being indistinguishable.
 */
export function guestMessageFor(error: ApiError): string {
  if (error.status === 400 || error.isUnprocessable) {
    return error.message;
  }
  if (error.isNotFound) {
    return 'Không tìm thấy khách sạn này.';
  }
  return 'Hiện chưa thể kiểm tra phòng trống. Vui lòng thử lại sau ít phút.';
}

/**
 * Field-level messages a guest can act on, from `details[]`.
 *
 * Same restriction as above: only for `400` and `422`, whose details the backend
 * authors for the caller.
 */
export function guestFieldErrors(error: ApiError): Readonly<Record<string, string>> {
  if (error.status !== 400 && !error.isUnprocessable) {
    return {};
  }
  return error.fieldErrors();
}

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
