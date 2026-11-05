import { api } from '../client';
import type { ExperienceView, ExperienceWriteRequest } from '@/lib/domain/experience';

/**
 * Experience endpoints — verified against
 * `onboarding.api.PartnerExperienceController`.
 *
 * A sub-resource of the frozen `/admin/properties/{id}` with the frozen
 * `property.manage`, mirroring the landmark routes. Doc 58 does not mention
 * experiences at all, which is why Step 16A.41 refused to invent this route;
 * these paths are the owner's 16A.47 ruling, built on doc 21 §3.6, which lists
 * "signature experiences" among the property admin area's own objects.
 *
 * **No version anywhere**: `property_experience` has no version column, the same
 * as `property_landmark` and `facility`.
 */

const base = (propertyId: string) =>
  `/api/v1/admin/properties/${encodeURIComponent(propertyId)}/experiences`;

export const experiencesApi = {
  /**
   * `GET /api/v1/admin/properties/{propertyId}/experiences`
   *
   * Returns **`[]`** — not 404 — for a property outside the caller's scope: the
   * scope predicate is in the same statement as the property filter, so a foreign
   * property matches no rows and is indistinguishable from one with none.
   */
  list: (propertyId: string, cookieHeader?: string) =>
    api.get<ExperienceView[]>(base(propertyId), cookieHeader === undefined ? {} : { cookieHeader }),

  /**
   * `POST /api/v1/admin/properties/{propertyId}/experiences`
   *
   * **400** when no locale carries a title —
   * `property_experience_translation.title` is `NOT NULL`, and the publish gate
   * counts base rows, so a titleless one would satisfy a checklist item it cannot
   * honestly meet. **404** out of scope, never 403.
   */
  create: (propertyId: string, body: ExperienceWriteRequest) =>
    api.post<ExperienceView>(base(propertyId), body),

  /**
   * `PATCH /api/v1/admin/properties/{propertyId}/experiences/{experienceId}`
   *
   * A locale the caller omits keeps its stored text, which is what lets a reorder
   * send `sortOrder` alone instead of re-sending every word to avoid erasing it.
   */
  update: (propertyId: string, experienceId: string, body: ExperienceWriteRequest) =>
    api.patch<ExperienceView>(`${base(propertyId)}/${encodeURIComponent(experienceId)}`, body),

  /**
   * `DELETE /api/v1/admin/properties/{propertyId}/experiences/{experienceId}`
   *
   * A real delete — `property_experience` has no `archived_at`. Removing the last
   * one is permitted: it does not un-publish anything, but the next submission
   * will fail the checklist until another is written.
   */
  remove: (propertyId: string, experienceId: string) =>
    api.delete<void>(`${base(propertyId)}/${encodeURIComponent(experienceId)}`),
} as const;
