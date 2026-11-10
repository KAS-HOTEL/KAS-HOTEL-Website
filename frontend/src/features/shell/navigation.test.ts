import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/ui/icons', () => ({
  BuildingIcon: () => null, CalendarIcon: () => null, GuestsIcon: () => null, InboxIcon: () => null, LayoutIcon: () => null, MailIcon: () => null, TagIcon: () => null,
}));

const { ADMIN_NAV, SUPER_ADMIN_NAV, consoleWordmark, navFor } = await import('./navigation');

const hrefs = (nav: typeof ADMIN_NAV) => nav.flatMap((section) => section.items.map((item) => item.href));
const APP = fileURLToPath(new URL('../../app/', import.meta.url));

/** `/admin/x` lives at `app/admin/(protected)/x`. */
function routeExists(href: string): boolean {
  const [, root, ...rest] = href.split('/');
  return existsSync(`${APP}${root}/(protected)/${rest.join('/')}/page.tsx`);
}

describe('the two consoles', () => {
  it('sends each role to its own menu and name', () => {
    expect(navFor('ADMIN')).toBe(ADMIN_NAV);
    expect(navFor('SUPER_ADMIN')).toBe(SUPER_ADMIN_NAV);
    expect(consoleWordmark('ADMIN')).toBe('KAS Admin');
    expect(consoleWordmark('SUPER_ADMIN')).toBe('KAS Super Admin');
  });

  it('shows the least when the role is not known', () => {
    expect(navFor(null)).toBe(ADMIN_NAV);
    expect(consoleWordmark(null)).toBe('KAS Admin');
  });

  it('keeps every SUPER_ADMIN-only screen out of the Admin menu', () => {
    const admin = hrefs(ADMIN_NAV);
    for (const href of ['/partner', '/partner/requests', '/partner/reservations', '/partner/cancellation-requests',
      '/partner/unmatched-payments',
      '/partner/messages', '/admin/customers', '/admin/vouchers', '/partner/payment-account',
      '/partner/pricing', '/partner/surcharges', '/partner/cancellation-fees', '/admin/reviews']) {
      expect(admin).not.toContain(href);
    }
  });

  it('shares no screen between the two roles', () => {
    expect(hrefs(SUPER_ADMIN_NAV).filter((href) => hrefs(ADMIN_NAV).includes(href))).toEqual([]);
  });

  it('links only to routes that exist, each once', () => {
    for (const nav of [ADMIN_NAV, SUPER_ADMIN_NAV]) {
      const links = hrefs(nav);
      expect(links.filter((href) => !routeExists(href))).toEqual([]);
      expect(new Set(links).size).toBe(links.length);
    }
  });
});
