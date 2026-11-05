/**
 * Environment access, in one place and validated once.
 *
 * Nothing else reads `process.env`. A typo in a variable name then fails here,
 * loudly and at first use, rather than silently becoming `undefined` inside a
 * request handler.
 */

/** The backend origin. Server-side only — see next.config.ts for why. */
export function apiOrigin(): string {
  const value = process.env.KAS_API_ORIGIN ?? 'http://localhost:8080';
  if (!/^https?:\/\//.test(value)) {
    throw new Error(`KAS_API_ORIGIN must be an absolute http(s) origin, got: ${value}`);
  }
  return value.replace(/\/$/, '');
}

/**
 * Routing fallback only.
 *
 * The business value is `DEFAULT_LOCALE` (config A11 / OQ-065) and it is still
 * NULL in the backend. This does not stand in for it: it decides which URL an
 * unprefixed request redirects to, nothing more.
 */
export const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en';

/** Doc 25 — the two frozen locales. */
export const SUPPORTED_LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
