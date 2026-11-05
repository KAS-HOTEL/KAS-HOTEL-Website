// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SalesQueueCounts, SalesQueueFilters } from '@/lib/api/endpoints';
import { Tabs } from '@/ui/primitives';
import { activeQueueTab, queueHref, queueTabs, SALES_QUEUE_VIEWS } from './tabs';

const COUNTS: SalesQueueCounts = { all: 12, awaiting: 3, expired: 2, accepted: 5 };

/** The strip exactly as the queue page renders it. */
function strip(filters: SalesQueueFilters = {}, counts: SalesQueueCounts | null = COUNTS) {
  return render(
    <Tabs label="Nhóm yêu cầu" items={queueTabs(filters.property, counts)} activeId={activeQueueTab(filters)} />,
  );
}

afterEach(cleanup);

describe('the four views', () => {
  it('are All, Awaiting response, Overdue and Accepted, in that order', () => {
    expect(SALES_QUEUE_VIEWS.map((view) => view.label)).toEqual(['Tất cả', 'Chờ phản hồi', 'Quá hạn', 'Đã chấp nhận']);
    strip();
    const links = within(screen.getByRole('navigation', { name: 'Nhóm yêu cầu' })).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Tất cả (12)', 'Chờ phản hồi (3)', 'Quá hạn (2)', 'Đã chấp nhận (5)',
    ]);
  });

  it('send the view to the backend, which owns each status set', () => {
    expect(queueHref('all', undefined)).toBe('/partner/requests');
    expect(queueHref('awaiting', undefined)).toBe('/partner/requests?queue=awaiting');
    expect(queueHref('expired', undefined)).toBe('/partner/requests?queue=expired');
    expect(queueHref('accepted', undefined)).toBe('/partner/requests?queue=accepted');
  });

  it('keep the selected hotel when switching view', () => {
    for (const tab of queueTabs('kas-riverside', COUNTS)) {
      expect(tab.href).toContain('property=kas-riverside');
    }
    expect(queueHref('expired', 'kas-riverside')).toBe('/partner/requests?queue=expired&property=kas-riverside');
  });

  it('show plain labels, never invented numbers, when the counts did not load', () => {
    strip({}, null);
    expect(screen.getByRole('link', { name: 'Chờ phản hồi' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\(\d+\)/);
  });
});

describe('the active tab', () => {
  it('is All when no view is chosen, whatever the hotel', () => {
    expect(activeQueueTab({})).toBe('all');
    expect(activeQueueTab({ property: 'kas-riverside' })).toBe('all');
  });

  it('is the view in the URL', () => {
    expect(activeQueueTab({ queue: 'awaiting' })).toBe('awaiting');
    expect(activeQueueTab({ queue: 'expired', property: 'kas-riverside' })).toBe('expired');
    strip({ queue: 'accepted' });
    expect(screen.getByRole('link', { name: 'Đã chấp nhận (5)' }).getAttribute('aria-current')).toBe('page');
  });
});
