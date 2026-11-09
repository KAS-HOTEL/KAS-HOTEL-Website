import { api } from '../client';
import type { LandmarkView, LandmarkWriteRequest } from '@/lib/domain/landmark';

/**
 * Landmark endpoints — verified against `onboarding.api.PartnerLandmarkController`.
 *
 * A sub-resource of the frozen `/admin/properties/{id}` with the frozen
 * `property.manage`, mirroring the facility routes. Doc 58 §3.1 puts landmarks on
 * the **guest property detail** and gives them no route of their own, so the
 * detail is where guests read them and this is where a Partner writes them.
 *
 * **No version anywhere**: `property_landmark` has no version column, the same as
 * `facility`.
 */

const base = (propertyId: string) =>
  `/api/v1/admin/properties/${encodeURIComponent(propertyId)}/landmarks`;

export const landmarksApi = {
  /**
   * `GET /api/v1/admin/properties/{propertyId}/landmarks`
   *
   * Returns **`[]`** — not 404 — for a property outside the caller's scope: the
   * scope predicate is in the same statement as the property filter, so a foreign
   * property matches no rows and is indistinguishable from one with none.
   */
  list: (propertyId: string, cookieHeader?: string) =>
    api.get<LandmarkView[]>(base(propertyId), cookieHeader === undefined ? {} : { cookieHeader }),

  /**
   * `POST /api/v1/admin/properties/{propertyId}/landmarks`
   *
   * **400** when no locale carries a name — `property_landmark_translation.name`
   * is `NOT NULL`, so a landmark without one is a distance to a place nobody
   * named — or when a measurement is negative. **404** out of scope, never 403.
   */
  create: (propertyId: string, body: LandmarkWriteRequest) =>
    api.post<LandmarkView>(base(propertyId), body),

  /**
   * `PATCH /api/v1/admin/properties/{propertyId}/landmarks/{landmarkId}`
   *
   * A locale the caller omits keeps its stored text rather than being cleared by
   * its own absence.
   */
  update: (propertyId: string, landmarkId: string, body: LandmarkWriteRequest) =>
    api.patch<LandmarkView>(`${base(propertyId)}/${encodeURIComponent(landmarkId)}`, body),

  /**
   * `DELETE /api/v1/admin/properties/{propertyId}/landmarks/{landmarkId}`
   *
   * A real delete, unlike a facility's archive: `property_landmark` has no
   * `archived_at`, and a landmark is a claim about the neighbourhood rather than
   * a record of what a guest was shown.
   */
  remove: (propertyId: string, landmarkId: string) =>
    api.delete<void>(`${base(propertyId)}/${encodeURIComponent(landmarkId)}`),
} as const;
