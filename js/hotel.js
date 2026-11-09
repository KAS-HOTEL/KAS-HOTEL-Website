/* ==========================================================================
   KAS — HOTEL LISTING + HOTEL DETAIL rendering
   ========================================================================== */
(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA, App = global.App;

  /* ---------- hotel card ----------
     One card for the Hotels listing and My KAS › Saved hotels (owner decision
     2026-11-07, "layout 2"): photo left / details right, the save heart on the
     photo's top-right corner, rating top-right of the details, and a footer in
     three parts — room types and check-in/out · from price · View rooms.
     The heart is the shared save toggle (data-save-hotel, app.js): on the Saved
     page un-saving it removes the card once the server has confirmed.
     opts.variant === 'saved' only adds the hcard--saved modifier. English copy
     is translated by i18n.js like the rest of the listing. */
  function hotelCard(h, search, opts) {
    opts = opts || {};
    search = search || {};
    var q = U.buildQS({
      hotel: h.id, checkIn: search.checkIn, checkOut: search.checkOut,
      adults: search.adults, children: search.children, rooms: search.rooms,
      lang: opts.lang
    });
    var href = 'hotel-detail.html?' + q;
    var listingImages = (h.propertyGalleryImages && h.propertyGalleryImages.length)
      ? h.propertyGalleryImages
      : h.images;
    var saved = opts.variant === 'saved';
    var id = U.esc(h.id);
    var amenities = h.amenities || [];
    var rating = Number(h.rating || 0);
    var price = h.startingPrice;
    var hasPrice = price != null && isFinite(price);
    var roomTypes = h.roomCount != null ? h.roomCount : (h.rooms || []).length;
    return '<article class="hcard' + (saved ? ' hcard--saved' : ' fade-up') + '" data-hotel-id="' + id + '">' +
      '<div class="hcard__media">' +
        (h.starRating >= 4 ? '<span class="badge badge--gold">Signature Property</span>' : '') +
        App.miniHTML(listingImages, h.name) +
        '<button type="button" class="kas-save hcard__save" data-save-hotel="' + id + '" aria-pressed="false" aria-label="Save hotel" title="Save hotel">' + U.icon('heart', 18) + '</button>' +
      '</div>' +
      '<div class="hcard__b">' +
        '<div class="hcard__hd">' +
          '<div>' +
            '<h3><a href="' + U.esc(href) + '">' + U.esc(h.name) + '</a></h3>' +
            (h.address ? '<div class="hcard__loc">' + U.icon('pin', 14) + U.esc(h.address) + '</div>' : '') +
          '</div>' +
          /* A hotel added in the console has no score until one is entered. */
          (rating ? '<div class="rate"><span class="rate__n">' + rating.toFixed(1) + '</span>' +
            '<div class="rate__m">' + U.stars(rating / 2, 11) +
            '<small>' + Number(h.reviews || 0) + ' reviews</small></div></div>' : '') +
        '</div>' +
        /* Whole text, cut to three lines by CSS: a cut string would no longer match its translation. */
        (h.description ? '<p class="hcard__desc">' + U.esc(h.description) + '</p>' : '') +
        (amenities.length ? '<div class="hcard__am">' +
          amenities.slice(0, 5).map(function (a) {
            return '<span class="chip">' + U.icon(App.amenityIcon(a), 12) + U.esc(a) + '</span>';
          }).join('') +
          (amenities.length > 5 ? '<span class="chip">+' + (amenities.length - 5) + ' more</span>' : '') +
        '</div>' : '') +
        '<div class="hcard__ft">' +
          '<div class="hcard__meta"><span class="tiny muted">' + roomTypes + ' room types available</span>' +
            (h.checkIn || h.checkOut ? '<div class="tiny muted">' + U.icon('clock', 11) + ' Check-in ' + U.esc(h.checkIn || '—') + ' · Check-out ' + U.esc(h.checkOut || '—') + '</div>' : '') +
          '</div>' +
          '<div class="price hcard__price">' + (hasPrice
            ? '<span class="price__lb">From</span>' + U.priceHTML(price) + '<div class="price__u">per night · excl. taxes</div>'
            : '<span class="price__u">Contact us for rates</span>') +
          '</div>' +
          '<a class="btn btn--gold hcard__cta" href="' + U.esc(href) + '">View rooms</a>' +
        '</div>' +
      '</div></article>';
  }
  /* Shortens text at a word boundary; exported as HotelUI.trim. */
  function trim(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n).replace(/\s\S*$/, '') + '…' : s; }

  /* ---------- room card (hotel detail page) ---------- */
  function roomCard(h, r, search, badge) {
    var n = U.nights(search.checkIn, search.checkOut) || 1;
    var exactRate = (global.KAS_RATES && search.checkIn) ? global.KAS_RATES.rateForDate(r.id, search.checkIn) : null;
    var liveQuote = (global.KAS_RATES && search.checkIn && search.checkOut) ? global.KAS_RATES.quote(r.id, search.checkIn, search.checkOut) : null;
    var displayRate = exactRate != null ? exactRate : r.pricePerNight;
    var stayTotal = liveQuote && liveQuote.complete ? liveQuote.total : displayRate * n;
    var q = U.buildQS({
      hotel: h.id, room: r.id, checkIn: search.checkIn, checkOut: search.checkOut,
      adults: search.adults, children: search.children, rooms: search.rooms
    });
    var href = 'room-detail.html?' + q;
    return '<article class="rcard fade-up" data-room="' + r.id + '">' +
      '<div class="rcard__media">' +
        (badge ? '<span class="badge">' + U.esc(badge) + '</span>' : '') +
        App.miniHTML((r.liveImages && r.liveImages.length ? r.liveImages : r.images), h.name + ' — ' + r.name) +
      '</div>' +
      '<div class="rcard__b">' +
        '<h3><a href="' + href + '">' + U.esc(r.name) + '</a></h3>' +
        '<div class="rcard__specs">' +
          spec('size', r.size || 'Size not published') +
          spec('bed',  r.bedType) +
          spec('view', r.view || 'View not published') +
          spec('users', 'Max ' + r.maxGuests + ' guest' + (r.maxGuests === 1 ? '' : 's')) +
        '</div>' +
        '<p class="rcard__desc">' + U.esc(roomBlurb(h, r)) + '</p>' +
        '<a class="btn btn--link" href="' + href + '">View details ' + U.icon('chevD', 12) + '</a>' +
      '</div>' +
      '<div class="rcard__side">' +
        '<div class="price"><span class="price__lb">From</span>' + U.priceHTML(displayRate) +
          '<div class="price__u">per night</div>' +
          '<div class="tiny muted" style="margin-top:2px">KAS rate · excl. VAT · excl. service charge</div></div>' +
        '<div class="rcard__perks">' +
          '<span class="perk perk--gold">' + U.icon(r.breakfast ? 'coffee' : 'x', 13) +
            (r.breakfast ? 'Breakfast included' : 'Breakfast not included') + '</span>' +
          '<span class="perk">' + U.icon('rot', 13) + 'Free cancellation</span>' +
          '<span class="perk">' + U.icon('wallet', 13) + 'Pay at hotel available</span>' +
        '</div>' +
        '<a class="btn btn--gold btn--block" href="' + href + '" data-select>Select room</a>' +
        '<div class="tiny muted" style="text-align:center">' + U.vnd(stayTotal) + ' VND for ' + n + ' night' + (n === 1 ? '' : 's') + '</div>' +
      '</div></article>';

    function spec(ic, tx) {
      return '<span class="spec">' + U.icon(ic, 14) + U.esc(tx) + '</span>';
    }
  }

  function roomBlurb(h, r) {
    var bits = [];
    if (r.sizeNum) bits.push('A ' + r.size + ' room');
    else bits.push('A room');
    bits.push('with a ' + String(r.bedType).toLowerCase());
    if (r.view && !/^no/i.test(r.view)) bits.push('and a ' + String(r.view).toLowerCase());
    if (r.balcony) bits.push('plus a private balcony');
    var s = bits.join(' ') + '.';
    if (r.bathroom) s += ' Bathroom: ' + String(r.bathroom).toLowerCase() + '.';
    if (r.notes) s += ' ' + r.notes;
    return s;
  }

  /* ---------- filtering + sorting ---------- */
  function roomMatches(r, f) {
    var effectiveRate = r.currentRate != null ? r.currentRate : r.pricePerNight;
    if (f.priceMax != null && effectiveRate > f.priceMax) return false;
    if (f.types && f.types.length && !f.types.some(function (t) { return new RegExp(t, 'i').test(r.name); })) return false;
    if (f.beds && f.beds.length) {
      var bt = String(r.bedType).toLowerCase();
      var ok = f.beds.some(function (b) {
        if (b === 'king')   return /king/.test(bt);
        if (b === 'queen')  return /queen/.test(bt);
        if (b === 'twin')   return /single|twin/.test(bt);
        if (b === 'double') return /double/.test(bt);
        return false;
      });
      if (!ok) return false;
    }
    if (f.views && f.views.length) {
      var v = String(r.view || '').toLowerCase();
      var okv = f.views.some(function (x) {
        if (x === 'city')    return /city/.test(v);
        if (x === 'street')  return /street/.test(v);
        if (x === 'window')  return /window/.test(v) && !/no window/.test(v);
        if (x === 'balcony') return !!r.balcony;
        return false;
      });
      if (!okv) return false;
    }
    if (f.breakfast && !r.breakfast) return false;
    if (f.balcony && !r.balcony) return false;
    if (f.bathtub && !/bathtub/i.test(r.bathroom || '')) return false;
    if (f.guests && r.maxGuests < f.guests) return false;
    return true;
  }

  function sortHotels(list, mode, search) {
    var a = list.slice();
    if (mode === 'price-asc')  a.sort(function (x, y) { return x._from - y._from; });
    else if (mode === 'price-desc') a.sort(function (x, y) { return y._from - x._from; });
    else if (mode === 'rating')     a.sort(function (x, y) { return y.rating - x.rating || y.reviews - x.reviews; });
    else a.sort(function (x, y) {
      // Recommended: rating weighted by review volume, flagship first
      var sx = x.rating * Math.log10(x.reviews + 10) + (x.starRating >= 4 ? 1.2 : 0);
      var sy = y.rating * Math.log10(y.reviews + 10) + (y.starRating >= 4 ? 1.2 : 0);
      return sy - sx;
    });
    return a;
  }
  function sortRooms(list, mode) {
    var a = list.slice();
    if (mode === 'price-asc')  a.sort(function (x, y) { return (x.currentRate != null ? x.currentRate : x.pricePerNight) - (y.currentRate != null ? y.currentRate : y.pricePerNight); });
    else if (mode === 'price-desc') a.sort(function (x, y) { return (y.currentRate != null ? y.currentRate : y.pricePerNight) - (x.currentRate != null ? x.currentRate : x.pricePerNight); });
    else if (mode === 'size')  a.sort(function (x, y) { return (y.sizeNum || 0) - (x.sizeNum || 0); });
    else a.sort(function (x, y) { return x.pricePerNight - y.pricePerNight; });
    return a;
  }

  global.HotelUI = {
    hotelCard: hotelCard, roomCard: roomCard, roomBlurb: roomBlurb,
    roomMatches: roomMatches, sortHotels: sortHotels, sortRooms: sortRooms, trim: trim
  };
})(window);
