import { NextResponse, type NextRequest } from 'next/server';

/**
 * Console host proxy (server separation, docs/kas/156).
 *
 * 1. `/admin/**`, `/partner/**`: passes the requested console path to server
 *    components as `x-kas-path`. Layouts cannot read the URL, so when a session
 *    needed renewing the sign-in page could only send people back to the console's
 *    home. With the path, a renewed session lands on the page that was asked for.
 *
 * 2. `/api/v1/**`: marks the request as coming through the console
 *    (`X-KAS-Surface: console`, overwriting whatever the browser sent), so the
 *    backend refuses guest sign-in here. When `KAS_API_ORIGIN` is set at run time the
 *    request is proxied to it from here; otherwise the build-time rewrite in
 *    next.config.ts still applies, so nothing changes for an image built the old way.
 *    A malformed origin answers 503 and an origin that leads back to the console 508,
 *    both as JSON, so a misconfiguration is visible instead of looping or silently
 *    using the build-time value.
 *
 * 3. With `KAS_CONSOLE_ONLY=true` (the console host), the guest pages built into
 *    this app (`/en`, `/vi`, …) are not served: they answer 404 and `/` opens the
 *    admin sign-in. Guests use the website host. Without the flag (local Next dev on
 *    3010) everything behaves as before.
 *
 * Nothing here decides access to data: the backend guards every call and the
 * layouts check the session.
 */

const SURFACE_HEADER = 'x-kas-surface';
const SURFACE_VALUE = 'console';
const API_PREFIX = '/api/v1';

/* Dynamic lookups are never inlined at build time, so these are read when the
   server runs (Next.js environment variables guide). */
function runtimeEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

export function consoleOnly(): boolean {
  return /^(1|true|yes)$/i.test(runtimeEnv('KAS_CONSOLE_ONLY'));
}

/* Marks a request this proxy forwarded. If it ever comes back here (KAS_API_ORIGIN
   pointing at the console itself, or at something that forwards to the console), the
   loop is cut at the first return instead of piling up requests. */
const HOP_HEADER = 'x-kas-console-proxy';

export type RuntimeOrigin =
  | { readonly kind: 'unset' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'ok'; readonly url: URL };

/**
 * `KAS_API_ORIGIN` read at run time. Unset keeps the build-time rewrite (old images,
 * local dev). A set but unusable value is an error the operator must see, never a
 * silent fall back to whatever was baked in at build time.
 */
export function runtimeApiOrigin(): RuntimeOrigin {
  const value = runtimeEnv('KAS_API_ORIGIN');
  if (!value) return { kind: 'unset' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'invalid', reason: 'not an absolute URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'invalid', reason: 'only http(s) is allowed' };
  }
  if (url.username || url.password) return { kind: 'invalid', reason: 'credentials are not allowed' };
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    return { kind: 'invalid', reason: 'expected scheme://host[:port] without a path' };
  }
  return { kind: 'ok', url };
}

/* The project keeps console logging out of frontend source (guards.test.ts); the
   machine-readable code in the JSON body and the status are what operators see. */
function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status, headers: { 'cache-control': 'no-store' } });
}

function isConsolePath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
    || pathname === '/partner' || pathname.startsWith('/partner/');
}

function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

/* public/ files (fonts, icons) and other files with an extension. */
function isStaticFile(pathname: string): boolean {
  return /\/[^/]+\.[A-Za-z0-9]+$/.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isApiPath(pathname)) {
    if (request.headers.get(HOP_HEADER)) {
      return apiError(508, 'API_ORIGIN_LOOP', 'KAS_API_ORIGIN leads back to the console.');
    }
    const headers = new Headers(request.headers);
    headers.set(SURFACE_HEADER, SURFACE_VALUE);
    const origin = runtimeApiOrigin();
    if (origin.kind === 'invalid') {
      return apiError(503, 'API_ORIGIN_INVALID', `KAS_API_ORIGIN is invalid: ${origin.reason}.`);
    }
    if (origin.kind === 'ok') {
      if (origin.url.host === request.nextUrl.host) {
        return apiError(508, 'API_ORIGIN_LOOP', 'KAS_API_ORIGIN points at the console itself.');
      }
      headers.set(HOP_HEADER, '1');
      return NextResponse.rewrite(new URL(pathname + search, origin.url), { request: { headers } });
    }
    return NextResponse.next({ request: { headers } });
  }

  if (isConsolePath(pathname)) {
    const headers = new Headers(request.headers);
    headers.set('x-kas-path', pathname + search);
    return NextResponse.next({ request: { headers } });
  }

  if (consoleOnly() && !isStaticFile(pathname)) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
    });
  }

  return NextResponse.next();
}

export const config = {
  /* Everything except Next.js' own assets; static files are let through above. */
  matcher: ['/((?!_next/static|_next/image|_next/data).*)'],
};
