import Link from 'next/link';
import { formatMoney } from '@/lib/domain/availability';
import {
  contactChannelLabel,
  countryLabel,
  formatStayDate,
  guestCountLabel,
  present,
  propertyLabel,
  stayStatusDisplay,
  stayStatusLabel,
  stayStatusTone,
  type ReservationDetail,
} from '@/lib/domain/reservation';
import { Badge, Card } from '@/ui/primitives';
import { RESERVATION_LINES_COPY, ReservationLinesCard } from './ReservationLinesCard';
import { StayActions } from './StayActions';
import styles from './Reservation.module.css';

/**
 * One reservation, opened — doc 58 §6, *"full detail, any channel"*.
 *
 * <h2>What this screen is not</h2>
 *
 * It carries only the stay transitions in {@link StayActions} — check-in,
 * check-out and no-show — which apply to every channel. The DIRECT sales
 * transitions (win, decline, contact, availability check) belong to
 * `/partner/requests`, where their source-state guards live. Putting them here
 * would aim DIRECT-lifecycle actions at reservations that may be OTA, where
 * `sales_status` is NULL and every one of those transitions is meaningless.
 *
 * <h2>No processing history</h2>
 *
 * This page used to end with the sales workspace's timeline — `REQUESTED`,
 * `AVAILABILITY_CHECK`, `CUSTOMER_CONTACTED`, `EXPIRED`, every internal step
 * printed as its raw enum. It was the largest thing on the screen and the least
 * useful: a receptionist opening a booking wants the guest, the room and the
 * money, not an audit of how the sale was worked.
 *
 * <p>Nothing was deleted to achieve that. `reservation_status_history` is
 * untouched, the endpoint still returns `timeline`, and
 * `SalesRequestTimeline` still renders it at `/partner/requests/{reference}`,
 * where the people who work that lifecycle can see it.
 *
 * <h2>One fact, one place</h2>
 *
 * The header carries the identity — reference, status, channel, then hotel and
 * dates on one line. Nothing below repeats those: the stay card itemises the
 * dates rather than restating them, and the hotel appears once. A page that
 * says the same thing in three cards makes the reader check whether the three
 * agree.
 *
 * <h2>Every optional field is tested with `present`</h2>
 *
 * The backend omits null fields from its JSON entirely, so an unconfirmed stay
 * arrives with no `stayStatus` key and a caller without `customer.view` gets no
 * `guest` key. `=== null` is silently false for both — see {@link present}.
 */
