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
    var lang = (document.documentElement.lang || 'en').toLowerCase().slice(0, 2);
    var vi = lang === 'vi';
    var externalHotelPicker = !!o.externalHotelPicker;
    var lockHotel = !!o.lockHotel;
    var copy = vi ? {
      where: 'Nơi lưu trú', checkIn: 'Nhận phòng', checkOut: 'Trả phòng', guests: 'Khách & phòng',
      search: 'Tìm kiếm', all: 'Tất cả khách sạn', adults: 'Người lớn', children: 'Trẻ em', rooms: 'Phòng', done: 'Xong',
      adultAge: 'Từ 13 tuổi', childAge: '2–12 tuổi'
    } : {
      where: 'Where', checkIn: 'Check-in', checkOut: 'Check-out', guests: 'Guests & Rooms',
      search: 'Search', all: 'All KAS Hotels', adults: 'Adults', children: 'Children', rooms: 'Rooms', done: 'Done',
      adultAge: 'Ages 13+', childAge: 'Ages 2–12'
    };

    host.className = 'searchbar' + (o.solid ? ' searchbar--solid' : '');
    /* A locked destination is intentionally global: callers such as the
       Hotels listing can guarantee that search always targets the full KAS
       collection, regardless of an old URL/localStorage value. */
    var selectedHotel = !lockHotel && v.hotelId ? D.getHotel(v.hotelId) : null;
    var selectedName = selectedHotel ? selectedHotel.name : copy.all;

    host.innerHTML =
      destField(copy.where, selectedName, copy.all) +
      dateField(copy.checkIn, 'sbIn', v.checkIn, min, vi) +
      dateField(copy.checkOut, 'sbOut', v.checkOut, U.addDays(v.checkIn, 1), vi) +
      '<div class="sf sf--guests"><span class="sf__lb">' + copy.guests + '</span>' +
        '<div class="sf__ctl">' + U.icon('users', 16) +
          '<button type="button" id="sbGuests" class="searchbar__field-btn" aria-expanded="false">' + guestText(v) + '</button></div>' +
        '<div class="gpop" id="sbPop" role="dialog" aria-label="' + U.esc(copy.guests) + '">' +
          row(copy.adults, copy.adultAge, 'adults', v.adults, 1, 12) +
          row(copy.children, copy.childAge, 'children', v.children, 0, 8) +
          row(copy.rooms, '', 'rooms', v.rooms, 1, 6) +
          '<button class="btn btn--gold btn--sm btn--block" type="button" id="sbDone">' + copy.done + '</button>' +
        '</div></div>' +
      '<button class="btn btn--gold searchbar__submit" type="button" id="sbGo">' + U.esc(o.cta || copy.search) + '</button>';

    var elIn = U.$('#sbIn', host), elOut = U.$('#sbOut', host),
        pop = U.$('#sbPop', host), btnG = U.$('#sbGuests', host),
        hotelBtn = U.$('#sbHotel', host), hotelPop = U.$('#sbHotelPop', host);
    var state = { adults: +v.adults, children: +v.children, rooms: +v.rooms };
    var selectedHotelId = lockHotel ? '' : (v.hotelId || '');
    var hotelSearchInput = U.$('#sbHotelSearch', host);
    /* One shared date picker for the whole search bar. Keeping a single popup
       prevents check-in/check-out calendars from ever stacking or fighting
       for z-index. The active field only changes the picker context. */
    var datePickerState = { open: null, month: (U.parseDate ? U.parseDate(v.checkIn) : new Date()) || new Date() };
    var sharedDatePicker = document.createElement('div');
    var searchWrap = host.closest ? host.closest('.hotel-search-wrap') : null;
    var datePickerInSearchWrap = !!searchWrap;
    sharedDatePicker.className = 'kas-date-picker kas-date-picker--shared' + (datePickerInSearchWrap ? ' kas-date-picker--search-wrap' : '');
    sharedDatePicker.setAttribute('role', 'dialog');
    sharedDatePicker.setAttribute('aria-modal', 'false');
    (searchWrap || host).appendChild(sharedDatePicker);
    setupDatePicker('sbIn', copy.checkIn);
    setupDatePicker('sbOut', copy.checkOut);

    function setupDatePicker(id, label) {
      var input = U.$('#' + id, host), field = input && input.closest('.sf');
      if (!input || !field) return;
      var trigger = U.$('.kas-date-trigger', field);
      trigger.addEventListener('click', function(e){ e.stopPropagation(); openDatePicker(id); });
    }
    function openDatePicker(id) {
      /* Date picker is the only search popup allowed to remain open. */
      if (hotelPop) hotelPop.classList.remove('open');
      if (btnG) btnG.setAttribute('aria-expanded', 'false');
      if (pop) pop.classList.remove('open');
      if (hotelBtn) hotelBtn.setAttribute('aria-expanded', 'false');
      if (typeof o.onPopupOpen === 'function') o.onPopupOpen('date');

      datePickerState.open=id;
      var input=U.$('#'+id,host);
      if (!input) return;
      var d=U.parseDate(input.value) || new Date();
      datePickerState.month=new Date(d.getFullYear(), d.getMonth(), 1);
      renderDatePicker(sharedDatePicker,id,id==='sbIn'?copy.checkIn:copy.checkOut);
      positionDatePicker(id);
      sharedDatePicker.classList.add('open');
      input.setAttribute('aria-expanded','true');
    }
    function positionDatePicker(id) {
      if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) return;
      var field = U.$('#'+id, host) && U.$('#'+id, host).closest('.sf');
      if (!field) return;
      if (datePickerInSearchWrap) {
        /* Keep the shared calendar anchored to the search bar itself, not to
           the full wrapper (which also contains the Quick Search panel).
           This prevents the calendar from jumping when the panel opens/closes. */
        var wrapRect = searchWrap.getBoundingClientRect();
        var hostRect = host.getBoundingClientRect();
        var pickerWidth = Math.min(640, Math.max(0, window.innerWidth - 32));
        sharedDatePicker.style.width = pickerWidth + 'px';
        sharedDatePicker.style.left = ((hostRect.left - wrapRect.left) + Math.max(0, (hostRect.width - pickerWidth) / 2)) + 'px';
        sharedDatePicker.style.top = (hostRect.bottom - wrapRect.top + 10) + 'px';
        return;
      }
      var r=field.getBoundingClientRect();
      var width=Math.min(700, Math.max(560, window.innerWidth-32));
      var left=r.left + r.width/2 - width/2;
      left=Math.max(16, Math.min(left, window.innerWidth-width-16));
      sharedDatePicker.style.width=width+'px';
      sharedDatePicker.style.left=left+'px';
      sharedDatePicker.style.top=(r.bottom+10)+'px';
    }
    function closeDatePickers(){
      if (sharedDatePicker) sharedDatePicker.classList.remove('open');
      ['sbIn','sbOut'].forEach(function(id){ var i=U.$('#'+id,host); if(i) i.setAttribute('aria-expanded','false'); });
      datePickerState.open=null;
    }
    function renderDatePicker(picker, id, label){
      var base=new Date(datePickerState.month.getFullYear(), datePickerState.month.getMonth(),1);
      var next=new Date(base.getFullYear(),base.getMonth()+1,1);
      picker.innerHTML = '<div class="kas-date-picker__head">' +
        '<button type="button" class="kas-date-nav" data-dir="-1" aria-label="Previous month">‹</button>' +
        '<div class="kas-date-months"><strong>' + monthLabel(base) + '</strong><strong>' + monthLabel(next) + '</strong></div>' +
        '<button type="button" class="kas-date-nav" data-dir="1" aria-label="Next month">›</button>' +
      '</div><div class="kas-date-calendars"><div class="kas-calendar" data-month="'+U.toISO(base).slice(0,7)+'">'+calendarHTML(base,id)+'</div><div class="kas-calendar kas-calendar--second" data-month="'+U.toISO(next).slice(0,7)+'">'+calendarHTML(next,id)+'</div></div>' +
      '<div class="kas-date-picker__foot"><span>' + U.esc(label) + '</span><button type="button" class="kas-date-today">' + (vi?'Hôm nay':'Today') + '</button></div>';
      U.$$('.kas-date-nav',picker).forEach(function(b){ b.addEventListener('click',function(e){e.stopPropagation();datePickerState.month=new Date(datePickerState.month.getFullYear(),datePickerState.month.getMonth()+ (+b.dataset.dir),1);renderDatePicker(picker,id,label);}); });
      U.$$('.kas-date-cell',picker).forEach(function(b){ b.addEventListener('click',function(e){e.stopPropagation(); if(b.disabled) return; selectDate(id,b.dataset.date);}); });
      U.$('.kas-date-today',picker).addEventListener('click',function(e){e.stopPropagation();selectDate(id,U.today());});
    }
    function monthLabel(d){ var names=vi?['Tháng Một','Tháng Hai','Tháng Ba','Tháng Tư','Tháng Năm','Tháng Sáu','Tháng Bảy','Tháng Tám','Tháng Chín','Tháng Mười','Tháng Mười Một','Tháng Mười Hai']:['January','February','March','April','May','June','July','August','September','October','November','December']; return names[d.getMonth()]+' '+d.getFullYear(); }
    function calendarHTML(d,id){
      var days=vi?['T2','T3','T4','T5','T6','T7','CN']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      var first=(d.getDay()+6)%7, count=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(), html='<div class="kas-calendar__weekdays">'+days.map(function(x){return '<span>'+x+'</span>';}).join('')+'</div><div class="kas-calendar__grid">';
      for(var i=0;i<first;i++) html+='<span class="kas-date-cell is-empty"></span>';
      var inVal=U.$('#sbIn',host)&&U.$('#sbIn',host).value, outVal=U.$('#sbOut',host)&&U.$('#sbOut',host).value, minVal=id==='sbIn'?U.today():inVal?U.addDays(inVal,1):U.today();
      for(var day=1;day<=count;day++){ var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'), disabled=iso<minVal, range=inVal&&outVal&&iso>inVal&&iso<outVal, selected=iso===inVal||iso===outVal; html+='<button type="button" class="kas-date-cell'+(selected?' is-selected':'')+(range?' is-range':'')+'" data-date="'+iso+'"'+(disabled?' disabled':'')+'>'+day+'</button>'; }
      return html+'</div>';
    }
    function selectDate(id,iso){
      var input=U.$('#'+id,host); if(!input) return;
      input.value=iso;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      refreshDateTrigger(id);
      if(id==='sbIn'){
        var next=U.addDays(iso,1);
        if(elOut.value<next) elOut.value=next;
        refreshDateTrigger('sbOut');
        /* Reuse the same popup and switch context to check-out. */
        openDatePicker('sbOut');
      } else {
        closeDatePickers();
      }
    }

    if (hotelBtn) hotelBtn.addEventListener('click', function () {
      /* Any destination interaction is allowed to take focus away from the
         shared date picker. This is especially important on Hotels where
         the destination button opens KAS Quick Search instead of hotelPop. */
      closeDatePickers();
    });

    if (!externalHotelPicker) hotelBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !hotelPop.classList.contains('open');
      hotelPop.classList.toggle('open', open);
      hotelBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { pop.classList.remove('open'); closeDatePickers(); }
      btnG.setAttribute('aria-expanded', 'false');
    });
    if (!externalHotelPicker && hotelSearchInput) {
      hotelSearchInput.addEventListener('input', function () {
        var q = hotelSearchInput.value.trim().toLowerCase();
        if (!externalHotelPicker) U.$$('.searchbar__hotel-option', hotelPop).forEach(function (item) {
          item.hidden = !!q && item.textContent.trim().toLowerCase().indexOf(q) === -1;
        });
      });
      hotelSearchInput.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    if (!externalHotelPicker) U.$$('.searchbar__hotel-option', hotelPop).forEach(function (item) {
      item.addEventListener('click', function () {
        selectedHotelId = item.dataset.hotelId || '';
        hotelBtn.textContent = item.textContent;
        hotelPop.classList.remove('open');
        hotelBtn.setAttribute('aria-expanded', 'false');
        if (hotelSearchInput) { hotelSearchInput.value = ''; U.$$('.searchbar__hotel-option', hotelPop).forEach(function (x) { x.hidden = false; }); }
        U.$$('.searchbar__hotel-option', hotelPop).forEach(function (x) { x.classList.toggle('is-active', x === item); });
      });
    });

    btnG.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !pop.classList.contains('open');
      pop.classList.toggle('open', open);
      btnG.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { hotelPop.classList.remove('open'); closeDatePickers(); }
      hotelBtn.setAttribute('aria-expanded', 'false');
    });
    U.$('#sbDone', host).addEventListener('click', function () { pop.classList.remove('open'); btnG.setAttribute('aria-expanded', 'false'); });

    if (host.__kasSearchOutside) document.removeEventListener('click', host.__kasSearchOutside);
    host.__kasSearchOutside = function (e) {
      if (!e.target.closest('.kas-date-picker') && !e.target.closest('.kas-date-trigger')) closeDatePickers();
      if (!pop.contains(e.target) && e.target !== btnG) {
        pop.classList.remove('open');
        btnG.setAttribute('aria-expanded', 'false');
      }
      if (!externalHotelPicker && !hotelPop.contains(e.target) && e.target !== hotelBtn) {
        hotelPop.classList.remove('open');
        hotelBtn.setAttribute('aria-expanded', 'false');
        if (hotelSearchInput) { hotelSearchInput.value = ''; U.$$('.searchbar__hotel-option', hotelPop).forEach(function (x) { x.hidden = false; }); }
      }
    };
    document.addEventListener('click', host.__kasSearchOutside);

    U.$$('.gpop__row', pop).forEach(function (r) {
      var key = r.dataset.k, out = U.$('output', r), lo = +r.dataset.min, hi = +r.dataset.max;
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

    elIn.addEventListener('change', function () {
      var nextMin = U.addDays(elIn.value, 1);
      elOut.min = nextMin;
      if (U.nights(elIn.value, elOut.value) < 1) elOut.value = nextMin;
      refreshDateTrigger('sbIn'); refreshDateTrigger('sbOut');
      U.clearErr(elIn); U.clearErr(elOut);
    });
    elOut.addEventListener('change', function () { refreshDateTrigger('sbOut'); U.clearErr(elOut); });
    function refreshDateTrigger(id){ var i=U.$('#'+id,host), t=i&&i.closest('.sf')&&U.$('.kas-date-trigger',i.closest('.sf')); if(i&&t) t.textContent=formatDateDisplay(i.value, (document.documentElement.lang || 'en').toLowerCase().slice(0,2)==='vi'); }

    function collect() {
      return {
        hotelId: selectedHotelId, checkIn: elIn.value, checkOut: elOut.value,
        adults: state.adults, children: state.children, rooms: state.rooms
      };
    }
    function go() {
      var s = collect();
      var val = B.validateSearch(s);
      if (!val.ok) {
        if (val.errors.checkIn) elIn.classList.add('is-err');
        if (val.errors.checkOut) elOut.classList.add('is-err');
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
    U.$('#sbGo', host).addEventListener('click', function () { closeDatePickers(); go(); });
    if (host.__kasSearchKey) host.removeEventListener('keydown', host.__kasSearchKey);
    host.__kasSearchKey = function (e) { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') go(); };
    host.addEventListener('keydown', host.__kasSearchKey);

    return { collect: collect, go: go };

    function destField(lb, current, allLabel) {
      var displayCurrent = lockHotel ? allLabel : (o.destinationLabel || current);
      var options = '<button type="button" class="searchbar__hotel-option' + (!selectedHotel ? ' is-active' : '') + '" data-hotel-id="">' +
        U.esc(allLabel) + '</button>' +
        D.hotels.map(function (h) {
          return '<button type="button" class="searchbar__hotel-option' + (h.id === v.hotelId ? ' is-active' : '') + '" data-hotel-id="' + U.esc(h.id) + '">' +
            U.esc(h.name) + '</button>';
        }).join('');
      var pop = (externalHotelPicker || lockHotel) ? '' :
        '<div class="searchbar__hotel-pop" id="sbHotelPop" role="listbox" aria-label="' + U.esc(lb) + '"><div class="searchbar__hotel-search"><span aria-hidden="true">⌕</span><input type="search" id="sbHotelSearch" autocomplete="off" placeholder="' + U.esc(vi ? 'Tìm khách sạn...' : 'Search hotels...') + '" aria-label="' + U.esc(vi ? 'Tìm khách sạn' : 'Search hotels') + '"></div><div class="searchbar__hotel-options">' + options + '</div></div>';
      return '<div class="sf sf--destination' + (lockHotel ? ' is-locked' : '') + '"><span class="sf__lb">' + lb + '</span>' +
        '<div class="sf__ctl">' + U.icon('pin', 16) +
          '<button type="button" id="sbHotel" class="searchbar__field-btn searchbar__hotel-btn" aria-expanded="false"' + (lockHotel ? ' disabled aria-disabled="true"' : '') + '>' + U.esc(displayCurrent) + (lockHotel ? '' : '<span class="searchbar__chevron" aria-hidden="true"></span>') + '</button>' +
        '</div>' + pop + '</div>';
    }
    function formatDateDisplay(value, isVi) {
      var d = U.parseDate(value); if (!d) return '—';
      if (isVi) return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
      return U.fmtDate(value);
    }
    function dateField(lb, id, value, minValue, isVi) {
      return '<div class="sf sf--date"><span class="sf__lb">' + U.esc(lb) + '</span>' +
        '<div class="sf__ctl">' + U.icon('cal', 16) +
        '<button type="button" class="kas-date-trigger" aria-expanded="false" aria-label="' + U.esc(lb) + '">' + U.esc(formatDateDisplay(value, isVi)) + '</button>' +
        '<input class="kas-date-value" type="date" id="' + id + '" value="' + U.esc(value) + '" min="' + U.esc(minValue) + '" tabindex="-1" aria-hidden="true">' +
        '</div></div>';
    }
    function row(t, s, k, val, lo, hi) {
      return '<div class="gpop__row" data-k="' + k + '" data-min="' + lo + '" data-max="' + hi + '">' +
        '<div><b>' + t + '</b>' + (s ? '<span>' + s + '</span>' : '') + '</div>' +
        '<div class="stepper"><button type="button" data-d="-" aria-label="Decrease ' + t + '">' + U.icon('minus', 14) + '</button>' +
        '<output>' + val + '</output><button type="button" data-d="+" aria-label="Increase ' + t + '">' + U.icon('plus', 14) + '</button></div></div>';
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
