/* =========================================================================
   KAS — VERIFIED PHOTO CATALOGUE
   =========================================================================
   SINGLE SOURCE OF TRUTH for every photograph in the application.
   No component may hard-code an image URL; everything reads from here.

   -- Why this file exists ------------------------------------------------
   Photos were previously assigned to room types by a rotation function over
   an undifferentiated property image pool. That was wrong twice over:
     (a) the rotation wrapped, so pairs of room types got IDENTICAL galleries;
     (b) the pool mixed exterior / lobby / restaurant shots into room galleries.

   Trip.com's gallery groups photos into explicit categories -- Rooms, Exterior,
   Dining, Public Areas, Leisure. Those categories are the verification source:
   a URL listed under "Rooms" for property X is a verified ROOM photo of X.

   -- What is verified, and what is not -----------------------------------
   VERIFIED     - the property a photo belongs to        (branch isolation)
   VERIFIED     - that a photo shows a guest room        (category = Rooms)
   NOT VERIFIED - WHICH room type a photo depicts

   No source publishes a per-room-type photo grouping. Rather than guess, each
   room type receives a DISJOINT slice of its own hotel's verified room pool --
   so no photo ever appears under two room types -- and every room carries
   `roomTypeAttribution: 'NEEDS_REVIEW'`, surfaced in the UI.
   ========================================================================= */

