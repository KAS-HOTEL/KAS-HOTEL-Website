// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropertyAdminView, PropertyCompleteness } from '@/lib/domain/property';
import type * as Primitives from '@/ui/primitives';

// The overview carries SubmitForReviewPanel, a client component. These mocks let
// it mount; they do not change what any assertion below is testing. (PublishPanel
// used to mount here too — it is no longer on this screen, and keeps its own
// tests in publishPanel.test.tsx.)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({ propertiesApi: { publish: vi.fn() } }));
vi.mock('./actions', () => ({ revalidateProperties: () => Promise.resolve() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }) };
});

const { CompletenessPanel } = await import('./CompletenessPanel');
const { PropertyOverview } = await import('./PropertyOverview');
const { PropertyStatus } = await import('./PropertyStatus');
const { PropertyTable } = await import('./PropertyTable');
const { formatAddress } = await import('./address');

afterEach(cleanup);

/**
 * Fixtures are deliberately synthetic. Using the real seed slugs or hotel names
 * here would put eight specific properties into the frontend's source tree —
 * the exact coupling the brief forbids — and would let a hardcoded list pass a
 * test that exists to catch one.
 */
function propertyAt(index: number, overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
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
    city: 'Ho Chi Minh City',
    sortOrder: index,
    version: 1,
    ...overrides,
  };
}

const someProperties = (count: number) =>
  Array.from({ length: count }, (_, index) => propertyAt(index + 1));

describe('formatAddress', () => {
  it('joins only the parts the backend sent', () => {
    expect(
      formatAddress(propertyAt(1, { ward: 'Phường 1', district: 'Quận 3' })),
    ).toBe('Phường 1, Quận 3, Ho Chi Minh City');
  });

  it('leaves no dangling separator when ward and district are absent', () => {
    // Jackson omits null keys entirely, so a property mid-onboarding arrives
    // with city alone — and that is the honest whole address for it.
    expect(formatAddress(propertyAt(1))).toBe('Ho Chi Minh City');
  });

  it('ignores a part that is present but blank', () => {
    expect(formatAddress(propertyAt(1, { ward: '   ' }))).toBe('Ho Chi Minh City');
  });
});

