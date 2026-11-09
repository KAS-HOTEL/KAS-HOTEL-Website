// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  filterProperties,
  isPortfolioFiltered,
  readPortfolioFilter,
  searchable,
  type PortfolioFilter,
  type PropertyAdminView,
} from '@/lib/domain/property';

const propertyList = vi.fn();
const mediaCovers = vi.fn();

vi.mock('./server', () => ({
  propertyList: () => propertyList(),
  propertyDetail: vi.fn(),
}));
vi.mock('@/features/media/server', () => ({
  mediaCovers: (...a: unknown[]) => mediaCovers(...a),
}));
// The list counts each hotel's room types; none here.
vi.mock('@/features/roomType/server', () => ({
  roomTypeList: async () => ({ status: 'ok', roomTypes: [] }),
}));
// Draft rows carry a "Xoá" button (DeleteDraftButton), which uses the router and toasts.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useToast: () => ({ show: vi.fn() }),
}));

const PortfolioPage = await import('@/app/partner/(protected)/properties/page');
const { PortfolioFilters } = await import('./PortfolioFilters');


/**
 * The portfolio renders twice — a table for desktop, cards for phones — and CSS
 * shows exactly one. jsdom applies no CSS, so both are in the tree here and an
 * unscoped query would match a property twice. Scoping says which presentation
 * each assertion is about, which the old unscoped queries never did.
 */
function inTable() {
  return within(screen.getByRole('region', { name: /Khách sạn thuộc phạm vi/ }));
}

function inCards() {
  return within(screen.getByRole('list'));
}

afterEach(cleanup);
beforeEach(() => {
  propertyList.mockReset();
  mediaCovers.mockReset();
  mediaCovers.mockResolvedValue({ status: 'ok', covers: new Map() });
});

/** A cover as `GET /admin/media/covers` returns one. */
function cover(propertyId: string, assetId: string) {
  return {
    ownerId: propertyId,
    mediaAssetId: assetId,
    width: 2400,
    height: 1600,
    url: `https://media.kas.invalid/m/${assetId}`,
  };
}

/**
 * Synthetic, like the sibling suite. Using the real seed slugs would put eight
 * specific properties into the source tree — the coupling the brief forbids.
 */
function at(index: number, overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
  return {
    id: `0000000${index}-0000-4000-8000-000000000000`,
    slug: `hotel-${index}`,
    names: { vi: `Khách sạn Số ${index}`, en: `Hotel Number ${index}` },
    signatureLines: {},
    shortDescriptions: {},
    amenityCodes: [],
    tripIntentCodes: [],
    lifecycleState: 'DRAFT',
    isFlagship: false,
    district: 'Quận 1',
    ward: 'Bến Nghé',
    city: 'Hồ Chí Minh',
    sortOrder: index,
    version: 1,
    ...overrides,
  };
}

const ALL: PortfolioFilter = { q: '', state: 'all' };

