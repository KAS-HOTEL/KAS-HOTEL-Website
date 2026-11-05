import { api } from '../client';
import type {
  AmenityTaxonomyEntry,
  PublicFacility,
  PublishedProperty,
  PublicPolicy,
  PublishedPropertyDetail,
  PublishedRoomType,
  RequestRoomOption,
  PublicTripIntent,
} from '@/lib/domain/availability';
import type { PublicMediaView } from '@/lib/domain/media';
import type { Quote, QuoteRequest } from '@/lib/domain/quote';

/**
 * The portfolio narrowings doc 58 §3.1 freezes and this platform can actually
 * perform. See `publicHotelsApi.properties` for why the other two are absent.
 */
export interface PortfolioFilters {
  readonly district?: string;
  /** A catalogue code, not a name. */
  readonly amenity?: string;
}

/**
 * The guest-facing endpoints — doc 58 §3, unauthenticated.
 *
 * <h2>Genuinely public</h2>
 *
 * No cookie header is forwarded from the server and none is needed: every route
 * below is annotated `@PublicEndpoint` on the backend and carries no permission.
 * Omitting the cookie is deliberate rather than incidental — it guarantees the
 * response cannot vary by who happens to be signed in, so a Partner browsing the
 * customer site sees exactly what a guest sees.
 *
 * <h2>Never cached</h2>
 *
 * `lib/api` already defaults to `cache: 'no-store'`. Doc 58 §3 says
 * "Cacheable **except availability**", and doc 15 §10 caps any future
 * availability cache at 60 seconds with eager invalidation — nothing here is
 * close to that, so nothing is cached.
 *
 * <h2>What is deliberately absent</h2>
 *
 * `GET /public/availability/search` (portfolio search, **OQ-122**) is named by doc
 * 58 §3.2 and is **not implemented on the backend** — it needs the district,
 * amenity and sort facets and a response envelope doc 58 does not define. It is
 * not wrapped here, because a typed function for a route that does not exist is
 * an invitation to call it.
 *
 * The quote **is** implemented: doc 58 §11.2 froze its response and closed OQ-123.
 */

