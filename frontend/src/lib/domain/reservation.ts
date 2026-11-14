import type { Money } from './availability';

/**
 * True when the server actually sent a value for this field.
 *
 * <h2>Why absent and null are the same thing here</h2>
 *
 * The backend runs `spring.jackson.default-property-inclusion: non_null`, so a
 * null field is **omitted from the JSON entirely** rather than serialised as
 * `null`. A reservation whose stay is not yet confirmed arrives with no
 * `stayStatus` key at all, and `reservation.stayStatus` is therefore
 * `undefined` at runtime even though the type says `string | null`.
 *
 * <p>That makes `x === null` silently false for exactly the rows it was written
 * to catch — a check that reads as careful and does nothing. This helper is the
 * one place that fact is written down, and it narrows, so the branch that uses
 * the value still type-checks.
 */
export function present<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * The reservation workspace — doc 58 §6, `GET /admin/ops/reservations`.
 *
 * <h2>Two lifecycles, and this surface carries one of them</h2>
 *
 * A reservation has a `salesStatus` (DIRECT only, NULL for OTA) and a
 * `stayStatus` (every channel, NULL until confirmed). Doc 58 §6 makes the
 * operational surface the second one, and there is deliberately **no
 * `salesStatus` on any type in this file** — the sales lifecycle has its own
 * workspace at `/partner/requests` and its own types in `salesRequest.ts`.
 * A single merged "status" would be the conflation doc 53 forbids.
 *
 * <h2>The guest is on the reservation, not in a customer table</h2>
 *
 * OQ-016 closed in favour of an anonymous guest with contact details, so
 * `customer_id` is NULL on a directly submitted booking and the contact fields
 * on the reservation *are* the guest record. Nothing here looks a customer up,
 * because there is nothing to look up.
 */

/** One row of the reservation list. */
export interface ReservationSummary {
  readonly reference: string;
  /** `DIRECT` or `OTA` — the real `channel_type` column, never inferred. */
  readonly channelType: string;
  /**
   * The operator's own booking number with the channel, or null for DIRECT.
   *
   * V12's constraints make it non-null for every OTA row and null for every
   * DIRECT one, so its presence is the channel restated, not a second signal.
   */
  readonly otaReference: string | null;
  /**
   * **Null until the stay is confirmed** — V12's own column comment.
   *
   * A null is that fact, not a missing value, and must never be rendered as
   * though it were a status. Typed as `string` rather than a union, like every
   * other enum on these surfaces: a value the server adds later must render
   * rather than crash the list.
   */
  readonly stayStatus: string | null;
  readonly propertySlug: string;
  readonly propertyName: string | null;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: number;
  readonly adults: number;
  readonly children: number;
  readonly rooms: number;
  readonly guestName: string | null;
  /** Null unless the session holds `customer.view` — doc 59:148. */
  readonly guestPhone: string | null;
  /** Null unless the session holds `customer.view` — doc 59:148. */
  readonly guestEmail: string | null;
  /** When the reservation was created in KAS. The list is ordered by it. */
  readonly createdAt: string;
  readonly total: Money | null;
}

/** One page of reservations. */
export interface ReservationPage {
  readonly items: readonly ReservationSummary[];
  readonly page: number;
  readonly size: number;
  /** How many match across every page — counted under the same partner scope. */
  readonly total: number;
}

export interface ReservationDetail {
  readonly summary: ReservationSummary;
  readonly lines: readonly ReservationLine[];
  readonly amounts: ReservationAmounts | null;
  /** Null unless the session holds `customer.view`. */
  readonly guest: ReservationGuest | null;
  readonly timeline: readonly ReservationEvent[];
}

/**
 * One booked room type.
 *
 * Two Deluxe rooms and one Double is **two lines** with quantities 2 and 1 —
 * one line per room type, the quantity being the count. They are never
 * collapsed into a single room.
 */
export interface ReservationLine {
  readonly roomTypeName: string;
  readonly quantity: number;
  /** Null when the stay's nights carry different rates — doc 125 §9, not a zero. */
  readonly nightly: Money | null;
  readonly lineTotal: Money | null;
}