export function ReservationDetailView({
  reservation,
  copy,
}: {
  readonly reservation: ReservationDetail;
  readonly copy: ReservationDetailCopy;
}) {
  const { summary, lines, amounts, guest } = reservation;
  const childrenAges = guest?.childrenAges;

  return (
    <div className={styles.detail}>
      <header className={styles.detailHeader}>
        <div className={styles.detailIdentity}>
          <h1 className={styles.detailReference}>{summary.reference}</h1>
          {/*
            The four-word vocabulary the filter uses, so the answer is worded
            like the question. The exact state stays in `title` and in a data
            attribute for support — demoted, not discarded.
          */}
          <span
            data-stay-status={summary.stayStatus ?? 'UNSET'}
            title={
              !summary.stayStatus
                ? 'Khách sạn chưa chấp nhận yêu cầu này. Xử lý tại mục Yêu cầu đặt phòng.'
                : stayStatusLabel(summary.stayStatus)
            }
          >
            <Badge tone={stayStatusTone(summary.stayStatus)}>
              {stayStatusDisplay(summary.stayStatus)}
            </Badge>
          </span>
          {!summary.stayStatus ? (
            // Not accepted yet: the decision is taken on the request, not here.
            <Link className={styles.detailRequestLink} href={`/partner/requests/${encodeURIComponent(summary.reference)}`}>
              Xử lý yêu cầu →
            </Link>
          ) : null}
        </div>

        {/* Hotel and dates, once, where the eye lands first. */}
        <p className={styles.detailSummaryLine}>
          <span className={styles.detailProperty}>{propertyLabel(summary)}</span>
          <span className={styles.detailDates}>
            {formatStayDate(summary.checkIn)} – {formatStayDate(summary.checkOut)} ·{' '}
            {summary.nights} đêm
          </span>
        </p>

        {/*
          The operator's own booking number with their channel. Shown because it
          is the identifier they would quote in a dispute with the OTA; it is not
          a credential, and no provider credential column exists.
        */}
        {present(summary.otaReference) ? (
          <p className={styles.muted}>
            {copy.otaReference}: {summary.otaReference}
          </p>
        ) : null}
        <StayActions reference={summary.reference} stayStatus={summary.stayStatus}
          checkIn={summary.checkIn} checkOut={summary.checkOut} />
      </header>

      <div className={styles.detailGrid}>
        <Card title={copy.stayCard}>
          {/*
            The dates itemised. The hotel is not repeated here — it is one line
            above, and this card exists to break the stay down, not to restate
            the header.
          */}
          <dl className={styles.facts}>
            <Fact label={copy.checkIn} value={formatStayDate(summary.checkIn)} />
            <Fact label={copy.checkOut} value={formatStayDate(summary.checkOut)} />
            <Fact label={copy.nights} value={`${summary.nights} đêm`} />
            <Fact label={copy.guests} value={guestCountLabel(summary)} />
            <Fact label={copy.rooms} value={`${summary.rooms} phòng`} />
            {/*
              Real ages from `children_ages`, whose length the database keeps
              equal to `children`. Absent rather than "0 trẻ em" when there are
              none — an empty list is not a fact worth a row.
            */}
            {present(childrenAges) && childrenAges.length > 0 ? (
              <Fact label={copy.childrenAges} value={childrenAges.join(', ')} />
            ) : null}
          </dl>
        </Card>

        <Card title={copy.roomsCard}>
          <ReservationLinesCard lines={lines} copy={RESERVATION_LINES_COPY} />
        </Card>

        <Card title={copy.guestCard}>
          {present(guest) ? (
            <dl className={styles.facts}>
              {/*
                Absent fields are absent. A column of "—" made the card twice as
                tall and told the reader nothing: a guest who left no country is
                not a guest whose country is a dash.
              */}
              {/*
                The customer account this booking belongs to, by the code the
                customer list shows. A booking with no customer record says so:
                when tracing a mistake, "not linked" is an answer, not a blank.
              */}
              <Fact label={copy.customerCode} value={present(guest.customerCode) ? guest.customerCode : copy.noAccount} />
              {present(guest.fullName) ? (
                <Fact label={copy.fullName} value={guest.fullName} />
              ) : null}
              {present(guest.email) ? (
                <Fact label={copy.email}>
                  <a className={styles.contactLink} href={`mailto:${guest.email}`}>
                    {guest.email}
                  </a>
                </Fact>
              ) : null}
              {present(guest.phone) ? (
                <Fact label={copy.phone}>
                  <a className={styles.contactLink} href={`tel:${guest.phone}`}>
                    {guest.phone}
                  </a>
                </Fact>
              ) : null}
              {present(guest.country) ? (
                <Fact label={copy.country} value={countryLabel(guest.country)} />
              ) : null}
              {present(guest.preferredChannel) ? (
                <Fact
                  label={copy.preferredChannel}
                  value={contactChannelLabel(guest.preferredChannel)}
                />
              ) : null}
              {present(guest.arrivalTimeEst) ? (
                <Fact label={copy.arrival} value={guest.arrivalTimeEst} />
              ) : null}
            </dl>
          ) : (
            <p className={styles.note}>{copy.guestWithheld}</p>
          )}
        </Card>

        {/*
          Every figure is a column on the reservation. Nothing here is summed:
          doc 125 makes the record the authority on what a stay costs, and a
          screen that recomputed a total could disagree with what the guest was
          quoted. Tax and service charge are null on every reservation this
          application creates — doc 99 §12 puts tax outside V1 — so their rows
          are absent rather than showing a zero that would read as "no tax due".
        */}
        <Card title={copy.moneyCard}>
          {present(amounts) ? (
            <dl className={styles.money}>
              {present(amounts.subtotal) ? (
                <MoneyRow label={copy.subtotal} value={formatMoney(amounts.subtotal)} />
              ) : null}
              {present(amounts.tax) ? (
                <MoneyRow label={copy.tax} value={formatMoney(amounts.tax)} />
              ) : null}
              {present(amounts.serviceCharge) ? (
                <MoneyRow label={copy.serviceCharge} value={formatMoney(amounts.serviceCharge)} />
              ) : null}
              {/* A discount of zero is not a discount; the row would be noise. */}
              {present(amounts.discount) && amounts.discount.amountMinor > 0 ? (
                <MoneyRow label={copy.discount} value={formatMoney(amounts.discount)} />
              ) : null}
              <MoneyRow
                label={copy.total}
                value={present(amounts.total) ? formatMoney(amounts.total) : '—'}
                total
              />
            </dl>
          ) : (
            <p className={styles.note}>{copy.moneyMissing}</p>
          )}
        </Card>
      </div>

      {/*
        The one thing on this page a guest actually asked for, so it is not
        buried in the guest card among the contact rows — and it is absent
        entirely when there is nothing to say.
      */}
      {present(guest?.specialRequests) ? (
        <Card title={copy.specialRequests}>
          <p className={styles.requestText}>{guest.specialRequests}</p>
        </Card>
      ) : null}

      {/* One sentence, not a paragraph explaining the whole architecture. */}
      <p className={styles.note}>{copy.readOnly}</p>
    </div>
  );
}

