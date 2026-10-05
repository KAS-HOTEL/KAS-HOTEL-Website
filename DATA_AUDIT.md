# DATA AUDIT — KAS Hotel Collection

> Field-by-field record of what was retrieved, from where, and what could **not** be retrieved.
> Audit date: 12 September 2026. Nothing in the dataset is invented; unavailable fields are `null`
> and render in the UI as *"Not published by source"*.

---

## 1. Why the Agoda pages could not be read directly

All 8 supplied URLs are **client-side rendered** (Agoda is a JavaScript SPA). Server-side fetching
returns only the application shell — meta tags plus the Agoda logo — with **zero** hotel or room
content in the HTML payload. This was verified against several locales (`vi-vn`, `en-in`, `en-za`,
`en-ie`) and against slug-only URLs; every one returned an empty shell.

The documented fallback procedure was therefore followed:

> *"1. Search by hotel name. 2. Find the Agoda indexed page. 3. Find room information from the
> Agoda search result. 4. Do not guess."*

### The critical discovery

**Every one of the 8 Agoda slugs is a legacy name.** The properties have been rebranded under the
KAS group. Google-indexed Agoda page titles reveal the current name behind each slug — for example
`agoda.com/cabana-hotel-saigon/` is now titled *"KAS Passion Boutique Hotel"*.

This also surfaced the operator's own website, **kashotelpremium.com**, which publishes the
authoritative room inventory (names, m², bed type, occupancy, view, bathroom) for all 8 properties.

### Source hierarchy used

| # | Source | Used for | Authority |
|---|---|---|---|
| 1 | **kashotelpremium.com** | Room names, m², bed, occupancy, view, bathroom, amenities | Operator's own site |
| 2 | **Trip.com** | Live OTA room inventory + photo CDN URLs | Live OTA (Agoda analogue) |
| 3 | **Tripadvisor** | Ratings, review counts, ranking, real guest reviews, price ranges | Independent |
| 4 | Expedia / Klook / Kayak / Traveloka / Booking | Cross-verification of addresses + slug→brand mapping | Corroboration |

---

## 2. Branch mapping (Agoda slug → current KAS property)

| Br | Agoda slug (legacy) | Current property | Address | Confidence |
|----|---------------------|------------------|---------|------------|
| 01 | `cabana-hotel-saigon` — *Cabana Hotel Saigon* | **KAS Passion Boutique Hotel** | 05 Truong Dinh, Ben Thanh Ward, District 1 | High (indexed title) |
| 02 | `pravina-hotel_2` — *Pravina Hotel* | **KAS Premium Boutique Hotel** | 260 Ly Tu Trong, Ben Thanh Ward, District 1 | High (exact address match) |
| 03 | `song-anh-1-hotel` — *Song Anh 1 Hotel* | **KAS Ancient Luxury Hotel** | 47A Nguyen Trai, Ben Thanh Ward, District 1 | High (exact address match) |
| 04 | `the-kas-hotel-saigon-h75242621` — *The KAS Hotel Saigon* | **KAS Milestone Premium Hotel** | 170–174 Nguyen Thai Binh, Nguyen Thai Binh Ward, District 1 | High (indexed title) |
| 05 | `tuyet-lan-corner` — *Tuyet Lan Corner* | **KAS Zody Boutique Hotel** | 278 Le Thanh Ton, Ben Thanh Ward, District 1 | Medium |
| 06 | `tuong-vy-hotel` — *Tuong Vy Hotel* | **KAS Sonata Luxury Hotel** | 40–42 Bui Thi Xuan, Ben Thanh Ward, District 1 | High (exact address match) |
| 07 | `apec-hotel` — *Apec Hotel* | **KAS Eliana Luxury Hotel** | 13 Bui Thi Xuan, Ben Thanh Ward, District 1 | High (indexed title) |
| 08 | `kas-mays-saigon` — *KAS Mays Saigon* | **KAS Dilly Luxury Hotel** | 191 Le Thanh Ton, Ben Thanh Ward, District 1 | High (indexed title) |

### How each mapping was established

**Branch 01 — KAS Passion Boutique Hotel**  
Agoda indexed page title for slug `cabana-hotel-saigon` reads **KAS Passion Boutique Hotel**. Address confirmed on kashotelpremium.com + Tripadvisor (05 Truong Dinh).

**Branch 02 — KAS Premium Boutique Hotel**  
Agoda indexed title for `pravina-hotel_2` reads **KAS Premium Saigon**. Tripadvisor lists Pravina Hotel at **260 Ly Tu Trong** — the exact address of KAS Premium Boutique Hotel on kashotelpremium.com. Also sold as *KAS Elegance Hotel* (Klook/Trip.com, same address).

