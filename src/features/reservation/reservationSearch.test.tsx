// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Endpoints from '@/lib/api/endpoints';
import type { ReservationSearchFilters } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  isStayStatusGroup,
  STAY_STATUS_GROUP_LABEL,
  STAY_STATUS_GROUP_ORDER,
  STAY_STATUS_GROUPS,
  STAY_STATUS_UNSET,
  STAY_STATUSES,
  stayStatusLabel,
  type ReservationPage,
  type ReservationSummary,
  type StayStatusGroup,
} from '@/lib/domain/reservation';

const searchApi = vi.fn();
const detailApi = vi.fn();

vi.mock('@/lib/api/endpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof Endpoints>()),
  opsReservationsApi: {
    search: (...a: unknown[]) => searchApi(...a),
    detail: (...a: unknown[]) => detailApi(...a),
  },
}));

const { ReservationFilterBar, RESERVATION_FILTER_COPY, filtersFromSearchParams } =
  await import('./ReservationFilterBar');
const { ReservationResults, RESERVATION_RESULTS_COPY } = await import('./ReservationResults');
const { ReservationPager, RESERVATION_PAGER_COPY, hrefFor } = await import('./ReservationPager');
const { loadReservations, loadReservation } = await import('./load');

const PROPERTIES = [
  { slug: 'kas-elegance-hotel', label: 'KAS Elegance' },
  { slug: 'kas-riverside', label: 'KAS Riverside' },
];

function reservation(overrides: Partial<ReservationSummary> = {}): ReservationSummary {
  return {
    reference: 'KAS-260908-CA9W',
    channelType: 'DIRECT',
    otaReference: null,
    stayStatus: null,
    propertySlug: 'kas-elegance-hotel',
    propertyName: 'KAS Elegance',
    checkIn: '2026-09-20',
    checkOut: '2026-09-22',
    nights: 2,
    adults: 2,
    children: 0,
    rooms: 1,
    guestName: 'Nguyễn Văn An',
    guestPhone: '0901234567',
    guestEmail: 'an.nguyen@example.com',
    createdAt: '2026-09-08T10:00:00Z',
    total: { amountMinor: 2_500_000, currency: 'VND', exponent: 0 },
    ...overrides,
  };
}

function page(overrides: Partial<ReservationPage> = {}): ReservationPage {
  return { items: [reservation()], page: 0, size: 20, total: 1, ...overrides };
}

/** The rendered value of one labelled control. */
function value(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement).value;
}

const ROOM_TYPES = [
  { slug: 'dd-203', label: 'Phòng Double giường đôi' },
  { slug: 'del-103', label: 'Phòng Deluxe' },
];

function bar(
  active: ReservationSearchFilters = {},
  activeGroup?: StayStatusGroup,
  roomTypes: readonly { slug: string; label: string }[] = [],
) {
  return render(
    <ReservationFilterBar
      active={active}
      activeGroup={activeGroup}
      properties={PROPERTIES}
      roomTypes={roomTypes}
      copy={RESERVATION_FILTER_COPY}
    />,
  );
}

function results(reservations: readonly ReservationSummary[]) {
  return render(
    <ReservationResults reservations={reservations} copy={RESERVATION_RESULTS_COPY} />,
  );
}

afterEach(() => {
  searchApi.mockReset();
  detailApi.mockReset();
  cleanup();
});

// ---------------------------------------------------------------- URL state

