import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/* The customer website's API allowlist (frontend/api-boundary.js, used by server.js). */
const require = createRequire(import.meta.url);
const boundary = require('../../api-boundary.js') as {
  isCustomerApiPath: (url: string) => boolean;
  SURFACE_HEADER: string;
  SURFACE_VALUE: string;
};

describe('customer website API boundary', () => {
  it.each([
    '/api/v1/public/properties/catalogue?locale=vi',
    '/api/v1/public/request-pricing/quote',
    '/api/v1/public/reservations/requests?locale=en',
    '/api/v1/public/auth/login',
    '/api/v1/public/auth/refresh',
    '/api/v1/public/auth/forgot-password',
    '/api/v1/me/profile',
    '/api/v1/me/favorites/kas-dilly-hotel',
    '/api/v1/me',
    '/api/v1/public',
  ])('forwards the customer API: %s', (url) => {
    expect(boundary.isCustomerApiPath(url)).toBe(true);
  });

  it.each([
    '/api/v1/admin',
    '/api/v1/admin/',
    '/api/v1/admin/properties',
    '/api/v1/admin/ops/reservations?x=1',
    '/API/V1/ADMIN/properties',
    '/api/v1/Admin/properties',
    '/api/v1/partner/anything',
    '/api/v1/internal',
    '/api/v1',
    '/api/v1/',
  ])('refuses everything outside the customer API: %s', (url) => {
    expect(boundary.isCustomerApiPath(url)).toBe(false);
  });

  it.each([
    '/api/v1/public/../admin/properties',
    '/api/v1/me/../admin',
    '/api/v1/public/./../admin',
    '/api/v1/public/%2e%2e/admin',
    '/api/v1/public/%2E%2E/admin',
    '/api/v1/public%2f..%2fadmin',
    '/api/v1/public/%252e%252e/admin',
    '/api/v1/public/..%5cadmin',
    '/api/v1/public\\..\\admin',
    '/api/v1/public;x=1/../admin',
    '/api/v1/public//../admin',
    '/api/v1/me/%00',
    '/api/v1/public/..',
  ])('cannot be bypassed with encoding or path tricks: %s', (url) => {
    expect(boundary.isCustomerApiPath(url)).toBe(false);
  });

  it('only looks at the path, not the query string', () => {
    expect(boundary.isCustomerApiPath('/api/v1/public/x?next=/api/v1/admin/../../%2e')).toBe(true);
    expect(boundary.isCustomerApiPath('/api/v1/admin?to=/api/v1/public')).toBe(false);
  });

  it('declares the customer surface header the backend reads', () => {
    expect(boundary.SURFACE_HEADER).toBe('x-kas-surface');
    expect(boundary.SURFACE_VALUE).toBe('customer');
  });
});