/**
 * One label and its value.
 *
 * Takes either a plain string or children, so a phone number can be a `tel:`
 * link without a second component that would drift from this one's markup.
 */
function Fact({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value?: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children ?? value}</dd>
    </div>
  );
}

/** A money row. The total is the one line on this page that shouts. */
function MoneyRow({
  label,
  value,
  total = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly total?: boolean;
}) {
  return (
    <div className={total ? styles.moneyTotalRow : styles.moneyRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export interface ReservationDetailCopy {
  readonly stayCard: string;
  readonly roomsCard: string;
  readonly guestCard: string;
  readonly moneyCard: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: string;
  readonly guests: string;
  readonly childrenAges: string;
  readonly rooms: string;
  readonly otaReference: string;
  readonly customerCode: string;
  readonly noAccount: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly country: string;
  readonly preferredChannel: string;
  readonly arrival: string;
  readonly specialRequests: string;
  readonly guestWithheld: string;
  readonly subtotal: string;
  readonly tax: string;
  readonly serviceCharge: string;
  readonly discount: string;
  readonly total: string;
  readonly moneyMissing: string;
  readonly readOnly: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const RESERVATION_DETAIL_COPY: ReservationDetailCopy = {
  stayCard: 'Kỳ nghỉ',
  roomsCard: 'Phòng đã đặt',
  guestCard: 'Khách',
  moneyCard: 'Số tiền',
  checkIn: 'Nhận phòng',
  checkOut: 'Trả phòng',
  nights: 'Số đêm',
  guests: 'Số khách',
  childrenAges: 'Tuổi trẻ em',
  rooms: 'Số phòng',
  otaReference: 'Mã OTA',
  customerCode: 'Mã khách hàng',
  noAccount: 'Chưa gắn với hồ sơ khách hàng',
  fullName: 'Họ và tên',
  email: 'Email',
  phone: 'Điện thoại',
  country: 'Quốc gia',
  preferredChannel: 'Liên hệ qua',
  arrival: 'Giờ đến dự kiến',
  specialRequests: 'Yêu cầu đặc biệt',
  guestWithheld: 'Tài khoản của bạn không có quyền xem thông tin liên hệ của khách.',
  subtotal: 'Tạm tính',
  tax: 'Thuế',
  serviceCharge: 'Phí dịch vụ',
  discount: 'Giảm giá',
  total: 'Tổng cộng',
  moneyMissing: 'Đặt phòng này chưa có thông tin số tiền.',
  // Trimmed from a paragraph that also explained where the sales actions live
  // and why — architecture aimed at whoever wrote the page. What survives is
  // the part an operator can act on: this screen changes nothing, and two
  // capabilities they might expect do not exist yet.
  readOnly:
    'Màn hình này chỉ để tra cứu. Hệ thống chưa ghi nhận thanh toán và chưa có thao tác '
    + 'nhận phòng / trả phòng.',
};
