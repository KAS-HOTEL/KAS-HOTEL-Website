'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
const CONFIG_DIR = process.env.KAS_CONFIG_DIR || (process.env.UPLOAD_DIR
  ? path.join(path.dirname(process.env.UPLOAD_DIR), 'kas-config')
  : path.join(DATA_DIR, 'runtime'));
const RATE_FILE = path.join(DATA_DIR, 'rate-sheet.json');
const UPLOAD_FILE = path.join(UPLOAD_DIR, 'manifest.json');
const RATE_OVERRIDE_FILE = path.join(CONFIG_DIR, 'rate-overrides.json');
const COLLECTION_FILE = path.join(CONFIG_DIR, 'collection-images.json');
const IMAGE_OVERRIDE_FILE = path.join(CONFIG_DIR, 'image-overrides.json');
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
/* Production always requires ADMIN_KEY. Local development may run without one;
   in that case the server binds to loopback and admin routes are local-only. */
const ADMIN_KEY = String(process.env.ADMIN_KEY || '').trim();
const PLACEHOLDER_KEYS = new Set(['kas-admin-2026', 'change-this-strong-admin-key', 'doi-key-nay',
  'your-long-random-key', '<key-dai-ngau-nhien-cua-ban>']);
if (IS_PRODUCTION && (!ADMIN_KEY || PLACEHOLDER_KEYS.has(ADMIN_KEY) || /^<.*>$/.test(ADMIN_KEY))) {
  console.error('ADMIN_KEY is missing or is a placeholder. Set a strong ADMIN_KEY environment variable before starting the server.');
  process.exit(1);
}
if (ADMIN_KEY && (PLACEHOLDER_KEYS.has(ADMIN_KEY) || /^<.*>$/.test(ADMIN_KEY))) {
  console.warn('Warning: ADMIN_KEY looks like a placeholder. Use a strong key for production.');
}
if (ADMIN_KEY && ADMIN_KEY.length < 12) console.warn('Warning: ADMIN_KEY is shorter than 12 characters. Use a longer key.');
const ADMIN_KEY_DIGEST = ADMIN_KEY ? crypto.createHash('sha256').update(ADMIN_KEY).digest() : null;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CONFIG_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return fallback; }
}
function writeJsonAtomic(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function normalizePair(pair) {
  if (!Array.isArray(pair) || pair.length !== 2) return null;
  const a = num(pair[0]);
  const b = num(pair[1]);
  if (a == null || b == null) return null;
  return [a, b];
}

const rateData = readJson(RATE_FILE, { branches: {}, seasons: [], policy: {} });
let uploads = readJson(UPLOAD_FILE, { version: 1, rooms: {} });
let rateOverrides = readJson(RATE_OVERRIDE_FILE, { version: 1, rooms: {} });
let imageOverrides = readJson(IMAGE_OVERRIDE_FILE, { version: 2, collection: {}, property: {}, rooms: {}, site: {} });
if (!imageOverrides.site || typeof imageOverrides.site !== 'object') imageOverrides.site = {};
if (!imageOverrides.property || typeof imageOverrides.property !== 'object') imageOverrides.property = {};

let collectionImages = readJson(COLLECTION_FILE, { version: 1, hotels: {} });

function allRooms() {
  const out = [];
  Object.entries(rateData.branches || {}).forEach(([hotelId, branch]) => {
    (branch.sheetRooms || []).forEach(room => out.push({
      key: hotelId + ':' + room.stt,
      hotelId,
      stt: room.stt,
      ez: room.ez,
      name: room.name,
      address: branch.address,
      rates: {
        jul_sep: room.jul_sep,
        oct: room.oct,
        nov_jan: room.nov_jan
      }
    }));
  });
  return out;
}
const roomIndex = new Map(allRooms().map(r => [r.key, r]));

function effectiveRates(key, room) {
  const override = rateOverrides.rooms && rateOverrides.rooms[key];
  return {
    jul_sep: normalizePair(override && override.jul_sep) || room.jul_sep,
    oct: normalizePair(override && override.oct) || room.oct,
    nov_jan: normalizePair(override && override.nov_jan) || room.nov_jan
  };
}

/* Constant-time key comparison + a small in-memory brake on repeated failures. */
const failedAuth = new Map();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_FAILS = 20;
function keyMatches(value) {
  if (!ADMIN_KEY_DIGEST) return false;
  const digest = crypto.createHash('sha256').update(String(value || '')).digest();
  return crypto.timingSafeEqual(digest, ADMIN_KEY_DIGEST);
}
function isLoopback(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function auth(req, res, next) {
  if (!IS_PRODUCTION && !ADMIN_KEY && isLoopback(req)) return next();
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = failedAuth.get(ip);
  if (rec && now - rec.first > AUTH_WINDOW_MS) failedAuth.delete(ip);
  const cur = failedAuth.get(ip);
  if (cur && cur.count >= AUTH_MAX_FAILS) {
    return res.status(429).json({ error: 'Quá nhiều lần thử sai. Vui lòng thử lại sau.' });
  }
  if (!keyMatches(req.get('x-admin-key'))) {
    if (cur) cur.count += 1; else failedAuth.set(ip, { count: 1, first: now });
    return res.status(401).json({ error: 'Sai mã quản trị.' });
  }
  failedAuth.delete(ip);
  next();
}

/* ---------- upload safety helpers ---------- */
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const PROPERTY_IMAGE_CATEGORIES = new Set(['rooms', 'lobby', 'dining', 'exterior', 'amenities', 'other']);
function safeExtension(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  return IMAGE_EXT.includes(ext) ? ext : '.jpg';
}
/* Resolve a stored "/uploads/..." URL to a file path that is guaranteed to be
   inside UPLOAD_DIR. Returns null for anything that would escape it. */
function uploadPathFromUrl(url) {
  const rel = String(url || '').replace(/^\/uploads\//, '');
  if (!rel || rel.includes('\0')) return null;
  const file = path.resolve(UPLOAD_DIR, rel);
  const root = path.resolve(UPLOAD_DIR) + path.sep;
  return file.startsWith(root) ? file : null;
}
function removeUploadedFile(file) {
  if (!file) return;
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
}
/* Check the real file signature; the browser-supplied MIME type is not proof. */
function hasImageSignature(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(12);
    const n = fs.readSync(fd, b, 0, 12, 0);
    if (n < 12) return false;
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;                       // JPEG
    if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return true; // PNG
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return true;      // WEBP
    return false;
  } catch (_) {
    return false;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
  }
}
/* Returns true when every uploaded file is a real image; otherwise deletes them all. */
function verifyImages(files) {
  const list = (files || []).filter(Boolean);
  if (list.every(f => hasImageSignature(f.path))) return true;
  list.forEach(f => removeUploadedFile(f.path));
  return false;
}
function isBranch(hotelId) {
  return !!(rateData.branches && Object.prototype.hasOwnProperty.call(rateData.branches, hotelId));
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const key = String(req.body.roomKey || '');
    const room = roomIndex.get(key);
    if (!room) return cb(new Error('Phòng không hợp lệ.'));
    const dir = path.join(UPLOAD_DIR, room.hotelId, String(room.stt));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safeExt = safeExtension(file.originalname);
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + safeExt);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter(req, file, cb) {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ nhận JPG, PNG hoặc WEBP.'));
  }
});