(function (global) {
  'use strict';

  /* Trip.com renders any size from a stable asset id. 500x400 and 960x660
     were both observed live; utils.js steps down through observed sizes. */
  function tc(id, w, h) {
    return 'https://ak-d.tripcdn.com/images/' + id + '_R_' + (w || 960) + '_' + (h || 660) + '_R5_D.jpg';
  }

  /* =====================================================================
     CATALOGUE
     Each branch: rooms[] / exterior[] / dining[] / publicAreas[] / leisure[]
     `verified` marks whether the Rooms category was read from the source
     gallery for that branch.
     ===================================================================== */
  var CATALOGUE = {

    /* ---- BRANCH 01 -- KAS Passion Boutique (Cabana Hotel Saigon) -------
       Trip.com photo gallery returns 404 for this property; the only photo
       set located is Agoda-origin, mirrored by Kayak, and is NOT categorised
       at source. Room-vs-property split therefore UNVERIFIED for Br01. */
    'hotel-01': {
      verified: false,
      note: 'Trip.com has no photo gallery for this property (404 on every locale, ' +
            'checked us/ph/vn/ae). No other source categorises its photos, so room ' +
            'photographs cannot be separated from property photographs. NEEDS_REVIEW.',
      source: 'Agoda property 2061539 (mirrored via Kayak)',
      sourceUrl: 'https://www.agoda.com/vi-vn/cabana-hotel-saigon/hotel/ho-chi-minh-city-vn.html',
      raw: [
        'https://www.kayak.com/rimg/himg/cb/76/36/agoda-2061539-1666984414-438475.jpg',
        'https://www.kayak.com/rimg/himg/e1/00/01/agoda-2061539-1661698576-479341.jpg',
        'https://www.kayak.com/rimg/himg/0a/f6/17/agoda-2061539-1665476105-494952.jpg',
        'https://www.kayak.com/rimg/himg/b7/3e/bb/agoda-2061539-1665476108-459189.jpg',
        'https://www.kayak.com/rimg/himg/b0/d8/7a/agoda-2061539-1665476109-484360.jpg',
        'https://www.kayak.com/rimg/himg/9f/b7/39/agoda-2061539-1661698574-514918.jpg',
        'https://www.kayak.com/rimg/himg/05/89/2c/agoda-2061539-ce73e3-665064.jpg',
        'https://www.kayak.com/rimg/himg/40/f8/78/agoda-2061539-500f17-678679.jpg'
      ]
    },

    /* ---- BRANCH 02 -- KAS Premium Boutique (Pravina / KAS Elegance) ----
       Trip.com property 135266253 - gallery categories read 2026-09-12 */
    'hotel-02': {
      verified: true,
      source: 'Trip.com property 135266253 - gallery categories',
      sourceUrl: 'https://us.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266253/kas-elegance-hotel/photo.html',
      rooms: ['1mc4912000t68eny9FCE6', '1mc4m12000t68lxd80732', '1mc5o12000t68l6mcE445',
              '1mc0912000t68m08e98AF', '1mc6312000t68ljr91EB6', '1mc6z12000t68ee0sC249',
              '1mc1h12000t68ucdhD405', '02307824x9a7p0ci3789F', '0232s224x9al0078q0E39'],
      exterior: ['1mc1d12000t6cebx1648E', '1mc4412000t6cdfx22E7B', '1mc6w12000t6cdia74811',
                 '1z62v12000t63qfel3E1C', '0232j224x9aab10i442B4', '0231l824x9a46r1nn9265'],
      dining: ['1mc6f12000t6cekbf149A', '0582q12000tc2oitaF7BD', '0235w824x9a46rjocCB25'],
      publicAreas: ['1mc1112000t6ceewp451A', '1mc5c12000t6ceixj5700', '1mc4i12000t6ceikd50F8',
                    '1mc1h12000t6cekk4A80E', '0236u224x9al05tlpB733', '02331824x9a49e92uD9D6']
    },

    /* ---- BRANCH 03 -- KAS Ancient Luxury (Song Anh 1) ---- */
    'hotel-03': {
      verified: true,
      source: 'Trip.com property 100937358 - gallery categories',
      sourceUrl: 'https://us.trip.com/hotels/ho-chi-minh-city-hotel-detail-100937358/kas-ancient-boutique-hotel/photo.html',
      rooms: ['1z66b12000t66vpu52D50', '1z61p12000t66vii54CA0', '1z66112000t66vd7mAE59',
              '1z64k12000t66v3cl5973', '1z63412000t66w0x8D810', '1z65012000t66utkrB46F',
              '1mc4w12000t6cusq15C71', '0235z824x9a49otq4C18A', '02347824x9a86uqhn13DC'],
      exterior: ['1mc6e12000t6cwnvd6281', '1mc5g12000t6cw9tj71A5', '1z64312000t66vkdp761E',
                 '1mc2i12000t6cxqt9A559', '0236h224x9a9z3izc3BCA', '0230k12000tdfbmt44A66'],
      dining: ['1mc3n12000t6cvaw73122', '1mc1712000t6cvdtm9E2B', '0580712000sva0vl2E339',
               '02373924x9amuvvda7B03'],
      publicAreas: ['1mc1r12000t6cwa6bF945', '1mc1412000t6cw6h64965', '0222e12000t1ccz6p1F67',
                    '0585812000syt5wzo9F2E', '0233j824x9a49ojgp1792', '0235i924x9amvnllbA311']
    },

    /* ---- BRANCH 04 -- KAS Milestone Premium (The KAS Hotel Saigon) ----
       NOTE: 1mc0r12000t6hxoqk43F5 is listed under BOTH Rooms and Business
       Facilities at source. Ambiguous -> excluded from the room pool. */
    'hotel-04': {
      verified: true,
      source: 'Trip.com property 135266341 - gallery categories',
      sourceUrl: 'https://www.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266341/kas-milestone-premium-hotel/photo.html',
      rooms: ['1mc4j12000t6i0auh2F94', '1mc0j12000t6i00kiDEC2', '1mc3t12000t6hxgw7E27A',
              '1mc1b12000t6hxfri1B6A', '1mc2r12000t6hwy3w68C0', '1mc5c12000t6hxg35C238',
              '02303224x9agdw1ml8447', '02305224x9aeabhd9A6E7'],
      excludedAmbiguous: ['1mc0r12000t6hxoqk43F5'],
      exterior: ['1mc2g12000t6j36tjD38D', '1mc1712000t6j3ilt6090', '1mc4i12000t6j3djzF4CE',
                 '1mc4u12000t6j3d5i15A7', '1mc2l12000t6j3tz9F968', '1mc3b12000t6izzit5B5F'],
      dining: ['1mc1d12000t6j1kpn5840', '1mc5412000t6kmbye217A', '1mc6212000t6kmvbb198B',
               '1mc2h12000t6kmbyj5917', '0231o224x9ahsv4hl317D', '0231i824x9acx94au6425'],
      publicAreas: ['1mc3w12000t6j5anhF25F', '1mc4r12000t6j5bx4175E', '1mc6j12000t6j2o1b6DA4',
                    '1mc4f12000t6j22ek6365', '0231y224x9age3kii8666', '0236z924x9acql4m7BA1E'],
      leisure: ['1mc1o12000t6kmljh4767', '1mc0a12000t6jmnz8AEC9', '1mc3112000t6jmkl9F121',
                '1mc1j12000t6jmk6u5BE6', '1mc3h12000t6jm9z4D0D0', '1mc3r12000t6jmov4FA89']
    },

    /* ---- BRANCH 05 -- KAS Zody Boutique (Tuyet Lan Corner) ---- */
    'hotel-05': {
      verified: true,
      source: 'Trip.com property 119255177 - gallery categories',
      sourceUrl: 'https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-119255177/kas-zody-boutique-hotel/photo.html',
      rooms: ['0223y12000t6ehaxoACB6', '1mc6512000t6jzbnu4F9B', '1mc5k12000t6jznvp06F4',
              '1mc5s12000t6jz5hlF773', '1mc0d12000t6jyrjt654A', '1mc4p12000t6k22xx83E5',
              '1mc5h12000t6k2hz30509', '0234q924x9amwtbl0EDDB', '0236p224x9agp4v4mDC9F'],
      exterior: ['1mc6012000t6kbhhaA3F6', '1mc0r12000t6kc21o38FC', '1mc7412000t6kc7aqA68C',
                 '1mc3i12000t6kbz366235', '1mc1n12000t6kcjd6EE83', '1z64512000t87t42jF003'],
      dining: [],
      publicAreas: ['1mc3n12000t8mzcwmBA1B', '1mc0n12000t8mzn3u8FDE', '0580p12000tbf93x5F689',
                    '02373824x9a48apof4632', '0231p224x9ale7txp18F5']
    },

    /* ---- BRANCH 06 -- KAS Sonata Luxury (Tuong Vy) ---- */
    'hotel-06': {
      verified: true,
      source: 'Trip.com property 135266420 - gallery categories',
      sourceUrl: 'https://us.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266420/kas-sonata-luxury-hotel/photo.html',
      rooms: ['1mc3d12000t6mwxfzDD26', '1mc2v12000t6mxuekE125', '1mc3y12000t6mxoiwCA1E',
              '1mc1q12000t6mrhn8F083', '1mc4p12000t6mqqx5BA82', '1mc6d12000t6mqvfl6376',
              '1mc3o12000t6mrf1w7A7F', '02332224x9anpf19q9BE5', '0233s924x9amvnlkk49EC'],
      exterior: ['1z65e12000t678d22F5D2', '1mc3812000t6n6ch5B96E'],
      dining: ['0581t12000tbpi22320FD', '0586h12000tce8vie88EF', '0581812000tbgp9pxD28A',
               '0580z12000tbj9jyl7444'],
      publicAreas: ['0583t12000tbrx5bbC277', '0584v12000taz9dt8E034', '1mc3p12000t6n1kykC5B0',
                    '1mc3m12000t6n0wi15388', '0234o924x9amvb6im595F', '0230p824x9a5z3n8g5EBD']
    },

    /* ---- BRANCH 07 -- KAS Eliana Luxury (APEC Hotel) ---- */
    'hotel-07': {
      verified: true,
      source: 'Trip.com property 135266582 - gallery categories',
      sourceUrl: 'https://us.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266582/kas-eliana-luxury-hotel/photo.html',
      rooms: ['1mc5212000t6nlp3582F7', '1mc2612000t6nmfggF003', '1mc6a12000t6nma7lA76B',
              '1mc2p12000t6nkzzt1101', '1mc3n12000t6nlxniE219', '1z61z12000t67iwei98C7',
              '1z63u12000t67ia1u97F4', '0230w924x9akqn7ggD050', '0233v824x9a487vr91684'],
      exterior: ['1z62n12000t67ia7a1DD2', '1mc6b12000t6np0c5DA9F', '1mc0y12000t6nosdt4C7C',
                 '1mc1712000t6np93e96D9'],
      dining: ['0585f12000tcdpdzp61E6', '0582212000tazfk8gE16F'],
      publicAreas: ['1mc0y12000t6npkc1B9AA', '1mc2512000t6npqep2A95', '1mc2c12000t6npltwDD6E',
                    '0230g12000thpfink6734', '0232c12000thpc0d2A632']
    },

    /* ---- BRANCH 08 -- KAS Dilly Luxury (KAS Mays Saigon) ---- */
    'hotel-08': {
      verified: true,
      source: 'Trip.com property 135266918 - gallery categories',
      sourceUrl: 'https://ph.trip.com/hotels/ho-chi-minh-city-hotel-detail-135266918/kas-dilly-luxury-hotel/photo.html',
      rooms: ['1mc5r12000t6oxyerBE48', '1mc2412000t6ox4onF760', '1mc5312000t6oydhwD2D0',
              '1mc0o12000t6oxlmiD73B', '1mc6y12000t6oy84rF834', '1mc2912000t6oy8wp83F3',
              '1mc1612000t6oygsc732A', '0233a824x9a8xzwesABF4', '0233m224x9ab8v092D7ED'],
      exterior: ['1mc6f12000t6ooqceEC83', '1mc2612000t6opawpEAC9', '1mc1t12000t6ood3cE4FC',
                 '1z66912000t67u1nx88A5'],
      dining: ['1mc6c12000t6s5h3dD47F', '0585w12000tbpj6kd3A3E', '1mc6612000t6s5nap592B',
               '02327224x9ak5rxbi7188', '0233y224x9ak5pewg2E44'],
      publicAreas: ['1z62b12000t67tt9j9177', '1z63e12000t67up5i082D', '1z63d12000t67ujizF8E1']
    }
  };

  /* =====================================================================
     ACCESSORS
     ===================================================================== */

  /** Verified ROOM photos for a branch, as full URLs. Empty when unverified. */
  function roomPool(hotelId, w, h) {
    var c = CATALOGUE[hotelId];
    if (!c || !c.rooms) return [];
    return c.rooms.map(function (id) { return tc(id, w, h); });
  }

  /** Property photos (exterior, public areas, dining, leisure) for a branch. */
  function propertyPool(hotelId, w, h) {
    var c = CATALOGUE[hotelId];
    if (!c) return [];
    if (!c.verified) {
      return c.raw
        ? c.raw.slice()
        : (c.uncategorised || []).map(function (id) { return tc(id, w, h); });
    }
    return []
      .concat(c.exterior || [], c.publicAreas || [], c.dining || [], c.leisure || [])
      .map(function (id) { return tc(id, w, h); });
  }

  /** Everything for a branch - used for the property hero gallery. */
  function allPool(hotelId, w, h) {
    var c = CATALOGUE[hotelId];
    if (!c) return [];
    if (!c.verified) return propertyPool(hotelId, w, h);
    function f(id) { return tc(id, w, h); }
    // Lead with exterior (the property's "face"), then rooms, then the rest.
    return []
      .concat((c.exterior || []).map(f), (c.rooms || []).map(f),
              (c.publicAreas || []).map(f), (c.dining || []).map(f),
              (c.leisure || []).map(f));
  }

  /**
   * Partition a branch's verified room pool into DISJOINT slices - one per
   * room type - so a photo never appears under two room types.
   *
   * @param {string} hotelId
   * @param {number} roomCount how many room types to split across
   * @returns {string[][]} one array of URLs per room type (may be empty)
   */
  function partitionRooms(hotelId, roomCount, w, h) {
    var pool = roomPool(hotelId, w, h);
    var out = [], i;
    for (i = 0; i < roomCount; i++) out.push([]);
    if (!pool.length || !roomCount) return out;
    // Deal round-robin: guarantees disjoint slices and an even spread.
    for (i = 0; i < pool.length; i++) out[i % roomCount].push(pool[i]);
    return out;
  }

  function isVerified(hotelId) {
    return !!(CATALOGUE[hotelId] && CATALOGUE[hotelId].verified);
  }

  function meta(hotelId) {
    var c = CATALOGUE[hotelId] || {};
    return {
      verified: !!c.verified,
      note: c.note || null,
      source: c.source || null,
      sourceUrl: c.sourceUrl || null,
      counts: {
        rooms: (c.rooms || []).length,
        exterior: (c.exterior || []).length,
        dining: (c.dining || []).length,
        publicAreas: (c.publicAreas || []).length,
        leisure: (c.leisure || []).length,
        uncategorised: (c.uncategorised || c.raw || []).length
      }
    };
  }

  global.KAS_IMAGES = {
    CATALOGUE: CATALOGUE, url: tc,
    roomPool: roomPool, propertyPool: propertyPool, allPool: allPool,
    partitionRooms: partitionRooms, isVerified: isVerified, meta: meta
  };
})(window);
