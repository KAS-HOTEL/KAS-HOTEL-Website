// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Primitives from '@/ui/primitives';
import type { PublishedRoomType, RequestRoomOption } from '@/lib/domain/availability';
import { notBookableReason, roomLabel, stayProblem } from '@/lib/domain/availability';
import { quoteProblem } from '@/lib/domain/quote';

vi.mock('@/lib/api/endpoints', () => ({
  publicHotelsApi: { quote: vi.fn() },
  reservationsApi: { request: vi.fn() },
}));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

const { AvailabilityPanel } = await import('./AvailabilityPanel');
const { StaySearchBar } = await import('./StaySearchBar');
const { availabilityCopy, quoteCopy, searchCopy } = await import('./requestMessages');
const { roomSelectionCopy, staySearchCopy, staySummaryCopy } = await import('./bookingMessages');

/**
 * Any Vietnamese-specific letter. Step 16A.32 found `/en` rendering "Phòng
 * trống", "Còn 6 phòng" and "Đặt tối đa 5 phòng mỗi lần" on the live booking
 * path; this is the guard that keeps them out.
 *
 * It is deliberately a character class rather than a word list: a new
 * hardcoded Vietnamese string would slip past a list, and cannot slip past this.
 *
 * <p>STEP J replaced the surface this guard was written against — the booking
 * path is now the search bar, the room offers and the stay summary — so the
 * guard follows it rather than being retired with the components it used to
 * cover. The failure it exists to catch is unchanged: a hardcoded Vietnamese
 * string reaching an English reader.
 */
const VIETNAMESE = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

function room(overrides: Partial<RequestRoomOption> = {}): RequestRoomOption {
  return {
    roomTypeSlug: 'deluxe',
    name: 'Deluxe Room',


    nightlyFrom: { amountMinor: 1_850_000, currency: 'VND', exponent: 0 },

    ...overrides,
  };
}

const DESCRIPTION: PublishedRoomType = {
  slug: 'deluxe',
  name: 'Deluxe Room',
  maxAdults: 2,
  maxChildren: 1,
  maxOccupancy: 3,
  areaSqm: 32,
  viewType: 'CITY',
  smoking: false,
  beds: [{ bedType: 'King', bedCount: 1, isDefault: true }],
};

/** The whole booking surface, as a guest in this locale sees it. */
function results(locale: string, rooms = [room()]) {
  return render(
    <AvailabilityPanel
      slug="kas-milestone"
      name="KAS Milestone"
      locale={locale}
      availability={{ status: 'ok', rooms }}
      checkIn="2026-09-12"
      checkOut="2026-09-14"
      adults={2}
      roomsWanted={1}
      selection={{}}
      roomTypes={[DESCRIPTION]}
      galleries={{}}
      retryHref="/en/hotels/kas-milestone"
    />,
  );
}

function searchBar(locale: string, problem?: string) {
  return render(
    <StaySearchBar
      action={`/${locale}/hotels/x`}
      today="2026-08-20"
      stay={{ adults: 2, rooms: 1 }}
      copy={staySearchCopy(locale)}
      {...(problem === undefined ? {} : { problem })}
    />,
  );
}

afterEach(cleanup);