const collectionStorage = multer.diskStorage({
  destination(req, file, cb) {
    const hotelId = String(req.body.hotelId || '');
    if (!isBranch(hotelId)) return cb(new Error('Chi nhánh không hợp lệ.'));
    const dir = path.join(UPLOAD_DIR, 'collection', hotelId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safeExt = safeExtension(file.originalname);
    cb(null, 'collection-' + hotelIdSafe(req.body.hotelId) + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + safeExt);
  }
});
function hotelIdSafe(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, ''); }
const collectionUpload = multer({
  storage: collectionStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ nhận JPG, PNG hoặc WEBP.'));
  }
});

const propertyStorage = multer.diskStorage({
  destination(req, file, cb) {
    const hotelId = String(req.body.hotelId || '');
    if (!isBranch(hotelId)) return cb(new Error('Chi nhánh không hợp lệ.'));
    const dir = path.join(UPLOAD_DIR, 'property', hotelId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safeExt = safeExtension(file.originalname);
    cb(null, 'property-' + hotelIdSafe(req.body.hotelId) + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + safeExt);
  }
});
const propertyUpload = multer({
  storage: propertyStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter(req, file, cb) {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ nhận JPG, PNG hoặc WEBP.'));
  }
});

const siteStorage = multer.diskStorage({
  destination(req, file, cb) {
    const key = String(req.body.key || '');
    if (!validSiteKey(key)) return cb(new Error('Vị trí ảnh không hợp lệ.'));
    const dir = path.join(UPLOAD_DIR, 'site');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const key = String(req.body.key || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, 'site-' + key + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + safeExtension(file.originalname));
  }
});
const siteUpload = multer({
  storage: siteStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ nhận JPG, PNG hoặc WEBP.'));
  }
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(function(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

/* ---------- public static files: explicit allowlist ----------
   Only the site's pages and its css/, js/ and assets/ folders are public.
   Everything else in the project folder (data/, tools/, .claude/, *.md,
   server and deploy configuration, package files, dotfiles) returns 404. */
const PUBLIC_PAGES = new Set(fs.readdirSync(ROOT).filter(f => /^[a-z0-9-]+\.html$/.test(f)));
const staticOpts = { dotfiles: 'deny', index: false, redirect: false };
app.use('/css', express.static(path.join(ROOT, 'css'), staticOpts));
app.use('/js', express.static(path.join(ROOT, 'js'), staticOpts));
app.get('/site-image-slots.json', (req, res) => res.sendFile(path.join(ROOT, 'site-image-slots.json')));
app.use('/assets', express.static(path.join(ROOT, 'assets'), staticOpts));
/* Uploaded photos only; manifest.json and any non-image file stay private. */
app.use('/uploads', function(req, res, next) {
  if (!/\.(?:jpe?g|png|webp)$/i.test(req.path)) return res.sendStatus(404);
  next();
}, express.static(UPLOAD_DIR, Object.assign({ maxAge: '1h' }, staticOpts)));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
/* No favicon file exists; answer quietly instead of a 404 on every page view. */
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/:page', (req, res, next) => {
  const raw = req.params.page;
  const file = /\.html$/.test(raw) ? raw : raw + '.html';   /* clean URLs: /hotels -> hotels.html */
  if (!PUBLIC_PAGES.has(file)) return next();
  res.sendFile(path.join(ROOT, file));
});

function publicCatalog() {
  const branches = Object.entries(rateData.branches || {}).map(([hotelId, b]) => {
    const stored = collectionImages.hotels && collectionImages.hotels[hotelId];
    const propertyImages = Array.isArray(imageOverrides.property && imageOverrides.property[hotelId]) && imageOverrides.property[hotelId].length
      ? imageOverrides.property[hotelId].map(x => Object.assign({ category: 'other' }, x, { category: PROPERTY_IMAGE_CATEGORIES.has(x.category) ? x.category : 'other' }))
      : (stored && Array.isArray(stored.gallery)
        ? stored.gallery.map(x => ({ id: x.id, url: x.url, name: x.originalName, originalName: x.originalName, filename: x.filename, category: PROPERTY_IMAGE_CATEGORIES.has(x.category) ? x.category : 'other', source: 'upload' }))
        : []);
    const heroId = (stored && stored.heroId) || '';
    const heroIndex = heroId ? propertyImages.findIndex(x => x.id === heroId) : -1;
    const orderedPropertyImages = heroIndex > 0
      ? [propertyImages[heroIndex]].concat(propertyImages.slice(0, heroIndex), propertyImages.slice(heroIndex + 1))
      : propertyImages;
    const hero = orderedPropertyImages[0] || null;
    return {
    hotelId,
    address: b.address,
    gid: b.gid || null,
    propertyHeroId: hero ? hero.id : null,
    propertyHeroUrl: hero ? hero.url : null,
    collectionImage: hero ? hero.url : ((imageOverrides.collection && imageOverrides.collection[hotelId] && imageOverrides.collection[hotelId].url)
      || (stored ? stored.url : null)),
    propertyImages: orderedPropertyImages,
    rooms: (b.sheetRooms || []).map(r => {
      const key = hotelId + ':' + r.stt;
      const rates = effectiveRates(key, r);
      const overrideImages = imageOverrides.rooms && Array.isArray(imageOverrides.rooms[key]) ? imageOverrides.rooms[key] : [];
      return {
        key,
        stt: r.stt,
        ez: r.ez,
        name: r.name,
        rates,
        images: overrideImages.length
          ? overrideImages
          : (uploads.rooms[key] || []).map(x => ({ id: x.id, url: x.url, name: x.originalName }))
      };
    })
  };
  });
  const collection = {};
  Object.entries(rateData.branches || {}).forEach(([hotelId]) => {
    const branch = branches.find(x => x.hotelId === hotelId);
    const override = imageOverrides.collection && imageOverrides.collection[hotelId];
    const stored = collectionImages.hotels && collectionImages.hotels[hotelId];
    if (branch && branch.collectionImage) collection[hotelId] = branch.collectionImage;
    else if (override && override.url) collection[hotelId] = override.url;
    else if (stored && stored.url) collection[hotelId] = stored.url;
  });
  return {
    siteImages: imageOverrides.site || {},
    generatedAt: new Date().toISOString(),
    source: rateData.source,
    policy: rateData.policy,
    seasons: rateData.seasons,
    branches,
    collectionImages: collection
  };
}

app.get('/api/catalog', (req, res) => res.json(publicCatalog()));
app.get('/api/admin/status', auth, (req, res) => res.json({ ok: true, admin: true, publicPath: '/reference.html' }));
app.get('/api/admin/image-overrides', auth, (req, res) => res.json(imageOverrides));

function validImageUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'https:' && !!u.hostname;
  } catch (_) { return false; }
}
function validImageScope(scope) { return scope === 'collection' || scope === 'property' || scope === 'rooms' || scope === 'site'; }
function validSiteKey(key) { return /^[a-z0-9][a-z0-9._:-]{1,120}$/i.test(String(key || '')); }
function validImageKey(scope, key) {
  if (scope === 'collection' || scope === 'property') return isBranch(key);
  if (scope === 'site') return validSiteKey(key);
  return roomIndex.has(key);
}
function saveImageOverride(scope, key, url, name, replaceId, category) {
  if (!validImageScope(scope) || !validImageKey(scope, key)) throw new Error('Đối tượng ảnh không hợp lệ.');
  if (!validImageUrl(url)) throw new Error('URL ảnh phải là HTTPS hợp lệ.');
  if (!imageOverrides[scope] || typeof imageOverrides[scope] !== 'object') imageOverrides[scope] = {};
  const item = { id: crypto.randomUUID(), url: String(url).trim(), name: String(name || 'URL image').slice(0, 180), updatedAt: new Date().toISOString(), source: 'admin-url' };
  if (scope === 'property') item.category = PROPERTY_IMAGE_CATEGORIES.has(String(category || '')) ? String(category) : 'other';
  if (scope === 'collection' || scope === 'site') imageOverrides[scope][key] = item;
  else {
    if (!Array.isArray(imageOverrides[scope][key])) imageOverrides[scope][key] = [];
    const arr = imageOverrides[scope][key];
    if (replaceId) {
      const idx = arr.findIndex(x => x.id === replaceId);
      if (idx < 0) throw new Error('Không tìm thấy URL ảnh cần thay.');
      arr[idx] = item;
    } else arr.push(item);
  }
  writeJsonAtomic(IMAGE_OVERRIDE_FILE, imageOverrides);
  return item;
}
app.post('/api/admin/image-url', auth, (req, res) => {
  try {
    const scope = String(req.body.scope || '');
    const key = String(req.body.key || '');
    const item = saveImageOverride(scope, key, req.body.url, req.body.name, req.body.replaceId || '', req.body.category);
    res.json({ ok: true, scope, key, item });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/admin/image-url/:scope/:key/:id', auth, (req, res) => {
  const scope = String(req.params.scope || ''), key = String(req.params.key || ''), id = String(req.params.id || '');
  if (!validImageScope(scope) || !validImageKey(scope, key)) return res.status(400).json({ error: 'Đối tượng ảnh không hợp lệ.' });
  if (scope === 'collection' || scope === 'site') {
    if (!imageOverrides[scope] || !imageOverrides[scope][key] || imageOverrides[scope][key].id !== id) return res.status(404).json({ error: 'Không tìm thấy URL ảnh.' });
    delete imageOverrides[scope][key];
  } else {
    const arr = imageOverrides[scope] && imageOverrides[scope][key];
    if (scope === 'property' && collectionImages.hotels && collectionImages.hotels[key] && collectionImages.hotels[key].heroId === id) return res.status(409).json({ error: 'Không thể xóa ảnh Hero. Hãy chọn ảnh Hero khác trước.' });
    if (!Array.isArray(arr)) return res.status(404).json({ error: 'Không tìm thấy URL ảnh.' });
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Không tìm thấy URL ảnh.' });
    arr.splice(idx, 1);
    if (!arr.length) delete imageOverrides[scope][key];
  }
  writeJsonAtomic(IMAGE_OVERRIDE_FILE, imageOverrides);
  res.json({ ok: true });
});

app.post('/api/admin/upload', auth, (req, res) => {
  upload.array('images', 10)(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const key = String(req.body.roomKey || '');
    const room = roomIndex.get(key);
    if (!room) {
      (req.files || []).forEach(f => removeUploadedFile(f.path));
      return res.status(400).json({ error: 'Hạng phòng không hợp lệ.' });
    }
    if (!verifyImages(req.files)) return res.status(400).json({ error: 'Chỉ nhận JPG, PNG hoặc WEBP.' });
    if (!uploads.rooms || typeof uploads.rooms !== 'object') uploads.rooms = {};
    if (!uploads.rooms[key]) uploads.rooms[key] = [];
    (req.files || []).forEach(file => {
      uploads.rooms[key].push({
        id: crypto.randomUUID(),
        originalName: file.originalname,
        filename: file.filename,
        url: '/uploads/' + room.hotelId + '/' + room.stt + '/' + file.filename,
        uploadedAt: new Date().toISOString()
      });
    });
    writeJsonAtomic(UPLOAD_FILE, uploads);
    res.json({ ok: true, roomKey: key, added: (req.files || []).length, images: uploads.rooms[key] });
  });
});

