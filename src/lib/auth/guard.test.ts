import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './guard';

/**
 * `returnTo` is attacker-controlled: it arrives in the query string of a public
 * sign-in page. An unvalidated one turns login into an open redirect — the
 * classic credential-harvesting hop.
 */
describe('safeReturnTo', () => {
  it('accepts a same-origin absolute path', () => {
    expect(safeReturnTo('/partner/properties', '/partner')).toBe('/partner/properties');
  });

  it('rejects an absolute URL to another origin', () => {
    expect(safeReturnTo('https://evil.example/harvest', '/partner')).toBe('/partner');
  });

  it('rejects a protocol-relative URL, which the browser treats as external', () => {
    expect(safeReturnTo('//evil.example', '/partner')).toBe('/partner');
  });

  it('rejects a relative path that could escape the route group', () => {
    expect(safeReturnTo('../admin', '/partner')).toBe('/partner');
  });

  it('falls back when absent', () => {
    expect(safeReturnTo(undefined, '/partner')).toBe('/partner');
  });
});
