// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const { HotelFilter } = await import('./HotelFilter');

const PROPERTIES = [
  { slug: 'kas-milestone', label: 'KAS Milestone' },
  { slug: 'kas-riverside', label: 'KAS Riverside' },
];

afterEach(cleanup);

/**
 * A tab change is a client-side navigation: the component is reused with new
 * props. The select is controlled, so it must show the hotel in the URL, never
 * the one from the page before.
 */
describe('the hotel filter after a navigation', () => {
  it('follows the hotel in the new URL', () => {
    const { rerender } = render(<HotelFilter view="all" property="kas-milestone" properties={PROPERTIES} />);
    expect((screen.getByLabelText('Khách sạn') as HTMLSelectElement).value).toBe('kas-milestone');
    rerender(<HotelFilter view="expired" property="kas-riverside" properties={PROPERTIES} />);
    expect((screen.getByLabelText('Khách sạn') as HTMLSelectElement).value).toBe('kas-riverside');
  });

  it('shows every hotel again when the new URL has none', () => {
    const { rerender } = render(<HotelFilter view="all" property="kas-milestone" properties={PROPERTIES} />);
    rerender(<HotelFilter view="awaiting" property={undefined} properties={PROPERTIES} />);
    expect((screen.getByLabelText('Khách sạn') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('link', { name: 'Bỏ chọn' })).toBeNull();
  });
});
