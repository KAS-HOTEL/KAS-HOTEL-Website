import { api } from '../client';
import type {
  CreatePolicyRequest,
  PolicyStatus,
  PolicyTranslationRequest,
  PolicyView,
} from '@/lib/domain/policy';

/**
 * Property policy endpoints — verified against
 * `onboarding.api.PartnerPolicyController`.
 *
 * Permission is **`property.manage`**, not a policy-specific one: doc 59 §4.5 has
 * no `policy.manage`, and a policy is property configuration. If the business
 * wants policy authoring separated from property administration that is a new
 * permission and an owner decision — OQ-114.
 *
 * The paths sit inside the property tree but **doc 58 §8 has no policies row at
 * all**, so they are an addition to the frozen contract awaiting an approved
 * amendment — OQ-111. They are used verbatim as the backend defines them.
 *
 * There is **no DELETE**, deliberately: a version may be pinned by a
 * reservation's `terms_version`, so it is archived and kept readable.
 */

const base = (propertyId: string) =>
  `/api/v1/admin/properties/${encodeURIComponent(propertyId)}/policies`;

export const policiesApi = {
  /** `GET …/policies` — every version of every type, newest first within a type. */
  list: (propertyId: string, cookieHeader?: string) =>
    api.get<PolicyView[]>(base(propertyId), cookieHeader === undefined ? {} : { cookieHeader }),

  /**
   * `POST …/policies` — creates the **next version** of a type, always `DRAFT`.
   *
   * The version number is assigned by the platform. `effectiveFrom` may be in the
   * future, which is how a scheduled version is authored.
   */
  create: (propertyId: string, body: CreatePolicyRequest) =>
    api.post<PolicyView>(base(propertyId), body),

  /**
   * `PATCH …/policies/{policyId}/translations` — one locale per call.
   *
   * `summary` is accepted by the backend and never read back, so it is not sent:
   * an input whose stored value is invisible misleads more than its absence.
   * OQ-143.
   */
  setTranslation: (propertyId: string, policyId: string, body: PolicyTranslationRequest) =>
    api.patch<PolicyView>(
      `${base(propertyId)}/${encodeURIComponent(policyId)}/translations`,
      body,
    ),

  /**
   * `PATCH …/policies/{policyId}/status?status=` — activate, pause or archive.
   *
   * Activation additionally requires body text in **both** locales; without it
   * the backend answers `400` with `field: body` (OQ-113). An illegal transition
   * is `409 ILLEGAL_TRANSITION`.
   */
  setStatus: (propertyId: string, policyId: string, status: PolicyStatus) =>
    api.patch<PolicyView>(
      `${base(propertyId)}/${encodeURIComponent(policyId)}/status`,
      undefined,
      { query: { status } },
    ),
} as const;