app.delete('/api/admin/upload/:id', auth, (req, res) => {
  let found = null;
  Object.entries(uploads.rooms).some(([key, arr]) => {
    const idx = arr.findIndex(x => x.id === req.params.id);
    if (idx < 0) return false;
    found = { key, idx, item: arr[idx] };
    return true;
  });
  if (!found) return res.status(404).json({ error: 'Không tìm thấy ảnh.' });
  removeUploadedFile(uploadPathFromUrl(found.item.url));
  uploads.rooms[found.key].splice(found.idx, 1);
  writeJsonAtomic(UPLOAD_FILE, uploads);
  res.json({ ok: true });
});

app.post('/api/admin/site-image', auth, (req, res) => {
  siteUpload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const key = String(req.body.key || '');
    if (!validSiteKey(key)) { if (req.file) removeUploadedFile(req.file.path); return res.status(400).json({ error: 'Vị trí ảnh không hợp lệ.' }); }
    if (!req.file) return res.status(400).json({ error: 'Hãy chọn ảnh.' });
    if (!verifyImages([req.file])) return res.status(400).json({ error: 'Chỉ nhận JPG, PNG hoặc WEBP.' });
    const old = imageOverrides.site && imageOverrides.site[key];
    if (old && old.source === 'admin-upload' && old.url) removeUploadedFile(uploadPathFromUrl(old.url));
    const item = { id: crypto.randomUUID(), filename: req.file.filename, originalName: req.file.originalname, url: '/uploads/site/' + req.file.filename, name: req.file.originalname, updatedAt: new Date().toISOString(), source: 'admin-upload' };
    imageOverrides.site[key] = item;
    writeJsonAtomic(IMAGE_OVERRIDE_FILE, imageOverrides);
    res.json({ ok: true, key, item });
  });
});

