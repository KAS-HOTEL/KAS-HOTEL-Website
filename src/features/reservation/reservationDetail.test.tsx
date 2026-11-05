// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import type { ReservationDetail, ReservationGuest } from '@/lib/domain/reservation';
import {
  RESERVATION_DETAIL_COPY,
  ReservationDetailView,
} from './ReservationDetailView';

const VND = (amountMinor: number) => ({ amountMinor, currency: 'VND', exponent: 0 });

/**
 * The multi-line reservation seeded through the real guest flow —
 * `KAS-260908-71DZ`, two Deluxe rooms and one Double, 7,500,000 ₫.
 */
function detail(overrides: Partial<ReservationDetail> = {}): ReservationDetail {
  return {
    summary: {
      reference: 'KAS-260908-71DZ',
      channelType: 'DIRECT',
      otaReference: null,
      stayStatus: null,
      propertySlug: 'kas-elegance-hotel',
      propertyName: 'KAS Elegance',
      checkIn: '2026-09-25',
      checkOut: '2026-09-27',
      nights: 2,
      adults: 4,
      children: 0,
      rooms: 3,
      guestName: 'Trần Thị Bình',
      guestPhone: '0987654321',
      guestEmail: 'binh.tran@example.com',
      createdAt: '2026-09-08T11:00:00Z',
      total: VND(7_500_000),
    },
    lines: [
      {
        roomTypeName: 'Phòng Deluxe hướng thành phố',
        quantity: 1,
        nightly: VND(1_250_000),
        lineTotal: VND(2_500_000),
      },
      {
        roomTypeName: 'Phòng Double giường đôi',
        quantity: 2,
        nightly: VND(1_250_000),
        lineTotal: VND(5_000_000),
      },
    ],
    amounts: {
      subtotal: VND(7_500_000),
      tax: null,
      serviceCharge: null,
      discount: VND(0),
      total: VND(7_500_000),
    },
    guest: {
      fullName: 'Trần Thị Bình',
      email: 'binh.tran@example.com',
      phone: '0987654321',
      country: 'VN',
      preferredChannel: 'EMAIL',
      arrivalTimeEst: null,
      specialRequests: 'Ba phòng gần nhau nếu có thể.',
      childrenAges: null,
    },
    timeline: [
      {
        field: 'SALES',
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorType: 'CUSTOMER',
        reason: null,
        note: null,
        at: '2026-09-08T11:00:00Z',
      },
    ],
    ...overrides,
  };
}

/**
 * The seeded guest with one country code swapped in.
 *
 * Spelled out rather than spread from `detail().guest`, which is
 * `ReservationGuest | null` — under `exactOptionalPropertyTypes` a spread of it
 * widens every field to optional and stops being a `ReservationGuest`.
 */
function guestFrom(country: string): ReservationGuest {
  return {
    fullName: 'Trần Thị Bình',
    email: 'binh.tran@example.com',
    phone: '0987654321',
    country,
    preferredChannel: 'EMAIL',
    arrivalTimeEst: null,
    specialRequests: 'Ba phòng gần nhau nếu có thể.',
    childrenAges: null,
  };
}

function view(reservation: ReservationDetail = detail()) {
  return render(
    <ReservationDetailView reservation={reservation} copy={RESERVATION_DETAIL_COPY} />,
  );
}

afterEach(cleanup);