describe('the English booking path is English', () => {
  it('renders the availability heading, counts and limits in English', () => {
    results('en');

    // The three strings the live /en page was actually showing in Vietnamese.
    expect(screen.getByRole('heading', { name: 'Choose a room type to request' })).toBeTruthy();
    expect(screen.queryByText(/rooms left/)).toBeNull();
    expect(screen.getByText(/hotel will check room availability/i)).toBeTruthy();
  });

  it('renders the summary, occupancy and price labels in English', () => {
    results('en');

    expect(screen.getByText(/1 room type with price estimates/)).toBeTruthy();
    expect(screen.getByText('2 adults · 1 child')).toBeTruthy();
    expect(screen.getByText('from')).toBeTruthy();
    expect(screen.getByText('/ night')).toBeTruthy();
    expect(screen.getByText(/lowest nightly rate/)).toBeTruthy();
  });

  it('renders the room facts and the choose action in English', () => {
    results('en');

    expect(screen.getByText('Beds')).toBeTruthy();
    expect(screen.getByText('Non-smoking')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose room' })).toBeTruthy();
  });

  it('renders the stay summary in English', () => {
    results('en');

    const panel = screen.getByRole('complementary', { name: 'Stay summary' });
    expect(panel.textContent).toContain('Your stay');
    expect(panel.textContent).toContain('2 nights · 2 adults · 1 room');
    expect(panel.textContent).toContain('No rooms chosen yet.');
  });

  it('renders the sold-out state in English', () => {
    results('en', [room({  })]);

    expect(screen.queryByText('Sold out')).toBeNull();
  });

  it('renders the empty result in English', () => {
    // `200 []` — every room type checked, none sellable across the whole stay.
    render(
      <AvailabilityPanel
        slug="kas-milestone"
        name="KAS Milestone"
        locale="en"
        availability={{ status: 'ok', rooms: [] }}
        checkIn="2026-09-12"
        checkOut="2026-09-14"
        adults={2}
        roomsWanted={1}
        selection={{}}
        roomTypes={[]}
        galleries={{}}
        retryHref="/en/hotels/kas-milestone"
      />,
    );

    expect(screen.getByText('No price estimate for these dates')).toBeTruthy();
    expect(screen.getByText(/Contact the hotel/)).toBeTruthy();
  });

  it('renders the date search in English', () => {
    searchBar('en');

    expect(screen.getByRole('heading', { name: 'Find a room' })).toBeTruthy();
    expect(screen.getByLabelText(/Check-in/)).toBeTruthy();
    expect(screen.getByLabelText(/Check-out/)).toBeTruthy();
    expect(screen.getByLabelText('Adults')).toBeTruthy();
    expect(screen.getByLabelText('Rooms')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View rooms and prices' })).toBeTruthy();
    expect(screen.getByText('The check-out night is not charged.')).toBeTruthy();
    // Config B10 is OPEN — the limitation is stated, in the reader's language.
    expect(screen.getByText(/children cannot be booked online yet/)).toBeTruthy();
  });

  it('leaves no Vietnamese anywhere in the English availability panel', () => {
    // The regression guard. Hotel content — names, the hotel's own words — is
    // the operator's and may be in any language; the fixture uses English names
    // so anything Vietnamese here is the UI's own doing.
    const { container } = results('en');

    expect(container.textContent).not.toMatch(VIETNAMESE);
  });

  it('leaves no Vietnamese in the English date search, sold-out or empty states', () => {
    for (const rooms of [[room()], [room({ })]]) {
      const { container } = results('en', rooms);
      expect(container.textContent).not.toMatch(VIETNAMESE);
      cleanup();
    }

    const { container } = searchBar('en', staySearchCopy('en').checkOutNote);
    expect(container.textContent).not.toMatch(VIETNAMESE);
  });
});

describe('the Vietnamese booking path is unchanged', () => {
  it('still renders the availability panel in Vietnamese', () => {
    results('vi');

    expect(screen.getByRole('heading', { name: 'Chọn loại phòng để gửi yêu cầu' })).toBeTruthy();
    expect(screen.queryByText(/Còn \d+ phòng/)).toBeNull();
    expect(screen.getByText(/Khách sạn sẽ kiểm tra phòng/)).toBeTruthy();
    expect(screen.getByText('từ')).toBeTruthy();
    expect(screen.getByText('/ đêm')).toBeTruthy();
  });

  it('still renders the date search in Vietnamese', () => {
    searchBar('vi');

    expect(screen.getByRole('heading', { name: 'Tìm phòng' })).toBeTruthy();
    expect(screen.getByLabelText(/Nhận phòng/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem loại phòng và giá' })).toBeTruthy();
  });
});

describe('the domain helpers speak the copy they are given', () => {
  it('returns stay problems in the reader’s language', () => {
    const en = searchCopy('en');
    const vi = searchCopy('vi');

    expect(stayProblem('2026-09-14', '2026-09-12', '2026-08-20', en))
      .toBe(en.atLeastOneNight);
    expect(stayProblem('2026-09-14', '2026-09-12', '2026-08-20', vi))
      .toBe(vi.atLeastOneNight);
    expect(stayProblem('2026-08-19', '2026-09-12', '2026-08-20', en)).toBe(en.checkInPast);
    expect(stayProblem('nope', '2026-09-12', '2026-08-20', en)).toBe(en.bothDatesRequired);
    // Unchanged behaviour: a valid stay is still null, and no horizon is invented.
    expect(stayProblem('2026-09-12', '2026-09-14', '2026-08-20', en)).toBeNull();
  });

  it('returns the not-bookable reason in the reader’s language', () => {
    const en = searchCopy('en');

    expect(notBookableReason('COMING_SOON', en)).toBe(en.comingSoon);
    expect(notBookableReason('TEMPORARILY_CLOSED', en)).toBe(en.temporarilyClosed);
    // Unchanged: OPEN has no reason, because it is bookable.
    expect(notBookableReason('OPEN', en)).toBeNull();
  });

  it('returns quote problems in the reader’s language', () => {
    const en = quoteCopy('en');

    expect(quoteProblem({}, 2, en)).toBe(en.atLeastOneRoom);
    expect(quoteProblem({ deluxe: 1 }, 0, en)).toBe(en.adultsRequired);
    expect(quoteProblem({ deluxe: 1 }, 2, en)).toBeNull();
  });

  it('speaks a room row as one sentence, in the reader’s language', () => {
    const en = roomSelectionCopy('en');

    const spoken = roomLabel(room(), 2, en);
    expect(spoken).toContain('Deluxe Room');
    expect(spoken).toContain('2 nights');
    expect(spoken).not.toMatch(VIETNAMESE);

    expect(roomLabel(room({ }), 2, en)).toContain('Hotel confirmation required');
  });
});

describe('the copy accessors', () => {
  it('serve both frozen locales and fall back to English', () => {
    expect(staySearchCopy('vi').title).toBe('Tìm phòng');
    expect(staySearchCopy('en').title).toBe('Find a room');
    expect(staySearchCopy('fr').title).toBe('Find a room');
    expect(roomSelectionCopy('fr').title).toBe('Choose a room type to request');
    expect(staySummaryCopy('fr').title).toBe('Your stay');
    // The older accessors are unchanged and still serve the surfaces that use them.
    expect(searchCopy('fr').portfolioTitle).toBe('Hotels');
    expect(availabilityCopy('fr').title).toBe('Room price estimates');
    expect(quoteCopy('fr').title).toBe('Choose rooms and see the price');
  });

  it('leaves no Vietnamese in any English string', () => {
    const en = [
      ...Object.values(searchCopy('en')),
      ...Object.values(availabilityCopy('en')),
      ...Object.values(quoteCopy('en')),
      ...Object.values(staySearchCopy('en')),
      ...Object.values(roomSelectionCopy('en')),
      ...Object.values(staySummaryCopy('en')),
    ];

    for (const value of en) {
      if (typeof value === 'string') {
        expect(value).not.toMatch(VIETNAMESE);
      }
    }
    // The functions too, called with a representative argument.
    expect(roomSelectionCopy('en').manualReview).not.toMatch(VIETNAMESE);
    expect(roomSelectionCopy('en').roomCount(2)).not.toMatch(VIETNAMESE);
    expect(roomSelectionCopy('en').bed(1, 'King')).not.toMatch(VIETNAMESE);
    expect(staySummaryCopy('en').party(2, 1)).not.toMatch(VIETNAMESE);
    expect(staySummaryCopy('en').stickyCount(2)).not.toMatch(VIETNAMESE);
  });

  it('keeps every Vietnamese string Vietnamese', () => {
    // The other direction: no English fallback leaked into the VI path.
    expect(roomSelectionCopy('vi').title).toBe('Chọn loại phòng để gửi yêu cầu');
    expect(roomSelectionCopy('vi').roomCount(2)).toBe('2 phòng');
    expect(staySummaryCopy('vi').total).toBe('Tạm tính');
    expect(staySearchCopy('vi').submit).toBe('Xem loại phòng và giá');
  });

  it('agrees on the same shape in both locales', () => {
    // A key added to one locale and forgotten in the other is the classic way a
    // half-translated page ships.
    const pairs: readonly (readonly [object, object])[] = [
      [searchCopy('en'), searchCopy('vi')],
      [availabilityCopy('en'), availabilityCopy('vi')],
      [quoteCopy('en'), quoteCopy('vi')],
      [staySearchCopy('en'), staySearchCopy('vi')],
      [roomSelectionCopy('en'), roomSelectionCopy('vi')],
      [staySummaryCopy('en'), staySummaryCopy('vi')],
    ];
    for (const [en, vi] of pairs) {
      expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
    }
  });
});
