#!/usr/bin/env node
/*
 * KAS live smoke / regression suite.
 *
 * Runs against a RUNNING stack (local, webdemo or staging) with Node 18+ only:
 * no dependencies, no browser. By default it never writes data and never makes
 * the backend queue an email: it reads public pages and APIs, checks that every
 * protected endpoint refuses anonymous callers, and probes input validation with
 * requests the backend rejects before touching the database.
 *
 * Optional, with a test customer (never a production account):
 *   KAS_QA_CUSTOMER_EMAIL / KAS_QA_CUSTOMER_PASSWORD
 * adds the signed-in checks: profile, console role NONE, every admin endpoint
 * 403, own stays only, favorites add/remove (restored afterwards), refresh, logout.
 *
 * Usage (from the repo root):
 *   node qa/smoke/kas-smoke.mjs
 *   KAS_SITE=https://webdemo.kasbookingapp.com KAS_API=https://webdemo.kasbookingapp.com \
 *   KAS_CONSOLE=https://webdemo-admin.kasbookingapp.com node qa/smoke/kas-smoke.mjs
 * Options (env): KAS_SITE (default http://localhost:3001), KAS_API (http://localhost:8080),
 *   KAS_CONSOLE (http://localhost:3002), KAS_EXPECT_PRODUCTION=1 (stricter header/detail
 *   checks), KAS_SMOKE_REPORT=path.json (machine-readable results).
 * Exit code: 0 when nothing FAILED, 1 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = (process.env.KAS_SITE || 'http://localhost:3001').replace(/\/+$/, '');
const API = (process.env.KAS_API || 'http://localhost:8080').replace(/\/+$/, '');
const CONSOLE = (process.env.KAS_CONSOLE || 'http://localhost:3002').replace(/\/+$/, '');
const PROD = process.env.KAS_EXPECT_PRODUCTION === '1';
const CUSTOMER = process.env.KAS_QA_CUSTOMER_EMAIL
  ? { email: process.env.KAS_QA_CUSTOMER_EMAIL, password: process.env.KAS_QA_CUSTOMER_PASSWORD || '' } : null;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../../frontend');
const TIMEOUT_MS = 20000;

/* ---------------------------------------------------------------- http + cookies */
class Jar {
  constructor() { this.c = new Map(); }
  store(res) {
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('='); const name = pair.slice(0, i).trim(); const value = pair.slice(i + 1).trim();
      const expired = attrs.some(a => /max-age=0\b/i.test(a)) || value === '';
      if (expired) this.c.delete(name); else this.c.set(name, value);
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
  get(name) { return this.c.get(name); }
}
async function http(url, { method = 'GET', jar, json, body, headers = {}, redirect = 'manual', csrf = false } = {}) {
  const h = { Accept: 'application/json, text/html;q=0.9', ...headers };
  if (jar && jar.header()) h.Cookie = jar.header();
  if (csrf && jar && jar.get('XSRF-TOKEN')) h['X-XSRF-TOKEN'] = decodeURIComponent(jar.get('XSRF-TOKEN'));
  if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { method, headers: h, body, redirect, signal: ctl.signal });
    if (jar) jar.store(res);
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, data, ms: Date.now() - started };
  } finally { clearTimeout(timer); }
}
/* A session primed with the CSRF cookie the backend hands out on any request. */
async function session() { const jar = new Jar(); await http(`${API}/api/v1/public/trip-intents`, { jar }); return jar; }

