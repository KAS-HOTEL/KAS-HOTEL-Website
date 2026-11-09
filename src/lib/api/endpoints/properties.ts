import { api } from '../client';
import type {
  CreatePropertyRequest,
  PropertyAdminView,
  PropertyCompleteness,
  PublishPropertyRequest,
  UpdatePropertyRequest,
} from '@/lib/domain/property';

/**
 * Property endpoints — verified against `onboarding.api.PartnerPropertyController`.
 *
 * <h2>One API, two consoles</h2>
 *
 * There is no `/api/v1/partner/**` tree. Admin and Partner call the same
 * `/api/v1/admin/properties` handlers; what differs is the caller's
 * {@code AuthorizationScope}, which `PropertyRepository` folds into the SQL
 * `WHERE` clause. A PARTNER-scoped session therefore receives exactly its own
 * estate from `list()` with no filter argument to pass and none to forget.
 *
 * <h2>What is still absent</h2>
 *
 * `POST /{id}/submit` and `{id}/submissions` are wrapped, but on
 * `submissionsApi`: sending a property for review is part of the review
 * workflow rather than part of editing one, and keeping them together means a
 * screen that submits also has the history that says whether it already did.
 */

const BASE = '/api/v1/admin/properties';

export const propertiesApi = {
  /**
   * `GET /api/v1/admin/properties` — every property in the caller's scope, in
   * the backend's own order (`sort_order`, then `slug`).
   *
   * Permission `property.manage`. Never paginated: no endpoint in the API takes
   * `page` or `size`, so there is no envelope to unwrap.
   */
  list: (cookieHeader?: string) =>
    api.get<PropertyAdminView[]>(BASE, cookieHeader === undefined ? {} : { cookieHeader }),

  /**
   * `POST /api/v1/admin/properties` — creates a `DRAFT` property.
   *
   * <h2>The body carries no partner</h2>
   *
   * Ownership comes from the caller's own `AuthorizationScope` on the server, so
   * there is no field here that could name someone else's organisation. That is
   * not a convention this wrapper upholds — `CreatePropertyRequest` has no
   * `partnerId` to send, and `PartnerPropertyController` refuses a caller whose
   * scope has no partner at all.
   *
   * <h2>Draft, not published</h2>
   *
   * The row is born `DRAFT` with a `sort_order` one past the partner's current
   * highest. Nothing about creating a property makes it visible to a guest:
   * review and publication remain the separate steps they already were.
   *
   * @returns the created property, including the `version` a follow-up
   *          {@link update} needs
   */
  create: (body: CreatePropertyRequest) => api.post<PropertyAdminView>(BASE, body),

  /**
   * `GET /api/v1/admin/properties/{id}`
   *
   * **404, never 403, when the property belongs to another partner** — doc 85
   * §6.3. The scope predicate is `AND`ed into the same statement as the identity
   * predicate, so absent and out-of-scope are indistinguishable by construction.
   * Callers must preserve that: see `loadPropertyDetail`.
   */
  get: (propertyId: string, cookieHeader?: string) =>
    api.get<PropertyAdminView>(
      `${BASE}/${encodeURIComponent(propertyId)}`,
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /**
   * `GET /api/v1/admin/properties/{id}/completeness`
   *
   * The five onboarding sections and, for each, the field names still missing.
   * Same 404 semantics as `get`.
   */
  completeness: (propertyId: string, cookieHeader?: string) =>
    api.get<PropertyCompleteness>(
      `${BASE}/${encodeURIComponent(propertyId)}/completeness`,
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /**
   * `PATCH /api/v1/admin/properties/{id}`
   *
   * Browser-only by design. The CSRF token lives in a cookie the browser holds
   * and `client.ts` attaches it to every mutation; a server-side call would have
   * neither, and routing a partner's edit through the Next server would put a
   * write behind a hop that adds nothing.
   *
   * `version` is mandatory (doc 58 §2). A stale one comes back as **409
   * `VERSION_CONFLICT`** rather than overwriting whoever saved first; an unknown
   * or out-of-scope property is **404**, never 403.
   */
  update: (propertyId: string, body: UpdatePropertyRequest) =>
    api.patch<PropertyAdminView>(`${BASE}/${encodeURIComponent(propertyId)}`, body),

  /** Replace the hotel's Find Your KAS editorial groups. */
  setTripIntents: (propertyId: string, codes: readonly string[]) =>
    api.patch<PropertyAdminView>(`${BASE}/${encodeURIComponent(propertyId)}/trip-intents`, codes),

  /**
   * `POST /api/v1/admin/properties/{id}/publish` — permission `property.manage`.
   *
   * Moves the property to `OPEN`, the only state availability and rates quote
   * against. It does **not** change visibility: `COMING_SOON` is already listed
   * publicly, so this is what makes the hotel bookable and nothing else.
   *
   * `version` is required for the same reason `update` requires it — doc 58 §2.
   * A stale one is answered with **409** rather than publishing over an edit the
   * caller never saw.
   *
   * Refusals to expect: **400** listing every unmet checklist item, or a
   * signature line another published property already uses; **409** for the
   * wrong lifecycle state or a stale version; **404** out of scope.
   *
   * **Inventory and rates are not preconditions** — the OQ-101 ruling makes them
   * business inputs for sellability, not conditions of the lifecycle.
   */
  /** `DELETE /api/v1/admin/properties/{id}` — ADMIN only; a never-published draft, else 409. */
  remove: (propertyId: string) => api.delete<void>(`${BASE}/${encodeURIComponent(propertyId)}`),

  publish: (propertyId: string, body: PublishPropertyRequest) =>
    api.post<PropertyAdminView>(`${BASE}/${encodeURIComponent(propertyId)}/publish`, body),

  /**
   * `PATCH /api/v1/admin/properties/{id}/amenities` — permission `property.manage`.
   *
   * Replaces the whole selection from the controlled catalogue, so an empty array
   * clears it. The same shape as the room-type amenity route: a bare array of
   * codes, the property back.
   *
   * **No `version`.** This replaces rows in `property_amenity` rather than
   * updating the property row, so there is no column for a stale writer to
   * clobber — the room-type amenity route omits it for the same reason.
   *
   * Refusals: **400 `VALIDATION_FAILED`** naming every code the catalogue does
   * not contain, under the field `amenityCodes`; **404** out of scope, never 403.
   */
  setAmenities: (propertyId: string, amenityCodes: readonly string[]) =>
    api.patch<PropertyAdminView>(
      `${BASE}/${encodeURIComponent(propertyId)}/amenities`,
      amenityCodes,
    ),
} as const;
