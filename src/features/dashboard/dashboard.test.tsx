// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyAdminView } from '@/lib/domain/property';

const propertyList = vi.fn();
const salesQueue = vi.fn();
const mediaCovers = vi.fn();

vi.mock('@/features/property/server', () => ({
  propertyList: () => propertyList(),
  propertyDetail: vi.fn(),
}));
vi.mock('@/features/salesRequest/server', () => ({
  salesQueue: () => salesQueue(),
}));
vi.mock('@/features/media/server', () => ({
  mediaCovers: (...a: unknown[]) => mediaCovers(...a),
}));

vi.mock('@/features/review/server', () => ({
  reviewQueue: async () => ({ status: 'ok', submissions: [] }),
  serverNow: async () => Date.parse('2026-09-08T02:00:00Z'),
}));

const Dashboard = await import('@/app/partner/(protected)/page');
const AdminOverview = await import('@/app/admin/(protected)/page');

function property(index: number, overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
  return {
    id: `0000000${index}-0000-4000-8000-000000000000`,
    slug: `hotel-${index}`,
    names: { vi: `Khách sạn Số ${index}`, en: `Hotel ${index}` },
    signatureLines: {},
    shortDescriptions: {},
    amenityCodes: [],
    tripIntentCodes: [],
    lifecycleState: 'DRAFT',
    isFlagship: false,
    city: 'Hồ Chí Minh',
    sortOrder: index,
    version: 1,
    ...overrides,
  };
}

const renderDashboard = async () => render(await Dashboard.default());
const renderAdminOverview = async () => render(await AdminOverview.default());

afterEach(cleanup);
beforeEach(() => {
  propertyList.mockReset();
  salesQueue.mockReset();
  mediaCovers.mockReset();
  salesQueue.mockResolvedValue({ status: 'ok', requests: [] });
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
 * A queue row as `GET /admin/sales/requests` returns one.
 *
 * Only the fields the overview reads. `salesStatus` is the point of the fixture:
 * the endpoint returns terminal requests alongside open ones, and this page has
 * to tell them apart.
 */
function request(reference: string, salesStatus: string) {
  return {
    reference,
    salesStatus,
    leadSource: 'WEBSITE',
    propertySlug: 'hotel-1',
    propertyName: 'Khách sạn Số 1',
    checkIn: '2026-09-20',
    checkOut: '2026-09-22',
    nights: 2,
    adults: 2,
    children: 0,
    rooms: 1,
    guestName: 'Nguyễn Văn An',
    requestedAt: '2026-09-08T02:00:00Z',
    slaDueAt: null,
    total: null,
  };
}

/** The stat card owning a given label, whatever the markup nests around it. */
function card(label: string): HTMLElement {
  const stats = screen.getByRole('region', { name: 'Chỉ số tổng quan' });
  const found = within(stats).getByText(label).closest('article');
  if (found === null) throw new Error(`no stat card for ${label}`);
  return found;
}

describe('the Admin overview', () => {
  it('counts the properties the endpoint returned, never a written-in total', async () => {
    propertyList.mockResolvedValue({
      status: 'ok',
      properties: [property(1), property(2), property(3)],
    });

    await renderAdminOverview();

    const stats = screen.getByRole('region', { name: 'Chỉ số quản trị' });
    expect(within(stats).getByText('Khách sạn').closest('article')?.textContent).toContain('3');
    // The seed portfolio is eight; a page that says eight when the endpoint
    // returned three is describing the database rather than the session.
    expect(document.body.textContent).not.toMatch(/\b8 khách sạn\b/);
  });

  it('shows an error state rather than an empty portfolio when the read fails', async () => {
    propertyList.mockResolvedValue({
      status: 'error',
      error: { status: 500, code: 'INTERNAL', message: 'x', correlationId: 'c' },
    });

    await renderAdminOverview();

    // A failed read and an empty estate are different facts.
    expect(screen.queryByText('Chưa có khách sạn nào')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Danh sách khách sạn' })).not.toBeNull();
  });
});

describe('the Super Admin overview', () => {
  it('reads no hotels, because they belong to the Admin console', async () => {
    await renderDashboard();

    expect(propertyList).not.toHaveBeenCalled();
    expect(mediaCovers).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Danh sách khách sạn');
  });

  it('reports the real open-request count', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1)] });
    salesQueue.mockResolvedValue({
      status: 'ok',
      requests: [request('KAS-1', 'REQUESTED')],
    });

    await renderDashboard();

    expect(card('Yêu cầu cần xử lý').textContent).toContain('1');
  });

  it('counts only requests that are still open', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1)] });
    salesQueue.mockResolvedValue({
      status: 'ok',
      requests: [
        request('KAS-1', 'REQUESTED'),
        request('KAS-2', 'EXPIRED'),
        request('KAS-3', 'WON'),
        request('KAS-4', 'DECLINED'),
        request('KAS-5', 'CANCELLED'),
      ],
    });

    await renderDashboard();

    // The defect this replaces: the card read "5" over the word "Đang mở" while
    // four of the five had reached a terminal status and could not be acted on.
    const open = card('Yêu cầu cần xử lý');
    expect(open.textContent).toContain('1');
    expect(open.textContent).not.toContain('5 ');
    // The remainder is named rather than quietly dropped.
    expect(open.textContent).toContain('4 yêu cầu đã kết thúc');
  });

  it('states no occupancy or rating at all rather than an empty promise', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1)] });

    const { container } = await renderDashboard();

    // The two cards that only ever said "Chưa có API" are gone. What must not
    // happen is a number appearing in their place: the endpoints still do not
    // exist, so neither figure may be shown at all.
    expect(container.textContent).not.toMatch(/Tỷ lệ lấp phòng|Đánh giá trung bình/);
  });

  it('fabricates no revenue, booking total, occupancy or rating', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1)] });

    const { container } = await renderDashboard();
    const text = container.textContent ?? '';

    // Every figure the reference design shows across the top of this page.
    expect(text).not.toMatch(/\d[\d.,]*\s*(₫|VND)/);
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/\d\.\d\s*\/\s*5/);
    expect(text).not.toMatch(/★|so với tuần trước|so với tháng trước/);
  });

  it('greets the role, because no endpoint reports a name', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1)] });

    const { container } = await renderDashboard();

    // `/me/sessions` is the only `/me` route in the API; nothing carries a
    // display name, so none is invented for the greeting.
    expect(container.textContent).not.toMatch(/Xin chào,/);
  });

});