describe('reading filters out of the URL', () => {
  it('treats an absent or empty parameter as no filter', () => {
    expect(filtersFromSearchParams({})).toEqual({});
    // An untouched select submits "", which must not narrow the list to nothing.
    expect(
      filtersFromSearchParams({ q: '', property: '', stayStatus: '', channelType: '' }),
    ).toEqual({});
  });

  it('still reads every filter the backend accepts, including the ones with no control', () => {
    // The bar stopped offering channel, room type and the two stay-date ranges.
    // The API did not stop accepting them, and a bookmark that carries one must
    // keep working — so they are still read out of the URL.
    expect(
      filtersFromSearchParams({
        q: 'KAS-260908-CA9W',
        property: 'kas-elegance-hotel',
        status: 'confirmed',
        channelType: 'OTA',
        roomType: 'dd-203',
        checkInFrom: '2026-09-01',
        checkInTo: '2026-09-30',
        checkOutFrom: '2026-09-02',
        checkOutTo: '2026-10-01',
        bookedFrom: '2026-09-08',
        bookedTo: '2026-09-09',
        page: '2',
      }),
    ).toEqual({
      q: 'KAS-260908-CA9W',
      property: 'kas-elegance-hotel',
      stayStatus: 'CONFIRMED,CHECK_IN_READY',
      channelType: 'OTA',
      roomType: 'dd-203',
      checkInFrom: '2026-09-01',
      checkInTo: '2026-09-30',
      checkOutFrom: '2026-09-02',
      checkOutTo: '2026-10-01',
      bookedFrom: '2026-09-08',
      bookedTo: '2026-09-09',
      page: 2,
    });
  });

  it('translates each status group into the states it stands for', () => {
    // The URL speaks the console's vocabulary; the request speaks the schema's.
    // This function is the only place the two meet.
    expect(filtersFromSearchParams({ status: 'confirmed' }).stayStatus)
      .toBe('CONFIRMED,CHECK_IN_READY');
    expect(filtersFromSearchParams({ status: 'inHouse' }).stayStatus).toBe('CHECKED_IN');
    expect(filtersFromSearchParams({ status: 'checkedOut' }).stayStatus)
      .toBe('CHECKED_OUT,COMPLETED');
    // The old group tokens are no longer filters.
    expect(filtersFromSearchParams({ status: 'arrived' }).stayStatus).toBeUndefined();
    expect(filtersFromSearchParams({ status: 'cancelled' }).stayStatus).toBe('CANCELLED');
    expect(filtersFromSearchParams({ status: 'noShow' }).stayStatus).toBe('NO_SHOW');
  });

  it('ignores a status token it does not recognise rather than refusing the page', () => {
    // A stale or hand-edited link should show the workspace, not an error.
    expect(filtersFromSearchParams({ status: 'CONFIRMED' })).toEqual({});
    expect(filtersFromSearchParams({ status: 'anything' })).toEqual({});
    expect(filtersFromSearchParams({ status: '' })).toEqual({});
  });

  it('no longer takes a raw stay status from the URL', () => {
    // The group token is the only status vocabulary the address bar carries, so
    // an enum in the query string is not a filter — it is a leftover.
    expect(filtersFromSearchParams({ stayStatus: 'CHECKED_IN' })).toEqual({});
  });

  it('reads size as well as page — half a page coordinate is a dead end', () => {
    // `page` was read from the URL while `size` was not, so `?size=2&page=1`
    // asked the backend for the second page of TWENTY. With three reservations
    // that page is empty, the screen believed there was one page, and drew no
    // pager — a URL you could reach and not get back from.
    expect(filtersFromSearchParams({ size: '2', page: '1' })).toEqual({ size: 2, page: 1 });
    expect(filtersFromSearchParams({ size: '0' })).toEqual({});
    expect(filtersFromSearchParams({ size: 'abc' })).toEqual({});
    // Clamped to the backend's own maximum, so the pager and the served page
    // describe the same thing.
    expect(filtersFromSearchParams({ size: '5000' })).toEqual({ size: 100 });
  });

  it('ignores a page that is not a positive number', () => {
    // Page 0 is the canonical first page and is written as no parameter at all.
    expect(filtersFromSearchParams({ page: '0' })).toEqual({});
    expect(filtersFromSearchParams({ page: 'abc' })).toEqual({});
    expect(filtersFromSearchParams({ page: '-3' })).toEqual({});
  });

  it('never reads a salesStatus — that lifecycle belongs to the other workspace', () => {
    // sales_status is DIRECT-only and NULL for every OTA reservation. Accepting
    // it here would be the merged taxonomy doc 53 refuses to create.
    expect(filtersFromSearchParams({ salesStatus: 'REQUESTED' })).toEqual({});
  });
});

