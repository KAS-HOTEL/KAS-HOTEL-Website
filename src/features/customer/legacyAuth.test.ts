import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const apiSource = readFileSync(new URL('../../../js/api.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../../js/app.js', import.meta.url), 'utf8');
const verifyPage = readFileSync(new URL('../../../verify-email.html', import.meta.url), 'utf8');

function client(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, cookie = '') {
  const win: Record<string, unknown> = {};
  runInNewContext(apiSource, { window: win, location: { hostname: 'kas.example', origin: 'https://kas.example' }, document: { cookie }, fetch: fetchImpl, TypeError, Error, Object, Array, JSON, String, decodeURIComponent, encodeURIComponent });
  return win.KAS_API as { verifyEmail: (email: string, code: string) => Promise<unknown> };
}

it('verify-email.html submits the email and code the backend requires', () => {
  expect(verifyPage).toContain('KAS_API.verifyEmail(email(),code)');
  expect(verifyPage).not.toMatch(/KAS_API\.verifyEmail\(token\)/);
});

it('the sign-in modal moves an unverified account to the code screen', () => {
  expect(appSource).toContain('if(needsVerification){showVerification(emailLogin,password,false);');
});

it('sends email and code to the verification endpoint with the CSRF header', async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
  await client(fetchImpl, 'XSRF-TOKEN=abc').verifyEmail('guest@example.invalid', '123456');
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://kas.example/api/v1/public/auth/verify-email');
  expect(JSON.parse(String(init.body))).toEqual({ email: 'guest@example.invalid', code: '123456' });
  expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('abc');
});

it('stops priming CSRF after one attempt when the cookie never appears', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.includes('/actuator/')
    ? new Response('{}', { status: 200 })
    : new Response(JSON.stringify({ message: 'denied' }), { status: 403 }));
  await expect(client(fetchImpl).verifyEmail('guest@example.invalid', '123456')).rejects.toMatchObject({ status: 403 });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it('shares one refresh between requests that expire together, and repeats each request', async () => {
  let renewed = false;
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith('/api/v1/public/auth/refresh')) {
      await Promise.resolve();
      renewed = true;
      return new Response(null, { status: 204 });
    }
    return renewed
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 });
  });
  const api = client(fetchImpl, 'XSRF-TOKEN=abc') as unknown as { request: (p: string) => Promise<unknown> };
  const results = await Promise.all([api.request('/api/v1/me/profile'), api.request('/api/v1/me/favorites'), api.request('/api/v1/me/stays')]);
  expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
  const refreshes = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
  expect(refreshes).toHaveLength(1);
});

it('still repeats the request once when this tab lost the refresh race, then reports 401', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.endsWith('/auth/refresh')
    ? new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 })
    : new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 }));
  const api = client(fetchImpl, 'XSRF-TOKEN=abc') as unknown as { request: (p: string) => Promise<unknown> };
  await expect(api.request('/api/v1/me/profile')).rejects.toMatchObject({ status: 401 });
  // original, one refresh, one repeat — no loop.
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
