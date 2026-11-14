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

  /** Body of a quote / voucher-list request for the current draft. */
  function quoteBody(c, offerCode) {
    var mapped = global.KAS_API_MAP && global.KAS_API_MAP[c.roomId];
    if (!mapped || !global.KAS_API) return null;
    return {
      propertySlug: mapped.propertySlug, checkIn: c.checkIn, checkOut: c.checkOut,
      adults: +c.adults || 1, children: +c.children || 0, childAges: [],
      lines: [{ roomTypeSlug: mapped.roomTypeSlug, quantity: +c.rooms || 1 }],
      offerCode: offerCode || null,
      pointsToUse: +c.pointsToUse > 0 ? +c.pointsToUse : null
    };
  }
  function money(m) { return m && m.amountMinor != null ? Number(m.amountMinor) : null; }
  /** The backend quote as the draft's price: rooms, voucher discount, taxes, total. */
  function priceFromQuote(quote, c) {
    var line = quote.lines && quote.lines[0];
    return { nightly: line && line.nightlyFrom ? line.nightlyFrom.amountMinor : null,
      nights: quote.nights, rooms: +c.rooms || 1, subtotal: money(quote.roomsSubtotal),
      discount: money(quote.discount) || 0,
      taxes: (quote.taxes || []).map(function (t) { return { type: t.type, ratePercent: Number(t.ratePercent), amount: money(t.amount) || 0, inclusive: !!t.inclusive }; }),
      member: quote.member ? { tier: quote.member.tierCode, percent: Number(quote.member.discountPercent),
        discount: money(quote.member.discount) || 0, pointsAvailable: +quote.member.pointsAvailable || 0,
        pointsUsed: +quote.member.pointsUsed || 0, pointsMax: +quote.member.pointsMaxForStay || 0 } : null,
      total: money(quote.total), source: 'BACKEND' };
  }
  function postQuote(c, offerCode) {
    var body = quoteBody(c, offerCode);
    if (!body) return Promise.reject(new Error('Price is not configured for this room.'));
    return global.KAS_API.request('/api/v1/public/request-pricing/quote', { method: 'POST', body: body });
  }
  /** The points-refusal reason in an API error (POINTS_OVER_LIMIT → OVER_LIMIT, limit), or null. */
  function pointsReason(error) {
    var d = error && error.payload && Array.isArray(error.payload.details) ? error.payload.details[0] : null;
    if (!d || d.field !== 'pointsToUse' || !/^POINTS_/.test(d.code || '')) return null;
    var m = String(d.message || '').match(/limit=(\d+)/);
    return { code: d.code.slice(7), limit: m ? +m[1] : null };
  }
  function pointsMessage(reason, limit) {
    var vi = !!(global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi');
    var n = limit == null ? '' : U.vnd(limit);
    switch (reason) {
      case 'OVER_LIMIT': return vi ? 'Đơn này dùng tối đa ' + n + ' điểm (50% tiền phòng sau ưu đãi).' : 'This stay can use up to ' + n + ' points (50% of the room amount after offers).';
      case 'OVER_BALANCE': return vi ? 'Bạn chỉ có ' + n + ' điểm khả dụng.' : 'You have ' + n + ' points available.';
      case 'BELOW_MINIMUM': return vi ? 'Cần dùng tối thiểu ' + n + ' điểm.' : 'Use at least ' + n + ' points.';
      case 'NOT_A_MEMBER': return vi ? 'Đăng nhập tài khoản thành viên để dùng điểm KAS.' : 'Sign in to your member account to use KAS points.';
      default: return vi ? 'Hiện chưa dùng được điểm KAS.' : 'KAS points cannot be used right now.';
    }
  }

  /** The voucher-refusal reason in an API error (VOUCHER_MIN_NIGHTS → MIN_NIGHTS), or null. */
  function voucherReason(error) {
    var d = error && error.payload && Array.isArray(error.payload.details) ? error.payload.details[0] : null;
    return d && d.field === 'offerCode' && /^VOUCHER_/.test(d.code || '') ? { code: d.code.slice(8), note: d.message || '' } : null;
  }

  async function refreshQuote() {
    var c = draft();
    var code = c.voucher && c.voucher.code;
    try {
      var quote;
      try {
        quote = await postQuote(c, code);
      } catch (error) {
        /* The voucher no longer fits this stay (dates, room, used up): drop it, say why, price without it. */
        var pts = pointsReason(error);
        if (pts && +c.pointsToUse > 0) {
          S.patchCurrent({ pointsToUse: 0, pointsNotice: pointsMessage(pts.code, pts.limit) });
          return refreshQuote();
        }
        var why = code && voucherReason(error);
        if (!why) throw error;
        S.patchCurrent({ voucher: null, voucherNotice: voucherMessage(why.code, null) });
        c = draft();
        quote = await postQuote(c, null);
      }
      var price = priceFromQuote(quote, c);
      var patch = { price: price, quoteError: '', nights: quote.nights };
      if (quote.voucher) patch.voucher = voucherFromView(quote.voucher);
      return S.patchCurrent(patch);
    } catch (error) {
      var described = describeBookingError(error);
      return S.patchCurrent({ price: { total: null, subtotal: null, nightly: null, nights: U.nights(c.checkIn,c.checkOut), rooms: c.rooms, source: 'UNAVAILABLE' }, quoteError: described.message, quoteErrorCustomer: described.customer });
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
    if (field === 'offerCode' && reason.indexOf('VOUCHER_') === 0) return { customer: true, message: voucherMessage(reason.slice(8), null) + ' ' + t('Vui lòng gỡ hoặc chọn voucher khác.', 'Remove it or choose another voucher.') };
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
      /* The backend re-checks the voucher and prices the request itself. */
      offerCode: c.voucher ? c.voucher.code : null,
      pointsToUse: +c.pointsToUse > 0 ? +c.pointsToUse : null,
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
      var totals = priceTotals(c.price);
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
      serviceCharge: totals ? totals.service : 0,
      vat:           totals ? totals.vat : 0,
      voucher:       c.voucher || null,
      voucherDiscount: totals ? totals.discount : 0,
      total:         p.total,
      currency:      'VND',
      serviceChargeRate: totals ? totals.serviceRate : 0,
      vatRate:           totals ? totals.vatRate : 0,
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
  /* ---------- taxes and voucher ----------
     All figures come from the backend quote (owner decision 2026-11-09): the voucher
     comes off the room amount, then VAT (and a service charge, if one is ever turned
     on) is added. One voucher per booking. */
  function isVi() { return !!(global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi'); }
  function pct(rate) { return String(Math.round(Number(rate) * 10) / 10).replace('.', isVi() ? ',' : '.') + '%'; }

  /** Every figure of the price summary, in VND, from a backend price. null when unknown. */
  function priceTotals(p) {
    p = p || {};
    var room = p.subtotal != null ? Number(p.subtotal) : (p.total != null ? Number(p.total) : NaN);
    if (!Number.isFinite(room) || p.total == null) return null;
    var taxes = p.taxes || [];
    var sum = function (type) { return taxes.filter(function (t) { return t.type === type && !t.inclusive; }).reduce(function (a, t) { return a + t.amount; }, 0); };
    var vatRule = taxes.filter(function (t) { return t.type === 'VAT'; })[0];
    var svcRule = taxes.filter(function (t) { return t.type === 'SERVICE_CHARGE'; })[0];
    var memberOff = p.member ? p.member.discount : 0, pointsUsed = p.member ? p.member.pointsUsed : 0;
    return { room: room, discount: Number(p.discount) || 0, member: p.member || null, memberDiscount: memberOff, points: pointsUsed,
             base: room - (Number(p.discount) || 0) - memberOff, taxes: taxes,
             service: sum('SERVICE_CHARGE'), serviceRate: svcRule ? svcRule.ratePercent / 100 : 0,
             vat: sum('VAT'), vatRate: vatRule ? vatRule.ratePercent / 100 : 0, total: Number(p.total) };
  }

  /** "Excludes VAT 8%" for the room page, from the quote's taxes. */
  function taxNote(p) {
    var vi = isVi();
    var added = ((p && p.taxes) || []).filter(function (t) { return !t.inclusive && t.amount > 0; });
    if (!added.length) return vi ? 'Đã gồm thuế, phí' : 'Taxes and fees included';
    return (vi ? 'Chưa gồm ' : 'Excludes ') + added.map(taxLabel).join(vi ? ' và ' : ' and ');
  }
  function taxLabel(t) {
    var vi = isVi();
    var name = t.type === 'VAT' ? (vi ? 'thuế GTGT (VAT)' : 'VAT') : t.type === 'SERVICE_CHARGE' ? (vi ? 'phí dịch vụ' : 'service charge')
      : t.type === 'CITY_TAX' ? (vi ? 'thuế địa phương' : 'city tax') : (vi ? 'phí khác' : 'other charge');
    return name + ' ' + pct(t.ratePercent);
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function voucherLabel(v) {
    if (v.type === 'PERCENTAGE') return '−' + v.value + '%';
    if (v.type === 'FIXED_AMOUNT') return '−' + U.vnd(v.value) + ' VND';
    return v.valueAdd || (isVi() ? 'Quà tặng' : 'Gift');
  }
  /** VoucherView (backend) → the shape the summary and cards use. */
  function voucherFromView(view) {
    return { code: view.code, name: view.name, type: view.type,
      value: view.type === 'PERCENTAGE' ? Number(view.valuePercent) : (view.valueAmount ? Number(view.valueAmount.amountMinor) : 0),
      valueAdd: view.valueAddDescription || '', validTo: view.validTo || null };
  }
  /** Why a voucher cannot be used, in the guest's language (reason codes from the backend). */
  function voucherMessage(reason, view) {
    var vi = isVi();
    var fmt = function (iso) { return iso ? iso.split('-').reverse().join('/') : ''; };
    switch (reason) {
      case 'NOT_FOUND': return vi ? 'Mã voucher không tồn tại.' : 'This voucher code does not exist.';
      case 'INACTIVE': return vi ? 'Voucher này hiện không còn hiệu lực.' : 'This voucher is not active.';
      case 'NOT_STARTED': return vi ? 'Voucher chưa đến thời gian sử dụng.' : 'This voucher cannot be used yet.';
      case 'EXPIRED': return vi ? 'Mã voucher đã hết hạn.' : 'This voucher has expired.';
      case 'USED_UP': return vi ? 'Voucher đã hết lượt sử dụng.' : 'This voucher has been fully used.';
      case 'WRONG_HOTEL': return vi ? 'Voucher không áp dụng cho khách sạn này.' : 'This voucher is not valid at this hotel.';
      case 'WRONG_ROOM': return vi ? 'Voucher không áp dụng cho hạng phòng này.' : 'This voucher is not valid for this room type.';
      /* 2026-11-14: a voucher meant for chosen customers or member tiers. */
      case 'NOT_FOR_YOU': return vi ? 'Voucher này chỉ dành cho một số tài khoản hoặc hạng thành viên. Vui lòng đăng nhập đúng tài khoản được tặng.'
        : 'This voucher is only for certain accounts or member tiers. Please sign in with the account it was given to.';
      case 'STAY_OUT_OF_RANGE':
        return (vi ? 'Áp dụng cho kỳ nghỉ' : 'Valid for stays') + (view && view.stayFrom ? (vi ? ' từ ' : ' from ') + fmt(view.stayFrom) : '') +
          (view && view.stayTo ? (vi ? ' đến ' : ' to ') + fmt(view.stayTo) : '') + '.';
      case 'MIN_NIGHTS': return view && view.minNights ? (vi ? 'Áp dụng cho kỳ nghỉ từ ' + view.minNights + ' đêm.' : 'Needs a stay of at least ' + view.minNights + ' nights.')
        : (vi ? 'Kỳ nghỉ chưa đủ số đêm tối thiểu.' : 'The stay is shorter than this voucher needs.');
      case 'MIN_TOTAL': return view && view.minTotal ? (vi ? 'Áp dụng cho tiền phòng từ ' + U.vnd(view.minTotal.amountMinor) + ' VND.' : 'Needs a room amount of at least ' + U.vnd(view.minTotal.amountMinor) + ' VND.')
        : (vi ? 'Tiền phòng chưa đạt mức tối thiểu.' : 'The room amount is below this voucher\'s minimum.');
      default: return vi ? 'Voucher không áp dụng được cho đơn này.' : 'This voucher cannot be used for this booking.';
    }
  }

  /**
   * Price summary. {voucherBox:true} adds the voucher field and list (guest details, review);
   * the page then calls bindVoucher(container, repaint).
   */
  function priceBreakdownHTML(p, opts) {
    opts = opts || {};
    var vi = isVi();
    var c = draft();
    var voucher = c.voucher || null;
    var t = priceTotals(p);
    if (!t) return '<p role="status" class="tiny muted">' + (vi ? 'Chưa có giá xác thực. Vui lòng liên hệ khách sạn.' : 'No current price is available. Please contact the hotel.') + '</p>';
    var n = U.nights(c.checkIn, c.checkOut) || (p && p.nights) || 1, r = +c.rooms || 1;
    function row(label, value, cls) {
      return '<div class="prow' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span>' + value + '</span></div>';
    }
    var html = row((vi ? 'Tiền phòng' : 'Room amount') + '<small class="prow__sub">' +
        n + (vi ? ' đêm × ' : (n === 1 ? ' night × ' : ' nights × ')) + r + (vi ? ' phòng' : (r === 1 ? ' room' : ' rooms')) + '</small>',
        U.vnd(t.room) + ' VND');
    if (voucher && (t.discount > 0 || voucher.type === 'VALUE_ADD')) {
      html += row('Voucher <b class="prow__code">' + U.esc(voucher.code) + '</b>' +
          (voucher.type !== 'FIXED_AMOUNT' ? '<small class="prow__sub">' + U.esc(voucherLabel(voucher)) + '</small>' : ''),
        t.discount > 0 ? '−' + U.vnd(t.discount) + ' VND' : (vi ? 'Quà tặng' : 'Gift'), 'prow--discount');
    }
    if (t.memberDiscount > 0) {
      html += row((vi ? 'Ưu đãi thành viên KAS' : 'KAS member discount') + ' (' + pct(t.member.percent) + ')',
        '−' + U.vnd(t.memberDiscount) + ' VND', 'prow--discount');
    }
    if (t.discount > 0 || t.memberDiscount > 0) {
      html += row(vi ? 'Tiền phòng sau ưu đãi' : 'Room amount after offers', U.vnd(t.base) + ' VND', 'prow--sub');
    }
    t.taxes.forEach(function (tax) {
      html += row(cap(taxLabel(tax)).replace(/ (\d)/, ' ($1') + ')' + (tax.inclusive ? (vi ? ' · đã gồm' : ' · included') : ''),
        U.vnd(tax.amount) + ' VND');
    });
    if (t.points > 0) {
      html += row((vi ? 'Dùng điểm KAS' : 'KAS points used') + '<small class="prow__sub">' + U.vnd(t.points) + (vi ? ' điểm' : ' points') + '</small>',
        '−' + U.vnd(t.points) + ' VND', 'prow--discount');
    }
    html += row(vi ? 'Tổng giá dự kiến' : 'Estimated total', U.vnd(t.total) + '<sup>VND</sup>', 'prow--total');
    html += '<p class="tiny muted">' + (t.taxes.length
        ? (vi ? 'Đã gồm ' + t.taxes.map(function (x) { return taxLabel(x).replace(/ [\d.,]+%$/, ''); }).join(', ') + '. ' : 'Includes ' + t.taxes.map(function (x) { return taxLabel(x).replace(/ [\d.,]+%$/, ''); }).join(', ') + '. ')
        : '') + (vi ? 'Khách sạn kiểm tra và xác nhận phòng, giá và điều kiện thanh toán trước khi đặt phòng được xác nhận.'
        : 'The hotel reviews the room, price and payment terms before the booking is confirmed.') + '</p>';
    if (opts.voucherBox) html += voucherBoxHTML(voucher, c.voucherNotice);
    if (opts.voucherBox && t.member && t.member.pointsAvailable > 0) html += pointsBoxHTML(t.member, c.pointsNotice);
    return html;
  }

  function voucherBoxHTML(voucher, notice) {
    var vi = isVi();
    var top = voucher
      ? '<div class="vbox__applied">' + U.icon('checkC', 15) +
          '<div><b>' + U.esc(voucher.code) + '</b><span>' + U.esc(voucher.name || voucherLabel(voucher)) + '</span></div>' +
          '<button type="button" class="vbox__remove" data-voucher-remove>' + (vi ? 'Gỡ' : 'Remove') + '</button></div>'
      : '<form data-voucher-form novalidate>' +
          '<label class="vbox__label" for="voucherCode">' + (vi ? 'Mã voucher' : 'Voucher code') + '</label>' +
          '<div class="vbox__row"><input id="voucherCode" class="input" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="' + (vi ? 'Nhập mã voucher' : 'Enter voucher code') + '">' +
          '<button type="submit" class="btn btn--dark">' + (vi ? 'Áp dụng' : 'Apply') + '</button></div></form>';
    return '<div class="vbox' + (voucher ? ' vbox--applied' : '') + '" data-voucher-box>' + top +
      '<p class="vbox__msg' + (notice ? ' is-error' : '') + '" role="status" aria-live="polite">' + (notice ? U.esc(notice) : '') + '</p>' +
      '<div class="vlist" data-voucher-list><p class="vlist__title">' + (vi ? 'Voucher dành cho bạn' : 'Vouchers for you') + '</p>' +
        '<p class="vlist__empty">' + (vi ? 'Đang tải voucher…' : 'Loading vouchers…') + '</p></div>' +
      '<p class="vbox__note">' + (vi ? 'Mỗi đơn sử dụng tối đa 1 voucher. Voucher trừ vào tiền phòng, trước thuế.' : 'Each booking can use at most 1 voucher. It comes off the room amount, before tax.') + '</p></div>';
  }

  /** KAS points: how many the member holds and may use here; 1 point = 1 VND, room part only. */
  function pointsBoxHTML(m, notice) {
    var vi = isVi();
    var max = Math.min(m.pointsAvailable, m.pointsMax);
    return '<form class="vbox pbox" data-points-form novalidate>' +
      '<label class="vbox__label" for="pointsToUse">' + (vi ? 'Dùng điểm KAS' : 'Use KAS points') + '</label>' +
      '<p class="vbox__note" style="margin-top:0">' + (vi ? 'Bạn có ' : 'You have ') + '<b>' + U.vnd(m.pointsAvailable) + '</b>' +
        (vi ? ' điểm. Đơn này dùng tối đa ' : ' points. This stay can use up to ') + '<b>' + U.vnd(max) + '</b>' +
        (vi ? ' điểm (1 điểm = 1 VND, không trừ vào thuế).' : ' points (1 point = 1 VND, not against tax).') + '</p>' +
      '<div class="vbox__row"><input id="pointsToUse" class="input" type="number" min="0" max="' + max + '" step="1000" value="' + (m.pointsUsed || '') + '" placeholder="0">' +
      '<button type="submit" class="btn btn--dark">' + (vi ? 'Áp dụng' : 'Apply') + '</button></div>' +
      (max > 0 ? '<button type="button" class="vbox__remove" style="color:var(--gold-dk)" data-points-max="' + max + '">' + (vi ? 'Dùng tối đa' : 'Use the maximum') + '</button>' : '') +
      (m.pointsUsed > 0 ? ' <button type="button" class="vbox__remove" data-points-clear>' + (vi ? 'Bỏ dùng điểm' : 'Stop using points') + '</button>' : '') +
      '<p class="vbox__msg' + (notice ? ' is-error' : '') + '" role="status" aria-live="polite">' + (notice ? U.esc(notice) : '') + '</p></form>';
  }

  /** Wires the points box; the backend re-checks the amount on every quote. */
  function bindPoints(container, repaint) {
    var form = container && container.querySelector('form[data-points-form]');
    if (!form) return;
    if (draft().pointsNotice) S.patchCurrent({ pointsNotice: '' });
    function apply(n) {
      S.patchCurrent({ pointsToUse: Math.max(0, Math.floor(+n || 0)), pointsNotice: '' });
      refreshQuote().then(function () { repaint(); });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(form.querySelector('input').value); });
    var max = form.querySelector('[data-points-max]');
    if (max) max.addEventListener('click', function () { apply(max.getAttribute('data-points-max')); });
    var clear = form.querySelector('[data-points-clear]');
    if (clear) clear.addEventListener('click', function () { apply(0); });
  }

  function fmtDay(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }

  /** The available vouchers as cards: eligible ones can be picked, the others say why not. */
  function voucherListHTML(views, applied) {
    var vi = isVi();
    var rows = views.map(function (v) { return { view: v, voucher: voucherFromView(v), saving: money(v.saving) || 0 }; });
    rows.sort(function (a, b) { return (b.view.eligible - a.view.eligible) || (b.saving - a.saving); });
    var best = rows.length && rows[0].view.eligible && rows[0].saving > 0 ? rows[0].voucher.code : null;
    var html = '<p class="vlist__title">' + (vi ? 'Voucher dành cho bạn' : 'Vouchers for you') + '</p>';
    if (!rows.length) return html + '<p class="vlist__empty">' + (vi ? 'Hiện chưa có voucher phù hợp.' : 'No vouchers available right now.') + '</p>';
    return html + rows.map(function (r) {
      var v = r.voucher, on = applied && applied.code === v.code;
      var action = on
        ? '<span class="vcard__state">' + (vi ? 'Đang dùng' : 'Applied') + '</span>'
        : (r.view.eligible ? '<button type="button" class="vcard__pick" data-voucher-pick="' + U.esc(v.code) + '">' + (vi ? 'Chọn' : 'Use') + '</button>' : '');
      var badge = v.type === 'PERCENTAGE' ? '−' + v.value + '%' : v.type === 'FIXED_AMOUNT'
        ? '−' + (v.value >= 1000 ? Math.round(v.value / 1000) + 'K' : U.vnd(v.value)) : (vi ? 'Quà' : 'Gift');
      return '<div class="vcard' + (r.view.eligible ? '' : ' is-off') + (on ? ' is-on' : '') + '">' +
        '<div class="vcard__val">' + U.esc(badge) + '</div>' +
        '<div class="vcard__body">' +
          (best === v.code ? '<span class="vcard__best">' + (vi ? 'Tiết kiệm nhất' : 'Best saving') + '</span>' : '') +
          '<b>' + U.esc(v.name) + '</b>' +
          '<span class="vcard__meta">' + U.esc(v.code) + (v.validTo ? (vi ? ' · HSD ' : ' · Valid to ') + fmtDay(v.validTo) : '') + '</span>' +
          (r.view.eligible
            ? (r.saving > 0 ? '<span class="vcard__save">' + (vi ? 'Tiết kiệm ' : 'Save ') + U.vnd(r.saving) + ' VND</span>'
               : (v.valueAdd ? '<span class="vcard__save">' + U.esc(v.valueAdd) + '</span>' : ''))
            : '<span class="vcard__why">' + U.esc(voucherMessage(r.view.reason, r.view)) + '</span>') +
        '</div>' + action + '</div>';
    }).join('');
  }

  /** Tries a code against the backend quote; on success the draft holds the voucher and its price. */
  function applyVoucher(code) {
    var vi = isVi();
    code = String(code || '').trim().toUpperCase();
    if (!code) return Promise.resolve({ ok: false, message: vi ? 'Vui lòng nhập mã voucher.' : 'Please enter a voucher code.' });
    var c = draft();
    return postQuote(c, code).then(function (quote) {
      if (!quote.voucher) return { ok: false, message: voucherMessage('', null) };
      S.patchCurrent({ voucher: voucherFromView(quote.voucher), voucherNotice: '', price: priceFromQuote(quote, c), quoteError: '' });
      return { ok: true };
    }, function (error) {
      var why = voucherReason(error);
      if (why) return { ok: false, message: voucherMessage(why.code, null) };
      return { ok: false, message: describeBookingError(error).message };
    });
  }
  function removeVoucher() {
    S.patchCurrent({ voucher: null, voucherNotice: '' });
    return refreshQuote();
  }
  /** The vouchers the backend offers for this stay (VoucherView[]). */
  function listVouchers() {
    var body = quoteBody(draft(), null);
    if (!body) return Promise.resolve([]);
    return global.KAS_API.request('/api/v1/public/request-pricing/vouchers', { method: 'POST', body: body });
  }

  /** Wires the voucher field and list rendered by priceBreakdownHTML; repaint redraws the summary. */
  function bindVoucher(container, repaint) {
    if (!container) return;
    bindPoints(container, repaint);
    var box = container.querySelector('[data-voucher-box]');
    if (!box) return;
    var msg = box.querySelector('.vbox__msg');
    if (draft().voucherNotice) S.patchCurrent({ voucherNotice: '' }); /* shown once */
    function fail(res, focus) {
      msg.textContent = (res && res.message) || '';
      msg.classList.add('is-error');
      if (focus) focus.focus();
    }
    var form = box.querySelector('form[data-voucher-form]');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input'), btn = form.querySelector('button');
      btn.disabled = true; msg.textContent = ''; msg.classList.remove('is-error');
      applyVoucher(input.value).then(function (res) {
        btn.disabled = false;
        if (res && res.ok) repaint(); else fail(res, input);
      });
    });
    var remove = box.querySelector('[data-voucher-remove]');
    if (remove) remove.addEventListener('click', function () {
      remove.disabled = true;
      removeVoucher().then(function () { repaint(); });
    });

    var list = box.querySelector('[data-voucher-list]');
    if (!list) return;
    listVouchers().then(function (views) {
      list.innerHTML = voucherListHTML(views || [], draft().voucher);
      list.addEventListener('click', function (e) {
        var pick = e.target.closest('[data-voucher-pick]');
        if (!pick) return;
        pick.disabled = true; msg.textContent = ''; msg.classList.remove('is-error');
        applyVoucher(pick.getAttribute('data-voucher-pick')).then(function (res) {
          if (res && res.ok) repaint(); else { pick.disabled = false; fail(res); }
        });
      });
    }, function () { list.remove(); });
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
    ['rot',    'Free Cancellation',   'Members until 12:00 on check-in day; guests 24h before check-in.'],
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
    priceTotals: priceTotals, taxNote: taxNote, applyVoucher: applyVoucher, removeVoucher: removeVoucher, bindVoucher: bindVoucher,
    guestLabel: guestLabel, assistHTML: assistHTML,
    trustStripHTML: trustStripHTML, trustBadgesHTML: trustBadgesHTML
  };
})(window);