app.delete('/api/admin/site-image/:key', auth, (req, res) => {
  const key = String(req.params.key || '');
  if (!validSiteKey(key)) return res.status(400).json({ error: 'Vị trí ảnh không hợp lệ.' });
  const item = imageOverrides.site && imageOverrides.site[key];
  if (!item) return res.status(404).json({ error: 'Chưa có ảnh tùy chỉnh.' });
  if (item.source === 'admin-upload' && item.url) removeUploadedFile(uploadPathFromUrl(item.url));
  delete imageOverrides.site[key];
  writeJsonAtomic(IMAGE_OVERRIDE_FILE, imageOverrides);
  res.json({ ok: true });
});

app.put('/api/admin/room-rates', auth, (req, res) => {
  const key = String(req.body.roomKey || '');
  const room = roomIndex.get(key);
  if (!room) return res.status(400).json({ error: 'Hạng phòng không hợp lệ.' });
  const next = {};
  for (const season of ['jul_sep', 'oct', 'nov_jan']) {
    const pair = normalizePair(req.body.rates && req.body.rates[season]);
    if (!pair) return res.status(400).json({ error: 'Giá của ' + season + ' phải gồm 2 số không âm.' });
    next[season] = pair;
  }
  if (!rateOverrides.rooms || typeof rateOverrides.rooms !== 'object') rateOverrides.rooms = {};
  rateOverrides.rooms[key] = next;
  writeJsonAtomic(RATE_OVERRIDE_FILE, rateOverrides);
  res.json({ ok: true, roomKey: key, rates: effectiveRates(key, room) });
});

