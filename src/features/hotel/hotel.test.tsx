// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  addDays,
  AVAILABILITY_OMITS_UNPRICED,
  formatMoney,
  isBookable,
  isIsoDate,
  locationLabel,
  nights,
  notBookableReason,
  PUBLIC_LIFECYCLE_STATES,
  roomLabel,
  roomState,
  spokenMoney,
  stayProblem,
  type PublishedPropertyDetail,
  type PublishedRoomType,
  type RequestRoomOption,
} from '@/lib/domain/availability';

const propertyApi = vi.fn();
const roomTypesApi = vi.fn();
const availabilityApi = vi.fn();
const quoteApi = vi.fn();
const requestApi = vi.fn();
const notFoundSpy = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

const roomGalleryApi = vi.fn(async (...args: unknown[]) => {
  void args;
  return [];
});

vi.mock('next/navigation', () => ({ notFound: () => notFoundSpy() }));
vi.mock('@/lib/api/endpoints', () => ({
  publicHotelsApi: {
    property: (...a: unknown[]) => propertyApi(...a),
    roomTypes: (...a: unknown[]) => roomTypesApi(...a),
    availability: (...a: unknown[]) => availabilityApi(...a),
    quote: (...a: unknown[]) => quoteApi(...a),
    // The page reads each room type's photographs. These tests are about the
    // availability and quote flow, so the galleries are empty — which is also
    // the real state of a hotel whose Partner has not uploaded any.
    roomGallery: (...a: unknown[]) => roomGalleryApi(...a),
    // The page also reads the hotel's own gallery. Empty here: these suites are
    // about availability and quoting.
    gallery: (...a: unknown[]) => roomGalleryApi(...a),
  },
  // The request form renders once a quote exists, so the module mock must
  // carry its endpoint too — an undefined export would fail at import.
  reservationsApi: { request: (...a: unknown[]) => requestApi(...a) },
}));

const { loadAvailability, loadProperty, loadRoomTypes, guestMessageFor, guestFieldErrors } =
  await import('./load');
const HotelPageModule = await import('@/app/[locale]/hotels/[slug]/page');
const { quoteLines, quoteProblem, selectedRoomCount } = await import('@/lib/domain/quote');

const { searchCopy, availabilityCopy, quoteCopy } = await import('./requestMessages');

const VI_SEARCH = searchCopy('vi');
const VI_AVAILABILITY = availabilityCopy('vi');
const VI_QUOTE = quoteCopy('vi');

const SLUG = 'kas-passion-boutique-hotel';
const TODAY = '2026-08-20';
const CHECK_IN = '2026-09-12';
const CHECK_OUT = '2026-09-14';

function property(
  overrides: Partial<PublishedPropertyDetail> = {},
): PublishedPropertyDetail {
  return {
    slug: SLUG,
    name: 'KAS Passion Boutique Hotel',
    city: 'Hồ Chí Minh',
    district: 'Quận 1',
    isFlagship: false,
    lifecycleState: 'OPEN',
    // The detail response carries this hotel's own amenity assignments.
    amenities: [],
    landmarks: [],
    experiences: [],
    ...overrides,
  };
}

function room(overrides: Partial<RequestRoomOption> = {}): RequestRoomOption {
  return {
    roomTypeSlug: 'deluxe-room',
    name: 'Deluxe Room',


    nightlyFrom: { amountMinor: 1_850_000, currency: 'VND', exponent: 0 },

    ...overrides,
  };
}

function description(overrides: Partial<PublishedRoomType> = {}): PublishedRoomType {
  return {
    slug: 'deluxe-room',
    name: 'Deluxe Room',
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    ...overrides,
  };
}

const apiError = (status: number, code: string, message: string, details: readonly {
  field: string | null; code: string; message: string;
}[] = []) => new ApiError(status, { code, message, details, correlationId: null });

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-20T00:00:00Z'));
  for (const spy of [propertyApi, roomTypesApi, availabilityApi, quoteApi, notFoundSpy]) {
    spy.mockReset();
  }
  // Room types are fetched on every render now, not only after a date search:
  // they describe the hotel rather than answer a search. Tests that care about
  // the rooms still override this.
  roomTypesApi.mockResolvedValue([]);
  notFoundSpy.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
});

