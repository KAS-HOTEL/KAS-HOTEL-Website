/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */

/** Doc 58 §2's money shape. Unlike the operator grid, this one carries its exponent. */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
  /** Decimal places. VND is zero-decimal (doc 56 §6) and sends `0`. */
  readonly exponent: number;
}

/**
 * Mirrors `property.PublishedProperty` — doc 58 §3.1.
 *
 * No `id` and no `partnerId`: a guest addresses a property by slug, and
 * `partnerId` is on the doc 58 §9 PARTNER denylist. `lifecycleState` **is**
 * public on purpose — doc 03 §8 lists `COMING_SOON` with a teaser and
 * `TEMPORARILY_CLOSED` as listed-but-unavailable, so a guest needs it to
 * understand what they are looking at.
 */
export interface PublishedProperty {
  readonly slug: string;
  /** From the locale's translation; absent if that locale has none. */
  readonly name?: string | null;
  readonly city?: string | null;
  readonly district?: string | null;
  readonly isFlagship: boolean;
  readonly lifecycleState: PublicLifecycleState | string;
}

/**
 * One amenity a hotel offers — mirrors `property.PublishedAmenity`.
 *
 * Doc 03 §6 makes amenities a shared, controlled vocabulary with per-property
 * assignment, so `code` is the catalogue's stable identifier and `name` is that
 * code resolved for the requested locale. `isHighlight` is this property's own
 * flag: the same amenity can be a headline feature at one hotel and ordinary at
 * another.
 *
 * The backend omits an amenity with no name in the requested locale rather than
 * returning its code, so there is no "unnamed amenity" state to render.
 */
export interface PublicAmenity {
  readonly code: string;
  readonly name: string;
  /** One of doc 03 §6's nine categories. Typed as string so a new one renders. */
  readonly category: string;
  readonly isHighlight: boolean;
}

/**
 * One entry of the shared amenity vocabulary — doc 58 §3.1's
 * GET /public/amenities, 'Amenity taxonomy'.
 *
 * Distinct from PublicAmenity, which is what one hotel offers. This is the
 * vocabulary itself, and it carries no isHighlight: the catalogue flag and
 * property_amenity.is_highlight are different facts wearing one name.
 *
 * The backend omits an entry with no approved word in the requested locale, so
 * there is no unnamed state to render — and today, with the wording still
 * config A9 / OQ-031, the list is empty.
 */
export interface AmenityTaxonomyEntry {
  readonly code: string;
  readonly name: string;
  readonly category: string;
}

/** Public Find Your KAS group, with hotels assigned by property management. */
export interface PublicTripIntent {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly propertySlugs: readonly string[];
}

/**
 * Mirrors `property.PublishedPropertyDetail` — doc 58 §3.1's property *detail*,
 * which "includes … amenities" where the list does not.
 *
 * Additive over {@link PublishedProperty}: every key the list returns is here
 * too, plus this hotel's own amenity assignments — never the shared catalogue.
 */
export interface PublishedPropertyDetail extends PublishedProperty {
  /**
   * Doc 23 §3.2 — the one-line editorial hook, ≤ 90 chars, in the requested
   * locale, and doc 67 §1's hero line.
   *
   * Absent when the operator has not written one in this locale. The API omits
   * the key rather than sending an empty string, so "not written" stays
   * distinguishable from "written as blank" — and nothing substitutes the other
   * locale's copy for it.
   */
  readonly signatureLine?: string;
  /** Doc 23 §3.2 — card and meta text, ≤ 220 chars. Same absence rule. */
  readonly shortDescription?: string;
  readonly amenities: readonly PublicAmenity[];
  /** Doc 23 §3.3 — named places with verified distances, in the operator's order. */
  readonly landmarks: readonly PublicLandmark[];
  /**
   * Doc 67 §1's section 5, in the operator's order.
   *
   * Doc 58 §3.1 does not name experiences — doc 58 never mentions them at all —
   * so their place on this response is Step 16A.47's owner ruling rather than an
   * inference, beside the landmarks they sit next to on the page.
   */
  readonly experiences: readonly PublicExperience[];
}

/**
 * One signature experience — doc 67 §1's *"SIGNATURE EXPERIENCES — named, unique
 * to this property"*, and doc 66 §7's *"where Milestone's restaurant and rooftop
 * live as experiences rather than amenity checkboxes"*.
 *
 * Absent by design: the experience id and `sortOrder`. Nothing on the public
 * surface addresses an experience, and the array order **is** the order.
 *
 * Also absent, by Step 16A.47's owner decision: `timeOfDay` and any image. The
 * V1 experience is words.
 */
export interface PublicExperience {
  readonly title: string;
  /** Absent when the operator has written none in this locale. */
  readonly description: string | null;
}