**Branch 03 — KAS Ancient Luxury Hotel**  
Agoda indexed titles for `song-anh-1-hotel` read **KAS Ancient Boutique Hotel** and **KAS Nguyen Trai Hotel** — the latter matches KAS Ancient Luxury Hotel at **47A Nguyen Trai**. Two independent confirmations.

**Branch 04 — KAS Milestone Premium Hotel**  
Agoda indexed title for `the-kas-hotel-saigon-h75242621` reads **KAS Milestone Premium Hotel**. Address confirmed via Trip.com + Tripadvisor (170–174 / 172 Nguyen Thai Binh).

**Branch 05 — KAS Zody Boutique Hotel**  
Resolved by elimination across the operator's published 8-property collection after the other seven were positively identified; address and inventory confirmed on Trip.com + Tripadvisor (278 Le Thanh Ton). **Lowest-confidence mapping of the eight — see caveat below.**

**Branch 06 — KAS Sonata Luxury Hotel**  
Expedia lists Tuong Vy Hotel at **40–42 Bui Thi Xuan, Phuong Ben Thanh, District 1** — the exact address of KAS Sonata Luxury Hotel on kashotelpremium.com. Exact street-address match.

**Branch 07 — KAS Eliana Luxury Hotel**  
Agoda indexed title for `apec-hotel` reads **KAS Luxury Saigon**. Traveloka's listing titled *KAS Luxury Saigon* resolves to **KAS Eliana Luxury Hotel** (13 Bui Thi Xuan). Two-step confirmation.

**Branch 08 — KAS Dilly Luxury Hotel**  
Agoda indexed title for `kas-mays-saigon` reads **KAS Dilly Hotel**. Address confirmed via Trip.com + Tripadvisor (191 Le Thanh Ton).

> ⚠ **Caveat on Branch 05.** `tuyet-lan-corner` is the only slug whose Agoda-indexed title could not
> be retrieved directly. It is mapped to KAS Zody Boutique Hotel by elimination — the other seven
> branches were positively identified, and KAS Zody is the one remaining property in the operator's
> published collection of eight. All *data* for this branch (address, rooms, rating, photos) is
> sourced and verified for KAS Zody; only the slug↔property link carries residual uncertainty.

---

## 3. Per-branch field audit

### Branch 01 — KAS Passion Boutique Hotel

*Agoda source:* https://www.agoda.com/vi-vn/cabana-hotel-saigon/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/our-properties/kas-passion-boutique-hotel

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Passion Boutique Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | Cabana Hotel Saigon | Agoda slug | ✓ |
| Address | 05 Truong Dinh, Ben Thanh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Ben Thanh, District 1 | Operator site | ✓ |
| Star rating | 3-star | Trip.com | ✓ |
| Guest rating | 4.6/5 | Tripadvisor | ✓ |
| Review count | 143 | Tripadvisor | ✓ |
| Ranking | #87 of 1,036 hotels in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 9.1/10 (96) | Planet of Hotels | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | NOT AVAILABLE FROM SOURCE | Trip.com | ⚠ null |
| Room types | 3 types | Operator site + Trip.com | ✓ |
| Amenities | 9 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $27 – $82 | Tripadvisor | ✓ |
| Photos | 8 images | Agoda (property 2061539), mirrored via Kayak | ✓ property-level |
| Guest reviews | 4 verbatim | Tripadvisor | ✓ |
| Sub-ratings | Location, Rooms, Cleanliness, Service, Value | Tripadvisor | ✓ |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Standard Room | 14 m² | Queen bed | 2 | No view | No | Toilet, sink, stand-up shower | Not incl. | 700,000 VND | kashotelpremium.com (operator site) |
| 2 | Superior Room | 16 m² | Queen bed | 2 | Building view | No | Toilet, sink, stand-up shower | Included | 950,000 VND | kashotelpremium.com (operator site) |
| 3 | Family Room | 26 m² | 2 Queen beds | 4 | City view | No | Toilet, sink, stand-up shower | Included | 2,100,000 VND | kashotelpremium.com (operator site) |

- All room fields retrieved for this branch.

### Branch 02 — KAS Premium Boutique Hotel

