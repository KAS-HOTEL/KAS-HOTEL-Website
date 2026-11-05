import type { Money } from './availability';

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */

/** One room type and how many of it — the frozen `Line`. */
export interface ReservationRequestLine {
  readonly roomTypeSlug: string;
  readonly quantity: number;
}

/**
 * The guest — the frozen `Guest`.
 *
 * `country` is the one field with a format rule in the DTO: `^[A-Za-z]{2}$`.
 * It has no `@NotBlank`, so it is optional, but a malformed value is a **400**
 * rather than something the server quietly drops (that was fixed in E4). This
 * module therefore refuses it before it leaves the browser and says why.
 */
export interface ReservationGuest {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly country?: string | undefined;
  readonly preferredChannel?: string | undefined;
  readonly bestTimeToContact?: string | undefined;
}

/**
 * The request body, field-for-field.
 *
 * `children` and `childAges` are present and always empty: config B10 is `OPEN`
 * and the backend refuses anything else (doc 58 §11.2.3), exactly as the quote
 * does. `offerCode` is omitted entirely — B23 is `OPEN` and the backend refuses
 * it — rather than sent as `null`.
 */
export interface ReservationRequest {
  readonly propertySlug: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly children: number;
  readonly childAges: readonly number[];
  readonly lines: readonly ReservationRequestLine[];
  readonly guest: ReservationGuest;
  readonly specialRequests?: string | undefined;
  readonly discoveryChannel?: string | undefined;
  readonly acceptedTermsVersion?: string | undefined;
  readonly marketingConsent?: boolean | undefined;
  readonly locale?: string | undefined;
}

/**
 * The 201 — `RequestReceiptView`, and **exactly these six keys**.
 *
 * There is no tracking URL, no SLA timestamp, no reservation id, no property and
 * no guest echo. `trackingUrlIssued` is the backend's own honesty flag and is
 * `false` in V1, because issuing a link is part of an acknowledgement whose
 * delivery is still **OQ-162**.
 */
export interface RequestReceipt {
  readonly reference: string;
  readonly status: string;
  readonly responsePromise: string;
  readonly trackingUrlIssued: boolean;
  readonly estimatedTotal: Money;
  readonly estimateDisclaimer: string;
}

/** The frozen status the 201 carries. */
export const REQUEST_RECEIVED = 'REQUEST_RECEIVED';

/**
 * The submission's lifecycle.
 *
 * Explicit rather than a pair of booleans, because the failure modes are not
 * interchangeable: a validation failure keeps the guest's values and points at a
 * field, a network failure must be retried with the **same** idempotency key,
 * and a key conflict must never be retried at all.
 */
export type SubmissionState =
  | 'IDLE'
  | 'VALIDATING'
  | 'SUBMITTING'
  | 'SUCCESS'
  | 'VALIDATION_ERROR'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

/** Field keys the form validates locally, matching the input ids. */
export type GuestField = 'fullName' | 'email' | 'phone' | 'country' | 'terms';

export type GuestProblems = Partial<Record<GuestField, string>>;

/** Doc 58 §3.3 — the DTO's own rule, mirrored so a 400 is not the first feedback. */
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;

/**
 * Deliberately permissive.
 *
 * The authority is the backend's `@Email`; this only catches the shapes a guest
 * can see are wrong. A stricter local rule would reject addresses the server
 * accepts, which is a worse failure than one round trip.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Enough digits to be a phone number, in any of the formats guests actually type. */
const PHONE_PATTERN = /^[+()\d][\s\-().\d]{5,}$/;

/**
 * What the guest must fix before the request is worth sending.
 *
 * Mirrors the frozen DTO and adds nothing: `fullName`, `email` and `phone` are
 * `@NotBlank`; `country` is optional but must match `^[A-Za-z]{2}$` when given.
 * Terms acceptance is the one rule that is the form's own — see
 * {@link ReservationRequestForm}.
 */
