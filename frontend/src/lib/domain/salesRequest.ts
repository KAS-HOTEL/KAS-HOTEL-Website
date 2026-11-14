import type { Money } from './availability';

/**
 * The direct sales queue — doc 58 §5, `GET /admin/sales/requests`.
 *
 * <h2>Everything here is the backend's</h2>
 *
 * No total is summed, no night count is derived, no SLA deadline is computed.
 * `nights` and `slaDueAt` arrive already calculated because doc 117 §9 makes
 * config A6 the single source for the deadline and forbids a second
 * calculation. A screen that recomputed either could disagree with the record.
 *
 * <h2>No action is modelled, because none exists</h2>
 *
 * There is no `canAccept`, no `canDecline` and no `allowedTransitions`. Every
 * transition out of `REQUESTED` that doc 54 §4 freezes is blocked on an open
 * question or an unsupplied config, so the queue reads and nothing more.
 */

/** One queue row. Carries the guest's name and no other guest datum. */
export interface SalesRequestSummary {
  readonly reference: string;
  /** The frozen `salesStatus` — `REQUESTED` at S1. Never guest vocabulary. */
  readonly salesStatus: string;
  /**
   * Where the enquiry came from — the `lead_source` enum (V1:39).
   *
   * Doc 69 §4.2 makes it *"a first-class column, not a detail"*. Never null on
   * this surface: V12's `reservation_channel_invariant` requires a DIRECT
   * reservation to carry one, and the sales API is DIRECT-only.
   *
   * Typed as `string` rather than a union, like `salesStatus` beside it — a
   * value the server adds later must render, not crash the queue.
   */
  readonly leadSource: string;
  readonly propertySlug: string;
  readonly propertyName: string | null;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: number;
  readonly adults: number;
  readonly children: number;
  readonly rooms: number;
  readonly guestName: string | null;
  readonly requestedAt: string;
  /** `requested_at + A6`, computed server-side. Rendered, never recalculated. */
  readonly slaDueAt: string | null;
  readonly total: Money | null;
}

/**
 * One request, opened.
 *
 * `guest` is **null unless the caller holds `customer.view`** — doc 59:148 gates
 * guest data behind that permission and requires the access be logged, which the
 * backend does when it returns this block.
 */
export interface SalesRequestDetail {
  readonly summary: SalesRequestSummary;
  readonly lines: readonly SalesRequestLine[];
  readonly guest: SalesRequestGuest | null;
  readonly timeline: readonly SalesRequestEvent[];
  /** The latest alternative stay KAS proposed (2026-11-07); absent from older servers. */
  readonly alternativeOffer?: SalesAlternativeOffer | null;
  /** How the total is made up (2026-11-10); absent from older servers. */
  readonly price?: SalesRequestPrice | null;
  /** How the guest can pay now (2026-11-12); absent from older servers. */
  readonly payment?: SalesRequestPayment | null;
}

/**
 * onlineGateway: SePay is on, a paid order confirms the booking by itself.
 * manualTransfer: a static QR is kept, the guest may also transfer by hand.
 */
export interface SalesRequestPayment {
  readonly onlineGateway: boolean;
  readonly manualTransfer: boolean;
}

/** The recorded price: roomsSubtotal − discount + taxes = total. Nothing is recomputed. */
export interface SalesRequestPrice {
  readonly roomsSubtotal: Money | null;
  readonly voucherCode: string | null;
  readonly voucherName: string | null;
  /** e.g. 50 for a 50% voucher; null for a fixed amount or a gift. */
  readonly voucherPercent: number | null;
  readonly discount: Money | null;
  readonly roomsAfterDiscount: Money | null;
  readonly taxes: readonly SalesRequestTax[];
  readonly total: Money | null;
  /** Member discount frozen at booking; absent from older servers. */
  readonly memberTier?: string | null;
  readonly memberDiscountPercent?: number | null;
  readonly memberDiscount?: Money | null;
  /** KAS points spent (1 point = 1 VND). */
  readonly pointsUsed?: number;
}

export interface SalesRequestTax {
  /** VAT, SERVICE_CHARGE, CITY_TAX, OTHER, or TAX when only the total was recorded. */
  readonly type: string;
  readonly ratePercent: number | null;
  readonly amount: Money | null;
  readonly inclusive: boolean;
}

/** What KAS suggested when it could not take the request. Nothing is held. */
export interface SalesAlternativeOffer {
  readonly propertyName: string;
  readonly roomTypeName: string | null;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly quantity: number;
  readonly total: Money | null;
  readonly message: string | null;
  readonly sentAt: string | null;
}