app.post('/api/admin/collection-image', auth, (req, res) => {
  collectionUpload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const hotelId = String(req.body.hotelId || '');
    if (!isBranch(hotelId)) {
      if (req.file) removeUploadedFile(req.file.path);
      return res.status(400).json({ error: 'Chi nhánh không hợp lệ.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Hãy chọn ảnh.' });
    if (!verifyImages([req.file])) return res.status(400).json({ error: 'Chỉ nhận JPG, PNG hoặc WEBP.' });
    const old = collectionImages.hotels && collectionImages.hotels[hotelId];
    if (old && old.filename) removeUploadedFile(uploadPathFromUrl('/uploads/collection/' + hotelId + '/' + old.filename));
    const item = {
      id: crypto.randomUUID(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: '/uploads/collection/' + hotelId + '/' + req.file.filename,
      uploadedAt: new Date().toISOString(),
      gallery: old && Array.isArray(old.gallery) ? old.gallery : []
    };
    if (!collectionImages.hotels) collectionImages.hotels = {};
    collectionImages.hotels[hotelId] = item;
    writeJsonAtomic(COLLECTION_FILE, collectionImages);
    res.json({ ok: true, hotelId, image: item });
  });
});

app.post('/api/admin/property-images', auth, (req, res) => {
  propertyUpload.array('images', 20)(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const hotelId = String(req.body.hotelId || '');
    if (!isBranch(hotelId)) {
      (req.files || []).forEach(f => removeUploadedFile(f.path));
      return res.status(400).json({ error: 'Chi nhánh không hợp lệ.' });
    }
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Hãy chọn ít nhất 1 ảnh.' });
    if (!verifyImages(req.files)) return res.status(400).json({ error: 'Chỉ nhận JPG, PNG hoặc WEBP.' });
    if (!collectionImages.hotels) collectionImages.hotels = {};
    if (!collectionImages.hotels[hotelId]) collectionImages.hotels[hotelId] = {};
    if (!Array.isArray(collectionImages.hotels[hotelId].gallery)) collectionImages.hotels[hotelId].gallery = [];
    const category = PROPERTY_IMAGE_CATEGORIES.has(String(req.body.category || '')) ? String(req.body.category) : 'other';
    req.files.forEach(file => {
      collectionImages.hotels[hotelId].gallery.push({
        id: crypto.randomUUID(),
        filename: file.filename,
        originalName: file.originalname,
        filename: file.filename,
        category,
        url: '/uploads/property/' + hotelId + '/' + file.filename,
        uploadedAt: new Date().toISOString()
      });
    });
    writeJsonAtomic(COLLECTION_FILE, collectionImages);
    res.json({ ok: true, hotelId, added: req.files.length,
      images: collectionImages.hotels[hotelId].gallery });
  });
});

