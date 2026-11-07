/* ==========================================================================
   KAS CITY GUIDE — Guide Book (design V9)
   Renders the 40 places of window.KAS_GUIDE_DATA as an open book, one place
   per spread. Behaviour kept from V9: prev/next, ←/→ keys, counter, page-turn
   animation (off with prefers-reduced-motion). Added for the real site:
   chapter tabs, place list, deep links (#place, #chapter, ?place=), touch
   swipe, EN/VI from the site language, Admin photos (guidebook.entry.<id>).
   ========================================================================== */
(function () {
  'use strict';
  var DATA = window.KAS_GUIDE_DATA;
  var root = document.getElementById('kasGuideBook');
  if (!DATA || !root) return;

  var CHAPTERS = ['city', 'taste', 'slow', 'night'];
  var COPY = {
    en: {
      heroKicker: 'KAS Guide Book', heroTitle: 'City Guide', heroSub: 'A journey through the city · Discover Saigon with KAS',
      tabs: { city: 'Central Saigon', taste: 'Food & Local Life', slow: 'Walk & Discover', night: 'After Dark' }, placesCount: 'places',
      kicker: 'KAS Guide Book', field: 'KAS City Guide · Field notes',
      place: 'KAS City Guide', where: 'Saigon · Vietnam', stayIntro: 'Walking distances from the KAS hotels closest to this place.',
      stayNearby: 'Stay nearby', viewHotel: 'View hotel', goTo: 'Go to', prev: 'Previous page', next: 'Next page',
      caption: 'Use the arrows, your keyboard or swipe to turn the page', chapters: 'Chapters', places: 'Places in this chapter',
      book: 'KAS Guide Book'
    },
    vi: {
      heroKicker: 'KAS Guide Book', heroTitle: 'City Guide', heroSub: 'Hành trình qua Thành phố · Cẩm nang khám phá Sài Gòn cùng KAS',
      tabs: { city: 'Trung tâm Sài Gòn', taste: 'Ẩm thực & Nhịp sống', slow: 'Dạo bộ & Khám phá', night: 'Khi thành phố lên đèn' }, placesCount: 'địa điểm',
      kicker: 'Cẩm nang KAS', field: 'Cẩm nang KAS · Ghi chép',
      place: 'Cẩm nang KAS', where: 'Sài Gòn · Việt Nam', stayIntro: 'Quãng đi bộ từ các khách sạn KAS gần địa điểm này nhất.',
      stayNearby: 'Lưu trú gần đây', viewHotel: 'Xem khách sạn', goTo: 'Sang trang', prev: 'Trang trước', next: 'Trang tiếp',
      caption: 'Dùng nút mũi tên, bàn phím hoặc vuốt để lật trang', chapters: 'Chủ đề', places: 'Địa điểm trong chủ đề',
      book: 'Cẩm nang KAS'
    }
  };
  var ICONS = {
    best: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="7"/><path d="M16 1v5m0 20v5M1 16h5m20 0h5M5 5l4 4m14 14 4 4m0-22-4 4M9 23l-4 4"/></svg>',
    time: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12"/><path d="M16 8v9l6 3"/></svg>',
    note: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M16 14v8m0-13v2"/></svg>',
    tip: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 29s10-11 10-18A10 10 0 0 0 6 11c0 7 10 18 10 18Z"/><circle cx="16" cy="11" r="3"/></svg>'
  };

  /* Chapter tab icons: city buildings, fork & knife, leaf, map pin. */
  var TAB_ICONS = {
    city: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V8l5-3v16M10 21V3l9 4v14M13 9h3M13 13h3M13 17h3M7 11h1M7 15h1"/></svg>',
    taste: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v6a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M7 11v10M7 3v5M19 21V3c-2.2 1.4-3.5 3.8-3.5 6.5V14H19"/></svg>',
    slow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19C5 10 11 5 20 4c0 9-5 15-14 15h-1Z"/><path d="M5 19c3-4 6.5-7 10-9"/></svg>',
    night: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.4 7-12.5A7 7 0 0 0 5 9.5C5 14.6 12 22 12 22Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>'
  };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var siteImages = {};
  var index = 0;
  var flipTimer = null;

  function lang() {
    var l = window.KAS_I18N && window.KAS_I18N.getLanguage ? window.KAS_I18N.getLanguage() : document.documentElement.lang;
    return l === 'vi' ? 'vi' : 'en';
  }
  function places() { return DATA.places[lang()]; }
  function chapter(id) { return DATA.chapters[lang()][id] || {}; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function chapterLabel(id) { return (chapter(id).eyebrow || '').replace(/^\d+\s*\/\s*/, ''); }
  function photoFor(p) {
    var item = siteImages['guidebook.entry.' + p.id];
    return (item && item.url) ? String(item.url) : (chapter(p.chapter).image || '');
  }
  function hotelHref(id) { return id ? 'hotel-detail.html?hotel=' + encodeURIComponent(id) : ''; }

  var el = {
    hero: root.querySelector('[data-gb="hero"]'), kicker: root.querySelector('[data-gb="kicker"]'),
    sub: root.querySelector('[data-gb="sub"]'), title: root.querySelector('#gbPageTitle'), tabs: root.querySelector('[data-gb="tabs"]'),
    chapter: root.querySelector('[data-gb="chapter"]'), book: root.querySelector('[data-gb="book"]'),
    left: root.querySelector('[data-gb="left"]'), right: root.querySelector('[data-gb="right"]'),
    prev: root.querySelector('[data-gb="prev"]'), next: root.querySelector('[data-gb="next"]'),
    counter: root.querySelector('[data-gb="counter"]'), caption: root.querySelector('[data-gb="caption"]'),
    places: root.querySelector('[data-gb="places"]'), live: root.querySelector('[data-gb="live"]')
  };

  function renderTabs(current) {
    var c = COPY[lang()], list = places();
    el.tabs.setAttribute('aria-label', c.chapters);
    el.tabs.innerHTML = CHAPTERS.map(function (id) {
      var n = list.filter(function (p) { return p.chapter === id; }).length;
      return '<button type="button" class="gb-tab" data-chapter="' + id + '" aria-current="' + (id === current) + '" title="' + n + ' ' + esc(c.placesCount) + '">' +
        TAB_ICONS[id] + '<span>' + esc(c.tabs[id] || chapterLabel(id)) + '</span></button>';
    }).join('');
  }
  function renderChapter(id) {
    /* Chapter title + intro only; nearby hotels are shown inside the right page. */
    var ch = chapter(id);
    el.chapter.innerHTML = '<strong>' + esc(ch.title) + '</strong>' + esc(ch.intro);
  }
  function renderPlaces(p) {
    var c = COPY[lang()];
    el.places.setAttribute('aria-label', c.places);
    el.places.innerHTML = places().filter(function (x) { return x.chapter === p.chapter; }).map(function (x) {
      return '<li><a href="#' + esc(x.id) + '" data-place="' + esc(x.id) + '" aria-current="' + (x.id === p.id) + '">' + esc(x.title) + '</a></li>';
    }).join('');
  }

  function renderSpread() {
    var list = places(), p = list[index], c = COPY[lang()], ch = chapter(p.chapter), total = list.length;
    /* The VI guidebook repeats the summary as "what to do"; never print the same text twice. */
    var intro = p.facts.what && p.facts.what !== p.summary ? p.facts.what : '';
    var photo = photoFor(p);
    el.left.innerHTML =
      '<div class="gb-kicker">' + esc(c.kicker) + ' · ' + esc(ch.eyebrow || '') + '</div>' +
      '<h2 class="gb-title" id="gbTitle">' + esc(p.title) + '</h2>' +
      '<p class="gb-subtitle">' + esc(p.summary) + '</p>' +
      (photo ? '<figure class="gb-figure"><img class="gb-photo" src="' + esc(photo) + '" alt="' + esc(p.title) + '" decoding="async" referrerpolicy="no-referrer"></figure>' : '') +
      (intro ? '<p class="gb-intro">' + esc(intro) + '</p>' : '') +
      '<div class="gb-foot"><span>' + pad(index + 1) + ' / ' + pad(total) + ' &nbsp;|&nbsp; ' + esc(c.place) + '</span><span>' + esc(c.where) + '</span></div>';

    var facts = [
      ['best', p.labels[1], p.facts.best], ['time', p.labels[2], p.facts.time],
      ['note', p.labels[3], p.facts.note], ['tip', p.tipLabel, p.tip]
    ].filter(function (f) { return f[1] && f[2]; });
    el.right.innerHTML =
      '<div class="gb-facts">' + facts.map(function (f) {
        /* the pairing tip links to the suggested nearby place (#id is handled by hashchange) */
        var pair = f[0] === 'tip' && p.pairId ? list.filter(function (x) { return x.id === p.pairId; })[0] : null;
        var link = pair ? '<a class="gb-pair" href="#' + esc(pair.id) + '">' + esc(c.goTo) + ' ' + esc(pair.title) + ' →</a>' : '';
        return '<div class="gb-fact">' + ICONS[f[0]] + '<div><strong>' + esc(f[1]) + '</strong><p>' + esc(f[2]) + '</p>' + link + '</div></div>';
      }).join('') + '</div>' +
      (p.distances.length ? '<div class="gb-stay"><div><div class="gb-kicker">' + esc(c.stayNearby) + ' · KAS</div>' +
        '<h3>' + esc(p.distancesTitle) + '</h3><p>' + esc(c.stayIntro) + '</p>' +
        '</div><div>' + p.distances.map(function (d) {
          var inner = '<span class="gb-hotel__mono" aria-hidden="true">' + esc(d.hotel.replace(/^KAS\s+/i, '').charAt(0)) + '</span>' +
            '<span><b>' + esc(d.hotel) + '</b><small>' + esc(d.text) + '</small></span>';
          return d.hotelId ? '<a class="gb-hotel" href="' + hotelHref(d.hotelId) + '" title="' + esc(c.viewHotel) + '">' + inner + '</a>' : '<div class="gb-hotel">' + inner + '</div>';
        }).join('') + '</div></div>' : '') +
      '<div class="gb-foot"><span>' + esc(c.field) + '</span><span>' + pad(index * 2 + 2) + ' / ' + pad(total * 2) + '</span></div>';

    var img = el.left.querySelector('.gb-photo');
    if (img) img.addEventListener('error', function () { img.classList.add('is-unavailable'); img.removeAttribute('src'); img.alt = ''; });
    /* Warm the next photo so the next turn shows it at once. */
    var nextPlace = list[index + 1];
    if (nextPlace) { var pre = new Image(); pre.referrerPolicy = 'no-referrer'; pre.src = photoFor(nextPlace); }

    el.counter.textContent = pad(index + 1) + ' — ' + pad(total);
    el.prev.disabled = index === 0;
    el.next.disabled = index === total - 1;
    el.prev.setAttribute('aria-label', c.prev);
    el.next.setAttribute('aria-label', c.next);
    renderTabs(p.chapter);
    renderChapter(p.chapter);
    renderPlaces(p);
    el.live.textContent = p.title + ' — ' + pad(index + 1) + ' / ' + pad(total);
  }

  function renderStatic() {
    var c = COPY[lang()];
    el.kicker.textContent = c.heroKicker;
    el.title.textContent = c.heroTitle;
    el.sub.textContent = c.heroSub;
    el.caption.textContent = c.caption;
    el.book.setAttribute('aria-label', c.book);
  }
  function render() { renderStatic(); renderSpread(); }

  function syncHash() {
    var id = places()[index].id;
    if (location.hash.slice(1) === id) return;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch { /* ignore */ }
  }
  function animate(dir) {
    if (reduceMotion) return;
    el.book.classList.remove('flip-next', 'flip-prev');
    void el.book.offsetWidth;
    el.book.classList.add(dir > 0 ? 'flip-next' : 'flip-prev');
    clearTimeout(flipTimer);
    flipTimer = setTimeout(function () { el.book.classList.remove('flip-next', 'flip-prev'); }, 720);
  }
  function go(next, opts) {
    var total = places().length;
    next = Math.max(0, Math.min(total - 1, next));
    if (next === index && !(opts && opts.force)) return;
    var dir = next > index ? 1 : -1;
    index = next;
    if (!(opts && opts.silent)) animate(dir);
    renderSpread();
    syncHash();
    /* On a stacked (mobile) book, bring the new page's title into view. */
    if (!(opts && opts.noScroll) && window.matchMedia('(max-width:850px)').matches) {
      var top = el.left.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
  /* #ben-thanh-market (a place), #taste (a chapter) or ?place=… */
  function indexFromLocation() {
    var key = '';
    try { key = new URLSearchParams(location.search).get('place') || ''; } catch { /* ignore */ }
    key = key || decodeURIComponent(location.hash.slice(1));
    if (!key) return 0;
    var list = places();
    for (var i = 0; i < list.length; i++) if (list[i].id === key) return i;
    for (var j = 0; j < list.length; j++) if (list[j].chapter === key) return j;
    return 0;
  }

  el.prev.addEventListener('click', function () { go(index - 1); });
  el.next.addEventListener('click', function () { go(index + 1); });
  el.tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-chapter]'); if (!b) return;
    var list = places();
    for (var i = 0; i < list.length; i++) if (list[i].chapter === b.dataset.chapter) return go(i);
  });
  el.places.addEventListener('click', function (e) {
    var a = e.target.closest('[data-place]'); if (!a) return;
    e.preventDefault();
    var list = places();
    for (var i = 0; i < list.length; i++) if (list[i].id === a.dataset.place) return go(i);
  });
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('.kas-welcome.is-open, .kas-auth.is-open, .drawer.open')) return;
    if (e.key === 'ArrowLeft') { go(index - 1); }
    if (e.key === 'ArrowRight') { go(index + 1); }
  });
  /* Swipe to turn on touch screens (horizontal gestures only). */
  var x0 = null, y0 = null;
  el.book.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.book.addEventListener('touchend', function (e) {
    if (x0 == null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = y0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  }, { passive: true });
  window.addEventListener('hashchange', function () { go(indexFromLocation(), { silent: true, noScroll: true }); });
  document.addEventListener('kas:language', function () { render(); });

  index = indexFromLocation();
  render();
  if (location.search.indexOf('place=') > -1) syncHash();

  /* Admin photos (Ảnh website → guidebook.entry.<id>); on a static host the chapter photo stays. */
  fetch('/api/catalog', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) { siteImages = (c && c.siteImages) || {}; renderSpread(); setHeroPhoto(); })
    .catch(function () { setHeroPhoto(); });

  /* Hero photo: Admin "guidebook.hero", else the Opera House photo, else the first chapter photo.
     It fades in once loaded, over the dark band, so there is no flash. */
  function setHeroPhoto() {
    var pick = function (key) { var it = siteImages[key]; return it && it.url ? String(it.url) : ''; };
    var url = pick('guidebook.hero') || pick('guidebook.entry.saigon-opera-house') || (DATA.chapters.en.city || {}).image || '';
    if (!url || !el.hero) return;
    var img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = function () {
      el.hero.style.setProperty('--gb-hero-img', 'url("' + url.replace(/"/g, '%22') + '")');
      el.hero.classList.add('has-photo');
    };
    img.src = url;
  }
})();
