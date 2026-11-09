#!/usr/bin/env node
/*
 * Move the website's current hotel and room photos into the console's media library.
 *
 * The website used to take photos from the old admin (uploads + JSON on the website disk)
 * and from js/data.js. Images are now managed in the console; this registers each photo the
 * website shows today as an external image of the right hotel / room type, in the same
 * order, so the console starts with the real set instead of an empty gallery.
 *
 * It decides "what the website shows" with the website's own code (js/data.js + js/live.js
 * applied to the old admin's /api/catalog), so the result matches the live pages.
 *
 *   Dry run (default): reads only, no sign-in, prints the plan.
 *     node tools/migrate-legacy-images-to-console.mjs --api https://admin.kasluxuryhotel.com --site https://kasluxuryhotel.com
 *   Apply: asks for an ADMIN account (password not echoed) and registers the images with
 *   POST /api/v1/admin/media/external. Safe to run again: the same URL reuses its asset and
 *   an existing link is not duplicated.
 *     node tools/migrate-legacy-images-to-console.mjs --api ... --site ... --apply
 *
 * --api   origin that serves /api/v1 (the console host, or the backend)
 * --site  public HTTPS origin of the website; relative /uploads/... photos become absolute here
 * --catalog  old admin catalogue URL (default <site>/api/catalog)
 * --skip-external  leave out photos hosted by third parties (tripcdn, unsplash, …)
 *
 * The console only accepts https:// URLs; anything else is listed as skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const API = (opt('api') || '').replace(/\/+$/, '');
const SITE = (opt('site') || '').replace(/\/+$/, '');
const CATALOG = opt('catalog', SITE + '/api/catalog');
const APPLY = flag('apply');
const SKIP_EXTERNAL = flag('skip-external');
if (!API || !SITE) { console.error('Usage: --api <origin with /api/v1> --site <public https website origin> [--apply] [--skip-external]'); process.exit(2); }

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend');

/* ------------------------------------------------------------ the website's own logic */
function websitePhotos(catalog) {
  const window = { location: { search: '', hostname: 'migration', href: SITE + '/' }, console };
  window.window = window; window.global = window;
  window.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, readyState: 'complete' };
  const context = vm.createContext(window);
  for (const file of ['images.js', 'rates.js', 'data.js', 'api-map.js', 'live.js']) {
    const source = fs.readFileSync(path.join(FRONTEND, 'js', file), 'utf8');
    try { vm.runInContext(source, context, { filename: file }); } catch (e) { if (file === 'data.js' || file === 'live.js') throw e; }
  }
  const D = window.KAS_DATA;
  return D.hotels.map((hotel) => {
    window.KAS_LIVE.applyToHotel(hotel, catalog);
    const gallery = (hotel.propertyGalleryImages && hotel.propertyGalleryImages.length) ? hotel.propertyGalleryImages : (hotel.images || []);
    return {
      id: hotel.id, name: hotel.name, gallery: [...new Set(gallery)],
      rooms: (hotel.rooms || []).map((r) => ({
        id: r.id, name: r.name,
        images: [...new Set((r.liveImages && r.liveImages.length) ? r.liveImages : (r.images || []))],
      })),
    };
  });
}

