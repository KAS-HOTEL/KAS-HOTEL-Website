import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { AUTH_MESSAGES, messageFor, signInMessageFor } from './messages';

function error(status: number, code: string, message = 'backend message'): ApiError {
  return new ApiError(status, { code, message, details: [], correlationId: null });
}

describe('error mapping', () => {
  it('maps each frozen status to its own message', () => {
    expect(messageFor(error(401, 'UNAUTHENTICATED'))).toBe(AUTH_MESSAGES.expired);
    expect(messageFor(error(403, 'FORBIDDEN'))).toBe(AUTH_MESSAGES.forbidden);
    expect(messageFor(error(404, 'NOT_FOUND'))).toBe(AUTH_MESSAGES.notFound);
    expect(messageFor(error(409, 'VERSION_CONFLICT'))).toBe(AUTH_MESSAGES.conflict);
  });

  it('shows the backend text for 422, which is authored for the caller', () => {
    const domain = error(422, 'NO_AVAILABILITY', 'This change would oversell 3 dates.');
    expect(messageFor(domain)).toBe('This change would oversell 3 dates.');
  });

  it('never surfaces the backend message for a 5xx', () => {
    const internal = error(500, 'INTERNAL_ERROR', 'org.postgresql.util.PSQLException: relation …');
    expect(messageFor(internal)).toBe(AUTH_MESSAGES.unavailable);
    expect(messageFor(internal)).not.toContain('PSQLException');
  });

  it('distinguishes a rejected sign-in from an expired session', () => {
    // On a sign-in page "your session has ended" would be nonsense.
    expect(signInMessageFor(error(401, 'UNAUTHENTICATED'))).toBe(
      AUTH_MESSAGES.invalidCredentials,
    );
    expect(messageFor(error(401, 'UNAUTHENTICATED'))).toBe(AUTH_MESSAGES.expired);
  });

  it('does not rewrite 404 into a permission message', () => {
    // Doc 85 §6.3 returns 404 for another partner's records so their existence
    // is never disclosed. Softening it to 403 would undo that.
    expect(messageFor(error(404, 'NOT_FOUND'))).not.toBe(AUTH_MESSAGES.forbidden);
  });
});

describe('server separation sign-in (2026-11-07)', () => {
  it('tells a guest who signs in on the console to use the website', () => {
    const refused = new ApiError(403, {
      code: 'FORBIDDEN', message: 'Guest accounts sign in on the KAS website.',
      details: [{ field: 'account', code: 'USE_CUSTOMER_SITE', message: 'x' }], correlationId: null,
    });
    expect(signInMessageFor(refused)).toBe('Đây là tài khoản khách hàng. Vui lòng đăng nhập trên website KAS.');
  });

  it('keeps the generic forbidden message for other 403s', () => {
    expect(signInMessageFor(error(403, 'FORBIDDEN'))).toBe(AUTH_MESSAGES.forbidden);
  });
});
