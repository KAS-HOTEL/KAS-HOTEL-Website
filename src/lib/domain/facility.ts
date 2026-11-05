/**
 * A property's facility blocks — doc 23 §5, `facility` + `facility_translation`
 * since V4.
 *
 * <h2>What the block does not carry yet</h2>
 *
 * Doc 23 §5 lists three more fields, and none can be carried without inventing
 * something the frozen documents have not settled:
 *
 * - `images[]` — facility media has no API (`MediaOwnerType` says so itself) and
 *   there are no image bytes to attach regardless (OQ-106).
 * - `openingHours` — doc 23 §5 says only "structured"; the column is `jsonb` and
 *   nothing gives the shape.
 * - `highlights[]` — no column exists for it in either table.
 */

/** The frozen `facility_type` enum — V1, and doc 23 §5's `FacilityBlock.type`. */
export const FACILITY_TYPES = [
  'RESTAURANT',
  'BAR',
  'ROOFTOP',
  'GYM',
  'POOL',
  'SPA',
  'MEETING',
  'LOUNGE',
  'TERRACE',
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

/** `FacilityView` — the admin surface, text returned as well as accepted. */
export interface FacilityView {
  readonly id: string;
  /** Typed as `string` so a type added to the enum later cannot crash a page. */
  readonly type: FacilityType | string;
  /** Name per locale. Always present — a facility cannot exist without one. */
  readonly names: Readonly<Record<string, string>>;
  /** Description per locale. A locale appears only when it has one. */
  readonly descriptions: Readonly<Record<string, string>>;
  /** `null` means unstated, which is not the same as "residents only". */
  readonly openToNonResidents: boolean | null;
  readonly sortOrder: number;
  readonly archived: boolean;
}

export interface FacilityTranslationRequest {
  readonly name: string;
  readonly description?: string;
}

export interface FacilityWriteRequest {
  readonly type: FacilityType | string;
  readonly translations: Readonly<Record<string, FacilityTranslationRequest>>;
  readonly openToNonResidents?: boolean | null;
  readonly sortOrder?: number;
}

const TYPE_LABELS: Readonly<Record<FacilityType, string>> = {
  RESTAURANT: 'Nhà hàng',
  BAR: 'Quầy bar',
  ROOFTOP: 'Sân thượng',
  GYM: 'Phòng tập',
  POOL: 'Hồ bơi',
  SPA: 'Spa',
  MEETING: 'Phòng họp',
  LOUNGE: 'Phòng chờ',
  TERRACE: 'Sân hiên',
};

/**
 * The Vietnamese label for a type — the console is Vietnamese-only (doc 69).
 *
 * An unrecognised value is shown as itself rather than vanishing behind a lookup
 * miss, the same rule the policy and lifecycle labels follow.
 */
export function facilityTypeLabel(type: string): string {
  return TYPE_LABELS[type as FacilityType] ?? type;
}

/**
 * The name to show a Partner, preferring Vietnamese.
 *
 * Returns `null` rather than a placeholder when no locale has one — which the
 * backend makes impossible on create, so a null here means the row predates the
 * API or lost its translations, and saying "no name" beats inventing one.
 */
export function facilityName(facility: FacilityView): string | null {
  for (const locale of ['vi', 'en']) {
    const candidate = facility.names[locale];
    if (candidate !== undefined && candidate.trim() !== '') {
      return candidate;
    }
  }
  return null;
}

/** Live facilities first, then withdrawn ones, each in the operator's order. */
export function facilityOrder(facilities: readonly FacilityView[]): readonly FacilityView[] {
  return [...facilities].sort((a, b) => {
    if (a.archived !== b.archived) {
      return a.archived ? 1 : -1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * The `sortOrder` a newly added facility should take.
 *
 * One past the highest in use, so a new block lands at the end of the guest page
 * rather than silently displacing one already there.
 */
export function nextSortOrder(facilities: readonly FacilityView[]): number {
  return facilities.reduce((max, facility) => Math.max(max, facility.sortOrder + 1), 0);
}
