// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesRequestSummary } from '@/lib/domain/salesRequest';
import { requestAgeGroup } from '@/lib/domain/salesRequest';
import { filtersFromSearchParams } from './SalesQueueFilters';
import { QueueSearchBar } from './QueueSearchBar';
import { SalesRequestTable } from './SalesRequestTable';
import { queueHref, queueTabs } from './tabs';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

// 10:00 on 3 Nov 2026 in Ho Chi Minh City (UTC+7).
const NOW = Date.parse('2026-11-03T03:00:00Z');

function summary(overrides: Partial<SalesRequestSummary> = {}): SalesRequestSummary {
  return {
    reference: 'KAS-1',
    propertySlug: 'kas-milestone',
    propertyName: 'KAS Milestone',
    guestName: 'Nguyen Van A',
    checkIn: '2026-11-20',
    checkOut: '2026-11-22',
    nights: 2,
    rooms: 1,
    adults: 2,
    children: 0,
    total: null,
    salesStatus: 'REQUESTED',
    leadSource: 'WEBSITE',
    requestedAt: '2026-11-03T02:00:00Z',
    slaDueAt: '2026-11-04T02:00:00Z',
    ...overrides,
  } as SalesRequestSummary;
}

beforeEach(() => {
  push.mockReset();
});
afterEach(cleanup);

describe('the inbox time sections', () => {
  it('uses the business calendar day, not UTC', () => {
    // 23:30 on 2 Nov in Ho Chi Minh City is 16:30Z — yesterday there, even though
    // it is the same UTC day as an instant at 01:00Z on 3 Nov.
    expect(requestAgeGroup('2026-11-02T16:30:00Z', NOW)).toBe('Hôm qua');
    expect(requestAgeGroup('2026-11-02T17:30:00Z', NOW)).toBe('Hôm nay');
    expect(requestAgeGroup('2026-10-29T03:00:00Z', NOW)).toBe('7 ngày gần đây');
    expect(requestAgeGroup('2026-10-27T03:00:00Z', NOW)).toBe('Cũ hơn');
    expect(requestAgeGroup('2026-11-05T03:00:00Z', NOW)).toBe('Hôm nay');
    expect(requestAgeGroup('not a date', NOW)).toBe('Cũ hơn');
  });

  it('heads each section once and keeps the backend’s order', () => {
    const { container } = render(
      <SalesRequestTable
        now={NOW}
        requests={[
          summary({ reference: 'KAS-4', requestedAt: '2026-11-03T02:30:00Z' }),
          summary({ reference: 'KAS-3', requestedAt: '2026-11-03T01:00:00Z' }),
          summary({ reference: 'KAS-2', requestedAt: '2026-11-02T05:00:00Z' }),
          summary({ reference: 'KAS-1', requestedAt: '2026-10-01T05:00:00Z', salesStatus: 'EXPIRED' }),
        ]}
      />,
    );
    const body = [...container.querySelectorAll('tbody tr')].map((row) =>
      row.querySelector('td') === null ? `# ${row.textContent}` : row.querySelector('td')?.textContent,
    );
    expect(body).toEqual(['# Hôm nay', 'KAS-4', 'KAS-3', '# Hôm qua', 'KAS-2', '# Cũ hơn', 'KAS-1']);
  });

  it('shows when each request was sent', () => {
    render(<SalesRequestTable now={NOW} requests={[summary()]} />);
    expect(screen.getByText('09:00 03/11')).toBeTruthy();
    expect(screen.getByText('1 giờ trước')).toBeTruthy();
  });

  it('shows the year only when it is not this year, on the stay and the sent time', () => {
    render(
      <SalesRequestTable
        now={NOW}
        requests={[summary({ requestedAt: '2025-12-30T02:00:00Z', checkIn: '2026-12-30', checkOut: '2027-01-02' })]}
      />,
    );
    expect(screen.getByText('09:00 30/12/2025')).toBeTruthy();
    expect(screen.getByText('30/12/2026 – 02/01/2027')).toBeTruthy();
  });

  it('opens a request when its row is clicked', () => {
    const { container } = render(<SalesRequestTable now={NOW} requests={[summary({ reference: 'KAS-9' })]} />);
    const row = [...container.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td') !== null);
    fireEvent.click(row as HTMLElement);
    expect(push).toHaveBeenCalledWith('/partner/requests/KAS-9');
  });
});

describe('the inbox search and order', () => {
  it('reads q and sort from the URL, newest first by default', () => {
    expect(filtersFromSearchParams({})).toEqual({});
    expect(filtersFromSearchParams({ q: '  Nguyen ', sort: 'oldest' })).toEqual({ q: 'Nguyen', sort: 'oldest' });
    expect(filtersFromSearchParams({ q: '   ', sort: 'sideways' })).toEqual({});
    expect(filtersFromSearchParams({ q: 'x'.repeat(150) }).q).toHaveLength(100);
  });

  it('keeps the hotel, search and order on every tab and page link', () => {
    expect(queueHref('expired', 'kas-riverside', 2, { q: 'KAS-26', sort: 'oldest' })).toBe(
      '/partner/requests?queue=expired&property=kas-riverside&q=KAS-26&sort=oldest&page=2',
    );
    expect(queueHref('all', undefined, 1, { sort: 'newest' })).toBe('/partner/requests');
    const tabs = queueTabs('kas-riverside', null, { q: 'An' });
    expect(tabs.map((tab) => tab.href)).toContain('/partner/requests?queue=awaiting&property=kas-riverside&q=An');
  });

  it('searches from the first page, keeping the tab, hotel and order', () => {
    render(<QueueSearchBar view="awaiting" property="kas-riverside" q={undefined} sort="oldest" total={12} />);
    const box = screen.getByRole('searchbox', { name: 'Tìm theo mã yêu cầu hoặc tên khách' });
    fireEvent.change(box, { target: { value: 'Tran' } });
    fireEvent.submit(box.closest('form') as HTMLFormElement);
    expect(push).toHaveBeenCalledWith('/partner/requests?queue=awaiting&property=kas-riverside&q=Tran&sort=oldest');
    expect(screen.getByText('12 yêu cầu')).toBeTruthy();
  });

  it('changes the order without dropping the search', () => {
    render(<QueueSearchBar view="all" property={undefined} q="Tran" sort="newest" total={3} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sắp xếp' }), { target: { value: 'oldest' } });
    expect(push).toHaveBeenCalledWith('/partner/requests?q=Tran&sort=oldest');
    expect(within(screen.getByRole('search')).getByText('Tìm thấy 3 yêu cầu')).toBeTruthy();
  });
});
