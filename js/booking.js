/* ==========================================================================
   KAS — BOOKING ENGINE
   Owns the cross-page booking state machine, price maths, guarded
   navigation and the final booking record written to localStorage.
   ========================================================================== */
(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA, S = global.Store;

  /**
   * Per-night rates from the operator rate sheet for this stay, or null when
   * the room has no mapped sheet row (the flat demo rate is then used).
   * A blank cell in the sheet makes the quote incomplete -> we fall back
   * rather than invent a figure for that night.
   */
  function sheetNightly(room, checkIn, checkOut) {
    var RT = global.KAS_RATES;
    if (!RT || !room || !RT.hasSheetRate(room.id)) return null;
    var q = RT.quote(room.id, checkIn, checkOut);
    if (!q || !q.complete) return null;
    return q.nights.map(function (x) { return x.rate; });
  }

  /* ---------- search criteria ---------- */
  function readSearch() {
    var q = U.qs(), s = S.getSearch();
    var out = {
      hotelId:  q.hotel    || s.hotelId  || '',
      checkIn:  q.checkIn  || s.checkIn  || D.config.defaultCheckIn,
      checkOut: q.checkOut || s.checkOut || D.config.defaultCheckOut,
      adults:   +(q.adults   != null ? q.adults   : s.adults)   || D.config.defaultAdults,
      children: +(q.children != null ? q.children : s.children) || 0,
      rooms:    +(q.rooms    != null ? q.rooms    : s.rooms)    || D.config.defaultRooms
    };
    /* A saved search or old link can carry dates that have already passed. */
    if (out.checkIn < U.today()) {
      out.checkIn = D.config.defaultCheckIn;
      out.checkOut = D.config.defaultCheckOut;
    }
    if (U.nights(out.checkIn, out.checkOut) < 1) {
      out.checkOut = U.addDays(out.checkIn, 1);
    }
    return out;
  }
  function saveSearch(s) { S.setSearch(s); return s; }

  /**
   * Validate search criteria.
   * @returns {{ok:boolean, errors:Object}}
   */
  function validateSearch(s) {
    var e = {};
    if (!U.notEmpty(s.checkIn))  e.checkIn  = 'Please select a check-in date.';
    else if (s.checkIn < U.today()) e.checkIn = 'Check-in date cannot be in the past.';
    if (!U.notEmpty(s.checkOut)) e.checkOut = 'Please select a check-out date.';
    if (s.checkIn && s.checkOut) {
      if (U.nights(s.checkIn, s.checkOut) < 1) e.checkOut = 'Check-out must be after check-in.';
    }
    if (!(+s.adults >= 1)) e.adults = 'At least 1 adult is required.';
    if (!(+s.rooms  >= 1)) e.rooms  = 'At least 1 room is required.';
    if (+s.children < 0)   e.children = 'Children cannot be negative.';
    return { ok: Object.keys(e).length === 0, errors: e };
  }

  /* ---------- current draft ---------- */
  function draft() { return S.getCurrent() || {}; }

  function startBooking(hotelId, roomId, search) {
    var h = D.getHotel(hotelId), r = D.getRoom(hotelId, roomId);
    if (!h || !r) return null;
    var s = search || readSearch();
    var n = U.nights(s.checkIn, s.checkOut);
    var p = U.calcPrice(r.pricePerNight, n, s.rooms, null, sheetNightly(r, s.checkIn, s.checkOut));
    var c = S.patchCurrent({
      hotelId: h.id, hotelName: h.name, branchCode: h.branchCode,
      hotelAddress: h.address, hotelImage: (h.images || [])[0] || null,
      roomId: r.id, roomName: r.name, roomImage: (r.images || [])[0] || null,
      checkIn: s.checkIn, checkOut: s.checkOut, nights: n,
      adults: s.adults, children: s.children, rooms: s.rooms,
      price: p, startedAt: new Date().toISOString()
    });
    return c;
  }

  /** Recompute price from whatever is currently in the draft. */
  function reprice() {
    var c = draft();
    if (!c.hotelId || !c.roomId) return c;
    var r = D.getRoom(c.hotelId, c.roomId);
    if (!r) return c;
    var n = U.nights(c.checkIn, c.checkOut);
    return S.patchCurrent({
      nights: n,
      price: U.calcPrice(r.pricePerNight, n, c.rooms || 1, null,
                         sheetNightly(r, c.checkIn, c.checkOut))
    });
  }

  /* ---------- guards ---------- */
  /** Require a selected room; otherwise bounce to the right place. */
  function requireRoom(redirect) {
    var c = draft();
    if (c.hotelId && c.roomId && D.getRoom(c.hotelId, c.roomId)) return c;
    U.toast('Please select a room to continue.');
    setTimeout(function () {
      location.href = redirect || (c.hotelId ? 'hotel-detail.html?hotel=' + c.hotelId : 'hotels.html');
    }, 900);
    return null;
  }
  /** Require guest details captured in step 3. */
  function requireGuest() {
    var c = requireRoom();
    if (!c) return null;
    if (c.guest && U.notEmpty(c.guest.firstName) && U.isEmail(c.guest.email)) return c;
    U.toast('Please complete your guest details first.');
    setTimeout(function () { location.href = 'guest-details.html'; }, 900);
    return null;
  }

  /* ---------- guest details validation ---------- */
  function validateGuest(g) {
    var e = {};
    if (!U.notEmpty(g.firstName)) e.firstName = 'First name is required.';
    if (!U.notEmpty(g.lastName))  e.lastName  = 'Last name is required.';
    if (!U.notEmpty(g.email))     e.email     = 'Email address is required.';
    else if (!U.isEmail(g.email)) e.email     = 'Please enter a valid email address.';
    if (!U.notEmpty(g.phone))     e.phone     = 'Phone number is required.';
    else if (!U.isPhone(g.phone)) e.phone     = 'Please enter a valid phone number.';
    if (!U.notEmpty(g.nationality)) e.nationality = 'Please select a nationality.';
    if (g.checkInGuest === 'different') {
      if (!U.notEmpty(g.guestFirstName)) e.guestFirstName = 'Guest first name is required.';
      if (!U.notEmpty(g.guestLastName))  e.guestLastName  = 'Guest last name is required.';
    }
    if (!(+g.adults >= 1)) e.adults = 'At least 1 adult is required.';
    if (!U.notEmpty(g.paymentMethod)) e.paymentMethod = 'Please choose a payment method.';
    return { ok: Object.keys(e).length === 0, errors: e };
  }

  /* ---------- confirm ---------- */
  /**
   * Final validation → mint booking number → persist.
   * @returns {{ok:boolean, booking?:Object, errors?:Object}}
   */
  function confirmBooking() {
    var c = draft();
    var errs = {};

    if (!c.hotelId || !D.getHotel(c.hotelId)) errs.hotel = 'Hotel is missing.';
    if (!c.roomId  || !D.getRoom(c.hotelId, c.roomId)) errs.room = 'Room selection is missing.';
    var sv = validateSearch(c);
    if (!sv.ok) Object.assign(errs, sv.errors);
    if (!c.guest) errs.guest = 'Guest details are missing.';
    else {
      var gv = validateGuest(c.guest);
      if (!gv.ok) Object.assign(errs, gv.errors);
    }
    if (Object.keys(errs).length) return { ok: false, errors: errs };

    var h = D.getHotel(c.hotelId), r = D.getRoom(c.hotelId, c.roomId);
    var n = U.nights(c.checkIn, c.checkOut);
    var p = U.calcPrice(r.pricePerNight, n, c.rooms || 1, null,
                        sheetNightly(r, c.checkIn, c.checkOut));
    var number = S.generateBookingNumber(h.branchCode);

    var booking = {
      bookingNumber: number,
      branchId:   h.id,
      branchCode: h.branchCode,
      hotelId:    h.id,
      hotelName:  h.name,
      hotelAddress: h.address,
      hotelImage: (h.images || [])[0] || null,
      roomId:     r.id,
      roomName:   r.name,
      roomImage:  (r.images || [])[0] || null,
      roomSize:   r.size,
      roomBed:    r.bedType,
      roomView:   r.view,
      roomMaxGuests: r.maxGuests,
      breakfast:  !!r.breakfast,
      checkIn:    c.checkIn,
      checkOut:   c.checkOut,
      checkInTime:  h.checkIn,
      checkOutTime: h.checkOut,
      nights:     n,
      adults:     +c.adults   || 1,
      children:   +c.children || 0,
      infants:    +(c.guest && c.guest.infants) || 0,
      rooms:      +c.rooms    || 1,
      guest:      c.guest,
      specialRequests: (c.guest && c.guest.specialRequests) || '',
      arrivalTime:     (c.guest && c.guest.arrivalTime) || null,
      purpose:         (c.guest && c.guest.purpose) || null,
      heardFrom:       (c.guest && c.guest.heardFrom) || null,
      paymentMethod:   (c.guest && c.guest.paymentMethod) || 'pay-later',
      roomRate:      p.subtotal,
      nightlyRate:   r.pricePerNight,
      serviceCharge: p.serviceCharge,
      vat:           p.vat,
      total:         p.total,
      currency:      'VND',
      serviceChargeRate: p.serviceChargeRate,
      vatRate:           p.vatRate,
      cancellationDeadline: U.cancelBy(c.checkIn),
      cancellationPolicy:   r.cancellation,
      priceBasis: r.priceBasis,
      rateSource: r.rateSource || 'DEMO',
      rateConfidence: r.rateConfidence || null,
      sheetRoomName: r.sheetRoomName || null,
      nightlyRates: p.nightlyRates || null,
      status:    'CONFIRMED',
      createdAt: new Date().toISOString()
    };

    S.saveBooking(booking);
    S.setGuest(c.guest);
    S.patchCurrent({ bookingNumber: number, confirmedAt: booking.createdAt });
    return { ok: true, booking: booking };
  }

  function cancelBooking(number) {
    return S.updateBooking(number, { status: 'CANCELLED', cancelledAt: new Date().toISOString() });
  }

  /* ---------- shared render helpers ---------- */
  /**
   * @param {Object} c    booking draft / booking record
   * @param {Object} opts {thumb:false, header:false}
   *        header:false omits the hotel name/address block entirely — used
   *        where the caller has already rendered its own header above.
   */
  function stayPanelHTML(c, opts) {
    opts = opts || {};
    var n = U.nights(c.checkIn, c.checkOut);
    var header = opts.header === false ? '' :
      '<div style="display:flex;gap:14px;align-items:flex-start">' +
        '<div style="flex:1;min-width:0">' +
          '<h4 style="font-family:var(--serif);font-size:1.12rem;margin-bottom:3px">' + U.esc(c.hotelName) + '</h4>' +
          '<p class="tiny muted" style="margin:0">' + U.esc(c.hotelAddress || '') + '</p></div>' +
        (c.hotelImage && opts.thumb !== false ?
          '<div style="width:62px;height:62px;border-radius:var(--r-sm);overflow:hidden;flex-shrink:0;background:var(--beige)">' +
          U.img(c.hotelImage, c.hotelName, '', true, false) + '</div>' : '') +
      '</div>' +
      '<div class="divider" style="margin-block:16px"></div>';
    return '<div class="panel__b">' + header +
      '<div class="dl dl--2" style="gap:12px">' +
        '<div><div class="dt">Check-in</div><div class="dd">' + U.fmtDate(c.checkIn) +
          '<small>' + U.dayName(c.checkIn) + (c.checkInTime ? ' · from ' + c.checkInTime : '') + '</small></div></div>' +
        '<div><div class="dt">Check-out</div><div class="dd">' + U.fmtDate(c.checkOut) +
          '<small>' + U.dayName(c.checkOut) + (c.checkOutTime ? ' · until ' + c.checkOutTime : '') + '</small></div></div>' +
      '</div>' +
      '<div class="divider" style="margin-block:16px"></div>' +
      '<div class="dl dl--2" style="gap:12px">' +
        '<div><div class="dt">Duration</div><div class="dd">' + n + ' Night' + (n === 1 ? '' : 's') + '</div></div>' +
        '<div><div class="dt">Guests &amp; Rooms</div><div class="dd">' + guestLabel(c) + '</div></div>' +
      '</div></div>';
  }

  function guestLabel(c) {
    var a = +c.adults || 1, k = +c.children || 0, r = +c.rooms || 1;
    var s = a + ' Adult' + (a === 1 ? '' : 's');
    if (k > 0) s += ', ' + k + ' Child' + (k === 1 ? '' : 'ren');
    return s + ', ' + r + ' Room' + (r === 1 ? '' : 's');
  }

  /**
   * @param {Object} p price object from U.calcPrice
   * @param {Object} [opts] {demoNote:false, nights:[{date,weekend,rate}], rateSource}
   *        When the operator rate sheet drives the price, each night is listed
   *        with its own figure, because weekday and weekend rates differ.
   */
  function priceBreakdownHTML(p, opts) {
    opts = opts || {};
    var perNight = opts.nights && opts.nights.length && p.nightlyRates;
    var rateRow;
    if (perNight) {
      rateRow = '<div class="prow"><span>Room rate<small>' +
        opts.nights.map(function (n) {
          return U.fmtDate(n.date) + ' · ' + (n.weekend ? 'Weekend' : 'Weekday') +
                 ' · ' + U.vnd(n.rate);
        }).join('<br>') +
        (p.rooms > 1 ? '<br>× ' + p.rooms + ' rooms' : '') +
        '</small></span><span>' + U.vnd(p.subtotal) +
        ' <small style="display:inline;color:var(--tx-3)">VND</small></span></div>';
    } else {
      rateRow = '<div class="prow"><span>Room rate<small>' + U.vnd(p.nightly) + ' VND × ' + p.nights +
        ' night' + (p.nights === 1 ? '' : 's') + (p.rooms > 1 ? ' × ' + p.rooms + ' rooms' : '') + '</small></span>' +
        '<span>' + U.vnd(p.subtotal) + ' <small style="display:inline;color:var(--tx-3)">VND</small></span></div>';
    }
    return rateRow +
      '<div class="prow"><span>Service charge (' + Math.round(p.serviceChargeRate * 100) + '%)</span>' +
        '<span>' + U.vnd(p.serviceCharge) + ' <small style="display:inline;color:var(--tx-3)">VND</small></span></div>' +
      '<div class="prow"><span>VAT (' + Math.round(p.vatRate * 100) + '%)</span>' +
        '<span>' + U.vnd(p.vat) + ' <small style="display:inline;color:var(--tx-3)">VND</small></span></div>' +
      '<div class="prow prow--total"><span>Total</span><span>' + U.vnd(p.total) + '<sup>VND</sup></span></div>' +
      '<p class="tiny muted" style="text-align:right;margin:2px 0 0">Including taxes &amp; fees</p>' +
      (opts.demoNote === false ? '' : rateNoteHTML(opts.rateSource));
  }

  /** Truthful provenance line under every price panel. */
  function rateNoteHTML(rateSource) {
    if (rateSource === 'SHEET') {
      return '<div class="alert alert--ok" style="margin-top:14px;font-size:.78rem">' + U.icon('checkC', 15) +
        '<span><b>Operator rate sheet</b>Weekday (Mon–Thu) and weekend (Fri–Sun) rates differ and are ' +
        'seasonal. Rates <b style="display:inline">exclude breakfast</b>. Extra adult 300,000 VND and ' +
        'extra child (3–12) 150,000 VND per person per night above room standard.</span></div>';
    }
    return '<div class="alert alert--demo" style="margin-top:14px">' + U.icon('info', 15) +
      '<span><b>Demo rate</b>No rate-sheet tab has been supplied for this property yet, so this figure is ' +
      'derived from its published price range. Not an operator rate and not a live Agoda rate.</span></div>';
  }

  /** Booking-support panel. All contact data comes from js/contact.js. */
  function assistHTML() {
    return '<div class="panel__b">' +
      global.Contact.supportBlock({
        title: 'Need help with your booking?',
        sub: 'Our KAS team is here for you ' + D.config.contact.hours + '.'
      }).replace('class="ct-support"', 'class="ct-support" style="border:none;padding:0;background:none"') +
      '<div class="divider" style="margin-block:14px"></div>' +
      global.Contact.emailLink('plain') +
      '</div>';
  }

  var TRUST = [
    ['shield', 'Best Rate Guarantee', 'Always the best rate when you book direct.'],
    ['rot',    'Free Cancellation',   'Cancel up to 24 hours before check-in.'],
    ['lock',   'Secure Payment',      'Your payment information is always protected.'],
    ['crown',  'Member Privileges',   'Exclusive benefits for KAS Privilege members.']
  ];
  function trustStripHTML() {
    return '<section class="trust trust--pad noprint"><div class="container trust__in">' +
      TRUST.map(function (t) {
        return '<div class="trust__i">' + U.icon(t[0], 21) +
          '<div><b>' + t[1] + '</b><span>' + t[2] + '</span></div></div>';
      }).join('') + '</div></section>';
  }
  function trustBadgesHTML() {
    return TRUST.map(function (t) {
      return '<div style="display:flex;gap:11px;align-items:flex-start;padding:9px 0">' +
        '<span style="color:var(--gold-dk);flex-shrink:0;margin-top:1px">' + U.icon(t[0], 18) + '</span>' +
        '<div><b style="font-size:.82rem;display:block">' + t[1] + '</b>' +
        '<span class="tiny muted">' + t[2] + '</span></div></div>';
    }).join('');
  }

  global.Booking = {
    readSearch: readSearch, saveSearch: saveSearch, validateSearch: validateSearch,
    draft: draft, startBooking: startBooking, reprice: reprice,
    requireRoom: requireRoom, requireGuest: requireGuest,
    validateGuest: validateGuest, confirmBooking: confirmBooking, cancelBooking: cancelBooking,
    stayPanelHTML: stayPanelHTML, priceBreakdownHTML: priceBreakdownHTML,
    guestLabel: guestLabel, assistHTML: assistHTML,
    trustStripHTML: trustStripHTML, trustBadgesHTML: trustBadgesHTML
  };
})(window);
