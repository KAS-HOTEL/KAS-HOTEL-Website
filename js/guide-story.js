/* KAS GUIDE — one story, as an editorial article.
   URL: guide-story.html?place=<slug>[&lang=vi|en]. The slug is the guidebook
   entry id, identical in both languages, so refresh, a shared link, the back
   button and the EN/VI switch all land on the same place. */
(function () {
  'use strict';
  var G = window.KAS_GUIDE;
  var main = document.getElementById('story');
  if (!G || !main) return;

  var params = new URLSearchParams(location.search);
  var slug = (params.get('place') || '').trim();
  var lang = G.language();
  if (params.get('lang')) G.saveLanguage(lang);
  document.documentElement.lang = lang;

  var COPY = {
    vi: { home: 'Trang chủ', guide: 'Cẩm nang', back: 'Quay lại Cẩm nang', backTo: 'Về mục', top: 'Lên đầu trang ↑',
      tips: 'Gợi ý từ KAS', nearby: 'Khách sạn KAS gần đây', related: 'Câu chuyện cùng chủ đề', prev: 'Câu chuyện trước',
      next: 'Câu chuyện tiếp theo', view: 'Xem khách sạn', notFoundTitle: 'Không tìm thấy câu chuyện này',
      notFoundBody: 'Liên kết có thể đã thay đổi. Hãy quay lại Cẩm nang để chọn một địa điểm khác.', error: 'Không tải được cẩm nang. Vui lòng thử lại.',
      fullGuide: 'Mở cẩm nang đầy đủ', breadcrumb: 'Đường dẫn', read: 'Đọc' },
    en: { home: 'Home', guide: 'City Guide', back: 'Back to City Guide', backTo: 'Back to', top: 'Back to top ↑',
      tips: 'KAS insider tip', nearby: 'Nearby KAS hotels', related: 'Related stories', prev: 'Previous story',
      next: 'Next story', view: 'View hotel', notFoundTitle: 'We couldn’t find this story',
      notFoundBody: 'The link may have changed. Head back to the City Guide to choose another place.', error: 'The guide could not be loaded. Please try again.',
      fullGuide: 'Open the full guidebook', breadcrumb: 'Breadcrumb', read: 'Read' }
  };
  var t = COPY[lang];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bg(url) { return url ? ' style="--story-img:url(\'' + esc(String(url).replace(/'/g, '%27')) + '\')"' : ''; }

  /* Chrome: back link, language switch (same story, other language), footer. */
  var back = document.querySelector('[data-story-back]');
  if (back) { back.textContent = t.back; back.setAttribute('href', G.landingUrl(lang)); }
  var top = document.querySelector('[data-story-top]');
  if (top) top.textContent = t.top;
  document.querySelectorAll('[data-story-lang]').forEach(function (a) {
    var target = a.getAttribute('data-story-lang');
    a.classList.toggle('active', target === lang);
    a.setAttribute('href', slug ? G.storyUrl(slug, target) : G.landingUrl(target));
    a.addEventListener('click', function () { G.saveLanguage(target); });
  });

  function card(story, site, extraClass) {
    var img = G.imageFor(site, story.slug);
    return '<a class="cg-story-card' + (img ? ' has-img' : '') + (extraClass ? ' ' + extraClass : '') + '" href="' + esc(G.storyUrl(story.slug, lang)) + '"' + bg(img) + '>' +
      '<span class="cg-story-card__meta">' + esc(story.position) + '</span>' +
      '<span class="cg-story-card__title">' + esc(story.title) + '</span>' +
      '<span class="cg-story-card__desc">' + esc(story.summary) + '</span></a>';
  }

  function render(data, site) {
    var index = -1;
    for (var i = 0; i < data.stories.length; i++) { if (data.stories[i].slug === slug) { index = i; break; } }
    if (index < 0) return notFound();
    var story = data.stories[index];
    var category = data.categories.find(function (c) { return c.id === story.category; }) || { id: story.category, name: '', number: '' };
    var img = G.imageFor(site, story.slug);
    var prev = data.stories[index - 1], next = data.stories[index + 1];
    var related = (category.stories || []).filter(function (s) { return s.slug !== story.slug; }).slice(0, 3);
    document.title = story.title + ' — KAS ' + t.guide;

    /* The first fact ("what to do") often repeats the summary word for word;
       the lead already says it, so it is not printed twice. */
    var facts = story.facts.filter(function (f) { return f.text !== story.summary; });
    var lead = facts.length && facts[0] !== story.facts[0] ? null : facts.shift();
    if (lead === undefined) lead = null;
    var html = '' +
      '<nav class="cg-breadcrumb cg-story__crumbs" aria-label="' + esc(t.breadcrumb) + '">' +
        '<a href="index.html">' + esc(t.home) + '</a><span aria-hidden="true">›</span>' +
        '<a href="' + esc(G.landingUrl(lang)) + '">' + esc(t.guide) + '</a><span aria-hidden="true">›</span>' +
        (category.name ? '<a href="' + esc(G.landingUrl(lang, category.id)) + '">' + esc(category.name) + '</a><span aria-hidden="true">›</span>' : '') +
        '<span aria-current="page">' + esc(story.title) + '</span></nav>' +
      '<article class="cg-story__article">' +
        '<header class="cg-story__header">' +
          '<div class="cg-eyebrow">' + esc((category.number ? category.number + ' / ' : '') + category.name) + '</div>' +
          '<h1>' + esc(story.title) + '</h1>' +
          (story.summary ? '<p class="cg-story__lead">' + esc(story.summary) + '</p>' : '') +
        '</header>' +
        '<figure class="cg-story__hero' + (img ? ' has-img' : '') + '"' + bg(img) + '>' +
          (img ? '<img src="' + esc(img) + '" alt="' + esc(story.title) + '">' : '<span class="cg-story__mark" aria-hidden="true">KAS</span>') +
        '</figure>' +
        '<div class="cg-story__body">' +
          '<div class="cg-story__content">' +
            (lead ? '<section class="cg-story__intro"><h2>' + esc(lead.label) + '</h2><p>' + esc(lead.text) + '</p></section>' : '') +
            (facts.length ? '<dl class="cg-story__facts">' + facts.map(function (f) {
              return '<div><dt>' + esc(f.label) + '</dt><dd>' + esc(f.text) + '</dd></div>';
            }).join('') + '</dl>' : '') +
          '</div>' +
          '<aside class="cg-story__aside">' +
            (story.tip ? '<section class="cg-story__tip"><div class="cg-eyebrow">' + esc(t.tips) + '</div>' +
              (story.tipLabel ? '<h3>' + esc(story.tipLabel) + '</h3>' : '') + '<p>' + esc(story.tip) + '</p></section>' : '') +
            (story.distances.length ? '<section class="cg-story__nearby"><div class="cg-eyebrow">' + esc(t.nearby) + '</div>' +
              (story.distancesTitle ? '<p class="cg-story__nearby-note">' + esc(story.distancesTitle) + '</p>' : '') +
              '<ul>' + story.distances.map(function (d) {
                var name = '<strong>' + esc(d.hotel) + '</strong><span>' + esc(d.text) + '</span>';
                return '<li>' + (d.hotelId ? '<a href="hotel-detail.html?hotel=' + encodeURIComponent(d.hotelId) + '&lang=' + lang + '">' + name + '<em>' + esc(t.view) + ' →</em></a>' : name) + '</li>';
              }).join('') + '</ul></section>' : '') +
          '</aside>' +
        '</div>' +
      '</article>' +
      (related.length ? '<section class="cg-story__related"><div class="cg-story__section-head"><h2>' + esc(t.related) + '</h2>' +
        '<a href="' + esc(G.landingUrl(lang, category.id)) + '">' + esc(t.backTo) + ' ' + esc(category.name) + ' →</a></div>' +
        '<div class="cg-story__grid">' + related.map(function (s) { return card(s, site); }).join('') + '</div></section>' : '') +
      '<nav class="cg-story__pager" aria-label="' + esc(t.prev) + ' / ' + esc(t.next) + '">' +
        (prev ? '<a class="cg-story__prev" rel="prev" href="' + esc(G.storyUrl(prev.slug, lang)) + '"><span>← ' + esc(t.prev) + '</span><strong>' + esc(prev.title) + '</strong></a>' : '<span></span>') +
        (next ? '<a class="cg-story__next" rel="next" href="' + esc(G.storyUrl(next.slug, lang)) + '"><span>' + esc(t.next) + ' →</span><strong>' + esc(next.title) + '</strong></a>' : '<span></span>') +
      '</nav>' +
      '<p class="cg-story__full"><a href="' + esc((lang === 'vi' ? 'city-guidebook-vi.html#' : 'city-guidebook.html#') + story.slug) + '">' + esc(t.fullGuide) + ' ↗</a></p>';
    main.innerHTML = html;
    main.removeAttribute('aria-busy');
  }

  function notFound() {
    document.title = t.notFoundTitle + ' — KAS';
    main.innerHTML = '<section class="cg-story__empty"><div class="cg-eyebrow">KAS ' + esc(t.guide) + '</div><h1>' + esc(t.notFoundTitle) + '</h1><p>' + esc(t.notFoundBody) + '</p><a class="cg-back" href="' + esc(G.landingUrl(lang)) + '">' + esc(t.back) + '</a></section>';
    main.removeAttribute('aria-busy');
  }

  if (!slug) { notFound(); return; }
  Promise.all([G.load(lang), G.images()]).then(function (r) { render(r[0], r[1]); }).catch(function () {
    main.innerHTML = '<section class="cg-story__empty"><h1>' + esc(t.error) + '</h1><a class="cg-back" href="' + esc(G.landingUrl(lang)) + '">' + esc(t.back) + '</a></section>';
    main.removeAttribute('aria-busy');
  });
})();