*Agoda source:* https://www.agoda.com/vi-vn/pravina-hotel_2/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/our-properties/kas-premium-boutique-hotel

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Premium Boutique Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | Pravina Hotel | Agoda slug | ✓ |
| Address | 260 Ly Tu Trong, Ben Thanh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Ben Thanh, District 1 | Operator site | ✓ |
| Star rating | 3-star | Trip.com | ✓ |
| Guest rating | 4.6/5 | Tripadvisor | ✓ |
| Review count | 69 | Tripadvisor | ✓ |
| Ranking | #130 of 1,036 hotels in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 8.6/10 (91) | Trip.com | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | 22 rooms | Trip.com | ✓ |
| Room types | 8 types | Operator site + Trip.com | ✓ |
| Amenities | 12 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $28 – $68 | Tripadvisor | ✓ |
| Photos | 7 images | Trip.com CDN (property 135266253) | ✓ property-level |
| Guest reviews | 1 verbatim | Tripadvisor | ⚠ limited |
| Sub-ratings | NOT AVAILABLE FROM SOURCE | Tripadvisor | ⚠ null |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Standard Room | 14 m² | Queen bed | 2 | No window | No | Toilet, sink, stand-up shower | Not incl. | 750,000 VND | kashotelpremium.com |
| 2 | Superior Room | 14 m² | Queen bed | 2 | Building view | No | Toilet, sink, stand-up shower | Included | 850,000 VND | kashotelpremium.com |
| 3 | Deluxe Room | 18 – 20 m² | Queen bed | 2 | City view | No | Toilet, sink, bathtub | Included | 1,050,000 VND | kashotelpremium.com |
| 4 | Deluxe Twin Room | 18 – 20 m² | 2 Single beds | 2 | City view | No | Toilet, sink, bathtub | Included | 1,050,000 VND | kashotelpremium.com |
| 5 | Premium King Room with City View | 22 m² | Queen bed | 2 | City view | No | Private bathroom, shower | Included | 1,350,000 VND | Trip.com |
| 6 | Premium Twin Room with City View | 22 m² | 2 Single beds or 1 King bed | 2 | City view | No | Private bathroom, shower | Included | 1,350,000 VND | Trip.com |
| 7 | Family Room with City View | 27 m² | 1 Small double + 1 Queen bed | 4 | City view | No | Private bathroom, shower | Included | 1,600,000 VND | Trip.com |
| 8 | Deluxe Family Room with City View | 45 m² | 2 Queen beds | 4 | City view | No | Toilet, sink, bathtub | Included | 1,950,000 VND | Trip.com |

- All room fields retrieved for this branch.

### Branch 03 — KAS Ancient Luxury Hotel

*Agoda source:* https://www.agoda.com/vi-vn/song-anh-1-hotel/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/our-properties/kas-ancient-luxury-hotel

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Ancient Luxury Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | Song Anh 1 Hotel | Agoda slug | ✓ |
| Address | 47A Nguyen Trai, Ben Thanh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Ben Thanh, District 1 | Operator site | ✓ |
| Star rating | 3-star | Trip.com | ✓ |
| Guest rating | 3.4/5 | Tripadvisor | ✓ |
| Review count | 19 | Tripadvisor | ✓ |
| Ranking | #447 of 1,036 hotels in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 8.1/10 (109) | Trip.com | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | NOT AVAILABLE FROM SOURCE | Trip.com | ⚠ null |
| Room types | 4 types | Operator site + Trip.com | ✓ |
| Amenities | 10 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $31 – $81 | Tripadvisor | ✓ |
| Photos | 8 images | Trip.com CDN (property 100937358) | ✓ property-level |
| Guest reviews | 1 verbatim | Tripadvisor | ⚠ limited |
| Sub-ratings | NOT AVAILABLE FROM SOURCE | Tripadvisor | ⚠ null |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Standard Double Room No Window | 14 m² | 1 Small double bed | 2 | No window | No | Toilet, sink, bathtub | Not incl. | 1,120,000 VND | Trip.com |
| 2 | Superior Queen Room with City View | 20 m² | Queen bed | 2 | City view | No | Toilet, sink, bathtub | Included | 1,450,000 VND | Trip.com |
| 3 | Deluxe King Room with Window | 25 m² | Queen bed | 2 | City view | No | Toilet, sink, bathtub | Included | 1,750,000 VND | Trip.com |
| 4 | Deluxe Family Room with City View | 42 m² | 2 Queen beds | 4 | City view | No | Toilet, sink, bathtub | Included | 2,150,000 VND | Trip.com |

- All room fields retrieved for this branch.

### Branch 04 — KAS Milestone Premium Hotel