/**
 * One nearby landmark — doc 58 §3.1's *"property detail — includes … landmarks"*,
 * shaped by doc 23 §3.3's `{ name (localised), type, distanceMetres, walkingMinutes }`.
 *
 * Absent by design: the landmark id and `sortOrder`. Nothing on the public
 * surface addresses a landmark, and the array order **is** the order.
 *
 * Both measures are nullable because the schema allows a landmark with neither,
 * and doc 03 §5.2 asks for **verified** distances — an unmeasured one is absent
 * rather than guessed at. Neither is derived from the other.
 */
export interface PublicLandmark {
  readonly name: string;
  /** Absent when the operator has written none in this locale. */
  readonly description: string | null;
  /** Free text; the column has no vocabulary and doc 23 §3.3 names none. */
  readonly type: string | null;
  readonly distanceMetres: number | null;
  readonly walkingMinutes: number | null;
}

/** The three states that can reach a guest. `DRAFT` and `CLOSED` never do. */
export const PUBLIC_LIFECYCLE_STATES = ['OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED'] as const;

export type PublicLifecycleState = (typeof PUBLIC_LIFECYCLE_STATES)[number];

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export interface RequestRoomOption {
  readonly roomTypeSlug: string;
  readonly name: string;
  /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  /** The **lowest** nightly rate across the stay, not a total. */
  readonly nightlyFrom: Money;
}

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export interface PublishedRoomType {
  readonly slug: string;
  readonly name: string;
  readonly maxAdults: number;
  readonly maxChildren: number;
  readonly maxOccupancy: number;
  readonly areaSqm?: number | null;
  readonly viewType?: string | null;
  /**
   * Whether smoking is permitted. Added to the public contract in STEP I — it is
   * a `NOT NULL` column the query already read, and one of the first things a
   * guest checks.
   */
  readonly smoking?: boolean;
  /**
   * The Partner's own one-line description for this locale. Absent when none was
   * written: a room with no description shows its facts rather than a sentence
   * somebody else composed.
   */
  readonly shortDescription?: string | null;
  /** Bed arrangements in the Partner's order. Empty when none was recorded. */
  readonly beds?: readonly PublishedBed[];
}

/**
 * One bed arrangement — mirrors `property.PublishedBed`.
 *
 * `bedType` is the Partner's own text (a free `text` column), returned
 * verbatim rather than mapped to a category the schema does not have.
 */
export interface PublishedBed {
  readonly bedType: string;
  readonly bedCount: number;
  /** The arrangement a guest gets unless they ask otherwise. */
  readonly isDefault: boolean;
}

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export const AVAILABILITY_OMITS_UNPRICED = true;

/**
 * Nights in a stay — doc 55 §2 and doc 15 §3: `checkIn → checkOut` occupies
 * `checkIn … checkOut − 1`. **The check-out night is not occupied and not
 * charged.**
 */
export function nights(checkIn: string, checkOut: string): number {
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
  );
}

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export function stayProblem(
  checkIn: string,
  checkOut: string,
  today: string,
  copy: StayProblemCopy,
): string | null {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return copy.bothDatesRequired;
  }
  if (checkIn < today) {
    // Not a lead-time rule — SAME_DAY_BOOKING_CUTOFF (B20) is unsupplied. Only
    // dates that have already passed, for which nothing can be sold.
    return copy.checkInPast;
  }
  if (checkOut <= checkIn) {
    return copy.atLeastOneNight;
  }
  return null;
}

export function isIsoDate(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** `today + days`, in UTC, as an ISO date. */
export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Money, using the **exponent the response carried**.
 *
 * The public shape sends its own exponent, so nothing here assumes one. VND is
 * zero-decimal (doc 56 §6) and a generic divide-by-100 would render every
 * Vietnamese price 100× wrong.
 */
export function formatMoney(money: Money): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: money.currency,
    maximumFractionDigits: money.exponent,
  }).format(money.amountMinor / 10 ** money.exponent);
}

/** The same number spoken out, for an accessible name. */
export function spokenMoney(money: Money, vndName = 'đồng'): string {
  const amount = new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: money.exponent,
  }).format(money.amountMinor / 10 ** money.exponent);
  // ISO 4217 names VND "Dong", so an English page says it in English rather than
  // reading a symbol aloud. The default keeps every existing caller unchanged.
  return money.currency === 'VND' ? `${amount} ${vndName}` : `${amount} ${money.currency}`;
}

/**
 * The two states a returned room type can be in.
 *
 * There is deliberately no third: an unpriced room type never arrives, because
 * the backend omits it.
 */
export type RoomAvailabilityState = 'requestOnly';

export function roomState(room: RequestRoomOption): RoomAvailabilityState {
  void room;
  return 'requestOnly';
}

