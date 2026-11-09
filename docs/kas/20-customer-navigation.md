# 20 — Customer Navigation

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Navigation philosophy

**PROPOSED** — Classic Luxury × Modern Hospitality expressed as navigation:

| Classic Luxury contributes | Modern Hospitality contributes |
|---|---|
| Few items, generous spacing, calm hierarchy | One always-available booking entry |
| Restraint — nothing added without reason | Fast, obvious, no hunting |
| The brand mark has room to breathe | Context follows the guest (dates persist) |
| No promotional clutter | Mobile equal to desktop, not lesser |

**The governing rule:** *the navigation gets smaller as the guest gets closer to requesting.* Brand
pages have full navigation; the request flow has almost none. Every exit offered during Your Stay is
an invitation to abandon.

---

## 2. Desktop primary navigation

**PROPOSED**

```
┌───────────────────────────────────────────────────────────────────────────┐
│  KAS      Hotels ▾   Locations   Offers   About   Contact                 │
│                                        VI│EN   ₫│$   Account   [ Stay ]   │
└───────────────────────────────────────────────────────────────────────────┘
```

**Five primary items.** Not six, not nine.

| Item | Destination | Why it earns a slot |
|---|---|---|
| **Hotels** ▾ | `/hotels` + rich panel | The portfolio is the product. The panel makes eight properties legible at a glance |
| **Locations** | `/locations` | District and proximity are the strongest decision factors for a city hotel |
| **Offers** | `/offers` | A direct-booking advantage needs a home. Hidden if no offers are active |
| **About** | `/about` | The brand thesis is service; this is where it is argued |
| **Contact** | `/contact` | In a request-based model, the human channel is a primary path, not a footer link |

**Utility cluster (right):** language, currency, account, and the stay action. Visually lighter than
the primary items.

### 2.1 The Hotels panel

**PROPOSED** — A single rich panel, not a multi-column mega menu.

```
┌──────────────────────────────────────────────────────────────────────┐
│  OUR HOUSES                                        View all eight →  │
│                                                                      │
│  [img] KAS Milestone Premium Hotel      [img] KAS Zody Boutique      │
│        Rooftop, restaurant and gym            …signature line        │
│                                                                      │
│  [img] KAS Passion Boutique Hotel       [img] KAS Sonata Luxury      │
│  [img] KAS Elegance Hotel               [img] KAS Eliana Luxury      │
│  [img] KAS Ancient Boutique Hotel       [img] KAS Dilly Hotel        │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────   │
│  Compare hotels  ·  See them on a map  ·  Coming soon                │
└──────────────────────────────────────────────────────────────────────┘
```

**PROPOSED — panel rules:**
- All eight listed. Never "top 4 + view all" — that ranks KAS's own properties.
- Milestone appears **first** (flagship placement weight) with a slightly larger thumbnail. It is
  never labelled "Best", "Premium tier", or "Recommended" — placement is the only emphasis.
- Each entry: thumbnail, name, signature line. Enough to differentiate, not enough to replace the
  property page.
- Generated from data, ordered by `isFlagship` then admin `sortOrder`. A ninth property appears
  automatically.
- `COMING_SOON` properties appear only in the footer link of the panel, never in the main list.
- Opens on hover **and** on click/focus; fully keyboard operable; closes on `Escape`.

### 2.2 The stay action — `[ Stay ]`

**PROPOSED** — The persistent booking entry. Its label and behaviour change with context:

| State | Label | Action |
|---|---|---|
| No search yet | **Find your stay** | Opens the search panel |
| Search active | **12–14 Sep · 2 guests** | Reopens the search panel, pre-filled |
| Rooms selected | **Your Stay · 3 rooms** | Goes to `/stay` |

**PROPOSED** — It is a quiet, bordered control, not a saturated call-to-action button. The premium
signal is confidence, not volume.

### 2.3 Scroll behaviour

**PROPOSED** — On scroll the header condenses to: logo · Hotels ▾ · stay action · account. Locations,
Offers, About and Contact fold into the Hotels panel footer. This keeps booking intent permanently
reachable while removing visual weight from an image-led page.

---

## 3. Mobile navigation

**CONFIRMED direction** — Do not assume desktop navigation collapses into a hamburger.

**PROPOSED** — Mobile uses **three separate mechanisms**, each for a different job.

### 3.1 Header — orientation

```
┌─────────────────────────────────┐
│  ☰      K A S      ⌕      ◔     │
└─────────────────────────────────┘
   menu   brand    search  account
```

Four controls. The search icon is separate from the menu because search is a *task*, not a
*destination*, and burying it costs conversion.

### 3.2 Bottom bar — action

**PROPOSED** — Context-aware, one bar, always the single most useful next action. Full mapping in
[18](18-information-architecture-v2.md) §7.1.

```
┌─────────────────────────────────┐
│  From 1.850.000 ₫    View rooms │
└─────────────────────────────────┘
```

