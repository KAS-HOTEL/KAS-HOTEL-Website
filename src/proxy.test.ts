import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

/* Console host proxy (server separation, docs/kas/156). Next.js exposes what a proxy
   decided through x-middleware-* response headers; these tests read those. */

const saved = { ...process.env };
function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
const request = (path: string, init?: { headers?: Record<string, string>; method?: string }) =>
  new NextRequest(new URL(path, 'http://localhost:3002'), init);

beforeEach(() => setEnv({ KAS_CONSOLE_ONLY: undefined, KAS_API_ORIGIN: undefined }));
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe('console-only host (KAS_CONSOLE_ONLY=true)', () => {
  beforeEach(() => setEnv({ KAS_CONSOLE_ONLY: 'true' }));

  it.each(['/en', '/vi', '/en/hotels', '/vi/hotels/kas-dilly-hotel', '/en/account/login',
    '/en/account/reset-password', '/en/guidebook', '/en/requests/KAS0000001', '/demo', '/anything'])(
    'does not serve guest pages: %s answers 404', (path) => {
      const response = proxy(request(path));
      expect(response.status).toBe(404);
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    });

  it('opens the admin sign-in from the root, not the guest home', () => {
    const response = proxy(request('/'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/admin/login');
  });

  it.each(['/admin/login', '/admin', '/admin/properties/1', '/partner/login', '/partner/requests?tab=new'])(
    'keeps the console pages and passes their path: %s', (path) => {
      const response = proxy(request(path));
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('x-middleware-request-x-kas-path')).toBe(path);
    });

  it.each(['/fonts/be-vietnam-pro-latin-400.woff2', '/favicon.ico', '/icon.png', '/apple-icon.png'])('lets static files through: %s', (path) => {
    expect(proxy(request(path)).status).toBe(200);
  });
});

describe('API calls through the console', () => {
  it('marks them as the console surface, overwriting what the browser sent', () => {
    const response = proxy(request('/api/v1/public/auth/login', {
      method: 'POST', headers: { 'X-KAS-Surface': 'customer' },
    }));
    expect(response.headers.get('x-middleware-request-x-kas-surface')).toBe('console');
  });

  it('without a run-time origin leaves the build-time rewrite in charge', () => {
    const response = proxy(request('/api/v1/admin/properties'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('with KAS_API_ORIGIN at run time proxies to it, keeping path and query', () => {
    setEnv({ KAS_API_ORIGIN: 'http://kas-backend:10000' });
    const response = proxy(request('/api/v1/admin/properties?page=2'));
    expect(response.headers.get('x-middleware-rewrite'))
      .toBe('http://kas-backend:10000/api/v1/admin/properties?page=2');
    expect(response.headers.get('x-middleware-request-x-kas-surface')).toBe('console');
  });

  it.each(['file:///etc/passwd', 'not a url', 'http://user:secret@kas-backend:10000',
    'http://kas-backend:10000/api', 'http://kas-backend:10000?x=1'])(
    'answers 503 JSON for an unusable run-time origin instead of guessing: %s', async (value) => {
      setEnv({ KAS_API_ORIGIN: value });
      const response = proxy(request('/api/v1/public/properties'));
      expect(response.status).toBe(503);
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
      expect(await response.json()).toMatchObject({ code: 'API_ORIGIN_INVALID' });
    });

  it('accepts an origin with a trailing slash', () => {
    setEnv({ KAS_API_ORIGIN: 'https://kas-backend.onrender.com/' });
    expect(proxy(request('/api/v1/me/console')).headers.get('x-middleware-rewrite'))
      .toBe('https://kas-backend.onrender.com/api/v1/me/console');
  });

  it('refuses an origin that is the console itself (508), so it cannot loop', async () => {
    setEnv({ KAS_API_ORIGIN: 'http://localhost:3002' });
    const response = proxy(request('/api/v1/public/properties'));
    expect(response.status).toBe(508);
    expect(await response.json()).toMatchObject({ code: 'API_ORIGIN_LOOP' });
  });

  it('marks forwarded requests and cuts a loop that comes back through another host', async () => {
    setEnv({ KAS_API_ORIGIN: 'http://kas-backend:10000' });
    const first = proxy(request('/api/v1/public/properties'));
    expect(first.headers.get('x-middleware-request-x-kas-console-proxy')).toBe('1');
    const back = proxy(request('/api/v1/public/properties', { headers: { 'x-kas-console-proxy': '1' } }));
    expect(back.status).toBe(508);
    expect(back.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('applies on the console-only host too (API paths are never 404 here)', () => {
    setEnv({ KAS_CONSOLE_ONLY: 'true' });
    expect(proxy(request('/api/v1/me/console')).status).toBe(200);
  });
});

describe('without the flag (local Next dev)', () => {
  it('serves guest pages as before', () => {
    const response = proxy(request('/en/hotels'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('matcher', () => {
  it('covers pages and the API but not Next.js assets', () => {
    const [matcher] = config.matcher;
    expect(matcher).toBeDefined();
    const pattern = new RegExp(`^${String(matcher).replace('/(', '/(?:')}$`);
    expect(pattern.test('/en')).toBe(true);
    expect(pattern.test('/api/v1/public/auth/login')).toBe(true);
    expect(pattern.test('/_next/static/chunks/app.js')).toBe(false);
    expect(pattern.test('/_next/image')).toBe(false);
  });
});
