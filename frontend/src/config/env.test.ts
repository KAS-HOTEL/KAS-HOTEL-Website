import { describe, expect, it } from 'vitest';
import { isSupportedLocale, SUPPORTED_LOCALES } from './env';

describe('locale configuration', () => {
  it('accepts exactly the two frozen locales — doc 25', () => {
    expect([...SUPPORTED_LOCALES]).toEqual(['en', 'vi']);
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('vi')).toBe(true);
  });

  it('rejects anything else, so an unknown prefix 404s rather than rendering', () => {
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale('admin')).toBe(false);
  });
});
