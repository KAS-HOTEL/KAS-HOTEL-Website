'use strict';
/* Customer website API boundary (server separation, docs/kas/156).

   The public website forwards only the customer API to Spring Boot:
     /api/v1/public/**  (catalogue, quotes, booking requests, sign-in, password reset)
     /api/v1/me/**      (the signed-in guest's own profile, stays, saved hotels)
   Everything else under /api/v1 - above all /api/v1/admin/** - is answered here with
   a JSON 404 and never reaches the backend. Staff use the console host for that.

   It is an allowlist on the raw request path, checked before any decoding the
   backend might do, so encoded slashes or dots, dot segments, backslashes, matrix
   parameters (;) and double slashes cannot smuggle an admin path past it. */

const ALLOWED_PREFIXES = ['/api/v1/public', '/api/v1/me'];

/* Header the proxy sets (overwriting anything the browser sent) so the backend knows
   the request came through the customer website: staff accounts cannot sign in here. */
const SURFACE_HEADER = 'x-kas-surface';
const SURFACE_VALUE = 'customer';

function rawPath(originalUrl) {
  const s = String(originalUrl || '');
  const q = s.search(/[?#]/);
  return q === -1 ? s : s.slice(0, q);
}

/* True when the path may be forwarded to the backend from the customer website. */
function isCustomerApiPath(originalUrl) {
  const p = rawPath(originalUrl);
  if (!p.startsWith('/')) return false;
  /* Any percent-escape of a separator or dot, or of '%' itself (double encoding). */
  if (/%(2e|2f|5c|3b|25|00)/i.test(p)) return false;
  if (p.indexOf('\\') !== -1 || p.indexOf(';') !== -1 || p.indexOf('//') !== -1) return false;
  if (/(^|\/)\.\.?(\/|$)/.test(p)) return false;
  return ALLOWED_PREFIXES.some(function (prefix) {
    return p === prefix || p.startsWith(prefix + '/');
  });
}

module.exports = { isCustomerApiPath, SURFACE_HEADER, SURFACE_VALUE, ALLOWED_PREFIXES };
