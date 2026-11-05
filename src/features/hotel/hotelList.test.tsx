// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PublishedProperty } from '@/lib/domain/availability';

const propertiesApi = vi.fn();
const notFoundSpy = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

const galleryApi = vi.fn(async (...args: unknown[]) => {
  void args;
  return [];
});

vi.mock('next/navigation', () => ({ notFound: () => notFoundSpy() }));
vi.mock('@/lib/api/endpoints', () => ({
  publicHotelsApi: {
    tripIntents: vi.fn(async () => []),
    // The listing and detail pages read each hotel's cover photograph from the
    // public gallery. These suites are about other things, so it answers empty —
    // which is also the real state of a hotel that has published no media.
    gallery: (...a: unknown[]) => galleryApi(...a),
    properties: (...a: unknown[]) => propertiesApi(...a),
    property: vi.fn(),
    roomTypes: vi.fn(),
    availability: vi.fn(),
    quote: vi.fn(),
  },
}));

const { HotelList } = await import('./HotelList');
const { loadPublishedProperties } = await import('./load');
const HotelsPage = await import('@/app/[locale]/hotels/page');

afterEach(cleanup);
beforeEach(() => {
  propertiesApi.mockReset();
  notFoundSpy.mockReset();
  notFoundSpy.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
});

function hotel(overrides: Partial<PublishedProperty> = {}): PublishedProperty {
  return {
    slug: 'kas-passion-boutique-hotel',
    name: 'KAS Passion Boutique Hotel',
    city: 'Hồ Chí Minh',
    district: 'Quận 1',
    isFlagship: false,
    lifecycleState: 'OPEN',
    ...overrides,
  };
}

const apiError = (status: number, code: string, message: string) =>
  new ApiError(status, { code, message, details: [], correlationId: null });

describe('published properties loader', () => {
  it('sends the locale, and no filter the caller did not ask for', async () => {
    propertiesApi.mockResolvedValue([hotel()]);
    await loadPublishedProperties('vi');

    // Narrowed from "locale and nothing else": doc 58 §3.1's `district` and
    // `amenity` filters are implemented as of Step 16A.42, so the claim worth
    // making is that an unfiltered call stays unfiltered.
    expect(propertiesApi).toHaveBeenCalledWith('vi', {});
    const call = JSON.stringify(propertiesApi.mock.calls[0]);
    // Still absent, because doc 58 §3.1 defines none of them.
    expect(call).not.toMatch(/page|size|sort|checkIn|adults/i);
    // Public means public.
    expect(call).not.toMatch(/partnerId|Authorization|Bearer|cookie/i);
  });

  it('passes a district through to the endpoint', async () => {
    propertiesApi.mockResolvedValue([hotel()]);
    await loadPublishedProperties('vi', { district: 'Quận 1' });

    // Filtering is the backend's, not a client-side pass over a fetched array:
    // doc 58 §3.1 gives the route the filter, so the route performs it.
    expect(propertiesApi).toHaveBeenCalledWith('vi', { district: 'Quận 1' });
  });

  it('treats an empty portfolio as a success', async () => {
    propertiesApi.mockResolvedValue([]);
    expect(await loadPublishedProperties('vi')).toEqual({ status: 'ok', properties: [] });
  });

  it('reports a backend failure as an error, not an empty portfolio', async () => {
    propertiesApi.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'boom'));
    expect((await loadPublishedProperties('vi')).status).toBe('error');

    propertiesApi.mockRejectedValue(new TypeError('fetch failed'));
    const unreachable = await loadPublishedProperties('vi');
    expect(unreachable.status).toBe('error');
    if (unreachable.status === 'error') {
      expect(unreachable.error.status).toBe(0);
    }
  });

  it('keeps whatever order the backend returned', async () => {
    const rows = [hotel({ slug: 'b', name: 'B' }), hotel({ slug: 'a', name: 'A' })];
    propertiesApi.mockResolvedValue(rows);
    const result = await loadPublishedProperties('vi');
    // The repository orders by sort_order then slug; nothing here re-sorts.
    expect(result.status === 'ok' && result.properties.map((p) => p.slug)).toEqual(['b', 'a']);
  });
});