describe('portfolio filter — domain', () => {
  it('ignores case and Vietnamese diacritics', () => {
    expect(searchable('Khách sạn Đà Nẵng')).toBe('khach san da nang');

    const rows = [at(1)];
    for (const q of ['khach san', 'Khách sạn', 'KHACH SAN', 'quan 1', 'Quận 1', 'ho chi minh']) {
      expect(filterProperties(rows, { q, state: 'all' })).toHaveLength(1);
    }
    expect(filterProperties(rows, { q: 'ha noi', state: 'all' })).toHaveLength(0);
  });

  it('searches only fields the DTO actually returns', () => {
    const rows = [at(2)];
    // Every locale of the name, the slug, and the three address parts.
    for (const q of ['hotel-2', 'Hotel Number 2', 'Khách sạn Số 2', 'Bến Nghé', 'Hồ Chí Minh']) {
      expect(filterProperties(rows, { q, state: 'all' })).toHaveLength(1);
    }
    // Nothing else is searchable, because nothing else is on the wire.
    expect(filterProperties(rows, { q: '00000002', state: 'all' })).toHaveLength(0);
  });

  it('filters by lifecycle state, and "all" narrows nothing', () => {
    const rows = [at(1, { lifecycleState: 'DRAFT' }), at(2, { lifecycleState: 'OPEN' })];
    expect(filterProperties(rows, { q: '', state: 'OPEN' })).toHaveLength(1);
    expect(filterProperties(rows, { q: '', state: 'DRAFT' })).toHaveLength(1);
    expect(filterProperties(rows, { q: '', state: 'CLOSED' })).toHaveLength(0);
    expect(filterProperties(rows, ALL)).toHaveLength(2);
  });

  it('combines text and state', () => {
    const rows = [at(1, { lifecycleState: 'OPEN' }), at(2, { lifecycleState: 'DRAFT' })];
    expect(filterProperties(rows, { q: 'hotel-2', state: 'OPEN' })).toHaveLength(0);
    expect(filterProperties(rows, { q: 'hotel-2', state: 'DRAFT' })).toHaveLength(1);
  });

  it('survives a hand-edited URL rather than showing nothing', () => {
    // An unknown state falls back to "all": a stale link should show the
    // portfolio, not an empty screen the operator cannot explain.
    expect(readPortfolioFilter({ state: 'NOT_A_STATE' })).toEqual(ALL);
    expect(readPortfolioFilter({})).toEqual(ALL);
    expect(readPortfolioFilter({ q: '  spaced  ' }).q).toBe('spaced');
    expect(readPortfolioFilter({ state: 'OPEN' })).toEqual({ q: '', state: 'OPEN' });
  });

  it('tells a narrowed portfolio from an unfiltered one', () => {
    expect(isPortfolioFiltered(ALL)).toBe(false);
    expect(isPortfolioFiltered({ q: 'x', state: 'all' })).toBe(true);
    expect(isPortfolioFiltered({ q: '', state: 'OPEN' })).toBe(true);
  });

  it('handles a property whose optional address parts are absent on the wire', () => {
    // Jackson omits nulls, so district/ward/city can simply not be there.
    const sparse = {
      id: 'x', slug: 'bare', names: {}, signatureLines: {}, shortDescriptions: {},
      lifecycleState: 'DRAFT',
      isFlagship: false, sortOrder: 0, version: 0,
    } as PropertyAdminView;
    expect(filterProperties([sparse], { q: 'bare', state: 'all' })).toHaveLength(1);
    expect(filterProperties([sparse], { q: 'quan 1', state: 'all' })).toHaveLength(0);
  });
});

describe('PortfolioFilters', () => {
  const form = (filter: PortfolioFilter = ALL, showing = 8, total = 8) =>
    render(
      <PortfolioFilters
        action="/partner/properties"
        filter={filter}
        showing={showing}
        total={total}
      />,
    );

  it('is a plain GET form whose field names become the query string', () => {
    const { container } = form();
    const element = container.querySelector('form');
    expect(element?.getAttribute('method')).toBe('get');
    expect(element?.getAttribute('action')).toBe('/partner/properties');
    expect(container.querySelector('input[name="q"]')).toBeTruthy();
    expect(container.querySelector('select[name="state"]')).toBeTruthy();
  });

  it('labels both controls and offers only the frozen lifecycle states', () => {
    form();
    expect(screen.getByLabelText(/Tên hoặc địa chỉ/)).toBeTruthy();
    const select = screen.getByLabelText(/Trạng thái/) as HTMLSelectElement;
    // Five frozen states plus "all" — no invented category.
    expect(select.options).toHaveLength(6);
    expect((screen.getByRole('button', { name: 'Lọc' }) as HTMLButtonElement).type).toBe('submit');
  });

  it('reports counts from the response, never a total it believes ought to exist', () => {
    form(ALL, 8, 8);
    expect(screen.getByRole('status').textContent).toMatch(/8 khách sạn/);
    cleanup();
    form({ q: 'kas', state: 'all' }, 3, 8);
    expect(screen.getByRole('status').textContent).toMatch(/3\/8/);
  });

  it('offers no pagination and no filter the contract cannot back', () => {
    const { container } = form();
    // The endpoint returns the complete scoped list and defines no page
    // semantics; room count, completeness and updated-at are not on the DTO.
    for (const name of ['page', 'size', 'sort', 'cursor']) {
      expect(container.querySelector(`[name="${name}"]`)).toBeNull();
    }
    expect(screen.queryByLabelText(/số phòng|hoàn thiện|cập nhật|doanh thu/i)).toBeNull();
  });
});