app.put('/api/admin/property-images/order', auth, (req, res) => {
  const hotelId = String(req.body.hotelId || '');
  const order = Array.isArray(req.body.order) ? req.body.order.map(String) : [];
  if (!isBranch(hotelId) || !order.length) return res.status(400).json({ error: 'Danh sách thứ tự ảnh không hợp lệ.' });
  const current = Array.isArray(imageOverrides.property && imageOverrides.property[hotelId]) && imageOverrides.property[hotelId].length
    ? imageOverrides.property[hotelId]
    : ((collectionImages.hotels && collectionImages.hotels[hotelId] && collectionImages.hotels[hotelId].gallery) || []);
  if (current.length !== order.length || current.some(x => !order.includes(String(x.id))) || new Set(order).size !== order.length) {
    return res.status(400).json({ error: 'Thứ tự ảnh không khớp gallery hiện tại.' });
  }
  const byId = new Map(current.map(x => [String(x.id), x]));
  const next = order.map(id => byId.get(id));
  if (imageOverrides.property && Array.isArray(imageOverrides.property[hotelId]) && imageOverrides.property[hotelId].length) {
    imageOverrides.property[hotelId] = next;
    writeJsonAtomic(IMAGE_OVERRIDE_FILE, imageOverrides);
  } else {
    if (!collectionImages.hotels) collectionImages.hotels = {};
    if (!collectionImages.hotels[hotelId]) collectionImages.hotels[hotelId] = {};
    collectionImages.hotels[hotelId].gallery = next;
    writeJsonAtomic(COLLECTION_FILE, collectionImages);
  }
  res.json({ ok: true, hotelId, images: next });
});

