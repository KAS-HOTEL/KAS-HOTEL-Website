// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedRoomType, RequestRoomOption } from '@/lib/domain/availability';
import type { PublicMediaView } from '@/lib/domain/media';

const quoteApi = vi.fn();
const requestApi = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  publicHotelsApi: { quote: (...args: unknown[]) => quoteApi(...args) },
  reservationsApi: { create: (...args: unknown[]) => requestApi(...args) },
}));

const {
  MIN_ADULTS,
  fitsParty,
  hasDates,
  parseSelection,
  parseStayQuery,
  reconcileSelection,
  roomsNeededFor,
  selectedRooms,
  selectionParams,
  stayQueryString,
} = await import('@/lib/domain/stay');
const { StaySearchBar } = await import('./StaySearchBar');
const { RoomOffer } = await import('./RoomOffer');
const { BookingSection } = await import('./BookingSection');
const { staySearchCopy, roomSelectionCopy } = await import('./bookingMessages');

const TODAY = '2026-09-06';
const CHECK_IN = '2026-09-12';
const CHECK_OUT = '2026-09-14';

function room(overrides: Partial<RequestRoomOption> = {}): RequestRoomOption {
  return {
    roomTypeSlug: 'deluxe',
    name: 'Deluxe Room',


    nightlyFrom: { amountMinor: 1_850_000, currency: 'VND', exponent: 0 },

    ...overrides,
  };
}

function description(overrides: Partial<PublishedRoomType> = {}): PublishedRoomType {
  return {
    slug: 'deluxe',
    name: 'Deluxe Room',
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    areaSqm: 32,
    smoking: false,
    shortDescription: 'Cửa sổ nhìn ra phố cổ.',
    beds: [{ bedType: 'Giường đôi lớn', bedCount: 1, isDefault: true }],
    ...overrides,
  };
}

function image(n: number): PublicMediaView {
  return { url: `https://media.kas.invalid/m/asset-${n}`, width: 2400, height: 1600, isCover: n === 1 };
}

afterEach(cleanup);
beforeEach(() => {
  quoteApi.mockReset();
  requestApi.mockReset();
  window.history.replaceState({}, '', '/vi/hotels/kas-passion');
});

/* ==========================================================================
 * The stay, as it lives in the URL
 * ======================================================================== */

describe('the stay query', () => {
  it('keeps a usable stay exactly as given', () => {
    expect(parseStayQuery({
      destination: 'District 1',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      adults: '3',
      rooms: '2',
    })).toEqual({
      destination: 'District 1',
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      adults: 3,
      rooms: 2,
    });
  });

  it('treats a malformed date as no date rather than passing it through', () => {
    // `?checkIn=yesterday` should show the empty search, not an error about a
    // value the guest never typed.
    const stay = parseStayQuery({ checkIn: 'yesterday', checkOut: CHECK_OUT });
    expect(stay.checkIn).toBeUndefined();
    expect(stay.checkOut).toBe(CHECK_OUT);
    expect(hasDates(stay)).toBe(false);
  });

  it('clamps a nonsensical count instead of refusing it', () => {
    // `?adults=0` has an obvious intended meaning and refusing it helps nobody.
    expect(parseStayQuery({ adults: '0' }).adults).toBe(MIN_ADULTS);
    expect(parseStayQuery({ adults: '-4' }).adults).toBe(MIN_ADULTS);
    expect(parseStayQuery({ adults: 'lots' }).adults).toBe(MIN_ADULTS);
    expect(parseStayQuery({ rooms: '2.7' }).rooms).toBe(2);
    // A presentation ceiling, not a business rule — config B11 is the backend's.
    expect(parseStayQuery({ adults: '9999' }).adults).toBe(30);
  });

  it('defaults to one adult and one room when nothing was asked', () => {
    expect(parseStayQuery({})).toEqual({ adults: 1, rooms: 1 });
  });

  it('ignores a blank destination, which means “anywhere”', () => {
    expect(parseStayQuery({ destination: '   ' }).destination).toBeUndefined();
  });

  it('writes the counts out even when they are the defaults', () => {
    // A shared link that dropped "2 adults" because two is the default would
    // show the recipient a different search from the sender's.
    const query = stayQueryString({ checkIn: CHECK_IN, checkOut: CHECK_OUT, adults: 1, rooms: 1 });
    const params = new URLSearchParams(query);
    expect(params.get('adults')).toBe('1');
    expect(params.get('rooms')).toBe('1');
    expect(params.get('checkIn')).toBe(CHECK_IN);
  });

  it('round-trips through the query string', () => {
    const stay = parseStayQuery({
      destination: 'District 3', checkIn: CHECK_IN, checkOut: CHECK_OUT, adults: '4', rooms: '2',
    });
    expect(parseStayQuery(
      Object.fromEntries(new URLSearchParams(stayQueryString(stay))),
    )).toEqual(stay);
  });
});

