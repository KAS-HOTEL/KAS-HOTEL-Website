import { api } from '../client';
import type { ReservationDetail, ReservationPage } from '@/lib/domain/reservation';

/**
 * The reservation workspace — doc 58 §6, `/admin/ops/reservations`.
 *
 * <h2>Separate from `salesRequests.ts`, deliberately</h2>
 *
 * That module wraps `/admin/sales/requests`: the DIRECT sales queue, its
 * transitions and its notes. This one wraps the operations read — every channel,
 * `stayStatus` rather than `salesStatus` — and the three stay transitions doc 58
 * §6 freezes on this path: check-in, check-out and no-show.
 *
 * <h2>Scoped in the backend's SQL</h2>
 *
 * Ownership is `reservation → property → partner`, applied inside every query
 * including the count behind `total`. The client sends no partner id and could
 * not widen the result if it tried; another partner's reservation is absent from
 * the list, unfindable by any search term, uncounted, and answers **404** on
 * direct access — never 403, which would confirm the reference exists.
 */

/**
 * The search parameters the backend accepts.
 *
 * Doc 58 §6 freezes `stayStatus`, `channelType`, `property`, `checkIn` and
 * `checkOut`. `q`, the second bound on each date, `roomType`, `bookedFrom` /
 * `bookedTo` and the two page parameters are additions this workspace needs —
 * see `OpsReservationController` for each one's justification.
 *
 * There is **no `salesStatus`**: it is DIRECT-only and belongs to the other
 * workspace.
 */
export interface ReservationSearchFilters {
  /** Matched against the reference and guest name — and, with `customer.view`, phone and email. */
  readonly q?: string;
  readonly stayStatus?: string;
  readonly channelType?: string;
  /** A property slug, never an id. */
  readonly property?: string;
  /** A room-type slug, matched against the reservation's lines. */
  readonly roomType?: string;
  readonly checkInFrom?: string;
  readonly checkInTo?: string;
  readonly checkOutFrom?: string;
  readonly checkOutTo?: string;
  readonly bookedFrom?: string;
  readonly bookedTo?: string;
  readonly page?: number;
  readonly size?: number;
}

function definedOnly(filters: ReservationSearchFilters): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export type StayAction = 'check-in' | 'check-out' | 'no-show' | 'undo-check-out';

/** A checked-in stay whose guest asked to check out (or whose check-out time passed), V59. */
export interface CheckoutRequest {
  readonly reference: string;
  readonly propertySlug: string;
  readonly propertyName: string;
  readonly guestName: string | null;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly requestedAt: string;
  /** GUEST: the guest pressed "Trả phòng"; AUTO: the check-out time passed. */
  readonly source: 'GUEST' | 'AUTO' | string;
}

export interface StayTransition {
  readonly reference: string;
  readonly previousStatus: string;
  readonly stayStatus: string;
}

export const opsReservationsApi = {
  /**
   * `GET /api/v1/admin/ops/reservations` — permission `reservation.view`.
   *
   * Newest first, by `created_at` then `reference`. That pair is a total order,
   * which is what makes an offset page stable — without the tie-break a row
   * could appear on two pages or on neither.
   *
   * Only the filters actually set are sent: an absent filter and an empty one
   * are different things to the backend, and an untouched select must not narrow
   * the list.
   *
   * An unknown `stayStatus` or `channelType` is a **400** naming the parameter;
   * an unknown `property` or `roomType` slug is an empty page, because refusing
   * it would tell the caller which slugs are real. A range whose end precedes
   * its start is a **400**, not an empty page, so a mistyped date does not read
   * as "no reservations".
   */
  search: (locale: string, filters: ReservationSearchFilters = {}, cookieHeader?: string) =>
    api.get<ReservationPage>('/api/v1/admin/ops/reservations', {
      query: { locale, ...definedOnly(filters) },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /**
   * `GET /api/v1/admin/ops/reservations/{reference}?locale=` — the workspace.
   *
   * **Any channel**, unlike the sales detail, which 404s an OTA reservation
   * because doc 58 §5 scopes that API to DIRECT at the data layer.
   *
   * `guest` is present only when the session holds `customer.view`, and the
   * backend logs the disclosure when it is — doc 59:148.
   */
  detail: (reference: string, locale: string, cookieHeader?: string) =>
    api.get<ReservationDetail>(
      `/api/v1/admin/ops/reservations/${encodeURIComponent(reference)}`,
      { query: { locale }, ...(cookieHeader === undefined ? {} : { cookieHeader }) },
    ),

  /** `GET /api/v1/admin/ops/reservations/checkout-requests` — stays waiting for check-out confirmation. */
  checkoutRequests: (locale: string, cookieHeader?: string) =>
    api.get<CheckoutRequest[]>('/api/v1/admin/ops/reservations/checkout-requests', {
      query: { locale }, ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /** `POST /api/v1/admin/ops/reservations/{reference}/{check-in|check-out|no-show|undo-check-out}` */
  transition: (reference: string, action: StayAction) =>
    api.post<StayTransition>(
      `/api/v1/admin/ops/reservations/${encodeURIComponent(reference)}/${action}`,
    ),
} as const;