describe('portfolio page', () => {
  const renderPage = async (query: Record<string, string> = {}) =>
    render(await PortfolioPage.default({ searchParams: Promise.resolve(query) }));

  const rows = [
    at(1, { lifecycleState: 'DRAFT', district: 'Quận 1' }),
    at(2, { lifecycleState: 'OPEN', district: 'Quận 3', isFlagship: true }),
  ];
  const ok = () => propertyList.mockResolvedValue({ status: 'ok', properties: rows });

  it('renders every property the backend returned when nothing is filtered', async () => {
    ok();
    await renderPage();
    expect(inTable().getByRole('link', { name: /Số 1/ })).toBeTruthy();
    expect(inTable().getByRole('link', { name: /Số 2/ })).toBeTruthy();
    expect(propertyList).toHaveBeenCalledTimes(1);
  });

  it('narrows to a search term without asking the backend again', async () => {
    ok();
    await renderPage({ q: 'hotel-2' });
    expect(inTable().getByRole('link', { name: /Số 2/ })).toBeTruthy();
    expect(inTable().queryByRole('link', { name: /Số 1/ })).toBeNull();
    // One call: the filter runs over the response, so there is no refetch.
    expect(propertyList).toHaveBeenCalledTimes(1);
  });

  it('narrows to a lifecycle state', async () => {
    ok();
    await renderPage({ state: 'OPEN' });
    expect(inTable().getByRole('link', { name: /Số 2/ })).toBeTruthy();
    expect(inTable().queryByRole('link', { name: /Số 1/ })).toBeNull();
  });

  it('keeps the filter state in the URL and reflects it back into the form', async () => {
    ok();
    await renderPage({ q: 'hotel-2', state: 'OPEN' });
    expect((screen.getByLabelText(/Tên hoặc địa chỉ/) as HTMLInputElement).value)
      .toBe('hotel-2');
    expect((screen.getByLabelText(/Trạng thái/) as HTMLSelectElement).value).toBe('OPEN');
  });

  it('distinguishes an empty portfolio from a filter that matches nothing', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [] });
    await renderPage();
    // Nothing to filter, so no filter is offered.
    expect(screen.queryByRole('button', { name: 'Lọc' })).toBeNull();
    expect(screen.getByText('Chưa có khách sạn nào')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    cleanup();
    ok();
    await renderPage({ q: 'nothing-matches-this' });
    expect(screen.getByText('Không có khách sạn nào khớp bộ lọc')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xoá bộ lọc' })).toBeTruthy();
    // A succeeded request with an empty result is not an error.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a backend failure as an error, not as an empty portfolio', async () => {
    propertyList.mockResolvedValue({
      status: 'error',
      error: new ApiError(500, {
        code: 'INTERNAL_ERROR', message: 'x', details: [], correlationId: null,
      }),
    });
    await renderPage();
    expect(screen.queryByRole('button', { name: 'Lọc' })).toBeNull();
    expect(screen.queryByText('Chưa có khách sạn nào')).toBeNull();
  });

  it('sends no filter parameter and no partner identifier to the backend', async () => {
    ok();
    await renderPage({ q: 'kas', state: 'OPEN' });
    // The endpoint takes no parameters at all — the loader is called with none.
    expect(propertyList).toHaveBeenCalledWith();
    const call = JSON.stringify(propertyList.mock.calls[0] ?? []);
    expect(call).not.toMatch(/partnerId|Authorization|Bearer|q=|state=/i);
  });

  it('leaves property navigation intact', async () => {
    ok();
    await renderPage({ q: 'hotel-1' });
    // The row still links to the existing detail surface, unchanged.
    expect((inTable().getByRole('link', { name: /Số 1/ }) as HTMLAnchorElement).getAttribute('href'))
      .toBe(`/partner/properties/${rows[0]!.id}`);
  });

  it('writes nothing to web storage', async () => {
    ok();
    await renderPage({ q: 'kas' });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('the portfolio on a phone', () => {
  it('renders the same properties as cards, one link each', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [at(1), at(2)] });

    render(await PortfolioPage.default({ searchParams: Promise.resolve({}) }));

    // The card list is the narrow-width presentation of the very same rows —
    // CSS decides which of the two a viewport sees.
    expect(inCards().getAllByRole('link')).toHaveLength(2);
    expect(inCards().getByRole('link', { name: /Số 1/ })).toBeTruthy();
  });

  it('gives the whole card to the link, so the target is not a line of text', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [at(1)] });

    render(await PortfolioPage.default({ searchParams: Promise.resolve({}) }));

    const card = inCards().getByRole('link', { name: /Số 1/ });
    expect(card.getAttribute('href')).toBe('/partner/properties/00000001-0000-4000-8000-000000000000');
    // Name, address and status all live inside the one anchor rather than beside
    // it. The slug is no longer among them — it was the widest line on the card
    // at 375px and the least useful.
    expect(card.textContent).toContain('Khách sạn Số 1');
    expect(card.textContent).toContain('Bản nháp');
    expect(card.textContent).not.toContain('hotel-1');
  });

  it('shows an absent field as absent rather than as a dash', async () => {
    // Built by omission, not by setting the keys to `undefined`:
    // `exactOptionalPropertyTypes` is on, and an omitted key is also what
    // Jackson's `non_null` inclusion actually puts on the wire.
    const full: Record<string, unknown> = { ...at(1) };
    delete full['district'];
    delete full['ward'];
    delete full['phone'];
    propertyList.mockResolvedValue({
      status: 'ok',
      properties: [full as unknown as PropertyAdminView],
    });

    render(await PortfolioPage.default({ searchParams: Promise.resolve({}) }));

    // The table prints "—" in a column that must exist; a card has no column to
    // fill, so an omitted phone is simply not a line.
    const card = inCards().getByRole('link', { name: /Số 1/ });
    expect(card.textContent).not.toContain('—');
  });

  it('invents no metric the endpoint does not return', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [at(1)] });

    render(await PortfolioPage.default({ searchParams: Promise.resolve({}) }));

    // The room-type count is real: it comes from the hotel's room-type list.
    // Occupancy, rating and revenue are not returned and must not appear.
    const card = inCards().getByRole('link', { name: /Số 1/ });
    expect(card.textContent).toMatch(/0 hạng phòng/);
    expect(card.textContent).not.toMatch(/đánh giá|doanh thu|lấp đầy|%/i);
  });
});

