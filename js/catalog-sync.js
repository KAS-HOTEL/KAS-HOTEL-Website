/* KAS CATALOGUE SYNC — the console decides which hotels and room types the website lists.

   Source of truth: GET /api/v1/public/properties/catalogue (published hotels, in the
   operator's order) and GET /api/v1/public/properties/{slug}/room-types. data.js stays the
   editorial layer (photos, long copy, room details, ratings) for the hotels it describes.

   - A hotel hidden, closed or removed in the console disappears from every page.
   - A hotel added in the console appears, built from the API (id = its slug).
   - Room types follow the console the same way; new ones join KAS_API_MAP so they price
     and book like the others.
   - Names, address, check-in/out times, tags and trip intents follow the console.
     Ratings stay as data.js shows them (their sources differ from the console's Trip.com
     score); a hotel data.js does not know uses the Trip.com score.

   Load order: after data.js, api-map.js and api.js, before app.js and page scripts.
   The last good catalogue is kept in localStorage and applied synchronously here, so page
   scripts see the console's list at once; a fresh copy is then fetched. If it changes the
   set or order of hotels/rooms, the page reloads once so everything is drawn from it.
   If the API cannot be reached, the last good catalogue (or data.js) stays. */
(function (global) {
  'use strict';
  var D = global.KAS_DATA;
  if (!D || !Array.isArray(D.hotels)) return;

  var CACHE_PREFIX = 'kas_catalogue_v1_';
  var RELOAD_GUARD = 'kas_catalogue_reloaded_at';
  /* A hotel with no console photo yet shows the brand placeholder (js/images.js). */
  var NEW_HOTEL_IMAGE = (global.KAS_IMAGES && global.KAS_IMAGES.PLACEHOLDER) || 'assets/brand/kas-photo-placeholder.svg';
  var BASE = D.hotels.slice();
  var BASE_ROOMS = {};
  var BASE_IMAGES = {};
  var BASE_ROOM_IMAGES = {};
  BASE.forEach(function (h) {
    BASE_ROOMS[h.id] = (h.rooms || []).slice();
    BASE_IMAGES[h.id] = (h.images || []).slice();
    (h.rooms || []).forEach(function (r) { BASE_ROOM_IMAGES[r.id] = (r.images || []).slice(); });
  });
  var created = {};
  var appliedSignature = null;
  var fresh = false;

  function lang() {
    try { return global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi' ? 'vi' : 'en'; } catch (e) { return 'en'; }
  }
  function map() { return global.KAS_API_MAP || (global.KAS_API_MAP = {}); }
  function baseSlug(hotel) {
    var m = map();
    var room = (BASE_ROOMS[hotel.id] || []).find(function (r) { return m[r.id] && m[r.id].propertySlug; });
    return room ? m[room.id].propertySlug : null;
  }
  function hhmm(time) { return typeof time === 'string' && time.length >= 5 ? time.slice(0, 5) : null; }
  function bedsText(beds) {
    return (beds || []).map(function (b) { return (b.quantity || 1) + ' × ' + (b.label || b.type || b.bedType || 'bed'); }).join(', ');
  }

  function roomFromApi(hotel, rt, id) {
    var size = rt.areaSqm != null ? Number(rt.areaSqm) : null;
    return {
      id: id, name: rt.name || rt.slug, size: size ? size + ' m²' : '', sizeNum: size || 0,
      bedType: rt.bedDescription || bedsText(rt.beds), maxGuests: rt.maxOccupancy || rt.maxAdults || 2,
      adults: rt.maxAdults || 2, children: rt.maxChildren || 0, view: rt.viewType || '', window: rt.viewType || '',
      balcony: false, bathroom: '', breakfast: !!rt.breakfastIncluded, pricePerNight: null,
      hotelId: hotel.id, hotelName: hotel.name, branchCode: hotel.branchCode || '',
      amenities: [], images: (hotel.images || []).slice(0, 3), cancellation: '', payment: '',
      description: rt.longDescription || rt.shortDescription || '', roomTypeSlug: rt.slug, fromApi: true
    };
  }

  function reconcileRooms(hotel, slug, rts, isNew) {
    var base = isNew ? [] : (BASE_ROOMS[hotel.id] || []);
    if (!Array.isArray(rts)) return isNew ? [] : base.slice();
    var m = map();
    var bySlug = {};
    base.forEach(function (r) { var ref = m[r.id]; if (ref && ref.roomTypeSlug) bySlug[ref.roomTypeSlug] = r; });
    return rts.map(function (rt) {
      var room = bySlug[rt.slug];
      if (room) return room;
      var id = rt.frontendKey && !m[rt.frontendKey] ? rt.frontendKey : slug + '--' + rt.slug;
      m[id] = { propertySlug: slug, roomTypeSlug: rt.slug };
      return roomFromApi(hotel, rt, id);
    });
  }

  function hotelFromCard(card) {
    var address = [card.addressLine, card.district, card.city].filter(Boolean).join(', ');
    return {
      id: card.slug, slug: card.slug, branchCode: '', name: card.name, legacyName: '', aliases: [],
      tagline: card.shortDescription || '', address: address, district: card.district || '', area: card.district || '',
      quickSearchTags: [], starRating: card.starRating || 0,
      rating: card.tripRating != null ? Number(card.tripRating) : 0, ratingScale: 10,
      reviews: card.tripReviewCount || 0, ratingSource: 'Trip.com', description: card.shortDescription || '',
      checkIn: '14:00', checkOut: '12:00', amenities: [], rooms: [], services: [], startingPrice: null, roomCount: 0,
      photos: [], images: [NEW_HOTEL_IMAGE], roomPhotos: [], fromApi: true
    };
  }

  function mergeCard(hotel, card) {
    hotel.slug = card.slug;
    if (card.name) hotel.name = card.name;
    if (card.addressLine && String(hotel.address || '').indexOf(card.addressLine) < 0) {
      hotel.address = [card.addressLine, card.district, card.city].filter(Boolean).join(', ');
    }
    if (card.district) hotel.district = card.district;
    if (hhmm(card.checkInTime)) hotel.checkIn = hhmm(card.checkInTime);
    if (hhmm(card.checkOutTime)) hotel.checkOut = hhmm(card.checkOutTime);
    if (card.quickSearchTags && card.quickSearchTags.length) hotel.quickSearchTags = card.quickSearchTags.slice();
    hotel.tripIntents = (card.tripIntents || []).slice();
    hotel.lifecycleState = card.lifecycleState;
    hotel.isFlagship = !!card.isFlagship;
    if (card.starRating) hotel.starRating = card.starRating;
  }

  /* Console images (GET /properties/catalogue/media) win over the website's own photos;
     a hotel or room with none in the console keeps them. Photos are restored first so a
     later catalogue can take an image away again. */
  /* The console's media_category, as the website's six gallery groups (owner decision 2026-11-08):
     rooms · lobby · dining · amenities · exterior · other. */
  var GALLERY_GROUP = { ROOM: 'rooms', LOBBY: 'lobby', DINING: 'dining', FACILITY: 'amenities', ROOFTOP: 'amenities', EXTERIOR: 'exterior' };
  function galleryCategory(category) { return GALLERY_GROUP[category] || 'other'; }

  function applyMedia(hotel, slug, media) {
    hotel.images = BASE_IMAGES[hotel.id] ? BASE_IMAGES[hotel.id].slice() : [NEW_HOTEL_IMAGE];
    hotel.consoleGallery = false;
    hotel.consoleGalleryItems = null;
    var entry = media && media[slug];
    var urls = entry && (entry.gallery || []).map(function (m) { return m.url; }).filter(Boolean);
    if (urls && urls.length) { hotel.images = urls; hotel.consoleGallery = true;
      hotel.consoleGalleryItems = (entry.gallery || []).filter(function (m) { return m.url; })
        .map(function (m) { return { url: m.url, category: galleryCategory(m.category) }; }); }
    var m = map();
    (hotel.rooms || []).forEach(function (room) {
      if (BASE_ROOM_IMAGES[room.id]) room.images = BASE_ROOM_IMAGES[room.id].slice();
      room.consoleImages = false;
      var ref = m[room.id];
      var roomUrls = entry && ref && ((entry.roomTypes || {})[ref.roomTypeSlug] || []).map(function (x) { return x.url; }).filter(Boolean);
      if (roomUrls && roomUrls.length) { room.images = roomUrls; room.consoleImages = true; }
      else if (room.fromApi && (!room.images || !room.images.length)) room.images = (hotel.images || []).slice(0, 3);
    });
  }

  function apply(payload) {
    if (!payload || !Array.isArray(payload.cards)) return false;
    var media = {};
    (payload.media || []).forEach(function (entry) { if (entry && entry.slug) media[entry.slug] = entry; });
    var byKey = {};
    BASE.forEach(function (h) { byKey[h.id] = h; });
    var list = payload.cards.map(function (card) {
      var hotel = (card.frontendKey && byKey[card.frontendKey])
        || BASE.find(function (h) { return baseSlug(h) === card.slug; });
      var isNew = !hotel;
      if (isNew) hotel = created[card.slug] || (created[card.slug] = hotelFromCard(card));
      mergeCard(hotel, card);
      hotel.rooms = reconcileRooms(hotel, card.slug, (payload.rooms || {})[card.slug], isNew);
      hotel.rooms.forEach(function (r) { r.hotelName = hotel.name; });
      applyMedia(hotel, card.slug, media);
      hotel.roomCount = hotel.rooms.length;
      return hotel;
    });
    D.hotels.length = 0;
    Array.prototype.push.apply(D.hotels, list);
    appliedSignature = signature(payload);
    return true;
  }

  /* What a visitor would see change: the hotels in order, and each hotel's set of rooms. */
  function signature(payload) {
    return (payload.cards || []).map(function (c) {
      var rts = (payload.rooms || {})[c.slug];
      return c.slug + ':' + (Array.isArray(rts) ? rts.map(function (r) { return r.slug; }).sort().join(',') : '?');
    }).join('|');
  }
  /* The same for data.js as shipped, used when no catalogue was cached yet. */
  function baselineSignature() {
    var m = map();
    return BASE.map(function (h) {
      var rooms = (BASE_ROOMS[h.id] || []).map(function (r) { return m[r.id] && m[r.id].roomTypeSlug; }).filter(Boolean);
      return baseSlug(h) + ':' + rooms.sort().join(',');
    }).join('|');
  }

  function readCache(locale) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + locale) || 'null'); } catch (e) { return null; }
  }
  function writeCache(locale, payload) {
    try { localStorage.setItem(CACHE_PREFIX + locale, JSON.stringify(payload)); } catch (e) { /* quota or private mode */ }
  }

  function request(path) {
    if (global.KAS_API && global.KAS_API.request) return global.KAS_API.request(path);
    return fetch(path, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw r; return r.json(); });
  }
  function fetchFresh(locale) {
    return request('/api/v1/public/properties/catalogue?locale=' + locale).then(function (cards) {
      if (!Array.isArray(cards)) throw new Error('catalogue');
      return Promise.all(cards.map(function (c) {
        return request('/api/v1/public/properties/' + encodeURIComponent(c.slug) + '/room-types?locale=' + locale)
          .then(function (rts) { return [c.slug, Array.isArray(rts) ? rts : null]; }, function () { return [c.slug, null]; });
      })).then(function (pairs) {
        var rooms = {};
        pairs.forEach(function (p) { rooms[p[0]] = p[1]; });
        return request('/api/v1/public/properties/catalogue/media?locale=' + locale)
          .then(function (media) { return Array.isArray(media) ? media : []; }, function () { return []; })
          .then(function (media) { return { cards: cards, rooms: rooms, media: media, at: Date.now() }; });
      });
    });
  }

  function reloadOnce() {
    var last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_GUARD) || 0); } catch (e) { return false; }
    if (Date.now() - last < 60000) return false;
    try { sessionStorage.setItem(RELOAD_GUARD, String(Date.now())); } catch (e) { return false; }
    global.location.reload();
    return true;
  }

  var locale = lang();
  apply(readCache(locale));
  var loadedSignature = appliedSignature || baselineSignature();

  var ready = fetchFresh(locale).then(function (payload) {
    apply(payload);
    writeCache(locale, payload);
    fresh = true;
    var changed = loadedSignature !== appliedSignature;
    try { global.dispatchEvent(new CustomEvent('kas:catalogue-synced', { detail: { changed: changed } })); } catch (e) {}
    /* Pages drew from the earlier list; draw again from the console's. */
    if (changed && document.readyState !== 'loading' && reloadOnce()) return new Promise(function () {});
    return payload;
  }).catch(function () { return null; });

  global.KAS_CATALOG = {
    ready: ready,
    isFresh: function () { return fresh; },
    slugFor: function (hotelId) {
      var hotel = D.getHotel(hotelId);
      return hotel ? (hotel.slug || baseSlug(hotel)) : null;
    }
  };
})(window);
