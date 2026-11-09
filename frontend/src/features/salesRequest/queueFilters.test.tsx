// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { filtersFromSearchParams } = await import('./SalesQueueFilters');
const { HotelFilter } = await import('./HotelFilter');

const PROPERTIES = [
  { slug: 'kas-milestone', label: 'KAS Milestone' },
  { slug: 'kas-riverside', label: 'KAS Riverside' },
];

beforeEach(() => push.mockReset());
afterEach(cleanup);

describe('reading the queue state from the URL', () => {
  it('reads the view and the hotel, and nothing else', () => {
    expect(filtersFromSearchParams({ queue: 'awaiting', property: 'kas-riverside' }))
      .toEqual({ queue: 'awaiting', property: 'kas-riverside' });
    // The removed status, lead-source and overdue filters are no longer read.
    expect(filtersFromSearchParams({ salesStatus: 'WON', leadSource: 'PHONE', slaState: 'breached' })).toEqual({});
  });

  it('drops a view no tab writes, falling back to All', () => {
    expect(filtersFromSearchParams({ queue: 'breaching' })).toEqual({});
  });

  it('treats an empty hotel as every hotel and takes the first of a repeated parameter', () => {
    expect(filtersFromSearchParams({ property: '' })).toEqual({});
    expect(filtersFromSearchParams({ queue: ['expired', 'accepted'] })).toEqual({ queue: 'expired' });
  });
});

describe('the hotel filter', () => {
  it('is the only control: a labelled select naming hotels, with "every hotel" first', () => {
    render(<HotelFilter view="all" property={undefined} properties={PROPERTIES} />);
    const select = screen.getByLabelText('Khách sạn') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(['Tất cả khách sạn', 'KAS Milestone', 'KAS Riverside']);
    expect(screen.queryByLabelText('Trạng thái')).toBeNull();
    expect(screen.queryByLabelText('Nguồn khách')).toBeNull();
    expect(screen.queryByText('Chỉ hiện yêu cầu quá hạn')).toBeNull();
  });

  it('navigates at once and keeps the current tab', async () => {
    render(<HotelFilter view="expired" property={undefined} properties={PROPERTIES} />);
    await userEvent.selectOptions(screen.getByLabelText('Khách sạn'), 'kas-riverside');
    expect(push).toHaveBeenCalledWith('/partner/requests?queue=expired&property=kas-riverside');
  });

  it('returns to every hotel on the same tab', async () => {
    render(<HotelFilter view="awaiting" property="kas-riverside" properties={PROPERTIES} />);
    expect(screen.getByRole('link', { name: 'Bỏ chọn' }).getAttribute('href')).toBe('/partner/requests?queue=awaiting');
    await userEvent.selectOptions(screen.getByLabelText('Khách sạn'), '');
    expect(push).toHaveBeenCalledWith('/partner/requests?queue=awaiting');
  });

  it('offers the clear link only when a hotel is chosen', () => {
    render(<HotelFilter view="all" property={undefined} properties={PROPERTIES} />);
    expect(screen.queryByRole('link', { name: 'Bỏ chọn' })).toBeNull();
  });
});
