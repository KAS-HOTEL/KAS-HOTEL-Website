/**
 * Room-type types, mirroring `onboarding.api.RoomTypeView` exactly.
 *
 * Hand-written and reviewed against the Java, because the repository publishes no
 * OpenAPI document (OQ-131). Every field below exists on the record; nothing is
 * anticipated or derived from a database column the API does not return.
 *
 * <h2>What the API deliberately does not return</h2>
 *
 * No `propertyId` (implied by the route), no partner reference, **no price** —
 * doc 52 §3.2 keeps `basePriceMinor` off this record because it is commercial
 * data owned by `pricing` — and **no field capable of holding a room number,
 * floor or unit id**, because doc 52 §6 excludes `PhysicalRoom` from V1 entirely.
 * Nothing in this module should ever grow one.
 */

/** Mirrors `property.RoomTypeStatus` — doc 52 §3.2 `DRAFT → PUBLISHED → UNLISTED → ARCHIVED`. */
export const ROOM_TYPE_STATUSES = ['DRAFT', 'PUBLISHED', 'UNLISTED', 'ARCHIVED'] as const;

export type RoomTypeStatus = (typeof ROOM_TYPE_STATUSES)[number];

/** Mirrors `property.RoomTypeTranslation`. */
export interface RoomTypeTranslation {
  readonly name: string;
  /** Nullable in the schema; Jackson omits the key when unset. */
  readonly shortDescription?: string;
}

/** Mirrors `property.BedConfiguration`. `bedType` is free text — there is no bed enum (OQ-102). */
export interface BedConfiguration {
  readonly bedType: string;
  readonly bedCount: number;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

/** Mirrors `onboarding.api.RoomTypeView`. */
export interface RoomTypeView {
  readonly id: string;
  readonly slug: string;
  /** Name and short description per locale. Always present, possibly empty. */
  readonly translations: Readonly<Record<string, RoomTypeTranslation>>;
  /** Typed as `string` so a status added to the enum later cannot crash a page. */
  readonly status: RoomTypeStatus | string;
  /** Nullable in the schema — a decimal, sent as a JSON number. */
  readonly areaSqm?: number;
  readonly maxAdults: number;
  readonly maxChildren: number;
  readonly maxOccupancy: number;
  /** One of the frozen `view_type` values, or absent when unset. */
  readonly viewType?: string;
  readonly smoking: boolean;
  readonly sortOrder: number;
  readonly beds: readonly BedConfiguration[];
  /** Codes from the controlled `amenity` catalogue, in the room's own order. */
  readonly amenityCodes: readonly string[];
  /**
   * Doc 58 §2 concurrency token.
   *
   * Send it back on `PATCH`. `PATCH` has required a matching value since Phase
   * 7.5B, but the field was absent from the response until Step 8 — so the token
   * the endpoint demanded was one no caller could read.
   */
  readonly version: number;
}

/** One locale's content on the way in. Mirrors `onboarding.api.RoomTypeTranslationRequest`. */
export interface RoomTypeTranslationInput {
  readonly name: string;
  readonly shortDescription?: string;
}

/**
 * Mirrors `onboarding.api.RoomTypeRequest`.
 *
 * The same record serves `POST` and `PATCH`. `translations` is keyed by locale —
 * the shape the read returns — so a client reads, edits and sends back without
 * reshaping. An absent locale means "leave it alone", never "delete it".
 *
 * `version` is **not** here: this endpoint takes it as a query parameter rather
 * than in the body (OQ-139), unlike the property contract.
 */
/**
 * One bed row **as the write contract accepts it** — mirrors
 * `onboarding.api.BedConfigurationRequest`, which has exactly three
 * components.
 *
 * Deliberately not {@link BedConfiguration}: that is the *read* shape, and it
 * carries `sortOrder` because `RoomTypeView` returns one. The write contract
 * has no such field — the server assigns it from list position
 * (`BedConfigurationRequest.toDomain(int sortOrder)`), so array order is the
 * ordering. Sending it anyway is not merely redundant:
 * `spring.jackson.fail-on-unknown-properties` is on, so one extra key rejects
 * the whole body with 400 "The request body could not be read" — which is
 * exactly what every room-type create and edit did until this was corrected.
 */
export interface BedConfigurationInput {
  readonly bedType: string;
  readonly bedCount: number;
  readonly isDefault: boolean;
}

export interface RoomTypeWriteRequest {
  readonly slug: string;
  readonly translations: Readonly<Record<string, RoomTypeTranslationInput>>;
  readonly areaSqm?: number;
  readonly maxAdults: number;
  readonly maxChildren: number;
  readonly maxOccupancy: number;
  readonly viewType?: string;
  readonly smoking: boolean;
  readonly sortOrder?: number;
  readonly beds: readonly BedConfigurationInput[];
  readonly amenityCodes: readonly string[];
}

/**
 * Mirrors `catalog.api.AmenityCatalogController.AmenityView`.
 *
 * `names` is empty today — `amenity_translation` has no rows — so the picker
 * shows codes. When the owner seeds labels every screen gets them with no code
 * change, which is the whole reason the catalogue is fetched rather than
 * hand-listed in the frontend.
 */
export interface AmenityCatalogEntry {
  readonly code: string;
  readonly category: string;
  readonly names: Readonly<Record<string, string>>;
  readonly isHighlight: boolean;
  readonly sortOrder: number;
}

/**
 * The category the backend refuses on a room type.
 *
 * `RoomTypeService` rejects any `PROPERTY_FACILITY` amenity as belonging to the
 * property rather than the room. Mirrored here only to keep those entries out of
 * the picker — the backend remains the authority, and a code that slips through
 * is still refused with a field-level error.
 */
export const PROPERTY_ONLY_AMENITY_CATEGORY = 'PROPERTY_FACILITY';

/** The nine frozen doc 03 §6 categories, labelled for the picker's grouping. */
export const AMENITY_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  CONNECTIVITY: 'Kết nối',
  COMFORT: 'Tiện nghi phòng',
  BATHROOM: 'Phòng tắm',
  MEDIA: 'Giải trí',
  FOOD_DRINK: 'Ăn uống',
  SERVICES: 'Dịch vụ',
  ACCESSIBILITY: 'Tiếp cận',
  FAMILY: 'Gia đình',
  PROPERTY_FACILITY: 'Tiện ích khách sạn',
};