describe('the portfolio says which hotels still need information', () => {
  it('counts the blank fields on each row, in the table and the cards', async () => {
    // `at()` leaves the editorial fields, coordinates, phone and amenities
    // blank — the state all eight real properties are actually in.
    propertyList.mockResolvedValue({ status: 'ok', properties: [at(1)] });

    render(await PortfolioPage.default({ searchParams: Promise.resolve({}) }));

    expect(inTable().getByText(/Thiếu \d+ mục/)).toBeTruthy();
    expect(inCards().getByText(/Thiếu \d+ mục thông tin/)).toBeTruthy();
  });

  it('says so plainly when a hotel needs nothing more on that screen', async () => {
    propertyList.mockResolvedValue({
      status: 'ok',
      properties: [
        at(1, {
          signatureLines: { vi: 'Một câu' },
          shortDescriptions: { vi: 'Mô tả', en: 'Description' },
          latitude: 10.7725,
          longitude: 106.698,
          phone: '+84 28 3823 6688',
          amenityCodes: ['wifi'],
        }),
      ],
    });

    render(await PortfolioPage.default({ searchParams: Promise.resolve({}) }));

    expect(inTable().getByText('Đã đủ')).toBeTruthy();
    expect(inCards().getByText('Thông tin đã đủ')).toBeTruthy();
  });
});