/**
 * One recorded transition — a row of `reservation_status_history`, oldest first.
 *
 * `actorType` and **no actor id**: `app_user` has no name column, its only
 * human-readable identifier is an email address, and no frozen document permits
 * disclosing staff identity between colleagues (doc 134 §5). The timeline says
 * whether a person or the system acted, and stops there.
 *
 * `fromStatus` is null on the first row of a lifecycle — a request did not come
 * from somewhere, it began.
 */
export interface SalesRequestEvent {
  /** `SALES` or `STAY` — a reservation carries two status machines. */
  readonly field: string;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  /** `SYSTEM`, `ADMIN` or `CUSTOMER`. */
  readonly actorType: string;
  readonly reason: string | null;
  readonly note: string | null;
  readonly at: string;
}

export interface SalesRequestLine {
  readonly roomTypeName: string;
  readonly quantity: number;
  /** Null when the stay's nights carry different rates — doc 125 §9, not a zero. */
  readonly nightly: Money | null;
  readonly lineTotal: Money | null;
}

export interface SalesRequestGuest {
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly country: string | null;
  readonly preferredChannel: string | null;
  readonly specialRequests: string | null;
}

/** The SLA states doc 69 §4.2 freezes: within promise, approaching, breached. */
export type SlaState = 'within' | 'approaching' | 'breached' | 'unknown';

/**
 * Where a request sits against its promise.
 *
 * Derived from the deadline the server already computed, never from a duration
 * this module knows. "Approaching" is the last quarter of the window — a display
 * banding, applied to the server's own deadline, that changes no commitment.
 */
export function slaState(
  request: Pick<SalesRequestSummary, 'requestedAt' | 'slaDueAt'>,
  now: number,
): SlaState {
  if (request.slaDueAt === null) {
    return 'unknown';
  }
  const due = Date.parse(request.slaDueAt);
  const from = Date.parse(request.requestedAt);
  if (Number.isNaN(due) || Number.isNaN(from) || due <= from) {
    return 'unknown';
  }
  if (now >= due) {
    return 'breached';
  }
  return now >= due - (due - from) / 4 ? 'approaching' : 'within';
}

/** Words as well as tint — doc 82 forbids state carried by colour alone. */
/**
 * How long a breached request has been overdue, or null when it is not.
 *
 * <h2>No threshold is invented here</h2>
 *
 * "Breached" means one thing only: `slaDueAt` has passed. This returns the
 * elapsed time since that instant and nothing else — no band, no escalation
 * level, no "critical after N hours". Step 16A.19 refused to invent the
 * threshold separating *within* from *approaching*, and this keeps that
 * discipline: a duration is a measurement, not a policy.
 *
 * <h2>The format is doc 69 §4.2's own</h2>
 *
 * Its queue mockup shows the SLA column as `47m`, `6h12m` and `1d 2h`. Those
 * three shapes are reproduced exactly, including the space that appears in the
 * day form and not in the hour form. Seconds never appear: the mockup has none,
 * and a queue read once an hour does not need them.
 *
 * <h2>Boundary</h2>
 *
 * At exactly `slaDueAt` the request is already breached — {@link slaState} uses
 * `now >= due` — so this returns `0m` rather than null. The badge and the
 * duration agree at that instant, which is the point.
 *
 * <p>Returns null when the request is not breached, when no deadline exists
 * (config A6 unset), or when either timestamp is unparseable. Nothing is
 * fabricated to fill the gap.
 *
 * @param now the server's clock, passed in so a wrong browser clock cannot move it
 */
export function overdueFor(
  request: Pick<SalesRequestSummary, 'requestedAt' | 'slaDueAt'>,
  now: number,
): string | null {
  if (slaState(request, now) !== 'breached' || request.slaDueAt === null) {
    return null;
  }
  const due = Date.parse(request.slaDueAt);
  if (Number.isNaN(due)) {
    return null;
  }
  return formatElapsed(now - due);
}

/**
 * How long ago the request arrived — doc 69 §4.2's `Age` column.
 *
 * <h2>One subtraction, no policy</h2>
 *
 * `now - requestedAt`, formatted. Nothing else. No band, no "old", no
 * "critical after N hours", no business-day arithmetic, no escalation: doc 21
 * §589 pairs *"Age and SLA state"* as two separate things, and this is the
 * measurement half. The banding is {@link slaState}'s and stays there.
 *
 * <p>Age and the SLA band answer different questions and may disagree — a
 * request can be four days old and still inside its promise if config A6 gives
 * it a week. Neither is derived from the other.
 *
 * <h2>The same clock, the same shapes</h2>
 *
 * `now` is the server clock the page already threads through {@link slaState},
 * so a wrong browser clock cannot age a request. The output is
 * {@link formatElapsed} — the formatter Step 16A.22 wrote, unchanged, because
 * doc 69 §4.2's `47m` / `6h12m` / `1d 2h` are the Age column's own examples.
 *
 * <h2>What is not fabricated</h2>
 *
 * Null when `requestedAt` cannot be parsed. `reservation.requested_at` is
 * nullable in V12:83 and every writer sets it, so this is defensive rather than
 * expected — but {@link slaState} is already defensive about the same field, and
 * a queue that throws on one odd row is worse than a queue with one dash.
 *
 * <p>A `requestedAt` in the future — reachable only through clock skew between
 * the database and the renderer — reads `0m`, which is {@link formatElapsed}'s
 * existing clamp rather than a new rule invented here.
 *
 * @param now the server's clock, passed in so a wrong browser clock cannot move it
 */