/**
 * What the stay costs, as the record holds it.
 *
 * Every figure is a column on the reservation. **Nothing here is summed in the
 * browser** — doc 125 makes the reservation the authority, and a screen that
 * recomputed a total could disagree with the record it is displaying.
 *
 * `tax` and `serviceCharge` are null on every reservation this application
 * creates: doc 99 §12 puts tax outside V1. Null is that absence, not zero.
 */
export interface ReservationAmounts {
  readonly subtotal: Money | null;
  readonly tax: Money | null;
  readonly serviceCharge: Money | null;
  readonly discount: Money | null;
  readonly total: Money | null;
}

export interface ReservationGuest {
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly country: string | null;
  readonly preferredChannel: string | null;
  readonly arrivalTimeEst: string | null;
  readonly specialRequests: string | null;
  readonly childrenAges: readonly number[] | null;
  /** The linked account's staff-facing code (KAS-…); absent for a booking made without an account. */
  readonly customerCode?: string | null;
}

/**
 * One recorded transition — a row of `reservation_status_history`, oldest first.
 *
 * `field` is `SALES` or `STAY`, and the two are never merged into one "status
 * changed" entry. Structurally identical to `SalesRequestEvent`, which is why
 * the existing timeline component renders this without a second implementation.
 */
export interface ReservationEvent {
  readonly field: string;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  /** `SYSTEM`, `ADMIN` or `CUSTOMER`. Never an actor id — doc 134 §5. */
  readonly actorType: string;
  readonly reason: string | null;
  readonly note: string | null;
  readonly at: string;
}

/**
 * The `stay_status` enum, V1:54 — the operational lifecycle, on every channel.
 *
 * The order is the schema's, which is also the order a stay actually moves
 * through, so the filter reads like the journey rather than like an alphabet.
 */