/** Renders the async Server Component by awaiting it first. */
async function renderPage(query: Record<string, string> = {}, locale = 'vi') {
  const element = await HotelPageModule.default({
    params: Promise.resolve({ locale, slug: SLUG }),
    searchParams: Promise.resolve(query),
  });
  return render(element);
}

describe('availability domain', () => {
  it('counts nights excluding the check-out night', () => {
    // Doc 55 §2 / doc 15 §3 — 12 Sep → 14 Sep is two nights.
    expect(nights('2026-09-12', '2026-09-14')).toBe(2);
    expect(nights('2026-09-12', '2026-09-13')).toBe(1);
  });

  it('mirrors only the frozen stay rules, and never guesses a horizon', () => {
    expect(stayProblem(CHECK_IN, CHECK_OUT, TODAY, VI_SEARCH)).toBeNull();
    expect(stayProblem('2026-08-19', CHECK_OUT, TODAY, VI_SEARCH)).toMatch(/đã qua/);
    expect(stayProblem(CHECK_IN, CHECK_IN, TODAY, VI_SEARCH)).toMatch(/ít nhất một đêm/);
    expect(stayProblem(CHECK_OUT, CHECK_IN, TODAY, VI_SEARCH)).toMatch(/ít nhất một đêm/);
    expect(stayProblem('nope', CHECK_OUT, TODAY, VI_SEARCH)).toMatch(/Chọn ngày/);
    // No 30/90/365-day cap and no horizon is invented — INVENTORY_HORIZON_MONTHS
    // is a backend setting no endpoint exposes, so a far date is the backend's
    // 422 to refuse, not this function's.
    expect(stayProblem(TODAY, addDays(TODAY, 900), TODAY, VI_SEARCH)).toBeNull();
  });

  it('formats money with the exponent the response carried', () => {
    // VND is zero-decimal — a generic /100 renders every price 100x wrong.
    expect(formatMoney({ amountMinor: 1_850_000, currency: 'VND', exponent: 0 }))
      .toContain('850.000');
    expect(spokenMoney({ amountMinor: 1_850_000, currency: 'VND', exponent: 0 }))
      .toBe('1.850.000 đồng');
    // A two-decimal currency is divided, because the exponent says so.
    expect(formatMoney({ amountMinor: 12_345, currency: 'USD', exponent: 2 })).toContain('123');
  });

  it('knows only OPEN is bookable — doc 03 §8', () => {
    expect(PUBLIC_LIFECYCLE_STATES).toEqual(['OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED']);
    expect(isBookable('OPEN')).toBe(true);
    expect(isBookable('COMING_SOON')).toBe(false);
    expect(isBookable('TEMPORARILY_CLOSED')).toBe(false);
    expect(isBookable('DRAFT')).toBe(false);
    expect(notBookableReason('COMING_SOON', VI_SEARCH)).toMatch(/sắp khai trương/);
    expect(notBookableReason('TEMPORARILY_CLOSED', VI_SEARCH)).toMatch(/tạm ngưng/);
    expect(notBookableReason('OPEN', VI_SEARCH)).toBeNull();
  });

  it('records that an unpriced room type never arrives', () => {
    // AvailabilityService omits it entirely rather than returning zero, so the
    // guest surface has no unpriced state to render and must not invent one.
    expect(AVAILABILITY_OMITS_UNPRICED).toBe(true);
  });

  it('states each room state in words, with the price bound to its room', () => {
    const available = roomLabel(room(), 2, VI_AVAILABILITY);
    expect(available).toContain('Deluxe Room');
    expect(available).toContain('Khách sạn sẽ kiểm tra phòng');
    expect(available).toContain('1.850.000 đồng');

    const soldOut = roomLabel(room({  }), 2, VI_AVAILABILITY);
    expect(soldOut).toContain('Khách sạn sẽ kiểm tra phòng');
    expect(roomState(room())).toBe('requestOnly');
    expect(roomState(room({ }))).toBe('requestOnly');
  });

  it('builds a location from whichever parts arrived', () => {
    expect(locationLabel(property())).toBe('Quận 1, Hồ Chí Minh');
    expect(locationLabel(property({ district: null }))).toBe('Hồ Chí Minh');
    expect(locationLabel(property({ district: null, city: null }))).toBeNull();
    expect(isIsoDate('2026-09-12')).toBe(true);
    expect(isIsoDate('12/09/2026')).toBe(false);
  });
});