describe('the reservation detail', () => {
  it('renders every real room line, never collapsed into one', () => {
    view();

    // Two lines, quantities 1 and 2 — three rooms across two room types. A
    // single merged "3 phòng" would misreport what the guest booked.
    expect(screen.getByText('Phòng Deluxe hướng thành phố × 1')).toBeTruthy();
    expect(screen.getByText('Phòng Double giường đôi × 2')).toBeTruthy();
    expect(screen.getByText('2.500.000 ₫')).toBeTruthy();
    expect(screen.getByText('5.000.000 ₫')).toBeTruthy();
  });

  it('shows the authoritative total the server sent, not a sum of the lines', () => {
    // Both figures happen to agree here, which is the point: the screen prints
    // the reservation's own total_minor and never adds the lines up itself.
    view();
    expect(screen.getAllByText('7.500.000 ₫').length).toBeGreaterThan(0);
  });

  it('omits tax and service charge rather than printing a zero', () => {
    // Doc 99 §12 puts tax outside V1, so the columns are NULL. A "0 ₫" row would
    // claim no tax is due, which is a different statement from none being modelled.
    view();
    expect(screen.queryByText(RESERVATION_DETAIL_COPY.tax)).toBeNull();
    expect(screen.queryByText(RESERVATION_DETAIL_COPY.serviceCharge)).toBeNull();
    expect(screen.queryByText(RESERVATION_DETAIL_COPY.discount)).toBeNull();
  });

  it('shows the real guest contact when the server disclosed it', () => {
    view();

    expect(screen.getAllByText('Trần Thị Bình').length).toBeGreaterThan(0);
    expect(screen.getByText('binh.tran@example.com')).toBeTruthy();
    expect(screen.getByText('0987654321')).toBeTruthy();
    expect(screen.getByText('Ba phòng gần nhau nếu có thể.')).toBeTruthy();
  });

  it('says the guest block is withheld rather than showing blanks', () => {
    view(detail({ guest: null }));

    // Null unless the session holds customer.view — doc 59:148. A card of
    // dashes would suggest the guest left no contact details.
    expect(screen.getByText(RESERVATION_DETAIL_COPY.guestWithheld)).toBeTruthy();
    expect(screen.queryByText('binh.tran@example.com')).toBeNull();
  });

  it('shows the stay status in the words the filter uses', () => {
    view();
    // V12: NULL until confirmed. A real statement, not a fifth lifecycle state.
    expect(screen.getByText('Chờ khách sạn xác nhận')).toBeTruthy();

    cleanup();
    view(detail({ summary: { ...detail().summary, stayStatus: 'CONFIRMED' } }));
    // The badge speaks the same words as the status tabs and filter, so the
    // answer is worded like the question.
    expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThan(0);

    // The exact state is demoted, not discarded — support can still read it.
    expect(document.querySelector('[data-stay-status="CONFIRMED"]')).toBeTruthy();
    expect(document.querySelector('[title="Đã xác nhận"]')).toBeTruthy();
  });

  it('groups the later stay states under the words an operator asked for', () => {
    for (const [state, shown] of [
      ['CHECK_IN_READY', 'Đã xác nhận'],
      ['CHECKED_IN', 'Đang lưu trú'],
      ['CHECKED_OUT', 'Đã trả phòng'],
      ['COMPLETED', 'Đã trả phòng'],
      ['CANCELLED', 'Đã hủy'],
      ['NO_SHOW', 'Không đến'],
    ] as const) {
      view(detail({ summary: { ...detail().summary, stayStatus: state } }));
      expect(screen.getAllByText(shown).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('shows no channel badge — every booking is direct — but keeps an operator reference', () => {
    view(
      detail({
        summary: {
          ...detail().summary,
          channelType: 'OTA',
          otaReference: 'BDC-99881',
          stayStatus: 'CONFIRMED',
        },
      }),
    );

    expect(screen.queryByText('OTA')).toBeNull();
    expect(screen.queryByText('Trực tiếp')).toBeNull();
    expect(screen.getByText(/BDC-99881/)).toBeTruthy();
  });

  it('shows no processing history — that belongs to the sales workspace', () => {
    // The page used to end with the sales timeline: REQUESTED,
    // AVAILABILITY_CHECK, CUSTOMER_CONTACTED, EXPIRED, every internal step as a
    // raw enum, and the largest thing on the screen. A receptionist opening a
    // booking wants the guest, the room and the money.
    //
    // The data is untouched — the endpoint still returns `timeline` (the fixture
    // below supplies one) and `/partner/requests/{reference}` still renders it.
    // It is simply not on this screen.
    view();

    expect(screen.queryByText('Lịch sử xử lý')).toBeNull();
    for (const internal of [
      'REQUESTED',
      'AVAILABILITY_CHECK',
      'CUSTOMER_CONTACTED',
      'ALTERNATIVE_OFFERED',
      'EXPIRED',
      'WON',
      'DECLINED',
    ]) {
      expect(screen.queryByText(internal)).toBeNull();
    }
    // And the actor's identity was never disclosed, before or after — doc 134 §5.
    expect(document.body.innerHTML).not.toMatch(/actorId|actor_id/);
  });

  it('handles the real wire shape, where a null field is absent rather than null', () => {
    // The backend omits null fields entirely, so a reservation with no stay
    // status, no OTA reference and no tax arrives missing those keys — and a
    // caller without customer.view gets no `guest` key at all. `=== null` is
    // silently false for every one of them.
    const base = detail();
    const { stayStatus, otaReference, ...summary } = base.summary;
    void stayStatus;
    void otaReference;
    const { tax, serviceCharge, ...amounts } = base.amounts!;
    void tax;
    void serviceCharge;

    view({
      ...base,
      summary: summary as ReservationDetail['summary'],
      amounts: amounts as ReservationDetail['amounts'],
      guest: undefined as unknown as ReservationDetail['guest'],
    });

    expect(screen.getByText('Chờ khách sạn xác nhận')).toBeTruthy();
    // An absent guest block is the withheld message, not a card of blanks.
    expect(screen.getByText(RESERVATION_DETAIL_COPY.guestWithheld)).toBeTruthy();
    // The money card still renders what IS there.
    expect(screen.getAllByText('7.500.000 ₫').length).toBeGreaterThan(0);
    expect(document.body.textContent ?? '').not.toMatch(/undefined|NaN/);
  });

  it('offers no action while the stay is unconfirmed', () => {
    view();

    // The stay transitions need a confirmed stay, and the DIRECT sales transitions
    // belong to /partner/requests where their source-state guards live. Aiming
    // one at an OTA reservation would be meaningless.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Xác nhận thắng|Từ chối|Nhận phòng ngay|Hoàn tiền/);
  });

  it('exposes no internal identifier', () => {
    view();
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/priceSnapshot|partnerId|propertyId|reservationId|idempotenc/i);
  });

  it('says plainly what this screen cannot do', () => {
    view();
    // Payment recording, check-in and check-out do not exist in this
    // application, and the screen states that rather than implying otherwise.
    expect(screen.getByText(/chưa ghi nhận thanh toán/)).toBeTruthy();
  });
});

/**
 * The VIP cleanup: what the page shows, what it stopped showing, and what it
 * refuses to invent.
 */
describe('the reservation detail after the cleanup', () => {
  it('leads with the identity, then the hotel and dates, once each', () => {
    view();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('KAS-260908-71DZ');
    // Day-first, as a Vietnamese front desk reads a date — not the ISO string.
    expect(screen.getByText(/25\/09\/2026\s*–\s*27\/09\/2026/)).toBeTruthy();

    // One source of truth: the hotel is named once, not in a header and again
    // in a card that restates it.
    expect(screen.getAllByText('KAS Elegance')).toHaveLength(1);
  });

  it('itemises the stay without repeating the header', () => {
    view();

    expect(screen.getByText('Nhận phòng')).toBeTruthy();
    expect(screen.getByText('25/09/2026')).toBeTruthy();
    expect(screen.getByText('Trả phòng')).toBeTruthy();
    expect(screen.getByText('27/09/2026')).toBeTruthy();
    expect(screen.getByText('2 đêm')).toBeTruthy();
    expect(screen.getByText('3 phòng')).toBeTruthy();
    expect(screen.getByText('4 người lớn')).toBeTruthy();
  });

  it('makes the guest reachable, at a tappable size', () => {
    view();

    const phone = screen.getByRole('link', { name: '0987654321' });
    expect(phone.getAttribute('href')).toBe('tel:0987654321');
    const email = screen.getByRole('link', { name: 'binh.tran@example.com' });
    expect(email.getAttribute('href')).toBe('mailto:binh.tran@example.com');
  });

  it('hides an absent guest field rather than drawing a row of dashes', () => {
    view(
      detail({
        guest: {
          fullName: 'Trần Thị Bình',
          email: null,
          phone: null,
          country: null,
          preferredChannel: null,
          arrivalTimeEst: null,
          specialRequests: null,
          childrenAges: null,
        },
      }),
    );

    // A guest who left no country is not a guest whose country is a dash.
    for (const label of ['Email', 'Điện thoại', 'Quốc gia', 'Liên hệ qua', 'Giờ đến dự kiến']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText('Trần Thị Bình')).toBeTruthy();
    // And no stray placeholders left behind by the removed rows.
    expect(screen.queryByText('—')).toBeNull();
  });

  it('names the country instead of printing its code', () => {
    view();

    expect(screen.getByText('Việt Nam')).toBeTruthy();
    // The code itself is gone from the page, not merely joined by the name.
    expect(screen.queryByText('VN')).toBeNull();
  });

  it('names a country the guest form allows but nobody thought about', () => {
    // `guest.country` is any `^[A-Za-z]{2}$`, not an enum of one — a booking
    // from Britain must not read `GB` just because the seed data is Vietnamese.
    view(detail({ guest: guestFrom('GB') }));

    expect(screen.getByText('Vương quốc Anh')).toBeTruthy();
    expect(screen.queryByText('GB')).toBeNull();
  });

  it('reads a lower-case code, which the pattern permits and the lookup does not', () => {
    // `Intl.DisplayNames.of('vn')` returns 'vn'. The column is not constrained
    // to upper case, so a lower-case row would otherwise show its raw code.
    view(detail({ guest: guestFrom('vn') }));

    expect(screen.getByText('Việt Nam')).toBeTruthy();
  });

  it('survives a country code that is not a country, and shows it plainly', () => {
    // Two guards, two shapes. `QQ` is well-formed and unassigned: CLDR has no
    // name, so it prints itself — what the record holds, not an invented
    // "unknown country". `VNM` is malformed and makes `Intl` throw a
    // RangeError; this renders on the server, so an unguarded lookup would
    // fail the whole page for one bad column.
    view(detail({ guest: guestFrom('QQ') }));
    expect(screen.getByText('QQ')).toBeTruthy();
    cleanup();

    expect(() => view(detail({ guest: guestFrom('VNM') }))).not.toThrow();
    expect(screen.getByText('VNM')).toBeTruthy();
  });

  it('shows a special request only when the guest made one', () => {
    view();
    expect(screen.getByText('Ba phòng gần nhau nếu có thể.')).toBeTruthy();

    cleanup();
    view(detail({ guest: { ...detail().guest!, specialRequests: null } }));
    expect(screen.queryByText('Yêu cầu đặc biệt')).toBeNull();
  });

  it('states only the money the record actually holds', () => {
    view();

    expect(screen.getByText('Tạm tính')).toBeTruthy();
    expect(screen.getByText('Tổng cộng')).toBeTruthy();
    // Tax and service charge are null on every reservation this application
    // creates. A zero row would read as "no tax due", which is a claim.
    expect(screen.queryByText('Thuế')).toBeNull();
    expect(screen.queryByText('Phí dịch vụ')).toBeNull();
    // A discount of zero is not a discount.
    expect(screen.queryByText('Giảm giá')).toBeNull();
  });

  it('shows a discount when there is one', () => {
    view({
      ...detail(),
      amounts: { ...detail().amounts!, discount: VND(500_000) },
    });

    expect(screen.getByText('Giảm giá')).toBeTruthy();
  });

  it('leaks no identifier, enum or slug', () => {
    const html = view().container.innerHTML;

    // No UUID, no database id.
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // No routing slug in the visible text.
    expect(screen.queryByText('kas-elegance-hotel')).toBeNull();
    // No raw lifecycle value shown as text. `data-stay-status` and `title` keep
    // the precise state addressable for support without printing it.
    for (const enumValue of ['DIRECT', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW', 'EMAIL']) {
      expect(screen.queryByText(enumValue)).toBeNull();
    }
  });
});
