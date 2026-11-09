// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isOpenRequest,
  salesStatusTone,
  TERMINAL_SALES_STATUSES,
  type SalesRequestSummary,
} from '@/lib/domain/salesRequest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const { SalesRequestTable } = await import('./SalesRequestTable');

/**
 * The status a request is in, on the screen that lists requests.
 *
 * <h2>What was wrong</h2>
 *
 * The queue had a status filter offering all nine `sales_status` values and no
 * status column. Narrowing by status produced rows that never said what their
 * status was, and the three requests in the development database — every one of
 * them EXPIRED after the hold sweep ran — looked exactly like live work waiting
 * for a reply.
 *
 * <p>"Hạn phản hồi" was the only state-ish column and it answers a different
 * question. A request that was WON yesterday and one that expired unanswered can
 * both read "Đã quá hạn", because the SLA is about the clock, not the outcome.
 */

const NOW = Date.parse('2026-09-01T09:00:00Z');

function summary(overrides: Partial<SalesRequestSummary> = {}): SalesRequestSummary {
  return {
    reference: 'KAS-260912-4F7A',
    salesStatus: 'REQUESTED',
    leadSource: 'WEBSITE',
    propertySlug: 'kas-milestone',
    propertyName: 'KAS Milestone',
    checkIn: '2026-09-12',
    checkOut: '2026-09-14',
    nights: 2,
    adults: 2,
    children: 0,
    rooms: 1,
    guestName: 'Nguyen Van A',
    requestedAt: '2026-09-01T08:00:00Z',
    slaDueAt: '2026-09-02T08:00:00Z',
    total: { amountMinor: 2_400_000, currency: 'VND', exponent: 0 },
    ...overrides,
  };
}

/** The status cell — the fifth column, immediately after doc 69 §4.2's four. */
function statusCell(container: HTMLElement): HTMLElement {
  const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
  const cell = dataRows(container)[0]?.querySelectorAll('td')[headers.indexOf('Trạng thái')];
  if (!(cell instanceof HTMLElement)) {
    throw new Error('the queue row has no status cell');
  }
  return cell;
}

/** Body rows that hold a request — the day headings ("Hôm nay"…) are not. */
function dataRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('tbody tr')].filter((row) => row.querySelector('td') !== null);
}

afterEach(cleanup);

describe('the queue status column', () => {
  it('sits after the response deadline, as the last column', () => {
    const { container } = render(<SalesRequestTable requests={[summary()]} now={NOW} />);
    const headers = [...container.querySelectorAll('thead th')].map((h) => h.textContent);

    expect(headers.slice(-2)).toEqual(['Thời hạn phản hồi', 'Trạng thái']);
  });

  it('names each status in Vietnamese', () => {
    const expected: Record<string, string> = {
      REQUESTED: 'Chờ phản hồi',
      ASSIGNED: 'Đã phân công',
      AVAILABILITY_CHECK: 'Đang kiểm tra phòng',
      CUSTOMER_CONTACTED: 'Đã liên hệ khách',
      ALTERNATIVE_OFFERED: 'Đã đề xuất phương án khác',
      PAYMENT_PENDING: 'Chờ thanh toán',
      WON: 'Đã xác nhận',
      DECLINED: 'Đã từ chối',
      CANCELLED: 'Đã hủy',
      EXPIRED: 'Quá hạn',
    };
    for (const [status, label] of Object.entries(expected)) {
      const { container } = render(<SalesRequestTable requests={[summary({ salesStatus: status })]} now={NOW} />);
      expect(within(statusCell(container)).getByText(label)).toBeTruthy();
      expect(within(statusCell(container)).queryByText(status)).toBeNull();
      cleanup();
    }
  });

  it('renders a value the enum gains later as itself, without crashing', () => {
    const { container } = render(
      <SalesRequestTable requests={[summary({ salesStatus: 'ESCALATED' })]} now={NOW} />,
    );

    expect(within(statusCell(container)).getByText('ESCALATED')).toBeTruthy();
  });

  it('tells an expired request apart from a live one', () => {
    const { container } = render(
      <SalesRequestTable
        requests={[
          summary({ reference: 'KAS-A', salesStatus: 'EXPIRED' }),
          summary({ reference: 'KAS-B', salesStatus: 'REQUESTED' }),
        ]}
        now={NOW}
      />,
    );

    const rows = dataRows(container);
    expect(within(rows[0] as HTMLElement).getAllByText(/Quá hạn/).length).toBeGreaterThan(0);
    expect(within(rows[1] as HTMLElement).getByText('Chờ phản hồi')).toBeTruthy();
  });
});

describe('the queue’s empty state', () => {
  it('says the queue is empty only when nothing was filtered', () => {
    render(<SalesRequestTable requests={[]} now={NOW} />);

    expect(screen.getByText('Chưa có yêu cầu nào')).toBeTruthy();
  });

  it('says the filter matched nothing when a filter is on', () => {
    render(<SalesRequestTable requests={[]} now={NOW} filtered />);

    // Found live: `?salesStatus=REQUESTED` over a queue of three EXPIRED
    // requests announced that no request had ever been sent. Empty, not-found
    // and narrowed are three different states and only one of them is this one.
    expect(screen.getByText('Không có yêu cầu nào trong mục này')).toBeTruthy();
    expect(screen.queryByText('Chưa có yêu cầu nào')).toBeNull();
    // And the way out is offered rather than left to the browser's back button.
    expect(screen.getByRole('link', { name: 'xem tất cả yêu cầu' })).toBeTruthy();
  });
});

describe('open and terminal', () => {
  it('treats doc 54 §4’s four values plus ALTERNATIVE_OFFERED (owner decision 2026-11-07) as terminal', () => {
    expect([...TERMINAL_SALES_STATUSES].sort()).toEqual([
      'ALTERNATIVE_OFFERED',
      'CANCELLED',
      'DECLINED',
      'EXPIRED',
      'WON',
    ]);
  });

  it('counts every non-terminal status as open', () => {
    for (const status of [
      'REQUESTED',
      'ASSIGNED',
      'AVAILABILITY_CHECK',
      'CUSTOMER_CONTACTED',
    ]) {
      expect(isOpenRequest(summary({ salesStatus: status }))).toBe(true);
    }
    // ALTERNATIVE_OFFERED closes the request since 2026-11-07 (owner decision).
    for (const status of ['WON', 'DECLINED', 'CANCELLED', 'EXPIRED', 'ALTERNATIVE_OFFERED']) {
      expect(isOpenRequest(summary({ salesStatus: status }))).toBe(false);
    }
  });

  it('counts a status the enum gains later as open rather than hiding it', () => {
    // Defined as "not terminal" precisely so a new status shows up in the count
    // that is supposed to mean everything, instead of vanishing from it.
    expect(isOpenRequest(summary({ salesStatus: 'ESCALATED' }))).toBe(true);
  });

  it('gives each status a tone without making colour the only signal', () => {
    expect(salesStatusTone('WON')).toBe('success');
    expect(salesStatusTone('EXPIRED')).toBe('warning');
    expect(salesStatusTone('DECLINED')).toBe('neutral');
    expect(salesStatusTone('CANCELLED')).toBe('neutral');
    expect(salesStatusTone('REQUESTED')).toBe('info');
    // The badge prints the status text in every one of those cases — the tone
    // sits alongside the word, never instead of it.
  });
});