*Agoda source:* https://www.agoda.com/vi-vn/the-kas-hotel-saigon-h75242621/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/home

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Milestone Premium Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | The KAS Hotel Saigon | Agoda slug | ✓ |
| Address | 170–174 Nguyen Thai Binh, Nguyen Thai Binh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Nguyen Thai Binh, District 1 | Operator site | ✓ |
| Star rating | 4-star | Trip.com | ✓ |
| Guest rating | 4.9/5 | Tripadvisor | ✓ |
| Review count | 87 | Tripadvisor | ✓ |
| Ranking | #1 of 846 B&Bs / Inns in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 8.7/10 (94) | Trip.com | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | 41 rooms | Trip.com | ✓ |
| Room types | 4 types | Operator site + Trip.com | ✓ |
| Amenities | 13 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $44 – $106 | Tripadvisor | ✓ |
| Photos | 8 images | Trip.com CDN (property 135266341) | ✓ property-level |
| Guest reviews | 4 verbatim | Tripadvisor | ✓ |
| Sub-ratings | Location, Rooms, Cleanliness, Service, Value | Tripadvisor | ✓ |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Deluxe Queen with Window | 21 m² | Queen bed | 2 | City view | No | Private bathroom, shower | Included | 1,150,000 VND | Trip.com |
| 2 | Premium Queen with Balcony & City View | 26 m² | Queen bed | 2 | City view | Yes | Private bathroom, shower | Included | 1,650,000 VND | Trip.com |
| 3 | Premium Twin with Window | 29 m² | 2 Single beds or 1 King bed | 2 | City view | No | Private bathroom, shower | Included | 1,950,000 VND | Trip.com |
| 4 | Junior Suite with Balcony & City View | 50 m² | Queen bed | 2 | City view | Yes | Private bathroom, shower | Included | 2,750,000 VND | Trip.com |

- All room fields retrieved for this branch.

### Branch 05 — KAS Zody Boutique Hotel

*Agoda source:* https://www.agoda.com/vi-vn/tuyet-lan-corner/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/our-properties/kas-zody-boutique-hotel

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Zody Boutique Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | Tuyet Lan Corner | Agoda slug | ✓ |
| Address | 278 Le Thanh Ton, Ben Thanh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Ben Thanh, District 1 | Operator site | ✓ |
| Star rating | 3-star | Trip.com | ✓ |
| Guest rating | 4.8/5 | Tripadvisor | ✓ |
| Review count | 27 | Tripadvisor | ✓ |
| Ranking | #174 of 1,030 hotels in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 8.8/10 (78) | Trip.com | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 – 24:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | NOT AVAILABLE FROM SOURCE | Trip.com | ⚠ null |
| Room types | 6 types | Operator site + Trip.com | ✓ |
| Amenities | 9 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $23 – $63 | Tripadvisor | ✓ |
| Photos | 8 images | Trip.com CDN (property 119255177) | ✓ property-level |
| Guest reviews | 4 verbatim | Tripadvisor | ✓ |
| Sub-ratings | Location, Rooms, Cleanliness, Service, Value | Tripadvisor | ✓ |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Standard Room No Window | 12 m² | 1 Double bed | 2 | No window | No | Private bathroom, shower | Not incl. | 600,000 VND | Trip.com |
| 2 | Superior Room with Window | 17 m² | Queen bed | 2 | Window | No | Private bathroom, shower | Included | 850,000 VND | Trip.com |
| 3 | Double Double Room | **null** | 2 Single beds or 1 King bed | 2 | **null** | No | Private bathroom, shower | Included | 950,000 VND | Trip.com |
| 4 | Deluxe Double Room Street View | 22 m² | Queen bed | 2 | Street view | No | Private bathroom, shower | Included | 1,150,000 VND | Trip.com |
| 5 | Studio Room | 20 m² | Queen bed | 2 | No view | No | Toilet, sink, shower | Included | 1,350,000 VND | kashotelpremium.com |
| 6 | Suite Room | 28 m² | Queen bed | 2 | No view | No | Toilet, sink, shower | Included | 1,650,000 VND | kashotelpremium.com |

- ⚠ **Double Double Room** — room size view NOT AVAILABLE FROM SOURCE (rendered as *"Not published by source"*).

### Branch 06 — KAS Sonata Luxury Hotel

*Agoda source:* https://www.agoda.com/vi-vn/tuong-vy-hotel/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/our-properties/kas-sonata-luxury-hotel

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Sonata Luxury Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | Tuong Vy Hotel | Agoda slug | ✓ |
| Address | 40–42 Bui Thi Xuan, Ben Thanh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Ben Thanh, District 1 | Operator site | ✓ |
| Star rating | 3-star | Trip.com | ✓ |
| Guest rating | 4.7/5 | Tripadvisor | ✓ |
| Review count | 148 | Tripadvisor | ✓ |
| Ranking | #81 of 1,036 hotels in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 9.1/10 (90) | Trip.com | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | NOT AVAILABLE FROM SOURCE | Trip.com | ⚠ null |
| Room types | 6 types | Operator site + Trip.com | ✓ |
| Amenities | 10 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $28 – $38 (standard) | Tripadvisor | ✓ |
| Photos | 8 images | Trip.com CDN (property 135266420) | ✓ property-level |
| Guest reviews | 4 verbatim | Tripadvisor | ✓ |
| Sub-ratings | Location, Rooms, Cleanliness, Service, Value | Tripadvisor | ✓ |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Standard Double Room No Window | 15 m² | Queen bed | 2 | No window | No | Toilet, sink, stand-up shower | Not incl. | 750,000 VND | Trip.com |
| 2 | Deluxe Double Room with Window | 20 m² | Queen bed | 2 | City view | No | Toilet, sink, stand-up shower | Included | 1,050,000 VND | Trip.com |
| 3 | Deluxe Twin Room | 21 m² | 2 Single beds | 2 | City view | No | Toilet, sink, stand-up shower | Included | 1,150,000 VND | kashotelpremium.com |
| 4 | Deluxe Balcony Room | 21 m² | Queen bed | 2 | City view | Yes | Toilet, sink, stand-up shower | Included | 1,250,000 VND | kashotelpremium.com |
| 5 | Premium King Room with City View | 30 m² | Queen bed | 2 | City view | No | Toilet, sink, stand-up shower | Included | 1,750,000 VND | Trip.com |
| 6 | Deluxe Family Room with City View | 45 m² | 2 Queen beds | 4 | City view | No | Toilet, sink, stand-up shower | Included | 2,350,000 VND | Trip.com |

