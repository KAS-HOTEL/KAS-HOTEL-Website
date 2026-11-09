# 65 — Phase 5 Information Architecture

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval
**Relationship to Phase 1.5:** [18](18-information-architecture-v2.md)–[22](22-url-architecture.md)
remain authoritative for **sitemap, URLs and SEO**. This document resolves the Phase 5 navigation
brief against them and records one naming decision.
**Last updated:** 2026-08-14

---

## 1. IA areas vs navigation items

**CONFIRMED direction** — Design around: Home · Stays/8 Properties · Property Detail · Rooms ·
Experiences · About KAS · Reviews · Location/Explore · Account · Booking/Your Stay. **And: do not
create unnecessary top-level categories.**

**PROPOSED — the resolution.** Those ten are **IA areas**, not ten navigation items. Ten primary nav
items would contradict both the instruction and the Classic Luxury principle. They map as follows:

| # | IA area | Surface | In primary nav? |
|---|---|---|---|
| 1 | Home | `/` | Logo |
| 2 | Stays / 8 Properties | `/hotels` | **✔ Yes** |
| 3 | Property Detail | `/hotels/{slug}` | Via 2 and the panel |
| 4 | Rooms | `/hotels/{slug}/rooms` | Contextual within a property |
| 5 | Experiences | `/experiences` | **✔ Yes** |
| 6 | About KAS | `/about` | **✔ Yes** |
| 7 | Reviews | `/reviews` + per-property | Footer + property pages |
| 8 | Location / Explore | `/locations` | **✔ Yes** |
| 9 | Account | `/account` | Utility (icon) |
| 10 | Booking / Your Stay | `/search`, `/stay` | The persistent stay control |

**Five primary items. Everything else is reached contextually or from the footer.**

---

## 2. The naming decision — "Hotels" vs "Stays"

**NEEDS CONFIRMATION — OQ-084.** The Phase 5 brief offers "STAYS / 8 PROPERTIES"; Phase 1.5
([20](20-customer-navigation.md) §2) froze **Hotels**.

| Option | For | Against |
|---|---|---|
| **Hotels** *(recommended)* | What guests actually search · matches the frozen URL `/hotels` · unambiguous in both languages (*Khách sạn*) | Slightly plainer |
| **Stays** | Warmer, more modern-hospitality | Ambiguous with "Your Stay" (the booking basket) and "My Stays" (the account section) — **three different meanings of one word** |
| **The Collection** | Most editorial | Poor for search; unclear to a first-time visitor |

**PROPOSED recommendation: keep `Hotels` as the navigation label; use "The KAS Collection" as the
page's editorial H1.** This gets the search clarity and the editorial framing without collision.

**CONFIRMED constraint** — The URL `/hotels` is frozen in [22](22-url-architecture.md) and does not
change regardless of the label chosen. Slugs are immutable after publish.

---

## 3. Primary navigation

**PROPOSED** — Refines [20](20-customer-navigation.md) §2 with the Phase 5 additions.

```
┌────────────────────────────────────────────────────────────────────────┐
│  KAS      Hotels ▾   Locations   Experiences   About                   │
│                                    VI│EN   ₫│$   Account   [ Stay ]    │
└────────────────────────────────────────────────────────────────────────┘
```

| Item | Earns its slot because |
|---|---|
| **Hotels** ▾ | The portfolio is the product. The panel makes eight properties legible at a glance |
| **Locations** | District and proximity are the strongest decision factors for a city hotel |
| **Experiences** | Serves the Local Heritage pillar and carries Milestone's rooftop and dining without distorting the brand around one property |
| **About** | The brand thesis is service; this is where it is argued. Contains Story and Service Promise |
| ~~Offers~~ | **Moved to the footer.** Shown in nav only when an offer is active — a permanently empty item reads as a broken promise |
| ~~Contact~~ | **Moved to the footer**, with the phone number surfaced on every booking-path error and status screen instead — more useful than a nav item |

**PROPOSED — the change from Phase 1.5:** Offers and Contact leave the primary nav; Experiences enters.
Net still five. Contact is *more* reachable, not less: in a request model the phone number belongs
beside the moments of uncertainty, not in a menu.

### 3.1 The Hotels panel

All eight, generated from data, ordered `isFlagship` then `sortOrder`. Thumbnail + name + signature
line. Milestone first with a slightly larger thumbnail — **placement is the only emphasis; no "Best"
or "Premium tier" label**. Panel footer: *Compare hotels · See them on a map · Coming soon*.

### 3.2 The stay control

Context-aware, quiet, bordered — not a saturated button.

| State | Label | Action |
|---|---|---|
| No search yet | **Find your stay** | Opens the search panel |
| Search active | **12–14 Sep · 2 guests** | Reopens, pre-filled |
| Rooms selected | **Your Stay · 3 rooms** | → `/stay` |

---

## 4. Page inventory

**PROPOSED** — Phase 5 view. Sitemap and URLs are authoritative in [19](19-sitemap.md) and
[22](22-url-architecture.md).