describe('public loaders', () => {
  it('calls the frozen public paths with dates and locale, and nothing else', async () => {
    availabilityApi.mockResolvedValue([room()]);
    await loadAvailability(SLUG, CHECK_IN, CHECK_OUT, 'vi');

    expect(availabilityApi).toHaveBeenCalledWith(SLUG, CHECK_IN, CHECK_OUT, 'vi');
    // The frozen contract takes dates and a locale — there is no occupancy
    // parameter on the per-property route, so none is sent.
    expect(JSON.stringify(availabilityApi.mock.calls[0])).not.toMatch(/adults|children|rooms=/i);
    // Public means public: no session, no partner, no authorization.
    expect(JSON.stringify(availabilityApi.mock.calls[0]))
      .not.toMatch(/partnerId|Authorization|Bearer|cookie/i);
  });

  it('turns a non-published property into notFound, never into forbidden', async () => {
    propertyApi.mockRejectedValue(apiError(404, 'NOT_FOUND', 'Property not found'));
    const result = await loadProperty(SLUG, 'vi');
    // DRAFT, CLOSED, another partner's, and never-existed are one answer.
    expect(result.status).toBe('notFound');
  });

  it('reports a 5xx as an error rather than an empty result', async () => {
    propertyApi.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'boom'));
    expect((await loadProperty(SLUG, 'vi')).status).toBe('error');

    availabilityApi.mockRejectedValue(new TypeError('fetch failed'));
    const unreachable = await loadAvailability(SLUG, CHECK_IN, CHECK_OUT, 'vi');
    expect(unreachable.status).toBe('error');
    if (unreachable.status === 'error') {
      expect(unreachable.error.status).toBe(0);
    }
  });

  it('treats an empty availability array as a success', async () => {
    availabilityApi.mockResolvedValue([]);
    expect(await loadAvailability(SLUG, CHECK_IN, CHECK_OUT, 'vi'))
      .toEqual({ status: 'ok', rooms: [] });

    roomTypesApi.mockResolvedValue([]);
    expect(await loadRoomTypes(SLUG, 'vi')).toEqual({ status: 'ok', roomTypes: [] });
  });

  it('shows the backend words only where they are authored for a caller', () => {
    // 400 and 422 carry actionable guidance — doc 58 §2.1.
    expect(guestMessageFor(apiError(400, 'VALIDATION_FAILED', 'Check-out must be after check-in.')))
      .toBe('Check-out must be after check-in.');
    expect(guestMessageFor(apiError(422, 'HORIZON_EXCEEDED', 'Those dates are not yet open.')))
      .toBe('Those dates are not yet open.');
    expect(guestMessageFor(apiError(422, 'CONFIG_MISSING', 'MAX_ROOMS_PER_REQUEST is not set.')))
      .toContain('MAX_ROOMS_PER_REQUEST');

    // Everything else becomes one constant — no SQL, class name or host can leak.
    const server = guestMessageFor(
      apiError(500, 'INTERNAL_ERROR', 'org.postgresql.util.PSQLException: relation kas.foo'),
    );
    expect(server).not.toMatch(/PSQL|org\.|relation|kas\./);
    expect(server).toMatch(/thử lại/);
    expect(guestMessageFor(apiError(0, 'INTERNAL_ERROR', 'ECONNREFUSED 127.0.0.1:8080')))
      .not.toMatch(/ECONNREFUSED|127\.0\.0\.1|8080/);
    // A 404 is never re-described as a permission problem.
    expect(guestMessageFor(apiError(404, 'NOT_FOUND', 'x'))).not.toMatch(/quyền|forbidden/i);

    expect(guestFieldErrors(apiError(400, 'VALIDATION_FAILED', 'x',
      [{ field: 'checkOut', code: 'INVALID', message: 'A stay is at least one night.' }])))
      .toEqual({ checkOut: 'A stay is at least one night.' });
    expect(guestFieldErrors(apiError(500, 'INTERNAL_ERROR', 'x',
      [{ field: 'db', code: 'X', message: 'leak' }]))).toEqual({});
  });
});

