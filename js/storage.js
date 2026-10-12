/* ==========================================================================
   KAS — LOCALSTORAGE LAYER
   Keys: kas_bookings · kas_recent_search · kas_current_booking · kas_guest_info
   ========================================================================== */
(function (global) {
  'use strict';

  var K = {
    BOOKINGS: 'kas_bookings',
    SEARCH:   'kas_recent_search',
    CURRENT:  'kas_current_booking',
    GUEST:    'kas_guest_info',
    SAVED_HOTELS: 'kas_saved_hotels'
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn('[KAS] storage write failed', key, e); return false; }
  }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  /* ---------- bookings ---------- */
  function getBookings() {
    var b = read(K.BOOKINGS, []);
    return Array.isArray(b) ? b : [];
  }
  function saveBooking(booking) {
    var all = getBookings();
    var i = all.findIndex(function (b) { return b.bookingNumber === booking.bookingNumber; });
    if (i >= 0) all[i] = booking; else all.unshift(booking);
    write(K.BOOKINGS, all);
    return booking;
  }
  function findBooking(number, email) {
    var n = String(number || '').trim().toUpperCase().replace(/\s|-/g, '');
    var e = String(email || '').trim().toLowerCase();
    return getBookings().filter(function (b) {
      var bn = String(b.bookingNumber || '').toUpperCase().replace(/\s|-/g, '');
      if (bn !== n) return false;
      if (!e) return true;
      return String(b.guest && b.guest.email || '').toLowerCase() === e;
    })[0] || null;
  }
  function getByNumber(number) {
    /* same normalisation as findBooking(), so "kas 0242480" is recognised */
    var n = String(number || '').trim().toUpperCase().replace(/\s|-/g, '');
    return getBookings().filter(function (b) {
      return String(b.bookingNumber).toUpperCase().replace(/\s|-/g, '') === n;
    })[0] || null;
  }
  function updateBooking(number, patch) {
    var all = getBookings();
    var i = all.findIndex(function (b) { return b.bookingNumber === number; });
    if (i < 0) return null;
    all[i] = Object.assign({}, all[i], patch, { updatedAt: new Date().toISOString() });
    write(K.BOOKINGS, all);
    return all[i];
  }
  function numberExists(n) {
    return getBookings().some(function (b) { return b.bookingNumber === n; });
  }

  /**
   * Booking number: KAS + 2-digit branch code + 5 random digits.
   * The 5-digit tail must not collide with any existing booking.
   */
  function generateBookingNumber(branchCode) {
    var bc = String(branchCode || '00').padStart(2, '0');
    for (var attempt = 0; attempt < 500; attempt++) {
      var tail = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
      var candidate = 'KAS' + bc + tail;
      if (!numberExists(candidate)) return candidate;
    }
    // Exhaustive fallback: walk the space deterministically.
    for (var i = 0; i < 100000; i++) {
      var c2 = 'KAS' + bc + String(i).padStart(5, '0');
      if (!numberExists(c2)) return c2;
    }
    return 'KAS' + bc + String(Date.now()).slice(-5);
  }

  /* ---------- search / draft / guest ---------- */
  function getSearch() {
    var cfg = (global.KAS_DATA && global.KAS_DATA.config) || {};
    return read(K.SEARCH, {
      hotelId: '', checkIn: cfg.defaultCheckIn, checkOut: cfg.defaultCheckOut,
      adults: cfg.defaultAdults, children: cfg.defaultChildren, rooms: cfg.defaultRooms
    });
  }
  function setSearch(s) { return write(K.SEARCH, s); }

  function getCurrent() { return read(K.CURRENT, null); }
  function setCurrent(c) { return write(K.CURRENT, c); }
  function patchCurrent(p) {
    var c = getCurrent() || {};
    var n = Object.assign({}, c, p);
    write(K.CURRENT, n);
    return n;
  }
  function clearCurrent() { remove(K.CURRENT); }

  function getGuest() { return read(K.GUEST, null); }
  function setGuest(g) { return write(K.GUEST, g); }

  /* Saved hotels use one canonical key across all KAS pages. Read a small set of
     * legacy aliases as a recovery path, then migrate them to the canonical key. */
  function normalizeSavedIds(value) {
    if (!Array.isArray(value)) return [];
    var seen = Object.create(null), ids = [];
    value.forEach(function (item) {
      var id = String(item == null ? '' : item).trim();
      if (id && !seen[id]) { seen[id] = true; ids.push(id); }
    });
    return ids;
  }
  function getSavedHotels() {
    var ids = normalizeSavedIds(read(K.SAVED_HOTELS, null));
    if (ids.length) return ids;
    var aliases = ['kas_savedHotels', 'kas_saved_hotels_v1', 'kas-saved-hotels'];
    for (var i = 0; i < aliases.length; i++) {
      var legacy = normalizeSavedIds(read(aliases[i], null));
      if (legacy.length) { write(K.SAVED_HOTELS, legacy); return legacy; }
    }
    return ids;
  }
  function notifySavedHotels() {
    try { global.dispatchEvent(new CustomEvent('kas:saved-hotels-changed', { detail: { ids: getSavedHotels() } })); } catch (e) {}
  }
  function isHotelSaved(id) { return getSavedHotels().indexOf(String(id)) >= 0; }
  function toggleSavedHotel(id) {
    var key = String(id), all = getSavedHotels(), i = all.indexOf(key);
    if (i >= 0) all.splice(i, 1); else all.unshift(key);
    write(K.SAVED_HOTELS, all);
    notifySavedHotels();
    return i < 0;
  }
  function removeSavedHotel(id) {
    var key = String(id);
    write(K.SAVED_HOTELS, getSavedHotels().filter(function (x) { return x !== key; }));
    notifySavedHotels();
  }

  global.Store = {
    KEYS: K,
    getBookings: getBookings, saveBooking: saveBooking, findBooking: findBooking,
    getByNumber: getByNumber, updateBooking: updateBooking, numberExists: numberExists,
    generateBookingNumber: generateBookingNumber,
    getSearch: getSearch, setSearch: setSearch,
    getCurrent: getCurrent, setCurrent: setCurrent, patchCurrent: patchCurrent, clearCurrent: clearCurrent,
    getGuest: getGuest, setGuest: setGuest,
    getSavedHotels: getSavedHotels, isHotelSaved: isHotelSaved, toggleSavedHotel: toggleSavedHotel, removeSavedHotel: removeSavedHotel
  };
})(window);