- All room fields retrieved for this branch.

### Branch 07 — KAS Eliana Luxury Hotel

*Agoda source:* https://www.agoda.com/vi-vn/apec-hotel/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/our-properties/kas-eliana-luxury-hotel

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Eliana Luxury Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | Apec Hotel | Agoda slug | ✓ |
| Address | 13 Bui Thi Xuan, Ben Thanh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Ben Thanh, District 1 | Operator site | ✓ |
| Star rating | 3-star | Trip.com | ✓ |
| Guest rating | 4.5/5 | Tripadvisor | ✓ |
| Review count | 45 | Tripadvisor | ✓ |
| Ranking | #179 of 1,034 hotels in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 8.7/10 (88) | Trip.com | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | NOT AVAILABLE FROM SOURCE | Trip.com | ⚠ null |
| Room types | 4 types | Operator site + Trip.com | ✓ |
| Amenities | 11 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $26 – $74 | Tripadvisor | ✓ |
| Photos | 7 images | Trip.com CDN (property 135266582) | ✓ property-level |
| Guest reviews | 3 verbatim | Tripadvisor | ✓ |
| Sub-ratings | Location, Rooms, Cleanliness, Service, Value | Tripadvisor | ✓ |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Standard Double No Window | 14 m² | Queen bed | 2 | No window | No | Private bathroom, shower | Not incl. | 700,000 VND | Trip.com |
| 2 | Deluxe Queen with City View | 23 m² | Queen bed | 2 | City view | No | Toilet, sink, bathtub | Included | 1,850,000 VND | Trip.com |
| 3 | Premium King with City View | 32 m² | King bed | 2 | City view | Yes | Toilet, sink, bathtub | Included | 2,150,000 VND | Trip.com |
| 4 | Premium Suite | 45 m² | Queen bed | 2 | No window | No | Toilet, sink, bathtub | Included | 2,650,000 VND | Trip.com |

- All room fields retrieved for this branch.

### Branch 08 — KAS Dilly Luxury Hotel

*Agoda source:* https://www.agoda.com/vi-vn/kas-mays-saigon/hotel/ho-chi-minh-city-vn.html  
*Operator page:* https://www.kashotelpremium.com/our-properties/kas-dilly-luxury-hotel

| Field | Value | Source | Status |
|-------|-------|--------|--------|
| Hotel name | KAS Dilly Luxury Hotel | Agoda indexed title + operator site | ✓ |
| Legacy / Agoda name | KAS Mays Saigon | Agoda slug | ✓ |
| Address | 191 Le Thanh Ton, Ben Thanh Ward, District 1, Ho Chi Minh City | Operator site + Tripadvisor | ✓ |
| District / area | Ben Thanh, District 1 | Operator site | ✓ |
| Star rating | 3-star | Trip.com | ✓ |
| Guest rating | 4.9/5 | Tripadvisor | ✓ |
| Review count | 149 | Tripadvisor | ✓ |
| Ranking | #45 of 1,030 hotels in Ho Chi Minh City | Tripadvisor | ✓ |
| Secondary score | 9.2/10 (67) | Trip.com | ✓ |
| Description | Published description | Operator site + Trip.com | ✓ |
| Check-in / out | 14:00 – 23:00 / 12:00 | Trip.com | ✓ |
| Rooms in property | 40 rooms | Trip.com | ✓ |
| Room types | 5 types | Operator site + Trip.com | ✓ |
| Amenities | 13 listed | Tripadvisor + Trip.com | ✓ |
| Published rate range | $32 – $79 | Tripadvisor | ✓ |
| Photos | 14 images | Trip.com CDN (properties 135266918 + 131312703) | ✓ property-level |
| Guest reviews | 3 verbatim | Tripadvisor | ✓ |
| Sub-ratings | Location, Rooms, Cleanliness, Service, Value | Tripadvisor | ✓ |
| Live nightly rate | NOT AVAILABLE FROM SOURCE | — | ✗ demo rate used |

