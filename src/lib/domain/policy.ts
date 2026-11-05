/**
 * Policy types, mirroring `onboarding.api.PolicyView` exactly.
 *
 * <h2>What the API returns, and what it does not</h2>
 *
 * `PolicyView` carries `id`, `type`, `version`, `effectiveFrom`, `status` and
 * `translations` — a map of **locale → body**. `summary` is accepted by
 * `PATCH /translations` and is **never read back** (`findTranslations` selects
 * `body` alone), so no screen here can show or clear one. Recorded as OQ-143.
 *
 * **There are no numeric columns on `property_policy`.** No fee, percentage,
 * hours, days, age or amount exists in the schema or the request contract, and
 * doc 51 A4/A5/B11/B12 record cancellation windows, no-show terms, extra beds and
 * deposits as *unresolved business inputs*. Nothing in this module may grow a
 * field for one.
 */

/**
 * The eleven types the schema permits, from the `property_policy_type_valid`
 * CHECK — transcribed from `property.PolicyType`, in its declaration order.
 *
 * **No catalogue endpoint exists**, so this list is a local mirror of a frozen
 * database CHECK rather than a fetched vocabulary. That is acceptable only
 * because the values are frozen: adding one means altering the CHECK, which is an
 * owner decision (OQ-110). A test pins the list so drift fails here.
 *
 * `CHECK_IN`/`CHECK_OUT` are deliberately absent — those are columns on the
 * property itself. `EXTRA_BED`/`DEPOSIT` are commercial terms belonging to the
 * rate and settings model, not here.
 */
export const POLICY_TYPES = [
  'BOOKING',
  'CANCELLATION',
  'CHILDREN',
  'PETS',
  'SMOKING',
  'PAYMENT',
  'ACCESSIBILITY',
  'PRIVACY',
  'TERMS',
  'COOKIES',
  'NO_SHOW',
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

/** Mirrors `property.PolicyStatus` — `DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED`. */
export const POLICY_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

/** Mirrors `onboarding.api.PolicyView`. */
export interface PolicyView {
  readonly id: string;
  readonly type: PolicyType | string;
  /** The platform-assigned version number — **not** a concurrency token. */
  readonly version: number;
  /** ISO date. May be in the future: a version can be scheduled. */
  readonly effectiveFrom: string;
  readonly status: PolicyStatus | string;
  /** Locale → body text. Always present, possibly empty. */
  readonly translations: Readonly<Record<string, string>>;
}

/** Mirrors `onboarding.api.CreatePolicyRequest`. */
export interface CreatePolicyRequest {
  readonly type: PolicyType;
  readonly effectiveFrom: string;
}

/**
 * Mirrors `onboarding.api.PolicyTranslationRequest`.
 *
 * One locale per request — the backend takes a single `locale`, so editing both
 * is two calls. `summary` is omitted: it cannot be read back, and an input whose
 * stored value is invisible would mislead more than its absence does.
 */
export interface PolicyTranslationRequest {
  readonly locale: 'vi' | 'en';
  readonly body: string;
}

export function isKnownPolicyType(value: string): value is PolicyType {
  return (POLICY_TYPES as readonly string[]).includes(value);
}

export function isKnownPolicyStatus(value: string): value is PolicyStatus {
  return (POLICY_STATUSES as readonly string[]).includes(value);
}

/**
 * Vietnamese labels for the frozen types.
 *
 * Names only — no descriptions, because describing what a cancellation policy
 * *should* say would be supplying business content the owner has not decided.
 */
export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  BOOKING: 'Đặt phòng',
  CANCELLATION: 'Huỷ đặt phòng',
  CHILDREN: 'Trẻ em',
  PETS: 'Thú cưng',
  SMOKING: 'Hút thuốc',
  PAYMENT: 'Thanh toán',
  ACCESSIBILITY: 'Tiếp cận',
  PRIVACY: 'Quyền riêng tư',
  TERMS: 'Điều khoản',
  COOKIES: 'Cookie',
  NO_SHOW: 'Không đến nhận phòng',
};

export function policyTypeLabel(type: string): string {
  return isKnownPolicyType(type) ? POLICY_TYPE_LABELS[type] : type;
}

/**
 * Vietnamese labels for the frozen statuses.
 *
 * `PAUSED` is "tạm ngưng áp dụng" — temporarily withdrawn and reversible, which
 * is exactly what distinguishes it from `ARCHIVED`. `ARCHIVED` says "đã lưu trữ",
 * never "đã xoá": a version may be pinned by a reservation's `terms_version` and
 * is kept readable forever.
 */
export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  DRAFT: 'Bản nháp',
  ACTIVE: 'Đang áp dụng',
  PAUSED: 'Tạm ngưng áp dụng',
  ARCHIVED: 'Đã lưu trữ',
};

