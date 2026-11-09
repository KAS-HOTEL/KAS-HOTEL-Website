// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavSection } from './AppShell';

let pathname = '/admin';

vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { AppShell } = await import('./AppShell');

const SECTIONS: readonly NavSection[] = [
  {
    items: [
      { label: 'Tổng quan', href: '/admin', status: 'available' },
      { label: 'Hồ sơ chờ duyệt', href: '/admin/review', status: 'available' },
      { label: 'Khách sạn', href: '/admin/properties', status: 'available' },
    ],
  },
  {
    heading: 'Nền tảng',
    items: [{ label: 'Nhật ký', href: '/admin/audit', status: 'unavailable', reason: 'Chưa có API' }],
  },
];

function shell(at: string) {
  pathname = at;
  return render(
    <AppShell wordmark="KAS Admin" sections={SECTIONS}>
      <p>content</p>
    </AppShell>,
  );
}

/** Every nav item currently marked as the page. */
function currentLabels(): string[] {
  return screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent ?? '');
}

afterEach(cleanup);

describe('the shell marks exactly one navigation item', () => {
  it('marks the index route on the index route', () => {
    shell('/admin');
    expect(currentLabels()).toEqual(['Tổng quan']);
  });

  it('marks the deepest match, not every href that is a prefix', () => {
    shell('/admin/review');

    // `/admin` is a prefix of everything beneath it. Testing items
    // independently lit both it and `/admin/review`, so the sidebar showed two
    // current items and `aria-current="page"` appeared twice.
    expect(currentLabels()).toEqual(['Hồ sơ chờ duyệt']);
  });

  it('keeps the section marked on a route below it', () => {
    shell('/admin/review/11111111-1111-4111-8111-111111111111');
    expect(currentLabels()).toEqual(['Hồ sơ chờ duyệt']);
  });

  it('matches whole segments, never string prefixes', () => {
    shell('/admin-tools');

    // `/admin-tools`.startsWith('/admin') is true; it is not a route beneath
    // `/admin` and must light nothing.
    expect(currentLabels()).toEqual([]);
  });

  it('never marks an item that has no backend behind it', () => {
    shell('/admin/audit');

    // Unavailable items render as disabled spans rather than links, so they can
    // never be the current page even when the path matches them exactly. The
    // enclosing section stays marked, which is correct — the reader is inside
    // the admin area, just not on a destination this list offers.
    expect(currentLabels()).not.toContain('Nhật ký');
    expect(screen.queryByRole('link', { name: /Nhật ký/ })).toBeNull();
    expect(screen.getByText('Chưa có API')).toBeTruthy();
  });
});
