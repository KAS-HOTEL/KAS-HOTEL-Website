/* KAS My KAS › Saved hotels (manage-booking.html?view=saved).
   My KAS owns the page: header, heading, section tabs and sign-in. This script
   fills the Saved section from the account's saved-hotel list (Store, backed by
   /api/v1/me/favorites) with the shared hotel card (HotelUI.hotelCard). Each
   card's heart is the site-wide save toggle (app.js); un-saving re-renders the
   list once the server has confirmed. */
(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA, Store = global.Store;
  var section = document.getElementById('myKasSaved');
  if (!U || !D || !Store || !section) return;
  var grid = document.getElementById('savedGrid');
  var empty = document.getElementById('savedEmpty');
  var sort = document.getElementById('savedSort');
  var copy = {
    vi: {count:'Tất cả', sort:'Sắp xếp:', recent:'Mới lưu gần đây', rating:'Đánh giá cao nhất', name:'Tên khách sạn A–Z', emptyTitle:'Bạn chưa lưu khách sạn nào', emptyCopy:'Khám phá bộ sưu tập KAS và lưu những nơi bạn muốn trải nghiệm.', explore:'Khám phá khách sạn', signInTitle:'Đăng nhập để xem khách sạn đã lưu', signInCopy:'Khách sạn bạn lưu được giữ trong tài khoản KAS, trên mọi thiết bị.', signIn:'Đăng nhập'},
    en: {count:'All', sort:'Sort by:', recent:'Recently saved', rating:'Highest rated', name:'Hotel name A–Z', emptyTitle:'No saved hotels yet', emptyCopy:'Explore the KAS collection and save the places you would love to experience.', explore:'Explore hotels', signInTitle:'Sign in to see your saved hotels', signInCopy:'Hotels you save are kept with your KAS account, on every device.', signIn:'Sign in'}
  };
  function lang() { return global.KAS_I18N && global.KAS_I18N.getLanguage() === 'vi' ? 'vi' : 'en'; }
  function setText(selector, value) { var el = section.querySelector(selector); if (el) el.textContent = value; }
  function setCopy() {
    var t = copy[lang()];
    setText('[data-saved-sort-label]', t.sort);
    sort.options[0].textContent = t.recent;
    sort.options[1].textContent = t.rating;
    sort.options[2].textContent = t.name;
  }
  function render() {
    if (section.hidden) return;
    var t = copy[lang()];
    var items = Store.getSavedHotels().map(function (id) {
      return D.hotels.find(function (h) { return String(h.id) === String(id); });
    }).filter(Boolean);
    if (sort.value === 'rating') items.sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });
    if (sort.value === 'name') items.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    document.getElementById('savedCount').textContent = t.count + ' (' + items.length + ')';
    empty.hidden = items.length !== 0;
    grid.hidden = items.length === 0;
    /* Signed out: offer sign-in rather than an empty list. */
    var signedOut = Store.savedHotelsSignedIn && Store.savedHotelsSignedIn() === false;
    setText('[data-saved-empty-title]', signedOut ? t.signInTitle : t.emptyTitle);
    setText('[data-saved-empty-copy]', signedOut ? t.signInCopy : t.emptyCopy);
    var explore = section.querySelector('[data-saved-explore]');
    if (explore) {
      explore.innerHTML = U.esc(signedOut ? t.signIn : t.explore) + ' <span aria-hidden="true">→</span>';
      explore.onclick = signedOut ? function (e) { e.preventDefault(); if (global.App) global.App.openAuth('login'); } : null;
    }
    var H = global.HotelUI, B = global.Booking, search = B && B.readSearch ? B.readSearch() : {};
    grid.innerHTML = H ? items.map(function (h) { return H.hotelCard(h, search, { variant: 'saved', lang: lang() }); }).join('') : '';
    if (global.App && global.App.miniCarousel) grid.querySelectorAll('.hcard__media').forEach(global.App.miniCarousel);
    if (global.App && global.App.paintSaveButtons) global.App.paintSaveButtons(grid);
  }

  setCopy();
  if (global.KAS_LIVE && typeof global.KAS_LIVE.load === 'function') {
    global.KAS_LIVE.load().then(function (catalog) {
      D.hotels.forEach(function (h) { global.KAS_LIVE.applyToHotel(h, catalog); });
      render();
    }).catch(render);
  } else render();
  sort.addEventListener('change', render);
  document.addEventListener('kas:language', function () { setCopy(); render(); });
  /* The list changes when any heart is confirmed, when the account loads, and when
     the console catalogue arrives (hotels hidden there drop out). */
  global.addEventListener('kas:saved-hotels-changed', render);
  global.addEventListener('kas:catalogue-synced', render);
})(window);
