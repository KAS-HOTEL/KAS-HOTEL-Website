'use strict';

/*
 * Builds every favicon from the brand K mark (assets/logo/kas-k-mark.png, the
 * champagne K supplied by KAS on a transparent background).
 *
 * The mark is only trimmed to its own edges, scaled and centred. Its shape,
 * colours and proportions are never changed. Champagne on a white browser tab
 * is too faint at 16 px, so every icon sits on brand Charcoal #20241F.
 *
 *   node tools/build-favicons.js
 *
 * Writes:
 *   assets/favicon/favicon.ico            16, 32, 48 (PNG-in-ICO)
 *   assets/favicon/favicon-16x16.png
 *   assets/favicon/favicon-32x32.png
 *   assets/favicon/apple-touch-icon.png   180, full-bleed (iOS rounds it)
 *   src/app/favicon.ico, icon.png, apple-icon.png   for the Next.js console
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'logo', 'kas-k-mark.png');
const SITE_OUT = path.join(ROOT, 'assets', 'favicon');
const CONSOLE_OUT = path.join(ROOT, 'src', 'app');
const CHARCOAL = '#20241F';

/* Share of the canvas width the K may fill. Tab icons use almost all of it so the
   K stays legible at 16 px; the home-screen icon keeps a margin for iOS masking. */
const TAB_FILL = 0.84;
const TOUCH_FILL = 0.66;

async function trimmedMark() {
  /* Crop to the K's own edges, found on the alpha channel: the source has no
     white, only transparency (sharp's trim() compares colour, not alpha). */
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 8) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) throw new Error('The K mark source image is empty.');
  return sharp(SOURCE).ensureAlpha()
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png().toBuffer();
}

async function render(mark, size, fill, rounded) {
  const meta = await sharp(mark).metadata();
  const scale = (size * fill) / Math.max(meta.width, meta.height);
  const w = Math.max(1, Math.round(meta.width * scale));
  const h = Math.max(1, Math.round(meta.height * scale));
  const glyph = await sharp(mark).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
  const radius = rounded ? Math.round(size * 0.18) : 0;
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${CHARCOAL}"/></svg>`);
  return sharp(background)
    .composite([{ input: glyph, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/* ICO container holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  const mark = await trimmedMark();
  fs.mkdirSync(SITE_OUT, { recursive: true });
  const tab = {};
  for (const size of [16, 32, 48]) tab[size] = await render(mark, size, TAB_FILL, true);
  const touch = await render(mark, 180, TOUCH_FILL, false);
  const favicon = ico([16, 32, 48].map((size) => ({ size, png: tab[size] })));

  const files = {
    [path.join(SITE_OUT, 'favicon.ico')]: favicon,
    [path.join(SITE_OUT, 'favicon-16x16.png')]: tab[16],
    [path.join(SITE_OUT, 'favicon-32x32.png')]: tab[32],
    [path.join(SITE_OUT, 'apple-touch-icon.png')]: touch,
    [path.join(CONSOLE_OUT, 'favicon.ico')]: favicon,
    [path.join(CONSOLE_OUT, 'icon.png')]: tab[32],
    [path.join(CONSOLE_OUT, 'apple-icon.png')]: touch,
  };
  for (const [file, data] of Object.entries(files)) {
    fs.writeFileSync(file, data);
    console.log('wrote', path.relative(ROOT, file), data.length, 'bytes');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