describe('the filter bar', () => {
  it('is a GET form, so submitting navigates and the URL becomes the state', () => {
    const { container } = bar();
    const form = container.querySelector('form');

    expect(form?.getAttribute('method')).toBe('get');
    // No action attribute: it submits to the current path, which is the page
    // that reads these very parameters back.
    expect(form?.getAttribute('action')).toBeNull();
  });

  it('names every control after the backend parameter it sets', () => {
    bar();
    const names = Array.from(document.querySelectorAll('input[name], select[name]')).map(
      (element) => element.getAttribute('name'),
    );

    // The bar used to carry channel and three date ranges as well — eleven
    // inputs, which is a database query form with a hotel's name on it.
    expect(names).toEqual(['q', 'property', 'status', 'bookedFrom', 'bookedTo']);
  });

  it('offers the room-type control once a property is chosen', () => {
    // Room-type slugs are unique within a property, not across the portfolio, so
    // a portfolio-wide picker would repeat labels meaning different rooms. That
    // is why it is conditional — not a simplification.
    bar();
    expect(screen.queryByLabelText(RESERVATION_FILTER_COPY.roomType)).toBeNull();

    cleanup();
    bar({ property: 'kas-elegance-hotel' }, undefined, ROOM_TYPES);
    const control = screen.getByLabelText(RESERVATION_FILTER_COPY.roomType);
    expect(control.getAttribute('name')).toBe('roomType');
    expect(within(control).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả',
      'Phòng Double giường đôi',
      'Phòng Deluxe',
    ]);
  });

  it('offers no control for the filters the workspace stopped asking about', () => {
    bar();
    const body = document.body.textContent ?? '';

    // Removed from the UI only — `GET /admin/ops/reservations` still accepts all
    // of them, and `filtersFromSearchParams` still reads them from the URL.
    for (const name of ['channelType', 'checkInFrom', 'checkInTo', 'checkOutFrom', 'checkOutTo']) {
      expect(document.querySelector(`[name="${name}"]`)).toBeNull();
    }
    expect(body).not.toMatch(/Kênh đặt phòng|Nhận phòng|Trả phòng|Nguồn khách/);
  });

  it('shows the active filters as the controls own values', () => {
    bar({ q: 'Bình', property: 'kas-riverside' }, 'inHouse');

    expect(value(RESERVATION_FILTER_COPY.search)).toBe('Bình');
    expect(value(RESERVATION_FILTER_COPY.property)).toBe('kas-riverside');
    expect(value(RESERVATION_FILTER_COPY.status)).toBe('inHouse');
  });

  it('offers the five operational groups and never a raw state', () => {
    bar();
    const status = screen.getByLabelText(RESERVATION_FILTER_COPY.status);
    const options = within(status).getAllByRole('option');

    expect(options.map((option) => option.textContent)).toEqual([
      'Tất cả',
      'Đã xác nhận',
      'Đang lưu trú',
      'Đã trả phòng',
      'Không đến',
      'Đã hủy',
    ]);
    // The URL carries the group token, so even the address bar never shows an
    // enum. The values are the console's own vocabulary.
    expect(options.map((option) => option.getAttribute('value'))).toEqual([
      '',
      'confirmed',
      'inHouse',
      'checkedOut',
      'noShow',
      'cancelled',
    ]);

    const body = document.body.textContent ?? '';
    // Neither lifecycle's raw states appear anywhere on the bar.
    expect(body).not.toMatch(
      /CONFIRMED|CHECK_IN_READY|CHECKED_IN|CHECKED_OUT|COMPLETED|CANCELLED|NO_SHOW/,
    );
    expect(body).not.toMatch(/REQUESTED|ASSIGNED|AVAILABILITY_CHECK|WON|DECLINED/);
  });

  it('offers a clear link only when something is filtered', () => {
    bar();
    expect(screen.queryByText(RESERVATION_FILTER_COPY.clear)).toBeNull();

    cleanup();
    bar({ q: 'An' });
    // A link, not a reset button: clearing means navigating to the unfiltered
    // URL, so the address bar and the rendered list stay the same thing.
    const clear = screen.getByText(RESERVATION_FILTER_COPY.clear);
    expect(clear.getAttribute('href')).toBe('/partner/reservations');
  });

  it('lets the operator type a search term', async () => {
    const user = userEvent.setup();
    bar();

    const input = screen.getByLabelText(RESERVATION_FILTER_COPY.search);
    await user.type(input, '0901234567');

    expect((input as HTMLInputElement).value).toBe('0901234567');
    // No request was made while typing: this is a form, so nothing is fetched
    // until it is submitted. There is no debounce to tune and no stale response
    // that could arrive after a newer one.
    expect(searchApi).not.toHaveBeenCalled();
  });

  it('labels every control, so the form is usable without sight', () => {
    bar({ property: 'kas-elegance-hotel' });

    for (const control of document.querySelectorAll('input[name], select[name]')) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      expect(document.querySelector(`label[for="${id}"]`)).toBeTruthy();
    }
  });
});

// ------------------------------------------------------------------ results

