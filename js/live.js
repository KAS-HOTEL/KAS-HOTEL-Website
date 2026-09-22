/* KAS LIVE CATALOG — uploaded room photos + exact operator rate mapping. */
(function(global){
  'use strict';
  var cache = null;
  function load(){
    if(cache) return cache;
    cache = fetch('/api/catalog', {cache:'no-store'}).then(function(r){
      if(!r.ok) throw new Error('Không tải được catalog ảnh phòng.');
      return r.json();
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
    if (property && Array.isArray(property.propertyImages) && property.propertyImages.length) {
      var propertyGallery = property.propertyImages.map(function(x){
        return typeof x === 'string' ? x : x.url;
      }).filter(Boolean);
      /* Keep the uploaded property gallery separate so each page can choose
         exactly what it needs: the home Collection card keeps its dedicated
         collection image, while the Hotels listing and hotel detail use this
         gallery. */
      hotel.propertyGalleryImages = propertyGallery.slice();
      hotel.images = propertyGallery.slice();
      hotel.imageSource = 'KAS admin uploaded property gallery';
      hotel.hasCustomPropertyGallery = true;
    } else {
      hotel.propertyGalleryImages = [];
    }
    hotel.rooms.forEach(function(r){
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
    if (hotel.rooms && hotel.rooms.length) {
      var roomPrices = hotel.rooms.map(function(r){ return Number(r.pricePerNight || Infinity); }).filter(function(v){ return isFinite(v); });
      if (roomPrices.length) hotel.startingPrice = Math.min.apply(null, roomPrices);
    }
    return hotel;
  }
  global.KAS_LIVE = {load:load, applyToHotel:applyToHotel, indexCatalog:indexCatalog, uploadedUrls:uploadedUrls};
})(window);