describe('HotelList', () => {
  const list = (properties: PublishedProperty[], locale = 'vi') =>
    render(<HotelList properties={properties} locale={locale} />);

  it('renders one item per property, in a semantic list', () => {
    list([hotel(), hotel({ slug: 'sonata', name: 'KAS Sonata' })]);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('links each card to the detail route using the real slug and locale', () => {
    list([hotel()]);
    const link = screen.getByRole('link', { name: 'KAS Passion Boutique Hotel' });
    expect(link.getAttribute('href')).toBe('/vi/hotels/kas-passion-boutique-hotel');

    cleanup();
    list([hotel()], 'en');
    expect(screen.getByRole('link', { name: /Passion/ }).getAttribute('href'))
      .toBe('/en/hotels/kas-passion-boutique-hotel');
  });

  it('names the link with the hotel, which is what a guest is choosing between', () => {
    list([hotel()]);
    // The accessible name is the hotel, not "read more" or "view".
    expect(screen.getByRole('link', { name: 'KAS Passion Boutique Hotel' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /xem thêm|chi tiết|read more/i })).toBeNull();
    // A real heading per card.
    expect(screen.getByRole('heading', { level: 2, name: /Passion/ })).toBeTruthy();
  });

  it('shows location only from the fields the response carried', () => {
    list([hotel()]);
    expect(screen.getByText('Quận 1, Hồ Chí Minh')).toBeTruthy();

    cleanup();
    // Jackson omits nulls, so district/city can simply be absent.
    list([hotel({ district: null, city: null })]);
    expect(screen.queryByText(/Quận|Hồ Chí Minh/)).toBeNull();
  });

  it('falls back to the slug only if a name is ever absent', () => {
    // The list query inner-joins the translation, so this should not occur —
    // the fallback exists so a contract change degrades rather than blanks.
    list([hotel({ name: null })]);
    expect(screen.getByRole('link', { name: 'kas-passion-boutique-hotel' })).toBeTruthy();
  });

  it('says in words when a listed hotel is not bookable — doc 03 §8', () => {
    list([hotel({ lifecycleState: 'COMING_SOON' })]);
    expect(screen.getByText(/sắp khai trương/)).toBeTruthy();

    cleanup();
    list([hotel({ lifecycleState: 'TEMPORARILY_CLOSED' })]);
    expect(screen.getByText(/tạm ngưng/)).toBeTruthy();

    cleanup();
    list([hotel({ lifecycleState: 'OPEN' })]);
    expect(screen.queryByText(/sắp khai trương|tạm ngưng/)).toBeNull();
  });

  it('renders that sentence as prose, not inside the nowrap badge row', () => {
    // Measured regression: Badge is `white-space: nowrap`, so at 375px the
    // COMING_SOON sentence in a pill had a min-content width of 338.8px, forced
    // the grid track to 388.8px and scrolled the document sideways by 31px.
    const { container } = list([hotel({ lifecycleState: 'COMING_SOON', isFlagship: true })]);
    const notice = screen.getByText(/sắp khai trương/);
    expect(notice.tagName).toBe('P');
    expect(notice.closest('[class*="hotelBadges"]')).toBeNull();
    // The short flagship pill is still a Badge, and still in the badge row.
    expect(screen.getByText('Khách sạn tiêu biểu').closest('[class*="hotelBadges"]')).not.toBeNull();
    expect(container.querySelectorAll('[class*="hotelBadges"] span')).toHaveLength(1);
  });

  it('invents no imagery and leaks no storage identifier', () => {
    const { container } = list([hotel()]);
    // PublishedProperty carries no media field, the list contract offers no bulk
    // gallery, and the database holds zero assets (OQ-106).
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/storage_key|storageKey|bucket|checksum|\.jpg|\.png|https?:\/\//);
  });

  it('shows no price, rating, availability, discount or amenity', () => {
    const { container } = list([hotel()]);
    for (const invented of [/₫|VND/, /đánh giá|rating|sao/i, /còn phòng|hết phòng|trống/i,
      /giảm giá|khuyến mãi|voucher/i, /thuế|VAT/i, /tiện ích|amenity/i]) {
      expect(container.textContent).not.toMatch(invented);
    }
  });

  it('offers no date, occupancy, facet or booking control — that is OQ-122', () => {
    const { container } = list([hotel()]);
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText(/ngày|khách|quận|tiện ích|sắp xếp/i)).toBeNull();
  });
});

describe('hotels page', () => {
  const renderPage = async (locale = 'vi', district?: string) =>
    render(await HotelsPage.default({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(district === undefined ? {} : { district }),
    }));

  it('renders the published portfolio', async () => {
    propertiesApi.mockResolvedValue([hotel(), hotel({ slug: 'sonata', name: 'KAS Sonata' })]);
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Khách sạn' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(propertiesApi).toHaveBeenCalledWith('vi', {});
  });

  it('passes the route locale through to the request', async () => {
    propertiesApi.mockResolvedValue([]);
    await renderPage('en');
    expect(propertiesApi).toHaveBeenCalledWith('en', {});
  });

  it('is not found for an unsupported locale, and asks the backend nothing', async () => {
    await expect(renderPage('fr')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(propertiesApi).not.toHaveBeenCalled();
  });

  it('shows an empty portfolio as a success, never as an alert', async () => {
    propertiesApi.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText('Chưa có khách sạn nào được công bố')).toBeTruthy();
    // The request succeeded; "none yet" is the answer, not a failure.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows a backend failure without leaking a host, a query or a stack', async () => {
    propertiesApi.mockRejectedValue(
      apiError(500, 'INTERNAL_ERROR', 'org.postgresql.util.PSQLException at 10.0.0.4:5432'),
    );
    const { container } = await renderPage();

    expect(container.textContent).not.toMatch(/PSQL|org\.|10\.0\.0\.4|5432|localhost|SELECT/);
    expect(screen.queryByText('Chưa có khách sạn nào được công bố')).toBeNull();
  });

  it('writes nothing to web storage', async () => {
    propertiesApi.mockResolvedValue([hotel()]);
    await renderPage();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
