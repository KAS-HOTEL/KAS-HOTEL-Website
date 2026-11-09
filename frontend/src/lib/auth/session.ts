import { cache } from 'react';
import type { ConsoleRole } from '@/lib/domain/session';
import { cookies } from 'next/headers';
import { ApiError } from '../api/errors';
import { sessionApi } from '../api/endpoints';

/**
 * The server-side authentication boundary.
 *
 * <h2>Why signed-in state is a request, not a cookie read</h2>
 *
 * The session cookies are `HttpOnly`. Neither the browser nor a Server
 * Component can inspect them meaningfully — their presence proves nothing, since
 * an expired or revoked token is still a cookie. So "am I signed in?" is
 * answered by asking the backend, which is also the only party that can
 * revoke a session (doc 90: revocation is genuine and server-side).
 *
 * `GET /api/v1/me/sessions` is the authentication probe: it requires an active
 * session and returns only the caller's own sessions. Feature data is loaded
 * from its own owner-scoped `/me` endpoints after this navigation check.
 *
 * <h2>What this deliberately does not do</h2>
 *
 * It does not decide what the caller may do. Doc 59 §7.1 is deny-by-default and
 * the backend enforces every permission and scope; a route guard here is a
 * <em>navigation</em> convenience so a signed-out visitor sees a sign-in page
 * instead of an error. Any check here that the backend did not also make would
 * be decoration, and treating it as security would be the mistake the brief
 * warns against: "Do not infer permissions solely from frontend navigation."
 */

export type SessionState =
  | { readonly status: 'authenticated'; readonly sessionCount: number }
  | { readonly status: 'anonymous' }
  | { readonly status: 'unavailable'; readonly correlationId: string | null };

/**
 * Resolves the caller's session from a Server Component or Route Handler.
 *
 * Distinguishes "not signed in" from "the backend could not answer". Rendering
 * a sign-in page because the API was down would tell the user something false,
 * and quietly log them out of a session that is still valid.
 */
export async function resolveSession(): Promise<SessionState> {
  const cookieHeader = (await cookies()).toString();

  try {
    const sessions = await sessionApi.list(cookieHeader);
    return { status: 'authenticated', sessionCount: sessions.length };
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) {
      return { status: 'anonymous' };
    }
    if (error instanceof ApiError) {
      return { status: 'unavailable', correlationId: error.correlationId };
    }
    return { status: 'unavailable', correlationId: null };
  }
}

/**
 * The console for this session, or null when the backend could not say.
 *
 * Memoised per request: a layout and a page guard often ask in the same render.
 */
export const resolveConsole = cache(async (): Promise<ConsoleRole | null> => {
  try {
    return (await sessionApi.console((await cookies()).toString())).console;
  } catch {
    return null;
  }
});

export async function isAuthenticated(): Promise<boolean> {
  return (await resolveSession()).status === 'authenticated';
}
