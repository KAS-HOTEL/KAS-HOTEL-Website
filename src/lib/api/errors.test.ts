import { describe, expect, it } from 'vitest';
import { ApiError, toApiError } from './errors';

/**
 * The error mapper is the one piece of client logic every screen depends on:
 * it decides whether a failure reads as "sign in", "not permitted", "not found"
 * or "someone else changed this". Getting it wrong is not cosmetic — showing a
 * 404 as "forbidden" would disclose that another partner's record exists, which
 * is exactly what doc 85 §6.3 returns 404 to prevent.
 */
describe('toApiError', () => {
  function response(status: number, body: unknown, correlationId?: string): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: correlationId
        ? { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId }
        : { 'Content-Type': 'application/json' },
    });
  }

  it('maps a doc 58 §2 error body', async () => {
    const error = await toApiError(
      response(404, {
        code: 'NOT_FOUND',
        message: 'Property not found',
        details: [],
        correlationId: 'abc-123',
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.isNotFound).toBe(true);
    expect(error.isForbidden).toBe(false);
    expect(error.correlationId).toBe('abc-123');
  });

  it('keeps 401 and 403 distinct', async () => {
    const unauthenticated = await toApiError(
      response(401, { code: 'UNAUTHENTICATED', message: 'Authentication is required.' }),
    );
    const forbidden = await toApiError(
      response(403, { code: 'FORBIDDEN', message: 'You do not have permission.' }),
    );

    expect(unauthenticated.isUnauthenticated).toBe(true);
    expect(unauthenticated.isForbidden).toBe(false);
    expect(forbidden.isForbidden).toBe(true);
    expect(forbidden.isUnauthenticated).toBe(false);
  });

  it('exposes 422 details as field errors for forms', async () => {
    const error = await toApiError(
      response(422, {
        code: 'NO_AVAILABILITY',
        message: 'This change would oversell 1 date.',
        details: [{ field: '2026-09-12', code: 'WOULD_OVERSELL', message: 'Short by 2.' }],
        correlationId: null,
      }),
    );

    expect(error.isUnprocessable).toBe(true);
    expect(error.fieldErrors()).toEqual({ '2026-09-12': 'Short by 2.' });
  });

  it('survives a non-JSON failure without leaking the body', async () => {
    const proxyFailure = new Response('<html>502 Bad Gateway</html>', { status: 502 });

    const error = await toApiError(proxyFailure);

    // A proxy or upstream never reaches GlobalExceptionHandler, so the body is
    // not doc 58-shaped. It must still become an ApiError, and the raw body must
    // never be surfaced.
    expect(error.status).toBe(502);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).not.toContain('502 Bad Gateway');
  });

  it('takes the correlation id from the header when the body omits it', async () => {
    const error = await toApiError(
      response(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' }, 'hdr-9'),
    );

    expect(error.correlationId).toBe('hdr-9');
  });
});
