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
   * prices are loaded from the backend for the selected dates.
   * A blank cell in the sheet makes the quote incomplete -> we fall back
   * rather than invent a figure for that night.
   */
  function sheetNightly() { return null; }

  async function refreshQuote() {
    var c = draft();
    var mapped = global.KAS_API_MAP && global.KAS_API_MAP[c.roomId];
    try {
      if (!mapped || !global.KAS_API) throw new Error('Price is not configured for this room.');
      var quote = await global.KAS_API.request('/api/v1/public/request-pricing/quote', { method: 'POST', body: {
        propertySlug: mapped.propertySlug, checkIn: c.checkIn, checkOut: c.checkOut,
        adults: +c.adults || 1, children: +c.children || 0, childAges: [],
        lines: [{ roomTypeSlug: mapped.roomTypeSlug, quantity: +c.rooms || 1 }]
      }});
      var line = quote.lines && quote.lines[0];
      var price = { nightly: line && line.nightlyFrom ? line.nightlyFrom.amountMinor : null,
        nights: quote.nights, rooms: +c.rooms || 1, subtotal: quote.roomsSubtotal.amountMinor,
        total: quote.estimatedTotal ? quote.estimatedTotal.amountMinor : quote.total.amountMinor,
        serviceCharge: 0, vat: 0, serviceChargeRate: 0, vatRate: 0, source: 'BACKEND' };
      return S.patchCurrent({ price: price, quoteError: '', nights: quote.nights });
    } catch (error) {
      var why = describeBookingError(error);
      return S.patchCurrent({ price: { total: null, subtotal: null, nightly: null, nights: U.nights(c.checkIn,c.checkOut), rooms: c.rooms, source: 'UNAVAILABLE' }, quoteError: why.message, quoteErrorCustomer: why.customer });
    }
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
    if (!c.hotelId || !c.roomId || (c.price && c.price.source)) return c;
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
    if (c.guest && U.notEmpty(c.guest.fullName || [c.guest.firstName, c.guest.lastName].filter(Boolean).join(' ')) && U.isEmail(c.guest.email)) return c;
    U.toast('Please complete your guest details first.');
    setTimeout(function () { location.href = 'guest-details.html'; }, 900);
    return null;
  }

  /* ---------- guest details validation ---------- */
  function validateGuest(g) {
    var e = {};
    if (!U.notEmpty(g.fullName || [g.firstName, g.lastName].filter(Boolean).join(' '))) e.fullName = 'Full name is required.';
    if (!U.notEmpty(g.email))     e.email     = 'Email address is required.';
    else if (!U.isEmail(g.email)) e.email     = 'Please enter a valid email address.';
    if (!U.notEmpty(g.phone))     e.phone     = 'Phone number is required.';
    else if (!U.isPhone(g.phone)) e.phone     = 'Please enter a valid phone number.';
    if (!U.notEmpty(g.nationality)) e.nationality = 'Please select a nationality.';
    if (g.checkInGuest === 'different') {
      if (!U.notEmpty(g.guestFullName || [g.guestFirstName, g.guestLastName].filter(Boolean).join(' '))) e.guestFullName = 'Guest full name is required.';
    }
    if (!(+g.adults >= 1)) e.adults = 'At least 1 adult is required.';
    return { ok: Object.keys(e).length === 0, errors: e };
  }


  function newIdempotencyKey() {
    return global.crypto && crypto.randomUUID ? crypto.randomUUID() : ('kas-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  /* The real reason a quote or booking request was refused, in the guest's
     language. `customer: true` means the guest can fix it (dates, guests,
     contact details); `false` means it is on the hotel/system side, so the
     guest is told so instead of being sent back to re-check their details. */
  function describeBookingError(error) {
    var vi = !!(global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi');
    function t(v, e) { return vi ? v : e; }
    var payload = (error && error.payload) || {};
    var code = payload.code || '';
    var details = Array.isArray(payload.details) ? payload.details : [];
    var status = error && error.status;
    var first = details[0] || {};
    var field = String(first.field || ''), reason = String(first.code || ''), note = String(first.message || '');
    function num(text) { var m = String(text).match(/(\d+)/g); return m ? m : []; }

    if (!status) {
      return { customer: false, message: t('Không kết nối được tới hệ thống đặt phòng. Vui lòng kiểm tra mạng và thử lại sau ít phút.', 'The booking system could not be reached. Check your connection and try again in a moment.') };
    }
    if (code === 'IDEMPOTENCY_KEY_REUSED') {
      return { customer: false, message: t('Yêu cầu trước đó vẫn còn lưu trên trình duyệt. Vui lòng bấm gửi lại.', 'A previous request was still stored in this browser. Please send the request again.') };
    }
    /* Reasons first: the same reason can arrive under different codes
       (OVER_CAPACITY comes as OCCUPANCY_EXCEEDED, child pricing as CONFIG_MISSING). */
    if (reason === 'OVER_CAPACITY' || code === 'OCCUPANCY_EXCEEDED') {
      var capacity = num(note)[0];
      return { customer: true, message: t('Số khách vượt quá sức chứa của phòng đã chọn' + (capacity ? ' (tối đa ' + capacity + ' khách)' : '') + '. Vui lòng thêm phòng hoặc giảm số khách.', 'Too many guests for the selected rooms' + (capacity ? ' (up to ' + capacity + ')' : '') + '. Add a room or reduce the number of guests.') };
    }
    if (reason === 'CHILD_PRICING_UNSUPPORTED') return { customer: true, message: t('Hiện chưa nhận đặt online cho kỳ nghỉ có trẻ em. Vui lòng liên hệ khách sạn để được hỗ trợ.', 'Online booking with children is not available yet. Please contact the hotel.') };
    if (reason === 'VOUCHER_UNSUPPORTED') return { customer: true, message: t('Mã ưu đãi chưa áp dụng được khi đặt online. Vui lòng bỏ mã ưu đãi hoặc liên hệ khách sạn.', 'Offer codes cannot be applied online yet. Remove the code or contact the hotel.') };
    if (code === 'PROPERTY_CLOSED') return { customer: false, message: t('Khách sạn này đang tạm ngừng nhận đặt phòng. Vui lòng chọn khách sạn khác hoặc liên hệ KAS.', 'This hotel is not taking bookings at the moment. Please choose another hotel or contact KAS.') };
    if (code === 'CONFIG_MISSING') return { customer: false, message: t('Khách sạn chưa thiết lập đủ thông tin để nhận đặt online cho lựa chọn này (lỗi phía khách sạn). Vui lòng liên hệ khách sạn.', 'The hotel has not finished setting up online booking for this choice (hotel-side). Please contact the hotel.') };
    if (code === 'VALIDATION_FAILED') {
      if (field === 'checkIn') return { customer: true, message: t('Ngày nhận phòng đã qua. Vui lòng chọn ngày nhận phòng từ hôm nay trở đi.', 'The check-in date has passed. Please choose today or a later date.') };
      if (field === 'checkOut') return { customer: true, message: t('Ngày trả phòng phải sau ngày nhận phòng (tối thiểu 1 đêm).', 'Check-out must be after check-in (at least one night).') };
      if (field === 'guest.email') return { customer: true, message: t('Email không hợp lệ. Vui lòng kiểm tra lại địa chỉ email.', 'The email address is not valid. Please check it.') };
      if (field === 'guest.fullName') return { customer: true, message: t('Vui lòng nhập họ và tên người nhận phòng.', 'Please enter the guest\'s full name.') };
      if (field === 'guest.phone') return { customer: true, message: t('Vui lòng nhập số điện thoại liên hệ.', 'Please enter a contact phone number.') };
      if (field === 'guest.country') return { customer: true, message: t('Quốc tịch chưa hợp lệ. Vui lòng chọn lại quốc tịch.', 'The nationality is not valid. Please choose it again.') };
      if (field === 'adults') return { customer: true, message: t('Cần ít nhất 1 người lớn cho mỗi đặt phòng.', 'At least one adult is required.') };
      if (field.indexOf('lines') === 0 || reason === 'DUPLICATE_ROOM_TYPE') return { customer: false, message: t('Thông tin phòng gửi lên không hợp lệ (lỗi hệ thống). Vui lòng chọn lại phòng hoặc liên hệ khách sạn.', 'The room selection could not be read (system error). Please choose the room again or contact the hotel.') };
    }
    if (code === 'NO_AVAILABILITY' || status === 422) {
      if (reason === 'NOT_PRICED') {
        var date = (note.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
        var shown = date ? date.split('-').reverse().join('/') : '';
        return { customer: false, message: t('Khách sạn chưa mở giá cho ' + (shown ? 'ngày ' + shown : 'một số đêm trong kỳ nghỉ') + '. Vui lòng chọn ngày khác hoặc liên hệ khách sạn.', 'The hotel has not opened rates for ' + (shown ? date : 'some nights of this stay') + ' yet. Please choose other dates or contact the hotel.') };
      }
      if (reason === 'NOT_BOOKABLE') return { customer: false, message: t('Hạng phòng này hiện không nhận đặt cho ngày đã chọn. Vui lòng chọn hạng phòng hoặc ngày khác.', 'This room type cannot be booked for these dates. Please choose another room or dates.') };
      var left = num(note)[1];
      return { customer: true, message: t('Hạng phòng đã hết cho ngày đã chọn' + (left !== undefined ? ' (còn ' + left + ' phòng)' : '') + '. Vui lòng chọn ngày, số phòng hoặc hạng phòng khác.', 'This room is no longer available for these dates' + (left !== undefined ? ' (' + left + ' left)' : '') + '. Please choose other dates, fewer rooms or another room.') };
    }
    if (status === 404) return { customer: false, message: t('Khách sạn hoặc hạng phòng này hiện không nhận đặt online. Vui lòng liên hệ khách sạn.', 'This hotel or room is not open for online requests. Please contact the hotel.') };
    if (status === 429) return { customer: false, message: t('Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau ít phút.', 'Too many requests in a short time. Please try again in a few minutes.') };
    if (status >= 500) return { customer: false, message: t('Hệ thống đặt phòng đang gặp sự cố, không phải do thông tin của bạn. Vui lòng thử lại sau hoặc liên hệ khách sạn.', 'The booking system had a problem — not your details. Please try again later or contact the hotel.') };
    /* Unknown refusal: show the server's own words rather than a generic line. */
    return { customer: true, message: payload.message ? t('Không gửi được yêu cầu: ', 'Request refused: ') + payload.message : (error.message || t('Không gửi được yêu cầu đặt phòng.', 'Could not send the booking request.')) };
  }

  /* ---------- confirm ---------- */
  /**
   * Final validation → mint booking number → persist.
   * @returns {{ok:boolean, booking?:Object, errors?:Object}}
   */
  async function confirmBooking() {
    await refreshQuote();
    var c = draft();
    var errs = {};
    if(c.quoteError) errs.price=c.quoteError;
    var customerFixable = c.quoteError ? c.quoteErrorCustomer !== false : true;

    if (!c.hotelId || !D.getHotel(c.hotelId)) errs.hotel = 'Hotel is missing.';
    if (!c.roomId  || !D.getRoom(c.hotelId, c.roomId)) errs.room = 'Room selection is missing.';
    var sv = validateSearch(c);
    if (!sv.ok) Object.assign(errs, sv.errors);
    /* The dates themselves are wrong: say that once, not again as a price error. */
    if (errs.checkIn || errs.checkOut) delete errs.price;
    if (!c.guest) errs.guest = 'Guest details are missing.';
    else {
      var gv = validateGuest(c.guest);
      if (!gv.ok) Object.assign(errs, gv.errors);
    }
    if (Object.keys(errs).length) return Promise.resolve({ ok: false, errors: errs, customerFixable: customerFixable });

    var h = D.getHotel(c.hotelId), r = D.getRoom(c.hotelId, c.roomId);
    if (+c.children > 0) return Promise.resolve({ ok: false, errors: { children: 'Online booking for stays with children is not available yet. Please contact the hotel directly.' } });
    var mapped = global.KAS_API_MAP && global.KAS_API_MAP[c.roomId];
    if (!global.KAS_API || !mapped) return Promise.resolve({ ok: false, errors: { api: 'This room is not mapped to the booking system yet. Please contact the hotel.' } });
    var guestName = String(c.guest.checkInGuest === 'different'
      ? (c.guest.guestFullName || [c.guest.guestFirstName, c.guest.guestLastName].filter(Boolean).join(' '))
      : (c.guest.fullName || [c.guest.firstName, c.guest.lastName].filter(Boolean).join(' '))).trim();
    var country = String(c.guest.nationality || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) country = null;
    var locale = global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi' ? 'vi' : 'en';
    var body = {
      propertySlug: mapped.propertySlug,
      checkIn: c.checkIn,
      checkOut: c.checkOut,
      adults: +c.adults || 1,
      children: 0,
      childAges: [],
      lines: [{ roomTypeSlug: mapped.roomTypeSlug, quantity: +c.rooms || 1 }],
      guest: {
        fullName: guestName,
        email: c.guest.email,
        phone: String(c.guest.phoneFull || c.guest.phone || '').trim(),
        country: country,
        preferredChannel: null,
        bestTimeToContact: null
      },
      specialRequests: c.guest.specialRequests || null,
      discoveryChannel: 'WEBSITE',
      offerCode: null,
      acceptedTermsVersion: null,
      marketingConsent: false,
      locale: locale
    };
    /* One Idempotency-Key per request content. The key only protects a retry of
       the SAME request (double click, flaky network); it used to live in the
       draft forever, so the next booking from this browser reused it and the
       backend refused it (409 IDEMPOTENCY_KEY_REUSED) — or, with identical
       details, answered with the previous booking's reference. */
    var fingerprint = JSON.stringify(body);
    var idempotencyKey = c.idempotencyKey && c.idempotencyFingerprint === fingerprint ? c.idempotencyKey : newIdempotencyKey();
    S.patchCurrent({ idempotencyKey: idempotencyKey, idempotencyFingerprint: fingerprint });
    function submit(key, retried) {
      return global.KAS_API.submitReservation(body, key, locale).catch(function (error) {
        /* A key left over from before this fix: start again with a fresh one. */
        if (!retried && error && error.status === 409 && error.payload && error.payload.code === 'IDEMPOTENCY_KEY_REUSED') {
          var fresh = newIdempotencyKey();
          S.patchCurrent({ idempotencyKey: fresh, idempotencyFingerprint: fingerprint });
          return submit(fresh, true);
        }
        throw error;
      });
    }
    return submit(idempotencyKey, false).then(function (receipt) {
      var n = U.nights(c.checkIn, c.checkOut);
      var p = U.calcPrice(r.pricePerNight, n, c.rooms || 1, null, sheetNightly(r, c.checkIn, c.checkOut));
      var total = receipt && receipt.estimatedTotal ? Number(receipt.estimatedTotal.amountMinor) : null;
      var booking = {
      bookingNumber: receipt.reference,
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
      paymentMethod:   (c.guest && c.guest.paymentMethod) || 'pay-later',
      roomRate:      receipt.estimatedTotal ? receipt.estimatedTotal.amountMinor : null,
      nightlyRate:   null,
      serviceCharge: 0,
      vat:           0,
      total:         p.total,
      currency:      'VND',
      serviceChargeRate: 0,
      vatRate:           0,
      cancellationDeadline: U.cancelBy(c.checkIn),
      cancellationPolicy:   r.cancellation,
      priceBasis: r.priceBasis,
      rateSource: 'BACKEND',
      backend: true,
      rateConfidence: r.rateConfidence || null,
      sheetRoomName: r.sheetRoomName || null,
      nightlyRates: p.nightlyRates || null,
      status: 'REQUESTED',
      estimatedTotal: total,
      estimateDisclaimer: receipt && receipt.estimateDisclaimer || '',
      responsePromise: receipt && receipt.responsePromise || '',
      createdAt: new Date().toISOString()
      };
      booking.total = total;
      S.saveBooking(booking);
      S.setGuest(c.guest);
      /* Done: the next booking must not reuse this request's key. */
      S.patchCurrent({ bookingNumber: receipt.reference, requestReceipt: receipt, confirmedAt: booking.createdAt,
        idempotencyKey: null, idempotencyFingerprint: null });
      return { ok: true, booking: booking, receipt: receipt };
    }).catch(function (error) {
      var why = describeBookingError(error);
      return { ok: false, errors: { api: why.message }, customerFixable: why.customer };
    });
  }

  function cancelBooking(number) {
    throw new Error('Cancellation must be requested through the server.');
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
   * @param {Object} [opts] {nights:[{date,weekend,rate}], rateSource}
   *        When the operator rate sheet drives the price, each night is listed
   *        with its own figure, because weekday and weekend rates differ.
   */
  function priceBreakdownHTML(p) {
    p = p || {};
    var vi = global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi';
    var amount = p.total == null || !Number.isFinite(Number(p.total)) ? null : Number(p.total);
    if (amount == null) return '<p role="status" class="tiny muted">' + (vi ? 'Chưa có giá xác thực. Vui lòng liên hệ khách sạn.' : 'No current price is available. Please contact the hotel.') + '</p>';
    return '<div class="prow"><span>' + (vi ? 'Tiền phòng' : 'Room amount') + '</span><span>' + U.vnd(p.subtotal == null ? amount : p.subtotal) + ' VND</span></div>' +
      '<div class="prow prow--total"><span>' + (vi ? 'Tổng giá dự kiến' : 'Estimated total') + '</span><span>' + U.vnd(amount) + '<sup>VND</sup></span></div>' +
      '<p class="tiny muted">' + (vi ? 'Khách sạn kiểm tra và xác nhận phòng, giá và điều kiện thanh toán trước khi đặt phòng được xác nhận.' : 'The hotel reviews the room, price and payment terms before the booking is confirmed.') + '</p>';
  }
  function rateNoteHTML() { return ''; }

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
    refreshQuote: refreshQuote,
    describeBookingError: describeBookingError,
    readSearch: readSearch, saveSearch: saveSearch, validateSearch: validateSearch,
    draft: draft, startBooking: startBooking, reprice: reprice,
    requireRoom: requireRoom, requireGuest: requireGuest,
    validateGuest: validateGuest, confirmBooking: confirmBooking, cancelBooking: cancelBooking,
    stayPanelHTML: stayPanelHTML, priceBreakdownHTML: priceBreakdownHTML,
    guestLabel: guestLabel, assistHTML: assistHTML,
    trustStripHTML: trustStripHTML, trustBadgesHTML: trustBadgesHTML
  };
})(window);
