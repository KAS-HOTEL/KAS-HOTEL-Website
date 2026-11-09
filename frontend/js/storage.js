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
    return Array.isArray(b) ? b.filter(function (row) { return row.backend === true; }) : [];
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
  function generateBookingNumber() { throw new Error('Booking references are issued by the server.'); }

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
  function clearGuestDetails() {
    remove(K.GUEST);
    var current = getCurrent();
    if (!current || !current.guest) return;
    var guest = Object.assign({}, current.guest);
    ['fullName', 'firstName', 'lastName', 'email', 'phone', 'phoneFull', 'dial',
      'nationality', 'guestFullName', 'guestFirstName', 'guestLastName'].forEach(function (key) {
      delete guest[key];
    });
    patchCurrent({ guest: guest });
  }

  /* ---------- saved hotels (hotels only; room types are never saved) ----------
     Saved hotels belong to the member's account (GET/PUT/DELETE
     /api/v1/me/favorites), never to the browser: signed out there is nothing
     saved, and two accounts on one browser never share a list. The list lives
     in memory for the page; app.js announces sign-in/out with
     `kas:member-changed`, which (re)loads it. Every change fires
     `kas:saved-hotels-changed` so each button on the page repaints at once.

     Ids are the website's hotel ids (`hotel-01`…). The server speaks property
     slugs; the two are joined through the hotel's rooms in KAS_API_MAP — the
     same mapping the site already prices with. */
  var LEGACY_SAVED_KEYS = [K.SAVED_HOTELS, 'kas_savedHotels', 'kas_saved_hotels_v1', 'kas-saved-hotels'];
  var PENDING_SAVE = 'kas_pending_saved_hotel';
  /* The old browser-wide lists were shared by every account on the device. */
  LEGACY_SAVED_KEYS.forEach(remove);

  var savedIds = [];
  var savedSignedIn = null; /* null until app.js has checked the session */

  function hotelsList() { return (global.KAS_DATA && global.KAS_DATA.hotels) || []; }
  function slugForHotel(id) {
    var hotel = hotelsList().find(function (h) { return String(h.id) === String(id); });
    /* catalog-sync.js sets the console slug on every listed hotel (and new hotels have no room map yet). */
    if (hotel && hotel.slug) return hotel.slug;
    var map = global.KAS_API_MAP || {};
    var room = hotel && (hotel.rooms || []).find(function (r) { return map[r.id] && map[r.id].propertySlug; });
    return room ? map[room.id].propertySlug : null;
  }
  function hotelForSlug(slug) {
    var hit = hotelsList().find(function (h) { return slugForHotel(h.id) === slug; });
    return hit ? String(hit.id) : null;
  }
  var serverSlugs = [];
  function fromServer(payload) {
    var seen = Object.create(null);
    serverSlugs = ((payload && payload.propertySlugs) || []).slice();
    /* A hotel hidden in the console is not listed, so its saved entry is not shown either. */
    return serverSlugs.map(hotelForSlug).filter(function (id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }
  function notifySavedHotels() {
    try { global.dispatchEvent(new CustomEvent('kas:saved-hotels-changed', { detail: { ids: savedIds.slice(), signedIn: savedSignedIn } })); } catch (e) {}
  }
  function getSavedHotels() { return savedIds.slice(); }
  function isHotelSaved(id) { return savedIds.indexOf(String(id)) >= 0; }
  function savedHotelsSignedIn() { return savedSignedIn; }
  function isVi() { return !!(global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi'); }
  function savedToast(text) { if (global.U && global.U.toast) global.U.toast(text); }

  /* Hotels whose save/remove is on its way to the server: a second click on any
     of their hearts is ignored until the answer arrives (2026-11-07). */
  var savingIds = Object.create(null);
  function isHotelSaving(id) { return !!savingIds[String(id)]; }
  /* Not optimistic (owner decision 2026-11-07): the hearts change only once the
     server has confirmed, and the server's list is what they then show. */
  function setSaved(id, saved) {
    var key = String(id), slug = slugForHotel(key);
    if (!slug || !global.KAS_API) return Promise.resolve(isHotelSaved(key));
    if (savingIds[key]) return savingIds[key];
    var request = global.KAS_API.request('/api/v1/me/favorites/' + encodeURIComponent(slug), { method: saved ? 'PUT' : 'DELETE' })
      .then(function (payload) { savedIds = fromServer(payload); return isHotelSaved(key); })
      .catch(function (error) {
        if (error && (error.status === 401 || error.status === 403)) { savedSignedIn = false; askToSignIn(key); }
        else savedToast(isVi() ? 'Chưa lưu được, vui lòng thử lại.' : 'Could not update Saved. Please try again.');
        return null;
      })
      .then(function (result) {
        delete savingIds[key];
        notifySavedHotels();
        return result;
      });
    savingIds[key] = request;
    notifySavedHotels();
    return request;
  }
  function askToSignIn(id) {
    try { sessionStorage.setItem(PENDING_SAVE, String(id)); } catch (e) {}
    savedToast(isVi() ? 'Đăng nhập để lưu khách sạn vào My KAS.' : 'Sign in to save hotels to My KAS.');
    if (global.App && global.App.openAuth) global.App.openAuth('login');
  }
  /* Returns null when the visitor must sign in first (the sign-in dialog opens and
     the save completes after) or the hotel is already being saved; otherwise a
     promise of the confirmed state — true saved, false not saved, null failed. */
  function toggleSavedHotel(id) {
    if (savedSignedIn !== true) { askToSignIn(id); return null; }
    if (isHotelSaving(id)) return null;
    var wanted = !isHotelSaved(id);
    return setSaved(id, wanted);
  }
  function removeSavedHotel(id) { if (savedSignedIn === true) setSaved(id, false); }

  function loadSavedHotels() {
    if (!global.KAS_API) return Promise.resolve([]);
    return global.KAS_API.request('/api/v1/me/favorites').then(function (payload) {
      savedSignedIn = true;
      savedIds = fromServer(payload);
      notifySavedHotels();
      var pending = null;
      try { pending = sessionStorage.getItem(PENDING_SAVE); sessionStorage.removeItem(PENDING_SAVE); } catch (e) {}
      if (pending && !isHotelSaved(pending)) {
        return setSaved(pending, true).then(function (ok) {
          if (ok) savedToast(isVi() ? 'Đã lưu khách sạn vào My KAS.' : 'Hotel saved to My KAS.');
          return getSavedHotels();
        });
      }
      return getSavedHotels();
    }, function (error) {
      if (error && (error.status === 401 || error.status === 403 || error.status === 404)) {
        savedSignedIn = false;
        savedIds = [];
        notifySavedHotels();
      }
      return getSavedHotels();
    });
  }
  /* The console's list arrived after the saved list: map the account's slugs again. */
  global.addEventListener('kas:catalogue-synced', function () {
    if (savedSignedIn !== true) return;
    savedIds = fromServer({ propertySlugs: serverSlugs });
    notifySavedHotels();
  });
  global.addEventListener('kas:member-changed', function (e) {
    if (e.detail && e.detail.signedIn) { loadSavedHotels(); return; }
    savedSignedIn = false;
    savedIds = [];
    notifySavedHotels();
  });

  global.Store = {
    KEYS: K,
    getBookings: getBookings, saveBooking: saveBooking, findBooking: findBooking,
    getByNumber: getByNumber, updateBooking: updateBooking, numberExists: numberExists,
    generateBookingNumber: generateBookingNumber,
    getSearch: getSearch, setSearch: setSearch,
    getCurrent: getCurrent, setCurrent: setCurrent, patchCurrent: patchCurrent, clearCurrent: clearCurrent,
    getGuest: getGuest, setGuest: setGuest, clearGuestDetails: clearGuestDetails,
    getSavedHotels: getSavedHotels, isHotelSaved: isHotelSaved, isHotelSaving: isHotelSaving, toggleSavedHotel: toggleSavedHotel, removeSavedHotel: removeSavedHotel,
    savedHotelsSignedIn: savedHotelsSignedIn, loadSavedHotels: loadSavedHotels
  };
})(window);
