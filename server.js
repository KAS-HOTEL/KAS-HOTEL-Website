'use strict';
/* KAS website server (Render service kas-website).
   - Serves the HTML site: its pages, css/, js/, assets/ (brand) and img/ (photographs).
   - Forwards the customer API (/api/v1/public/**, /api/v1/me/**) to Spring Boot on the same
     origin, so session cookies and the CSRF pair work without CORS.
   - Nothing is stored here. Hotels, rooms, prices and every image are managed in the console
     and read from the backend; the old image/rate admin (admin.html, reference.html,
     /api/admin/*, /uploads, /api/catalog) was removed on 2026-11-09. */

const express = require('express');
const fs = require('fs');
const path = require('path');
const apiBoundary = require('./api-boundary');
const http = require('http');
const https = require('https');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const API_ORIGIN = String(process.env.KAS_API_ORIGIN || '').trim();
if (IS_PRODUCTION && !API_ORIGIN) {
  console.error('KAS_API_ORIGIN is required in production so the website can reach Spring Boot.');
  process.exit(1);
}
/* Where the Admin/Partner console lives, e.g. https://admin.kasluxuryhotel.com.
   The console runs on its own host so its session cookies are never shared with
   the public website. Only an absolute http(s) origin is accepted. */
const CONSOLE_URL = (function () {
  const raw = String(process.env.KAS_CONSOLE_URL || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    return url.origin;
  } catch (_) {
    console.error('KAS_CONSOLE_URL must be an absolute http(s) URL; the console link stays hidden.');
    return '';
  }
})();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(function(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

/* Keep the original HTML site on one origin while forwarding its Spring API
   calls. This preserves HttpOnly session cookies and the CSRF cookie/header
   pair without requiring browser CORS access to the backend service. */
if (API_ORIGIN) {
  /* Server separation (doc 156): only the customer API is forwarded from this host.
     /api/v1/admin/** and any other tree answer a JSON 404 here (api-boundary.js). */
  const customerApiOnly = (req, res, next) => {
    if (apiBoundary.isCustomerApiPath(req.originalUrl)) return next();
    res.set('Cache-Control', 'no-store');
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found.' });
  };
  const proxyToSpring = (req, res) => {
    let target;
    try { target = new URL(req.originalUrl, API_ORIGIN); }
    catch (_) { return res.status(500).json({ error: 'Invalid KAS_API_ORIGIN.' }); }
    const transport = target.protocol === 'https:' ? https : http;
    /* The client address the trusted proxy reported ('trust proxy' 1), not a header the
       browser typed: the backend rate-limits and audits by it. */
    const headers = Object.assign({}, req.headers, {
      host: target.host,
      'x-forwarded-host': req.get('host'),
      'x-forwarded-proto': req.protocol,
      'x-forwarded-for': req.ip,
      'x-real-ip': req.ip,
      /* Always this host's own value, whatever the browser sent: the backend refuses
         staff sign-in on the customer website (AuthenticationService.requireSurface). */
      [apiBoundary.SURFACE_HEADER]: apiBoundary.SURFACE_VALUE
    });
    delete headers.connection;
    const upstream = transport.request(target, { method: req.method, headers }, (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.setTimeout(30000, () => upstream.destroy(new Error('Spring API request timed out.')));
    upstream.on('error', (error) => {
      if (res.headersSent) return res.destroy(error);
      res.status(502).json({ error: 'Spring API is unavailable.' });
    });
    req.pipe(upstream);
  };
  app.use('/api/v1', customerApiOnly, proxyToSpring);
  /* The legacy HTML API client primes Spring's CSRF cookie through this
     side-effect-free health read before its first mutation. */
  app.use('/actuator/health', proxyToSpring);
}

/* ---------- public static files: explicit allowlist ----------
   Only the site's pages and its css/, js/, assets/ and img/ folders are public.
   Everything else in the project folder (tools/, .claude/, *.md, server and deploy
   configuration, package files, dotfiles) returns 404. */
const PUBLIC_PAGES = new Set(fs.readdirSync(ROOT).filter(f => /^[a-z0-9-]+\.html$/.test(f)));
const staticOpts = { dotfiles: 'deny', index: false, redirect: false };
app.use('/css', express.static(path.join(ROOT, 'css'), staticOpts));
app.use('/js', express.static(path.join(ROOT, 'js'), staticOpts));
/* Default image of each website position; the console's choice (backend) wins over it. */
app.get('/site-image-slots.json', (req, res) => res.sendFile(path.join(ROOT, 'site-image-slots.json')));
/* Public, non-secret settings the browser needs (js/app.js reads it). */
app.get('/site-config.json', (req, res) => res.set('Cache-Control', 'no-cache').json({ consoleUrl: CONSOLE_URL }));
/* Brand identity files: logo, favicon, photo placeholder. */
app.use('/assets', express.static(path.join(ROOT, 'assets'), staticOpts));
/* Website photographs: img/hotels, img/home, img/heroes, img/guidebook, img/city-guide.
   Images only; the console decides which one is shown where. */
app.use('/img', function(req, res, next) {
  if (!/\.(?:jpe?g|png|webp|avif|gif|svg)$/i.test(req.path)) return res.sendStatus(404);
  next();
}, express.static(path.join(ROOT, 'img'), Object.assign({ maxAge: '7d' }, staticOpts)));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
/* Pages link to assets/favicon/ (built by tools/build-favicons.js). Browsers and iOS
   also ask for these root paths on their own, so they get the same files. */
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(ROOT, 'assets', 'favicon', 'favicon.ico')));
app.get(['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'],
  (req, res) => res.sendFile(path.join(ROOT, 'assets', 'favicon', 'apple-touch-icon.png')));
/* Customer emails link to the Next.js account paths. On this website those
   pages are served by the HTML flows, so the same links must land there. */
function accountRedirect(target) {
  return (req, res, next) => {
    const locale = req.params.locale;
    if (locale !== 'vi' && locale !== 'en') return next();
    const query = new URLSearchParams({ lang: locale });
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (token) query.set('resetToken', token);
    res.set('Referrer-Policy', 'no-referrer');
    res.redirect(302, '/' + target + '?' + query);
  };
}
app.get('/:locale/account/reset-password', accountRedirect('manage-booking.html'));
app.get('/:locale/account/stays', accountRedirect('manage-booking.html'));
app.get('/:locale/account/verify-email', accountRedirect('verify-email.html'));
/* find-your-kas.html was removed with Homepage V3 (2026-11-05); its stay search now
   lives on hotels.html (?stay=...). Old links and bookmarks keep working. */
app.get(['/find-your-kas', '/find-your-kas.html'], (req, res) => {
  const q = req.originalUrl.indexOf('?');
  res.redirect(301, '/hotels.html' + (q >= 0 ? req.originalUrl.slice(q) : ''));
});
/* Saved hotels moved into My KAS (2026-11-07): manage-booking.html?view=saved.
   Old links keep working; their query (e.g. lang) is carried over. */
app.get(['/saved-hotels', '/saved-hotels.html'], (req, res) => {
  const q = req.originalUrl.indexOf('?');
  const rest = q >= 0 ? req.originalUrl.slice(q + 1).split('&').filter((p) => p && !/^view=/.test(p)) : [];
  res.redirect(301, '/manage-booking.html?' + ['view=saved'].concat(rest).join('&'));
});
app.get('/:page', (req, res, next) => {
  const raw = req.params.page;
  const file = /\.html$/.test(raw) ? raw : raw + '.html';   /* clean URLs: /hotels -> hotels.html */
  if (!PUBLIC_PAGES.has(file)) return next();
  res.sendFile(path.join(ROOT, file));
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'KAS Hotel Collection', time: new Date().toISOString() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => res.status(404).type('text').send('Not found'));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
  res.status(status).json({ error: status === 400 ? 'Yêu cầu không hợp lệ.' : 'Request error' });
});

/* Production listens on every interface (Render); a local run stays on loopback unless HOST says otherwise. */
const HOST = IS_PRODUCTION ? '0.0.0.0' : String(process.env.HOST || '127.0.0.1');
app.listen(PORT, HOST, (error) => {
  /* Express 5 hands a listen failure (e.g. port in use) to this callback.
     Fail loudly instead of logging "running" and exiting with code 0. */
  if (error) {
    console.error('KAS server could not listen on port ' + PORT + ': ' + (error.code || error.message));
    process.exit(1);
  }
  console.log('KAS server running on http://localhost:' + PORT);
});