export function guestProblems(
  guest: ReservationGuest,
  termsAccepted: boolean,
  messages: GuestProblemMessages,
): GuestProblems {
  const problems: Record<string, string> = {};

  if (guest.fullName.trim() === '') {
    problems.fullName = messages.fullNameRequired;
  }
  if (guest.email.trim() === '') {
    problems.email = messages.emailRequired;
  } else if (!EMAIL_PATTERN.test(guest.email.trim())) {
    problems.email = messages.emailInvalid;
  }
  if (guest.phone.trim() === '') {
    problems.phone = messages.phoneRequired;
  } else if (!PHONE_PATTERN.test(guest.phone.trim())) {
    problems.phone = messages.phoneInvalid;
  }

  const country = guest.country?.trim() ?? '';
  if (country !== '' && !COUNTRY_PATTERN.test(country)) {
    problems.country = messages.countryInvalid;
  }

  if (!termsAccepted) {
    problems.terms = messages.termsRequired;
  }

  return problems;
}

export interface GuestProblemMessages {
  readonly fullNameRequired: string;
  readonly emailRequired: string;
  readonly emailInvalid: string;
  readonly phoneRequired: string;
  readonly phoneInvalid: string;
  readonly countryInvalid: string;
  readonly termsRequired: string;
}

/**
 * The body, built from a validated form.
 *
 * Trimmed, and **absent rather than empty**: the backend fingerprints the
 * canonical body for idempotency, so `""` and "omitted" are different requests
 * and must not be produced by the same guest input.
 */
export function buildRequest(input: {
  readonly propertySlug: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly lines: readonly ReservationRequestLine[];
  readonly guest: ReservationGuest;
  readonly specialRequests: string;
  readonly acceptedTermsVersion: string;
  readonly marketingConsent: boolean;
  readonly locale: string;
}): ReservationRequest {
  return {
    propertySlug: input.propertySlug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    // Config B10 is OPEN; the backend refuses any child and the form offers no
    // control for one. Always 0, always empty — never a guessed age band.
    children: 0,
    childAges: [],
    lines: input.lines,
    guest: {
      fullName: input.guest.fullName.trim(),
      email: input.guest.email.trim(),
      phone: input.guest.phone.trim(),
      ...optional('country', input.guest.country?.trim()),
      ...optional('preferredChannel', input.guest.preferredChannel),
      ...optional('bestTimeToContact', input.guest.bestTimeToContact),
    },
    ...optional('specialRequests', input.specialRequests.trim()),
    acceptedTermsVersion: input.acceptedTermsVersion,
    marketingConsent: input.marketingConsent,
    locale: input.locale,
  };
}

function optional<K extends string>(key: K, value: string | undefined): Record<K, string> | object {
  return value === undefined || value === '' ? {} : ({ [key]: value } as Record<K, string>);
}

/**
 * A stable fingerprint of one logical submission.
 *
 * The idempotency key must survive a retry of the *same* request and must not
 * survive a material edit — doc 117 §24.1 answers a reused key carrying a
 * different body with **409 `IDEMPOTENCY_KEY_REUSED`**, so reusing a key across
 * an edit would turn a guest's correction into a hard error.
 *
 * `JSON.stringify` of a freshly built body is deterministic here because
 * {@link buildRequest} always writes the same keys in the same order.
 */
export function submissionSignature(request: ReservationRequest): string {
  return JSON.stringify(request);
}

/**
 * A fresh idempotency key.
 *
 * `crypto.randomUUID` where the platform has it — every browser this application
 * targets, and Node in tests. The fallback is only for an exotic runtime without
 * it and still draws from `crypto.getRandomValues`; there is no `Math.random`
 * path, because a predictable key is a request another guest could collide with.
 */
export function newIdempotencyKey(): string {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === 'function') {
    return source.randomUUID();
  }
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  // Assembled from the canonical 8-4-4-4-12 segment sizes rather than five
  // hand-written offsets, so the shape is stated once and cannot drift.
  const segments: string[] = [];
  let at = 0;
  for (const size of UUID_SEGMENTS) {
    segments.push(hex.substring(at, at + size));
    at += size;
  }
  return segments.join('-');
}

/** RFC 4122's canonical text form. */
const UUID_SEGMENTS = [8, 4, 4, 4, 12] as const;

/**
 * Maps a backend field path onto a form field.
 *
 * Bean Validation reports `guest.email`, not `email`, and the country pattern
 * reports `guest.country`. Anything that does not correspond to a control the
 * guest can see returns `null`, and the caller shows it as a form-level message
 * rather than attaching it to an unrelated input.
 */
export function toGuestField(backendField: string): GuestField | null {
  const known: Record<string, GuestField> = {
    'guest.fullName': 'fullName',
    'guest.email': 'email',
    'guest.phone': 'phone',
    'guest.country': 'country',
  };
  return known[backendField] ?? null;
}
