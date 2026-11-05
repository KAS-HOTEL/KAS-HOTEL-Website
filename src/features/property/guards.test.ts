import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guards over the frontend source.
 *
 * The backend has ArchUnit for exactly this job — rules that no reviewer should
 * have to remember and no future step should be able to quietly break. These are
 * the frontend equivalent: they read the shipped source and fail the build, not
 * a checklist someone signs.
 *
 * Test files are excluded throughout. A fixture may legitimately mention a real
 * slug or call `fetch`; product code may not.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url));

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function productSources(): readonly SourceFile[] {
  const files: SourceFile[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) {
        continue;
      }
      files.push({
        path: full.replace(SRC, '').replace(/\\/g, '/'),
        text: withoutComments(readFileSync(full, 'utf8')),
      });
    }
  };

  walk(SRC);
  return files;
}

/**
 * Strips comments before scanning.
 *
 * These guards are about what the code *does*. Several modules explain in their
 * documentation precisely why they do not touch `localStorage` or add CORS, and
 * a guard that failed on the explanation would push authors towards removing the
 * reasoning rather than keeping the rule.
 *
 * `//` is only treated as a line comment at the start of a line or after
 * whitespace, so the `//` in a `https://` URL survives.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

const SOURCES = productSources();

function offenders(pattern: RegExp, allow: (file: SourceFile) => boolean = () => false): string[] {
  return SOURCES.filter((file) => !allow(file) && pattern.test(file.text)).map((file) => file.path);
}

describe('frontend source guards', () => {
  it('finds source files to check', () => {
    // A silent zero would make every assertion below vacuously true.
    expect(SOURCES.length).toBeGreaterThan(20);
  });

  it('never names a seed property', () => {
    // The eight KAS hotels are rows in a database, not constants in a bundle.
    // Any `kas-…-hotel` slug in shipped code means a screen has stopped asking
    // the backend which properties exist.
    expect(offenders(/kas-[a-z0-9]+(?:-[a-z0-9]+)*-hotel/i)).toEqual([]);
  });

  it('never assumes how many properties a partner has', () => {
    // `=== 0` and `=== 1` are real cases — an empty scope, and the single
    // property that renders as a label instead of a dropdown. A comparison
    // against 2 or more is a portfolio size, and the only honest source of that
    // is the backend's scope query.
    expect(offenders(/propert\w*(?:\.length)?\s*[=!<>]==?\s*(?:[2-9]|\d{2,})/i)).toEqual([]);
    expect(offenders(/\.length\s*[=!<>]==?\s*(?:[2-9]|\d{2,})/)).toEqual([]);
    expect(offenders(/slice\(\s*0\s*,\s*[2-9]\s*\)/)).toEqual([]);
  });

  it('calls fetch only from the API client', () => {
    // Enforced by ESLint too; asserted here so the rule cannot be disabled in a
    // file without a test going red.
    expect(offenders(/(?<![.\w])fetch\s*\(/, (file) => file.path.startsWith('lib/api/'))).toEqual([]);
  });

  it('puts no session or property state in web storage', () => {
    expect(offenders(/\b(?:localStorage|sessionStorage|indexedDB)\b/)).toEqual([]);
  });

  it('never sets an Authorization header', () => {
    // The session travels as HttpOnly cookies. Anything building this header
    // would need a token, and there is deliberately no way to obtain one.
    expect(offenders(/['"`]Authorization['"`]/i)).toEqual([]);
  });

  it('logs nothing to the console', () => {
    expect(offenders(/\bconsole\.(?:log|info|warn|error|debug|table|dir)\s*\(/)).toEqual([]);
  });

  it('shows an operator no release numbers', () => {
    // "Bước 10", "(Bước 9)" and friends were captions on nav items and tabs that
    // had not been built yet. They are notes to the people writing the product:
    // a hotel operator cannot act on one, and a disabled control already says
    // the screen is not ready. Comments are stripped before this scan, so
    // explaining the rule — as this file does — does not trip it.
    expect(offenders(/B\u01b0\u1edbc\s*\d/)).toEqual([]);
  });

  it('does not weaken the backend’s CORS, cookie or CSRF decisions', () => {
    // Comments explaining why these are not done are fine; code doing them is not.
    expect(offenders(/Access-Control-Allow-Origin/i)).toEqual([]);
    expect(offenders(/sameSite\s*[:=]\s*['"`]none['"`]/i)).toEqual([]);
    expect(offenders(/credentials\s*[:=]\s*['"`]omit['"`]/i)).toEqual([]);
  });
});