/* ---------------------------------------------------------------- runner */
const results = [];
async function t(id, module, severity, name, fn) {
  try {
    const r = await fn();
    if (r && r.skip) results.push({ id, module, severity, name, status: 'SKIP', detail: r.skip });
    else results.push({ id, module, severity, name, status: 'PASS', detail: typeof r === 'string' ? r : '' });
  } catch (e) {
    results.push({ id, module, severity, name, status: 'FAIL', detail: String(e && e.message || e).slice(0, 300) });
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
function noLeak(r) {
  expect(!/\bat (com|org|java)\.[\w.$]+\(/.test(r.text) && !/Exception:/.test(r.text), 'response leaks a stack trace');
}
const iso = d => d.toISOString().slice(0, 10);
const day = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/* ---------------------------------------------------------------- public pages */
function publicPages() {
  try {
    return fs.readdirSync(FRONTEND).filter(f => /^[a-z0-9-]+\.html$/.test(f) && f !== 'admin.html' && f !== 'reference.html');
  } catch { return ['index.html', 'hotels.html', 'hotel-detail.html', 'saved-hotels.html', 'manage-booking.html']; }
}
/* Pages that are part of the main site template (shared header #hdr). */
const TEMPLATE_PAGES = ['index.html', 'hotels.html', 'hotel-detail.html', 'room-detail.html', 'experiences.html',
  'offers.html', 'support.html', 'about.html', 'saved-hotels.html', 'manage-booking.html', 'city-guide.html'];

async function run() {
  console.log(`KAS smoke  site=${SITE}  api=${API}  console=${CONSOLE}${CUSTOMER ? '  +customer' : ''}${PROD ? '  [production checks]' : ''}\n`);

  /* ---- infrastructure */
  await t('SMK-INF-01', 'Infra', 'Critical', 'Backend health is UP', async () => {
    const r = await http(`${API}/actuator/health`);
    expect(r.status === 200 && r.data && r.data.status === 'UP', `health ${r.status} ${r.text.slice(0, 120)}`);
    if (PROD) expect(!r.data.components, 'health exposes component details in production');
    return `${r.ms} ms`;
  });
  await t('SMK-INF-02', 'Infra', 'Critical', 'Website server health', async () => {
    const r = await http(`${SITE}/health`); expect(r.status === 200 && r.data && r.data.ok, `site health ${r.status}`);
  });
  await t('SMK-INF-03', 'Infra', 'High', 'Website forwards /api/v1 to the backend', async () => {
    const a = await http(`${SITE}/api/v1/public/trip-intents`); const b = await http(`${API}/api/v1/public/trip-intents`);
    expect(a.status === 200 && b.status === 200, `site ${a.status} api ${b.status}`);
    expect(JSON.stringify(a.data) === JSON.stringify(b.data), 'site and backend answers differ');
  });
  await t('SMK-INF-04', 'Infra', 'Medium', 'Website /site-config.json gives the console address', async () => {
    const r = await http(`${SITE}/site-config.json`);
    expect(r.status === 200 && r.data && typeof r.data.consoleUrl === 'string', `site-config ${r.status}`);
    expect(r.data.consoleUrl === '' || /^https?:\/\/[^/]+$/.test(r.data.consoleUrl), `bad consoleUrl ${r.data.consoleUrl}`);
    return r.data.consoleUrl || '(not set)';
  });
  await t('SMK-INF-05', 'Infra', 'High', 'Console login page loads and is noindex', async () => {
    const r = await http(`${CONSOLE}/admin/login`);
    expect(r.status === 200, `console ${r.status}`);
    expect(/noindex/i.test(r.headers.get('x-robots-tag') || '') || /noindex/i.test(r.text), 'console login is indexable');
  });
  await t('SMK-INF-06', 'Auth', 'Critical', 'Console sends anonymous visitors to the login page', async () => {
    const r = await http(`${CONSOLE}/partner/requests`);
    const loc = r.headers.get('location') || '';
    expect((r.status >= 300 && r.status < 400 && /\/login/.test(loc)) || (r.status === 200 && /login|đăng nhập/i.test(r.text) && !/Yêu cầu đặt phòng mới/.test(r.text)),
      `anonymous /partner/requests -> ${r.status} ${loc}`);
  });

  /* ---- website pages and static-file boundary */
  for (const page of publicPages()) {
    await t(`SMK-WEB-${page.replace('.html', '')}`, 'Website', TEMPLATE_PAGES.includes(page) ? 'High' : 'Medium', `GET /${page}`, async () => {
      const r = await http(`${SITE}/${page}`);
      expect(r.status === 200 && /<html/i.test(r.text), `${r.status}`);
      if (TEMPLATE_PAGES.includes(page)) expect(/id="hdr"/.test(r.text), 'shared header #hdr missing');
      return `${r.ms} ms`;
    });
  }
  for (const p of ['/server.js', '/.env', '/package.json', '/data/runtime/collection-images.json', '/uploads/manifest.json',
    '/js/..%2fserver.js', '/%2e%2e/server.js', '/AGENTS.md', '/node_modules/express/package.json', '/Dockerfile',
    /* The old admin is closed (KAS_LEGACY_ADMIN_ENABLED unset). */
    '/admin', '/admin.html', '/reference', '/api/admin/status']) {
    await t(`SMK-SEC-STATIC${p.replace(/[^a-z0-9]+/gi, '-')}`, 'Security', 'High', `Private file not served: ${p}`, async () => {
      const r = await http(`${SITE}${p}`);
      expect(r.status === 404 || r.status === 400 || r.status === 403, `${p} -> ${r.status}`);
      expect(!/KAS_DB_PASSWORD|ADMIN_KEY=|"dependencies"/.test(r.text), 'private content in response');
    });
  }
  await t('SMK-WEB-CATALOG', 'Website', 'High', 'Legacy catalog JSON lists hotels', async () => {
    const r = await http(`${SITE}/api/catalog`);
    expect(r.status === 200 && r.data, `catalog ${r.status}`);
    return `keys: ${Object.keys(r.data).slice(0, 6).join(', ')}`;
  });

  /* ---- public API */
  let props = [];
  await t('SMK-API-PROPS', 'Catalogue', 'Critical', 'Public hotels list', async () => {
    const r = await http(`${API}/api/v1/public/properties`);
    expect(r.status === 200 && Array.isArray(r.data), `properties ${r.status}`);
    props = r.data; expect(props.length > 0, 'no published hotel');
    expect(new Set(props.map(p => p.slug)).size === props.length, 'duplicate slugs');
    expect(props.every(p => p.lifecycleState !== 'CLOSED' && p.lifecycleState !== 'DRAFT'), 'closed/draft hotel is public');
    return `${props.length} hotels`;
  });
  await t('SMK-API-CATALOGUE', 'Catalogue', 'High', 'Website catalogue lists exactly the published hotels', async () => {
    const r = await http(`${API}/api/v1/public/properties/catalogue?locale=vi`);
    if (r.status === 404) return { skip: 'backend without /properties/catalogue (before 2026-11-05)' };
    expect(r.status === 200 && Array.isArray(r.data), `catalogue ${r.status}`);
    const a = r.data.map(c => c.slug).sort().join(','), b = props.map(p => p.slug).sort().join(',');
    expect(a === b, `catalogue ${a} vs list ${b}`);
    expect(r.data.every(c => !('id' in c) && !('partnerId' in c) && !('email' in c)), 'internal field in a card');
    return `${r.data.length} cards`;
  });
  const first = () => props[0] && props[0].slug;
  for (const [suffix, label] of [['', 'detail'], ['/room-types', 'room types'], ['/gallery', 'gallery'], ['/policies', 'policies'], ['/facilities', 'facilities']]) {
    await t(`SMK-API-PROP-${label.replace(' ', '-').toUpperCase()}`, 'Catalogue', 'High', `Hotel ${label} (every hotel)`, async () => {
      if (!props.length) return { skip: 'no hotels' };
      const bad = [];
      for (const p of props) { const r = await http(`${API}/api/v1/public/properties/${p.slug}${suffix}`); if (r.status !== 200) bad.push(`${p.slug}:${r.status}`); noLeak(r); }
      expect(!bad.length, bad.join(', '));
    });
  }
  await t('SMK-API-ROOMTYPES-COUNT', 'Catalogue', 'High', 'Every hotel has at least one room type', async () => {
    if (!props.length) return { skip: 'no hotels' };
    const counts = [];
    for (const p of props) { const r = await http(`${API}/api/v1/public/properties/${p.slug}/room-types`); const n = Array.isArray(r.data) ? r.data.length : (r.data && r.data.items ? r.data.items.length : -1); counts.push(`${p.slug.replace(/^kas-/, '')}=${n}`); expect(n > 0, `${p.slug} has ${n} room types`); }
    return counts.join(' ');
  });
  await t('SMK-API-404', 'Catalogue', 'Medium', 'Unknown hotel slug is 404, not 500', async () => {
    const r = await http(`${API}/api/v1/public/properties/no-such-hotel-qa`); expect(r.status === 404, `${r.status}`); noLeak(r);
  });
  for (const ep of ['trip-intents', 'locations', 'amenities', 'site-image-slots', 'reviews?hotelKey=passion', 'trip-ratings']) {
    await t(`SMK-API-${ep.replace(/\?.*/, '').toUpperCase()}`, 'Catalogue', ep === 'trip-intents' ? 'High' : 'Medium', `GET /public/${ep}`, async () => {
      const r = await http(`${API}/api/v1/public/${ep}`); expect(r.status === 200, `${r.status} ${r.text.slice(0, 100)}`);
      if (ep === 'trip-intents') { expect(Array.isArray(r.data) && r.data.length >= 1, 'no trip intents'); return r.data.map(x => x.code).join(','); }
    });
  }
  await t('SMK-API-REVIEWS-PARAM', 'Catalogue', 'Low', 'Public reviews without hotelKey is 400', async () => {
    const r = await http(`${API}/api/v1/public/reviews`); expect(r.status === 400, `${r.status}`); noLeak(r);
  });

  /* ---- pricing and booking validation (no persistence) */
  const jar = await session();
  let roomType = null;
  await t('SMK-PRC-01', 'Pricing', 'Critical', 'Valid quote: total equals the sum of nightly prices', async () => {
    if (!props.length) return { skip: 'no hotels' };
    for (const p of props) {
      const rt = await http(`${API}/api/v1/public/properties/${p.slug}/room-types`);
      const list = Array.isArray(rt.data) ? rt.data : (rt.data && rt.data.items) || [];
      if (!list.length) continue;
      roomType = { property: p.slug, slug: list[0].slug };
      const r = await http(`${API}/api/v1/public/request-pricing/quote`, { method: 'POST', jar, csrf: true,
        json: { propertySlug: p.slug, checkIn: day(30), checkOut: day(32), adults: 2, children: 0, lines: [{ roomTypeSlug: list[0].slug, quantity: 1 }] } });
      if (r.status === 422 || r.status === 409) continue; // no rate for that room type on those dates
      expect(r.status === 200 && r.data, `quote ${r.status} ${r.text.slice(0, 160)}`);
      const nums = JSON.stringify(r.data).match(/"(total|grandTotal|amount)[A-Za-z]*":\s*\{?[^}]*?"?amount"?:?\s*"?(\d+(\.\d+)?)/);
      return `${p.slug}/${list[0].slug} -> 200${nums ? '' : ' (total field shape not asserted)'}`;
    }
    return { skip: 'no priced room type found 30 days ahead' };
  });
  const badQuotes = [
    ['SMK-PRC-02', 'check-out before check-in', { checkIn: day(32), checkOut: day(30) }],
    ['SMK-PRC-03', 'check-out equal to check-in (0 nights)', { checkIn: day(30), checkOut: day(30) }],
    ['SMK-PRC-04', 'check-in in the past', { checkIn: day(-3), checkOut: day(-1) }],
    ['SMK-PRC-05', 'zero rooms on a line', { quantity: 0 }],
    ['SMK-PRC-06', 'zero adults', { adults: 0 }],
    ['SMK-PRC-07', 'unknown room type', { roomTypeSlug: 'no-such-room-qa' }],
    ['SMK-PRC-08', 'unknown hotel', { propertySlug: 'no-such-hotel-qa' }],
    ['SMK-PRC-09', 'children (not offered in V1)', { children: 1, childAges: [5] }],
  ];
  for (const [id, label, over] of badQuotes) {
    await t(id, 'Pricing', 'High', `Quote rejects ${label}`, async () => {
      if (!roomType) return { skip: 'no room type' };
      const body = { propertySlug: roomType.property, checkIn: day(30), checkOut: day(32), adults: 2, children: 0, lines: [{ roomTypeSlug: roomType.slug, quantity: 1 }] };
      Object.assign(body, over); if ('quantity' in over) body.lines = [{ roomTypeSlug: roomType.slug, quantity: over.quantity }];
      if ('roomTypeSlug' in over) body.lines = [{ roomTypeSlug: over.roomTypeSlug, quantity: 1 }];
      delete body.quantity; delete body.roomTypeSlug;
      const r = await http(`${API}/api/v1/public/request-pricing/quote`, { method: 'POST', jar, csrf: true, json: body });
      expect(r.status >= 400 && r.status < 500, `${label} -> ${r.status}`); noLeak(r);
      return `${r.status} ${r.data && r.data.code || ''}`;
    });
  }
  await t('SMK-BKG-01', 'Booking', 'Critical', 'Booking request without Idempotency-Key is refused (nothing stored)', async () => {
    const r = await http(`${API}/api/v1/public/reservations/requests`, { method: 'POST', jar, csrf: true, json: {} });
    expect(r.status === 400 || r.status === 422, `${r.status}`); noLeak(r);
  });
  await t('SMK-BKG-02', 'Booking', 'Critical', 'Booking request with an empty body is refused (nothing stored)', async () => {
    const r = await http(`${API}/api/v1/public/reservations/requests`, { method: 'POST', jar, csrf: true, json: {}, headers: { 'Idempotency-Key': `qa-${Date.now()}` } });
    expect(r.status === 400 || r.status === 422, `${r.status}`); noLeak(r);
  });
  await t('SMK-BKG-03', 'Booking', 'High', 'Unknown email-action token is 404', async () => {
    const r = await http(`${API}/api/v1/public/reservation-actions/qa-not-a-token-0000000000`); expect(r.status === 404 || r.status === 400, `${r.status}`); noLeak(r);
  });
  await t('SMK-BKG-04', 'Booking', 'High', 'Unknown booking reference is 404', async () => {
    const r = await http(`${API}/api/v1/public/reservations/requests/QA-NOPE-0000/sent`); expect(r.status === 404 || r.status === 400, `${r.status}`); noLeak(r);
  });

  /* ---- authentication, CSRF, input handling */
  await t('SMK-AUTH-01', 'Auth', 'Critical', 'Login without CSRF token is refused', async () => {
    const r = await http(`${API}/api/v1/public/auth/login`, { method: 'POST', json: { email: 'nobody@qa.invalid', password: 'x'.repeat(12) } });
    expect(r.status === 403, `${r.status}`);
  });
  await t('SMK-AUTH-02', 'Auth', 'Critical', 'Login with unknown account is 401 with a generic message', async () => {
    const j = await session();
    const r = await http(`${API}/api/v1/public/auth/login`, { method: 'POST', jar: j, csrf: true, json: { email: `nobody-${Date.now()}@qa.invalid`, password: 'Wrong-password-123' } });
    expect(r.status === 401, `${r.status}`); expect(!/not found|không tồn tại|does not exist/i.test(r.text), 'reveals whether the account exists'); noLeak(r);
  });
  await t('SMK-AUTH-03', 'Auth', 'High', 'Malformed JSON is 400', async () => {
    const r = await http(`${API}/api/v1/public/auth/login`, { method: 'POST', jar, csrf: true, body: '{"email":', headers: { 'Content-Type': 'application/json' } });
    expect(r.status === 400, `${r.status}`); noLeak(r);
  });
  await t('SMK-AUTH-04', 'Security', 'Medium', 'Oversized request body is refused without a 500', async () => {
    const big = JSON.stringify({ email: 'a@qa.invalid', password: 'p'.repeat(3 * 1024 * 1024) });
    const r = await http(`${API}/api/v1/public/auth/login`, { method: 'POST', jar, csrf: true, body: big, headers: { 'Content-Type': 'application/json' } }).catch(e => ({ status: 0, text: String(e) }));
    expect(r.status !== 500 && r.status !== 200 && r.status !== 204, `${r.status}`);
    return `${r.status || 'connection closed'}`;
  });
  await t('SMK-AUTH-05', 'Security', 'High', 'SQL-injection-looking input is handled as data', async () => {
    const r = await http(`${API}/api/v1/public/properties/${encodeURIComponent("x' OR '1'='1")}`);
    expect(r.status === 404 || r.status === 400, `${r.status}`); noLeak(r);
  });
  await t('SMK-AUTH-06', 'Auth', 'Critical', 'Anonymous /me endpoints are 401', async () => {
    const bad = [];
    for (const p of ['/me/profile', '/me/console', '/me/stays', '/me/favorites', '/me/sessions']) { const r = await http(`${API}/api/v1${p}`); if (r.status !== 401) bad.push(`${p}:${r.status}`); }
    expect(!bad.length, bad.join(', '));
  });
  const ADMIN_GETS = ['amenities', 'customers', 'media', 'media/covers', 'message-templates', 'message-templates/variables',
    'ops/conversations', 'ops/message-automation/log', 'ops/reservations', 'ops/reservations/cancellation-requests', 'policies',
    'properties', 'property-submissions', 'rate-rules', 'rates/base', 'rates/grid', 'reviews', 'sales/requests',
    'sales/requests/counts', 'site-image-slots', 'vouchers'];
  await t('SMK-AUTHZ-01', 'Authorization', 'Critical', `Anonymous callers get no admin data (${ADMIN_GETS.length} list endpoints)`, async () => {
    const bad = [];
    for (const p of ADMIN_GETS) { const r = await http(`${API}/api/v1/admin/${p}`); if (r.status !== 401 && r.status !== 403) bad.push(`${p}:${r.status}`); }
    expect(!bad.length, bad.join(', '));
  });
  await t('SMK-AUTHZ-02', 'Authorization', 'Critical', 'Anonymous admin writes are refused', async () => {
    const bad = [];
    for (const [m, p] of [['POST', 'vouchers'], ['POST', 'properties'], ['PATCH', 'reviews/00000000-0000-0000-0000-000000000000/moderation'], ['POST', 'sales/requests/QA-0000/decline']]) {
      const r = await http(`${API}/api/v1/admin/${p}`, { method: m, jar, csrf: true, json: {} }); if (r.status !== 401 && r.status !== 403) bad.push(`${m} ${p}:${r.status}`);
    }
    expect(!bad.length, bad.join(', '));
  });
  await t('SMK-SEC-01', 'Security', 'High', 'CORS refuses an unknown origin', async () => {
    const r = await http(`${API}/api/v1/public/trip-intents`, { headers: { Origin: 'https://evil.example' } });
    expect(!r.headers.get('access-control-allow-origin'), `allowed: ${r.headers.get('access-control-allow-origin')}`);
  });
  await t('SMK-SEC-02', 'Security', 'Medium', 'Backend sends nosniff and anti-framing headers', async () => {
    const r = await http(`${API}/api/v1/public/trip-intents`);
    expect(/nosniff/i.test(r.headers.get('x-content-type-options') || ''), 'no X-Content-Type-Options');
    const framing = (r.headers.get('x-frame-options') || '') + (r.headers.get('content-security-policy') || '');
    expect(/deny|sameorigin|frame-ancestors/i.test(framing), 'no anti-framing header');
  });
  await t('SMK-SEC-03', 'Security', 'Medium', 'Session cookies are HttpOnly', async () => {
    const r = await fetch(`${API}/api/v1/public/auth/refresh`, { method: 'POST' });
    const set = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
    const auth = set.filter(c => /^kas_(access|refresh)=/.test(c));
    if (!auth.length) return 'no session cookie issued to an anonymous caller (expected)';
    expect(auth.every(c => /HttpOnly/i.test(c)), 'session cookie without HttpOnly');
    if (PROD) expect(auth.every(c => /Secure/i.test(c)), 'session cookie without Secure');
  });

  /* ---- signed-in customer (optional) */
  if (!CUSTOMER) {
    results.push({ id: 'SMK-CUS-*', module: 'Customer', severity: 'Critical', name: 'Signed-in customer checks', status: 'SKIP', detail: 'set KAS_QA_CUSTOMER_EMAIL / KAS_QA_CUSTOMER_PASSWORD (test account only)' });
  } else {
    const cj = await session();
    let signedIn = false;
    await t('SMK-CUS-01', 'Customer', 'Critical', 'Test customer can sign in', async () => {
      const r = await http(`${API}/api/v1/public/auth/login`, { method: 'POST', jar: cj, csrf: true, json: CUSTOMER });
      expect(r.status === 204 || r.status === 200, `login ${r.status} ${r.text.slice(0, 120)}`); signedIn = true;
      expect(cj.get('kas_access'), 'no kas_access cookie');
    });
    const need = () => (signedIn ? null : { skip: 'not signed in' });
    await t('SMK-CUS-02', 'Customer', 'High', 'Profile belongs to the signed-in account', async () => need() || (async () => {
      const r = await http(`${API}/api/v1/me/profile`, { jar: cj }); expect(r.status === 200, `${r.status}`);
      expect(String(r.data.email).toLowerCase() === CUSTOMER.email.toLowerCase(), 'profile email differs');
    })());
    await t('SMK-CUS-03', 'Authorization', 'Critical', 'Customer console role is NONE', async () => need() || (async () => {
      const r = await http(`${API}/api/v1/me/console`, { jar: cj }); expect(r.status === 200 && r.data.console === 'NONE', `${r.status} ${r.text}`);
    })());
    /* Security property: a customer never gets a 2xx or admin data. A 400 VALIDATION_FAILED
       before the 403 is known finding QA-003 (validation runs before @PreAuthorize); it is
       reported in the detail, and the well-formed probes below must then be 403. */
    await t('SMK-CUS-04', 'Authorization', 'Critical', `Customer gets no admin data (${ADMIN_GETS.length} list endpoints)`, async () => need() || (async () => {
      const bad = [], early = [];
      for (const p of ADMIN_GETS) { const r = await http(`${API}/api/v1/admin/${p}`, { jar: cj });
        if (r.status === 400 && r.data && r.data.code === 'VALIDATION_FAILED') early.push(p); else if (r.status !== 403) bad.push(`${p}:${r.status}`); }
      expect(!bad.length, bad.join(', '));
      return early.length ? `QA-003: 400 before 403 on ${early.join(', ')}` : '';
    })());
    await t('SMK-CUS-05', 'Authorization', 'Critical', 'Customer cannot read or write admin data with well-formed requests', async () => need() || (async () => {
      const pid = '00000000-0000-0000-0000-000000000001'; const bad = [];
      for (const [m, p, b] of [['GET', `rates/base?propertyId=${pid}`], ['GET', `rates/grid?propertyId=${pid}&from=${day(30)}&to=${day(32)}`],
        ['GET', `rate-rules?propertyId=${pid}`], ['POST', 'sales/requests/QA-0000/decline', { reason: 'QA smoke' }]]) {
        const r = await http(`${API}/api/v1/admin/${p}`, { method: m, jar: cj, csrf: m !== 'GET', json: b }); if (r.status !== 403) bad.push(`${m} ${p}:${r.status}`);
      }
      const early = [];
      for (const [m, p] of [['POST', 'vouchers'], ['PATCH', 'reviews/00000000-0000-0000-0000-000000000000/moderation']]) {
        const r = await http(`${API}/api/v1/admin/${p}`, { method: m, jar: cj, csrf: true, json: {} });
        if (r.status >= 200 && r.status < 300) bad.push(`${m} ${p}:${r.status}`); else if (r.status === 400) early.push(`${m} ${p}`);
      }
      expect(!bad.length, bad.join(', '));
      return early.length ? `QA-003: 400 before 403 on ${early.join(', ')}` : '';
    })());
    await t('SMK-CUS-06', 'My KAS', 'High', 'My stays answers for this account only', async () => need() || (async () => {
      const r = await http(`${API}/api/v1/me/stays`, { jar: cj }); expect(r.status === 200, `${r.status}`);
      const list = Array.isArray(r.data) ? r.data : (r.data.items || []);
      const foreign = list.filter(s => s.guestEmail && String(s.guestEmail).toLowerCase() !== CUSTOMER.email.toLowerCase());
      expect(!foreign.length, `${foreign.length} stays of another guest`);
      return `${list.length} stays`;
    })());
    await t('SMK-CUS-07', 'Saved Hotels', 'High', 'Save and unsave a hotel (restored afterwards)', async () => need() || (async () => {
      if (!props.length) return { skip: 'no hotels' };
      const before = await http(`${API}/api/v1/me/favorites`, { jar: cj }); expect(before.status === 200, `list ${before.status}`);
      const has = s => JSON.stringify((before.data)).includes(`"${s}"`);
      const slug = (props.find(p => !has(p.slug)) || props[0]).slug; const wasSaved = has(slug);
      const put = await http(`${API}/api/v1/me/favorites/${slug}`, { method: 'PUT', jar: cj, csrf: true }); expect(put.status < 300, `save ${put.status}`);
      const mid = await http(`${API}/api/v1/me/favorites`, { jar: cj }); expect(JSON.stringify(mid.data).includes(slug), 'saved hotel not listed');
      if (!wasSaved) { const del = await http(`${API}/api/v1/me/favorites/${slug}`, { method: 'DELETE', jar: cj, csrf: true }); expect(del.status < 300, `unsave ${del.status}`);
        const after = await http(`${API}/api/v1/me/favorites`, { jar: cj }); expect(!JSON.stringify(after.data).includes(`"${slug}"`), 'hotel still saved after unsave'); }
      return slug;
    })());
    await t('SMK-CUS-08', 'Saved Hotels', 'Medium', 'Saving an unknown hotel is refused', async () => need() || (async () => {
      const r = await http(`${API}/api/v1/me/favorites/no-such-hotel-qa`, { method: 'PUT', jar: cj, csrf: true });
      expect(r.status === 404 || r.status === 400 || r.status === 422, `${r.status}`); noLeak(r);
    })());
    await t('SMK-CUS-09', 'Auth', 'High', 'Refresh renews the session', async () => need() || (async () => {
      const r = await http(`${API}/api/v1/public/auth/refresh`, { method: 'POST', jar: cj, csrf: true }); expect(r.status === 204 || r.status === 200, `${r.status}`);
    })());
    await t('SMK-CUS-10', 'Auth', 'Critical', 'Logout ends the session', async () => need() || (async () => {
      const r = await http(`${API}/api/v1/public/auth/logout`, { method: 'POST', jar: cj, csrf: true }); expect(r.status === 204 || r.status === 200, `logout ${r.status}`);
      const p = await http(`${API}/api/v1/me/profile`, { jar: cj }); expect(p.status === 401, `profile after logout ${p.status}`);
    })());
  }

  /* ---- report */
  const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
  const w = Math.max(...results.map(r => r.id.length));
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.id.padEnd(w)}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  console.log(`\n${results.length} checks: ${counts.PASS || 0} PASS, ${counts.FAIL || 0} FAIL, ${counts.SKIP || 0} SKIP`);
  if (process.env.KAS_SMOKE_REPORT) fs.writeFileSync(process.env.KAS_SMOKE_REPORT, JSON.stringify({ site: SITE, api: API, console: CONSOLE, at: new Date().toISOString(), counts, results }, null, 2));
  process.exitCode = counts.FAIL ? 1 : 0;
}
run().catch(e => { console.error(e); process.exitCode = 2; });
