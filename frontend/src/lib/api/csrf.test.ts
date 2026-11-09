// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readCsrfToken } from './csrf';

/**
 * Reading the CSRF cookie.
 *
 * These exist because the reader was wrong in a way no test could have caught
 * by accident: it worked when `XSRF-TOKEN` was the first cookie and returned
 * null otherwise, which is the state a signed-in browser is normally in. The
 * symptom was a 403 on a mutation that had worked a moment earlier.
 */

function setCookies(raw: string): void {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => raw,
  });
}

afterEach(() => {
  setCookies('');
});

describe('readCsrfToken', () => {
  it('reads the token when it is the only cookie', () => {
    setCookies('XSRF-TOKEN=abc123');
    expect(readCsrfToken()).toBe('abc123');
  });

  it('reads the token when it is not the first cookie', () => {
    // The regression. `document.cookie` separates with "; ", and the old
    // pattern required ";XSRF-TOKEN" with no space, so once a session cookie
    // was set ahead of it the token became invisible and every mutation went
    // out without its header.
    setCookies('kas_at=eyJhbGciOi; kas_rt=eyJhbGciOi; XSRF-TOKEN=abc123');
    expect(readCsrfToken()).toBe('abc123');
  });

  it('reads the token from the middle of the jar', () => {
    setCookies('a=1; XSRF-TOKEN=abc123; b=2');
    expect(readCsrfToken()).toBe('abc123');
  });

  it('does not match a cookie whose name merely ends with the token name', () => {
    setCookies('NOT-XSRF-TOKEN=wrong; XSRF-TOKEN=right');
    expect(readCsrfToken()).toBe('right');
  });

  it('does not match a cookie whose name merely starts with it', () => {
    setCookies('XSRF-TOKEN-OLD=wrong; XSRF-TOKEN=right');
    expect(readCsrfToken()).toBe('right');
  });

  it('decodes a percent-encoded value', () => {
    setCookies('XSRF-TOKEN=a%2Bb%3Dc');
    expect(readCsrfToken()).toBe('a+b=c');
  });

  it('treats an empty cookie as no token, so the caller primes instead', () => {
    setCookies('XSRF-TOKEN=; other=1');
    expect(readCsrfToken()).toBeNull();
  });

  it('returns null when the cookie is absent', () => {
    setCookies('kas_at=eyJhbGciOi; other=1');
    expect(readCsrfToken()).toBeNull();
  });

  it('returns null for an empty jar', () => {
    setCookies('');
    expect(readCsrfToken()).toBeNull();
  });
});
