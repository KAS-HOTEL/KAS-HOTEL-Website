import { api } from '../client';
import type { AlternativeOffer } from '@/lib/domain/manualBooking';
import type { SalesRequestDetail, SalesRequestSummary } from '@/lib/domain/salesRequest';

/**
 * The contact-log body — the four fields `ContactRequestBody` accepts, and no
 * others. `spring.jackson.fail-on-unknown-properties` makes an extra field a
 * 400, so this type is a pinned contract rather than a convenience.
 */
export interface ContactLogEntry {
  readonly channel: string;
  readonly direction: string;
  readonly outcome: string | null;
  readonly notes: string | null;
}

/**
 * The direct sales queue — doc 58 §5, `/admin/sales`.
 *
 * <h2>`/admin`, not `/partner`</h2>
 *
 * There is no `PARTNER` role and no `/api/v1/partner` namespace. `ADMIN` **is**
 * the partner-facing role — doc 85 §5.2 gives it PARTNER scope — and OQ-129
 * (resolved, doc 100 §14.1) approved a separate `/partner/**` **frontend** IA
 * while stating it creates "no `PARTNER` role, permission, authentication model
 * or API namespace". The route group is a frontend decision; the API is not.
 *
 * <h2>Scoped in the backend's SQL</h2>
 *
 * Ownership is `reservation → property → partner`, applied inside the query. The
 * client sends no partner id and could not widen the result if it tried; another
 * partner's request answers **404**, never 403, so a reference cannot be used to
 * confirm that a booking exists.
 */

/**
 * The queue's filters — doc 58 §5's
 * `?salesStatus,leadSource,owner,slaState,property`, as far as their semantics
 * are frozen.
 *
 * `owner` is absent: doc 134 established that nothing in this repository yields
 * an assignable owner's identity. `slaState` accepts only `breached`, the one
 * band doc 69 §127 defines exactly — "within" and "approaching" are named but
 * separated by no frozen threshold, and the backend refuses them.
 */
export interface SalesQueueFilters {
  readonly salesStatus?: string;
  readonly leadSource?: string;
  readonly property?: string;
  readonly slaState?: 'breached';
  /**
   * One of the queue's views, whose status sets the backend owns:
   * `awaiting` (not yet answered, within its deadline), `expired` (the deadline
   * passed unanswered — moved to `EXPIRED` by the backend), `accepted` (the hotel
   * accepted: awaiting payment or won). Absent means every request.
   */
  readonly queue?: SalesQueueView;
  /** Zero-based page; sent with `size`. Absent returns every row. */
  readonly page?: number;
  readonly size?: number;
  /** Matches the request code or the guest's name (case-insensitive). */
  readonly q?: string;
  /** Newest first unless `oldest`; the backend breaks ties by reference. */
  readonly sort?: 'newest' | 'oldest';
}

/** Optional details of a staff cancellation (2026-11-07). */
export interface CancelOptions {
  readonly requestedBy?: 'GUEST' | 'KAS';
  readonly paymentChecked?: boolean;
}

export type SalesQueueView = 'awaiting' | 'expired' | 'accepted' | 'alternative';

/** `GET /api/v1/admin/sales/requests/counts` — counted in the database, per hotel. */
export interface SalesQueueCounts {
  readonly all: number;
  readonly awaiting: number;
  readonly expired: number;
  readonly accepted: number;
  /** Closed with an alternative stay proposed (terminal since 2026-11-07). */
  readonly alternative: number;
}

function definedOnly(filters: object): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  ) as Record<string, string | number>;
}

/**
 * One internal note — doc 58 §5, *"Internal. No guest surface exists"*.
 *
 * No author: the row records an `admin_id`, and disclosing staff identity
 * between colleagues is unresolved (doc 134 §5). The status timeline withholds
 * the same field for the same reason.
 */
export interface SalesRequestNote {
  readonly body: string;
  readonly createdAt: string;
}

export interface EmailDeliveryStatus {
  readonly eventKey: string;
  readonly status: 'PENDING' | 'PROCESSING' | 'RETRY' | 'SENT' | 'FAILED';
  readonly attempts: number;
  readonly nextAttemptAt: string | null;
  readonly sentAt: string | null;
  readonly lastErrorCode: string | null;
}