/* ------------------------------------------------------------ http with session cookies */
const jar = new Map();
async function http(method, url, body) {
  const headers = { Accept: 'application/json' };
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (jar.has('XSRF-TOKEN')) headers['X-XSRF-TOKEN'] = decodeURIComponent(jar.get('XSRF-TOKEN'));
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const line of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const pair = line.split(';')[0]; const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) { const err = new Error(`${method} ${url.replace(API, '')} → ${res.status} ${data && data.code ? data.code : text.slice(0, 120)}`); err.status = res.status; throw err; }
  return data;
}
function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = function (s) { if (s.includes(question)) rl.output.write(s); }; }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
function mimeOf(url) { const ext = (new URL(url).pathname.split('.').pop() || '').toLowerCase(); return MIME[ext] || 'image/jpeg'; }
function absolute(u) { try { return new URL(u, SITE + '/').toString(); } catch { return null; } }

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}  api=${API}  site=${SITE}  catalog=${CATALOG}${SKIP_EXTERNAL ? '  (skipping third-party photos)' : ''}\n`);
  const catalog = await fetch(CATALOG, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { branches: [] })).catch(() => ({ branches: [] }));
  const site = websitePhotos(catalog);

  const cards = await http('GET', `${API}/api/v1/public/properties/catalogue?locale=en`);
  const slugByKey = new Map(cards.filter((c) => c.frontendKey).map((c) => [c.frontendKey, c.slug]));
  const roomSlugByKey = new Map();
  for (const c of cards) {
    for (const rt of await http('GET', `${API}/api/v1/public/properties/${c.slug}/room-types?locale=en`)) {
      if (rt.frontendKey) roomSlugByKey.set(rt.frontendKey, { property: c.slug, slug: rt.slug });
    }
  }

  const plan = []; const skipped = [];
  const host = new URL(SITE).host;
  const consider = (raw) => {
    const url = absolute(raw);
    if (!url || !url.startsWith('https://')) { skipped.push(`${raw} (not https)`); return null; }
    if (SKIP_EXTERNAL && new URL(url).host !== host) { skipped.push(`${url} (third party)`); return null; }
    return url;
  };
  for (const h of site) {
    const slug = slugByKey.get(h.id);
    if (!slug) { skipped.push(`${h.id} ${h.name}: not published in the console`); continue; }
    h.gallery.map(consider).filter(Boolean).forEach((url, i) => plan.push({ ownerType: 'PROPERTY', property: slug, owner: slug, url, order: i, category: 'EXTERIOR', alt: `${h.name} — ${i + 1}` }));
    for (const r of h.rooms) {
      const ref = roomSlugByKey.get(r.id);
      if (!ref) { if (r.images.length) skipped.push(`${r.id} ${r.name}: room type not published`); continue; }
      r.images.map(consider).filter(Boolean).forEach((url, i) => plan.push({ ownerType: 'ROOM_TYPE', property: slug, owner: ref.slug, url, order: i, category: 'ROOM', alt: `${r.name} — ${i + 1}` }));
    }
  }

  const byHotel = {};
  for (const p of plan) { const k = p.property; byHotel[k] = byHotel[k] || { hotel: 0, room: 0, thirdParty: 0 }; byHotel[k][p.ownerType === 'PROPERTY' ? 'hotel' : 'room']++; if (new URL(p.url).host !== host) byHotel[k].thirdParty++; }
  console.table(byHotel);
  console.log(`${plan.length} images to register, ${skipped.length} skipped`);
  if (skipped.length) console.log('Skipped:\n  ' + skipped.slice(0, 40).join('\n  ') + (skipped.length > 40 ? `\n  … ${skipped.length - 40} more` : ''));
  if (!APPLY) { console.log('\nDry run only. Add --apply to register them (asks for an ADMIN account).'); return; }

  await http('GET', `${API}/api/v1/public/trip-intents`);
  const email = await ask('Admin email: ');
  const password = await ask('Password: ', true);
  await http('POST', `${API}/api/v1/public/auth/login`, { email, password });
  const properties = await http('GET', `${API}/api/v1/admin/properties`);
  const propertyId = new Map(properties.map((p) => [p.slug, p.id]));
  const roomId = new Map();
  for (const p of properties) {
    for (const rt of await http('GET', `${API}/api/v1/admin/properties/${p.id}/room-types`)) roomId.set(`${p.slug}/${rt.slug}`, rt.id);
  }
  let done = 0, failed = 0;
  for (const p of plan) {
    const ownerId = p.ownerType === 'PROPERTY' ? propertyId.get(p.property) : roomId.get(`${p.property}/${p.owner}`);
    if (!ownerId) { failed++; console.log(`  no console id for ${p.ownerType} ${p.owner}`); continue; }
    try {
      await http('POST', `${API}/api/v1/admin/media/external`, {
        url: p.url, mimeType: mimeOf(p.url), category: p.category, ownerType: p.ownerType, ownerId,
        displayOrder: p.order, altTextVi: p.alt, altTextEn: p.alt,
      });
      done++;
    } catch (e) { failed++; console.log('  ' + e.message); }
  }
  console.log(`\nRegistered ${done}, failed ${failed}. Open the console gallery of each hotel to check order and covers.`);
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