export const STAY_STATUSES = [
  'CONFIRMED',
  'CHECK_IN_READY',
  'CHECKED_IN',
  'CHECKED_OUT',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

/** The `channel_type` enum, V1:37. */
export const CHANNEL_TYPES = ['DIRECT', 'OTA'] as const;

/**
 * The four questions an operator actually asks, over the seven states V1:54 has.
 *
 * <h2>Why group at all</h2>
 *
 * Seven options in a filter is a state machine on screen. A receptionist wants
 * to know whether a booking stands, was cancelled, has walked in, or never
 * turned up — and `CHECKED_OUT` versus `COMPLETED` is a distinction the finance
 * close cares about, not the front desk. The badge on each row still shows the
 * exact state; only the *filter* groups.
 *
 * <h2>The mapping, and why each one</h2>
 *
 * <ul>
 *   <li><strong>booked</strong> — `CONFIRMED`, `CHECK_IN_READY`. The stay is
 *       agreed and ahead of the guest. `CHECK_IN_READY` is still "booked" from
 *       the front desk's side: it means the room is prepared, not that anybody
 *       has arrived.</li>
 *   <li><strong>arrived</strong> — `CHECKED_IN`, `CHECKED_OUT`, `COMPLETED`.
 *       All three share the fact the operator is filtering for: the guest came.
 *       A departed guest arrived; so did one whose folio is closed.</li>
 *   <li><strong>cancelled</strong> — `CANCELLED`.</li>
 *   <li><strong>noShow</strong> — `NO_SHOW`. Kept apart from cancelled on
 *       purpose: a cancellation is a decision someone made, a no-show is a
 *       failure to appear, and they carry different money and different
 *       follow-up.</li>
 * </ul>
 *
 * <h2>What no group covers, deliberately</h2>
 *
 * **A null `stay_status`.** V12 makes it *"NULL until confirmed"*: a DIRECT
 * request whose sales outcome is not yet decided has no stay to be in a state.
 * Folding it into "Đã đặt" would claim a booking the sales team has not won, so
 * those rows answer only to "Tất cả" — which is the truthful answer, and the
 * reason {@link STAY_STATUS_UNSET} exists for the badge.
 *
 * <p>Every one of the seven enum values belongs to exactly one group. A status
 * added to the enum later belongs to none until someone decides where it goes,
 * and `reservation.test.tsx` fails when that happens rather than letting the new
 * state quietly disappear from every filter.
 */
export const STAY_STATUS_GROUPS = {
  confirmed: ['CONFIRMED', 'CHECK_IN_READY'],
  inHouse: ['CHECKED_IN'],
  checkedOut: ['CHECKED_OUT', 'COMPLETED'],
  noShow: ['NO_SHOW'],
  cancelled: ['CANCELLED'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** The group tokens, in operational order: booked, in the house, gone, did not come, cancelled. */
export const STAY_STATUS_GROUP_ORDER = ['confirmed', 'inHouse', 'checkedOut', 'noShow', 'cancelled'] as const;

/**
 * Which group a concrete state belongs to, or null when it belongs to none.
 *
 * <p>Null for a null status, which is the only value outside the four — see the
 * note on {@link STAY_STATUS_GROUPS}. Also null for a status the enum gains
 * later, so a new state reads as itself rather than being filed under whichever
 * group happened to be first.
 */
export function stayStatusGroupOf(status: string | null | undefined): StayStatusGroup | null {
  if (!present(status)) {
    return null;
  }
  for (const group of STAY_STATUS_GROUP_ORDER) {
    if ((STAY_STATUS_GROUPS[group] as readonly string[]).includes(status)) {
      return group;
    }
  }
  return null;
}

export type StayStatusGroup = (typeof STAY_STATUS_GROUP_ORDER)[number];

/** What each group is called. No enum reaches the operator through this filter. */
export const STAY_STATUS_GROUP_LABEL: Readonly<Record<StayStatusGroup, string>> = {
  confirmed: 'Đã xác nhận',
  inHouse: 'Đang lưu trú',
  checkedOut: 'Đã trả phòng',
  noShow: 'Không đến',
  cancelled: 'Đã hủy',
};

/** Whether a URL value names a group. Anything else is treated as no filter. */
export function isStayStatusGroup(value: string | undefined): value is StayStatusGroup {
  return value !== undefined && (STAY_STATUS_GROUP_ORDER as readonly string[]).includes(value);
}

/**
 * The enum values a group stands for, as the API's `stayStatus` parameter.
 *
 * <p>Comma-separated, because that is what `ReservationSearchService` accepts —
 * one request, one page, server-side. Filtering a group client-side would have
 * to fetch every page to know how many matched, which is the pagination the
 * backend does properly.
 */
export function stayStatusesForGroup(group: StayStatusGroup): string {
  return STAY_STATUS_GROUPS[group].join(',');
}

/**
 * Every stay status — what "Tất cả" asks for. A reservation gets a stay status
 * only once its payment is confirmed (sales WON → stay CONFIRMED); until then it
 * is a booking request and lives on "Yêu cầu đặt phòng", not on this list.
 */
export function allStayStatuses(): string {
  return STAY_STATUS_GROUP_ORDER.map((group) => STAY_STATUS_GROUPS[group].join(',')).join(',');
}

/**
 * Vietnamese for each stay status — doc 69 §325, one console language in V1.
 *
 * Unlike the sales workspace, which prints `salesStatus` verbatim, this one
 * translates: `NO_SHOW` and `CHECK_IN_READY` are operational vocabulary a
 * receptionist reads at speed, and doc 82 requires state be carried by words
 * rather than colour alone — words that have to be readable to do that.
 */
export const STAY_STATUS_LABEL: Readonly<Record<string, string>> = {
  CONFIRMED: 'Đã xác nhận',
  CHECK_IN_READY: 'Sẵn sàng nhận phòng',
  CHECKED_IN: 'Đã nhận phòng',
  CHECKED_OUT: 'Đã trả phòng',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không đến',
};

/**
 * How a null stay status reads.
 *
 * V12: `stay_status` is *"NULL until confirmed"*. So the honest rendering of an
 * absent value is "not yet confirmed" — a real statement about the reservation,
 * not an invented eighth status and not an empty cell that looks like a bug.
 */
export const STAY_STATUS_UNSET = 'Chờ khách sạn xác nhận';

/**
 * The `contact_channel` enum, V1 — how a guest asked to be reached.
 *
 * <p>Localised for the same reason `stay_status` is: `EMAIL` and `IN_PERSON`
 * were being printed raw into a Vietnamese detail page. An unrecognised value
 * prints itself rather than vanishing, so a channel added to the enum shows up
 * as something to translate instead of as a blank row.
 */
export const CONTACT_CHANNEL_LABEL: Readonly<Record<string, string>> = {
  PHONE: 'Điện thoại',
  EMAIL: 'Email',
  ZALO: 'Zalo',
  SMS: 'Tin nhắn SMS',
  IN_PERSON: 'Trực tiếp',
};

export function contactChannelLabel(channel: string | null | undefined): string {
  if (!present(channel)) {
    return '';
  }
  return CONTACT_CHANNEL_LABEL[channel] ?? channel;
}

/** Exactly what the DTO allows for `guest.country` — `^[A-Za-z]{2}$`, doc 58 §8. */
const COUNTRY_CODE = /^[A-Za-z]{2}$/u;

/**
 * `VN` as `Việt Nam`.
 *
 * <h2>Why `Intl` and not a table of countries</h2>
 *
 * The region names are already on the platform, in the same CLDR data
 * `Intl.NumberFormat('vi-VN')` and `Intl.DateTimeFormat('vi-VN')` are read from
 * elsewhere in this module's neighbours. Hand-writing a country list would mean
 * maintaining a second copy of it that is wrong the moment a guest books from
 * somewhere nobody thought to add — and the guest form accepts *any* two-letter
 * code, not just `VN`.
 *
 * <h2>Two ways this throws, both guarded</h2>
 *
 * `Intl.DisplayNames.of` raises a `RangeError` on anything that is not a
 * well-formed region subtag — `V1`, `VNM`, an empty string. This renders inside
 * a server component, so an unguarded call would fail the whole page for one
 * bad column. Anything that does not match the DTO's own pattern is therefore
 * returned untouched, and the lookup itself is still wrapped.
 *
 * <p>The lookup is also case-sensitive in a way that surprises: `of('vn')`
 * returns `'vn'`, not `Việt Nam`. The column is not constrained to upper case
 * and the pattern permits either, so the code is upper-cased first.
 *
 * <h2>An unknown code prints itself</h2>
 *
 * A well-formed code CLDR has no name for (`QQ`) comes back as `QQ`. That is
 * the honest answer: it is what the reservation actually holds, it is not a
 * UUID or an internal enum, and inventing "Không rõ" would claim the guest came
 * from nowhere.
 */
export function countryLabel(country: string | null | undefined): string {
  if (!present(country)) {
    return '';
  }
  const code = country.trim().toUpperCase();
  if (!COUNTRY_CODE.test(code)) {
    return country;
  }
  try {
    return new Intl.DisplayNames(['vi-VN'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * What an operator is shown for a stay status, anywhere in this workspace.
 *
 * <h2>Four words, not seven</h2>
 *
 * The filter offers four groups; the list and the detail page now say the same
 * four. Before this they did not: filtering by "Khách đã tới" returned rows
 * labelled "Đã nhận phòng", "Đã trả phòng" and "Hoàn tất", so the answer never
 * used the words the question did.
 *
 * <p>The precision is not lost, only demoted — `stayStatusLabel` still renders
 * the exact state and callers put it in a `title` so support can recover it. The
 * distinction between checked-out and completed is a finance question, and the
 * front desk is not the place to ask it.
 *
 * <p>A null status is "Chưa xác nhận", which is a real statement about the
 * reservation (V12: NULL until confirmed) rather than a fifth lifecycle state.
 * An unrecognised value prints its own precise label rather than disappearing.
 */
export function stayStatusDisplay(status: string | null | undefined): string {
  const group = stayStatusGroupOf(status);
  return group === null ? stayStatusLabel(status) : STAY_STATUS_GROUP_LABEL[group];
}

/**
 * `2026-09-28` as `28/09/2026`.
 *
 * <p>Day-first, which is how a Vietnamese front desk reads a date, and how the
 * rest of the console's guest-facing surfaces write one. Built by splitting the
 * ISO string rather than by constructing a `Date`: these are plain calendar
 * dates with no time and no zone, and putting one through `Date` would invite
 * the browser's local offset to move it across midnight.
 *
 * <p>Anything that is not an ISO date is returned untouched — a server that
 * changes the shape should show something odd, not throw.
 */
export function formatStayDate(iso: string | null | undefined): string {
  if (!present(iso)) {
    return '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (match === null) {
    return iso;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function stayStatusLabel(status: string | null | undefined): string {
  if (!present(status)) {
    return STAY_STATUS_UNSET;
  }
  // An unrecognised value prints itself. A server that adds a status must not
  // make this screen show a blank badge.
  return STAY_STATUS_LABEL[status] ?? status;
}

/** Words as well as tint — doc 82 forbids state carried by colour alone. */
export function stayStatusTone(
  status: string | null | undefined,
): 'neutral' | 'info' | 'success' | 'danger' {
  switch (status) {
    case 'CONFIRMED':
    case 'CHECK_IN_READY':
      return 'info';
    case 'CHECKED_IN':
    case 'CHECKED_OUT':
    case 'COMPLETED':
      return 'success';
    case 'CANCELLED':
    case 'NO_SHOW':
      return 'danger';
    default:
      return 'neutral';
  }
}

export const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  DIRECT: 'Trực tiếp',
  OTA: 'OTA',
};
export function channelLabel(channelType: string): string {
  return CHANNEL_LABEL[channelType] ?? channelType;
}

/** `20/09/2026 → 22/09/2026 · 2 đêm`, from the server's own dates and count. */
export function stayLabel(reservation: ReservationSummary): string {
  return (
    `${formatStayDate(reservation.checkIn)} → ${formatStayDate(reservation.checkOut)}`
    + ` · ${reservation.nights} đêm`
  );
}

/** The display name, falling back to the slug the backend addressed it by. */
export function propertyLabel(reservation: ReservationSummary): string {
  return reservation.propertyName ?? reservation.propertySlug;
}

/**
 * `2 người lớn, 1 trẻ em` — never a guest count this module invented.
 *
 * Children are named only when there are some: "0 trẻ em" is noise on the
 * overwhelming majority of rows.
 */
export function guestCountLabel(reservation: Pick<ReservationSummary, 'adults' | 'children'>): string {
  const adults = `${reservation.adults} người lớn`;
  return reservation.children > 0 ? `${adults}, ${reservation.children} trẻ em` : adults;
}

/**
 * Which page numbers a pager should offer.
 *
 * Derived from the server's own `total` and `size`; a page with no rows still
 * has one page, so an empty result does not render a pager with zero buttons.
 */
export function pageCount(page: Pick<ReservationPage, 'total' | 'size'>): number {
  if (page.size < 1) {
    return 1;
  }
  return Math.max(1, Math.ceil(page.total / page.size));
}

/**
 * True when this page is empty but the search matched something.
 *
 * <p>"Nothing matched your search" and "you have paged past the end of 43
 * results" are different facts and need different screens: the first invites the
 * operator to widen the filters, the second is a dead end unless something
 * offers a way back. A URL is enough to reach the second — `?page=9` on a
 * two-page result — so it cannot be treated as an ordinary empty state.
 */
export function isPastEnd(page: Pick<ReservationPage, 'items' | 'total'>): boolean {
  return page.items.length === 0 && page.total > 0;
}

/** The 1-based range this page covers, for "1–20 trong 43". */
export function pageRange(page: ReservationPage): { readonly from: number; readonly to: number } {
  if (page.items.length === 0) {
    return { from: 0, to: 0 };
  }
  const from = page.page * page.size + 1;
  return { from, to: from + page.items.length - 1 };
}
