import { beforeEach, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn<(target: string) => void>());
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/auth/guard', () => ({
  safeReturnTo: (value: string | undefined, fallback: string) =>
    !value || !value.startsWith('/') || value.startsWith('//') ? fallback : value,
}));
import PartnerLoginPage from './page';

beforeEach(() => redirect.mockClear());

async function target(returnTo?: string): Promise<string | undefined> {
  await PartnerLoginPage({ searchParams: Promise.resolve(returnTo === undefined ? {} : { returnTo }) });
  return redirect.mock.calls.at(-1)?.[0];
}

/** One sign-in page for the console (2026-11-10): /partner/login only forwards to /admin/login. */
it('sends /partner/login to /admin/login', async () => {
  expect(await target()).toBe('/admin/login');
});

it('keeps a safe returnTo, and drops one that would leave the site', async () => {
  expect(await target('/partner/requests?tab=new')).toBe('/admin/login?returnTo=%2Fpartner%2Frequests%3Ftab%3Dnew');
  expect(await target('//evil.example')).toBe('/admin/login');
});