export function policyStatusLabel(status: string): string {
  return isKnownPolicyStatus(status) ? POLICY_STATUS_LABELS[status] : status;
}

const STATUS_TONES: Record<PolicyStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'danger',
};

export function policyStatusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  return isKnownPolicyStatus(status) ? STATUS_TONES[status] : 'neutral';
}

/**
 * The transitions the backend will accept — mirrors `PolicyStatus.canTransitionTo`.
 *
 * Offering a move the backend refuses would be offering a 409. `ARCHIVED` is
 * terminal and has no outgoing edge; there is no DELETE anywhere.
 */
const TRANSITIONS: Record<PolicyStatus, readonly PolicyStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function allowedTransitions(status: string): readonly PolicyStatus[] {
  return isKnownPolicyStatus(status) ? TRANSITIONS[status] : [];
}

/**
 * What a control that performs the transition should be called.
 *
 * A verb, not the status name. Labelling the activate button "Đang áp dụng"
 * would name a state rather than an action — and it would collide with the
 * status filter of the same name, leaving two unrelated controls sharing one
 * accessible name.
 */
export const POLICY_TRANSITION_LABELS: Record<PolicyStatus, string> = {
  DRAFT: 'Chuyển về nháp',
  ACTIVE: 'Đưa vào áp dụng',
  PAUSED: 'Tạm ngưng',
  ARCHIVED: 'Lưu trữ',
};

/**
 * Activation, said the way the second time differs from the first.
 *
 * `DRAFT → ACTIVE` puts a policy into effect for the first time;
 * `PAUSED → ACTIVE` puts one back. Both are the same API call and the same
 * transition, and the backend has no idea which of the two it is performing —
 * but the operator does, and a partner who deliberately withdrew a policy last
 * month is looking for the word "lại". It is the one transition whose label
 * depends on where it starts, which is why this takes a source state at all.
 */
const REACTIVATION_LABEL = 'Đưa vào áp dụng lại';

/** `from` is typed as the wire value it is — an unknown state simply is not PAUSED. */
export function policyTransitionLabel(from: string, to: PolicyStatus): string {
  if (to === 'ACTIVE' && from === 'PAUSED') {
    return REACTIVATION_LABEL;
  }
  return POLICY_TRANSITION_LABELS[to];
}

/** The two frozen locales (doc 25), in the order the console prefers them. */
export const POLICY_LOCALES = ['vi', 'en'] as const;

/**
 * Whether a locale carries non-blank body text.
 *
 * This is the same condition the backend counts in `bodyLocaleCount` before it
 * will activate a policy, so the UI can show the gate before a Partner hits it —
 * never instead of it.
 */
export function hasBody(policy: PolicyView, locale: string): boolean {
  const body = policy.translations[locale];
  return body !== undefined && body.trim() !== '';
}

/** Both locales present — the backend's activation precondition (OQ-113). */
export function canRequestActivation(policy: PolicyView): boolean {
  return POLICY_LOCALES.every((locale) => hasBody(policy, locale));
}

/**
 * How a version relates to today, for display only.
 *
 * Derived from the two fields the API returns and nothing else. It never decides
 * anything: the backend resolves the current policy with `effective_from DESC,
 * version DESC` and gates public visibility in SQL, and a second resolver here
 * would eventually disagree with it.
 *
 * `scheduled` is the one that matters — an `ACTIVE` version dated in the future
 * is **not** currently applying, and calling it "current" would be wrong.
 */
export type PolicyTiming = 'current' | 'scheduled' | 'inactive';

export function policyTiming(policy: PolicyView, today: string): PolicyTiming {
  if (policy.status !== 'ACTIVE') {
    return 'inactive';
  }
  return policy.effectiveFrom > today ? 'scheduled' : 'current';
}

export const POLICY_TIMING_LABELS: Record<PolicyTiming, string> = {
  current: 'Đang có hiệu lực',
  scheduled: 'Sẽ có hiệu lực',
  inactive: 'Chưa có hiệu lực',
};

/**
 * The newest version of each type, by the backend's own ordering.
 *
 * `effective_from DESC, version DESC` — the same comparison
 * `PropertyPolicyRepository` uses. Applied here only to decide which version a
 * card summarises; every version stays reachable.
 */
export function newestByType(
  policies: readonly PolicyView[],
): ReadonlyMap<string, PolicyView> {
  const byType = new Map<string, PolicyView>();
  for (const policy of policies) {
    const held = byType.get(policy.type);
    if (held === undefined || isNewer(policy, held)) {
      byType.set(policy.type, policy);
    }
  }
  return byType;
}

function isNewer(candidate: PolicyView, held: PolicyView): boolean {
  if (candidate.effectiveFrom !== held.effectiveFrom) {
    return candidate.effectiveFrom > held.effectiveFrom;
  }
  return candidate.version > held.version;
}