This — not the hamburger — is the primary navigation on mobile. It carries the guest through the
funnel without requiring a menu at all.

### 3.3 Menu overlay — everything else

**PROPOSED** — Full-screen, **one level deep**. No accordions, no nested drawers. Nested mobile menus
are a leading cause of subcategory abandonment.

```
┌─────────────────────────────────┐
│  ✕                              │
│                                 │
│  Our Hotels                     │
│  ──────────────────────────     │
│   Milestone Premium             │
│   Passion Boutique              │
│   Elegance                      │
│   Ancient Boutique              │
│   Zody Boutique                 │
│   Sonata Luxury                 │
│   Eliana Luxury                 │
│   Dilly                         │
│                                 │
│  Discover                       │
│  ──────────────────────────     │
│   Locations                     │
│   Compare hotels                │
│   Offers                        │
│   Our story                     │
│                                 │
│  Guest                          │
│  ──────────────────────────     │
│   Sign in / My stays            │
│   Contact                       │
│   FAQ                           │
│                                 │
│  Tiếng Việt · English           │
│  ₫ VND · $ USD                  │
└─────────────────────────────────┘
```

**PROPOSED** — All eight hotels listed directly. On a site with eight properties, a "Hotels →"
submenu that leads to a second screen of eight names adds a tap and gains nothing.

### 3.4 Mobile search

**PROPOSED** — Full-screen sequential, one decision per screen: **Where → When → Who → Search**.
The date step is a single scrollable month column with large touch targets — never a shrunken
desktop calendar, which is the classic accommodation-booking mobile failure.

---

## 4. Footer navigation

**PROPOSED** — Five columns. Comprehensive without being a link farm.

| Our Hotels | Discover | Your Stay | Policies | KAS |
|---|---|---|---|---|
| All eight, by name | Locations | Find your stay | Booking terms | Contact |
| Compare hotels | Our story | My stays | Cancellation ⚠ | Careers *(future)* |
| Coming soon | Service promise | Track a request | Privacy | Press *(future)* |
| — | Offers | FAQ | Terms of use | Zalo · Facebook · Instagram |
| — | Experiences | Reviews | Cookies | — |

**Footer base:** legal entity name, business registration and tax code (**NEEDS CONFIRMATION** —
OQ-021), registered address, language switch, currency switch, copyright.

⚠ Cancellation link is present in the structure but the page cannot publish until OQ-045 is answered.

---

## 5. Breadcrumbs

**PROPOSED** — Breadcrumbs appear on **exactly one path**: the property hierarchy. Depth elsewhere
never exceeds two levels, where a breadcrumb is visual noise.

| Page | Breadcrumb |
|---|---|
| Property detail | Home / Hotels / **KAS Milestone Premium Hotel** |
| Room list | Home / Hotels / KAS Milestone Premium Hotel / **Rooms** |
| Room type detail | Home / Hotels / Milestone Premium / Rooms / **Deluxe Room** |
| Property gallery | Home / Hotels / KAS Milestone Premium Hotel / **Gallery** |
| Property reviews | Home / Hotels / KAS Milestone Premium Hotel / **Reviews** |
| District landing | Home / Locations / **District 1** |
| Offer detail | Home / Offers / **{Offer name}** |
| Policy page | Home / Policies / **Booking terms** |

**Not used on:** search, Your Stay and the request flow (linear, and exits are a liability), account
(flat, one level), or brand pages (two levels at most).

**PROPOSED — implementation notes:**
- Property names truncate mid-crumb on narrow screens ("Milestone Premium"), full name in the final
  crumb and in the structured data.
- Paired with server-rendered `BreadcrumbList` structured data. Visible breadcrumbs plus schema is a
  well-evidenced, low-cost organic improvement and improves search-result presentation.
- Mobile: single-line, horizontally scrollable, current page bold and not a link.
- Breadcrumbs reflect **site hierarchy**, never navigation history.

---

## 6. Contextual navigation

**PROPOSED** — Lateral movement, offered where the guest is likely to be deciding rather than lost.

| Page | Contextual navigation |
|---|---|
| Property detail | Anchored sub-nav on scroll: **Overview · Rooms · Location · Reviews** (four, not fourteen) |
| Property detail (foot) | "Other KAS hotels" — 3 properties, neutral order, never "better" or "cheaper" |
| Room type detail | Other room types at this property, plus "Back to all rooms" |
| Search results | "Adjust dates" · "See on map" · "Compare" |
| Locations | District chips; property list synchronised with the map |
| Offer detail | Properties the offer applies to |
| Review pages | Filter by property; sort by recency or rating |
| Article/story pages | "Explore the hotels" |
| Account | Persistent left rail (desktop) / list (mobile) |
| **Your Stay & request flow** | **None.** Only: back one step, and edit the current selection |

---

## 7. Navigation labels — Vietnamese and English

