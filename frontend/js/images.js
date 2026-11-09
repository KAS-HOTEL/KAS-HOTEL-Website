/* =========================================================================
   KAS — website photographs
   =========================================================================
   No photograph URL is written in code any more (owner decision 2026-11-09).

   - Hotel and room photos are managed in the console and read from
     GET /api/v1/public/properties/catalogue/media (js/catalog-sync.js). The files
     shipped with the website live in /img/hotels/<hotel>/…; new uploads go to the
     console's image store.
   - Website positions (homepage, page heroes, Guidebook) are console "Nội dung
     website" slots (js/site-images.js), with their defaults in site-image-slots.json
     pointing at /img/….
   - The third-party photos this file used to list (Trip.com, Kayak) are gone: KAS has
     no right to use them. A hotel or room with no console photo shows the brand
     placeholder below until an Admin uploads one.

   The functions keep their old shape so js/data.js and older callers keep working;
   every pool is simply empty.
   ========================================================================= */
(function (global) {
  'use strict';

  /** Brand placeholder for a hotel or room that has no photo yet. */
  var PLACEHOLDER = 'assets/brand/kas-photo-placeholder.svg';

  function none() { return []; }

  function meta() {
    return { verified: false, note: null, source: 'KAS console', sourceUrl: null,
      counts: { rooms: 0, exterior: 0, dining: 0, publicAreas: 0, leisure: 0, uncategorised: 0 } };
  }

  function partitionRooms(hotelId, roomCount) {
    var out = [];
    for (var i = 0; i < (roomCount || 0); i++) out.push([]);
    return out;
  }

  global.KAS_IMAGES = {
    CATALOGUE: {}, PLACEHOLDER: PLACEHOLDER,
    url: function (id) { return id; },
    roomPool: none, propertyPool: none, allPool: none,
    partitionRooms: partitionRooms, isVerified: function () { return false; }, meta: meta
  };
})(window);
