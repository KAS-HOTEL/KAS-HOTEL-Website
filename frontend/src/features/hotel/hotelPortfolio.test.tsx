// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedProperty } from '@/lib/domain/availability';

const propertiesApi = vi.fn();
const amenitiesApi = vi.fn();
const notFoundSpy = vi.fn();

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
    properties: (...args: unknown[]) => propertiesApi(...args),
    amenities: (...args: unknown[]) => amenitiesApi(...args),
  },
  // `load.ts` imports this too; a factory that omits a named export the module
  // under test imports leaves it undefined and fails somewhere unrelated.
  reservationsApi: { receipt: vi.fn() },
}));

const { HotelFilters, districtsOf } = await import('./HotelFilters');
const { amenityCopy } = await import('./HotelAmenities');
const { searchCopy } = await import('./requestMessages');

type FilterProps = Parameters<typeof HotelFilters>[0];

/** The two catalogue-driven props default to empty, as they are in production today. */
function filters(overrides: Partial<FilterProps> = {}) {
  return (
    <HotelFilters
      action="/en/hotels"
      districts={[]}
      amenities={[]}
      copy={searchCopy('en')}
      amenityCopy={amenityCopy('en')}
      {...overrides}
    />
  );
}

function amenity(code: string, name: string, category = 'CONNECTIVITY') {
  return { code, name, category };
}
const HotelsPage = await import('@/app/[locale]/hotels/page');

function hotel(overrides: Partial<PublishedProperty> = {}): PublishedProperty {
  return {
    slug: 'kas-passion-boutique-hotel',
    name: 'KAS Passion',
    city: 'Ho Chi Minh City',
    district: 'District 1',
    isFlagship: false,
    lifecycleState: 'OPEN',
    ...overrides,
  };
}

async function renderPage(locale = 'en', district?: string, amenityCode?: string) {
  const searchParams: Record<string, string> = {};
  if (district !== undefined) searchParams['district'] = district;
  if (amenityCode !== undefined) searchParams['amenity'] = amenityCode;
  return renderQuery(locale, searchParams);
}

/** The same page, driven by an arbitrary query — STEP J put a stay in the URL. */
async function renderQuery(locale: string, searchParams: Record<string, string>) {
  return render(await HotelsPage.default({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
  }));
}

afterEach(cleanup);
beforeEach(() => {
  propertiesApi.mockReset();
  // Empty is production's answer today: the wording is config A9 / OQ-031.
  amenitiesApi.mockReset();
  amenitiesApi.mockResolvedValue([]);
  notFoundSpy.mockReset();
  notFoundSpy.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
});

describe('districtsOf', () => {
  it('keeps the backend’s order rather than alphabetising', () => {
    // The backend orders by the operator's own `sort_order`, so the first
    // district a guest sees is the one KAS puts first.
    expect(districtsOf([
      hotel({ district: 'District 7' }),
      hotel({ district: 'District 1' }),
    ])).toEqual(['District 7', 'District 1']);
  });

  it('deduplicates', () => {
    expect(districtsOf([
      hotel({ district: 'District 1' }),
      hotel({ district: 'District 1' }),
    ])).toEqual(['District 1']);
  });

  it('skips a property with no district, and one that is blank', () => {
    expect(districtsOf([
      hotel({ district: null }),
      hotel({ district: '   ' }),
      hotel({ district: 'District 3' }),
    ])).toEqual(['District 3']);
  });
});

describe('the filter form', () => {
  it('is a plain GET form, so a filtered portfolio is a real URL', () => {
    const { container } = render(
      filters({ districts: ['District 1'] }),
    );

    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('get');
    expect(form?.getAttribute('action')).toBe('/en/hotels');
    expect(container.querySelector('select')?.getAttribute('name')).toBe('district');
  });

  it('offers only the districts the portfolio actually has', () => {
    render(
      filters({ districts: ['District 1', 'District 7'] }),
    );

    const options = [...screen.getByLabelText('District').querySelectorAll('option')]
      .map((o) => o.getAttribute('value'));
    // The empty value is "all districts", not a district.
    expect(options).toEqual(['', 'District 1', 'District 7']);
  });

  it('renders nothing when there is nothing to narrow', () => {
    const { container } = render(
      filters({ districts: [] }),
    );

    // A dropdown with one entry is a control that cannot do anything.
    expect(container.innerHTML).toBe('');
  });

  it('offers a clear link only once something is selected', () => {
    const { rerender } = render(
      filters({ districts: ['District 1'] }),
    );
    expect(screen.queryByRole('link', { name: 'Clear filter' })).toBeNull();

    rerender(
      filters({ districts: ['District 1'], selected: 'District 1' }),
    );
    // A link, not a reset button: clearing is a navigation, and it works
    // without JavaScript.
    expect(screen.getByRole('link', { name: 'Clear filter' }).getAttribute('href'))
      .toBe('/en/hotels');
  });

  it('preselects the district in the URL', () => {
    render(
      filters({ districts: ['District 1', 'District 7'], selected: 'District 7' }),
    );

    expect((screen.getByLabelText('District') as HTMLSelectElement).value).toBe('District 7');
  });
});