/**
 * What a room card announces.
 *
 * Spelled out rather than left to colour or position — doc 82 forbids conveying
 * state by colour alone — and the price is bound to its room in one string so a
 * screen-reader user never has to pair them by proximity.
 */
export function roomLabel(
  room: RequestRoomOption,
  nightCount: number,
  copy: RoomLabelCopy,
): string {
  return copy.roomLabel(
    room.name,
    nightCount,
    spokenMoney(room.nightlyFrom, copy.vndName),
  );
}

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export interface RoomLabelCopy {
  /** How the currency is spoken — ISO 4217 names VND "Dong". */
  readonly vndName: string;
  readonly roomLabel: (
    name: string,
    nights: number,
    price: string,
  ) => string;
}

/** Whether a property can be booked at all — doc 03 §8. Only `OPEN` is bookable. */
export function isBookable(lifecycleState: string): boolean {
  return lifecycleState === 'OPEN';
}

/**
 * Why a non-bookable property shows no availability.
 *
 * Doc 03 §8 freezes the ladder: `COMING_SOON` is "listed with a teaser",
 * `TEMPORARILY_CLOSED` is "listed, marked unavailable", and neither is bookable.
 * Saying so is more honest than an empty result the guest has to interpret.
 */
export function notBookableReason(
  lifecycleState: string,
  copy: NotBookableCopy,
): string | null {
  switch (lifecycleState) {
    case 'COMING_SOON':
      return copy.comingSoon;
    case 'TEMPORARILY_CLOSED':
      return copy.temporarilyClosed;
    default:
      return null;
  }
}

/** A place name from whichever parts the response actually carried. */
export function locationLabel(property: PublishedProperty): string | null {
  const parts = [property.district, property.city].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  );
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * One policy as a guest sees it — mirrors `property.PublicPolicyView`.
 *
 * `version` is here because doc 58 §3.1 says the public policy endpoint
 * *"returns `version` for `termsVersion`"*: a reservation pins the exact policy
 * version the guest agreed to, and without it the guest could not be shown what
 * they accepted.
 *
 * Absent by design: the policy id, `propertyId`, `status`, `effectiveFrom` and
 * every timestamp. `status` in particular would disclose that a newer draft
 * exists.
 */
export interface PublicPolicy {
  /** A `PolicyType` value. Typed as string so a type added later renders. */
  readonly type: string;
  readonly version: number;
  /**
   * Both are optional **because the wire says so**.
   *
   * `PublicPolicyView` declares them as plain `String`, and the backend runs
   * `spring.jackson.default-property-inclusion: non_null` — so a policy whose
   * summary was never written arrives with **no `summary` key at all**, not with
   * an empty string. Declaring them required made `policy.summary.trim()` look
   * safe; it threw the first time a genuinely published property rendered its
   * policies, which was STEP L.
   *
   * Every other nullable field on this surface is already declared this way
   * (`PublicFacility.description`, `PublishedRoomType.shortDescription`); these
   * two were the exception, and the exception was wrong.
   */
  readonly summary?: string | null;
  readonly body?: string | null;
}

/**
 * One facility block on the guest page — doc 58 §3.1's
 * *"property detail includes facilities"*, from
 * `GET /public/properties/{slug}/facilities`.
 *
 * Absent by design: the facility id, `propertyId`, `sortOrder` and `archived`.
 * The order of the array **is** the order, and echoing `sortOrder` would invite
 * a client to re-sort by it and disagree with the operator.
 *
 * Doc 58 titles the route "Facilities with galleries" and there is no `images`
 * field, because facility media has no API — `MediaOwnerType` says so itself —
 * and there are no image bytes to serve regardless (OQ-106). An always-empty
 * array would mean "the contract has one" rather than "this facility has none".
 */
export interface PublicFacility {
  /** A `FacilityType` value. Typed as string so a type added later renders. */
  readonly type: string;
  readonly name: string;
  /** Absent when the operator has written none in this locale. */
  readonly description: string | null;
  /** `null` means unstated, which is not the same as "residents only". */
  readonly openToNonResidents: boolean | null;
}

/**
 * The strings {@link stayProblem} and {@link notBookableReason} return.
 *
 * Passed in rather than looked up: the domain layer knows a stay is too short
 * or a hotel is not open, and the copy module knows how to say it in the
 * reader's language. Structural typing means the guest copy object satisfies
 * these without importing anything from the feature layer.
 */
export interface StayProblemCopy {
  readonly bothDatesRequired: string;
  readonly checkInPast: string;
  readonly atLeastOneNight: string;
}

export interface NotBookableCopy {
  readonly comingSoon: string;
  readonly temporarilyClosed: string;
}