export function ageFor(
  request: Pick<SalesRequestSummary, 'requestedAt'>,
  now: number,
): string | null {
  const from = Date.parse(request.requestedAt);
  if (Number.isNaN(from)) {
    return null;
  }
  return formatElapsed(now - from);
}

/**
 * Doc 69 §4.2's three shapes: `47m`, `6h12m`, `1d 2h`.
 *
 * Shared by {@link overdueFor} and {@link ageFor} so the queue's two durations
 * are formatted once. The behaviour is Step 16A.22's, unchanged — including the
 * clamp at zero and the minutes dropped past a day.
 */
function formatElapsed(elapsedMs: number): string {
  const totalMinutes = Math.max(Math.floor(elapsedMs / 60_000), 0);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    // Minutes are dropped past a day, as the mockup drops them.
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  return `${minutes}m`;
}

export const SLA_LABEL: Readonly<Record<SlaState, string>> = {
  within: 'Trong cam kết',
  approaching: 'Sắp đến hạn',
  breached: 'Đã quá hạn',
  unknown: 'Chưa có hạn',
};

/** `2026-09-12 → 2026-09-14 · 2 đêm`, from the server's own dates and count. */
export function stayLabel(request: SalesRequestSummary): string {
  return `${request.checkIn} → ${request.checkOut} · ${request.nights} đêm`;
}

/** The display name, falling back to the slug the backend addressed it by. */
export function propertyLabel(request: SalesRequestSummary): string {
  return request.propertyName ?? request.propertySlug;
}

/**
 * The four `sales_status` values doc 54 §4 freezes at, from which nothing moves.
 *
 * Kept beside {@link isOpenRequest} rather than inside it because
 * `SalesRequestDetailView` already holds the same four to decide whether to
 * offer any transition at all, and two copies of a terminal set is exactly the
 * kind of pair that drifts.
 */
export const TERMINAL_SALES_STATUSES: ReadonlySet<string> = new Set([
  'WON',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
  // Owner decision 2026-11-07: proposing another stay ends the request.
  'ALTERNATIVE_OFFERED',
]);

/**
 * Whether this request is still something a partner can act on.
 *
 * <h2>Why the queue needs this at all</h2>
 *
 * The endpoint returns the whole queue — every status, terminal ones included —
 * because a sales team needs to look up what happened to a request it declined
 * last week. Anything that presents that list as "what needs me" has to say
 * which rows actually do, and a count that does not is worse than no count: it
 * sends someone looking for work that closed days ago.
 *
 * <p>Open is defined as *not terminal* rather than as a list of live statuses,
 * so a status added to the enum later counts as open and shows up, instead of
 * disappearing from the one number that is supposed to mean "everything".
 */
export function isOpenRequest(request: SalesRequestSummary): boolean {
  return !TERMINAL_SALES_STATUSES.has(request.salesStatus);
}

/**
 * How a status reads at a glance.
 *
 * <h2>Why the enum is shown rather than translated</h2>
 *
 * Doc 69 keeps `salesStatus` in the sales team's own vocabulary, and the queue's
 * own status filter offers exactly these words — translating the badge and not
 * the filter would leave an operator unable to tell which option matches the row
 * in front of them. So the text stays verbatim and the tone carries the meaning
 * alongside it: never colour alone, and never a second vocabulary.
 */
export function salesStatusTone(salesStatus: string): 'success' | 'neutral' | 'warning' | 'info' {
  if (salesStatus === 'WON') {
    return 'success';
  }
  if (salesStatus === 'EXPIRED') {
    // Warning rather than danger: nobody decided this, the clock did, and it is
    // the one terminal state that usually means a request was missed.
    return 'warning';
  }
  if (TERMINAL_SALES_STATUSES.has(salesStatus)) {
    return 'neutral';
  }
  return 'info';
}