describe('the portfolio page', () => {
  it('asks the backend to filter, rather than filtering a fetched array', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('en', 'District 1');

    // Doc 58 §3.1 gives the route the filter, so the route performs it. The
    // unfiltered call is the district-options read.
    expect(propertiesApi).toHaveBeenCalledWith('en', {});
    expect(propertiesApi).toHaveBeenCalledWith('en', { district: 'District 1' });
  });

  it('treats a submitted-but-empty district as unfiltered', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('en', '');

    // A form that submits every field sends `?district=` for an unselected
    // dropdown, and that must not empty a page the guest had not filtered.
    expect(propertiesApi).toHaveBeenCalledTimes(1);
    expect(propertiesApi).toHaveBeenCalledWith('en', {});
  });

  it('says "none matched" when a filter emptied the list, not "none published"', async () => {
    propertiesApi.mockImplementation((_locale: string, filters: { district?: string }) =>
      Promise.resolve(filters.district === undefined ? [hotel()] : []));

    await renderPage('en', 'District 7');

    // Two different facts, and only one of them is fixable by the reader.
    expect(screen.getByText('No hotels match')).toBeTruthy();
    expect(screen.queryByText('No hotels published yet')).toBeNull();
  });

  it('says "none published" when the portfolio itself is empty', async () => {
    propertiesApi.mockResolvedValue([]);

    await renderPage('en');

    expect(screen.getByText('No hotels published yet')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('counts what it is showing', async () => {
    propertiesApi.mockResolvedValue([hotel(), hotel({ slug: 'b', name: 'KAS Sonata' })]);

    await renderPage('en');

    expect(screen.getByText('2 hotels')).toBeTruthy();
  });

  it('says "1 hotel", not "1 hotels"', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('en');

    expect(screen.getByText('1 hotel')).toBeTruthy();
  });
});

describe('the portfolio reads in the guest’s language', () => {
  it('renders the English page with no Vietnamese in it', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    const { container } = await renderPage('en');

    // The heading, intro and filter labels were hardcoded Vietnamese before
    // Step 16A.42. The 16A.33 guard is a character class, not a word list, so a
    // newly hardcoded string cannot slip past it.
    expect(screen.getByRole('heading', { level: 1, name: 'Hotels' })).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/[ăâđêôơưÀ-ỹ]/);
  });

  it('renders the Vietnamese page in Vietnamese', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('vi');

    expect(screen.getByRole('heading', { level: 1, name: 'Khách sạn' })).toBeTruthy();
    expect(screen.getByLabelText('Quận')).toBeTruthy();
  });

  it('keeps the empty state in the reader’s language too', async () => {
    propertiesApi.mockResolvedValue([]);

    const { container } = await renderPage('en');

    expect(screen.getByText('No hotels published yet')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/[ăâđêôơưÀ-ỹ]/);
  });
});

describe('metadata', () => {
  it('gives each locale its own title and canonical', async () => {
    const en = await HotelsPage.generateMetadata({ params: Promise.resolve({ locale: 'en' }) });
    const vi = await HotelsPage.generateMetadata({ params: Promise.resolve({ locale: 'vi' }) });

    // The canonical pointed at /vi/hotels from every locale before this step,
    // which told a crawler the English page was a duplicate of the Vietnamese
    // one. Doc 22 §3 gives each locale its own prefix.
    expect(en.title).toBe('Hotels — KAS');
    expect(en.alternates?.canonical).toBe('/en/hotels');
    expect(vi.title).toBe('Khách sạn — KAS');
    expect(vi.alternates?.canonical).toBe('/vi/hotels');
  });

  it('asks the backend nothing for an unsupported locale', async () => {
    const meta = await HotelsPage.generateMetadata({ params: Promise.resolve({ locale: 'fr' }) });

    expect(meta.title).toBe('KAS');
    expect(propertiesApi).not.toHaveBeenCalled();
  });
});

