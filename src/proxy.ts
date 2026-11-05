import { NextResponse, type NextRequest } from 'next/server';

/**
 * Passes the requested console path to server components as `x-kas-path`.
 *
 * Layouts cannot read the URL, so when a session needed renewing the sign-in
 * page could only send people back to the console's home. With the path, a
 * renewed session lands on the page that was asked for. Nothing here decides
 * access: the backend guards every call and the layouts check the session.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-kas-path', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/admin/:path*', '/partner/:path*'],
};