describe('the results', () => {
  it('renders the real reservation, in both the table and the card list', () => {
    results([reservation()]);

    // Both renderings are in the DOM; CSS shows exactly one at a time, and
    // `display: none` removes the other from the accessibility tree too.
    expect(screen.getAllByText('KAS-260908-CA9W')).toHaveLength(2);
    expect(screen.getAllByText('Nguyễn Văn An')).toHaveLength(2);

    // The two shapes state the stay differently, on purpose. The table splits it
    // so the date range can refuse to wrap — the column was being squeezed to
    // 81px and standing rows 214px tall. The phone card has the width to say it
    // in one sentence.
    //
    // Day-first in both, the same way the detail screen writes a date. The list
    // used to print the server's ISO string and the detail 20/09/2026, so one
    // reservation read two ways depending on which screen you were on.
    expect(screen.getByText('20/09/2026 → 22/09/2026')).toBeTruthy();
    expect(screen.getByText('2 đêm · 2 người lớn')).toBeTruthy();
    expect(screen.getByText('20/09/2026 → 22/09/2026 · 2 đêm')).toBeTruthy();
  });

  it('links each reservation to its own detail route', () => {
    results([reservation()]);

    for (const link of screen.getAllByRole('link', { name: 'KAS-260908-CA9W' })) {
      expect(link.getAttribute('href')).toBe('/partner/reservations/KAS-260908-CA9W');
    }
  });

  it('shows the stay status, and reads a null one as not yet confirmed', () => {
    // V12: stay_status is NULL until the stay is confirmed. That is a fact about
    // the reservation, not a missing value, and never an invented eighth status.
    results([reservation({ stayStatus: null })]);
    expect(screen.getAllByText('Chờ khách sạn xác nhận').length).toBeGreaterThan(0);

    cleanup();
    results([reservation({ stayStatus: 'CHECKED_IN' })]);
    // The four words the filter offers, so a row answers in the words the
    // question used — the list and the filter never disagree about one state.
    expect(screen.getAllByText('Đang lưu trú').length).toBeGreaterThan(0);
    expect(screen.queryByText('Đã nhận phòng')).toBeNull();
    // Demoted, not discarded: support can still read the exact state.
    expect(document.querySelector('[title="Đã nhận phòng"]')).toBeTruthy();
  });

  it('handles the real wire shape, where a null field is absent rather than null', () => {
    // `spring.jackson.default-property-inclusion: non_null` omits null fields
    // from the JSON entirely, so an unconfirmed reservation arrives with NO
    // stayStatus key and no otaReference key. A `=== null` check is silently
    // false for both, and the status badge rendered empty in the browser.
    // This fixture is the response as the server actually sends it.
    const { stayStatus, otaReference, guestPhone, guestEmail, total, ...onTheWire } = reservation();
    void stayStatus;
    void otaReference;
    void guestPhone;
    void guestEmail;
    void total;

    results([onTheWire as ReservationSummary]);

    expect(screen.getAllByText('Chờ khách sạn xác nhận').length).toBeGreaterThan(0);
    // An absent total is a dash, not "undefined" and not a crash in formatMoney.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(document.body.textContent ?? '').not.toMatch(/undefined|NaN/);
  });

  it('never shows a sales status', () => {
    results([reservation({ stayStatus: 'CONFIRMED' })]);
    expect(document.body.textContent ?? '').not.toMatch(/REQUESTED|WON|DECLINED/);
  });

  it('shows no channel — OTA booking was removed, every booking is direct', () => {
    results([reservation()]);

    expect(screen.queryByText(/Trực tiếp/)).toBeNull();
    expect(screen.queryByText(/\bOTA\b/)).toBeNull();
    // `channel_type` never reaches the screen raw either.
    expect(document.body.textContent ?? '').not.toMatch(/\bDIRECT\b/);
  });

  it('shows a phone only when the server sent one', () => {
    results([reservation()]);
    expect(screen.getAllByText('0901234567').length).toBeGreaterThan(0);

    cleanup();
    // Null when the session lacks customer.view. A dash would claim the guest
    // left no number; absence says nothing at all.
    results([reservation({ guestPhone: null })]);
    expect(screen.queryByText('0901234567')).toBeNull();
  });

  it('invents no commission, payout or payment state', () => {
    results([reservation()]);
    const text = document.body.textContent ?? '';

    // None of these is a column anywhere, and V15's payment table has no read
    // path in this application.
    expect(text).not.toMatch(/hoa hồng|commission|payout|đã thanh toán|chưa thanh toán/i);
  });

  it('shows a dash rather than a zero for a reservation with no total', () => {
    results([reservation({ total: null })]);
    // A zero would read as "free", which is the one thing a null never means.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('says the account has no reservations yet, when nothing was filtered', () => {
    results([]);

    expect(screen.getByText(RESERVATION_RESULTS_COPY.emptyTitle)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/KAS-\d/);
  });

  it('says the filter matched nothing, when something was filtered', () => {
    // Two different facts. "Chưa có đặt phòng" under an active filter tells an
    // operator their account is empty when it is not — the same empty-versus-
    // narrowed confusion the sales queue already fixed.
    render(
      <ReservationResults reservations={[]} filtered copy={RESERVATION_RESULTS_COPY} />,
    );

    expect(screen.getByText(RESERVATION_RESULTS_COPY.noMatchTitle)).toBeTruthy();
    expect(screen.getByText(RESERVATION_RESULTS_COPY.noMatchBody)).toBeTruthy();
    expect(screen.queryByText(RESERVATION_RESULTS_COPY.emptyTitle)).toBeNull();
  });

  it('distinguishes a page past the end from a search that matched nothing', () => {
    // "Nothing matched" invites the operator to widen the filters; it is the
    // wrong advice when 43 reservations matched and they are simply on page 1.
    render(
      <ReservationResults reservations={[]} pastEnd filtered copy={RESERVATION_RESULTS_COPY} />,
    );

    expect(screen.getByText(RESERVATION_RESULTS_COPY.pastEndTitle)).toBeTruthy();
    expect(screen.queryByText(RESERVATION_RESULTS_COPY.noMatchTitle)).toBeNull();
    expect(screen.queryByText(RESERVATION_RESULTS_COPY.emptyTitle)).toBeNull();
  });
});