describe('PropertyTable', () => {
  it('renders exactly the rows the backend returned', () => {
    render(<PropertyTable properties={someProperties(3)} />);

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    // Three data rows plus the header row. Nothing padded, nothing trimmed.
    expect(rows).toHaveLength(4);
  });

  it('renders nine as readily as three — no count is assumed anywhere', () => {
    // The eight seed properties are a fact about today's database, not about
    // this component. A ninth must appear with no code change.
    const { rerender } = render(<PropertyTable properties={someProperties(9)} />);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(10);

    rerender(<PropertyTable properties={someProperties(1)} />);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  });

  it('shows the backend’s own name, and not the routing key beside it', () => {
    render(<PropertyTable properties={[propertyAt(4)]} />);

    expect(screen.getByText('Khách sạn Số 4')).toBeTruthy();
    // The slug used to be printed under every name. It is a routing key, still
    // in the URL and still the public address — but not something an operator
    // reads a portfolio by, and printing it made the table a database listing.
    expect(screen.queryByText('hotel-4')).toBeNull();
  });

  it('links each property by id, so a row can be opened in a new tab', () => {
    render(<PropertyTable properties={[propertyAt(4)]} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(
      '/partner/properties/00000004-0000-4000-8000-000000000000',
    );
  });

  it('never manufactures a name from the slug', () => {
    render(<PropertyTable properties={[propertyAt(1, { names: {}, slug: 'kas-dilly-hotel' })]} />);

    // Title-casing the slug would produce a plausible name here and a wrong one
    // for a slug like "hotel-2", and the code cannot tell the two apart.
    expect(screen.queryByText('Kas Dilly Hotel')).toBeNull();
    expect(screen.getByText('Chưa đặt tên')).toBeTruthy();
    // Nor is the raw slug shown as a consolation name — a stated absence beats
    // an identifier standing in for one.
    expect(screen.queryByText('kas-dilly-hotel')).toBeNull();
  });

  it('shows the address the backend returned, and a dash where a field is unset', () => {
    render(<PropertyTable properties={[propertyAt(1, { district: 'Quận 1' })]} />);

    expect(screen.getByText('Quận 1, Ho Chi Minh City')).toBeTruthy();
    // No phone in the response → an em-dash with a label, not a blank cell.
    expect(screen.getByLabelText('Chưa có')).toBeTruthy();
  });

  it('shows an empty scope as a real state, not an error', () => {
    render(<PropertyTable properties={[]} />);

    expect(screen.getByText('Chưa có khách sạn nào')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('is busy while loading, and invents no placeholder hotels', () => {
    render(<PropertyTable properties={[]} loading />);

    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/khách sạn mẫu|sample|demo/i)).toBeNull();
  });

  it('renders only fields the endpoint returns', () => {
    render(<PropertyTable properties={[propertyAt(1, { isFlagship: true })]} />);

    const table = screen.getByRole('table');
    // Occupancy, revenue, bookings, rating, room count, ADR and RevPAR have no
    // endpoint. A column for any of them could only be filled by inventing it.
    expect(table.textContent).not.toMatch(
      /công suất|doanh thu|đặt phòng|đánh giá|ADR|RevPAR|occupancy|revenue|rating/i,
    );
    // Named rather than counted, so a future column has to be justified here
    // instead of silently incrementing a number.
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Khách sạn', 'Trạng thái', 'Thông tin', 'Địa chỉ', 'Điện thoại', 'Nổi bật', 'Thứ tự']);
  });
});

describe('PropertyStatus', () => {
  it('shows the translated label and keeps the backend value with it', () => {
    const { container } = render(<PropertyStatus state="DRAFT" />);

    expect(screen.getByText('Bản nháp')).toBeTruthy();
    // The raw state travels along, so the translation is never the only record
    // of what the backend said.
    expect(container.querySelector('[data-lifecycle-state="DRAFT"]')).toBeTruthy();
  });

  it('renders every frozen state distinctly', () => {
    const seen = new Set<string>();
    for (const state of ['DRAFT', 'COMING_SOON', 'OPEN', 'TEMPORARILY_CLOSED', 'CLOSED']) {
      const { container, unmount } = render(<PropertyStatus state={state} />);
      const text = container.textContent ?? '';
      expect(text.length).toBeGreaterThan(0);
      seen.add(text);
      unmount();
    }
    expect(seen.size).toBe(5);
  });

  it('does not convey status by colour alone', () => {
    render(<PropertyStatus state="TEMPORARILY_CLOSED" />);
    // The words carry the meaning, so the badge survives greyscale.
    expect(screen.getByText('Tạm ngưng')).toBeTruthy();
  });

  it('shows an unrecognised state as itself', () => {
    render(<PropertyStatus state="UNDER_RENOVATION" />);
    expect(screen.getByText('UNDER_RENOVATION')).toBeTruthy();
  });
});

describe('CompletenessPanel', () => {
  const completeness: PropertyCompleteness = {
    complete: false,
    sections: [
      { name: 'Basic information', complete: false, missing: ['name (both locales)'] },
      { name: 'Location', complete: true, missing: [] },
    ],
  };

  it('renders the backend’s own section and field names', () => {
    render(<CompletenessPanel completeness={completeness} />);

    // Verbatim: the same strings appear in the details[] of a refused submit, so
    // an operator must be able to match one against the other.
    expect(screen.getByText('Basic information')).toBeTruthy();
    expect(screen.getByText('name (both locales)')).toBeTruthy();
  });

  it('states whether the property could be submitted, in words', () => {
    render(<CompletenessPanel completeness={completeness} />);
    expect(screen.getByText('Chưa đủ điều kiện gửi duyệt')).toBeTruthy();
  });

  it('offers no way to change anything', () => {
    render(<CompletenessPanel completeness={completeness} />);
    // Step 5 is read-only: POST /{id}/submit belongs to the onboarding step.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says so when completeness could not be loaded', () => {
    render(<CompletenessPanel completeness={null} />);
    expect(screen.getByText('Không tải được tiến độ')).toBeTruthy();
  });
});


/**
 * The redesigned overview — STEP K.
 *
 * Several assertions here are the **inverse** of the ones the old
 * `PropertyDetailView` carried, and deliberately so: that screen was tested for
 * showing the property's UUID, its raw `lifecycleState` enum value and its
 * `sortOrder`, because at the time the goal was "show every returned field". The
 * goal now is to show a hotel, so those are asserted absent.
 */
describe('PropertyOverview', () => {
  const property = propertyAt(7, {
    isFlagship: true,
    lifecycleState: 'DRAFT',
    district: 'Quận 1',
    phone: '+84 28 1234 5678',
  });

  const overview = (
    overrides: Partial<Parameters<typeof PropertyOverview>[0]> = {},
  ) => (
    <PropertyOverview
      property={property}
      completeness={null}
      roomTypes={[]}
      gallery={[]}
      {...overrides}
    />
  );

  it('has one heading, and it is the property’s name', () => {
    render(overview());

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Khách sạn Số 7');
  });

  it('falls back to the slug when no name has been written', () => {
    render(overview({ property: propertyAt(7, { names: {} }) }));
    expect(screen.getAllByRole('heading', { level: 1 })[0]?.textContent).toBe('hotel-7');
  });

  it('shows no UUID, no slug field, no raw lifecycle value and no sort order', () => {
    const { container } = render(overview());

    // The four things the old "Thông tin hệ thống" card put in front of a
    // hotelier. None is a fact about a hotel.
    expect(screen.queryByText(property.id)).toBeNull();
    expect(container.textContent).not.toContain('(DRAFT)');
    expect(container.textContent).not.toMatch(/Thứ tự hiển thị|Định danh|Mã khách sạn/);
  });

  it('names the place instead, which is what an operator recognises', () => {
    render(overview());
    // district + city, from the same response the slug used to come from.
    expect(screen.getAllByText(/Quận 1/).length).toBeGreaterThan(0);
  });

  it('counts room types and photographs from the real responses', () => {
    render(overview({
      roomTypes: [roomType('a', 2), roomType('b', 4)],
      gallery: [galleryItem('1', true), galleryItem('2', false)],
    }));

    const metrics = screen.getByRole('region', { name: 'Tổng quan số liệu' });
    // Two room types and two photographs — both counted, both showing "2".
    expect(within(metrics).getAllByText('2')).toHaveLength(2);
    expect(within(metrics).getByText('Loại phòng')).toBeTruthy();
    expect(within(metrics).getByText('Hình ảnh')).toBeTruthy();
  });

  it('offers activation, and asks nobody for approval', () => {
    render(overview({}));

    // The action this screen exists to make reachable — as the panel's heading
    // and as its button, hence getAllByText.
    expect(screen.getAllByText(/Đưa vào hoạt động/).length).toBeGreaterThan(0);
    // "Gửi duyệt" is gone. With one partner operational scope and no Admin in
    // the V1 flow, submitting a hotel to a review queue meant submitting it to
    // yourself. The endpoint, the queue and SubmitForReviewPanel all still
    // exist; the step is simply not on the path to a live hotel.
    expect(screen.queryByText(/Gửi duyệt/)).toBeNull();
    expect(screen.queryByText(/COMING_SOON/)).toBeNull();
  });

  it('states no capacity figure at all', () => {
    render(overview({
      roomTypes: [roomType('a', 2), roomType('b', 4)],
      gallery: [galleryItem('1', true)],
    }));

    // A fourth metric summed maxOccupancy and printed "6 khách" under the label
    // "Tổng số phòng" — a guest count wearing a room count's name. Removed
    // rather than relabelled: the hotel's real room count is per-date and is
    // decided on the calendar, and the overview has no business guessing it.
    const metrics = screen.getByRole('region', { name: 'Tổng quan số liệu' });
    expect(within(metrics).queryByText('6 khách')).toBeNull();
    expect(within(metrics).queryByText('Tổng số phòng')).toBeNull();
    expect(within(metrics).queryByText(/khách$/)).toBeNull();
  });

  it('lists what is missing as tasks, using the backend’s own words', () => {
    render(overview({
      completeness: {
        complete: false,
        sections: [
          { name: 'Basic information', complete: false, missing: ['signatureLine'] },
          { name: 'Location', complete: true, missing: [] },
        ],
      },
    }));

    // Rendered verbatim — the same strings a refused submit puts in details[],
    // so an operator can match one against the other (OQ-133).
    expect(screen.getByText('Basic information: signatureLine')).toBeTruthy();
    expect(screen.queryByText(/^Location/)).toBeNull();
  });

  it('adds the two tasks completeness does not cover', () => {
    render(overview({ completeness: { complete: true, sections: [] } }));

    expect(screen.getByText('Chưa có loại phòng nào')).toBeTruthy();
    expect(screen.getByText('Chưa có hình ảnh khách sạn')).toBeTruthy();
  });

  it('says so when nothing is outstanding', () => {
    render(overview({
      completeness: { complete: true, sections: [] },
      roomTypes: [roomType('a', 2)],
      gallery: [galleryItem('1', true)],
    }));

    expect(screen.getByText('Không còn việc nào')).toBeTruthy();
  });

  it('offers the customer page only when a guest could actually reach it', () => {
    render(overview());
    // DRAFT — a link here would 404 for the operator who clicked it.
    expect(screen.queryByRole('link', { name: 'Xem trang khách hàng' })).toBeNull();

    cleanup();
    render(overview({ property: propertyAt(7, { lifecycleState: 'OPEN' }) }));
    expect(screen.getByRole('link', { name: 'Xem trang khách hàng' }).getAttribute('href'))
      .toBe('/vi/hotels/hotel-7');
  });

  it('merges Tồn phòng and Giá into one tab', () => {
    render(overview());

    const tabs = screen.getByRole('navigation', { name: 'Khu vực quản lý khách sạn' });
    const links = within(tabs).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual([
      'Tổng quan', 'Thông tin', 'Phòng', 'Hình ảnh', 'Giá', 'Chính sách',
    ]);
    expect(within(tabs).queryAllByText(/\(Bước \d+\)/)).toHaveLength(0);
  });

  it('exposes no control that could edit the property', () => {
    render(overview());

    // The invariant is unchanged from the screen this replaced: nothing here is
    // a field, and nothing here saves one. The two lifecycle controls move the
    // property along the lifecycle rather than editing its data.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu/ })).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Đưa vào hoạt động']);
  });

  it('never renders a broken hero when the delivery base is unconfigured', () => {
    // `MediaAssetView.url` is null when KAS_MEDIA_DELIVERY_BASE_URL is unset,
    // which is the state application-dev.yml leaves it in. The hero rendered
    // `src=""` — an immediately broken image whose non-empty alt painted the
    // hotel's own name inside the frame. PropertyMediaManager already refused
    // to do this; this screen now agrees with it.
    const withoutUrl = galleryItem('no-url', true);
    const { container } = render(overview({
      gallery: [{ ...withoutUrl, asset: { ...withoutUrl.asset, url: null } }],
    }));

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByText('Chưa có ảnh đại diện')).toBeTruthy();
  });

  it('prefers a usable cover over an unusable one', () => {
    const broken = galleryItem('broken', true);
    render(overview({
      gallery: [
        { ...broken, asset: { ...broken.asset, url: null } },
        galleryItem('usable', false),
      ],
    }));

    // The flagged cover has no bytes behind it, so the first photograph that
    // does stands in rather than the screen showing nothing.
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://media.kas.invalid/m/usable');
  });

  it('never exposes partnerId', () => {
    const { container } = render(overview());
    // Doc 58 §9 PARTNER group. The field is not on the DTO at all, so this is a
    // regression guard rather than a filter.
    expect(container.textContent).not.toMatch(/partnerId|partner_id/i);
  });
});

function roomType(slug: string, maxOccupancy: number) {
  return {
    id: `id-${slug}`, slug,
    translations: { vi: { name: slug } },
    status: 'DRAFT' as const,
    maxAdults: 2, maxChildren: 0, maxOccupancy,
    smoking: false, sortOrder: 0, beds: [], amenityCodes: [],
    tripIntentCodes: [], version: 0,
  };
}

function galleryItem(id: string, isCover: boolean) {
  return {
    asset: {
      id, mimeType: 'image/jpeg', category: 'EXTERIOR',
      width: 1600, height: 1000, sizeBytes: 100,
      status: 'PUBLISHED' as const,
      url: `https://media.kas.invalid/m/${id}`,
    },
    link: {
      id: `link-${id}`, mediaAssetId: id,
      ownerType: 'PROPERTY' as const, ownerId: 'p',
      displayOrder: 0, isCover, status: 'PUBLISHED' as const,
    },
  };
}