export const publicHotelsApi = {
  /** `GET /api/v1/public/trip-intents?locale=` — editorial groups and public assignments. */
  tripIntents: (locale: string) =>
    api.get<PublicTripIntent[]>('/api/v1/public/trip-intents', { query: { locale } }),

  /**
   * `GET /api/v1/public/properties?locale=` — doc 58 §3.1, "The 8 properties".
   *
   * The published portfolio, ordered `sort_order, slug` by the repository.
   * **No page, no size, no sort and no facet** — doc 58 §3.1 defines none of
   * them, and inventing pagination for eight hotels would be inventing a
   * contract.
   *
   * `locale` is not a preference here: the query **inner-joins**
   * `property_translation` on it, so a property with no translation in the
   * requested locale is absent from the response entirely. There is no fallback
   * to another locale — see OQ-159.
   *
   * Excludes `DRAFT` and `CLOSED`; admits `OPEN`, `COMING_SOON` and
   * `TEMPORARILY_CLOSED`, whose distinction doc 03 §8 freezes and the guest
   * needs in order to understand what they are looking at.
   *
   * <h2>Two of the four frozen filters</h2>
   *
   * Doc 58 §3.1 names `district`, `character`, `amenity` and `collection`, and
   * **two of them are wired**, because only two are backed by data a Partner can
   * author.
   *
   * `collection` exists as a column V3 describes as *"OQ-009 unresolved; text
   * until the business decides. Not an invented enum"* and nothing writes it;
   * `character` has no column at all. Sending either would promise a narrowing
   * the platform cannot perform, so neither is in this signature.
   *
   * A filter that matches nothing returns **`200 []`** — "no hotel in District 7"
   * is an answer, not an error.
   */
  properties: (locale: string, filters: PortfolioFilters = {}) =>
    api.get<PublishedProperty[]>('/api/v1/public/properties', {
      query: {
        locale,
        // Omitted rather than sent empty: the backend reads a blank value as
        // "not filtering", and leaving it out says the same thing in one place.
        ...(filters.district === undefined ? {} : { district: filters.district }),
        ...(filters.amenity === undefined ? {} : { amenity: filters.amenity }),
      },
    }),

  /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  amenities: (locale: string) =>
    api.get<AmenityTaxonomyEntry[]>('/api/v1/public/amenities', { query: { locale } }),

  /**
   * `GET /api/v1/public/properties/{slug}?locale=` — doc 58 §3.1.
   *
   * **404 for anything not published.** `PublishedPropertyRepository` carries
   * `lifecycle_state IN ('OPEN','COMING_SOON','TEMPORARILY_CLOSED')` inside the
   * SQL, so a `DRAFT` or `CLOSED` property is indistinguishable from one that
   * never existed — which is the point.
   */
  property: (slug: string, locale: string) =>
    api.get<PublishedPropertyDetail>(`/api/v1/public/properties/${encodeURIComponent(slug)}`, {
      query: { locale },
    }),

  /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  roomTypes: (slug: string, locale: string) =>
    api.get<PublishedRoomType[]>(
      `/api/v1/public/properties/${encodeURIComponent(slug)}/room-types`,
      { query: { locale } },
    ),

  /**
   * `GET /api/v1/public/properties/{slug}/policies?locale=` — doc 58 §3.1,
   * *"property detail includes … policies"*.
   *
   * The current version of each policy type for a publicly visible property.
   * `PublishedPolicyRepository` carries the publication predicate in its SQL, so
   * a `DRAFT` hotel's policies are unreachable here for the same reason its page
   * is — not because of a check on this side.
   *
   * Returns **200 with an empty array** when a property has authored none, which
   * is a legitimate state and not an error: a hotel mid-onboarding has no
   * policies yet, and the page says so rather than inventing defaults.
   */
  /**
   * `GET /api/v1/public/properties/{slug}/gallery?locale=`
   *
   * The hotel's own photographs — exterior, lobby, facilities. Cover first, then
   * `display_order`. Published assets on a published property only, so nothing a
   * Partner is still drafting reaches a guest.
   */
  gallery: (slug: string, locale: string) =>
    api.get<PublicMediaView[]>(
      `/api/v1/public/properties/${encodeURIComponent(slug)}/gallery`,
      { query: { locale } },
    ),

  /**
   * `GET /api/v1/public/properties/{slug}/room-types/{roomTypeSlug}/gallery?locale=`
   *
   * One room type's photographs — the bed, the bathroom, the view. Separate from
   * the hotel gallery on purpose: `media_link.owner_type` distinguishes them, so
   * a lobby cannot illustrate a bedroom.
   *
   * Same ordering the Partner arranged: cover first, then `display_order`.
   */
  roomGallery: (slug: string, roomTypeSlug: string, locale: string) =>
    api.get<PublicMediaView[]>(
      `/api/v1/public/properties/${encodeURIComponent(slug)}/room-types/${encodeURIComponent(roomTypeSlug)}/gallery`,
      { query: { locale } },
    ),

  policies: (slug: string, locale: string) =>
    api.get<PublicPolicy[]>(
      `/api/v1/public/properties/${encodeURIComponent(slug)}/policies`,
      { query: { locale } },
    ),

  /**
   * `GET /api/v1/public/properties/{slug}/facilities?locale=` — doc 58 §3.1.
   *
   * `PublishedFacilityRepository` carries both predicates in its SQL — the
   * property must be publicly visible and the facility must not be archived — so
   * a `DRAFT` hotel's blocks are unreachable here for the same reason its page
   * is, not because of a check on this side.
   *
   * The translation join is **inner**, so a facility with no text in the
   * requested locale is omitted rather than shown as `RESTAURANT`. The guest list
   * can therefore be shorter than the Partner's, which is correct: an untranslated
   * block is one the operator has not finished writing.
   *
   * Returns **200 with an empty array** for a hotel that has authored none —
   * a legitimate mid-onboarding state, not an error.
   */
  facilities: (slug: string, locale: string) =>
    api.get<PublicFacility[]>(
      `/api/v1/public/properties/${encodeURIComponent(slug)}/facilities`,
      { query: { locale } },
    ),

  /** Request descriptions and price estimates only; hotel staff checks rooms manually (decision 153). */
  availability: (slug: string, checkIn: string, checkOut: string, locale: string) =>
    api.get<RequestRoomOption[]>(
      `/api/v1/public/request-pricing/properties/${encodeURIComponent(slug)}`,
      { query: { checkIn, checkOut, locale } },
    ),
/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  quote: (body: QuoteRequest, locale: string) =>
    api.post<Quote>('/api/v1/public/request-pricing/quote', body, { query: { locale } }),
} as const;
