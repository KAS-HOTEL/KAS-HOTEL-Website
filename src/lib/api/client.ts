import { apiOrigin } from '@/config/env';
import { ensureCsrfToken, readCsrfToken } from './csrf';
import { ApiError, toApiError } from './errors';
import { isAuthPath, refreshOnce } from './refresh';

/**
 * The only place the application talks to the backend.
 *
 * ESLint forbids `fetch` everywhere else (see eslint.config.mjs), because
 * everything that makes a request correct lives here: cookie transport, the
 * CSRF header, the refresh interceptor, error mapping, and the difference
 * between running in a browser and running on the server.
 *
 * <h2>Two execution contexts, one contract</h2>
 *
 * In the **browser** the request is relative (`/api/v1/…`) and
 * `next.config.ts` proxies it, so the origin never changes and the `HttpOnly`
 * session cookies are sent automatically.
 *
 * On the **server** — a Server Component or Route Handler — there is no browser
 * to attach cookies, so the request goes straight to {@link apiOrigin} and the
 * incoming request's `Cookie` header is forwarded explicitly.
 *
 * <h2>What the server context deliberately does not do</h2>
 *
 * It never refreshes. A refresh issues new `Set-Cookie` headers, and a Server
 * Component cannot write cookies back to the browser — Next.js forbids it
 * outside an action or route handler. Refreshing there would rotate the refresh
 * token, discard the new one, and log the user out. So a server-side 401 is
 * reported as a 401 and the browser decides what to do about it.
 */

const CSRF_HEADER = 'X-XSRF-TOKEN';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  readonly method?: HttpMethod;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  /**
   * Server-side only: the caller's `Cookie` header, read from `next/headers`.
   * Omitted in the browser, where the browser attaches cookies itself.
   */
  readonly cookieHeader?: string;
  /**
   * Extra request headers.
   *
   * Added for `Idempotency-Key`, which doc 58 §3.3 marks **Required** on the
   * reservation request and which no query parameter or body field can carry.
   * Deliberately narrow: it cannot override `Content-Type`, the CSRF header or
   * `Cookie`, which are set after this spread precisely so a caller cannot
   * weaken the transport.
   */
  readonly headers?: Readonly<Record<string, string>>;
  readonly cache?: RequestCache;
  readonly signal?: AbortSignal;
  /** Internal: set on the single retry after a refresh, to stop a second one. */
  readonly isRetry?: boolean;
}

const isServer = typeof window === 'undefined';

/**
 * Performs one request and returns the parsed body.
 *
 * @throws ApiError on any non-2xx response, already mapped to the doc 58 shape
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const url = buildUrl(path, options.query);

  const headers = new Headers({ Accept: 'application/json' });
  // Caller headers first, so the transport headers below always win.
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (isServer && options.cookieHeader) {
    headers.set('Cookie', options.cookieHeader);
  }

  if (!isServer && MUTATING_METHODS.has(method)) {
    // Verified against the running backend: a mutation without this header is
    // refused with 403, login included. See lib/api/csrf.ts.
    const token = await ensureCsrfToken();
    if (token) {
      headers.set(CSRF_HEADER, token);
    }
  }

  const init: RequestInit = {
    method,
    headers,
    // Sends the HttpOnly session cookies. Same-origin in the browser because of
    // the proxy, so this is not a cross-origin credential grant.
    credentials: 'include',
    // Availability, inventory and rates must never be served stale — doc 15 §10
    // caps any availability cache at 60 seconds with eager invalidation, and
    // nothing here is close to that safe by default.
    cache: options.cache ?? 'no-store',
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  };

  const response = await fetch(url, init);

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    const body = await response.text();
    return body.trim() === '' ? (undefined as T) : (JSON.parse(body) as T);
  }

  const error = await toApiError(response);

  if (shouldAttemptRefresh(error, path, options)) {
    const renewed = await refreshOnce(async () => {
      await request<void>('/api/v1/public/auth/refresh', { method: 'POST', isRetry: true });
    });
    if (renewed) {
      return request<T>(path, { ...options, isRetry: true });
    }
  }

  throw error;
}

/**
 * A 401 is worth one refresh only when a session could plausibly be renewed.
 *
 * Not on the server (it cannot write the rotated cookies back), not on a retry
 * (once means once), and never for the auth endpoints themselves.
 */
function shouldAttemptRefresh(error: ApiError, path: string, options: RequestOptions): boolean {
  return (
    !isServer && error.isUnauthenticated && options.isRetry !== true && !isAuthPath(path)
  );
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', ...(body !== undefined ? { body } : {}) }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', ...(body !== undefined ? { body } : {}) }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', ...(body !== undefined ? { body } : {}) }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
} as const;

export { ApiError, readCsrfToken };

/**
 * Absolute on the server, relative in the browser.
 *
 * A relative URL in a Server Component has no origin to resolve against; an
 * absolute one in the browser would leave the frontend origin and lose both the
 * cookies and the proxy.
 */
function buildUrl(
  path: string,
  query?: Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  if (!path.startsWith('/api/v1/')) {
    throw new Error(`API paths must start with /api/v1/, got: ${path}`);
  }
  const base = isServer ? `${apiOrigin()}${path}` : path;
  if (!query) {
    return base;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  const serialised = params.toString();
  return serialised ? `${base}?${serialised}` : base;
}
