import Link from 'next/link';
import type { SalesRequestNote } from '@/lib/api/endpoints';
import type { EmailDeliveryStatus } from '@/lib/api/endpoints/salesRequests';
import { formatMoney } from '@/lib/domain/availability';
import {
  deadlineFor,
  formatBusinessDateTime,
  formatDurationVi,
  propertyLabel,
  salesStatusLabel,
  salesStatusTone,
  TERMINAL_SALES_STATUSES,
  type SalesRequestDetail,
  type SalesRequestPrice,
} from '@/lib/domain/salesRequest';
// Three label helpers, not a dependency on the reservation workspace: they turn
// a contact-channel token, a country code and an absent field into words, and
// the two screens must read the same guest the same way. `ReservationLinesCard`
// below is shared on the same reasoning.
import { contactChannelLabel, countryLabel, present } from '@/lib/domain/reservation';
import {
  RESERVATION_LINES_COPY,
  ReservationLinesCard,
} from '@/features/reservation/ReservationLinesCard';
import { Badge, Card } from '@/ui/primitives';
import { CANCEL_COPY, CancelRequestPanel } from './CancelRequestPanel';
import { DECLINE_COPY, DeclineRequestPanel } from './DeclineRequestPanel';
import { InternalNotesPanel, NOTES_COPY } from './InternalNotesPanel';
import { ManualBookingActions } from './ManualBookingActions';
import styles from './SalesRequest.module.css';

/**
 * One direct request, opened — doc 58 §5's "full workspace", as far as the
 * contract currently reaches.
 *
 * <h2>Two actions, each offered only where the contract allows it</h2>
 *
 * Doc 69 §4.3 sketches a workflow column — assign, check availability, confirm,
 * decline. Two of the four are surfaced here:
 *
 * <ul>
 *   <li>**Check availability (S3/S4)** — offered from `REQUESTED` and
 *       `ASSIGNED`, the two source states the backend accepts. Doc 54 has no
 *       `AVAILABILITY_CHECK → AVAILABILITY_CHECK` row, so an already-checked
 *       request is offered nothing rather than a button the server would 409.</li>
 *   <li>**Contact logged (S5/S6)** — offered from `ASSIGNED` and
 *       `AVAILABILITY_CHECK`, doc 54's two source states for it. It records a
 *       conversation and moves the request to `CUSTOMER_CONTACTED`, which is
 *       one of the states a win accepts. No confirmation: it releases nothing
 *       and moves no rooms.</li>
 *   <li>**Win (S10)** — offered from `AVAILABILITY_CHECK`,
 *       `CUSTOMER_CONTACTED` and `ALTERNATIVE_OFFERED`, doc 54 S10's three
 *       source states. `REQUESTED` is absent because doc 54 prohibits it, which
 *       is what the availability check exists to resolve.</li>
 *   <li>**Decline (S11)** and **Cancel (S12)** — both offered while the request
 *       is non-terminal, which is the source set doc 54 gives each of them. They
 *       are separate actions because they mean different things: a decline is
 *       KAS refusing, a cancel records that the guest withdrew. Doc 54 freezes
 *       `salesStatus` at its terminal value, so a request that has reached one
 *       has no action left.</li>
 * </ul>
 *
 * **Assign (S2) has a working backend and no UI**, and that is a contract gap
 * rather than a build one: `POST /assign` needs a `salesOwnerId`, and doc 134
 * established that no endpoint, response field or session value in this
 * repository yields one. It is absent rather than disabled.
 *
 * The gates here are a convenience. The backend applies the real ones — its own
 * source-state check, its permission and its scope filter — so a button that
 * should not have rendered still cannot perform a transition.
 *
 * <h2>Guest contact appears only when the server sends it</h2>
 *
 * `guest` is null unless the caller holds `customer.view`; the backend logs the
 * disclosure when it does (doc 59:148). Nothing here re-fetches it, caches it or
 * puts it in a URL.
 */