| Page | Path | Job | Priority |
|---|---|---|---|
| Home | `/` | Establish KAS as a real 8-property group; open the funnel | ★★★ |
| **The Collection** | `/hotels` | Curated discovery of eight distinct properties | ★★★ |
| Property detail | `/hotels/{slug}` | Persuade; convert to room selection | ★★★ |
| Room list | `/hotels/{slug}/rooms` | Room choice with live availability | ★★★ |
| Room type detail | `/hotels/{slug}/rooms/{rt}` | Full room product | ★★ |
| Search results | `/search` | Date-scoped availability across the portfolio | ★★★ |
| Your Stay | `/stay` → `/details` → `/review` → `/sent/{ref}` | The request flow | ★★★ |
| Locations / Explore | `/locations` | Place-first discovery; Saigon context | ★★ |
| Experiences | `/experiences` | Portfolio-wide experiences incl. flagship | ★★ |
| Property gallery | `/hotels/{slug}/gallery` | Immersive browsing | ★ |
| Property reviews | `/hotels/{slug}/reviews` | Trust | ★★ |
| Reviews (portfolio) | `/reviews` | Trust; SEO | ★ |
| About · Story · Service Promise | `/about`, `/about/story`, `/about/service` | Brand thesis; explains the request model as a benefit | ★★ |
| Offers | `/offers` | Direct advantage | ★ |
| Contact · FAQ · Policies | `/contact`, `/faq`, `/policies/*` | Trust and legal | ★ |
| Account (My KAS) | `/account/**` | Track, manage, review | ★★ |
| Track request | `/track/{token}` | Guest status without an account | ★★ |

---

## 5. Entry points and paths

**PROPOSED** — Four intents, all served.

| Intent | Path |
|---|---|
| **Date-first** — "I need 12–14 Sep" | Home search → `/search` → property → rooms → Your Stay |
| **Place-first** — "near Ben Thanh" | Home or `/locations` → property → rooms |
| **Property-first** — "which KAS hotel?" | Nav panel or `/hotels` → property → rooms |
| **Brand-first** — "who is KAS?" | Home → About/Story → `/hotels` |

**PROPOSED — the structural decision, carried from Phase 1.5 and reaffirmed:** `/hotels` and `/search`
are **two pages with two jobs**, not one page in two modes.

- **`/hotels` — The Collection.** Editorial, evergreen, indexable, dateless. Where the eight have
  character.
- **`/search` — Availability.** Transactional, date-scoped, not indexed. Where a guest with dates gets
  answers.

At eight properties KAS can afford both, and merging them would force the editorial page to carry
transactional clutter or the availability view to lose the storytelling.

---

## 6. Depth and orientation

Maximum meaningful depth is **4**, only on the room path:

```
Home (0) → Hotels (1) → Property (2) → Rooms (3) → Room type (4)
```

Every commercially important page is within **three clicks** of home; the booking path from any
property page is **two steps**.

**Breadcrumbs** appear on the property path only ([20](20-customer-navigation.md) §5) — elsewhere depth
never exceeds two levels and a breadcrumb is noise.

---

## 7. Global elements

| Element | Behaviour |
|---|---|
| **Header** | Sticky, condensing on scroll to logo · Hotels ▾ · stay control · account |
| **Stay control** | Persistent; carries search context everywhere |
| **Mobile bottom bar** | Context-aware; the primary navigation on mobile ([71](71-phase-5-responsive-accessibility.md)) |
| **Footer** | Five columns: Our Hotels (all 8 + Coming Soon) · Discover · Your Stay · Policies · KAS |
| **Language / currency** | Utility cluster and mobile menu. Explicit choice always wins |
| **Skip link** | First focusable element on every page |

---

## 8. Context persistence

**PROPOSED** — The single most important rule: **once a guest enters dates, they never enter them
again.**

| State | Persists | Lifetime |
|---|---|---|
| Search context (dates, guests, rooms) | URL + session | Session, restored on return |
| Your Stay selection | Server (signed in) / local (guest) | 24h, **warned before expiry, never silently emptied** |
| Language, currency | Cookie + account | Permanent |
| Recently viewed property | Session | Session |
| Filters | URL | Shareable |

---

## 9. What this IA deliberately excludes

| Excluded | Reason |
|---|---|
| A "Deals" or "Last minute" section | Discount-led surfaces contradict the premium positioning |
| Per-amenity landing pages | Thin; at n=8 each would list one or two hotels |
| A public availability calendar | Encourages date-shopping and exposes inventory patterns |
| A blog | No content supply exists; thin pages harm SEO |
| Loyalty as a live nav item | No programme exists (OQ-041). A **placeholder** is designed in [66](66-phase-5-customer-experience.md) §9 but is not navigable in V1 |
| Multi-property basket | One property per request ([57](57-phase-4-reservation-sales.md) §2.1) |

---

## 10. Open items

| ID | Question | Recommendation |
|---|---|---|
| **OQ-084** | Nav label: "Hotels" vs "Stays" | **Hotels** in nav, "The KAS Collection" as the page H1 |
| OQ-009 | Property collections vs tiers | Non-hierarchical collections; blocks the character filter |
| OQ-060 | Which districts the 8 properties occupy | Blocks the Locations design and district filtering |
| OQ-041 | Loyalty programme | Placeholder only; not navigable in V1 |