/** Vietnamese names for the `sales_status` enum, for the console's badges. Unknown values render as-is. */
export const SALES_STATUS_LABEL: Readonly<Record<string, string>> = {
  REQUESTED: 'Chờ phản hồi',
  ASSIGNED: 'Đã phân công',
  AVAILABILITY_CHECK: 'Đang kiểm tra phòng',
  CUSTOMER_CONTACTED: 'Đã liên hệ khách',
  ALTERNATIVE_OFFERED: 'Đã đề xuất phương án khác',
  PAYMENT_PENDING: 'Chờ thanh toán',
  WON: 'Đã xác nhận',
  DECLINED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Quá hạn',
};

export function salesStatusLabel(salesStatus: string): string {
  return SALES_STATUS_LABEL[salesStatus] ?? salesStatus;
}

/**
 * The statuses still waiting for the hotel's first answer — the backend's
 * `SalesRequestExpiryService.EXPIRABLE`, which moves them to `EXPIRED` once
 * their deadline passes.
 */
export const AWAITING_SALES_STATUSES: ReadonlySet<string> = new Set(['REQUESTED', 'ASSIGNED', 'AVAILABILITY_CHECK']);

export type DeadlineState = 'remaining' | 'overdue' | 'answered' | 'none';

export interface Deadline {
  readonly state: DeadlineState;
  /** e.g. "Còn 3 giờ 20 phút", "Quá hạn 2 ngày 4 giờ", "Đã phản hồi". */
  readonly text: string;
}

/**
 * The response deadline as the console shows it, from the stored `slaDueAt` and
 * the server clock. A request still awaiting an answer shows the time left (or,
 * in the minute before the backend sweep closes it, the time overdue); an
 * expired one shows how long ago its deadline passed; anything else was answered.
 */
export function deadlineFor(
  request: Pick<SalesRequestSummary, 'salesStatus' | 'slaDueAt'>,
  now: number,
): Deadline {
  const due = request.slaDueAt === null ? Number.NaN : Date.parse(request.slaDueAt);
  const awaiting = AWAITING_SALES_STATUSES.has(request.salesStatus);
  if (!awaiting && request.salesStatus !== 'EXPIRED') {
    return { state: 'answered', text: 'Đã phản hồi' };
  }
  if (Number.isNaN(due)) {
    return { state: 'none', text: 'Chưa có hạn' };
  }
  if (awaiting && now < due) {
    return { state: 'remaining', text: `Còn ${formatDurationVi(due - now)}` };
  }
  return { state: 'overdue', text: `Quá hạn ${formatDurationVi(now - due)}` };
}

/** "2 ngày 4 giờ", "3 giờ 20 phút", "12 phút" — minutes are dropped past a day. */
export function formatDurationVi(ms: number): string {
  const totalMinutes = Math.max(Math.floor(ms / 60_000), 0);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
  }
  return `${minutes} phút`;
}

/** dd/MM/yyyy HH:mm in KAS business time (Asia/Ho_Chi_Minh). */
export function formatBusinessDateTime(iso: string | null): string {
  if (iso === null) {
    return '—';
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at);
}

/** The inbox's time sections, in Asia/Ho_Chi_Minh calendar days. */
export type RequestAgeGroup = 'Hôm nay' | 'Hôm qua' | '7 ngày gần đây' | 'Cũ hơn';

const BUSINESS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Days since the epoch of the business-calendar date of an instant. */
function businessDayNumber(at: number): number {
  const [year, month, day] = BUSINESS_DAY.format(at).split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/**
 * Which section of the inbox a request falls in, by the calendar day it was sent
 * on (business time), relative to `now`. A timestamp in the future — clock skew
 * only — counts as today; an unparseable one as older.
 */
export function requestAgeGroup(requestedAt: string, now: number): RequestAgeGroup {
  const at = Date.parse(requestedAt);
  if (Number.isNaN(at)) {
    return 'Cũ hơn';
  }
  const days = businessDayNumber(now) - businessDayNumber(at);
  if (days <= 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return '7 ngày gần đây';
  return 'Cũ hơn';
}

/** "5 phút trước", "3 giờ trước", "2 ngày trước" — one unit, for a glance. */
export function formatAgoVi(ms: number): string {
  const minutes = Math.max(Math.floor(ms / 60_000), 0);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

/**
 * "HH:mm dd/MM" in business time, with the year only when it is not the year of
 * `now` — for dense table cells; the detail page keeps the full form.
 */
export function formatBusinessDateTimeShort(iso: string | null, now: number): string {
  if (iso === null) {
    return '—';
  }
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return '—';
  }
  const sameYear = BUSINESS_DAY.format(at).split('-')[0] === BUSINESS_DAY.format(now).split('-')[0];
  if (!sameYear) {
    return formatBusinessDateTime(iso);
  }
  const parts = Object.fromEntries(
    SHORT_PARTS.formatToParts(at).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`;
}

const SHORT_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