export function SalesRequestDetailView({
  request,
  now,
  notes = [],
  notesFailed = false,
  emailDeliveries = [],
  emailDeliveriesFailed = false,
}: {
  readonly request: SalesRequestDetail;
  readonly now: number;
  /** Internal notes, newest first — doc 58 §5. Their own scoped read. */
  readonly notes?: readonly SalesRequestNote[];
  /** True when that read failed, which is not the same as there being none. */
  readonly notesFailed?: boolean;
  readonly emailDeliveries?: readonly EmailDeliveryStatus[];
  readonly emailDeliveriesFailed?: boolean;
}) {
  const { summary, lines, guest } = request;
  const deadline = deadlineFor(summary, now);
  const sentAt = Date.parse(summary.requestedAt);
  const sentAgo = Number.isNaN(sentAt) ? null : formatDurationVi(Math.max(now - sentAt, 0));

  return (
    <div className={styles.detail}>
      <Link href="/partner/requests" className={styles.backLink}>
        ‹ Yêu cầu đặt phòng
      </Link>

      <header className={styles.detailHeader}>
        <div className={styles.detailHeading}>
          <h1 className={styles.reference}>{summary.reference}</h1>
          <div className={styles.detailBadges}>
            {/* Toned the same way the queue tones it, so one request does not
                change colour between the list and the page it opens. */}
            <Badge tone={salesStatusTone(summary.salesStatus)}>{salesStatusLabel(summary.salesStatus)}</Badge>
          </div>
        </div>
        <p className={styles.detailMeta}>
          {summary.guestName ?? 'Khách'} · {propertyLabel(summary)} · Gửi lúc {formatBusinessDateTime(summary.requestedAt)}
        </p>
      </header>

      <div className={styles.detailLayout}>
        {/* Left: what was asked for. */}
        <div className={styles.detailMain}>
          <Card title="Kỳ nghỉ">
            <dl className={styles.facts}>
              <Fact label="Khách sạn" value={propertyLabel(summary)} />
              <Fact label="Nhận – trả phòng" value={`${viDate(summary.checkIn)} – ${viDate(summary.checkOut)}`} />
              <Fact label="Số đêm" value={`${summary.nights} đêm`} />
              <Fact
                label="Số khách"
                value={`${summary.adults} người lớn${summary.children > 0 ? `, ${summary.children} trẻ em` : ''}`}
              />
              <Fact label="Số phòng" value={String(summary.rooms)} />
              <Fact
                label="Giá trị"
                value={summary.total === null ? '—' : formatMoney(summary.total)}
              />
            </dl>
          </Card>

          {request.price ? (
            <Card title="Chi tiết giá">
              <PriceBreakdown price={request.price} nights={summary.nights} rooms={summary.rooms} />
            </Card>
          ) : null}

          <Card title="Phòng đã yêu cầu">
            {/* The same section the reservation workspace renders, so a line
                means the same thing on both screens. */}
            <ReservationLinesCard lines={lines} copy={RESERVATION_LINES_COPY} />
          </Card>

          {/* 2026-11-07: proposing another stay ends the request. Show what was
              suggested; there is nothing left to act on. */}
          {request.alternativeOffer ? (
            <Card title="Phương án đã đề xuất">
              <dl className={styles.facts}>
                <Fact label="Khách sạn" value={request.alternativeOffer.propertyName} />
                <Fact label="Loại phòng" value={`${request.alternativeOffer.roomTypeName ?? '—'} × ${request.alternativeOffer.quantity}`} />
                <Fact
                  label="Nhận – trả phòng"
                  value={`${viDate(request.alternativeOffer.checkIn)} – ${viDate(request.alternativeOffer.checkOut)}`}
                />
                <Fact
                  label="Giá đề xuất"
                  value={request.alternativeOffer.total === null ? '—' : formatMoney(request.alternativeOffer.total)}
                />
                {request.alternativeOffer.message ? (
                  <Fact label="Lời nhắn cho khách" value={request.alternativeOffer.message} />
                ) : null}
              </dl>
              <p className={styles.note}>
                Yêu cầu này đã kết thúc. Đề xuất không giữ phòng; nếu khách muốn lưu trú theo phương án
                này, khách tạo yêu cầu mới trên website.
              </p>
            </Card>
          ) : null}

          {/* Only the two values you can act on — address and number — are
              links; absent fields are left out rather than printed as dashes. */}
          <Card title="Khách">
            {guest === null ? (
              <p className={styles.note}>
                Tài khoản của bạn không có quyền xem thông tin liên hệ của khách.
              </p>
            ) : (
              <dl className={styles.facts}>
                {present(guest.fullName) ? (
                  <Fact label="Họ và tên" value={guest.fullName} />
                ) : null}
                {present(guest.email) ? (
                  <Fact label="Email">
                    <a className={styles.contactLink} href={`mailto:${guest.email}`}>
                      {guest.email}
                    </a>
                  </Fact>
                ) : null}
                {present(guest.phone) ? (
                  <Fact label="Điện thoại">
                    <a className={styles.contactLink} href={`tel:${guest.phone}`}>
                      {guest.phone}
                    </a>
                  </Fact>
                ) : null}
                {present(guest.country) ? (
                  <Fact label="Quốc gia" value={countryLabel(guest.country)} />
                ) : null}
                {present(guest.preferredChannel) ? (
                  <Fact label="Liên hệ qua" value={contactChannelLabel(guest.preferredChannel)} />
                ) : null}
                {present(guest.specialRequests) ? (
                  <Fact label="Yêu cầu thêm" value={guest.specialRequests} />
                ) : null}
              </dl>
            )}
          </Card>

          {/* Notes are an agent's own context, in their own table — never mixed
              into the status history on the right. */}
          <InternalNotesPanel
            reference={summary.reference}
            notes={notes}
            failed={notesFailed}
            copy={NOTES_COPY}
          />
        </div>

        {/* Right: where it stands and what can be done next. */}
        <aside className={styles.detailSide} aria-label="Xử lý yêu cầu">
          <Card title="Xử lý">
            <dl className={styles.timing}>
              <div>
                <dt>Trạng thái hiện tại</dt>
                <dd>{salesStatusLabel(summary.salesStatus)}{sentAgo === null ? '' : ` · đã gửi ${sentAgo}`}</dd>
              </div>
              <div>
                <dt>Ngày tạo yêu cầu</dt>
                <dd>{formatBusinessDateTime(summary.requestedAt)}</dd>
              </div>
              <div>
                <dt>Thời hạn phản hồi</dt>
                <dd>{formatBusinessDateTime(summary.slaDueAt)}</dd>
              </div>
              <div>
                <dt>{deadline.state === 'overdue' ? 'Số thời gian quá hạn' : 'Thời gian còn lại'}</dt>
                <dd className={deadline.state === 'overdue' ? styles.deadlineOverdue : undefined}>{deadline.text}</dd>
              </div>
            </dl>
          </Card>

          <ManualBookingActions request={summary} />


          <RequestHistory events={request.timeline} />

          <Card title="Trạng thái email">
            {emailDeliveriesFailed ? (
              <p className={styles.note}>Không tải được trạng thái gửi email. Quyết định đặt phòng được lưu riêng.</p>
            ) : emailDeliveries.length === 0 ? (
              <p className={styles.note}>Chưa có email nào được xếp hàng cho yêu cầu này.</p>
            ) : (
              <div className={styles.facts}>
                {emailDeliveries.map((delivery) => (
                  <p key={delivery.eventKey}>
                    {emailEventLabel(delivery.eventKey)} · <strong>{emailDeliveryState(delivery).status}</strong>
                    {emailDeliveryState(delivery).detail ? ` · ${emailDeliveryState(delivery).detail}` : ''}
                    {delivery.sentAt ? ` · ${formatBusinessDateTime(delivery.sentAt)}` : ''}
                  </p>
                ))}
              </div>
            )}
          </Card>


          {/* Ending a request cannot be undone, so its two forms stay folded
              away until someone opens them deliberately. */}
          {TERMINAL.has(summary.salesStatus) ? null : (
            <details className={styles.moreActions}>
              <summary>Từ chối hoặc huỷ yêu cầu</summary>
              <div className={styles.actions}>
                <DeclineRequestPanel reference={summary.reference} copy={DECLINE_COPY} />
                <CancelRequestPanel reference={summary.reference} copy={CANCEL_COPY} />
              </div>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * The request's status changes, newest first, in the same Vietnamese the badge
 * uses. It says who acted (the system, staff or the guest) and when — never
 * which staff member, which the backend does not disclose. Internal reason codes
 * are named when known and otherwise left out; a reason typed by staff (a
 * decline or cancellation) is shown. The machine's own `note` (English, for the
 * audit trail) and the stay lifecycle are not drawn here.
 */
function RequestHistory({ events }: { readonly events: SalesRequestDetail['timeline'] }) {
  const sales = events.filter((event) => event.field !== 'STAY').slice().reverse();
  return (
    <Card title="Lịch sử cập nhật">
      {sales.length === 0 ? (
        <p className={styles.note}>Chưa có cập nhật nào.</p>
      ) : (
        <ol className={styles.history}>
          {sales.map((event) => {
            const reason = historyReason(event.reason);
            return (
              <li key={`${event.at}-${event.toStatus}`} className={styles.historyEntry}>
                <span className={styles.historyStatus}>{salesStatusLabel(event.toStatus)}</span>
                <span className={styles.muted}>
                  {HISTORY_ACTOR[event.actorType] ?? 'Hệ thống'} · {formatBusinessDateTime(event.at)}
                </span>
                {reason === null ? null : <span className={styles.historyReason}>{reason}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

const HISTORY_ACTOR: Readonly<Record<string, string>> = {
  SYSTEM: 'Hệ thống',
  ADMIN: 'Nhân viên',
  CUSTOMER: 'Khách hàng',
};

const HISTORY_REASON: Readonly<Record<string, string>> = {
  SLA_EXPIRED: 'Quá thời hạn phản hồi',
};

/** A known code is named; another UPPER_SNAKE code is internal and left out. */
function historyReason(reason: string | null | undefined): string | null {
  // The API leaves a null field out of the JSON, so "no reason" arrives as
  // undefined as often as null.
  if (typeof reason !== 'string' || reason.trim() === '') return null;
  const known = HISTORY_REASON[reason];
  if (known !== undefined) return known;
  return /^[A-Z0-9_]+$/.test(reason) ? null : reason;
}

/**
 * One email's state in plain words, with the reason that matters to staff (2026-11-10).
 *
 * A delivery held because the recipient is outside the test allowlist was never an error and is
 * never retried: it says so, instead of "sending failed, retrying · attempt 0". "Đã gửi đi" means
 * the email provider accepted the message; it does not prove it reached the inbox.
 */
export function emailDeliveryState(delivery: EmailDeliveryStatus): { status: string; detail: string } {
  if (delivery.lastErrorCode === 'RECIPIENT_NOT_ALLOWED') {
    return { status: 'Không gửi (chế độ thử nghiệm)', detail: 'người nhận không nằm trong danh sách được phép nhận email' };
  }
  if (delivery.lastErrorCode === 'HOTEL_EMAIL_MISSING') {
    return { status: 'Không gửi được', detail: 'khách sạn chưa có email' };
  }
  switch (delivery.status) {
    case 'PENDING': return { status: 'Đang chờ gửi', detail: '' };
    case 'PROCESSING': return { status: 'Đang gửi', detail: '' };
    case 'SENT': return { status: 'Đã gửi đi', detail: '' };
    case 'RETRY':
      return {
        status: 'Gửi lỗi, sẽ thử lại',
        detail: delivery.attempts > 0 ? `đã thử ${delivery.attempts} lần · cần kiểm tra cấu hình email` : 'cần kiểm tra cấu hình email',
      };
    case 'FAILED': return { status: 'Gửi thất bại', detail: 'cần kiểm tra cấu hình email' };
  }
}

function emailEventLabel(eventKey: string): string {
  if (eventKey.startsWith('booking-hotel-') || eventKey.startsWith('alternative-request-hotel-')) {
    return 'Thông báo khách sạn';
  }
  if (eventKey.startsWith('booking-cancelled-')) return 'Thông báo hủy cho khách';
  if (eventKey.startsWith('booking-payment-reported-')) return 'Báo khách sạn kiểm tra tiền';
  if (eventKey.startsWith('booking-payment-')) return 'Thông tin thanh toán';
  if (eventKey.startsWith('booking-confirmed-')) return 'Xác nhận đặt phòng';
  if (eventKey.startsWith('alternative-offer-')) return 'Đề xuất phòng thay thế';
  if (eventKey.startsWith('booking-guest-')) return 'Xác nhận đã nhận yêu cầu cho khách';
  if (eventKey.startsWith('guest-cancel-link-')) return 'Liên kết huỷ cho khách';
  if (eventKey.startsWith('cancellation-fee-')) return 'Báo phí huỷ cho khách';
  if (eventKey.startsWith('cancellation-review-')) return 'Báo Super Admin xem xét huỷ';
  if (eventKey.startsWith('refund-requested-')) return 'Báo Super Admin cần hoàn tiền';
  if (eventKey.startsWith('refund-completed-')) return 'Báo khách đã hoàn tiền';
  if (eventKey.startsWith('refund-rejected-')) return 'Báo khách không hoàn tiền';
  return 'Cập nhật yêu cầu cho khách';
}

/**
 * Doc 54 §4 — "salesStatus freezes at its terminal value".
 *
 * The domain's set rather than a second copy of the same four words: the queue
 * decides what still counts as open from it, and a page that disagreed about
 * which statuses are terminal would offer transitions the queue says are gone.
 */
const TERMINAL = TERMINAL_SALES_STATUSES;

/**
 * Doc 54 S3 and S4 — the two source states the availability re-check accepts,
 * mirroring `SalesRequestService.CHECKABLE_FROM`.
 */

/** Contact logging remains available before a hotel issues its payment request. */



const TAX_NAME: Record<string, string> = {
  VAT: 'Thuế GTGT (VAT)',
  SERVICE_CHARGE: 'Phí dịch vụ',
  CITY_TAX: 'Thuế địa phương',
  OTHER: 'Phí khác',
  TAX: 'Thuế',
};

function percent(value: number | null): string {
  return value === null ? '' : `${String(Math.round(Number(value) * 10) / 10).replace('.', ',')}%`;
}

/**
 * The price the guest was shown and will be asked to pay, line by line:
 * rooms − voucher + taxes = total. Every figure is the reservation's own.
 */
function PriceBreakdown({
  price,
  nights,
  rooms,
}: {
  readonly price: SalesRequestPrice;
  readonly nights: number;
  readonly rooms: number;
}) {
  const discount = price.discount?.amountMinor ?? 0;
  return (
    <>
      <dl className={styles.money}>
        <div className={styles.moneyRow}>
          <dt>
            Tiền phòng
            <span className={styles.moneySub}>{`${nights} đêm × ${rooms} phòng`}</span>
          </dt>
          <dd>{price.roomsSubtotal ? formatMoney(price.roomsSubtotal) : '—'}</dd>
        </div>
        {price.voucherCode ? (
          <div className={`${styles.moneyRow} ${styles.moneyDiscount}`}>
            <dt>
              {`Voucher ${price.voucherCode}`}
              {price.voucherPercent !== null ? ` (−${percent(price.voucherPercent)})` : ''}
              {price.voucherName ? <span className={styles.moneySub}>{price.voucherName}</span> : null}
            </dt>
            <dd>{price.discount && discount > 0 ? `−${formatMoney(price.discount)}` : '0 ₫'}</dd>
          </div>
        ) : null}
        {(price.memberDiscount?.amountMinor ?? 0) > 0 && price.memberDiscount ? (
          <div className={`${styles.moneyRow} ${styles.moneyDiscount}`}>
            <dt>
              {`Ưu đãi thành viên${price.memberDiscountPercent ? ` (−${percent(price.memberDiscountPercent)})` : ''}`}
              {price.memberTier ? <span className={styles.moneySub}>{`Hạng ${price.memberTier} lúc đặt`}</span> : null}
            </dt>
            <dd>{`−${formatMoney(price.memberDiscount)}`}</dd>
          </div>
        ) : null}
        {(discount > 0 || (price.memberDiscount?.amountMinor ?? 0) > 0) && price.roomsAfterDiscount ? (
          <div className={`${styles.moneyRow} ${styles.moneySubtotal}`}>
            <dt>Tiền phòng sau ưu đãi</dt>
            <dd>{formatMoney(price.roomsAfterDiscount)}</dd>
          </div>
        ) : null}
        {price.taxes.map((tax, i) => (
          <div className={styles.moneyRow} key={`${tax.type}-${i}`}>
            <dt>
              {`${TAX_NAME[tax.type] ?? tax.type}${tax.ratePercent !== null ? ` ${percent(tax.ratePercent)}` : ''}`}
              {tax.inclusive ? ' · đã gồm trong giá' : ''}
            </dt>
            <dd>{tax.amount ? formatMoney(tax.amount) : '—'}</dd>
          </div>
        ))}
        {(price.pointsUsed ?? 0) > 0 ? (
          <div className={`${styles.moneyRow} ${styles.moneyDiscount}`}>
            <dt>Dùng điểm KAS<span className={styles.moneySub}>{`${(price.pointsUsed ?? 0).toLocaleString('vi-VN')} điểm`}</span></dt>
            <dd>{`−${formatMoney({ amountMinor: price.pointsUsed ?? 0, currency: 'VND', exponent: 0 })}`}</dd>
          </div>
        ) : null}
        <div className={styles.moneyTotalRow}>
          <dt>Tổng khách cần thanh toán</dt>
          <dd>{price.total ? formatMoney(price.total) : '—'}</dd>
        </div>
      </dl>
      <p className={styles.note}>
        Số liệu lưu lúc khách gửi yêu cầu: tiền phòng − voucher + thuế = tổng. Email thanh toán và đối
        soát chuyển khoản dùng số tổng này.
      </p>
    </>
  );
}

function Fact({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value?: string;
  /** For a value that is a real control — a `mailto:` or `tel:` link. */
  readonly children?: React.ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children ?? value}</dd>
    </div>
  );
}

/** yyyy-MM-dd (a calendar date, no zone) as dd/MM/yyyy. */
function viDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year === undefined || month === undefined || day === undefined ? isoDate : `${day}/${month}/${year}`;
}