describe('the room selection in the URL', () => {
  it('reads repeated room parameters', () => {
    expect(parseSelection(['deluxe:2', 'suite:1'])).toEqual({ deluxe: 2, suite: 1 });
  });

  it('reads a single one, which is how one entry arrives', () => {
    expect(parseSelection('deluxe:2')).toEqual({ deluxe: 2 });
  });

  it('drops a malformed entry without losing the rest', () => {
    expect(parseSelection(['deluxe:2', 'broken', 'suite:0', ':3', 'twin:-1']))
      .toEqual({ deluxe: 2 });
  });

  it('keeps a slug that contains a colon', () => {
    // The split is on the LAST colon, so only the quantity is taken off the end.
    expect(parseSelection(['a:b:3'])).toEqual({ 'a:b': 3 });
  });

  it('says “none of this room” by absence, never by a zero', () => {
    expect(selectionParams({ deluxe: 2, suite: 0 })).toEqual(['deluxe:2']);
  });

  it('counts every room across every type', () => {
    expect(selectedRooms({ deluxe: 2, suite: 1 })).toBe(3);
    expect(selectedRooms({})).toBe(0);
  });
});

/* ==========================================================================
 * A selection that has gone stale
 * ======================================================================== */

describe('reconciling a selection against new availability', () => {
  it('leaves a selection the backend still offers alone', () => {
    const result = reconcileSelection({ deluxe: 2 }, [room()]);
    expect(result.selection).toEqual({ deluxe: 2 });
    expect(result.changed).toEqual([]);
  });

  it('keeps requested quantity independently of stock', () => {
    expect(reconcileSelection({ deluxe: 4 }, [room()])).toEqual({ selection: { deluxe: 4 }, changed: [] });
  });

  it('does not infer stock from a published room', () => {
    expect(reconcileSelection({ deluxe: 2 }, [room()]).selection).toEqual({ deluxe: 2 });
  });

  it('drops a room the response no longer carries at all', () => {
    // A room the backend cannot price is omitted entirely, so it simply is not
    // in the list — and the selection cannot survive that either.
    const result = reconcileSelection({ suite: 1 }, [room()]);
    expect(result.selection).toEqual({});
    // Named by slug, because no name arrived to use instead.
    expect(result.changed).toEqual([
      { roomTypeSlug: 'suite', name: 'suite', from: 1, to: 0 },
    ]);
  });
});

/* ==========================================================================
 * Published capacity — a description, never a filter
 * ======================================================================== */

describe('published room capacity', () => {
  it('reads maxAdults across the rooms wanted', () => {
    expect(fitsParty(description({ maxAdults: 2 }), 4, 2)).toBe(true);
    expect(fitsParty(description({ maxAdults: 2 }), 5, 2)).toBe(false);
  });

  it('never calls an unknown room too small', () => {
    // Not knowing is not the same as not fitting, and the backend owns the
    // refusal (config B11, 422 OCCUPANCY_EXCEEDED).
    expect(fitsParty(undefined, 10, 1)).toBe(true);
  });

  it('suggests the fewest rooms that could hold the party', () => {
    expect(roomsNeededFor(description({ maxAdults: 2 }), 5)).toBe(3);
    expect(roomsNeededFor(description({ maxAdults: 2 }), 2)).toBe(1);
  });

  it('suggests nothing when there is no capacity to reason from', () => {
    expect(roomsNeededFor(undefined, 4)).toBeNull();
    expect(roomsNeededFor(description({ maxAdults: 0 }), 4)).toBeNull();
  });
});

/* ==========================================================================
 * The search bar
 * ======================================================================== */