/**
 * The photograph on the screen that exists to choose between hotels.
 *
 * The overview showed covers and this page — the one actually called "Khách
 * sạn" — showed none at all, in either shape. An operator running eight hotels
 * recognises them by their pictures long before they read eight similar names,
 * so the screen dedicated to choosing between them was the screen that made
 * choosing hardest.
 */
describe('the cover on a portfolio row', () => {
  const renderPage = async (query: Record<string, string> = {}) =>
    render(await PortfolioPage.default({ searchParams: Promise.resolve(query) }));

  it('asks for property covers, never room ones', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [at(1)] });

    await renderPage();

    // A room photograph on a hotel row would be the one mix-up media_link's
    // owner_type exists to prevent.
    expect(mediaCovers).toHaveBeenCalledWith('PROPERTY');
  });

  it('shows the hotel’s own cover, at the size the asset reports', async () => {
    const only = at(1);
    propertyList.mockResolvedValue({ status: 'ok', properties: [only] });
    mediaCovers.mockResolvedValue({
      status: 'ok',
      covers: new Map([[only.id, cover(only.id, 'asset-1')]]),
    });

    await renderPage();

    // Both shapes render it — the table for desktop, the cards for a phone.
    const images = [...document.querySelectorAll('img')];
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image.getAttribute('src')).toBe('https://media.kas.invalid/m/asset-1');
      expect(image.getAttribute('width')).toBe('2400');
      expect(image.getAttribute('height')).toBe('1600');
      // The row already names the hotel; repeating it here would make a screen
      // reader say it twice.
      expect(image.getAttribute('alt')).toBe('');
    }
  });

  it('keeps a branded frame for a hotel whose cover nobody has chosen', async () => {
    const withOne = at(1);
    const without = at(2);
    propertyList.mockResolvedValue({ status: 'ok', properties: [withOne, without] });
    mediaCovers.mockResolvedValue({
      status: 'ok',
      covers: new Map([[withOne.id, cover(withOne.id, 'asset-1')]]),
    });

    await renderPage();

    expect(inTable().getAllByText('Chưa có ảnh')).toHaveLength(1);
    expect(inCards().getAllByText('Chưa có ảnh')).toHaveLength(1);
  });

  it('says the covers could not be read rather than that nobody has one', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [at(1)] });
    mediaCovers.mockResolvedValue({ status: 'error', error: new Error('boom') });

    await renderPage();

    // A backend fault must not render as "this operator has not chosen a
    // picture" — a different problem with a different fix.
    expect(inTable().getByText('Không đọc được ảnh')).toBeTruthy();
    expect(inTable().queryByText('Chưa có ảnh')).toBeNull();
  });

  it('still lists the portfolio when the covers fail', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [at(1), at(2)] });
    mediaCovers.mockResolvedValue({ status: 'error', error: new Error('boom') });

    await renderPage();

    // Covers that will not load are a list without pictures. Taking the whole
    // screen down for them would be the worse answer.
    expect(inTable().getByRole('link', { name: /Số 1/ })).toBeTruthy();
    expect(inTable().getByRole('link', { name: /Số 2/ })).toBeTruthy();
  });

  it('falls back to the frame when the deployment has no delivery base', async () => {
    const only = at(1);
    propertyList.mockResolvedValue({ status: 'ok', properties: [only] });
    mediaCovers.mockResolvedValue({
      status: 'ok',
      covers: new Map([[only.id, { ...cover(only.id, 'asset-1'), url: null }]]),
    });

    await renderPage();

    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(inTable().getByText('Chưa có ảnh')).toBeTruthy();
  });
});
