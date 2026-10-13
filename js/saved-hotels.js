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
    vi: {title:'Khách sạn đã lưu', subtitle:'Những khách sạn bạn đã lưu', home:'Trang chủ', mykas:'My KAS', current:'Khách sạn đã lưu', count:'Tất cả', sort:'Sắp xếp:', recent:'Mới lưu gần đây', rating:'Đánh giá cao nhất', name:'Tên khách sạn A–Z', emptyTitle:'Bạn chưa lưu khách sạn nào', emptyCopy:'Khám phá bộ sưu tập KAS và lưu những nơi bạn muốn trải nghiệm.', explore:'Khám phá khách sạn', remove:'Bỏ lưu', reviews:'đánh giá'},
    en: {title:'Saved hotels', subtitle:'The hotels you have saved', home:'Home', mykas:'My KAS', current:'Saved hotels', count:'All', sort:'Sort by:', recent:'Recently saved', rating:'Highest rated', name:'Hotel name A–Z', emptyTitle:'No saved hotels yet', emptyCopy:'Explore the KAS collection and save the places you would love to experience.', explore:'Explore hotels', remove:'Remove', reviews:'reviews'}
  };
  function esc(v){return U.esc(String(v == null ? '' : v));}
  function icon(name){
    var paths={heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',star:'<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z"/>',bed:'<path d="M3 20V5m0 10h18v5M3 12h18v3M6 12V8h5a3 3 0 0 1 3 3v1M14 12V9h4a3 3 0 0 1 3 3"/>',leaf:'<path d="M20 4c-9 0-14 4-14 11a5 5 0 0 0 5 5c7 0 11-7 9-16Z"/><path d="M4 21c3-5 7-8 12-11"/>',food:'<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3c4 2 4 7 0 9"/>',pool:'<path d="M3 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 3-2M3 21c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 3-2M6 12V4h5v8m0-4h5V4h-5"/>'};
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.leaf)+'</svg>';
  }
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
  function hotelPhoto(h){return h.images && (h.images[1] || h.images[0]) || '';}
  function render(){
    var ids=Store.getSavedHotels();
    var items=ids.map(function(id,index){var h=D.hotels.find(function(item){return String(item.id)===String(id);});if(h){h.__savedIndex=index;}return h;}).filter(Boolean);
    if(sort.value==='rating')items.sort(function(a,b){return (b.rating||0)-(a.rating||0);});
    if(sort.value==='name')items.sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
    var t=copy[lang];document.getElementById('savedCount').textContent=t.count+' ('+items.length+')';
    empty.hidden=items.length!==0;grid.hidden=items.length===0;
    grid.innerHTML=items.map(function(h){
      var amenities=(h.amenities||[]).slice(0,4);
      var amenityHtml=amenities.map(function(a,i){return '<span class="saved-amenity">'+icon(['bed','leaf','food','pool'][i%4])+'<span>'+esc(a)+'</span></span>';}).join('');
      var photo=hotelPhoto(h);
      return '<article class="saved-card" data-saved-card="'+esc(h.id)+'" data-hotel-url="hotel-detail.html?hotel='+encodeURIComponent(h.id)+'&lang='+lang+'" role="link" tabindex="0" aria-label="'+esc(h.name)+'"><div class="saved-card-media">'+U.img(photo,h.name,'',false,false)+'<button class="saved-heart" type="button" data-remove-saved="'+esc(h.id)+'" aria-label="'+esc(t.remove)+'" title="'+esc(t.remove)+'">'+icon('heart')+'</button></div><div class="saved-card-body"><h2>'+esc(h.name)+'</h2><p class="saved-card-address">'+icon('pin')+'<span>'+esc(h.address||(lang==='vi'?'Thành phố Hồ Chí Minh':'Ho Chi Minh City'))+'</span></p><div class="saved-card-rating">'+icon('star')+'<span>'+Number(h.rating||0).toFixed(1)+'/10 ('+Number(h.reviews||0)+' '+t.reviews+')</span></div></div></article>';
    }).join('');
    grid.querySelectorAll('[data-saved-card]').forEach(function(card){
      function openHotel(){window.location.href=card.getAttribute('data-hotel-url');}
      card.addEventListener('click',function(e){if(e.target.closest('[data-remove-saved]'))return;openHotel();});
      card.addEventListener('keydown',function(e){if(e.target.closest('button'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();openHotel();}});
    });
    grid.querySelectorAll('[data-remove-saved]').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();Store.removeSavedHotel(btn.getAttribute('data-remove-saved'));render();});});
  }
  AppBoot();
  function AppBoot(){if(global.App)global.App.boot({active:'my kas',floating:false,noWelcome:true});setCopy();if(global.KAS_LIVE&&typeof global.KAS_LIVE.load==='function'){global.KAS_LIVE.load().then(function(catalog){D.hotels.forEach(function(h){global.KAS_LIVE.applyToHotel(h,catalog);});render();}).catch(render);}else render();}
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