/**
 * The property card's photograph.
 *
 * Every card used to say "Chưa có ảnh bìa", and it was true: nothing had been
 * uploaded, and `GET /admin/properties` carries no media. The first half stopped
 * being true when R2 went live; the second half is still true, which is why the
 * cover is a second request joined here rather than a field on the property.
 */
describe('the cover on a property card', () => {
  it('shows the property’s own cover, at the size the asset reports', async () => {
    const first = property(1);
    propertyList.mockResolvedValue({ status: 'ok', properties: [first] });
    mediaCovers.mockResolvedValue({
      status: 'ok',
      covers: new Map([[first.id, cover(first.id, 'asset-1')]]),
    });

    await renderAdminOverview();

    const image = document.querySelector('img');
    expect(image?.getAttribute('src')).toBe('https://media.kas.invalid/m/asset-1');
    // Intrinsic size reserves the band before the bytes arrive, so the grid does
    // not jump as each photograph lands.
    expect(image?.getAttribute('width')).toBe('2400');
    expect(image?.getAttribute('height')).toBe('1600');
    expect(screen.queryByText('Chưa có ảnh bìa')).toBeNull();
  });

  it('asks for property covers, never room ones', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1)] });

    await renderAdminOverview();

    // A room photograph on a hotel card would be the one mix-up media_link's
    // owner_type exists to prevent.
    expect(mediaCovers).toHaveBeenCalledWith('PROPERTY');
  });

  it('keeps the placeholder for a hotel whose cover nobody has chosen', async () => {
    const withCover = property(1);
    const without = property(2);
    propertyList.mockResolvedValue({ status: 'ok', properties: [withCover, without] });
    mediaCovers.mockResolvedValue({
      status: 'ok',
      covers: new Map([[withCover.id, cover(withCover.id, 'asset-1')]]),
    });

    await renderAdminOverview();

    expect(document.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getAllByText('Chưa có ảnh bìa')).toHaveLength(1);
  });

  it('says the covers could not be read rather than that nobody has one', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1)] });
    mediaCovers.mockResolvedValue({ status: 'error', error: new Error('boom') });

    await renderAdminOverview();

    // The distinction the whole prop exists for: a backend fault must not render
    // as "this operator has not chosen a picture", which is a different problem
    // with a different fix.
    expect(screen.getByText('Không đọc được ảnh bìa')).toBeTruthy();
    expect(screen.queryByText('Chưa có ảnh bìa')).toBeNull();
  });

  it('falls back to the placeholder when the deployment has no delivery base', async () => {
    const only = property(1);
    propertyList.mockResolvedValue({ status: 'ok', properties: [only] });
    mediaCovers.mockResolvedValue({
      status: 'ok',
      covers: new Map([[only.id, { ...cover(only.id, 'asset-1'), url: null }]]),
    });

    await renderAdminOverview();

    // No `kas.media.delivery-base-url` means no URL to fetch. A card with the
    // composed band beats a card with a broken frame.
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Chưa có ảnh bìa')).toBeTruthy();
  });

  it('renders the portfolio even when the cover request fails', async () => {
    propertyList.mockResolvedValue({ status: 'ok', properties: [property(1), property(2)] });
    mediaCovers.mockResolvedValue({ status: 'error', error: new Error('boom') });

    await renderAdminOverview();

    // A missing photograph must not cost the operator the list itself.
    expect(screen.getByText('Khách sạn Số 1')).toBeTruthy();
    expect(screen.getByText('Khách sạn Số 2')).toBeTruthy();
  });
});
