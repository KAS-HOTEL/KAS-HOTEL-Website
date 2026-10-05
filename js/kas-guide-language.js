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

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      a.setAttribute('href', swapUrl(href));
    });

    // Language links explicitly change the persistent preference.
    document.querySelectorAll('[data-kas-lang]').forEach(function (a) {
      a.addEventListener('click', function () {
        save(a.getAttribute('data-kas-lang'));
      });
    });

    document.documentElement.setAttribute('data-kas-language', lang);
  });
})();
