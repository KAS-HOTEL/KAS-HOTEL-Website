/* KAS GUIDE — persistent language bridge
   Keeps the language selected on the hotel site when guests enter the guide.
*/
(function () {
  'use strict';

  var KEY = 'kas-language';

  function getStored() {
    var lang = '';
    try {
      lang = new URLSearchParams(window.location.search).get('lang') || '';
    } catch (e) {}
    if (!lang) {
      try { lang = localStorage.getItem(KEY) || ''; } catch (e) {}
    }
    if (!lang) {
      try {
        var m = document.cookie.match(/(?:^|; )kas-language=([^;]+)/);
        lang = m ? decodeURIComponent(m[1]) : '';
      } catch (e) {}
    }
    return String(lang).toLowerCase() === 'vi' ? 'vi' : 'en';
  }

  var lang = getStored();
  var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  /* server.js also serves clean URLs (/city-guidebook-vi); pair them as files. */
  if (file.indexOf('.') < 0) file += '.html';

  var pairs = {
    'city-guide.html': 'city-guide-vi.html',
    'city-guide-vi.html': 'city-guide.html',
    'city-guidebook.html': 'city-guidebook-vi.html',
    'city-guidebook-vi.html': 'city-guidebook.html',
    'after-dark-guide.html': 'after-dark-guide-vi.html',
    'after-dark-guide-vi.html': 'after-dark-guide.html'
  };

  var isViFile = /-vi\.html$/i.test(file);
  var target = lang === 'vi'
    ? (isViFile ? file : pairs[file] || file)
    : (isViFile ? pairs[file] || file : file);

  if (target !== file) {
    var hash = location.hash || '';
    location.replace(target + hash);
    return;
  }

  function save(next) {
    next = next === 'vi' ? 'vi' : 'en';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    try {
      document.cookie = KEY + '=' + encodeURIComponent(next) +
        '; path=/; max-age=31536000; SameSite=Lax';
    } catch (e) {}
  }

  // The current file is now the source of truth.
  save(isViFile ? 'vi' : 'en');

  function swapUrl(href) {
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return href;
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return href;
      var f = u.pathname.split('/').pop().toLowerCase();
      if (pairs[f]) {
        var desired = lang === 'vi'
          ? (/-vi\.html$/i.test(f) ? f : pairs[f])
          : (/-vi\.html$/i.test(f) ? pairs[f] : f);
        u.pathname = u.pathname.replace(f, desired);
        u.searchParams.delete('lang');
        return u.pathname.split('/').pop() + (u.search ? u.search : '') + (u.hash || '');
      }
    } catch (e) {}
    return href;
  }

  /* The place the reader is on: the URL's hash, else the entry nearest the top. */
  function currentAnchor() {
    if (location.hash && location.hash.length > 1) return location.hash;
    var entries = document.querySelectorAll('.entry[id], .cg-section[id]');
    var best = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].getBoundingClientRect().top <= 140) best = entries[i]; else break;
    }
    return best ? '#' + best.id : '';
  }

  /* The guidebook's breadcrumb names the entry being read, not always the first one. */
  function trackBreadcrumb() {
    var current = document.querySelector('.guide-breadcrumb .current');
    var entries = document.querySelectorAll('.entry[id]');
    if (!current || !entries.length) return;
    function titleOf(entry) {
      var h = entry.querySelector('h2, h3');
      return h ? h.textContent.trim() : '';
    }
    function show(entry) {
      if (!entry) return;
      var title = titleOf(entry);
      if (!title) return;
      current.textContent = title;
      current.setAttribute('href', '#' + entry.id);
    }
    function fromHash() {
      var id = decodeURIComponent((location.hash || '').slice(1));
      var entry = id ? document.getElementById(id) : null;
      if (entry && entry.classList.contains('entry')) { show(entry); return true; }
      return false;
    }
    var ticking = false;
    function fromScroll() {
      ticking = false;
      var best = entries[0];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].getBoundingClientRect().top <= 160) best = entries[i]; else break;
      }
      show(best);
    }
    if (!fromHash()) fromScroll();
    window.addEventListener('hashchange', function () { if (!fromHash()) fromScroll(); });
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(fromScroll); }
    }, { passive: true });
  }

  /* Opening #september-23-park directly: the browser jumps before the photos
     and web fonts above it have loaded, so the page can come to rest on the
     previous entry (Bến Thành về đêm). Re-align on the target as the page
     settles, unless the reader has started scrolling themselves. */
  function settleOnHash() {
    var id = decodeURIComponent((location.hash || '').slice(1));
    var target = id ? document.getElementById(id) : null;
    if (!target) return;
    var touched = false;
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
      window.addEventListener(type, function () { touched = true; }, { once: true, passive: true });
    });
    function align() {
      if (touched) return;
      var margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      if (Math.abs(target.getBoundingClientRect().top - margin) > 4) {
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
    align();
    window.addEventListener('load', align);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
    [400, 1200, 2500].forEach(function (ms) { setTimeout(align, ms); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[href]').forEach(function (a) {
      // The EN/VI switch must keep pointing at the other language.
      if (a.hasAttribute('data-kas-lang')) return;
      var href = a.getAttribute('href');
      a.setAttribute('href', swapUrl(href));
    });

    // Language links change the persistent preference and keep the reader on
    // the same place (#september-23-park stays #september-23-park).
    document.querySelectorAll('[data-kas-lang]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var next = a.getAttribute('data-kas-lang') === 'vi' ? 'vi' : 'en';
        save(next);
        var desired = next === 'vi'
          ? (isViFile ? file : pairs[file] || file)
          : (isViFile ? pairs[file] || file : file);
        e.preventDefault();
        location.href = desired + currentAnchor();
      });
    });

    trackBreadcrumb();
    settleOnHash();

    document.documentElement.setAttribute('data-kas-language', lang);
  });
})();
