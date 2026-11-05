/* KAS GUIDE — editorial landing (city-guide.html / city-guide-vi.html).
   Adds the magazine opening — hero, featured story, categories and a
   "start with" row — above the existing "explore the city" sections, all from
   the guidebook's real stories, and sends every card to its story page. */
(function () {
  'use strict';
  var G = window.KAS_GUIDE;
  var mainEl = document.querySelector('.cg-main');
  var firstSection = mainEl && mainEl.querySelector('.cg-section');
  if (!G || !firstSection) return;
  var lang = document.documentElement.lang === 'vi' ? 'vi' : 'en';

  /* Every place card opens its own story; the slug is the guidebook anchor. */
  document.querySelectorAll('.cg-card[href*="city-guidebook"]').forEach(function (card) {
    var slug = (card.getAttribute('href') || '').split('#')[1];
    if (!slug) return;
    card.setAttribute('data-story', slug);
    card.setAttribute('href', G.storyUrl(slug, lang));
  });

  var COPY = {
    vi: { eyebrow: 'Cẩm nang KAS · Sài Gòn', title: 'Sài Gòn, từng góc phố quanh KAS.',
      lead: function (n, c) { return n + ' địa điểm trong ' + c + ' chủ đề — được chọn quanh các khách sạn KAS, kèm thời điểm nên đến và quãng đi bộ từ khách sạn.'; },
      featured: 'Câu chuyện nổi bật', read: 'Đọc câu chuyện', explore: 'Khám phá theo chủ đề', places: 'địa điểm',
      start: 'Bắt đầu với', startNote: 'Câu chuyện mở đầu của mỗi chủ đề.', city: 'Khám phá thành phố' },
    en: { eyebrow: 'KAS City Guide · Saigon', title: 'Saigon, street by street around KAS.',
      lead: function (n, c) { return n + ' places across ' + c + ' themes — chosen around the KAS hotels, with the best time to go and the walk from your hotel.'; },
      featured: 'Featured story', read: 'Read the story', explore: 'Explore by theme', places: 'places',
      start: 'Start with', startNote: 'The opening story of each theme.', city: 'Explore the city' }
  };
  var t = COPY[lang];
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bg(url) { return url ? ' style="--story-img:url(\'' + esc(String(url).replace(/'/g, '%27')) + '\')"' : ''; }

  Promise.all([G.load(lang), G.images()]).then(function (r) {
    var data = r[0], site = r[1];
    if (!data.stories.length) return;
    var featured = data.stories.find(function (s) { return G.imageFor(site, s.slug); }) || data.stories[0];
    var fImg = G.imageFor(site, featured.slug);
    var fCat = data.categories.find(function (c) { return c.id === featured.category; }) || {};
    var openers = data.categories.map(function (c) { return c.stories[0]; }).filter(function (s) { return s && s.slug !== featured.slug; });

    var block = document.createElement('div');
    block.className = 'cg-editorial';
    block.innerHTML =
      '<section class="cg-editorial__hero">' +
        '<div class="cg-eyebrow">' + esc(t.eyebrow) + '</div>' +
        '<h1>' + esc(t.title) + '</h1>' +
        '<p>' + esc(t.lead(data.stories.length, data.categories.length)) + '</p>' +
      '</section>' +
      '<section class="cg-editorial__featured" aria-label="' + esc(t.featured) + '">' +
        '<a class="cg-feature' + (fImg ? ' has-img' : '') + '" href="' + esc(G.storyUrl(featured.slug, lang)) + '"' + bg(fImg) + '>' +
          '<span class="cg-feature__media" aria-hidden="true">' + (fImg ? '' : '<span class="cg-story__mark">KAS</span>') + '</span>' +
          '<span class="cg-feature__copy"><span class="cg-eyebrow">' + esc(t.featured) + (fCat.name ? ' · ' + esc(fCat.name) : '') + '</span>' +
          '<span class="cg-feature__title">' + esc(featured.title) + '</span>' +
          '<span class="cg-feature__desc">' + esc(featured.summary) + '</span>' +
          '<span class="cg-feature__cta">' + esc(t.read) + ' →</span></span></a>' +
      '</section>' +
      '<section class="cg-editorial__themes"><h2>' + esc(t.explore) + '</h2><div class="cg-themes">' +
        data.categories.map(function (c) {
          return '<a class="cg-theme" href="#' + esc(c.id) + '"><span class="cg-theme__no">' + esc(c.number) + '</span>' +
            '<span class="cg-theme__name">' + esc(c.name) + '</span><span class="cg-theme__count">' + c.stories.length + ' ' + esc(t.places) + '</span></a>';
        }).join('') + '</div></section>' +
      (openers.length ? '<section class="cg-editorial__start"><div class="cg-story__section-head"><h2>' + esc(t.start) + '</h2><span>' + esc(t.startNote) + '</span></div>' +
        '<div class="cg-story__grid">' + openers.map(function (s) {
          var img = G.imageFor(site, s.slug);
          var cat = data.categories.find(function (c) { return c.id === s.category; }) || {};
          return '<a class="cg-story-card' + (img ? ' has-img' : '') + '" href="' + esc(G.storyUrl(s.slug, lang)) + '"' + bg(img) + '>' +
            '<span class="cg-story-card__meta">' + esc(cat.name || '') + '</span>' +
            '<span class="cg-story-card__title">' + esc(s.title) + '</span>' +
            '<span class="cg-story-card__desc">' + esc(s.summary) + '</span></a>';
        }).join('') + '</div></section>' : '') +
      '<h2 class="cg-editorial__city">' + esc(t.city) + '</h2>';
    firstSection.parentNode.insertBefore(block, firstSection);
  }).catch(function () { /* the existing sections remain the page */ });
})();
