/* KAS LIVE CATALOG — uploaded room photos + exact operator rate mapping. */
(function(global){
  'use strict';
  var cache = null;
  function load(){
    if(cache) return cache;
    /* The console's hotel/room list first (js/catalog-sync.js), so prices are fetched
       for exactly the hotels and room types the page will show. */
    var catalogueReady = global.KAS_CATALOG ? global.KAS_CATALOG.ready.catch(function(){ return null; }) : Promise.resolve(null);
    cache = catalogueReady.then(function(){ return fetch('/api/catalog', {cache:'no-store'}); }).then(function(r){
      if(!r.ok) throw new Error('Không tải được catalog ảnh phòng.');
      return r.json();
    }).catch(function(){ return {branches:[]}; }).then(async function(catalog){
      catalog.backendPrices = {};
      var criteria = global.Booking ? global.Booking.readSearch() : global.Store.getSearch();
      await Promise.all(global.KAS_DATA.hotels.map(async function(hotel){
        var mapping = (hotel.rooms || []).map(function(room){return global.KAS_API_MAP && global.KAS_API_MAP[room.id];}).find(Boolean);
        if (!mapping || !global.KAS_API) return;
        try {
          var rows = await global.KAS_API.request('/api/v1/public/request-pricing/properties/' + encodeURIComponent(mapping.propertySlug) + '?checkIn=' + criteria.checkIn + '&checkOut=' + criteria.checkOut + '&locale=' + (global.KAS_I18N && global.KAS_I18N.getLanguage() || 'en'));
          (hotel.rooms || []).forEach(function(room){
            var ref=global.KAS_API_MAP[room.id]; var row=rows.find(function(item){return ref && item.roomTypeSlug===ref.roomTypeSlug;});
            catalog.backendPrices[room.id]=row ? {name:row.name,price:row.nightlyFrom && row.nightlyFrom.amountMinor} : {price:null};
          });
        } catch (_) { (hotel.rooms || []).forEach(function(room){catalog.backendPrices[room.id]={price:null};}); }
      }));
      return catalog;
    });
    return cache;
  }
  function indexCatalog(catalog){
    var rooms = {};
    var hotels = {};
    (catalog.branches || []).forEach(function(b){
      hotels[b.hotelId] = b;
      (b.rooms || []).forEach(function(r){ rooms[r.key] = r; });
    });
    return { rooms: rooms, hotels: hotels };
  }
  function uploadedUrls(entry){
    return (entry && entry.images || []).map(function(x){
      return typeof x === 'string' ? x : x.url;
    }).filter(Boolean);
  }
  function applyToHotel(hotel, catalog){
    if(!hotel || !catalog) return hotel;
    var indexed = indexCatalog(catalog);
    var rooms = indexed.rooms;
    var property = indexed.hotels[hotel.id];
    if (hotel.consoleGallery) {
      /* Images managed in the console (js/catalog-sync.js) win over the old admin's uploads. */
      hotel.propertyGalleryImages = hotel.images.slice();
      hotel.propertyGalleryItems = hotel.images.map(function(url){ return {url:url, category:'other'}; });
      hotel.imageSource = 'KAS console gallery';
      hotel.hasCustomPropertyGallery = true;
    } else if (property && Array.isArray(property.propertyImages) && property.propertyImages.length) {
      var propertyGallery = property.propertyImages.map(function(x){
        return typeof x === 'string' ? x : x.url;
      }).filter(Boolean);
      /* Keep the uploaded property gallery separate so each page can choose
         exactly what it needs: the home Collection card keeps its dedicated
         collection image, while the Hotels listing and hotel detail use this
         gallery. */
      hotel.propertyGalleryItems = property.propertyImages.map(function(x){ return typeof x === 'string' ? {url:x, category:'other'} : Object.assign({}, x, {category:x.category || 'other'}); }).filter(function(x){ return x.url; });
      hotel.propertyGalleryImages = propertyGallery.slice();
      hotel.images = propertyGallery.slice();
      hotel.imageSource = 'KAS admin uploaded property gallery';
      hotel.hasCustomPropertyGallery = true;
    } else {
      hotel.propertyGalleryImages = [];
      hotel.propertyGalleryItems = [];
    }
    hotel.rooms.forEach(function(r){
      if (r.consoleImages) {
        /* Room images from the console replace the old admin's room uploads. */
        r.liveImages = (r.images || []).slice();
        r.liveUploadedCount = r.liveImages.length;
        return;
      }
      var mapping = global.KAS_RATES && global.KAS_RATES.mappingFor(r.id);
      if(!mapping) return;
      var live = rooms[mapping.branch + ':' + mapping.stt];
      if(!live) return;
      r.liveImages = uploadedUrls(live);
      r.liveRateMeta = live;
      r.liveSheetRoomName = live.name;
      r.liveEz = live.ez;
      r.liveUploadedCount = r.liveImages.length;

      /* Admin-edited rates are returned by /api/catalog. Overlay them onto
         the shared KAS_RATES object so hotel-detail, room-detail, booking
         and other existing pages immediately use the same live prices. */
      if (global.KAS_RATES && global.KAS_RATES.TABS && mapping.branch) {
        var tab = global.KAS_RATES.TABS[mapping.branch];
        if (tab && Array.isArray(tab.sheetRooms)) {
          var sheet = tab.sheetRooms.find(function(x){ return Number(x.stt) === Number(mapping.stt); });
          if (sheet && live.rates) {
            if (Array.isArray(live.rates.jul_sep)) sheet.jul_sep = live.rates.jul_sep.slice();
            if (Array.isArray(live.rates.oct)) sheet.oct = live.rates.oct.slice();
            if (Array.isArray(live.rates.nov_jan)) sheet.nov_jan = live.rates.nov_jan.slice();
            /* Keep cards/filters aligned with the current editable KAS rates. */
            var all = [].concat(sheet.jul_sep || [], sheet.oct || [], sheet.nov_jan || []).filter(function(v){return v!=null;});
            if (all.length) r.pricePerNight = Math.min.apply(null, all);
          }
        }
      }
    });
    (hotel.rooms || []).forEach(function(room){
      var livePrice=catalog.backendPrices && catalog.backendPrices[room.id];
      room.pricePerNight=livePrice && livePrice.price != null ? livePrice.price : null;
      if(livePrice && livePrice.name) room.name=livePrice.name;
      room.rateSource=livePrice && livePrice.price != null ? 'BACKEND' : 'UNAVAILABLE';
    });
    if (hotel.rooms && hotel.rooms.length) {
      var roomPrices = hotel.rooms.map(function(r){ return Number(r.pricePerNight || Infinity); }).filter(function(v){ return isFinite(v); });
      if (roomPrices.length) hotel.startingPrice = Math.min.apply(null, roomPrices);
    }
    return hotel;
  }
  global.KAS_LIVE = {load:load, applyToHotel:applyToHotel, indexCatalog:indexCatalog, uploadedUrls:uploadedUrls};
})(window);
