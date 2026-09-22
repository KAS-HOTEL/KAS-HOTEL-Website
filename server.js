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
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || 'kas-admin-2026';
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_KEY) {
  console.error('ADMIN_KEY is required in production. Set it as an environment variable.');
  process.exit(1);
}

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

function auth(req, res, next) {
  if (req.get('x-admin-key') !== ADMIN_KEY) return res.status(401).json({ error: 'Sai mã quản trị.' });
  next();
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
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
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
    if (!rateData.branches || !rateData.branches[hotelId]) return cb(new Error('Chi nhánh không hợp lệ.'));
    const dir = path.join(UPLOAD_DIR, 'collection', hotelId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
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
    if (!rateData.branches || !rateData.branches[hotelId]) return cb(new Error('Chi nhánh không hợp lệ.'));
    const dir = path.join(UPLOAD_DIR, 'property', hotelId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
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

const app = express();
app.use(function(req, res, next) {
  if (/^\/(?:server\.js|package(?:\.json|-lock\.json)?|\.env(?:\..*)?)$/.test(req.path)) return res.sendStatus(404);
  if (req.path === '/uploads/manifest.json') return res.sendStatus(404);
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT, { extensions: ['html'] }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));

function publicCatalog() {
  const branches = Object.entries(rateData.branches || {}).map(([hotelId, b]) => ({
    hotelId,
    address: b.address,
    gid: b.gid || null,
    collectionImage: collectionImages.hotels && collectionImages.hotels[hotelId] ? collectionImages.hotels[hotelId].url : null,
    propertyImages: collectionImages.hotels && collectionImages.hotels[hotelId] && Array.isArray(collectionImages.hotels[hotelId].gallery)
      ? collectionImages.hotels[hotelId].gallery.map(x => ({ id: x.id, url: x.url, name: x.originalName }))
      : [],
    rooms: (b.sheetRooms || []).map(r => {
      const key = hotelId + ':' + r.stt;
      const rates = effectiveRates(key, r);
      return {
        key,
        stt: r.stt,
        ez: r.ez,
        name: r.name,
        rates,
        images: (uploads.rooms[key] || []).map(x => ({ id: x.id, url: x.url, name: x.originalName }))
      };
    })
  }));
  const collection = {};
  Object.entries(collectionImages.hotels || {}).forEach(([hotelId, item]) => { collection[hotelId] = item.url; });
  return {
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

app.post('/api/admin/upload', auth, (req, res) => {
  upload.array('images', 10)(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const key = String(req.body.roomKey || '');
    const room = roomIndex.get(key);
    if (!room) {
      (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
      return res.status(400).json({ error: 'Hạng phòng không hợp lệ.' });
    }
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
  const rel = found.item.url.replace(/^\/uploads\//, '');
  const file = path.join(UPLOAD_DIR, rel);
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
  uploads.rooms[found.key].splice(found.idx, 1);
  writeJsonAtomic(UPLOAD_FILE, uploads);
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
  rateOverrides.rooms[key] = next;
  writeJsonAtomic(RATE_OVERRIDE_FILE, rateOverrides);
  res.json({ ok: true, roomKey: key, rates: effectiveRates(key, room) });
});

app.post('/api/admin/collection-image', auth, (req, res) => {
  collectionUpload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const hotelId = String(req.body.hotelId || '');
    if (!rateData.branches || !rateData.branches[hotelId]) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(400).json({ error: 'Chi nhánh không hợp lệ.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Hãy chọn ảnh.' });
    const old = collectionImages.hotels && collectionImages.hotels[hotelId];
    if (old && old.filename) {
      const oldFile = path.join(UPLOAD_DIR, 'collection', hotelId, old.filename);
      try { if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile); } catch (_) {}
    }
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
    if (!rateData.branches || !rateData.branches[hotelId]) {
      (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
      return res.status(400).json({ error: 'Chi nhánh không hợp lệ.' });
    }
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Hãy chọn ít nhất 1 ảnh.' });
    if (!collectionImages.hotels) collectionImages.hotels = {};
    if (!collectionImages.hotels[hotelId]) collectionImages.hotels[hotelId] = {};
    if (!Array.isArray(collectionImages.hotels[hotelId].gallery)) collectionImages.hotels[hotelId].gallery = [];
    req.files.forEach(file => {
      collectionImages.hotels[hotelId].gallery.push({
        id: crypto.randomUUID(),
        filename: file.filename,
        originalName: file.originalname,
        url: '/uploads/property/' + hotelId + '/' + file.filename,
        uploadedAt: new Date().toISOString()
      });
    });
    writeJsonAtomic(COLLECTION_FILE, collectionImages);
    res.json({ ok: true, hotelId, added: req.files.length,
      images: collectionImages.hotels[hotelId].gallery });
  });
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
  const rel = String(found.item.url || '').replace(/^\/uploads\//, '');
  const file = path.join(UPLOAD_DIR, rel);
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
  collectionImages.hotels[found.hotelId].gallery.splice(found.idx, 1);
  writeJsonAtomic(COLLECTION_FILE, collectionImages);
  res.json({ ok: true });
});

app.delete('/api/admin/collection-image/:hotelId', auth, (req, res) => {
  const hotelId = String(req.params.hotelId || '');
  const old = collectionImages.hotels && collectionImages.hotels[hotelId];
  if (!old) return res.status(404).json({ error: 'Chi nhánh chưa có ảnh collection riêng.' });
  const oldFile = path.join(UPLOAD_DIR, 'collection', hotelId, old.filename || '');
  try { if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile); } catch (_) {}
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

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('KAS server running on http://localhost:' + PORT);
  console.log('Upload directory: ' + UPLOAD_DIR);
  console.log('Config directory: ' + CONFIG_DIR);
  console.log('Public reference: http://localhost:' + PORT + '/reference');
  console.log('Admin upload:     http://localhost:' + PORT + '/admin');
});
