// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QueuePager } from './QueuePager';
import { pageFromSearchParams } from './SalesQueueFilters';
import { queueHref } from './tabs';

afterEach(cleanup);

describe('queue pages', () => {
  it('reads the page from the URL, falling back to the first', () => {
    expect(pageFromSearchParams({ page: '3' })).toBe(3);
    for (const bad of [undefined, '0', '-2', '1.5', 'abc']) {
      expect(pageFromSearchParams({ page: bad })).toBe(1);
    }
  });

  it('keeps the tab and the hotel in every page link, and page 1 is the bare view', () => {
    expect(queueHref('expired', 'kas-riverside', 2)).toBe('/partner/requests?queue=expired&property=kas-riverside&page=2');
    expect(queueHref('expired', 'kas-riverside', 1)).toBe('/partner/requests?queue=expired&property=kas-riverside');
  });

  it('shows the exact range from the database total, with prev/next only where they lead somewhere', () => {
    render(<QueuePager view="awaiting" property="kas-riverside" page={2} pageSize={25} total={60} />);
    expect(screen.getByText('26–50 / 60 yêu cầu')).toBeTruthy();
    expect(screen.getByText('Trang 2 / 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: '‹ Trang trước' }).getAttribute('href')).toBe('/partner/requests?queue=awaiting&property=kas-riverside');
    expect(screen.getByRole('link', { name: 'Trang sau ›' }).getAttribute('href')).toBe('/partner/requests?queue=awaiting&property=kas-riverside&page=3');
  });

  it('offers no next page on the last one', () => {
    render(<QueuePager view="all" property={undefined} page={3} pageSize={25} total={60} />);
    expect(screen.getByText('51–60 / 60 yêu cầu')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Trang sau ›' })).toBeNull();
  });

  it('is absent when everything fits on one page', () => {
    const { container } = render(<QueuePager view="all" property={undefined} page={1} pageSize={25} total={7} />);
    expect(container.textContent).toBe('');
  });
});