describe('hotel page', () => {
  it('is not found for a property that is not published', async () => {
    propertyApi.mockRejectedValue(apiError(404, 'NOT_FOUND', 'Property not found'));
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundSpy).toHaveBeenCalled();
    // Nothing about the property is fetched or rendered after the gate.
    expect(availabilityApi).not.toHaveBeenCalled();
  });

  it('is not found for an unsupported locale', async () => {
    await expect(renderPage({}, 'fr')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(propertyApi).not.toHaveBeenCalled();
  });

  it('renders identity and asks for dates before fetching availability', async () => {
    propertyApi.mockResolvedValue(property());
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'KAS Passion Boutique Hotel' }))
      .toBeTruthy();
    expect(screen.getByText('Quận 1, Hồ Chí Minh')).toBeTruthy();
    expect(screen.getByText('Chọn ngày để xem giá tham khảo')).toBeTruthy();
    // No dates, no request — availability is never asked for speculatively.
    expect(availabilityApi).not.toHaveBeenCalled();
  });

  it('fetches and renders availability once both dates are in the URL', async () => {
    propertyApi.mockResolvedValue(property());
    availabilityApi.mockResolvedValue([room()]);
    roomTypesApi.mockResolvedValue([description()]);

    await renderPage({ checkIn: CHECK_IN, checkOut: CHECK_OUT });

    expect(availabilityApi).toHaveBeenCalledWith(SLUG, CHECK_IN, CHECK_OUT, 'vi');
    const results = screen.getByRole('region', { name: /Chọn loại phòng để gửi yêu cầu/i });
    expect(within(results).getByRole('heading', { name: 'Deluxe Room' })).toBeTruthy();
    expect(within(results).getByText(/Khách sạn sẽ kiểm tra phòng/)).toBeTruthy();
  });

  it('refuses an unusable stay without asking the backend', async () => {
    propertyApi.mockResolvedValue(property());
    await renderPage({ checkIn: CHECK_OUT, checkOut: CHECK_IN });

    expect(screen.getByRole('alert').textContent).toMatch(/ít nhất một đêm/);
    expect(availabilityApi).not.toHaveBeenCalled();
  });

  it('renders the backend refusal for a range it cannot serve', async () => {
    propertyApi.mockResolvedValue(property());
    availabilityApi.mockRejectedValue(
      apiError(422, 'HORIZON_EXCEEDED',
        'Those dates are not yet open for booking. Please contact us directly.'),
    );
    roomTypesApi.mockResolvedValue([]);

    await renderPage({ checkIn: CHECK_IN, checkOut: CHECK_OUT });
    expect(screen.getByText(/not yet open for booking/)).toBeTruthy();
  });

  it('hides the whole search for a listed but unbookable property', async () => {
    propertyApi.mockResolvedValue(property({ lifecycleState: 'COMING_SOON' }));
    await renderPage({ checkIn: CHECK_IN, checkOut: CHECK_OUT });

    // Doc 03 §8 — COMING_SOON is listed and not bookable. Say which, rather than
    // running a search that can only ever come back empty.
    expect(screen.getByText(/sắp khai trương/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem phòng trống' })).toBeNull();
    expect(availabilityApi).not.toHaveBeenCalled();
  });

  it('writes nothing to web storage and needs no session', async () => {
    propertyApi.mockResolvedValue(property());
    availabilityApi.mockResolvedValue([room()]);
    roomTypesApi.mockResolvedValue([description()]);
    await renderPage({ checkIn: CHECK_IN, checkOut: CHECK_OUT });

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    // The public loaders forward no cookie header at all.
    expect(propertyApi).toHaveBeenCalledWith(SLUG, 'vi');
  });

  it('titles the page from the published name only', async () => {
    propertyApi.mockResolvedValue(property());
    const meta = await HotelPageModule.generateMetadata({
      params: Promise.resolve({ locale: 'vi', slug: SLUG }),
    });
    expect(meta.title).toBe('KAS Passion Boutique Hotel — KAS');
    expect(meta.alternates?.canonical).toBe(`/vi/hotels/${SLUG}`);
    // Public pages are indexable — only the two login routes are noindexed.
    expect(meta.robots).toBeUndefined();

    cleanup();
    propertyApi.mockRejectedValue(apiError(404, 'NOT_FOUND', 'x'));
    const missing = await HotelPageModule.generateMetadata({
      params: Promise.resolve({ locale: 'vi', slug: SLUG }),
    });
    // An unpublished property's name can never reach a title or a share preview.
    expect(missing.title).toBe('KAS');
  });
});

