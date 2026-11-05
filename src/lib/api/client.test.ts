import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRefreshState } from './refresh';

/**
 * The refresh interceptor and CSRF behaviour.
 *
 * These run in a simulated browser (`window` defined) because the refresh path
 * is deliberately browser-only: a Server Component cannot write the rotated
 * cookies back, so refreshing there would silently destroy the session.
 */

type FetchArgs = { url: string; init: RequestInit };

let calls: FetchArgs[] = [];
let fetchMock: ReturnType<typeof makeFetchMock>;

function makeFetchMock() {
  return vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorised(): Response {
  return jsonResponse(401, {
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required.',
    details: [],
    correlationId: null,
  });
}

beforeEach(() => {
  vi.resetModules();
  resetRefreshState();
  calls = [];

  // A browser context, with a CSRF cookie already primed unless a test clears it.
  vi.stubGlobal('window', {} as unknown as Window);
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=token-abc' } as unknown as Document);

  fetchMock = makeFetchMock();
  vi.stubGlobal('fetch', ((input: string, init: RequestInit) => {
    calls.push({ url: String(input), init });
    return fetchMock(input, init);
  }) as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRefreshState();
});

async function loadClient() {
  return import('./client');
}

describe('CSRF', () => {
  it('sends X-XSRF-TOKEN on a mutation', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, null));
    const { api } = await loadClient();

    await api.post('/api/v1/public/auth/logout');

    const headers = new Headers(calls[0]?.init.headers);
    // Verified against the running backend: a mutation without this header is
    // refused with 403, login included.
    expect(headers.get('X-XSRF-TOKEN')).toBe('token-abc');
  });

  it('does not send X-XSRF-TOKEN on a read', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    const { api } = await loadClient();

    await api.get('/api/v1/me/sessions');

    expect(new Headers(calls[0]?.init.headers).get('X-XSRF-TOKEN')).toBeNull();
  });

  it('primes the token with a public GET when the cookie is missing', async () => {
    vi.stubGlobal('document', { cookie: '' } as unknown as Document);
    fetchMock.mockResolvedValue(jsonResponse(204, null));
    const { api } = await loadClient();

    await api.post('/api/v1/public/auth/logout');

    // The first call primes; the mutation follows. Without this a first-visit
    // login would 403 and read to the user as "wrong password".
    expect(calls[0]?.url).toBe('/api/v1/public/properties');
    expect(calls[1]?.url).toBe('/api/v1/public/auth/logout');
  });
});

describe('refresh interceptor', () => {
  it('refreshes once after a 401 and retries the original request', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised()) // original
      .mockResolvedValueOnce(jsonResponse(204, null)) // refresh
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 's1' }])); // retry

    const { api } = await loadClient();
    const result = await api.get<Array<{ id: string }>>('/api/v1/me/sessions');

    expect(result).toEqual([{ id: 's1' }]);
    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/me/sessions',
      '/api/v1/public/auth/refresh',
      '/api/v1/me/sessions',
    ]);
  });

  it('gives up after a failed refresh and surfaces the original 401', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised()) // original
      .mockResolvedValueOnce(unauthorised()); // refresh also fails

    const { api } = await loadClient();

    // Asserted by contract, not class identity: vi.resetModules() gives the
    // freshly-imported client its own ApiError class object.
    await expect(api.get('/api/v1/me/sessions')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    // Exactly two calls: no retry of the original, and no second refresh.
    expect(calls).toHaveLength(2);
  });

  it('never loops — a 401 on the retry is not refreshed again', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised()) // original
      .mockResolvedValueOnce(jsonResponse(204, null)) // refresh succeeds
      .mockResolvedValueOnce(unauthorised()); // retry still 401

    const { api } = await loadClient();

    await expect(api.get('/api/v1/me/sessions')).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(3);
    expect(calls.filter((call) => call.url.endsWith('/refresh'))).toHaveLength(1);
  });

  it('never refreshes a failed login — that 401 means wrong credentials', async () => {
    fetchMock.mockResolvedValue(unauthorised());
    const { api } = await loadClient();

    await expect(
      api.post('/api/v1/public/auth/login', { email: 'a@b.invalid', password: 'x' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(calls.filter((call) => call.url.endsWith('/refresh'))).toHaveLength(0);
  });

  it('coalesces concurrent 401s into a single refresh', async () => {
    let refreshes = 0;
    fetchMock.mockImplementation((input: string) => {
      const url = String(input);
      if (url.endsWith('/refresh')) {
        refreshes += 1;
        // Deliberately async so all three originals fail before it resolves —
        // that is the race a rotating refresh token would lose.
        return new Promise((resolve) => setTimeout(() => resolve(jsonResponse(204, null)), 5));
      }
      const priorFailures = calls.filter((call) => call.url === url).length;
      return Promise.resolve(priorFailures > 1 ? jsonResponse(200, []) : unauthorised());
    });

    const { api } = await loadClient();
    await Promise.all([
      api.get('/api/v1/admin/properties'),
      api.get('/api/v1/admin/rate-rules'),
      api.get('/api/v1/me/sessions'),
    ]);

    // One refresh, not three. Three would rotate the token and invalidate the
    // other two, logging the user out of a valid session.
    expect(refreshes).toBe(1);
  });
});

describe('token hygiene', () => {
  it('never puts a token in application state — the response body is empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, null));
    const { api } = await loadClient();

    const result = await api.post('/api/v1/public/auth/login', {
      email: 'a@b.invalid',
      password: 'secret',
    });

    // 204 No Content: the session is in HttpOnly cookies the client cannot read.
    // There is nothing to store, which is the design.
    expect(result).toBeUndefined();
  });

  it('never sets an Authorization header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    const { api } = await loadClient();

    await api.get('/api/v1/me/sessions');

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(calls[0]?.init.credentials).toBe('include');
  });
});