export function amenityCategoryLabel(category: string): string {
  return AMENITY_CATEGORY_LABELS[category] ?? category;
}

/** The catalogue label for a code, falling back to the code itself. */
export function amenityLabel(entry: AmenityCatalogEntry): string {
  for (const locale of ['vi', 'en']) {
    const candidate = entry.names[locale];
    if (candidate !== undefined && candidate.trim() !== '') {
      return candidate;
    }
  }
  return entry.code;
}

export function isKnownRoomTypeStatus(value: string): value is RoomTypeStatus {
  return (ROOM_TYPE_STATUSES as readonly string[]).includes(value);
}

/**
 * Vietnamese labels for the frozen statuses.
 *
 * Translations, not reinterpretations. `UNLISTED` is "đã gỡ khỏi trang công
 * khai" — withdrawn from the public site — not "ẩn" or "tắt", which would suggest
 * a toggle. `ARCHIVED` is terminal and the label says so.
 */
export const ROOM_TYPE_STATUS_LABELS: Record<RoomTypeStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đang hiển thị',
  UNLISTED: 'Đã gỡ hiển thị',
  ARCHIVED: 'Đã lưu trữ',
};

export function roomTypeStatusLabel(status: string): string {
  return isKnownRoomTypeStatus(status) ? ROOM_TYPE_STATUS_LABELS[status] : status;
}

const STATUS_TONES: Record<RoomTypeStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  UNLISTED: 'warning',
  ARCHIVED: 'danger',
};

export function roomTypeStatusTone(
  status: string,
): 'neutral' | 'success' | 'warning' | 'danger' {
  return isKnownRoomTypeStatus(status) ? STATUS_TONES[status] : 'neutral';
}

/**
 * Whether guests can see this room type — mirrors `RoomTypeStatus.isPubliclyVisible()`.
 *
 * Doc 52 §3.2: public only when `PUBLISHED`. **Visible is not bookable** — that
 * additionally needs inventory and rates, which are later steps. Nothing here
 * implies availability, and nothing should be built on top of it that does.
 */
export function isRoomTypePubliclyVisible(status: string): boolean {
  return status === 'PUBLISHED';
}

/**
 * Vietnamese labels for the frozen `view_type` enum.
 *
 * The five values are the whole enum — `CITY, STREET, COURTYARD, ROOFTOP,
 * INTERIOR`. Doc 94 records that it was deliberately not extended, so an
 * unrecognised value is shown as itself rather than mapped onto a neighbour.
 */
export const VIEW_TYPE_LABELS: Readonly<Record<string, string>> = {
  CITY: 'Hướng thành phố',
  STREET: 'Hướng phố',
  COURTYARD: 'Hướng sân trong',
  ROOFTOP: 'Hướng sân thượng',
  INTERIOR: 'Không có cửa sổ ra ngoài',
};

export function viewTypeLabel(viewType: string): string {
  return VIEW_TYPE_LABELS[viewType] ?? viewType;
}

/** Console locale preference, matching the property surfaces. */
const LOCALE_PREFERENCE = ['vi', 'en'] as const;

/**
 * The best available room name, or `null` when none has been written.
 *
 * `null` rather than the slug, for the same reason as properties: falling back
 * here would make an unnamed room indistinguishable from a named one at every
 * call site. Callers decide how to show the gap.
 */
export function roomTypeName(
  translations: Readonly<Record<string, RoomTypeTranslation>>,
): string | null {
  for (const locale of LOCALE_PREFERENCE) {
    const candidate = translations[locale]?.name;
    if (candidate !== undefined && candidate.trim() !== '') {
      return candidate;
    }
  }
  const remaining = Object.values(translations).find((t) => t.name.trim() !== '');
  return remaining?.name ?? null;
}

/** Beds as one line, e.g. `1 × King · 2 × Twin`. Empty when none is configured. */
export function formatBeds(beds: readonly BedConfiguration[]): string {
  return [...beds]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((bed) => `${bed.bedCount} × ${bed.bedType}`)
    .join(' · ');
}