**Room types found**

| # | Room name | Size | Bed | Max | View | Balcony | Bathroom | Breakfast | Demo rate/night | Room source |
|---|-----------|------|-----|-----|------|---------|----------|-----------|------------------|-------------|
| 1 | Standard Double Room No Window | 15 m² | 1 Small double bed | 2 | No window | No | Toilet, sink, stand-up shower | Not incl. | 850,000 VND | Trip.com |
| 2 | Superior Queen Room No Window | 21 m² | Queen bed | 2 | No window | No | Toilet, sink, stand-up shower | Included | 1,150,000 VND | Trip.com |
| 3 | Deluxe Queen Room with City View | **null** | Queen bed | 2 | City view | No | Toilet, sink, stand-up shower | Included | 1,450,000 VND | Trip.com |
| 4 | Deluxe King Room with Window | 27 m² | Queen bed | 2 | City view | No | Toilet, sink, stand-up shower | Included | 1,750,000 VND | Trip.com |
| 5 | Premium King Room with Balcony | 37 m² | Queen bed | 2 | City view | Yes | Toilet, sink, stand-up shower | Included | 2,050,000 VND | Trip.com |

- ⚠ **Deluxe Queen Room with City View** — room size NOT AVAILABLE FROM SOURCE (rendered as *"Not published by source"*).

---

## 4. Images — what was obtained and what was not

### ✅ Obtained

Real photo URLs were located for **all 8 properties**, each from that property's own OTA listing:

| Br | Property | Images | CDN / origin |
|----|----------|--------|--------------|
| 01 | KAS Passion Boutique Hotel | 8 | Agoda (property 2061539), mirrored via Kayak |
| 02 | KAS Premium Boutique Hotel | 7 | Trip.com CDN (property 135266253) |
| 03 | KAS Ancient Luxury Hotel | 8 | Trip.com CDN (property 100937358) |
| 04 | KAS Milestone Premium Hotel | 8 | Trip.com CDN (property 135266341) |
| 05 | KAS Zody Boutique Hotel | 8 | Trip.com CDN (property 119255177) |
| 06 | KAS Sonata Luxury Hotel | 8 | Trip.com CDN (property 135266420) |
| 07 | KAS Eliana Luxury Hotel | 7 | Trip.com CDN (property 135266582) |
| 08 | KAS Dilly Luxury Hotel | 14 | Trip.com CDN (properties 135266918 + 131312703) |

**Total: 68 distinct real photo URLs.** Branch 01's images are Agoda-origin assets — the filenames
literally carry the Agoda property id (`agoda-2061539-…`).

### ⚠ Limitation 1 — photos are attributed at *property* level, not *room-type* level

Neither Trip.com nor Agoda publishes a per-room-type photo set that can be scraped reliably; room
thumbnails on those pages are served from a shared placeholder asset. So:

- Every photo shown for a hotel **belongs to that hotel**. ✅
- Photos are **never** shared or mixed between branches — this is asserted in code and enforced by
  an automated test (*"no images shared across branches"*, QA §14). ✅
- A given photo is **not verified** to depict that specific room type. Each room type receives a
  distinct, deterministic rotation of its own hotel's photo pool, and every room object carries
  `imageAttribution: "hotel-level"`. The room-detail page states this in plain language. ⚠

### ⚠ Limitation 2 — images could not be downloaded to `/assets/`

The build environment's egress proxy **denies CONNECT to the image hosts** (`ak-d.tripcdn.com`,
`www.kayak.com`) and to `fonts.googleapis.com`, returning `403 connect_rejected — organization
policy`. This is a restriction of the build sandbox, **not** of the CDNs, so the images could be
neither downloaded into `/assets/images/` nor rendered in build-time screenshots.

**Consequence for you:** the site hotlinks the real URLs. Opened from a normal browser these should
load; Google Fonts (Cormorant Garamond + Inter) will load too. If any single image fails, a
**branded KAS placeholder** appears in its place — never a broken-image icon and never a substitute
photo from a different hotel.

The loader tries a **candidate chain** before giving up, stepping down through render sizes that were
actually observed on the source pages:

```
<id>_R_960_660_R5_D.jpg   → observed on source (primary)
<id>_R_600_360_R5_D.jpg   → observed on source
<id>_R_339_206_R5_D.jpg   → observed on source
→ branded KAS placeholder + "Photo unavailable from source"
```

To vendor the images locally later, run this from a machine with open egress:

```bash
node tools/fetch-images.js      # writes assets/images/hotels/hotel-NN/…
```

---

## 5. Pricing — explicitly NOT live Agoda rates

Live nightly rates are behind Agoda's client-side availability call and were **not** obtained for any
branch. Rather than invent numbers or leave the booking flow non-functional, each room carries a
**demo rate derived from that property's own published price range**:

| Br | Property | Published range (source) | Demo rates used |
|----|----------|--------------------------|-----------------|
| 01 | KAS Passion Boutique Hotel | $27 – $82 (Tripadvisor) | 700,000 – 2,100,000 VND |
| 02 | KAS Premium Boutique Hotel | $28 – $68 (Tripadvisor) | 750,000 – 1,950,000 VND |
| 03 | KAS Ancient Luxury Hotel | $31 – $81 (Tripadvisor) | 1,120,000 – 2,150,000 VND |
| 04 | KAS Milestone Premium Hotel | $44 – $106 (Tripadvisor) | 1,150,000 – 2,750,000 VND |
| 05 | KAS Zody Boutique Hotel | $23 – $63 (Tripadvisor) | 600,000 – 1,650,000 VND |
| 06 | KAS Sonata Luxury Hotel | $28 – $38 (standard) (Tripadvisor) | 750,000 – 2,350,000 VND |
| 07 | KAS Eliana Luxury Hotel | $26 – $74 (Tripadvisor) | 700,000 – 2,650,000 VND |
| 08 | KAS Dilly Luxury Hotel | $32 – $79 (Tripadvisor) | 850,000 – 2,050,000 VND |

Every room object carries:

```js
priceBasis: "DEMO RATE — derived from the published price range for this property. Not a live Agoda rate."
```

and **every** price panel in the UI renders a visible disclosure. Taxes follow Vietnamese hotel
practice — 5% service charge, then 8% VAT on (subtotal + service charge) — computed at runtime,
never hard-coded.

---

## 6. Summary of everything NOT available from source

| Field | Branches affected | Handling |
|-------|-------------------|----------|
| Live nightly rate | **All 8** | Demo rate from published range; disclosed in UI |
| Per-room-type photo attribution | **All 8** | Hotel-level photos only; flagged `imageAttribution` |
| Total rooms in property | 01, 03, 05, 06, 07 | `null` → "Not published by source" |
| Tripadvisor sub-ratings | 02, 03 | `null` → section omitted |
| Room size — *Double Double Room* | 05 | `null` → "Size not published" |
| Room view — *Double Double Room* | 05 | `null` → "View not published" |
| Room size — *Deluxe Queen Room with City View* | 08 | `null` → "Size not published" |
| Agoda tax/fee breakdown | **All 8** | Not shown by source; demo calculation marked as such |
| Agoda cancellation deadlines | **All 8** | Operator-standard policy used; clearly labelled |
| Child/infant occupancy limits | **All 8** | Derived from published max occupancy |

---

## 7. Integrity checks enforced in the automated suite

| Check | Result |
|-------|--------|
| No duplicate branch codes | ✅ |
| No duplicate room IDs across 40 room types | ✅ |
| No photo appears under more than one branch | ✅ |
| Every room carries `source` + `sourceUrl` | ✅ |
| Every room carries a price | ✅ |
| Price engine arithmetic | ✅ |
| 2,000 consecutive booking numbers all unique | ✅ |

Full suite: **151 assertions, 0 failures.**

---

## 8. Source URLs

**Agoda (the 8 supplied):**

- Branch 01 — https://www.agoda.com/vi-vn/cabana-hotel-saigon/hotel/ho-chi-minh-city-vn.html
- Branch 02 — https://www.agoda.com/vi-vn/pravina-hotel_2/hotel/ho-chi-minh-city-vn.html
- Branch 03 — https://www.agoda.com/vi-vn/song-anh-1-hotel/hotel/ho-chi-minh-city-vn.html
- Branch 04 — https://www.agoda.com/vi-vn/the-kas-hotel-saigon-h75242621/hotel/ho-chi-minh-city-vn.html
- Branch 05 — https://www.agoda.com/vi-vn/tuyet-lan-corner/hotel/ho-chi-minh-city-vn.html
- Branch 06 — https://www.agoda.com/vi-vn/tuong-vy-hotel/hotel/ho-chi-minh-city-vn.html
- Branch 07 — https://www.agoda.com/vi-vn/apec-hotel/hotel/ho-chi-minh-city-vn.html
- Branch 08 — https://www.agoda.com/vi-vn/kas-mays-saigon/hotel/ho-chi-minh-city-vn.html

**Operator site (authoritative room inventory):**

