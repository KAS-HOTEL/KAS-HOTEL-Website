/* ==========================================================================
   KAS — UTILITIES  (formatting, dates, icons, DOM, validation)
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- DOM ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- money ---------- */
  function vnd(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function priceHTML(n, cls) {
    return '<span class="' + (cls || 'price__v') + '">' + vnd(n) + '<sup>VND</sup></span>';
  }

  /* ---------- dates ---------- */
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function toISO(d) {
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isVietnamese() {
    try { return global.KAS_I18N && global.KAS_I18N.getLanguage && global.KAS_I18N.getLanguage() === 'vi'; } catch (e) { return false; }
  }
  function fmtDate(s) {
    var d = parseDate(s); if (!d) return '—';
    /* Always the English source format; i18n.js renders it as dd/mm/yyyy in VI.
       Formatting by language here left VI dates on screen after switching to EN. */
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtDateFull(s) {
    var d = parseDate(s); if (!d) return '—';
    if (isVietnamese()) {
      var VI_DAY = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
      return VI_DAY[d.getDay()] + ', ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth() + 1).padStart(2,'0') + '/' + d.getFullYear();
    }
    return DAY[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
  }
  function dayName(s) {
    var d = parseDate(s); return d ? DAY[d.getDay()] : '';
  }
  function nights(a, b) {
    var d1 = parseDate(a), d2 = parseDate(b);
    if (!d1 || !d2) return 0;
    return Math.max(0, Math.round((d2 - d1) / 86400000));
  }
  function addDays(s, n) {
    var d = parseDate(s); if (!d) return '';
    d.setDate(d.getDate() + n); return toISO(d);
  }
  function today() { return toISO(new Date()); }
  /** free-cancellation deadline = 18:00 the day before check-in */
  function cancelBy(checkIn) {
    var d = addDays(checkIn, -1);
    return '18:00, ' + fmtDate(d);
  }

  /* ---------- price engine ---------- */
  /**
   * @param {number} pricePerNight flat nightly rate (demo fallback)
   * @param {number} nightsN
   * @param {number} roomsN
   * @param {Object} [cfg]
   * @param {number[]} [nightlyRates] per-night rates from the operator rate
   *        sheet. When supplied these drive the subtotal, because the sheet
   *        prices weekdays and weekends differently.
   */
  function calcPrice(pricePerNight, nightsN, roomsN, cfg, nightlyRates) {
    cfg = cfg || (global.KAS_DATA && global.KAS_DATA.config) || { serviceChargeRate: .05, vatRate: .08 };
    var sub;
    if (nightlyRates && nightlyRates.length && nightlyRates.every(function (v) { return v != null; })) {
      sub = nightlyRates.reduce(function (a, b) { return a + b; }, 0) * (roomsN || 1);
    } else {
      sub = (pricePerNight || 0) * (nightsN || 0) * (roomsN || 1);
    }
    var svc = Math.round(sub * cfg.serviceChargeRate);
    var vat = Math.round((sub + svc) * cfg.vatRate);
    return {
      nightly: pricePerNight, nights: nightsN, rooms: roomsN,
      subtotal: sub, serviceCharge: svc, vat: vat, total: sub + svc + vat,
      serviceChargeRate: cfg.serviceChargeRate, vatRate: cfg.vatRate,
      nightlyRates: nightlyRates || null
    };
  }

  /* ---------- validation ---------- */
  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RE_PHONE = /^[0-9\s().+-]{6,20}$/;
  function isEmail(v) { return RE_EMAIL.test(String(v || '').trim()); }
  function isPhone(v) { return RE_PHONE.test(String(v || '').trim()) && (String(v).replace(/\D/g, '').length >= 6); }
  function notEmpty(v) { return String(v == null ? '' : v).trim().length > 0; }

  function setErr(input, msg) {
    if (!input) return;
    input.classList.add('is-err');
    input.setAttribute('aria-invalid', 'true');
    var m = (input.closest('.field') || input.parentNode).querySelector('.err-msg');
    if (m) { m.textContent = msg; m.classList.add('show'); }
  }
  function clearErr(input) {
    if (!input) return;
    input.classList.remove('is-err');
    input.removeAttribute('aria-invalid');
    var m = (input.closest('.field') || input.parentNode).querySelector('.err-msg');
    if (m) m.classList.remove('show');
  }
  function clearAllErrs(scope) {
    $$('.is-err', scope).forEach(function (i) { i.classList.remove('is-err'); i.removeAttribute('aria-invalid'); });
    $$('.err-msg.show', scope).forEach(function (m) { m.classList.remove('show'); });
  }

  /* ---------- query string ---------- */
  function qs() {
    var o = {}, s = location.search.replace(/^\?/, '');
    if (!s) return o;
    s.split('&').forEach(function (p) {
      var kv = p.split('=');
      /* a malformed %-escape must not throw and stop the whole page script */
      try { if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) {}
    });
    return o;
  }
  function buildQS(o) {
    return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&');
  }

  /* ---------- icons (Lucide-style line icons, currentColor) ---------- */
  var P = { f: 'none', s: 'currentColor', w: 1.5 };
  function svg(d, size) {
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="' + P.w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var ICONS = {
    pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
    cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    user:'<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    star:'<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none"/>',
    starO:'<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    wifi:'<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>',
    bed:'<path d="M2 4v16M2 8h18a2 2 0 012 2v10M2 17h20"/><circle cx="7" cy="12" r="2"/>',
    size:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    view:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/>',
    bath:'<path d="M4 12V5a2 2 0 013.4-1.4L9 5M2 12h20v3a5 5 0 01-5 5H7a5 5 0 01-5-5v-3zM6 20l-1 2M18 20l1 2"/>',
    coffee:'<path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>',
    check:'<path d="M20 6L9 17l-5-5"/>',
    checkC:'<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    tag:'<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/>',
    rot:'<path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/>',
    gift:'<rect x="2" y="7" width="20" height="5" rx="1"/><path d="M12 22V7M20 12v10H4V12M7.5 7a2.5 2.5 0 010-5C10 2 12 7 12 7M16.5 7a2.5 2.5 0 000-5C14 2 12 7 12 7"/>',
    crown:'<path d="M2 18h20M3 18l-1-9 5.5 4L12 5l4.5 8L22 9l-1 9"/>',
    globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z"/>',
    chevD:'<path d="M6 9l6 6 6-6"/>', chevR:'<path d="M9 18l6-6-6-6"/>', chevL:'<path d="M15 18l-6-6 6-6"/>',
    arrR:'<path d="M5 12h14M12 5l7 7-7 7"/>', arrL:'<path d="M19 12H5M12 19l-7-7 7-7"/>',
    arrU:'<path d="M12 19V5M5 12l7-7 7 7"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>', x:'<path d="M18 6L6 18M6 6l12 12"/>',
    menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    phone:'<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.2 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>',
    mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
    chat:'<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
    help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert:'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    heart:'<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>',
    print:'<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    dl:'<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    edit:'<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    filter:'<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    sort:'<path d="M3 6h18M6 12h12M10 18h4"/>',
    lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    card:'<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
    bank:'<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M9 10v11M15 10v11"/>',
    wallet:'<path d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5"/><circle cx="18" cy="14" r="1.4" fill="currentColor"/>',
    clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M15 8l2 2"/>',
    spark:'<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z"/>',
    dumb:'<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
    utensils:'<path d="M3 2v7a3 3 0 006 0V2M6 9v13M18 2a4 4 0 00-4 4v7h4v9"/>',
    car:'<path d="M5 17H3v-5l2-5h14l2 5v5h-2M5 17a2 2 0 104 0M15 17a2 2 0 104 0M9 17h6M5 12h14"/>',
    leaf:'<path d="M11 20A7 7 0 014 13c0-6 8-11 17-11 0 9-5 17-11 17-2 0-4-1-5-2M4 21c2-6 5-9 9-11"/>',
    fridge:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M8 6v2M8 13v3"/>',
    tv:'<rect x="2" y="7" width="20" height="13" rx="2"/><path d="M7 3l5 4 5-4"/>',
    ac:'<rect x="2" y="4" width="20" height="8" rx="2"/><path d="M6 16v1M10 16v2M14 16v2M18 16v1M5 8h14"/>',
    hair:'<path d="M8 4h9a4 4 0 010 8H8zM8 4v8M6 12l1 9h3l1-9"/>',
    safe:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 10v4"/>',
    sparkle2:'<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
    map:'<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/>',
    door:'<path d="M3 21h18M5 21V4a1 1 0 011-1h12a1 1 0 011 1v17"/><circle cx="15" cy="12" r="1" fill="currentColor"/>',
    home:'<path d="M3 10.5L12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
    send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    bell:'<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>',
    fb:'<path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>',
    ig:'<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>',
    yt:'<path d="M22.5 7.5a2.8 2.8 0 00-2-2C18.8 5 12 5 12 5s-6.8 0-8.5.5a2.8 2.8 0 00-2 2A29 29 0 001 12a29 29 0 00.5 4.5 2.8 2.8 0 002 2C5.2 19 12 19 12 19s6.8 0 8.5-.5a2.8 2.8 0 002-2A29 29 0 0023 12a29 29 0 00-.5-4.5z"/><path d="M10 15l5-3-5-3z" fill="currentColor"/>',
    tiktok:'<path d="M9 12a4 4 0 104 4V4a5 5 0 005 5"/>'
  };
  function icon(name, size) {
    return ICONS[name] ? svg(ICONS[name], size) : '';
  }
  function stars(n, size) {
    var out = '', full = Math.round(n || 0);
    for (var i = 1; i <= 5; i++) out += svg(i <= full ? ICONS.star : ICONS.starO, size || 12);
    return '<span class="stars">' + out + '</span>';
  }

  /* ---------- image with candidate chain + branded fallback ----------
     Sources publish these assets at several render sizes. We request the
     largest, then step down through sizes we actually OBSERVED on the source
     page, and only then fall back to a branded placeholder. The placeholder
     is designed to look intentional — never a broken-image box.
     --------------------------------------------------------------------- */

  function placeholderHTML(label) {
    return '<div class="imgfall">' +
      '<div><svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true">' +
        '<path d="M20 3l15 8.6v16.8L20 37 5 28.4V11.6L20 3z" stroke="currentColor" stroke-width="1" opacity=".85"/>' +
        '<path d="M16 14v12M16 20l7-6M16 20l7 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>' +
      (label ? '<span>' + esc(label) + '</span>' +
               '<span style="opacity:.5">Photo unavailable from source</span>' : '') +
      '</div></div>';
  }

  /** Build the ordered list of URLs to try for one asset. */
  function candidates(src) {
    var list = [src];
    // trip.com CDN: <id>_R_<w>_<h>_R5_D.jpg — step down to observed sizes
    var m = /^(https:\/\/ak-d\.tripcdn\.com\/images\/[^_]+)_R_\d+_\d+_R5_D\.jpg$/.exec(src);
    if (m) {
      ['960_660', '600_360', '339_206'].forEach(function (sz) {
        var u = m[1] + '_R_' + sz + '_R5_D.jpg';
        if (list.indexOf(u) < 0) list.push(u);
      });
    }
    return list;
  }

  /**
   * @param {string} src   preferred URL
   * @param {string} alt   alt text
   * @param {string} cls   extra classes
   * @param {boolean} lazy default true
   * @param {string} label caption shown on the branded placeholder
   */
  function img(src, alt, cls, lazy, label) {
    var lbl = label === false ? '' : (label || alt || '');
    if (!src) return placeholderHTML(lbl);
    var chain = candidates(src);
    return '<img src="' + esc(chain[0]) + '" alt="' + esc(alt || '') + '"' +
      (cls ? ' class="' + cls + '"' : '') +
      (lazy === false ? '' : ' loading="lazy"') +
      ' decoding="async"' +
      /* Hotlinked OTA/CDN photos: send no referrer, which some CDNs require for cross-site images. */
      (/^https?:\/\//i.test(chain[0]) ? ' referrerpolicy="no-referrer"' : '') +
      ' data-fb="' + esc(chain.slice(1).join('|')) + '"' +
      ' data-fblabel="' + esc(lbl) + '"' +
      ' onerror="window.U&&U.imgError(this)">';
  }

  /** onerror handler: advance the candidate chain, else swap in placeholder. */
  function imgError(node) {
    if (!node || node.dataset.fbDone) return;
    var rest = (node.dataset.fb || '').split('|').filter(Boolean);
    if (rest.length) {
      node.src = rest.shift();
      node.dataset.fb = rest.join('|');
      return;
    }
    node.dataset.fbDone = '1';
    node.onerror = null;
    var parent = node.parentNode;
    if (!parent || parent.querySelector('.imgfall')) { node.style.display = 'none'; return; }
    // The placeholder fills its container absolutely, so the container must be
    // a positioning context. Many wrappers are plain divs — promote them here
    // rather than trying to enumerate every container in CSS.
    try {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    } catch (e) {}
    node.insertAdjacentHTML('afterend', placeholderHTML(node.dataset.fblabel));
    node.style.display = 'none';
  }

  /* ---------- toast ---------- */
  function toast(msg, ms) {
    var wrap = $('.toasts');
    if (!wrap) { wrap = el('div', { class: 'toasts' }); document.body.appendChild(wrap); }
    var t = el('div', { class: 'toast' }, icon('checkC', 17) + '<span>' + esc(msg) + '</span>');
    wrap.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 320);
    }, ms || 3200);
  }

  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, c = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 160);
    };
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  global.U = {
    $: $, $$: $$, el: el, esc: esc, vnd: vnd, priceHTML: priceHTML,
    parseDate: parseDate, toISO: toISO, fmtDate: fmtDate, fmtDateFull: fmtDateFull,
    dayName: dayName, nights: nights, addDays: addDays, today: today, cancelBy: cancelBy,
    calcPrice: calcPrice, isEmail: isEmail, isPhone: isPhone, notEmpty: notEmpty,
    setErr: setErr, clearErr: clearErr, clearAllErrs: clearAllErrs,
    qs: qs, buildQS: buildQS, icon: icon, stars: stars, img: img,
    imgError: imgError, placeholderHTML: placeholderHTML, candidates: candidates,
    toast: toast, debounce: debounce, initials: initials, MON: MON, DAY: DAY
  };
})(window);