describe('what the portfolio still refuses to invent', () => {
  it('offers no sort or page control, and no availability narrowing — that is OQ-122', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    const { container } = await renderPage('en');

    // STEP J's search bar collects a stay and hands it to whichever hotel the
    // guest opens. It must never become a portfolio-wide availability search:
    // `GET /public/availability/search` is OQ-122 and its facets and response
    // envelope are undefined.
    const names = [...container.querySelectorAll('select')].map((s) => s.getAttribute('name'));
    // `destination` is the district facet under the search bar's own label —
    // the one narrowing doc 58 §3.1 actually defines and the backend performs.
    expect(names.sort()).toEqual(['destination', 'district']);

    // No sort, no page, no price: none is on this contract.
    expect(screen.queryByLabelText(/sort|page|price|rating/i)).toBeNull();

    // The dates reach the backend as **nothing at all** on this route. The
    // portfolio call carries a locale and, at most, the two facets — never a
    // date, never an occupancy.
    for (const call of propertiesApi.mock.calls) {
      const filters = (call[1] ?? {}) as Record<string, unknown>;
      expect(Object.keys(filters).sort()).not.toContain('checkIn');
      expect(Object.keys(filters).sort()).not.toContain('adults');
    }
  });

  it('does not shorten the list when a stay is searched', async () => {
    propertiesApi.mockResolvedValue([hotel(), hotel({ slug: 'kas-two', name: 'KAS Two' })]);

    // A guest searching dates on the portfolio is handing a stay forward, not
    // filtering. The list is exactly as long with dates as without them —
    // nothing here knows or claims whether either hotel is free.
    await renderQuery('en', { checkIn: '2026-09-12', checkOut: '2026-09-14', adults: '2' });

    expect(screen.getByText('2 hotels')).toBeTruthy();
  });

  it('carries the stay onto every hotel link, so the dates are not asked for twice', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    const { container } = await renderQuery('en', {
      checkIn: '2026-09-12',
      checkOut: '2026-09-14',
      adults: '3',
      rooms: '2',
    });

    const link = container.querySelector('a[href*="/en/hotels/"]') as HTMLAnchorElement;
    const url = new URL(link.getAttribute('href') as string, 'https://kas.invalid');
    expect(url.pathname).toBe('/en/hotels/kas-passion-boutique-hotel');
    expect(url.searchParams.get('checkIn')).toBe('2026-09-12');
    expect(url.searchParams.get('checkOut')).toBe('2026-09-14');
    expect(url.searchParams.get('adults')).toBe('3');
    expect(url.searchParams.get('rooms')).toBe('2');
  });

  it('leaves the links alone when no dates were chosen', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    const { container } = await renderPage('en');

    const link = container.querySelector('a[href*="/en/hotels/"]') as HTMLAnchorElement;
    // No query string at all — an empty `?adults=1&rooms=1` would suggest a
    // search the guest never made.
    expect(link.getAttribute('href')).toBe('/en/hotels/kas-passion-boutique-hotel');
  });

  it('still invents no imagery, price or rating', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    const { container } = await renderPage('en');

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/₫|VND|rating|★|from \d/i);
  });

  it('links each hotel into the existing detail route', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('en');

    const item = screen.getByRole('listitem');
    expect(within(item).getByRole('link').getAttribute('href'))
      .toBe('/en/hotels/kas-passion-boutique-hotel');
  });
});