describe('quote domain', () => {
  it('drops unselected room types and keeps one line per type', () => {
    expect(quoteLines({ deluxe: 2, suite: 0, garden: 1 }))
      .toEqual([{ roomTypeSlug: 'deluxe', quantity: 2 }, { roomTypeSlug: 'garden', quantity: 1 }]);
    expect(selectedRoomCount({ deluxe: 2, suite: 0, garden: 1 })).toBe(3);
    expect(quoteLines({})).toEqual([]);
  });

  it('mirrors only what the frozen contract states, and no config rule', () => {
    expect(quoteProblem({ deluxe: 1 }, 2, VI_QUOTE)).toBeNull();
    expect(quoteProblem({}, 2, VI_QUOTE)).toMatch(/ít nhất một phòng/);
    expect(quoteProblem({ deluxe: 0 }, 2, VI_QUOTE)).toMatch(/ít nhất một phòng/);
    expect(quoteProblem({ deluxe: 1 }, 0, VI_QUOTE)).toMatch(/số khách/);
    // No capacity arithmetic and no child rule is duplicated here: B10 and B11 are
    // OPEN, the backend owns both refusals, and a second implementation could
    // disagree with it.
    expect(quoteProblem({ deluxe: 1 }, 99, VI_QUOTE)).toBeNull();
  });
});

describe('the hotel’s own editorial text', () => {
  // Controlled fixture values. Nothing here is written into the development
  // database, and the component supplies no copy of its own.
  const SIGNATURE = 'Giờ vàng trên sân thượng Quận 1';
  const SHORT = 'Khách sạn boutique giữa Quận 1, sân thượng nhìn ra sông.';

  it('renders the signature line and the short description from the API', async () => {
    propertyApi.mockResolvedValue(property({ signatureLine: SIGNATURE, shortDescription: SHORT }));

    await renderPage();

    expect(screen.getByText(SIGNATURE)).toBeTruthy();
    expect(screen.getByText(SHORT)).toBeTruthy();
  });

  it('shows nothing in their place when the operator has not written them', async () => {
    propertyApi.mockResolvedValue(property());

    const { container } = await renderPage();

    // Absent means absent: no placeholder sentence, no "description coming
    // soon", nothing borrowed from the other locale.
    expect(container.querySelector('[class*="signature"]')).toBeNull();
    expect(container.querySelector('[class*="lead"]')).toBeNull();
  });

  it('puts the signature line above the location, where doc 67 §1 places it', async () => {
    propertyApi.mockResolvedValue(property({ signatureLine: SIGNATURE }));

    const { container } = await renderPage();

    const heading = container.querySelector('h1');
    // The hero's own location line, not the several other places the district
    // is mentioned further down the page.
    const location = container.querySelector('[class*="location"]');
    const signature = screen.getByText(SIGNATURE);

    expect(heading).not.toBeNull();
    // Between the name and the location, which is where the hero puts it.
    expect(
      heading?.compareDocumentPosition(signature) ?? 0 & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(location).not.toBeNull();
    expect(
      location === null ? 0 : signature.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
