import { ApiError } from './errors';

/**
 * Single-flight access-token refresh.
 *
 * <h2>The problem this solves</h2>
 *
 * When an access token expires, every in-flight request fails with 401 at once —
 * a dashboard issuing six parallel reads produces six 401s. Refreshing per
 * failure would fire six concurrent `POST /refresh` calls against a
 * <strong>rotating</strong> refresh token: the first rotates it, and the other
 * five present a token that no longer exists, so they fail and log the user out
 * of a session that was perfectly valid.
 *
 * So all concurrent 401s await one shared promise.
 *
 * <h2>Loop safety</h2>
 *
 * <ul>
 *   <li>A request is retried <strong>at most once</strong>.</li>
 *   <li>The auth endpoints themselves are never refreshed — a 401 from
 *       {@code /login} means the credentials were wrong, and refreshing would be
 *       nonsense; a 401 from {@code /refresh} is the refresh failing, and
 *       refreshing again is the loop.</li>
 *   <li>A failed refresh is not cached: the next 401 may legitimately try again
 *       once the user has signed in afresh.</li>
 * </ul>
 */

/** Paths that must never trigger a refresh. */
const AUTH_PATHS = ['/api/v1/public/auth/login', '/api/v1/public/auth/refresh',
  '/api/v1/public/auth/logout'];

export function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((authPath) => path.startsWith(authPath));
}

let inFlight: Promise<boolean> | null = null;

/**
 * Refreshes the session, coalescing concurrent callers.
 *
 * @param refreshCall performs the actual `POST /api/v1/public/auth/refresh`
 * @returns true when the session was renewed
 */
export function refreshOnce(refreshCall: () => Promise<void>): Promise<boolean> {
  inFlight ??= (async () => {
    try {
      await refreshCall();
      return true;
    } catch (error) {
      // A 401 here means the refresh token is gone or rotated away — the session
      // is genuinely over. Anything else (network, 5xx) is also not a renewal.
      if (error instanceof ApiError || error instanceof Error) {
        return false;
      }
      return false;
    } finally {
      // Cleared either way. Caching a failure would prevent a legitimate retry
      // after the user signs in again in another tab.
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test seam — resets the shared promise between cases. */
export function resetRefreshState(): void {
  inFlight = null;
}
