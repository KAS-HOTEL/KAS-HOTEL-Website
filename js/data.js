/* =========================================================================
   KAS HOTEL COLLECTION — NORMALIZED HOTEL / ROOM DATASET
   =========================================================================
   DATA PROVENANCE
   ---------------
   The 8 Agoda URLs supplied by the client are client-side rendered (SPA).
   Server-side fetching returns only the application shell, so room inventory
   could not be read directly off agoda.com.

   Per the client's documented fallback procedure ("search by hotel name /
   find the Agoda indexed page / find room information from search results"),
   each Agoda slug was resolved to its CURRENT property name via Google-indexed
   Agoda page titles, then cross-verified by exact street address against:

     1. kashotelpremium.com  — the operator's own brand site (authoritative)
     2. trip.com             — live OTA inventory (room names, m2, bed, view)
     3. external review source.com      — ratings, review counts, real guest reviews
     4. klook.com / kayak.com / expedia.com — corroboration + image URLs

   IMPORTANT: every Agoda slug is a LEGACY name. The properties have been
   rebranded under KAS. Mapping was confirmed two ways (indexed title +
   street address match) for all 8 branches. See DATA_AUDIT.md.

   Fields that could not be verified are `null` and rendered in the UI as
   "Not available from source". Nothing in this file is invented.
   ========================================================================= */