describe('the amenity filter', () => {
  it('is absent while the catalogue has no approved words', () => {
    const { container } = render(filters({ districts: ['District 1'], amenities: [] }));

    // The wording is config A9 / OQ-031, so `GET /public/amenities` returns [].
    // A dropdown of `wifi-free` would be a database view, not a guest control.
    expect(screen.queryByLabelText('Amenity')).toBeNull();
    expect(container.querySelector('select[name="amenity"]')).toBeNull();
  });

  it('appears once the catalogue has words, labelled not coded', () => {
    render(filters({
      districts: [],
      amenities: [amenity('wifi-free', 'Free Wi-Fi')],
    }));

    const select = screen.getByLabelText('Amenity');
    expect(within(select).getByRole('option', { name: 'Free Wi-Fi' })).toBeTruthy();
    // The guest reads the word; the form submits the code.
    expect(within(select).getByRole('option', { name: 'Free Wi-Fi' }).getAttribute('value'))
      .toBe('wifi-free');
    expect(select.textContent).not.toContain('wifi-free');
  });

  it('submits the code, so the URL and the API keep the stable identifier', () => {
    const { container } = render(filters({
      amenities: [amenity('wifi-free', 'Free Wi-Fi')],
    }));

    expect(container.querySelector('select[name="amenity"]')).not.toBeNull();
  });

  it('groups by the catalogue’s own categories, in the order sent', () => {
    render(filters({
      amenities: [
        amenity('lift-access', 'Lift access', 'ACCESSIBILITY'),
        amenity('wifi-free', 'Free Wi-Fi', 'CONNECTIVITY'),
        amenity('parking', 'Parking', 'PROPERTY_FACILITY'),
      ],
    }));

    const groups = [...screen.getByLabelText('Amenity').querySelectorAll('optgroup')]
      .map((g) => g.getAttribute('label'));
    // The backend orders `category, sort_order, code`; nothing re-sorts here.
    expect(groups).toEqual(['Accessibility', 'Connectivity', 'Hotel facilities']);
  });

  it('labels the categories in Vietnamese on the Vietnamese page', () => {
    render(
      <HotelFilters
        action="/vi/hotels"
        districts={[]}
        amenities={[amenity('wifi-free', 'Wi-Fi miễn phí')]}
        copy={searchCopy('vi')}
        amenityCopy={amenityCopy('vi')}
      />,
    );

    expect(screen.getByLabelText('Tiện nghi')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Mọi tiện nghi' })).toBeTruthy();
    expect(screen.getByLabelText('Tiện nghi').querySelector('optgroup')?.getAttribute('label'))
      .toBe('Kết nối');
  });

  it('preselects the amenity in the URL', () => {
    render(filters({
      amenities: [amenity('wifi-free', 'Free Wi-Fi'), amenity('parking', 'Parking')],
      selectedAmenity: 'parking',
    }));

    expect((screen.getByLabelText('Amenity') as HTMLSelectElement).value).toBe('parking');
  });

  it('offers a clear link when only the amenity is selected', () => {
    render(filters({
      amenities: [amenity('wifi-free', 'Free Wi-Fi')],
      selectedAmenity: 'wifi-free',
    }));

    expect(screen.getByRole('link', { name: 'Clear filter' })).toBeTruthy();
  });

  it('renders the district control even when the catalogue is empty', () => {
    render(filters({ districts: ['District 1'], amenities: [] }));

    // The two filters are independent: A9 must not take the district filter down
    // with it.
    expect(screen.getByLabelText('District')).toBeTruthy();
  });
});

describe('the page and the taxonomy', () => {
  it('reads the taxonomy in the page locale', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('vi');

    expect(amenitiesApi).toHaveBeenCalledWith('vi');
  });

  it('passes a chosen amenity code to the backend filter', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('en', undefined, 'wifi-free');

    expect(propertiesApi).toHaveBeenCalledWith('en', { amenity: 'wifi-free' });
  });

  it('combines the two filters in one request', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('en', 'District 1', 'wifi-free');

    expect(propertiesApi)
      .toHaveBeenCalledWith('en', { district: 'District 1', amenity: 'wifi-free' });
  });

  it('treats a submitted-but-empty amenity as unfiltered', async () => {
    propertiesApi.mockResolvedValue([hotel()]);

    await renderPage('en', undefined, '');

    expect(propertiesApi).toHaveBeenCalledTimes(1);
    expect(propertiesApi).toHaveBeenCalledWith('en', {});
  });

  it('says "none matched" when an amenity filter emptied the list', async () => {
    propertiesApi.mockImplementation((_locale: string, f: { amenity?: string }) =>
      Promise.resolve(f.amenity === undefined ? [hotel()] : []));

    await renderPage('en', undefined, 'wifi-free');

    expect(screen.getByText('No hotels match')).toBeTruthy();
  });

  it('still renders the portfolio when the taxonomy request fails', async () => {
    propertiesApi.mockResolvedValue([hotel()]);
    amenitiesApi.mockImplementation(async () => {
      throw new Error('catalogue down');
    });

    await renderPage('en');

    // The taxonomy is an enhancement of the filter, not a dependency of the
    // page: losing it must not cost a guest the hotel list.
    expect(screen.getByText('1 hotel')).toBeTruthy();
    expect(screen.queryByLabelText('Amenity')).toBeNull();
  });

  it('invents no character or collection control', async () => {
    propertiesApi.mockResolvedValue([hotel()]);
    amenitiesApi.mockResolvedValue([amenity('wifi-free', 'Free Wi-Fi')]);

    const { container } = await renderPage('en');

    // Doc 58 §3.1 names four filters; `collection` has no writer and
    // `character` has no column. `destination` is the search bar's own label for
    // `district`, which is the same wired facet rather than a third one.
    const names = [...container.querySelectorAll('select')].map((s) => s.getAttribute('name'));
    expect(names.sort()).toEqual(['amenity', 'destination', 'district']);
  });
});