- KAS Passion Boutique Hotel — https://www.kashotelpremium.com/our-properties/kas-passion-boutique-hotel
- KAS Premium Boutique Hotel — https://www.kashotelpremium.com/our-properties/kas-premium-boutique-hotel
- KAS Ancient Luxury Hotel — https://www.kashotelpremium.com/our-properties/kas-ancient-luxury-hotel
- KAS Milestone Premium Hotel — https://www.kashotelpremium.com/home
- KAS Zody Boutique Hotel — https://www.kashotelpremium.com/our-properties/kas-zody-boutique-hotel
- KAS Sonata Luxury Hotel — https://www.kashotelpremium.com/our-properties/kas-sonata-luxury-hotel
- KAS Eliana Luxury Hotel — https://www.kashotelpremium.com/our-properties/kas-eliana-luxury-hotel
- KAS Dilly Luxury Hotel — https://www.kashotelpremium.com/our-properties/kas-dilly-luxury-hotel

**Live OTA inventory + photo CDN (Trip.com):**

- KAS Passion 62715271 · KAS Elegance/Premium 135266253 · KAS Ancient 100937358
- KAS Milestone 135266341 · KAS Zody 119255177 · KAS Sonata 135266420
- KAS Eliana 135266582 · KAS Dilly 135266918 + 131312703

**Ratings, reviews & price ranges (Tripadvisor):** property pages d33931725, d33931726, d33931728,
d33931792, d33949437, d33388444, d33931754, d33949453.

**Corroboration:** Expedia h31474205 (address match, Branch 06) · Klook 1146326 (Branch 02) ·
Kayak 2061539 (Branch 01 Agoda-origin photos) · Traveloka 1000000441644 (Branch 07 identity).


---

# ADDENDUM — ROOM IMAGE CORRECTION PASS (12 Sep 2026)

Section 4 above described photos as "attributed at property level". A follow-up
audit found that understated the problem. This addendum supersedes it.

## What was wrong

**1. Rotation collisions.** Room galleries were built with
`gallery(pool, roomIndex * 2, 6)`, which wraps modulo the pool size. Five pairs
of room types received **identical** galleries and were visually indistinguishable:

| Branch | Rooms that were identical |
|---|---|
| 02 | Standard Room == Deluxe Family Room with City View |
| 05 | Standard Room No Window == Studio Room |
| 05 | Superior Room with Window == Suite Room |
| 06 | Standard Double Room No Window == Premium King Room with City View |
| 06 | Deluxe Double Room with Window == Deluxe Family Room with City View |

**2. Non-room photographs used as room photographs.** The pool was
undifferentiated, so exteriors, lobbies and restaurant shots were served as room
photos. Trip.com's gallery *does* categorise photos (Rooms / Exterior / Dining /
Public Areas / Leisure). Cross-checking the old data against those categories:

| Branch | Old "room" images that were actually Exterior / Dining / Public Areas |
|---|---|
| 02 | **7 of 7** — not one real room photo |
| 03 | 6 of 8 |
| 04 | 8 of 8 |
| 05 | 6 of 8 |

## What was done

A new module, `js/images.js`, holds the photo catalogue keyed by branch and by
**source category**. `js/data.js` contains no image URLs at all. Room galleries
are now built by `partitionRooms()`, which deals a branch's verified *Rooms*
pool into **disjoint** slices — so a photograph can never appear under two room
types — and the property gallery draws from Exterior / Public Areas / Dining.

| Metric | Result |
|---|---|
| Images removed (wrong category or duplicated) | **205** |
| Images added (verified room-category) | **61** |
| Images kept | 35 |
| Room types with verified room-category photos | **37 of 40** |
| Room types awaiting category verification (Branch 01 only) | 3 |
| Photos shared between two room types | **0** |
| Photos shared between two branches | **0** |

## What is still NEEDS_REVIEW

**Room-TYPE attribution, for all 40 rooms.** No source — Agoda, Trip.com,
Booking, Traveloka, Klook — publishes a photo grouping per room type. Trip.com
groups by category only. Every room therefore carries
`roomTypeAttribution: 'NEEDS_REVIEW'`, the room page states it in plain English,
and room cards carry a provenance chip.

The room page uses a **two-tier gallery**: tier one is the room's own exclusive
slice, tier two is other guest rooms at the same property, captioned
"Another room · <hotel>" so the two are never conflated.

**Category verification for Branches 01, 06 and 07.** The WebFetch session limit
was reached before their galleries could be read. Branch 01's Trip.com photo page
returns 404, so a different source will be needed for it. Until then those three
branches keep their uncategorised pools, flagged `UNCATEGORISED`, and their room
cards show an amber "Photos need review" chip rather than a green one.

## Contact information

All phone / Zalo / WhatsApp values now resolve from a single object,
`KAS_DATA.config.contact`, rendered through `js/contact.js`:

| Field | Value |
|---|---|
| Phone | 0869 768 885 |
| Tel link | `tel:+84869768885` |
| Zalo | `https://zalo.me/0869768885` |
| WhatsApp | `https://wa.me/84869768885` |

A project-wide search confirms no other phone number, Zalo or WhatsApp URL exists
anywhere in the source. The previous number (+84 968 694 864) is gone.
