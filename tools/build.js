#!/usr/bin/env node
/* =========================================================================
   KAS — build
   -------------------------------------------------------------------------
   The site is vanilla HTML/CSS/JS with no transpile step, so "building" means
   verifying the deployable tree rather than transforming it. This is what
   `npm run build` runs on Vercel; it fails the build on a real problem
   instead of shipping a broken deploy.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'hotels.html', 'hotel-detail.html', 'room-detail.html',
               'guest-details.html', 'review-confirm.html', 'booking-confirmed.html',
               'manage-booking.html','about.html','experiences.html','offers.html','support.html', 'reference.html', 'admin.html'];
const SCRIPTS = ['images.js', 'rates.js', 'data.js', 'utils.js', 'storage.js', 'contact.js',
                 'app.js', 'booking.js', 'search.js', 'hotel.js', 'room.js', 'reference.js', 'admin.js'];
const STYLES = ['style.css', 'components.css', 'responsive.css'];

const errors = [];
const ok = m => console.log('  OK   ' + m);
const bad = m => { errors.push(m); console.log('  FAIL ' + m); };

console.log('\nKAS build check\n');

/* 1. every expected file exists */
[].concat(PAGES, SCRIPTS.map(f => 'js/' + f), STYLES.map(f => 'css/' + f)).forEach(f => {
  fs.existsSync(path.join(ROOT, f)) ? ok(f) : bad('missing: ' + f);
});

/* 2. every script parses */
SCRIPTS.forEach(f => {
  const p = path.join(ROOT, 'js', f);
  if (!fs.existsSync(p)) return;
  try { new Function(fs.readFileSync(p, 'utf8')); }
  catch (e) { bad('syntax error in js/' + f + ': ' + e.message); }
});

/* 3. no machine-local paths would ship */
const LOCAL = /(file:\/\/\/|[A-Z]:\\\\|localhost|127\.0\.0\.1|192\.168\.|\/home\/[a-z]+\/|\/Users\/)/;
[].concat(PAGES, SCRIPTS.map(f => 'js/' + f), STYLES.map(f => 'css/' + f)).forEach(f => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  if (LOCAL.test(fs.readFileSync(p, 'utf8'))) bad('local-only path in ' + f);
});

/* 4. no root-relative asset refs (they break under a subpath) */
PAGES.forEach(f => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  const m = fs.readFileSync(p, 'utf8').match(/(?:src|href)="\/(?!\/)/g);
  if (m) bad(f + ': ' + m.length + ' root-relative reference(s)');
});

/* 5. script load order — images.js and rates.js must precede data.js */
PAGES.forEach(f => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  const at = n => s.indexOf('js/' + n);
  if (at('data.js') < 0) return;
  if (at('images.js') < 0 || at('images.js') > at('data.js')) bad(f + ': images.js must load before data.js');
  if (at('rates.js') < 0 || at('rates.js') > at('data.js')) bad(f + ': rates.js must load before data.js');
  if (at('utils.js') < 0) bad(f + ': utils.js missing');
});

/* 6. contact details exist in exactly one place */
SCRIPTS.filter(f => f !== 'data.js').forEach(f => {
  const p = path.join(ROOT, 'js', f);
  if (!fs.existsSync(p)) return;
  const code = fs.readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (/0869768885|zalo\.me|wa\.me/.test(code)) bad('hard-coded contact value in js/' + f);
});

/* 7. dataset loads and is internally consistent */
try {
  global.window = {};
  require(path.join(ROOT, 'js', 'images.js'));
  require(path.join(ROOT, 'js', 'rates.js'));
  require(path.join(ROOT, 'js', 'data.js'));
  const D = global.window.KAS_DATA;
  if (!D || D.hotels.length !== 8) {
    bad('dataset did not load 8 hotels');
  } else {
    ok('dataset: ' + D.hotels.length + ' hotels, ' + D.allRooms().length + ' room types');
    const owner = {};
    let cross = 0, noPrice = 0;
    D.hotels.forEach(h => h.rooms.forEach(r => {
      if (!(r.pricePerNight > 0)) noPrice++;
      r.images.forEach(u => { if (owner[u] && owner[u] !== h.id) cross++; owner[u] = h.id; });
    }));
    cross ? bad(cross + ' image(s) shared across branches') : ok('branch image isolation intact');
    noPrice ? bad(noPrice + ' room(s) without a price') : ok('every room priced');
  }
} catch (e) {
  bad('dataset failed to load: ' + e.message);
}

console.log('');
if (errors.length) {
  console.error('BUILD FAILED - ' + errors.length + ' error(s)\n');
  process.exit(1);
}
console.log('BUILD SUCCESSFUL - static site ready to deploy\n');
