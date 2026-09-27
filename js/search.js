/* ==========================================================================
   KAS — SEARCH WIDGET  (hero + solid variants, shared by every page)
   ========================================================================== */
(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA, B = global.Booking, S = global.Store;

  /**
   * Render a booking search bar into `host`.
   * @param {Object} o {solid, action, lockHotel, onSearch, values}
   */
  function render(host, o) {
    if (!host) return null;
    o = o || {};
    var v = o.values || B.readSearch();
    var min = U.today();

    host.className = 'searchbar' + (o.solid ? ' searchbar--solid' : '');
    host.innerHTML =
      fld('Where', 'pin',
        '<select id="sbHotel" aria-label="Destination"' + (o.lockHotel ? ' disabled' : '') + '>' +
          '<option value="">All KAS Hotels</option>' +
          D.hotels.map(function (h) {
            return '<option value="' + h.id + '"' + (h.id === v.hotelId ? ' selected' : '') + '>' +
              U.esc(h.name) + '</option>';
          }).join('') + '</select>') +
      fld('Check-in', 'cal',
        '<input type="date" id="sbIn" value="' + U.esc(v.checkIn) + '" min="' + min + '" aria-label="Check-in date">') +
      fld('Check-out', 'cal',
        '<input type="date" id="sbOut" value="' + U.esc(v.checkOut) + '" min="' + U.addDays(v.checkIn, 1) + '" aria-label="Check-out date">') +
      '<div class="sf"><span class="sf__lb">Guests &amp; Rooms</span>' +
        '<div class="sf__ctl">' + U.icon('users', 16) +
          '<button type="button" id="sbGuests" style="width:100%;text-align:left;font-size:.92rem;font-weight:500">' +
            guestText(v) + '</button></div>' +
        '<div class="gpop" id="sbPop">' +
          row('Adults', 'Ages 13+', 'adults', v.adults, 1, 12) +
          row('Children', 'Ages 2–12', 'children', v.children, 0, 8) +
          row('Rooms', '', 'rooms', v.rooms, 1, 6) +
          '<button class="btn btn--gold btn--sm btn--block" type="button" id="sbDone" style="margin-top:12px">Done</button>' +
        '</div></div>' +
      '<button class="btn btn--gold" type="button" id="sbGo">' + (o.cta || 'Explore Rooms') + '</button>';

    var elIn = U.$('#sbIn', host), elOut = U.$('#sbOut', host),
        elHotel = U.$('#sbHotel', host), pop = U.$('#sbPop', host),
        btnG = U.$('#sbGuests', host);
    var state = { adults: +v.adults, children: +v.children, rooms: +v.rooms };

    /* guests popover */
    btnG.addEventListener('click', function (e) { e.stopPropagation(); pop.classList.toggle('open'); });
    U.$('#sbDone', host).addEventListener('click', function () { pop.classList.remove('open'); });
    /* One outside-click handler per host: re-rendering the panel replaces it. */
    if (host.__kasSearchOutside) document.removeEventListener('click', host.__kasSearchOutside);
    host.__kasSearchOutside = function (e) {
      if (!pop.contains(e.target) && e.target !== btnG) pop.classList.remove('open');
    };
    document.addEventListener('click', host.__kasSearchOutside);
    U.$$('.gpop__row', pop).forEach(function (r) {
      var key = r.dataset.k, out = U.$('output', r),
          lo = +r.dataset.min, hi = +r.dataset.max;
      U.$$('button', r).forEach(function (b) {
        b.addEventListener('click', function () {
          var d = b.dataset.d === '+' ? 1 : -1;
          state[key] = Math.min(hi, Math.max(lo, state[key] + d));
          out.textContent = state[key];
          U.$$('button', r)[0].disabled = state[key] <= lo;
          U.$$('button', r)[1].disabled = state[key] >= hi;
          btnG.textContent = guestText(state);
        });
      });
      U.$$('button', r)[0].disabled = state[key] <= lo;
      U.$$('button', r)[1].disabled = state[key] >= hi;
    });

    /* keep check-out after check-in */
    elIn.addEventListener('change', function () {
      var nextMin = U.addDays(elIn.value, 1);
      elOut.min = nextMin;
      if (U.nights(elIn.value, elOut.value) < 1) elOut.value = nextMin;
      U.clearErr(elIn); U.clearErr(elOut);
    });
    elOut.addEventListener('change', function () { U.clearErr(elOut); });

    function collect() {
      return {
        hotelId: elHotel.value, checkIn: elIn.value, checkOut: elOut.value,
        adults: state.adults, children: state.children, rooms: state.rooms
      };
    }
    function go() {
      var s = collect();
      var val = B.validateSearch(s);
      if (!val.ok) {
        if (val.errors.checkIn)  { elIn.classList.add('is-err'); }
        if (val.errors.checkOut) { elOut.classList.add('is-err'); }
        U.toast(val.errors.checkOut || val.errors.checkIn || val.errors.adults || val.errors.rooms);
        return;
      }
      B.saveSearch(s);
      if (o.onSearch) { o.onSearch(s); return; }
      var target = s.hotelId ? 'hotel-detail.html' : 'hotels.html';
      location.href = target + '?' + U.buildQS({
        hotel: s.hotelId, checkIn: s.checkIn, checkOut: s.checkOut,
        adults: s.adults, children: s.children, rooms: s.rooms
      });
    }
    U.$('#sbGo', host).addEventListener('click', go);
    /* Buttons already turn Enter into a click, so only fields need this —
       otherwise Enter on "Search" ran the search twice. The host element is
       reused when the panel is re-rendered, so drop the previous handler first
       (same pattern as the header's __kasScrollHandler). */
    if (host.__kasSearchKey) host.removeEventListener('keydown', host.__kasSearchKey);
    host.__kasSearchKey = function (e) { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') go(); };
    host.addEventListener('keydown', host.__kasSearchKey);

    return { collect: collect, go: go };

    function fld(lb, ic, inner) {
      return '<div class="sf"><span class="sf__lb">' + lb + '</span>' +
        '<div class="sf__ctl">' + U.icon(ic, 16) + inner + '</div></div>';
    }
    function row(t, s, k, val, lo, hi) {
      return '<div class="gpop__row" data-k="' + k + '" data-min="' + lo + '" data-max="' + hi + '">' +
        '<div><b>' + t + '</b>' + (s ? '<span>' + s + '</span>' : '') + '</div>' +
        '<div class="stepper">' +
          '<button type="button" data-d="-" aria-label="Decrease ' + t + '">' + U.icon('minus', 14) + '</button>' +
          '<output>' + val + '</output>' +
          '<button type="button" data-d="+" aria-label="Increase ' + t + '">' + U.icon('plus', 14) + '</button>' +
        '</div></div>';
    }
  }

  function guestText(v) {
    var a = +v.adults || 1, k = +v.children || 0, r = +v.rooms || 1;
    var s = a + ' Guest' + (a === 1 ? '' : 's');
    if (k) s += ', ' + k + ' Child' + (k === 1 ? '' : 'ren');
    return s + ', ' + r + ' Room' + (r === 1 ? '' : 's');
  }

  /** Compact summary bar used on listing / detail pages. */
  function summaryBar(host, s, onEdit) {
    if (!host) return;
    host.innerHTML =
      '<div class="searchbar searchbar--solid searchbar--sum">' +
        cell('Where', 'pin', s.hotelId ? (D.getHotel(s.hotelId) || {}).name : 'All KAS Hotels',
             s.hotelId ? (D.getHotel(s.hotelId) || {}).district : 'Ho Chi Minh City') +
        cell('Check-in', 'cal', U.fmtDate(s.checkIn), U.dayName(s.checkIn)) +
        cell('Check-out', 'cal', U.fmtDate(s.checkOut), U.dayName(s.checkOut)) +
        cell('Guests & Rooms', 'users', guestText(s), '') +
        '<button class="btn btn--dark" type="button" id="sumEdit">Modify search ' + U.icon('edit', 14) + '</button>' +
      '</div>';
    var b = U.$('#sumEdit', host);
    if (b && onEdit) b.addEventListener('click', onEdit);

    function cell(lb, ic, big, small) {
      return '<div class="sf"><span class="sf__lb">' + lb + '</span>' +
        '<div class="sf__ctl">' + U.icon(ic, 16) +
        '<div style="min-width:0"><div style="font-size:.92rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        U.esc(big) + '</div>' + (small ? '<div class="tiny muted">' + U.esc(small) + '</div>' : '') +
        '</div></div></div>';
    }
  }

  global.Search = { render: render, summaryBar: summaryBar, guestText: guestText };
})(window);
