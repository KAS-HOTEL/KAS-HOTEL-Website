import { api } from '../client';
import type { RoomTypeView, RoomTypeWriteRequest } from '@/lib/domain/roomType';

/**
 * Room-type endpoints — verified against `onboarding.api.PartnerRoomTypeController`.
 *
 * Path and permission are both frozen by doc 58 §8:
 * `/admin/properties/{id}/room-types[/{rtId}]`, permission `roomtype.manage` —
 * note that this is a **different** permission from the `property.manage` the
 * property endpoints require.
 *
 * <h2>What is still not wrapped</h2>
 *
 * `PATCH /{id}/amenities` is redundant — `update` already replaces the whole
 * selection — and **`PATCH /{id}/status` is deliberately absent**. It accepts only
 * `UNLISTED` and `ARCHIVED`; a Partner may never publish a room type, because
 * publication happens through property approval so that a Partner cannot add a
 * room to an already-live property and make it public without review. Wrapping it
 * would put a lifecycle control one import away from a form that must not have
 * one.
 */

const base = (propertyId: string) =>
  `/api/v1/admin/properties/${encodeURIComponent(propertyId)}/room-types`;

export const roomTypesApi = {
  /**
   * `GET /api/v1/admin/properties/{propertyId}/room-types`
   *
   * Ordered by the backend (`sort_order`, then `slug`). Never paginated.
   *
   * Returns **`[]`** — not 404 — for a property outside the caller's scope: the
   * scope predicate is in the same statement as the property filter, so a
   * foreign property simply matches no rows. An empty list is indistinguishable
   * from a property that genuinely has no rooms, which is the intended amount of
   * disclosure.
   */
  list: (propertyId: string, cookieHeader?: string) =>
    api.get<RoomTypeView[]>(base(propertyId), cookieHeader === undefined ? {} : { cookieHeader }),

  /**
   * `GET /api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}`
   *
   * **404, never 403**, when the room type belongs to another partner — doc 85
   * §6.3. Callers must preserve that: see `loadRoomTypeDetail`.
   */
  get: (propertyId: string, roomTypeId: string, cookieHeader?: string) =>
    api.get<RoomTypeView>(
      `${base(propertyId)}/${encodeURIComponent(roomTypeId)}`,
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /**
   * `POST /api/v1/admin/properties/{propertyId}/room-types`
   *
   * Always created `DRAFT` — a Partner cannot create a published room, so adding
   * one to an already-approved property has no immediate public effect. Returns
   * the created record, including the id the caller navigates to.
   *
   * **404** when the property is outside the caller's scope, never 403.
   */
  create: (propertyId: string, body: RoomTypeWriteRequest) =>
    api.post<RoomTypeView>(base(propertyId), body),

  /**
   * `PATCH /api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}?version=N`
   *
   * The version travels as a **query parameter** here, unlike the property
   * contract which carries it in the body (OQ-139). Doc 58 §2 names the mechanism
   * rather than its location, so neither form is required; this one is the
   * existing contract and was left alone.
   *
   * Stale version → **409 `VERSION_CONFLICT`**. Out of scope → **404**, checked
   * before the version so a guessed value cannot distinguish the two.
   */
  update: (propertyId: string, roomTypeId: string, version: number, body: RoomTypeWriteRequest) =>
    api.patch<RoomTypeView>(
      `${base(propertyId)}/${encodeURIComponent(roomTypeId)}`,
      body,
      { query: { version } },
    ),

  /**
   * `PATCH /api/v1/admin/properties/{propertyId}/room-types/{roomTypeId}/order?sortOrder=N`
   *
   * Moves the room type to a display position within its hotel (0 first). No
   * version: the position is the only thing written, and the row's version is bumped.
   */
  setOrder: (propertyId: string, roomTypeId: string, sortOrder: number) =>
    api.patch<RoomTypeView>(
      `${base(propertyId)}/${encodeURIComponent(roomTypeId)}/order`,
      undefined,
      { query: { sortOrder } },
    ),
} as const;
