/* KAS GUIDE — editorial data layer
   One source of truth for the City Guide stories: the guidebook pages
   themselves (city-guidebook.html / city-guidebook-vi.html). Each <article
   class="entry" id="…"> is a story; its id is the story's slug in both
   languages, so a VI story and its EN twin always share one URL key.
   Nothing here invents content: a section is only drawn when the guidebook
   holds it (tips, walking distances, photos set in Admin).
*/
(function (global) {
  'use strict';

  var KEY = 'kas-language';
  var CATEGORY_ORDER = ['city', 'taste', 'slow', 'night'];
  /* Hotel names as the guidebook prints them → the site's hotel ids. */
  var HOTEL_IDS = {
    passion: 'hotel-01', elegance: 'hotel-02', premium: 'hotel-02', ancient: 'hotel-03',
    milestone: 'hotel-04', zody: 'hotel-05', sonata: 'hotel-06', eliana: 'hotel-07', dilly: 'hotel-08'
  };
  var cache = {};

  function language() {
    var lang = '';
    try { lang = new URLSearchParams(location.search).get('lang') || ''; } catch (e) {}
    if (!lang) { try { lang = localStorage.getItem(KEY) || ''; } catch (e) {} }
    if (!lang) {
      try { var m = document.cookie.match(/(?:^|; )kas-language=([^;]+)/); lang = m ? decodeURIComponent(m[1]) : ''; } catch (e) {}
    }
    return String(lang).toLowerCase() === 'vi' ? 'vi' : 'en';
  }
  function saveLanguage(lang) {
    lang = lang === 'vi' ? 'vi' : 'en';
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    try { document.cookie = KEY + '=' + encodeURIComponent(lang) + '; path=/; max-age=31536000; SameSite=Lax'; } catch (e) {}
  }
  function text(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function hotelId(name) {
    var words = String(name || '').toLowerCase().split(/\s+/);
    for (var i = 0; i < words.length; i++) { if (HOTEL_IDS[words[i]]) return HOTEL_IDS[words[i]]; }
    return null;
  }

  /* Parse one guidebook file into categories and stories, in authored order. */
  function parse(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var stories = [], categories = {}, current = null;
    var walker = doc.querySelectorAll('div[id], article.entry[id]');
    Array.prototype.forEach.call(walker, function (node) {
      if (node.tagName === 'DIV') {
        if (CATEGORY_ORDER.indexOf(node.id) >= 0) current = node.id;
        return;
      }
      var meta = text(node.querySelector('.meta'));
      /* "04 / Khi thành phố lên đèn · 05" → number, category name, position */
      var m = meta.match(/^(\d+)\s*\/\s*(.+?)\s*·\s*(\d+)$/);
      var category = current || 'city';
      if (m && !categories[category]) categories[category] = { id: category, number: m[1], name: m[2], stories: [] };
      var tip = node.querySelector('.tip');
      var tipLabel = tip ? text(tip.querySelector('strong')).replace(/:\s*$/, '') : '';
      var story = {
        slug: node.id,
        category: category,
        position: m ? m[3] : '',
        title: text(node.querySelector('h2')),
        summary: text(node.querySelector('.desc')),
        facts: Array.prototype.map.call(node.querySelectorAll('.facts .fact'), function (f) {
          return { label: text(f.querySelector('label')), text: text(f.querySelector('div')) };
        }).filter(function (f) { return f.label && f.text; }),
        distancesTitle: text(node.querySelector('.distances .dist-title')),
        distances: Array.prototype.map.call(node.querySelectorAll('.distances .distance'), function (d) {
          var name = text(d.querySelector('strong'));
          return { hotel: name, hotelId: hotelId(name), text: text(d.querySelector('span')) };
        }).filter(function (d) { return d.hotel && d.text; }),
        tipLabel: tipLabel,
        tip: tip ? text(tip).replace(text(tip.querySelector('strong')), '').trim() : ''
      };
      if (!story.title) return;
      stories.push(story);
      if (categories[category]) categories[category].stories.push(story);
    });
    return {
      stories: stories,
      categories: CATEGORY_ORDER.map(function (id) { return categories[id]; }).filter(Boolean)
    };
  }

  function load(lang) {
    lang = lang === 'vi' ? 'vi' : 'en';
    if (!cache[lang]) {
      var file = lang === 'vi' ? 'city-guidebook-vi.html' : 'city-guidebook.html';
      cache[lang] = fetch(file, { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('guidebook ' + r.status); return r.text(); })
        .then(parse);
    }
    return cache[lang];
  }

  /* Admin-managed photos (Ảnh website → guidebook.*); absent means no photo. */
  var imagesPromise = null;
  function images() {
    if (!imagesPromise) {
      imagesPromise = fetch('/api/catalog', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) { return (c && c.siteImages) || {}; })
        .catch(function () { return {}; });
    }
    return imagesPromise;
  }
  function imageFor(site, slug) {
    var item = site && site['guidebook.entry.' + slug];
    return item && item.url ? String(item.url) : '';
  }

  function storyUrl(slug, lang) {
    return 'guide-story.html?place=' + encodeURIComponent(slug) + (lang ? '&lang=' + lang : '');
  }
  function landingUrl(lang, category) {
    return (lang === 'vi' ? 'city-guide-vi.html' : 'city-guide.html') + (category ? '#' + category : '');
  }

  global.KAS_GUIDE = {
    language: language, saveLanguage: saveLanguage, load: load, images: images, imageFor: imageFor,
    storyUrl: storyUrl, landingUrl: landingUrl, parse: parse
  };
})(window);
