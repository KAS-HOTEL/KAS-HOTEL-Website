/**
 * CSRF token priming.
 *
 * <h2>Why this exists — verified, not assumed</h2>
 *
 * Spring Security is configured with `CookieCsrfTokenRepository.withHttpOnlyFalse()`
 * and **login is not exempt**. Verified against the running backend:
 *
 * ```
 * POST /api/v1/public/auth/login  (no X-XSRF-TOKEN)  -> 403 FORBIDDEN
 * POST /api/v1/public/auth/login  (with token)       -> 401 (credentials rejected)
 * ```
 *
 * The `XSRF-TOKEN` cookie is written by `CsrfCookieFilter`, which only runs when a
 * request reaches Spring. A Next.js page render does not, so on a first visit to
 * `/partner/login` the browser holds no token and the very first login attempt
 * would 403 — a bug that looks like "wrong password" to the user.
 *
 * So the token is primed with one cheap public GET before the first mutation.
 */

const CSRF_COOKIE = 'XSRF-TOKEN';

/**
 * A public, side-effect-free endpoint that passes through the Spring filter
 * chain. `GET /public/properties` is unauthenticated and returns the published
 * property list, so priming costs one cheap query and reveals nothing.
 */
const PRIMING_PATH = '/api/v1/public/properties';

/**
 * Reads the token Spring wrote. Null when it has not been issued yet.
 *
 * <h2>Why this is not a regex any more</h2>
 *
 * It was, and the regex was silently wrong. It was assembled in a template
 * literal — `` `(?:^|;\s*)${CSRF_COOKIE}=([^;]*)` `` — and `\s` is not an
 * escape sequence JavaScript recognises in a string, so it collapsed to the
 * literal letter `s` before `RegExp` ever saw it. The pattern that actually
 * compiled was `(?:^|;s*)XSRF-TOKEN=…`, which matches a semicolon followed by
 * some number of the letter s.
 *
 * <p>Browsers serialise `document.cookie` as `a=1; b=2` — semicolon *space*.
 * So the only branch that ever matched was `^`: the token was readable when
 * `XSRF-TOKEN` happened to be the first cookie, and invisible otherwise. After
 * signing in it generally is not first, and the failure that produced is
 * exactly the one that gets reported as flakiness: `ensureCsrfToken` finds
 * nothing, spends a priming GET, still reads nothing, sends the mutation with
 * no `X-XSRF-TOKEN`, and Spring answers 403. Same click, different outcome,
 * depending on cookie order.
 *
 * <p>Parsing the string directly removes the class of bug rather than the
 * instance: there is no pattern left to mis-escape, and `; ` is handled by
 * trimming the part rather than by matching whitespace.
 */
export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== CSRF_COOKIE) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    // An empty cookie is not a token: the caller must prime rather than send
    // an `X-XSRF-TOKEN: ` header that Spring will reject anyway.
    return value === '' ? null : decodeURIComponent(value);
  }
  return null;
}

let priming: Promise<void> | null = null;

/**
 * Ensures a CSRF token exists before a mutating request.
 *
 * Single-flight: several forms submitting at once share one priming request
 * rather than each firing their own.
 */
export async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfToken();
  if (existing) {
    return existing;
  }

  priming ??= (async () => {
    try {
      // Deliberately the bare fetch rather than the API client: the client calls
      // back into this module before mutations, and priming must not recurse.
      await fetch(PRIMING_PATH, { method: 'GET', credentials: 'include', cache: 'no-store' });
    } catch {
      // Offline or the proxy is down. The caller's own request will fail with a
      // real error; swallowing here avoids replacing that with a priming error.
    } finally {
      priming = null;
    }
  })();

  await priming;
  return readCsrfToken();
}