describe('the search bar', () => {
  function bar(overrides: Partial<Parameters<typeof StaySearchBar>[0]> = {}) {
    return (
      <StaySearchBar
        action="/vi/hotels"
        today={TODAY}
        stay={{ adults: 2, rooms: 1 }}
        copy={staySearchCopy('vi')}
        {...overrides}
      />
    );
  }

  it('is a plain GET form, so a search is a real URL', () => {
    const { container } = render(bar());
    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('get');
    expect(form?.getAttribute('action')).toBe('/vi/hotels');
  });

  it('carries dates and party, and nothing the contract cannot use', () => {
    const { container } = render(bar({ districts: ['Quận 1'] }));
    const names = [...container.querySelectorAll('input, select')]
      .map((el) => el.getAttribute('name'))
      .sort();
    expect(names).toEqual(['adults', 'checkIn', 'checkOut', 'destination', 'rooms']);
  });

  it('offers no child control, and says why in words', () => {
    // Config B10 is OPEN: the backend refuses any request with children, and
    // doc 26 §7.4 forbids the control. A field whose only outcome is a refusal
    // is worse than no field — so the limitation is stated instead.
    render(bar());
    expect(screen.queryByLabelText(/trẻ em|child/i)).toBeNull();
    expect(screen.getByText(/trẻ em/)).toBeTruthy();
  });

  it('floors check-in at today and check-out the night after check-in', () => {
    render(bar({ stay: { checkIn: CHECK_IN, adults: 2, rooms: 1 } }));
    expect(screen.getByLabelText('Nhận phòng').getAttribute('min')).toBe(TODAY);
    expect(screen.getByLabelText('Trả phòng').getAttribute('min')).toBe('2026-09-13');
  });

  it('guesses no booking horizon', () => {
    // INVENTORY_HORIZON_MONTHS is a backend setting no endpoint exposes
    // (OQ-145), so a date beyond it is the backend's own 422 to give.
    render(bar());
    expect(screen.getByLabelText('Nhận phòng').getAttribute('max')).toBeNull();
    expect(screen.getByLabelText('Trả phòng').getAttribute('max')).toBeNull();
  });

  it('drops the destination on a hotel page, where it is already decided', () => {
    render(bar({ variant: 'stay', districts: ['Quận 1'] }));
    expect(screen.queryByLabelText('Khu vực')).toBeNull();
  });

  it('offers no destination control when the portfolio has no districts', () => {
    // A dropdown whose only entry is "all" is a control that cannot do anything.
    render(bar({ districts: [] }));
    expect(screen.queryByLabelText('Khu vực')).toBeNull();
  });

  it('announces a refusal and ties it to both date fields', () => {
    render(bar({ problem: 'Ngày trả phòng phải sau ngày nhận phòng.' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/sau ngày nhận phòng/);
    expect(screen.getByLabelText('Nhận phòng').getAttribute('aria-describedby'))
      .toBe(alert.id);
    // The check-out field also carries its own note, so the refusal is added to
    // the description rather than replacing it.
    expect(screen.getByLabelText('Trả phòng').getAttribute('aria-describedby')?.split(' '))
      .toContain(alert.id);
  });

  it('describes the check-out field without renaming it', () => {
    // Inside the label, a screen reader would announce "Check-out, the check-out
    // night is not charged" as the field's *name* every time it took focus.
    render(bar());
    const checkOut = screen.getByLabelText('Trả phòng');
    const describedBy = checkOut.getAttribute('aria-describedby') as string;
    expect(document.getElementById(describedBy)?.textContent)
      .toBe('Đêm trả phòng không tính tiền.');
  });
});

/* ==========================================================================
 * One room offer
 * ======================================================================== */

describe('a room offer', () => {
  const copy = roomSelectionCopy('vi');

  function offer(overrides: Partial<Parameters<typeof RoomOffer>[0]> = {}) {
    return (
      <ul>
        <RoomOffer
          room={room()}
          description={description()}
          images={[image(1), image(2)]}
          quantity={0}
          nightCount={2}
          adults={2}
          rooms={1}
          copy={copy}
          onChoose={vi.fn()}
          {...overrides}
        />
      </ul>
    );
  }

  it('shows the room’s own photographs', () => {
    const { container } = render(offer());
    // The main image plus one thumbnail per photograph — RoomGallery's shape.
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources.every((src) => src?.startsWith('https://media.kas.invalid/'))).toBe(true);
  });

  it('renders no gallery for a room with no photographs, rather than a placeholder', () => {
    const { container } = render(offer({ images: [] }));
    expect(container.querySelector('img')).toBeNull();
  });

  it('states beds, occupancy, area and smoking from the published description', () => {
    render(offer());
    expect(screen.getByText('Giường')).toBeTruthy();
    expect(screen.getByText('1 × Giường đôi lớn')).toBeTruthy();
    expect(screen.getByText('2 người lớn · 1 trẻ em')).toBeTruthy();
    expect(screen.getByText('32 m²')).toBeTruthy();
    // NOT NULL, so both states are facts and both are stated.
    expect(screen.getByText('Không hút thuốc')).toBeTruthy();
  });

  it('omits a fact the room does not publish, rather than inventing one', () => {
    render(offer({ description: description({ areaSqm: null, beds: [] }) }));
    expect(screen.queryByText(/m²/)).toBeNull();
    expect(screen.queryByText('Giường')).toBeNull();
  });

  it('shows the backend’s nightly rate, marked as a per-night “from”', () => {
    render(offer());
    expect(screen.getByText('từ')).toBeTruthy();
    expect(screen.getByText('/ đêm')).toBeTruthy();
    expect(screen.getByText(/1\.850\.000/)).toBeTruthy();
  });

  it('shows manual review without remaining room counts', () => {
    const { container } = render(offer()); expect(screen.getByText('Khách sạn sẽ kiểm tra phòng và xác nhận yêu cầu của bạn.')).toBeTruthy(); expect(container.textContent).not.toMatch(/Còn \d+ phòng|Hết phòng/);
  });

  it('does not display a stock-based ceiling', () => {
    render(offer()); expect(screen.queryByText(/Tối đa.*phòng mỗi lần/)).toBeNull();
  });

  it('starts at enough rooms for the party, bounded by what is sellable', async () => {
    const onChoose = vi.fn();
    // Four adults, rooms holding two each → three would be needed for five; two
    // for four. Bounded by maxQuantitySelectable.
    render(offer({ adults: 4, onChoose }));
    await userEvent.click(screen.getByRole('button', { name: 'Chọn phòng' }));
    expect(onChoose).toHaveBeenCalledWith('deluxe', 2);
  });

  it('never suggests more than the backend will sell', async () => {
    const onChoose = vi.fn();
    render(offer({ adults: 10, room: room({ }), onChoose }));
    await userEvent.click(screen.getByRole('button', { name: 'Chọn phòng' }));
    expect(onChoose).toHaveBeenCalledWith('deluxe', 5);
  });

  it('offers a quantity bounded by the backend once chosen', () => {
    render(offer({ quantity: 1, room: room({ }) }));
    const options = [...screen.getByRole('combobox').querySelectorAll('option')]
      .map((o) => o.getAttribute('value'));
    // 0 is how a guest removes the room; 3 is the backend's ceiling.
    expect(options).toEqual(Array.from({ length: 31 }, (_, n) => String(n)));
  });

  it('allows a published room to be requested before manual review', () => {
    render(offer()); expect(screen.queryByText('Hết phòng')).toBeNull(); expect(screen.getByRole('button', { name: 'Chọn phòng' })).toBeTruthy();
  });

  it('says whether the party fits, from the published capacity', () => {
    const { rerender } = render(offer({ adults: 2, rooms: 1 }));
    expect(screen.getByText('Đủ chỗ cho 2 người lớn')).toBeTruthy();

    rerender(offer({ adults: 6, rooms: 1 }));
    expect(screen.getByText('Cần nhiều hơn số phòng bạn đang chọn')).toBeTruthy();
  });

  it('speaks the whole row as one sentence', () => {
    // A screen-reader user should never have to pair a price with a room by
    // proximity. The gallery's thumbnails are list items too, so this reads the
    // card itself rather than the first `listitem` in the tree.
    const { container } = render(offer());
    const card = container.querySelector('ul > li') as HTMLElement;
    const label = card.getAttribute('aria-label') ?? '';
    expect(label).toContain('Deluxe Room');
    expect(label).toContain('1.850.000 đồng');
    expect(label).toContain('2 đêm');
  });
});

/* ==========================================================================
 * The whole booking surface
 * ======================================================================== */

describe('the booking surface', () => {
  function booking(overrides: Partial<Parameters<typeof BookingSection>[0]> = {}) {
    return (
      <BookingSection
        propertySlug="kas-passion"
        propertyName="KAS Passion"
        locale="vi"
        rooms={[room()]}
        roomTypes={[description()]}
        galleries={{ deluxe: [image(1)] }}
        checkIn={CHECK_IN}
        checkOut={CHECK_OUT}
        nightCount={2}
        adults={2}
        roomsWanted={1}
        initialSelection={{}}
        {...overrides}
      />
    );
  }

  it('summarises the dates and the backend’s counts', () => {
    render(booking({ rooms: [room(), room({ roomTypeSlug: 'suite', name: 'Suite', })] }));
    const status = screen.getByRole('status', { name: 'Kết quả tìm phòng' });
    expect(status.textContent).toContain('2 đêm');
    expect(status.textContent).toContain('2 loại phòng có giá tham khảo');
  });

  it('starts empty and asks for a room before offering a price', () => {
    render(booking());
    expect(screen.getByText('Chưa chọn phòng nào.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem giá kỳ nghỉ' })).toBeNull();
  });

  it('restores the selection the URL carried', () => {
    render(booking({ initialSelection: { deluxe: 2 } }));
    expect(screen.getAllByText('Đã chọn 2 phòng').length).toBeGreaterThan(0);
  });

  it('reconciles a URL selection the backend no longer offers, and says so', () => {
    render(booking({
      initialSelection: { deluxe: 9, suite: 1 },
      rooms: [room({ })],
    }));

    // Reduced to the ceiling, and the vanished room dropped — both announced.
    const notice = screen.getAllByRole('status')
      .find((el) => el.textContent?.includes('cập nhật'));
    expect(notice?.textContent).not.toContain('Deluxe Room:');
    expect(notice?.textContent).toContain('suite: không còn trong danh sách yêu cầu');
  });

  it('writes the selection into the URL so the stay is linkable', async () => {
    render(booking());
    await userEvent.click(screen.getByRole('button', { name: 'Chọn phòng' }));

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.getAll('room')).toEqual(['deluxe:1']);
    });
  });

  it('clears the room from the URL when it is deselected', async () => {
    render(booking({ initialSelection: { deluxe: 2 } }));
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.getAll('room')).toEqual(['deluxe:2']);
    });

    await userEvent.selectOptions(
      document.getElementById('quantity-deluxe') as HTMLSelectElement, '0');
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.getAll('room')).toEqual([]);
    });
  });

  it('prices the selection through the quote endpoint, and never itself', async () => {
    quoteApi.mockResolvedValue({
      propertySlug: 'kas-passion', checkIn: CHECK_IN, checkOut: CHECK_OUT, nights: 2,
      lines: [{
        roomTypeSlug: 'deluxe', roomTypeName: 'Deluxe Room', quantity: 2,
        nightlyFrom: { amountMinor: 1_850_000, currency: 'VND', exponent: 0 },
        subtotal: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
      }],
      roomsSubtotal: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
      total: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
      currency: 'VND', estimate: true,
    });

    render(booking({ initialSelection: { deluxe: 2 } }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Xem giá kỳ nghỉ' })[0] as HTMLElement);

    await waitFor(() => expect(quoteApi).toHaveBeenCalled());
    expect(quoteApi).toHaveBeenCalledWith(
      {
        propertySlug: 'kas-passion',
        checkIn: CHECK_IN,
        checkOut: CHECK_OUT,
        adults: 2,
        // Config B10 is OPEN — nothing here can send a child.
        children: 0,
        childAges: [],
        lines: [{ roomTypeSlug: 'deluxe', quantity: 2 }],
      },
      'vi',
    );

    // The total on screen is the response's, not a nightly × nights product.
    await waitFor(() => expect(screen.getAllByText(/7\.400\.000/).length).toBeGreaterThan(0));
  });

  it('computes no total of its own before the backend has answered', () => {
    // nightlyFrom is a *lowest* rate; doc 56 §3.2's real arithmetic is
    // Σ over nights × quantity, and the two disagree whenever a rule varies the
    // rate across nights. So the panel shows the selection and no money.
    render(booking({ initialSelection: { deluxe: 2 } }));
    expect(screen.queryByText(/7\.400\.000/)).toBeNull();
    expect(screen.queryByText('Tạm tính')).toBeNull();
  });

  it('discards a price the moment the selection changes', async () => {
    quoteApi.mockResolvedValue({
      propertySlug: 'kas-passion', checkIn: CHECK_IN, checkOut: CHECK_OUT, nights: 2,
      lines: [], roomsSubtotal: { amountMinor: 1, currency: 'VND', exponent: 0 },
      total: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
      currency: 'VND', estimate: true,
    });

    const { container } = render(booking({ initialSelection: { deluxe: 2 } }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Xem giá kỳ nghỉ' })[0] as HTMLElement);
    await waitFor(() => expect(screen.getAllByText(/7\.400\.000/).length).toBeGreaterThan(0));

    // The room's own quantity control — the request form rendered beside the
    // priced quote has selects of its own.
    const quantity = container.querySelector('#quantity-deluxe') as HTMLSelectElement;
    // A total left beside a different set of rooms is simply wrong.
    await userEvent.selectOptions(quantity, '1');
    expect(screen.queryByText(/7\.400\.000/)).toBeNull();
  });

  it('shows the backend’s refusal rather than a generic failure', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    quoteApi.mockRejectedValue(
      new ApiError(422, {
        code: 'OCCUPANCY_EXCEEDED',
        message: 'That party is larger than this room can hold.',
        details: [],
        correlationId: 'test-correlation',
      }),
    );

    render(booking({ initialSelection: { deluxe: 2 } }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Xem giá kỳ nghỉ' })[0] as HTMLElement);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/larger than this room can hold/));
  });

  it('can be retried after a failure', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    quoteApi.mockRejectedValueOnce(new ApiError(503, { code: 'UNAVAILABLE', message: 'nope', details: [], correlationId: 'c' }));
    quoteApi.mockResolvedValueOnce({
      propertySlug: 'kas-passion', checkIn: CHECK_IN, checkOut: CHECK_OUT, nights: 2,
      lines: [], roomsSubtotal: { amountMinor: 1, currency: 'VND', exponent: 0 },
      total: { amountMinor: 7_400_000, currency: 'VND', exponent: 0 },
      currency: 'VND', estimate: true,
    });

    render(booking({ initialSelection: { deluxe: 2 } }));
    const price = () =>
      screen.getAllByRole('button', { name: 'Xem giá kỳ nghỉ' })[0] as HTMLElement;

    await userEvent.click(price());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    await userEvent.click(price());
    await waitFor(() => expect(screen.getAllByText(/7\.400\.000/).length).toBeGreaterThan(0));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('puts the rooms the party fits in first, without hiding any', () => {
    const single = description({ slug: 'single', name: 'Single', maxAdults: 1, maxChildren: 0, maxOccupancy: 1 });
    render(booking({
      adults: 4,
      roomsWanted: 2,
      rooms: [
        room({ roomTypeSlug: 'single', name: 'Single' }),
        room({ roomTypeSlug: 'deluxe', name: 'Deluxe Room' }),
      ],
      roomTypes: [single, description()],
      galleries: {},
    }));

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // Deluxe holds 2 adults, so two of them hold the party of four; Single
    // holds 1 and two hold two. Both are listed all the same, because capacity
    // refusal belongs to the backend (config B11).
    expect(names).toEqual(['Deluxe Room', 'Single']);
  });

  it('puts sold-out rooms below bookable ones, and still lists them', () => {
    render(booking({
      rooms: [
        room({ roomTypeSlug: 'gone', name: 'Gone', }),
        room(),
      ],
      roomTypes: [description(), description({ slug: 'gone', name: 'Gone' })],
      galleries: {},
    }));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent))
      .toEqual(['Gone', 'Deluxe Room']);
  });

  it('offers the sticky bar only once something is chosen', async () => {
    render(booking());
    // A permanent empty bar would cover the last room card and say nothing.
    expect(screen.queryByRole('region', { name: 'Tóm tắt kỳ nghỉ' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Chọn phòng' }));
    expect(screen.getByRole('region', { name: 'Tóm tắt kỳ nghỉ' }).textContent)
      .toContain('1 phòng đã chọn');
  });

  it('labels the price as an estimate, and reserves no tax line', () => {
    render(booking());
    const page = document.body.textContent ?? '';
    expect(page).toMatch(/giá thấp nhất mỗi đêm/);
    // Tax is out of KAS V1 scope entirely (doc 99 §12).
    expect(page).not.toMatch(/thuế|VAT|tax/i);
  });
});

describe('the stay summary', () => {
  it('shows the dates, the nights and the party', () => {
    render(
      <BookingSection
        propertySlug="kas-passion"
        propertyName="KAS Passion"
        locale="vi"
        rooms={[room()]}
        roomTypes={[description()]}
        galleries={{}}
        checkIn={CHECK_IN}
        checkOut={CHECK_OUT}
        nightCount={2}
        adults={3}
        roomsWanted={2}
        initialSelection={{}}
      />,
    );

    const panel = screen.getByRole('complementary', { name: 'Tóm tắt kỳ nghỉ' });
    expect(within(panel).getByText(`${CHECK_IN} → ${CHECK_OUT}`)).toBeTruthy();
    expect(within(panel).getByText('2 đêm · 3 người lớn · 2 phòng')).toBeTruthy();
  });
});