export const salesRequestsApi = {
  approvePayment: (reference: string) =>
    api.post<void>(`/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/approve-payment`),
  proposeAlternative: (reference: string, body: AlternativeOffer) =>
    api.post<void>(`/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/propose-alternative`, body),
  /**
   * `GET /api/v1/admin/sales/requests?locale=` — permission `sales.request.view`.
   *
   * Newest first by default (`sort=oldest` reverses it), paged with
   * `page`/`size`, searched with `q`. The tab counts come from `counts` with the
   * same hotel and search, so the pager's total matches the list.
   */
  counts: (property: string | undefined, cookieHeader?: string, q?: string) =>
    api.get<SalesQueueCounts>('/api/v1/admin/sales/requests/counts', {
      query: definedOnly({ property, q }),
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),
  queue: (locale: string, filters: SalesQueueFilters = {}, cookieHeader?: string) =>
    api.get<SalesRequestSummary[]>('/api/v1/admin/sales/requests', {
      // Only the filters actually set are sent. An absent filter and an empty
      // one are different things to the backend, and an untouched select must
      // not narrow the queue.
      query: { locale, ...definedOnly(filters) },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /**
   * `GET /api/v1/admin/sales/requests/{reference}/notes` — permission
   * `sales.request.manage` (doc 58 §5, *"Internal. No guest surface exists"*).
   *
   * Newest first, the order V14's own index was built for. Returns `[]` for a
   * request nobody has written about — an ordinary state, not an error.
   */
  notes: (reference: string, cookieHeader?: string) =>
    api.get<SalesRequestNote[]>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/notes`,
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /**
   * `POST /api/v1/admin/sales/requests/{reference}/notes` — the same route and
   * permission.
   *
   * The body is the only field. The author is the session and the timestamp is
   * the server's; sending either is a **400**, because
   * `fail-on-unknown-properties` refuses a field the contract does not have.
   *
   * A note is informational: it moves no status, touches no hold, records no
   * contact and sends nothing. Returns **204**; re-read the list.
   */
  addNote: (reference: string, body: string) =>
    api.post<void>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/notes`,
      { body },
    ),

  /**
   * `GET /api/v1/admin/sales/requests/{reference}?locale=` — the workspace.
   *
   * `guest` is present only when the caller holds `customer.view`, and the
   * backend logs the disclosure when it is — doc 59:148.
   */
  detail: (reference: string, locale: string, cookieHeader?: string) =>
    api.get<SalesRequestDetail>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}`,
      { query: { locale }, ...(cookieHeader === undefined ? {} : { cookieHeader }) },
    ),

  emailDeliveries: (reference: string, cookieHeader?: string) =>
    api.get<EmailDeliveryStatus[]>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/email-deliveries`,
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /**
   * `POST /api/v1/admin/sales/requests/{reference}/decline` — S11, permission
   * `reservation.cancel`, **reason required** (doc 58 §5).
   *
   * Moves `salesStatus` to `DECLINED`, releases every ACTIVE hold and gives the
   * nights back to `direct_committed` — one transaction, on the server.
   *
   * **It sends nothing to the guest.** Doc 54 S11 lists "guest email + in-app"
   * in its Notification column, and doc 117 §8.1 freezes that a transition owes
   * the business effect and the durable record, not delivery. Delivery is
   * OQ-162 and no mail sender exists.
   *
   * Refuses **400** for a blank reason · **404** for a reference that is absent,
   * another partner's, or an OTA reservation · **409 `ILLEGAL_TRANSITION`** for
   * a request already in a terminal state, which is what a second decline is.
   * Returns 204 with no body; re-read the detail to see the new state.
   */
  decline: (reference: string, reason: string) =>
    api.post<void>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/decline`,
      { reason },
    ),

  /**
   * `POST /api/v1/admin/sales/requests/{reference}/cancel` — S12, permission
   * `reservation.cancel`, **reason required** — doc 58 §5's same row as
   * `/decline`, under the same permission and the same guard.
   *
   * Doc 54 S12 gives it the same source set as the decline ("any non-terminal")
   * and the same Hold column ("all holds released"), so the inventory effect is
   * identical. What differs is the record: `salesStatus` reaches `CANCELLED`,
   * the audit event is `reservation.cancelled`, and the backend writes
   * `cancelled_at` and `cancellation_reason` — the two columns a decline
   * deliberately leaves null.
   *
   * **It sends nothing to the guest.** Doc 54 S12 lists "guest email + in-app";
   * doc 117 §8.1 freezes that a transition owes the business effect and the
   * durable record, not delivery. Delivery is OQ-162 and no mail sender exists.
   *
   * This is the **sales** half of S12, whose actors doc 54 gives as "C / S". The
   * customer half is `POST /api/v1/me/stays/{reference}/cancel`. The Backend
   * route is implemented; its Next.js client/UI will arrive with the consuming
   * customer-stays screen.
   *
   * Refuses **400** for a blank reason · **404** for a reference that is absent,
   * another partner's, or an OTA reservation · **409 `ILLEGAL_TRANSITION`** for
   * a request already terminal, which is what a second cancel is — and what a
   * cancel after a win or a decline is. Returns 204 with no body; re-read the
   * detail to see the new state.
   */
  /**
   * `requestedBy`: who asked (GUEST / KAS), recorded beside the agent who did it.
   * `paymentChecked`: required only after the guest reported a bank transfer.
   */
  cancel: (reference: string, reason: string, options: CancelOptions = {}) =>
    api.post<void>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/cancel`,
      {
        reason,
        ...(options.requestedBy === undefined ? {} : { requestedBy: options.requestedBy }),
        ...(options.paymentChecked === true ? { paymentChecked: true } : {}),
      },
    ),

  /**
   * `POST /api/v1/admin/sales/requests/{reference}/availability-check` — S3/S4,
   * permission `sales.request.manage` (doc 58 §5, *"Live re-check"*).
   *
   * One endpoint for two transitions, because doc 54 gives both the same
   * destination. From `ASSIGNED` it is **S3**; from `REQUESTED` it is **S4**,
   * whose side effects doc 54 states as *"S2 + S3"* — the same check preceded by
   * an implicit self-assignment to the acting agent. The source state decides
   * which one it is, and the server decides that, not this client.
   *
   * **No body.** The reservation already carries its property, dates and lines;
   * sending any of them would let the caller choose what gets checked.
   *
   * Refuses **404** for a reference that is absent, another partner's, or an OTA
   * reservation · **409 `ILLEGAL_TRANSITION`** from any other source state,
   * including a request already at `AVAILABILITY_CHECK` — doc 54 has no
   * self-transition and none was invented · **422 `NO_AVAILABILITY`** when the
   * live re-check finds the rooms are gone, in which case the server rolls the
   * whole transition back.
   *
   * Returns **204** with no body. Re-read the detail to see the new state: this
   * call reports that the transition happened, never what it produced.
   */
  availabilityCheck: (reference: string) =>
    api.post<void>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/availability-check`,
    ),

  /**
   * `POST /api/v1/admin/sales/requests/{reference}/contact` — S5/S6, permission
   * `sales.request.manage` (doc 58 §5, *"Log a contact"*).
   *
   * One route for two transitions, because doc 54 gives both
   * `CUSTOMER_CONTACTED` as their destination: **S5** from
   * `AVAILABILITY_CHECK`, **S6** from `ASSIGNED` — *"permitted: clarify dates
   * before checking"*. The source state distinguishes them and the server holds
   * it. **S9** (`ALTERNATIVE_OFFERED → CUSTOMER_CONTACTED`) is refused by the
   * backend: it releases alternative holds, and that is not implemented.
   *
   * The body is doc 54 S5's side effect — *"contact recorded: channel,
   * direction, outcome"* — plus the notes doc 29:275 lists beside them.
   * `channel` and `direction` are required and carry the `contact_channel` /
   * `contact_direction` enum values verbatim; `outcome` and `notes` are
   * nullable, exactly as their columns are. **Neither the timestamp nor the
   * agent is sent**: the server takes the first from the column default and the
   * second from the session.
   *
   * **Nothing is sent to the guest**, and no inventory moves — doc 54's Hold
   * column for S5 and S6 is "maintained".
   *
   * Refuses **400** for a missing or non-enum `channel`/`direction`, or an
   * undocumented field · **404** for a reference that is absent, another
   * partner's, or an OTA reservation · **409 `ILLEGAL_TRANSITION`** from any
   * other source state, including a request already at `CUSTOMER_CONTACTED` —
   * doc 54 has no self-transition and none was invented. Returns 204; re-read
   * the detail to see the new state.
   */
  contact: (reference: string, entry: ContactLogEntry) =>
    api.post<void>(
      `/api/v1/admin/sales/requests/${encodeURIComponent(reference)}/contact`,
      entry,
    ),
} as const;