**PROPOSED** — Vietnamese strings require a native copywriter review before implementation
(**NEEDS CONFIRMATION** — OQ-061). They are proposed here so the IA is complete and reviewable, not
because they are final.

| Concept | English | Vietnamese (proposed) |
|---|---|---|
| Hotels | Hotels | Khách sạn |
| Our Houses *(panel title)* | Our Houses | Hệ thống khách sạn |
| Locations | Locations | Vị trí |
| Offers | Offers | Ưu đãi |
| About | About | Về KAS |
| Our Story | Our Story | Câu chuyện KAS |
| Service Promise | Service Promise | Cam kết dịch vụ |
| Contact | Contact | Liên hệ |
| Compare hotels | Compare hotels | So sánh khách sạn |
| Coming soon | Coming soon | Sắp khai trương |
| Find your stay | Find your stay | Tìm kỳ nghỉ |
| Check availability | Check availability | Kiểm tra phòng trống |
| View rooms | View rooms | Xem phòng |
| Rooms | Rooms | Loại phòng |
| Available rooms | Available rooms | Số phòng còn trống |
| Add to Your Stay | Add to Your Stay | Thêm vào kỳ nghỉ |
| **Your Stay** | **Your Stay** | **Kỳ nghỉ của bạn** |
| **Request This Stay** | **Request This Stay** | **Gửi yêu cầu đặt phòng** |
| Your Details | Your Details | Thông tin của bạn |
| Estimated total | Estimated total | Tạm tính |
| Booking request | Booking request | Yêu cầu đặt phòng |
| Request status | Request status | Trạng thái yêu cầu |
| Track a request | Track a request | Theo dõi yêu cầu |
| My Stays | My Stays | Kỳ nghỉ của tôi |
| Upcoming | Upcoming | Sắp tới |
| Requests | Requests | Đang chờ xác nhận |
| Past stays | Past stays | Đã hoàn tất |
| Stay details | Stay details | Chi tiết kỳ nghỉ |
| Notifications | Notifications | Thông báo |
| Reviews | Reviews | Đánh giá |
| Write a review | Write a review | Viết đánh giá |
| Verified Stay | Verified Stay | Đã xác thực lưu trú |
| Profile | Profile | Hồ sơ |
| Preferences | Preferences | Tùy chọn |
| Security | Security | Bảo mật |
| Sign in | Sign in | Đăng nhập |
| Create account | Create account | Tạo tài khoản |
| Nearby | What's around you | Xung quanh bạn |
| Good to know | Good to know | Thông tin cần biết |

### 7.1 Label rules

**PROPOSED**

1. **Never** use *Book Now*, *Pay Now*, *Confirm Booking*, *Checkout*, *Cart*, or *Basket* — in any
   language, on any surface, in any analytics event name.
2. *Reservation* / *Booking* describe a stay only **after** it reaches confirmed status. Before that
   it is a **request**.
3. Vietnamese labels are written natively, not translated from English. *"Kỳ nghỉ của bạn"* must read
   naturally to a Vietnamese guest — that is a copywriting judgement, not a translation task.
4. One concept, one label, everywhere: UI, email, notifications, and admin's guest-visible text all
   draw from the same catalogue.
5. Sentence case throughout. No ALL CAPS navigation — it reads as shouting and harms Vietnamese
   diacritic legibility.

---

## 8. Navigation state and context persistence

**PROPOSED** — What the navigation must remember, and for how long.

| State | Persists | Lifetime | Surfaces |
|---|---|---|---|
| Search context (dates, guests, rooms) | URL + session | Session, restored on return | Header stay control, sticky bars, all property/room pages |
| Your Stay contents | Server (signed in) / local (guest) | 24h, with warning before expiry | Header, bottom bar, `/stay` |
| Language | Cookie + account preference | Permanent, explicit choice always wins | Everywhere |
| Currency display | Cookie + account preference | Permanent | Every price |
| Last viewed property | Session | Session | "Continue exploring" on return |
| Recent searches | Local | 30 days | Search panel |
| Filters | URL | Shareable | Hotels, Search |

**PROPOSED** — The single most important rule: **once a guest has entered dates, they never enter
them again.** Dates travel with them through discovery, property pages, room selection, and into Your
Stay. Re-asking is the most common avoidable friction in hotel booking.

---

## 9. Accessibility requirements for navigation

**PROPOSED**

- Skip-to-content link as the first focusable element
- The Hotels panel is fully keyboard operable: opens on focus, arrow-key navigable, closes on `Escape`,
  focus returns to the trigger
- Mobile overlay traps focus while open and restores it on close
- Current page marked with `aria-current`
- Breadcrumbs in a `<nav aria-label>` with an ordered list
- Bottom sticky bar does not obscure focused elements; sufficient bottom padding on scrollable content
- All controls reachable by keyboard in a logical order; visible focus states meeting contrast
- Tap targets ≥ 44 × 44 px
- Language switch announces the target language **in that language** (*Tiếng Việt*, not "Vietnamese")