// ------------------------------------------------------------------- paging

describe('the pager', () => {
  it('carries every active filter into the next page', () => {
    // A pager that dropped the filters would silently page through a different
    // result set than the one on screen.
    expect(hrefFor({ q: 'An', stayStatus: 'CONFIRMED' }, 2)).toBe(
      '/partner/reservations?q=An&stayStatus=CONFIRMED&page=2',
    );
  });

  it('writes the first page as no parameter, so it has one canonical URL', () => {
    expect(hrefFor({}, 0)).toBe('/partner/reservations');
    expect(hrefFor({ q: 'An', page: 4 }, 0)).toBe('/partner/reservations?q=An');
  });

  it('reports the range and the total the server counted', () => {
    render(
      <ReservationPager
        page={page({ items: [reservation(), reservation()], page: 1, size: 2, total: 5 })}
        filters={{}}
        copy={RESERVATION_PAGER_COPY}
      />,
    );

    expect(screen.getByText('Hiển thị 3–4 trong 5 đặt phòng')).toBeTruthy();
    expect(screen.getByText('Trang 2 / 3')).toBeTruthy();
  });

  it('disables the ends rather than offering a link that goes nowhere', () => {
    render(
      <ReservationPager
        page={page({ items: [reservation()], page: 0, size: 1, total: 2 })}
        filters={{}}
        copy={RESERVATION_PAGER_COPY}
      />,
    );

    // A disabled anchor is not a thing HTML has, so the inert end is a span.
    const previous = screen.getByText(RESERVATION_PAGER_COPY.previous);
    expect(previous.tagName).toBe('SPAN');
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(RESERVATION_PAGER_COPY.next).tagName).toBe('A');
  });

  it('shows no controls when one page holds everything', () => {
    render(<ReservationPager page={page()} filters={{}} copy={RESERVATION_PAGER_COPY} />);

    // The summary stays — it is what tells an operator how much matched.
    expect(screen.getByText('Hiển thị 1–1 trong 1 đặt phòng')).toBeTruthy();
    expect(screen.queryByText(RESERVATION_PAGER_COPY.next)).toBeNull();
  });

  it('still offers a way back from a page past the end', () => {
    // Reachable from the address bar. Without controls here the only escape is
    // editing the URL by hand.
    render(
      <ReservationPager
        page={page({ items: [], page: 9, size: 20, total: 3 })}
        filters={{ page: 9 }}
        copy={RESERVATION_PAGER_COPY}
      />,
    );

    const previous = screen.getByText(RESERVATION_PAGER_COPY.previous);
    expect(previous.tagName).toBe('A');
    // The real page count, not "Trang 10 / 1".
    expect(screen.getByText('Trang 1 / 1')).toBeTruthy();
  });

  it('renders nothing at all when nothing matched', () => {
    const { container } = render(
      <ReservationPager
        page={page({ items: [], total: 0 })}
        filters={{}}
        copy={RESERVATION_PAGER_COPY}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ------------------------------------------------------------------ loading

describe('loading', () => {
  it('sends only the filters that are set', async () => {
    searchApi.mockResolvedValue(page());
    await loadReservations({ q: 'An', property: '' }, 'cookie=1');

    expect(searchApi).toHaveBeenCalledWith('en', { q: 'An', property: '' }, 'cookie=1');
  });

  it('treats an empty page as a success, not an error', async () => {
    searchApi.mockResolvedValue(page({ items: [], total: 0 }));
    const result = await loadReservations();

    // "No reservation matches" and "the search failed" are different facts, and
    // rendering the first when the second is true hides a broken screen.
    expect(result.status).toBe('ok');
  });

  it('keeps a failure as its own state', async () => {
    searchApi.mockRejectedValue(
      new ApiError(500, {
        code: 'INTERNAL_ERROR',
        message: 'nope',
        details: [],
        correlationId: 'abc',
      }),
    );
    const result = await loadReservations();

    expect(result.status).toBe('error');
  });

  it('reports a 404 as not found, and never as "not permitted"', async () => {
    searchApi.mockReset();
    detailApi.mockRejectedValue(
      new ApiError(404, {
        code: 'NOT_FOUND',
        message: 'no',
        details: [],
        correlationId: null,
      }),
    );

    // Another partner's reference and one that never existed are one answer.
    // Re-describing it as a permission problem would leak what the 404 hides.
    expect((await loadReservation('KAS-260908-XXXX')).status).toBe('notFound');
  });
});

/**
 * The four groups the filter offers, against the seven states the schema has.
 *
 * The risk this guards is quiet: a status added to `stay_status` later belongs
 * to no group, so it would vanish from every filter option while still
 * appearing on rows — a reservation an operator can see and cannot search for.
 */
describe('stay status groups', () => {
  it('covers every state in the enum exactly once', () => {
    const grouped = STAY_STATUS_GROUP_ORDER.flatMap((group) => [...STAY_STATUS_GROUPS[group]]);

    expect([...grouped].sort()).toEqual([...STAY_STATUSES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('maps each group to the states its label claims', () => {
    // "Đã xác nhận" is the stay agreed and ahead of the guest. CHECK_IN_READY means
    // the room is prepared, not that anybody arrived.
    expect(STAY_STATUS_GROUPS.confirmed).toEqual(['CONFIRMED', 'CHECK_IN_READY']);
    // In the house, then gone: a departed guest and a closed folio are both checked out.
    expect(STAY_STATUS_GROUPS.inHouse).toEqual(['CHECKED_IN']);
    expect(STAY_STATUS_GROUPS.checkedOut).toEqual(['CHECKED_OUT', 'COMPLETED']);
    // Kept apart on purpose: a cancellation is a decision, a no-show is a
    // failure to appear, and they carry different money and follow-up.
    expect(STAY_STATUS_GROUPS.cancelled).toEqual(['CANCELLED']);
    expect(STAY_STATUS_GROUPS.noShow).toEqual(['NO_SHOW']);
  });

  it('labels every group in Vietnamese, with no enum among them', () => {
    const labels = STAY_STATUS_GROUP_ORDER.map((group) => STAY_STATUS_GROUP_LABEL[group]);

    expect(labels).toEqual(['Đã xác nhận', 'Đang lưu trú', 'Đã trả phòng', 'Không đến', 'Đã hủy']);
    expect(labels.join(' ')).not.toMatch(/[A-Z_]{4,}/);
  });

  it('leaves a null stay status out of every group, and says why on the row', () => {
    // V12: `stay_status` is NULL until confirmed. A DIRECT request whose sales
    // outcome is undecided has no stay to be in a state, so folding it into
    // "Đã xác nhận" would claim a booking nobody has won. Those rows answer only to
    // "Tất cả" — and the badge states the absence rather than leaving a blank.
    expect(stayStatusLabel(null)).toBe(STAY_STATUS_UNSET);
    expect(STAY_STATUS_GROUP_ORDER.every((g) => !STAY_STATUS_GROUPS[g].includes('' as never)))
      .toBe(true);
  });

  it('recognises exactly the four tokens as groups', () => {
    for (const group of STAY_STATUS_GROUP_ORDER) {
      expect(isStayStatusGroup(group)).toBe(true);
    }
    for (const notAGroup of ['CONFIRMED', 'all', '', undefined]) {
      expect(isStayStatusGroup(notAGroup as string | undefined)).toBe(false);
    }
  });
});
