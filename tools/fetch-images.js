#!/usr/bin/env node
/* =========================================================================
   KAS — vendor remote photos into the local project
   -------------------------------------------------------------------------
   The build sandbox blocked egress to the image CDNs, so images are hotlinked
   by default. Run this from a machine with open internet to download them to
   assets/images/hotels/hotel-NN/ and rewrite js/data.js to use local paths.

       node tools/fetch-images.js            # download + report
       node tools/fetch-images.js --rewrite  # also repoint data.js at /assets

   Every file is written under its OWN hotel's folder — images are never
   shared between branches.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'js', 'data.js'));
const D = global.window.KAS_DATA;

const REWRITE = process.argv.includes('--rewrite');
const OUT = path.join(ROOT, 'assets', 'images', 'hotels');

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'));
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8' },
      timeout: 20000
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: res.headers['content-type'] || '' }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const map = {};
  let ok = 0, bad = 0;

  for (const h of D.hotels) {
    const dir = path.join(OUT, h.id);
    fs.mkdirSync(dir, { recursive: true });
    console.log('\n' + h.branchCode + '  ' + h.name);
    for (let i = 0; i < h.images.length; i++) {
      const url = h.images[i];
      const name = (i === 0 ? 'hotel-cover' : 'hotel-' + String(i).padStart(2, '0'));
      try {
        const r = await get(url);
        if (!/^image\//.test(r.type)) throw new Error('not an image (' + r.type + ')');
        const ext = /png/.test(r.type) ? '.png' : /webp/.test(r.type) ? '.webp' : '.jpg';
        const file = name + ext;
        fs.writeFileSync(path.join(dir, file), r.buf);
        map[url] = 'assets/images/hotels/' + h.id + '/' + file;
        ok++;
        console.log('   ✓ ' + file.padEnd(18) + (r.buf.length / 1024).toFixed(0) + ' KB');
      } catch (e) {
        bad++;
        console.log('   ✗ ' + name.padEnd(18) + e.message);
      }
    }
  }

  console.log('\n' + '='.repeat(52));
  console.log('downloaded ' + ok + ', failed ' + bad);
  fs.writeFileSync(path.join(ROOT, 'tools', 'image-map.json'), JSON.stringify(map, null, 2));
  console.log('wrote tools/image-map.json');

  if (REWRITE && ok) {
    const p = path.join(ROOT, 'js', 'data.js');
    let src = fs.readFileSync(p, 'utf8');
    // Swap the CDN builder for a local-path builder; ids stay untouched.
    src = src.replace(
      /function tcdn\(id, w, h\) \{[\s\S]*?\n  \}/,
      'function tcdn(id, w, h) {\n' +
      '    // Rewritten by tools/fetch-images.js — images are vendored locally.\n' +
      '    return LOCAL[id] || (\'https://ak-d.tripcdn.com/images/\' + id + \'_R_\' + w + \'_\' + h + \'_R5_D.jpg\');\n  }'
    );
    fs.writeFileSync(p, src);
    console.log('rewrote js/data.js — review the diff before committing.');
  } else if (ok) {
    console.log('run again with --rewrite to repoint js/data.js at the local files.');
  }
})();