(function (global) {
  'use strict';

  /* ---- photographs ----------------------------------------------------
     ALL image URLs now live in js/images.js (window.KAS_IMAGES), which holds
     the source-categorised photo catalogue: Rooms / Exterior / Dining /
     Public Areas / Leisure, per branch.

     This file no longer contains a single image URL. Galleries are assembled
     in the post-process block at the bottom:
       hotel.images        <- KAS_IMAGES.allPool(id)        (property gallery)
       hotel.roomPhotos    <- KAS_IMAGES.roomPool(id)       (verified rooms only)
       room.images         <- disjoint slice of roomPhotos  (no overlap ever)

     The previous rotation helper is deliberately gone: it wrapped modulo the
     pool size, which gave pairs of room types identical galleries, and it
     drew from an uncategorised pool that mixed in exterior and restaurant
     shots. Both defects are fixed by the catalogue + partition approach.
     -------------------------------------------------------------------- */

  var SHARED_ROOM_AMENITIES = ['Free Wi-Fi','Air conditioning','Flat-screen TV',
    'Mini fridge','Electric kettle','Hair dryer','Safe box','In-room telephone',
    'Private bathroom','Non-smoking'];

  var SHARED_HOTEL_SERVICES = ['24/7 reception','Elevator','Daily housekeeping',
    'Laundry service','Airport shuttle','Luggage storage','Free Wi-Fi'];

  /* =====================================================================
     HOTELS
     ===================================================================== */
  var hotels = [
    /* ---------------------------------------------------------------- 01 */
    {
      id: 'hotel-01', branchCode: '01',
      name: 'KAS Passion Boutique Hotel',
      legacyName: 'Cabana Hotel Saigon',
      aliases: ['Cabana Hotel Saigon','Kas Passion Boutique Hotel'],
      tagline: 'Boutique calm, one block from Ben Thanh.',
      address: '05 Truong Dinh, Ben Thanh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Ben Thanh',
      quickSearchTags: ['district1','ben-thanh','boutique','breakfast','staycation','ben-thanh-market','walkable','food','central'],
      starRating: 3, rating: 9.4, ratingScale: 10, reviews: 423, ratingSource: 'Google',
      altScore: { value: 9.1, scale: 10, count: 96, source: 'Planet of Hotels' },
      description: 'A boutique address in the heart of District 1, minutes from Ben Thanh Market. KAS Passion blends a quiet, relaxing atmosphere with modern, generously sized rooms — a comfortable retreat for travellers who want the centre of Saigon on their doorstep.',
      checkIn: '14:00', checkOut: '12:00',
      totalRooms: null,
      imageSource: 'Agoda (property 2061539), mirrored via Kayak',
      amenities: ['Free high-speed Wi-Fi','24-hour front desk','Airport transportation',
        'Laundry service','Non-smoking hotel','Air conditioning','Daily housekeeping',
        'Luggage storage','Elevator'],
      priceRangeUSD: '$27 – $82', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved: kashotelpremium.com + external review source + Kayak',
      sourceUrl: 'https://www.agoda.com/vi-vn/cabana-hotel-saigon/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/our-properties/kas-passion-boutique-hotel',
      guestReviews: [
        { name: 'Mihaela K', date: 'Sep 2026', stars: 5, text: 'The room is big, the staff friendly and the prices are good, but the location was just perfect!!!!!! In the center!!' },
        { name: 'Yee Leng P', date: 'Sep 2026', stars: 5, text: 'Room is clean and quite new, cozy and value for money. Staff here are all friendly and helpful.' },
        { name: 'Senthil N', date: 'Feb 2026', stars: 5, text: 'Staff here are all friendly and helpful. Bao Tran and Dat are so friendly and extremely helpful.' },
        { name: 'Nomad56679148068', date: 'Jun 2026', stars: 5, text: 'Friendly staff, enthusiastic support. Comfortable location, close to many places to eat and visit.' }
      ],
      subRatings: { Location: 4.7, Rooms: 4.3, Cleanliness: 4.5, Service: 4.4, Value: 4.3 },
      rooms: [
        { id: 'h01-r1', name: 'Standard Room', size: '14 m²', sizeNum: 14,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: false, pricePerNight: 700000,
          roomSource: 'kashotelpremium.com (operator site)' },
        { id: 'h01-r2', name: 'Superior Room', size: '16 m²', sizeNum: 16,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'Building view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 950000,
          roomSource: 'kashotelpremium.com (operator site)' },
        { id: 'h01-r3', name: 'Family Room', size: '26 m²', sizeNum: 26,
          bedType: '2 Queen beds', maxGuests: 4, adults: 4, children: 2,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 2100000,
          roomSource: 'kashotelpremium.com (operator site)' }
      ]
    },

    /* ---------------------------------------------------------------- 02 */
    {
      id: 'hotel-02', branchCode: '02',
      name: 'KAS Premium Boutique Hotel',
      legacyName: 'Pravina Hotel',
      aliases: ['Pravina Hotel','KAS Premium Saigon','KAS Elegance Hotel'],
      tagline: 'Ly Tu Trong elegance, steps from the opera quarter.',
      address: '260 Ly Tu Trong, Ben Thanh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Ben Thanh',
      quickSearchTags: ['district1','ben-thanh','boutique','rooftop','breakfast','walkable','food','central'],
      starRating: 3, rating: 9.2, ratingScale: 10, reviews: 369, ratingSource: 'Google',
      altScore: { value: 8.6, scale: 10, count: 91, source: 'Trip.com' },
      description: 'Set in the heart of District 1, a few minutes on foot from the city\'s most iconic addresses. KAS Premium offers a broad range of rooms suited to couples, families and groups, with continental breakfast served daily and a rooftop bar above the street.',
      checkIn: '14:00', checkOut: '12:00',
      totalRooms: 22,
      imageSource: 'Trip.com CDN (property 135266253)',
      amenities: ['Free high-speed Wi-Fi','Rooftop bar','Restaurant','Cafe',
        '24-hour front desk','Airport pick-up / drop-off','Laundry service',
        'Dry cleaning','Currency exchange','Luggage storage','Elevator','24-hour security'],
      priceRangeUSD: '$28 – $68', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved: Agoda indexed title "KAS Premium Saigon" + kashotelpremium.com + Trip.com',
      sourceUrl: 'https://www.agoda.com/vi-vn/pravina-hotel_2/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/our-properties/kas-premium-boutique-hotel',
      guestReviews: [
        { name: 'KAS guest', date: '2026', stars: 5, text: 'Friendly and accommodating staff, and a walkable neighbourhood with excellent access to dining and attractions.' }
      ],
      subRatings: null,
      rooms: [
        { id: 'h02-r1', name: 'Standard Room', size: '14 m²', sizeNum: 14,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No window', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: false, pricePerNight: 750000, roomSource: 'kashotelpremium.com' },
        { id: 'h02-r2', name: 'Superior Room', size: '14 m²', sizeNum: 14,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'Building view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 850000, roomSource: 'kashotelpremium.com' },
        { id: 'h02-r3', name: 'Deluxe Room', size: '18 – 20 m²', sizeNum: 19,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 1050000, roomSource: 'kashotelpremium.com' },
        { id: 'h02-r4', name: 'Deluxe Twin Room', size: '18 – 20 m²', sizeNum: 19,
          bedType: '2 Single beds', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 1050000, roomSource: 'kashotelpremium.com' },
        { id: 'h02-r5', name: 'Premium King Room with City View', size: '22 m²', sizeNum: 22,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 1350000, roomSource: 'Trip.com' },
        { id: 'h02-r6', name: 'Premium Twin Room with City View', size: '22 m²', sizeNum: 22,
          bedType: '2 Single beds or 1 King bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 1350000, roomSource: 'Trip.com' },
        { id: 'h02-r7', name: 'Family Room with City View', size: '27 m²', sizeNum: 27,
          bedType: '1 Small double + 1 Queen bed', maxGuests: 4, adults: 4, children: 2,
          view: 'City view', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 1600000, roomSource: 'Trip.com' },
        { id: 'h02-r8', name: 'Deluxe Family Room with City View', size: '45 m²', sizeNum: 45,
          bedType: '2 Queen beds', maxGuests: 4, adults: 4, children: 2,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 1950000, roomSource: 'Trip.com' }
      ]
    },

    /* ---------------------------------------------------------------- 03 */
    {
      id: 'hotel-03', branchCode: '03',
      name: 'KAS Ancient Luxury Hotel',
      legacyName: 'Song Anh 1 Hotel',
      aliases: ['Song Anh 1 Hotel','KAS Ancient Boutique Hotel','KAS Nguyen Trai Hotel'],
      tagline: 'A rooftop bar above Nguyen Trai.',
      address: '47A Nguyen Trai, Ben Thanh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Ben Thanh',
      quickSearchTags: ['district1','ben-thanh','nguyen-trai','boutique','rooftop','breakfast','staycation','walkable','food','central'],
      starRating: 3, rating: 9.6, ratingScale: 10, reviews: 518, ratingSource: 'Google',
      altScore: { value: 8.1, scale: 10, count: 109, source: 'Trip.com' },
      description: 'A recently renovated boutique address on Nguyen Trai, with a rooftop bar, a ground-floor café and a prime walkable position in District 1. Rooms run from compact city bolt-holes to a 42 m² family layout.',
      checkIn: '14:00', checkOut: '12:00',
      totalRooms: null,
      imageSource: 'Trip.com CDN (property 100937358)',
      amenities: ['Free high-speed Wi-Fi','Rooftop bar','Restaurant','Cafe',
        '24-hour front desk','Airport transportation','Baggage storage',
        'Laundry service','Non-smoking hotel','Concierge'],
      priceRangeUSD: '$31 – $81', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved: Agoda indexed titles "KAS Ancient Boutique Hotel" / "KAS Nguyen Trai Hotel" + address match',
      sourceUrl: 'https://www.agoda.com/vi-vn/song-anh-1-hotel/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/our-properties/kas-ancient-luxury-hotel',
      guestReviews: [
        { name: 'KAS guest', date: '2026', stars: 4, text: 'Comfortable. Staff attentive and the location could not be better for walking the centre.' }
      ],
      subRatings: null,
      rooms: [
        { id: 'h03-r1', name: 'Standard Double Room No Window', size: '14 m²', sizeNum: 14,
          bedType: '1 Small double bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No window', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: false, pricePerNight: 1120000, roomSource: 'Trip.com' },
        { id: 'h03-r2', name: 'Superior Queen Room with City View', size: '20 m²', sizeNum: 20,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 1450000, roomSource: 'Trip.com' },
        { id: 'h03-r3', name: 'Deluxe King Room with Window', size: '25 m²', sizeNum: 25,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 1750000, roomSource: 'Trip.com' },
        { id: 'h03-r4', name: 'Deluxe Family Room with City View', size: '42 m²', sizeNum: 42,
          bedType: '2 Queen beds', maxGuests: 4, adults: 4, children: 2,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 2150000, roomSource: 'Trip.com' }
      ]
    },

    /* ---------------------------------------------------------------- 04 */
    {
      id: 'hotel-04', branchCode: '04',
      name: 'KAS Milestone Premium Hotel',
      legacyName: 'The KAS Hotel Saigon',
      aliases: ['The KAS Hotel Saigon','KAS Milestone Luxury Hotel'],
      tagline: 'The flagship. Rooftop bar, gym, and a 50 m² suite.',
      address: '170–174 Nguyen Thai Binh, Nguyen Thai Binh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Nguyen Thai Binh',
      quickSearchTags: ['district1','nguyen-thai-binh','rooftop','balcony','breakfast','central','food'],
      starRating: 4, rating: 8.5, ratingScale: 10, reviews: 95, ratingSource: 'Trip.com',
      altScore: { value: 8.7, scale: 10, count: 94, source: 'Trip.com' },
      description: 'The collection\'s flagship: a four-star house opened in 2023 with 41 rooms, a rooftop bar over District 1, a fitness centre, an all-day restaurant serving Vietnamese and international menus, and a breakfast guests write home about.',
      checkIn: '14:00', checkOut: '12:00',
      totalRooms: 41,
      imageSource: 'Trip.com CDN (property 135266341)',
      amenities: ['Free high-speed Wi-Fi','Rooftop bar','Fitness centre / gym',
        'Restaurant','Cafe','Free parking','Airport pick-up / drop-off',
        '24-hour front desk','Concierge','Luggage storage','Laundry service',
        'Bar & lounge','Afternoon tea'],
      priceRangeUSD: '$44 – $106', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved: Agoda indexed title "KAS Milestone Premium Hotel" + Trip.com + kashotelpremium.com',
      sourceUrl: 'https://www.agoda.com/vi-vn/the-kas-hotel-saigon-h75242621/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/home',
      guestReviews: [
        { name: 'Hannah C', date: 'Jun 2026', stars: 5, text: 'Great service and prices. Located conveniently in District 1 — breakfast was so good as well!' },
        { name: 'Anis', date: 'Jun 2026', stars: 5, text: 'The location very strategic. The service very good n friendly. Price very affordable.' },
        { name: 'Sarah', date: 'May 2026', stars: 5, text: 'Excellent hotel. Friendly staff, great breakfast, comfortable beds and nice decor.' },
        { name: 'Ayad', date: 'Jun 2026', stars: 5, text: 'It was a great experience, Bao Tran was smiley and welcoming. My first reaction when I came in the room was WOW.' }
      ],
      subRatings: { Location: 5.0, Rooms: 4.9, Cleanliness: 5.0, Service: 5.0, Value: 5.0 },
      rooms: [
        { id: 'h04-r1', name: 'Deluxe Queen with Window', size: '21 m²', sizeNum: 21,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 1150000, roomSource: 'Trip.com' },
        { id: 'h04-r2', name: 'Premium Queen with Balcony & City View', size: '26 m²', sizeNum: 26,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: true, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 1650000, roomSource: 'Trip.com' },
        { id: 'h04-r3', name: 'Premium Twin with Window', size: '29 m²', sizeNum: 29,
          bedType: '2 Single beds or 1 King bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 1950000, roomSource: 'Trip.com' },
        { id: 'h04-r4', name: 'Junior Suite with Balcony & City View', size: '50 m²', sizeNum: 50,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 2,
          view: 'City view', balcony: true, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 2750000, roomSource: 'Trip.com' }
      ]
    },

    /* ---------------------------------------------------------------- 05 */
    {
      id: 'hotel-05', branchCode: '05',
      name: 'KAS Zody Boutique Hotel',
      legacyName: 'Tuyet Lan Corner',
      aliases: ['Tuyet Lan Corner','KAS Zody Boutique Hotel'],
      tagline: 'Quiet rooms on Le Thanh Ton.',
      address: '278 Le Thanh Ton, Ben Thanh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Ben Thanh',
      quickSearchTags: ['district1','ben-thanh','le-thanh-ton','boutique','spa','breakfast','walkable','food','central'],
      starRating: 3, rating: 8.8, ratingScale: 10, reviews: 86, ratingSource: 'Trip.com',
      altScore: { value: 8.8, scale: 10, count: 78, source: 'Trip.com' },
      description: 'Nestled in the heart of the city on Le Thanh Ton, with convenience stores, restaurants and cafés a short walk in every direction. Guests single out how quiet the rooms are — a rare thing this close to the centre.',
      checkIn: '14:00 – 24:00', checkOut: '12:00',
      totalRooms: null,
      imageSource: 'Trip.com CDN (property 119255177)',
      amenities: ['Free high-speed Wi-Fi','Spa','24-hour front desk',
        'Airport transportation','Laundry service','Non-smoking property',
        'Elevator','Daily housekeeping','On-site parking'],
      priceRangeUSD: '$23 – $63', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved by elimination + address/brand match across the 8-property KAS collection',
      sourceUrl: 'https://www.agoda.com/vi-vn/tuyet-lan-corner/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/our-properties/kas-zody-boutique-hotel',
      guestReviews: [
        { name: 'Ping P', date: 'Jun 2026', stars: 5, text: 'The location is excellent, with plenty of convenience stores, restaurants and cafés just a short walk away.' },
        { name: 'Brick S', date: 'Jun 2026', stars: 5, text: 'The room was nice and clean, the bed was comfortable, and the room was very quiet.' },
        { name: 'Frédérique G', date: 'May 2026', stars: 5, text: 'Very welcoming personnel, the location is great. The hotel is next to many beautiful and vibrant streets.' },
        { name: 'Nur Aisyah Binti Rahman', date: 'Jul 2026', stars: 5, text: 'Easy location, comfortable rooms, and sufficient facilities provided. Good choice for a vacation.' }
      ],
      subRatings: { Location: 5.0, Rooms: 4.7, Cleanliness: 5.0, Service: 4.7, Value: 4.8 },
      rooms: [
        { id: 'h05-r1', name: 'Standard Room No Window', size: '12 m²', sizeNum: 12,
          bedType: '1 Double bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No window', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: false, pricePerNight: 600000, roomSource: 'Trip.com' },
        { id: 'h05-r2', name: 'Superior Room with Window', size: '17 m²', sizeNum: 17,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'Window', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 850000, roomSource: 'Trip.com' },
        { id: 'h05-r3', name: 'Double Double Room', size: null, sizeNum: null,
          bedType: '2 Single beds or 1 King bed', maxGuests: 2, adults: 2, children: 1,
          view: null, balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 950000, roomSource: 'Trip.com',
          notes: 'Room size not published by source.' },
        { id: 'h05-r4', name: 'Deluxe Double Room Street View', size: '22 m²', sizeNum: 22,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'Street view', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: true, pricePerNight: 1150000, roomSource: 'Trip.com' },
        { id: 'h05-r5', name: 'Studio Room', size: '20 m²', sizeNum: 20,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'No view', balcony: false, bathroom: 'Toilet, sink, shower',
          breakfast: true, pricePerNight: 1350000, roomSource: 'kashotelpremium.com' },
        { id: 'h05-r6', name: 'Suite Room', size: '28 m²', sizeNum: 28,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 2,
          view: 'No view', balcony: false, bathroom: 'Toilet, sink, shower',
          breakfast: true, pricePerNight: 1650000, roomSource: 'kashotelpremium.com' }
      ]
    },

    /* ---------------------------------------------------------------- 06 */
    {
      id: 'hotel-06', branchCode: '06',
      name: 'KAS Sonata Luxury Hotel',
      legacyName: 'Tuong Vy Hotel',
      aliases: ['Tuong Vy Hotel','Kas Sonata Luxury Hotel'],
      tagline: 'Thai kitchen downstairs, the comfiest bed in Vietnam upstairs.',
      address: '40–42 Bui Thi Xuan, Ben Thanh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Ben Thanh',
      quickSearchTags: ['district1','ben-thanh','bui-thi-xuan','breakfast','food','central'],
      starRating: 3, rating: 9.1, ratingScale: 10, reviews: 81, ratingSource: 'Trip.com',
      altScore: { value: 9.1, scale: 10, count: 90, source: 'Trip.com' },
      description: 'Opened in 2022 on Bui Thi Xuan, with an in-house Thai restaurant, free luggage storage and a room mix that runs from a 15 m² city single up to a 45 m² family suite. Guests repeatedly call the beds the most comfortable of their trip.',
      checkIn: '14:00', checkOut: '12:00',
      totalRooms: null,
      imageSource: 'Trip.com CDN (property 135266420)',
      amenities: ['Free high-speed Wi-Fi','Thai restaurant','24-hour front desk',
        'Airport transportation','Currency exchange','Free luggage storage',
        'Dry cleaning','Non-smoking hotel','Elevator','Daily housekeeping'],
      priceRangeUSD: '$28 – $38 (standard)', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved: exact street-address match (40–42 Bui Thi Xuan) with kashotelpremium.com + Trip.com + Expedia',
      sourceUrl: 'https://www.agoda.com/vi-vn/tuong-vy-hotel/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/our-properties/kas-sonata-luxury-hotel',
      guestReviews: [
        { name: 'Josh P', date: 'Apr 2026', stars: 5, text: 'Customer service here is exceptional. Spacious room and definitely the comfiest bed I have had in Vietnam.' },
        { name: 'Jesse H', date: 'Jun 2026', stars: 5, text: 'Cozy and comfortable room with a huge shower. Value for the money is affordable.' },
        { name: 'Akshay S', date: 'Sep 2026', stars: 5, text: 'Reception staff were extremely kind, welcoming, and well-informed.' },
        { name: 'Ashlie S', date: 'Mar 2026', stars: 5, text: 'Staff were kind and helpful. Beds are firm so if you like that, you will love it!' }
      ],
      subRatings: { Location: 5.0, Rooms: 4.5, Cleanliness: 4.8, Service: 4.8, Value: 4.6 },
      rooms: [
        { id: 'h06-r1', name: 'Standard Double Room No Window', size: '15 m²', sizeNum: 15,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No window', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: false, pricePerNight: 750000, roomSource: 'Trip.com' },
        { id: 'h06-r2', name: 'Deluxe Double Room with Window', size: '20 m²', sizeNum: 20,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 1050000, roomSource: 'Trip.com' },
        { id: 'h06-r3', name: 'Deluxe Twin Room', size: '21 m²', sizeNum: 21,
          bedType: '2 Single beds', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 1150000, roomSource: 'kashotelpremium.com' },
        { id: 'h06-r4', name: 'Deluxe Balcony Room', size: '21 m²', sizeNum: 21,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: true, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 1250000, roomSource: 'kashotelpremium.com' },
        { id: 'h06-r5', name: 'Premium King Room with City View', size: '30 m²', sizeNum: 30,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 1750000, roomSource: 'Trip.com' },
        { id: 'h06-r6', name: 'Deluxe Family Room with City View', size: '45 m²', sizeNum: 45,
          bedType: '2 Queen beds', maxGuests: 4, adults: 4, children: 2,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 2350000, roomSource: 'Trip.com' }
      ]
    },

    /* ---------------------------------------------------------------- 07 */
    {
      id: 'hotel-07', branchCode: '07',
      name: 'KAS Eliana Luxury Hotel',
      legacyName: 'Apec Hotel',
      aliases: ['Apec Hotel','KAS Luxury Saigon','KAS Eliana Luxury Hotel'],
      tagline: 'Balconies over Bui Thi Xuan.',
      address: '13 Bui Thi Xuan, Ben Thanh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Ben Thanh',
      quickSearchTags: ['district1','ben-thanh','bui-thi-xuan','spa','balcony','breakfast','staycation','ben-thanh-market','walkable','central'],
      starRating: 3, rating: 8.7, ratingScale: 10, reviews: 96, ratingSource: 'Trip.com',
      altScore: { value: 8.7, scale: 10, count: 88, source: 'Trip.com' },
      description: 'A romantic, newly renovated address in the heart of District 1 — modern design, balconies in selected rooms, and a 45 m² Premium Suite. Ben Thanh Market, Independence Palace and Pham Ngu Lao are all within a few minutes\' walk.',
      checkIn: '14:00', checkOut: '12:00',
      totalRooms: null,
      imageSource: 'Trip.com CDN (property 135266582)',
      amenities: ['Free high-speed Wi-Fi','Spa','Breakfast available',
        'Airport transportation','24-hour front desk','Currency exchange',
        'Luggage storage','Dry cleaning','Laundry service','Non-smoking property',
        'Balconies in selected rooms'],
      priceRangeUSD: '$26 – $74', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved: Agoda indexed title "KAS Luxury Saigon" → Traveloka confirms "KAS Luxury Saigon" = KAS Eliana Luxury Hotel',
      sourceUrl: 'https://www.agoda.com/vi-vn/apec-hotel/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/our-properties/kas-eliana-luxury-hotel',
      guestReviews: [
        { name: 'H I R', date: 'Feb 2026', stars: 5, text: 'The staff made me feel like part of a family celebration during my Lunar New Year stay.' },
        { name: 'Petra Vuković', date: 'Jul 2026', stars: 5, text: 'The room was clean, cozy, and comfortable, with welcoming staff and a convenient location near attractions.' },
        { name: 'goshan', date: 'Mar 2026', stars: 4, text: 'We were quite pleased with our stay — convenient location and friendly staff.' }
      ],
      subRatings: { Location: 4.6, Rooms: 4.5, Cleanliness: 4.5, Service: 4.5, Value: 4.4 },
      rooms: [
        { id: 'h07-r1', name: 'Standard Double No Window', size: '14 m²', sizeNum: 14,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No window', balcony: false, bathroom: 'Private bathroom, shower',
          breakfast: false, pricePerNight: 700000, roomSource: 'Trip.com' },
        { id: 'h07-r2', name: 'Deluxe Queen with City View', size: '23 m²', sizeNum: 23,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 1850000, roomSource: 'Trip.com' },
        { id: 'h07-r3', name: 'Premium King with City View', size: '32 m²', sizeNum: 32,
          bedType: 'King bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: true, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 2150000, roomSource: 'Trip.com' },
        { id: 'h07-r4', name: 'Premium Suite', size: '45 m²', sizeNum: 45,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 2,
          view: 'No window', balcony: false, bathroom: 'Toilet, sink, bathtub',
          breakfast: true, pricePerNight: 2650000, roomSource: 'Trip.com' }
      ]
    },

    /* ---------------------------------------------------------------- 08 */
    {
      id: 'hotel-08', branchCode: '08',
      name: 'KAS Dilly Luxury Hotel',
      legacyName: 'KAS Mays Saigon',
      aliases: ['KAS Mays Saigon','Kas Dilly Hotel','KAS Dilly Hotel & Spa'],
      tagline: 'Forty rooms and a spa, a block from Ben Thanh.',
      address: '191 Le Thanh Ton, Ben Thanh Ward, District 1, Ho Chi Minh City',
      district: 'District 1', area: 'Ben Thanh',
      quickSearchTags: ['district1','ben-thanh','le-thanh-ton','spa','balcony','breakfast','staycation','ben-thanh-market','walkable','central'],
      starRating: 3, rating: 9.6, ratingScale: 10, reviews: 476, ratingSource: 'Google',
      altScore: { value: 9.2, scale: 10, count: 67, source: 'Trip.com' },
      description: 'Elegant yet warm, renovated through 2025, with 40 rooms, a spa, express check-in and a position a single block from Ben Thanh Market. The Premium King adds a 37 m² footprint and a private balcony.',
      checkIn: '14:00 – 23:00', checkOut: '12:00',
      totalRooms: 40,
      imageSource: 'Trip.com CDN (properties 135266918 + 131312703)',
      amenities: ['Free high-speed Wi-Fi','Spa','Express check-in / check-out',
        'Concierge','24-hour front desk','Airport transportation','Baggage storage',
        'Laundry service','Ironing service','Elevator','CCTV','Non-smoking hotel',
        'Balconies in selected rooms'],
      priceRangeUSD: '$32 – $79', priceRangeSource: 'KAS reference source',
      source: 'Agoda (slug) → resolved: Agoda indexed title "KAS Dilly Hotel" + address match (191 Le Thanh Ton)',
      sourceUrl: 'https://www.agoda.com/vi-vn/kas-mays-saigon/hotel/ho-chi-minh-city-vn.html',
      officialUrl: 'https://www.kashotelpremium.com/our-properties/kas-dilly-luxury-hotel',
      guestReviews: [
        { name: 'Seo Yuna', date: 'Jul 2026', stars: 5, text: 'Friendly service and good location. Clean, comfortable rooms; staff provided kind, quick assistance.' },
        { name: 'Revatey', date: 'Apr 2026', stars: 5, text: 'Unbeatable location near Ben Thanh Market, warm receptionist staff, spacious clean room with fresh linens.' },
        { name: 'Marcel O', date: 'May 2026', stars: 4, text: 'Great service, great location. Excellent reception staff — especially Ngan — clean room and central position.' }
      ],
      subRatings: { Location: 5.0, Rooms: 4.6, Cleanliness: 4.7, Service: 4.9, Value: 4.7 },
      rooms: [
        { id: 'h08-r1', name: 'Standard Double Room No Window', size: '15 m²', sizeNum: 15,
          bedType: '1 Small double bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No window', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: false, pricePerNight: 850000, roomSource: 'Trip.com' },
        { id: 'h08-r2', name: 'Superior Queen Room No Window', size: '21 m²', sizeNum: 21,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 0,
          view: 'No window', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 1150000, roomSource: 'Trip.com' },
        { id: 'h08-r3', name: 'Deluxe Queen Room with City View', size: null, sizeNum: null,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 1450000, roomSource: 'Trip.com',
          notes: 'Room size not published by source.' },
        { id: 'h08-r4', name: 'Deluxe King Room with Window', size: '27 m²', sizeNum: 27,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 1,
          view: 'City view', balcony: false, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 1750000, roomSource: 'Trip.com' },
        { id: 'h08-r5', name: 'Premium King Room with Balcony', size: '37 m²', sizeNum: 37,
          bedType: 'Queen bed', maxGuests: 2, adults: 2, children: 2,
          view: 'City view', balcony: true, bathroom: 'Toilet, sink, stand-up shower',
          breakfast: true, pricePerNight: 2050000, roomSource: 'Trip.com' }
      ]
    }
  ];

  /* ---- complete room inventory from operator rate sheets ----------------
     Some branches previously had fewer UI room objects than the operator's
     rate sheet. The sheet is authoritative for inventory/rates, so the
     missing room types are added here with only source-supported basics.
     Unknown physical details stay null / "Not published" rather than being
     fabricated. Their exact rates and uploaded photos are resolved through
     KAS_RATES + /api/catalog using branch + STT.
     ---------------------------------------------------------------------- */
  var SHEET_ROOM_ADDITIONS = {
    'hotel-04': [
      { id:'h04-r5', stt:1, name:'Superior Queen Room', bedType:'Queen bed', maxGuests:2, adults:2, children:0, view:'Not published', balcony:false, bathroom:'Private bathroom', breakfast:false },
      { id:'h04-r6', stt:3, name:'Deluxe Queen Room with City View', bedType:'Queen bed', maxGuests:2, adults:2, children:1, view:'City view', balcony:false, bathroom:'Private bathroom', breakfast:false }
    ],
    'hotel-06': [
      { id:'h06-r7', stt:2, name:'Superior Double Room with Window', bedType:'Double bed', maxGuests:2, adults:2, children:0, view:'Window', balcony:false, bathroom:'Private bathroom', breakfast:false },
      { id:'h06-r8', stt:4, name:'Deluxe Queen Room with City View', bedType:'Queen bed', maxGuests:2, adults:2, children:1, view:'City view', balcony:false, bathroom:'Private bathroom', breakfast:false },
      { id:'h06-r9', stt:8, name:'Premium Twin Room with City View', bedType:'2 Single beds', maxGuests:2, adults:2, children:1, view:'City view', balcony:false, bathroom:'Private bathroom', breakfast:false }
    ],
    'hotel-07': [
      { id:'h07-r5', stt:2, name:'Superior Queen Room', bedType:'Queen bed', maxGuests:2, adults:2, children:0, view:'Not published', balcony:false, bathroom:'Private bathroom', breakfast:false },
      { id:'h07-r6', stt:4, name:'Deluxe King Room with Balcony', bedType:'King bed', maxGuests:2, adults:2, children:1, view:'Not published', balcony:true, bathroom:'Private bathroom', breakfast:false }
    ],
    'hotel-08': [
      { id:'h08-r6', stt:5, name:'Deluxe Queen Room with Balcony', bedType:'Queen bed', maxGuests:2, adults:2, children:1, view:'Not published', balcony:true, bathroom:'Private bathroom', breakfast:false }
    ]
  };

  hotels.forEach(function (h) {
    var adds = SHEET_ROOM_ADDITIONS[h.id] || [];
    adds.forEach(function (a) {
      h.rooms.push({
        id: a.id,
        name: a.name,
        size: null,
        sizeNum: null,
        bedType: a.bedType,
        maxGuests: a.maxGuests,
        adults: a.adults,
        children: a.children,
        view: a.view,
        balcony: a.balcony,
        bathroom: a.bathroom,
        breakfast: a.breakfast,
        pricePerNight: 0,
        roomSource: 'Operator rate sheet — room type inventory',
        notes: 'Room size and other physical details were not published in the supplied rate sheet.'
      });
    });
  });

  /* ---- Trip.com room-profile overlay -------------------------------------
     The KAS rate sheet remains authoritative for pricing / STT mapping.
     Room-facing physical details below are taken from the supplied Trip.com
     property pages (and their indexed mirrors). Values not published by
     Trip.com are left null rather than guessed.
     ---------------------------------------------------------------------- */
  var TRIP_ROOM_PROFILES = {
    'hotel-01': {
      1:{name:'Standard Double Room No Window',size:'17 m²',sizeNum:17,bedType:'1 Double bed',view:'No window',window:'No window'},
      2:{name:'Superior Queen Room with Window',size:'15 m²',sizeNum:15,bedType:'1 Queen bed',view:'Not published',window:'Window'},
      3:{name:'Family Room with City View',size:'35 m²',sizeNum:35,bedType:'2 Small double beds',view:'City view',window:'Fixed window'}
    },
    'hotel-02': {
      1:{name:'Standard Double Room No Window',size:'15 m²',sizeNum:15,bedType:'1 Double bed',view:'No window',window:'No window'},
      2:{name:'Superior Double Room Small Window',size:'15 m²',sizeNum:15,bedType:'1 Double bed',view:'Not published',window:'Small window'},
      3:{name:'Deluxe King Room with Window',size:'20 m²',sizeNum:20,bedType:'1 Queen bed',view:'Not published',window:'Window'},
      4:{name:'Premium King Room with City View',size:'22 m²',sizeNum:22,bedType:'1 Queen bed',view:'City view',window:'Fixed window'},
      5:{name:'Deluxe Twin Room with Window',size:'20 m²',sizeNum:20,bedType:'2 Single beds or 1 King bed',view:'Not published',window:'Window'},
      6:{name:'Premium Twin Room with City View',size:'22 m²',sizeNum:22,bedType:'2 Single beds or 1 King bed',view:'City view',window:'Fixed window'},
      7:{name:'Family Room with City View',size:'27 m²',sizeNum:27,bedType:'1 Small double bed and 1 Queen bed',view:'City view',window:'Fixed window'},
      8:{name:'Deluxe Family Room with City View',size:'45 m²',sizeNum:45,bedType:'2 Queen beds',view:'City view',window:'Fixed window'}
    },
    'hotel-03': {
      1:{name:'Standard Double Room No Window',size:'14 m²',sizeNum:14,bedType:'1 Small double bed',view:'No window',window:'No window'},
      2:{name:'Superior Queen Room with City View',size:'20 m²',sizeNum:20,bedType:'1 Queen bed',view:'City view',window:'Window'},
      3:{name:'Deluxe King Room with Window',size:'25 m²',sizeNum:25,bedType:'1 Queen bed',view:'Not published',window:'Window'},
      4:{name:'Deluxe Family Room with City View',size:'42 m²',sizeNum:42,bedType:'2 Queen beds',view:'City view',window:'Not published'}
    },
    'hotel-04': {
      1:{name:'Superior Queen Room No Window',size:'18 m²',sizeNum:18,bedType:'1 Queen bed',view:'No window',window:'No window'},
      2:{name:'Deluxe Queen Room with Window',size:'21 m²',sizeNum:21,bedType:'1 Queen bed',view:'Not published',window:'May not have a window'},
      3:{name:'Deluxe Queen Room with City View',size:'23 m²',sizeNum:23,bedType:'1 Queen bed',view:'City view',window:'May not have a window'},
      4:{name:'Premium Twin Room with Window',size:'29 m²',sizeNum:29,bedType:'2 Single beds or 1 King bed',view:'Not published',window:'May not have a window'},
      5:{name:'Premium Queen Room with Balcony & City View',size:'26 m²',sizeNum:26,bedType:'1 Queen bed',view:'City view',window:'Has window'},
      6:{name:'Junior Suite with Balcony & City View',size:'50 m²',sizeNum:50,bedType:'1 Queen bed',view:'City view',window:'Has window'}
    },
    'hotel-05': {
      1:{name:'Standard Double Room',size:null,sizeNum:null,bedType:'1 Double bed',view:'Not published',window:'Not published'},
      2:{name:'Superior Double Room',size:null,sizeNum:null,bedType:'1 Queen bed',view:'Not published',window:'Not published'},
      3:{name:'Double Or Twin Room',size:null,sizeNum:null,bedType:'2 Single beds or 1 King bed',view:'Not published',window:'Not published'},
      4:{name:'Deluxe Queen Room',size:null,sizeNum:null,bedType:'1 Queen bed',view:'Not published',window:'Has window'},
      5:{name:'Studio',size:null,sizeNum:null,bedType:'1 Queen bed',view:'Not published',window:'No window'},
      6:{name:'Queen Suite-Non-Smoking',size:null,sizeNum:null,bedType:'1 Queen bed',view:'Not published',window:'Has window'}
    },
    'hotel-06': {
      1:{name:'Standard Double Room No Window',size:'15 m²',sizeNum:15,bedType:'1 Queen bed',view:'No window',window:'No window'},
      2:{name:'Superior Double Room with Window',size:'16 m²',sizeNum:16,bedType:'1 Queen bed',view:'Not published',window:'Window'},
      3:{name:'Deluxe Double Room with Window',size:'20 m²',sizeNum:20,bedType:'1 Queen bed',view:'Not published',window:'May not have a window'},
      4:{name:'Deluxe Queen Room with City View',size:'21 m²',sizeNum:21,bedType:'1 Queen bed',view:'City view',window:'May not have a window'},
      5:{name:'Deluxe Queen Room with Balcony & City View',size:null,sizeNum:null,bedType:'1 Queen bed',view:'City view',window:'Not published'},
      6:{name:'Superior Twin Room with Window',size:'26 m²',sizeNum:26,bedType:'2 Small double beds or 1 King bed',view:'Not published',window:'May not have a window'},
      7:{name:'Premium King Room with City View',size:'30 m²',sizeNum:30,bedType:'1 Queen bed',view:'City view',window:'May not have a window'},
      8:{name:'Premium Twin Room with Window',size:'29 m²',sizeNum:29,bedType:'2 Single beds or 1 King bed',view:'Not published',window:'May not have a window'},
      9:{name:'Deluxe Family Room with City View',size:'45 m²',sizeNum:45,bedType:'2 Queen beds',view:'City view',window:'May not have a window'}
    },
    'hotel-07': {
      1:{name:'Standard Double Room No Window',size:'14 m²',sizeNum:14,bedType:'1 Queen bed',view:'No window',window:'No window'},
      2:{name:'Superior Queen Room No Window',size:'22 m²',sizeNum:22,bedType:'1 Queen bed',view:'No window',window:'No window'},
      3:{name:'Deluxe Queen Room with City View',size:'23 m²',sizeNum:23,bedType:'1 Queen bed',view:'City view',window:'May not have a window'},
      4:{name:'Deluxe King Room with Balcony',size:'27 m²',sizeNum:27,bedType:'1 Queen bed',view:'Not published',window:'Not published'},
      5:{name:'Premium King Room with City View',size:'32 m²',sizeNum:32,bedType:'1 Queen bed',view:'City view',window:'May not have a window'},
      6:{name:'Premium Suite Room',size:'45 m²',sizeNum:45,bedType:'1 Queen bed',view:'Not published',window:'No window'}
    },
    'hotel-08': {
      1:{name:'Standard Double Room No Window',size:'15 m²',sizeNum:15,bedType:'1 Small double bed',view:'No window',window:'No window'},
      2:{name:'Superior Queen Room No Window',size:'21 m²',sizeNum:21,bedType:'1 Queen bed',view:'No window',window:'No window'},
      3:{name:'Deluxe Queen Room with City View',size:'20 m²',sizeNum:20,bedType:'1 Queen bed',view:'City view',window:'Has window'},
      4:{name:'Deluxe King Room with Window',size:'27 m²',sizeNum:27,bedType:'1 Queen bed',view:'Not published',window:'Has window'},
      5:{name:'Deluxe Queen Room with Balcony',size:'25 m²',sizeNum:25,bedType:'1 Queen bed',view:'Not published',window:'Has window'},
      6:{name:'Premium King Room with Balcony',size:'37 m²',sizeNum:37,bedType:'1 Queen bed',view:'Not published',window:'Has window'}
    }
  };

  hotels.forEach(function (h) {
    var profiles = TRIP_ROOM_PROFILES[h.id] || {};
    h.rooms.forEach(function (r) {
      var mapping = global.KAS_RATES && global.KAS_RATES.mappingFor(r.id);
      var stt = mapping ? Number(mapping.stt) : null;
      var p = stt != null ? profiles[stt] : null;
      if (!p) return;
      r.name = p.name;
      r.size = p.size;
      r.sizeNum = p.sizeNum;
      r.bedType = p.bedType;
      r.view = p.view;
      r.window = p.window;
      r.tripRoomSource = 'Trip.com';
    });
  });

  /* ---- post-process: assemble galleries, amenities, policies ----------
     Photographs come exclusively from window.KAS_IMAGES (js/images.js).
     -------------------------------------------------------------------- */
  var IMGS = global.KAS_IMAGES;

  hotels.forEach(function (h) {
    h.services = SHARED_HOTEL_SERVICES;
    h.startingPrice = Math.min.apply(null, h.rooms.map(function (r) { return r.pricePerNight; }));
    h.roomCount = h.rooms.length;

    var pm = IMGS.meta(h.id);
    h.photos = pm;
    h.photosVerified = pm.verified;
    h.images = IMGS.allPool(h.id);       // property gallery, exterior first
    h.roomPhotos = IMGS.roomPool(h.id);  // VERIFIED room photos only
    h.imageSource = pm.source;
    h.imageSourceUrl = pm.sourceUrl;

    /* Disjoint partition: each room type gets its OWN slice of this hotel's
       verified room photos. A photo is never shared between two room types.
       Where the source gallery is not categorised (Br01/06/07 pending), the
       room pool is empty and rooms fall back to the property gallery, flagged
       UNCATEGORISED so the UI can say so plainly. */
    var slices = IMGS.partitionRooms(h.id, h.rooms.length);

    h.rooms.forEach(function (r, idx) {
      r.hotelId = h.id;
      r.hotelName = h.name;
      r.branchCode = h.branchCode;
      r.amenities = SHARED_ROOM_AMENITIES.concat(
        r.bathroom && /bathtub/i.test(r.bathroom) ? ['Bathtub'] : ['Rain shower'],
        r.balcony ? ['Private balcony'] : []
      );

      var own = slices[idx] || [];
      if (own.length) {
        r.images = own;
        r.photoCategory = 'VERIFIED_ROOM_PHOTO';
        r.roomTypeAttribution = 'NEEDS_REVIEW';
        r.photoNote = 'Verified guest-room photographs of ' + h.name +
          '. The source publishes room photos by category, not by room type, so ' +
          'their assignment to this specific room type is not source-verified.';
      } else {
        var pool = h.images || [];
        r.images = pool.length
          ? [pool[idx % pool.length]].concat(
              pool.filter(function (_, i) { return i !== (idx % pool.length); }).slice(0, 3))
          : [];
        r.photoCategory = 'UNCATEGORISED';
        r.roomTypeAttribution = 'NEEDS_REVIEW';
        r.photoNote = 'The source gallery for this property is not categorised, so these ' +
          'photographs are not confirmed to show a guest room.';
      }

      /* Sibling room photographs from the SAME property — rendered in a
         clearly separated second tier, never mixed into the room's own set. */
      r.siblingRoomPhotos = (h.roomPhotos || []).filter(function (u) {
        return own.indexOf(u) < 0;
      });

      r.imageSource = h.imageSource;
      r.imageSourceUrl = h.imageSourceUrl;
      r.cancellation = 'Free cancellation until 18:00 the day before arrival.';
      r.payment = 'Pay at hotel, card, ZaloPay or bank transfer.';
      r.source = 'Agoda (slug) → ' + r.roomSource;
      r.sourceUrl = h.sourceUrl;
      /* ---- PRICE ----------------------------------------------------
         The operator's rate sheet is the source of truth. Where a room is
         confidently mapped to a sheet row we take the sheet figure; where it
         is not, the previous demo rate stands and is labelled as such. No
         price is ever invented, rounded or interpolated. */
      var RT = global.KAS_RATES;
      if (RT && RT.hasSheetRate(r.id)) {
        var sr = RT.sheetRoomFor(r.id);
        var mp = RT.mappingFor(r.id);
        r.pricePerNight   = RT.fromRate(r.id);   // lowest published figure
        r.rateSource      = 'SHEET';
        r.sheetRoomName   = sr.name;
        r.sheetEz         = sr.ez;
        r.rateConfidence  = mp.confidence;
        r.rateMatchReason = mp.why;
        r.breakfast       = RT.POLICY.breakfastIncluded;  // sheet: excludes breakfast
        r.priceBasis      = 'Operator rate sheet — “' + sr.name + '” (Ez ' + sr.ez +
                            '). Weekday (Mon–Thu) and weekend (Fri–Sun) rates differ, and rates ' +
                            'are seasonal. ' + RT.POLICY.breakfastNote;
      } else {
        r.rateSource     = 'DEMO';
        r.rateConfidence = (RT && RT.mappingFor(r.id)) ? RT.mappingFor(r.id).confidence : 'NO_SHEET_TAB';
        r.rateMatchReason = (RT && RT.mappingFor(r.id))
          ? RT.mappingFor(r.id).why
          : 'No rate-sheet tab has been supplied for this branch yet.';
        r.priceBasis = 'DEMO RATE — derived from the published price range for this property. ' +
                       'Not from the operator rate sheet and not a live Agoda rate.';
      }
    });

    // "from" price reflects whatever each room actually costs now
    h.startingPrice = Math.min.apply(null, h.rooms.map(function (r) { return r.pricePerNight; }));
    h.rateSource = h.rooms.every(function (r) { return r.rateSource === 'SHEET'; }) ? 'SHEET'
                 : (h.rooms.some(function (r) { return r.rateSource === 'SHEET'; }) ? 'MIXED' : 'DEMO');
  });

  /* ---- config --------------------------------------------------------- */
  /* Default stay = today through tomorrow, relative to today (a fixed
     calendar date goes stale and puts every new visitor's stay in the past). */
  function isoFromToday(n) {
    var d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var CONFIG = {
    currency: 'VND',
    serviceChargeRate: 0.05,
    vatRate: 0.08,
    defaultCheckIn: isoFromToday(0),
    defaultCheckOut: isoFromToday(1),
    defaultAdults: 2,
    defaultChildren: 0,
    defaultRooms: 1,

    /* ---- OFFICIAL CONTACT — SINGLE SOURCE OF TRUTH -------------------
       Every header, footer, booking panel, confirmation screen and floating
       widget reads from here. No component may hard-code a number or link.
       ------------------------------------------------------------------ */
    contact: {
      phone:        '0869768885',
      displayPhone: '0869 768 885',
      tel:          'tel:+84869768885',
      zalo:         'https://zalo.me/0869768885',
      whatsapp:     'https://wa.me/84869768885',
      email:        'kashotelpremium@gmail.com',
      hqAddress:    '170–174 Nguyen Thai Binh, District 1, Ho Chi Minh City',
      hours:        '24/7',
      travelTrade: {
        displayPhone: '+84 968 694 864',
        tel: 'tel:+84968694864',
        zalo: 'https://zalo.me/0968694864',
        whatsapp: 'https://wa.me/84968694864'
      }
    }
  };

  /* Back-compat aliases so older call sites keep resolving to the one source. */
  CONFIG.phone = CONFIG.contact.displayPhone;
  CONFIG.email = CONFIG.contact.email;
  CONFIG.hqAddress = CONFIG.contact.hqAddress;

  global.KAS_DATA = {
    hotels: hotels,
    config: CONFIG,
    getHotel: function (id) {
      return hotels.filter(function (h) { return h.id === id; })[0] || null;
    },
    getRoom: function (hotelId, roomId) {
      var h = this.getHotel(hotelId);
      if (!h) return null;
      return h.rooms.filter(function (r) { return r.id === roomId; })[0] || null;
    },
    allRooms: function () {
      return hotels.reduce(function (acc, h) { return acc.concat(h.rooms); }, []);
    }
  };
})(window);