app.put('/api/admin/property-images/hero', auth, (req, res) => {
  const hotelId = String(req.body.hotelId || ''), imageId = String(req.body.imageId || '');
  if (!isBranch(hotelId) || !imageId) return res.status(400).json({ error: 'Khách sạn hoặc ảnh Hero không hợp lệ.' });
  const current = Array.isArray(imageOverrides.property && imageOverrides.property[hotelId]) && imageOverrides.property[hotelId].length
    ? imageOverrides.property[hotelId]
    : ((collectionImages.hotels && collectionImages.hotels[hotelId] && collectionImages.hotels[hotelId].gallery) || []);
  const hero = current.find(x => String(x.id) === imageId);
  if (!hero) return res.status(404).json({ error: 'Không tìm thấy ảnh trong gallery.' });
  if (!collectionImages.hotels) collectionImages.hotels = {};
  if (!collectionImages.hotels[hotelId]) collectionImages.hotels[hotelId] = {};
  collectionImages.hotels[hotelId].heroId = hero.id;
  writeJsonAtomic(COLLECTION_FILE, collectionImages);
  res.json({ ok: true, hotelId, heroId: hero.id, heroUrl: hero.url });
});

app.delete('/api/admin/property-images/:id', auth, (req, res) => {
  let found = null;
  Object.entries(collectionImages.hotels || {}).some(([hotelId, item]) => {
    const gallery = Array.isArray(item.gallery) ? item.gallery : [];
    const idx = gallery.findIndex(x => x.id === req.params.id);
    if (idx < 0) return false;
    found = { hotelId, idx, item: gallery[idx] };
    return true;
  });
  if (!found) return res.status(404).json({ error: 'Không tìm thấy ảnh nội thất/khách sạn.' });
  const hotelConfig = collectionImages.hotels && collectionImages.hotels[found.hotelId];
  if (hotelConfig && hotelConfig.heroId === found.item.id) return res.status(409).json({ error: 'Không thể xóa ảnh Hero. Hãy chọn ảnh Hero khác trước.' });
  removeUploadedFile(uploadPathFromUrl(found.item.url));
  collectionImages.hotels[found.hotelId].gallery.splice(found.idx, 1);
  writeJsonAtomic(COLLECTION_FILE, collectionImages);
  res.json({ ok: true });
});

app.delete('/api/admin/collection-image/:hotelId', auth, (req, res) => {
  const hotelId = String(req.params.hotelId || '');
  if (!isBranch(hotelId)) return res.status(400).json({ error: 'Chi nhánh không hợp lệ.' });
  const old = collectionImages.hotels && collectionImages.hotels[hotelId];
  if (!old) return res.status(404).json({ error: 'Chi nhánh chưa có ảnh collection riêng.' });
  if (old.filename) removeUploadedFile(uploadPathFromUrl('/uploads/collection/' + hotelId + '/' + old.filename));
  const gallery = Array.isArray(old.gallery) ? old.gallery : [];
  if (gallery.length) {
    collectionImages.hotels[hotelId] = { gallery: gallery };
  } else {
    delete collectionImages.hotels[hotelId];
  }
  writeJsonAtomic(COLLECTION_FILE, collectionImages);
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'KAS Hotel Collection', time: new Date().toISOString() }));
app.get('/reference', (req, res) => res.sendFile(path.join(ROOT, 'reference.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(ROOT, 'admin.html')));

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

app.listen(PORT, IS_PRODUCTION || ADMIN_KEY ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('KAS server running on http://localhost:' + PORT);
  console.log('Upload directory: ' + UPLOAD_DIR);
  console.log('Config directory: ' + CONFIG_DIR);
  console.log('Public reference: http://localhost:' + PORT + '/reference');
  console.log('Admin upload:     http://localhost:' + PORT + '/admin');
});
