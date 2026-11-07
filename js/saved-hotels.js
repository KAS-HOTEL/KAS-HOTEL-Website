/* KAS Saved Hotels — standalone page driven by the shared saved-id store. */
(function (global) {
  'use strict';
  var U = global.U, D = global.KAS_DATA, Store = global.Store;
  if (!U || !D || !Store) return;
  var lang = global.KAS_I18N ? global.KAS_I18N.getLanguage() : 'en';
  var grid = document.getElementById('savedGrid');
  var empty = document.getElementById('savedEmpty');
  var sort = document.getElementById('savedSort');
  var copy = {
    vi: {title:'Khách sạn đã lưu', subtitle:'Những khách sạn bạn đã lưu', home:'Trang chủ', mykas:'My KAS', current:'Khách sạn đã lưu', count:'Tất cả', sort:'Sắp xếp:', recent:'Mới lưu gần đây', rating:'Đánh giá cao nhất', name:'Tên khách sạn A–Z', emptyTitle:'Bạn chưa lưu khách sạn nào', emptyCopy:'Khám phá bộ sưu tập KAS và lưu những nơi bạn muốn trải nghiệm.', explore:'Khám phá khách sạn', remove:'Bỏ lưu', reviews:'đánh giá', signInTitle:'Đăng nhập để xem khách sạn đã lưu', signInCopy:'Khách sạn bạn lưu được giữ trong tài khoản KAS, trên mọi thiết bị.', signIn:'Đăng nhập'},
    en: {title:'Saved hotels', subtitle:'The hotels you have saved', home:'Home', mykas:'My KAS', current:'Saved hotels', count:'All', sort:'Sort by:', recent:'Recently saved', rating:'Highest rated', name:'Hotel name A–Z', emptyTitle:'No saved hotels yet', emptyCopy:'Explore the KAS collection and save the places you would love to experience.', explore:'Explore hotels', remove:'Remove', reviews:'reviews', signInTitle:'Sign in to see your saved hotels', signInCopy:'Hotels you save are kept with your KAS account, on every device.', signIn:'Sign in'}
  };
  function esc(v){return U.esc(String(v == null ? '' : v));}
  function setCopy(){
    var t=copy[lang];
    document.documentElement.lang=lang;
    document.title=t.title+' — KAS Hotel Collection';
    function setText(selector,value){var el=document.querySelector(selector);if(el)el.textContent=value;}
    setText('[data-saved-home]',t.home);
    setText('[data-saved-mykas]',t.mykas);
    setText('[data-saved-current]',t.current);
    setText('[data-saved-title]',t.title);
    /* Subtitle is intentionally omitted from the compact Saved Hotels design. */
    setText('[data-saved-subtitle]',t.subtitle);
    setText('[data-saved-sort-label]',t.sort);
    setText('[data-saved-empty-title]',t.emptyTitle);
    setText('[data-saved-empty-copy]',t.emptyCopy);
    var explore=document.querySelector('[data-saved-explore]');
    if(explore)explore.innerHTML=esc(t.explore)+' <span aria-hidden="true">→</span>';
    if(sort&&sort.options.length>=3){sort.options[0].textContent=t.recent;sort.options[1].textContent=t.rating;sort.options[2].textContent=t.name;}
  }
  function render(){
    var ids=Store.getSavedHotels();
    var items=ids.map(function(id,index){var h=D.hotels.find(function(item){return String(item.id)===String(id);});if(h){h.__savedIndex=index;}return h;}).filter(Boolean);
    if(sort.value==='rating')items.sort(function(a,b){return (b.rating||0)-(a.rating||0);});
    if(sort.value==='name')items.sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
    var t=copy[lang];document.getElementById('savedCount').textContent=t.count+' ('+items.length+')';
    empty.hidden=items.length!==0;grid.hidden=items.length===0;
    /* Saved hotels belong to the account: signed out, offer sign-in rather than an empty list. */
    var signedOut=Store.savedHotelsSignedIn&&Store.savedHotelsSignedIn()===false;
    var emptyTitle=document.querySelector('[data-saved-empty-title]'),emptyCopy=document.querySelector('[data-saved-empty-copy]'),explore=document.querySelector('[data-saved-explore]');
    if(emptyTitle)emptyTitle.textContent=signedOut?t.signInTitle:t.emptyTitle;
    if(emptyCopy)emptyCopy.textContent=signedOut?t.signInCopy:t.emptyCopy;
    if(explore){explore.innerHTML=esc(signedOut?t.signIn:t.explore)+' <span aria-hidden="true">→</span>';explore.onclick=signedOut?function(e){e.preventDefault();if(global.App)global.App.openAuth('login');}:null;}
    /* Same card as the Hotels listing (HotelUI.hotelCard), in its "saved" variant. */
    var H=global.HotelUI,B=global.Booking,search=B&&B.readSearch?B.readSearch():{};
    grid.innerHTML=H?items.map(function(h){return H.hotelCard(h,search,{variant:'saved',lang:lang});}).join(''):'';
    if(global.App&&global.App.miniCarousel)grid.querySelectorAll('.hcard__media').forEach(global.App.miniCarousel);
    grid.querySelectorAll('[data-saved-card]').forEach(function(card){
      /* The whole card opens the hotel; its links, the heart and the photo arrows keep their own action. */
      card.addEventListener('click',function(e){if(e.target.closest('a,button'))return;window.location.href=card.getAttribute('data-hotel-url');});
    });
    grid.querySelectorAll('[data-remove-saved]').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();Store.removeSavedHotel(btn.getAttribute('data-remove-saved'));render();});});
  }
  AppBoot();
  function AppBoot(){if(global.App)global.App.boot({active:'my kas',floating:false,noWelcome:true});var strip=document.getElementById('trustStrip');if(strip&&global.Booking&&global.Booking.trustStripHTML)strip.outerHTML=global.Booking.trustStripHTML();setCopy();if(global.KAS_LIVE&&typeof global.KAS_LIVE.load==='function'){global.KAS_LIVE.load().then(function(catalog){D.hotels.forEach(function(h){global.KAS_LIVE.applyToHotel(h,catalog);});render();}).catch(render);}else render();}
  sort.addEventListener('change',render);
  document.addEventListener('kas:language',function(e){lang=e.detail&&e.detail.lang==='vi'?'vi':'en';setCopy();render();});
  /* Refresh when another tab changes saved hotels, when this tab regains focus,
   * and when the detail page dispatches an in-tab update. */
  window.addEventListener('storage',function(e){if(!e.key || e.key===Store.KEYS.SAVED_HOTELS)render();});
  window.addEventListener('kas:saved-hotels-changed',render);
  window.addEventListener('focus',render);
  window.addEventListener('pageshow',render);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)render();});
})(window);
