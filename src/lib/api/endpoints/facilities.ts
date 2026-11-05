import { api } from '../client';
import type { FacilityView, FacilityWriteRequest } from '@/lib/domain/facility';

/**
 * Facility endpoints — verified against `onboarding.api.PartnerFacilityController`.
 *
 * Path and permission are frozen by doc 58 §8:
 * `/admin/properties/{id}/facilities`, permission `property.manage` — the same
 * permission the property itself uses, and **not** `roomtype.manage`.
 *
 * <h2>No version anywhere</h2>
 *
 * `facility` has no version column, so none of these carry one. That is the
 * schema's decision rather than an omission: a facility holds no field two
 * editors would race over silently, and the loser of a race sees the winner's
 * text on the next read.
 */

const base = (propertyId: string) =>
  `/api/v1/admin/properties/${encodeURIComponent(propertyId)}/facilities`;

export const facilitiesApi = {
  /**
   * `GET /api/v1/admin/properties/{propertyId}/facilities`
   *
   * Every facility, **archived ones included** — the console is where a Partner
   * sees what they withdrew. The guest route excludes them.
   *
   * Returns **`[]`** — not 404 — for a property outside the caller's scope: the
   * scope predicate is in the same statement as the property filter, so a foreign
   * property matches no rows and is indistinguishable from one with none.
   */
  list: (propertyId: string, cookieHeader?: string) =>
    api.get<FacilityView[]>(base(propertyId), cookieHeader === undefined ? {} : { cookieHeader }),

  /**
   * `POST /api/v1/admin/properties/{propertyId}/facilities`
   *
   * **400** when no locale carries a name — `facility_translation.name` is
   * `NOT NULL`, so a facility without one is a block nothing can render.
   * **404** when the property is outside the caller's scope, never 403.
   */
  create: (propertyId: string, body: FacilityWriteRequest) =>
    api.post<FacilityView>(base(propertyId), body),

  /**
   * `PATCH /api/v1/admin/properties/{propertyId}/facilities/{facilityId}`
   *
   * **The type is ignored.** Doc 23 §5 makes the type what the block *is*; one
   * that turned from `POOL` into `MEETING` would keep the pool's words while
   * claiming to be something else. It is still sent, because the same record
   * serves both verbs.
   *
   * A locale the caller omits keeps its stored text rather than being cleared by
   * its own absence.
   */
  update: (propertyId: string, facilityId: string, body: FacilityWriteRequest) =>
    api.patch<FacilityView>(
      `${base(propertyId)}/${encodeURIComponent(facilityId)}`,
      body,
    ),

  /**
   * `DELETE /api/v1/admin/properties/{propertyId}/facilities/{facilityId}`
   *
   * Archives rather than deletes: the row is part of what a guest saw, and the
   * public query already excludes archived rows. Idempotent, so a retried click
   * is not a refusal a Partner has to interpret.
   */
  archive: (propertyId: string, facilityId: string) =>
    api.delete<void>(`${base(propertyId)}/${encodeURIComponent(facilityId)}`),
} as const;
