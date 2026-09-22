/* ==========================================================================
   KAS — HOTEL LISTING + HOTEL DETAIL rendering
   ========================================================================== */
(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA, App = global.App;

  /* ---------- hotel card (listing page) ---------- */
  function hotelCard(h, search) {
    var q = U.buildQS({
      hotel: h.id, checkIn: search.checkIn, checkOut: search.checkOut,
      adults: search.adults, children: search.children, rooms: search.rooms
    });
    var href = 'hotel-detail.html?' + q;
    var listingImages = (h.propertyGalleryImages && h.propertyGalleryImages.length)
      ? h.propertyGalleryImages
      : h.images;
    return '<article class="hcard fade-up" data-hotel-id="' + U.esc(h.id) + '">' +
      '<div class="hcard__media">' +
        (h.starRating >= 4 ? '<span class="badge badge--gold">Signature Property</span>' : '') +
        App.miniHTML(listingImages, h.name) +
      '</div>' +
      '<div class="hcard__b">' +
        '<div class="hcard__hd">' +
          '<div style="min-width:0">' +
            '<h3><a href="' + href + '">' + U.esc(h.name) + '</a></h3>' +
            '<div class="hcard__loc">' + U.icon('pin', 14) + U.esc(h.address) + '</div>' +
            '<div class="legacy">Former listing: “' + U.esc(h.legacyName) + '”</div>' +
            (h.tripUrl ? '<a class="tiny" href="' + h.tripUrl + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:5px;color:var(--gold-dk)">Property reference ↗</a>' : '') +
          '</div>' +
          '<div class="rate"><span class="rate__n">' + h.rating.toFixed(1) + '</span>' +
            '<div class="rate__m">' + U.stars(h.rating / 2, 11) +
            '<small>' + h.reviews + ' reviews</small></div></div>' +
        '</div>' +
        '<p class="hcard__desc">' + U.esc(trim(h.description, 190)) + '</p>' +
        '<div class="hcard__am">' +
          h.amenities.slice(0, 5).map(function (a) {
            return '<span class="chip">' + U.icon(App.amenityIcon(a), 12) + U.esc(a) + '</span>';
          }).join('') +
          (h.amenities.length > 5 ? '<span class="chip">+' + (h.amenities.length - 5) + ' more</span>' : '') +
        '</div>' +
        '<div class="hcard__ft">' +
          '<div><span class="tiny muted">' + h.roomCount + ' room types available</span>' +
            '<div class="tiny muted" style="margin-top:3px">' + U.icon('clock', 11) + ' Check-in ' + U.esc(h.checkIn) + ' · Check-out ' + U.esc(h.checkOut) + '</div></div>' +
          '<div style="display:flex;align-items:flex-end;gap:20px">' +
            '<div class="price"><span class="price__lb">From</span>' +
              U.priceHTML(h.startingPrice) +
              '<div class="price__u">per night · excl. taxes</div></div>' +
            '<a class="btn btn--gold" href="' + href + '">View rooms</a>' +
          '</div>' +
        '</div>' +
      '</div></article>';
  }
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
          '<div class="tiny muted" style="margin-top:2px">Giá KAS · không VAT · không service charge</div></div>' +
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
