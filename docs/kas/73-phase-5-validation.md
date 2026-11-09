# 73 — Phase 5 Validation

**Phase:** 5 — UX / UI Experience Design
**Status:** Validation executed 2026-08-14
**Last updated:** 2026-08-14

---

## 1. Validation results — 17 / 17 PASS

| # | Check | Result | Where satisfied |
|---|---|:--:|---|
| 1 | Customer can discover all 8 properties | **PASS** | Nav panel lists all eight from data · homepage collection band · `/hotels` · footer · `/locations` — [65](65-phase-5-information-architecture.md) §3.1, [66](66-phase-5-customer-experience.md) §2.3, §3 |
| 2 | Customer can compare properties meaningfully | **PASS** | Compare up to three, neutral presentation, "Not at this property" never a red cross — [66](66-phase-5-customer-experience.md) §3.3 |
| 3 | Customer can find rooms | **PASS** | Room list with search context, room cards, room detail — [67](67-phase-5-property-room-experience.md) §3–4 |
| 4 | Room quantity visible, **no physical room numbers** | **PASS** | "6 rooms available for your dates". The public room-type response has **no field capable of carrying a room number** — [67](67-phase-5-property-room-experience.md) §3.1, [58](58-phase-4-api-contract.md) §9 |
| 5 | Customer can select multiple rooms | **PASS** | Bounded stepper `[−] 2 [+]` — [67](67-phase-5-property-room-experience.md) §3.2 |
| 6 | Customer can select multiple room types | **PASS** | Multiple lines in one Your Stay — [68](68-phase-5-booking-experience.md) §3 |
| 7 | Booking journey matches the Phase 4 contract | **PASS** | 9 steps mapped to `salesStatus`/`stayStatus` — [68](68-phase-5-booking-experience.md) §1 |
| 8 | Internal sales states hidden | **PASS** | Guest vocabulary table; **the guest never sees `WON`** — [68](68-phase-5-booking-experience.md) §6.1 |
| 9 | OTA never presented as Direct Sales | **PASS** | Sales queue filtered `channelType = DIRECT` at the data layer; OTA lives in Distribution — [69](69-phase-5-admin-experience.md) §4, §6 |
| 10 | Admin manages property / room / facility media | **PASS** | UPLOAD → ASSIGN → ORDER → COVER → ALT TEXT → DRAFT → PUBLISH — [69](69-phase-5-admin-experience.md) §7 |
| 11 | Reviews respect eligibility | **PASS** | Completed stay only, channel-agnostic; moderation states hidden from guests — [66](66-phase-5-customer-experience.md) §8 |
| 12 | Milestone flagship experiences represented | **PASS** | Homepage band · featured position · Dining / Rooftop / Wellness blocks · Experiences page — [67](67-phase-5-property-room-experience.md) §2 |
| 13 | Mobile intentionally designed | **PASS** | Three separate navigation mechanisms; per-surface behaviour table — [71](71-phase-5-responsive-accessibility.md) §2–3 |
| 14 | Accessibility considered | **PASS** | WCAG 2.2 AA: keyboard, focus, semantics, contrast, alt text, forms, errors, screen reader — [71](71-phase-5-responsive-accessibility.md) §6 |
| 15 | No unsupported business claims invented | **PASS** | Three-state content rule; lorem ipsum prohibited — [64](64-phase-5-ux-principles.md) §10, [72](72-phase-5-content-seo.md) §2 |
| 16 | KAS identity distinct from reference websites | **PASS** | Adopt/adapt/reject table; **no reference visual identity copied** — [64](64-phase-5-ux-principles.md) §1, §5 |
| 17 | Visual direction maintained | **PASS** | Classic Luxury × Modern Hospitality × Local Heritage, with each pillar governing a distinct layer — [64](64-phase-5-ux-principles.md) §2 |

---

## 2. Phase 4 contract compliance

**No frozen decision was changed.** Phase 5 consumes the contracts.

| Phase 4 contract | Phase 5 compliance |
|---|---|
| One Reservation entity | No UI implies two. Operations shows one list with a channel indicator |
| `salesStatus` / `stayStatus` separate | Guest vocabulary maps from both; admin surfaces them separately |
| **`salesStatus` terminal is `WON`** | Admin button reads *"Mark as WON"*. **The guest never sees the word** |
| OTA `salesStatus = NULL` | OTA recording form has **no sales owner field and no lead source field** |
| Operational queries use `stayStatus` | Arrivals designed on `stayStatus`; the channel indicator is display-only |
| Inquiry holds no inventory | Inquiry list shows a hold indicator **only** where an explicit alternative hold exists |
| Alternative holds expire | "Held for you until…" shown to the guest; countdown shown to the agent |
| `DIRECT_ALTERNATIVE_HOLD_DURATION` not invented | The hold checkbox is **disabled with an inline message naming the missing setting** |
| Availability = room type + quantity | Only `availableDirect` reaches any customer surface |
| Price per room per night, VND base | Basis stated on every price; USD indicative and **absent at commitment** |
| Price snapshot immutable | Admin rate preview states that existing reservations are unaffected |
| Public response denylist | No design surfaces any denylisted field |
| Media property/room/facility scoped | Gallery editors scoped to owner type |
| Review requires completed stay | Write-review entry appears only where eligible |

---

## 3. Design decisions frozen in Phase 5

| # | Decision | Rationale |
|---|---|---|
| U1 | **Five primary nav items** — Hotels · Locations · Experiences · About + utilities | Ten IA areas ≠ ten nav items. Offers and Contact move to the footer; Contact becomes *more* reachable via the phone number on every booking-path error |
| U2 | **`/hotels` and `/search` are two pages** | Editorial collection vs date-scoped availability. Merging compromises both |
| U3 | **Homepage band 3 — "KAS at a Glance"** | "KAS is a real hotel group with 8 properties" must land in the first scroll; a hero alone cannot say it |
| U4 | **Editorial varied tiles, never a uniform grid** | Uniform cards make eight distinct hotels interchangeable |
| U5 | **Flagship blocks are content-driven, not ID-driven** | Any property with facility content gets the block. Milestone stands out by having more, not by being permitted more |
| U6 | **Property sub-nav shows four items, not eleven** | Long rich page, short calm navigation |
| U7 | **Bottom bar is the primary mobile navigation** | Carries the funnel without opening a menu |
| U8 | **All eight hotels listed directly in the mobile menu** | A submenu to a second screen of eight names adds a tap and gains nothing |
| U9 | **No fixed-step progress bar in request status** | A request can branch to alternatives, decline or expire |
| U10 | **"Held for you until…"**, not "expires at" | Same fact, correct register for a hospitality brand |
| U11 | **Static map by default**, interactive on tap | Performance and cost |
| U12 | **No hero carousel** | Multiplies LCP candidates; rarely passes slide one |
| U13 | **Editorial line height 1.7 in both locales** | Vietnamese stacked diacritics need vertical room; applying it to both makes one design, not two |
| U14 | **Rewards is a non-navigable placeholder line** | No programme exists. A visible rewards surface would imply a discount KAS cannot honour |
| U15 | **Provisional accent is deliberately unremarkable** | A striking placeholder gets adopted by default; a plain one gets replaced |
| U16 | **Admin and customer share tokens only** | Forcing editorial density on operators who work in it for hours would slow them down |
| U17 | **Channel shown, never used to filter arrivals** | Filtering the daily list by channel is the R1 defect |

---

## 4. Open content and business dependencies

**Nothing here is solvable in design.**

### 4.1 Blocking the visual layer

| ID | Item | Effect |
|---|---|---|
| **A8 / OQ-004** | **Brand assets** — logo, colours, typefaces | **All colour and type tokens are `PROVISIONAL`.** Typeface selection cannot happen |
| **B8 / OQ-030** | **Photography** — all 8 properties | The entire image-led direction has no content. **Longest lead time of any launch dependency** |

### 4.2 Blocking the booking flow

| ID | Item | Effect |
|---|---|---|
| **A4 / A5** | Cancellation and no-show policy | **The policies block above the submit action. Publish blocker** |
| **A6** | "Within the day" definition | Appears on six surfaces from one settings value |
| **A7** | VAT / service charge | The estimate line shows `estimated` with **no fabricated number** |

### 4.3 Blocking content

| ID | Item |
|---|---|
| **A1 / A2 / OQ-010** | Room types, configurations, quantities |
| **B6 / OQ-005** | Rates |
| **A9 / OQ-031** | Amenity taxonomy, star ratings, accessibility facts |
| **OQ-060** | Districts, addresses, landmark distances |
| **B27 / OQ-061** | Vietnamese label and copy review |
| OQ-001 | Meaning of "KAS" — the Story page |
| OQ-021 | Legal entity details — the footer |
| OQ-009 | Collections — character filter and grouping |

### 4.4 Blocking admin

| ID | Item |
|---|---|
| **B25** | **OTA recording process owner** — the Distribution UX assumes a human process nobody has described |
| B1 | `DIRECT_ALTERNATIVE_HOLD_DURATION` — hold checkbox disabled without it |
| B3 / B4 / B5 / B7 | Buffer values, lag and variance thresholds, channel volume |
| B24 | Sales team structure |
| A12 | Console language |

---

## 5. Unresolved UX risks

| # | Risk | Severity | Mitigation |
|---|---|:--:|---|
| **X1** | **Photography absent or uneven.** The design is image-led; weak or inconsistent imagery creates an implicit ranking across the eight properties, contradicting the brand rules | **HIGH** | Consistent shot list and grade; no property published below the quality bar. **Not solvable in design** |
| **X2** | **The request model loses guests at submit** versus an OTA's instant confirmation | **HIGH** | Explicit promise · instant acknowledgement · visible status · named contact · phone on every error. **Depends on A6 being a promise KAS can keep** |
| **X3** | Elegant light-grey typography fails contrast | MEDIUM | Contrast is a **design constraint**, verified on brand delivery and in CI — not a pre-launch audit item |
| **X4** | Vietnamese label length breaks fixed-width layouts | MEDIUM | No fixed-width buttons; length testing on B27 delivery |
| **X5** | Eight properties described in near-identical language | MEDIUM | `signatureLine` **uniqueness enforced at publish**; ≥1 signature experience required |
| **X6** | Flagship emphasis makes the other seven feel like consolation | MEDIUM | Additive-only treatment; content-driven blocks; no comparative language; Experiences page carries every property |
| **X7** | Guest misreads "estimated total" as final | MEDIUM | Word "estimated" on the total, disclaimer beneath, restated at review and in email |
| **X8** | Agent forgets to release the original hold when offering an alternative | MEDIUM | Explicit inline "release the original" checkbox; short expiry; both holds visible with countdowns |
| **X9** | Provisional palette adopted as final by default | LOW | Deliberately unremarkable; one-file swap; every token labelled `PROVISIONAL` |
| **X10** | Reference material never supplied, so a stakeholder expectation goes unmet | LOW | Stated openly in [64](64-phase-5-ux-principles.md) §1. If the Saigon Collection HTML arrives, review it against §5 |
| **X11** | Rewards placeholder read as a promise | LOW | Non-navigable, one line, no points or tiers. Omitting it entirely is also correct |

---

## 6. Terminology sweep

| Pattern | Assessment |
|---|---|
| "Book Now" / "Pay Now" | ✔ Appears **only in prohibition lists** across the corpus |
| Cart / Basket / Checkout | ✔ Prohibition lists only |
| `WON` in guest-facing copy | ✔ **Absent.** Explicitly stated that the guest never sees it |
| Internal states in guest surfaces | ✔ Absent; mapped through the guest vocabulary table |
| Physical room numbers | ✔ Absent from every customer surface |
| Invented hotel facts | ✔ None. All unknown values render as `[PLACEHOLDER]` |
| OTA as a sales lead | ✔ Absent; structurally impossible in the admin design |

---

## 7. Recommended Phase 6 scope

**PROPOSED — Phase 6: Visual Identity & High-Fidelity Design.** Not implementation.

| # | Workstream | Gate |
|---|---|---|
| 1 | **Deliver A8 brand assets** — logo, colours, typefaces | Provisional tokens replaced; contrast verified; Vietnamese diacritic test passed |
| 2 | **Commission and shoot B8 photography** — start immediately, longest lead time | Per-property hero distinctiveness verified |
| 3 | High-fidelity design of 12 key screens | Home · Collection · Property · Room list · Room detail · Search · Your Stay · Details · Review · Confirmation · Status · My KAS |
| 4 | High-fidelity admin: 6 screens | Dashboard · Direct queue · Request workspace · Arrivals · OTA recording · Media library |
| 5 | Component library in the design tool, on final tokens | 1:1 with [70](70-phase-5-design-system.md) |
| 6 | Vietnamese copy pass (B27) with a native hospitality copywriter | Label set approved |
| 7 | **Prototype and usability-test the request flow** — especially the submit moment and the wait stage | 5–8 participants |
| 8 | Accessibility review of high-fidelity designs | Contrast, focus, hierarchy verified before build |
| 9 | Answer A4/A5, A6, A7 | The booking flow becomes publishable |

**PROPOSED — Phase 7 would be implementation**, following the order in
[63](63-phase-4-validation.md) §7: schema → auth/RBAC → **inventory** → rates → reservation → public
API → admin → media → reviews → frontend → hardening.

**Build inventory before the booking flow.** Everything above it depends on availability being correct,
and it is the only part where a defect costs a guest their room.

---

## 8. Phase 5 completeness

| Brief section | Document | Complete |
|---|---|:--:|
| Visual direction, references, motion | [64](64-phase-5-ux-principles.md) | ✔ |
| Customer information architecture | [65](65-phase-5-information-architecture.md) | ✔ |
| Homepage, collection, brand, reviews, account | [66](66-phase-5-customer-experience.md) | ✔ |
| Property detail, room experience, flagship | [67](67-phase-5-property-room-experience.md) | ✔ |
| Booking experience, Your Stay, status | [68](68-phase-5-booking-experience.md) | ✔ |
| Admin UX, media/content UX | [69](69-phase-5-admin-experience.md) | ✔ |
| Design system direction | [70](70-phase-5-design-system.md) | ✔ *(identity provisional)* |
| Responsive, accessibility | [71](71-phase-5-responsive-accessibility.md) | ✔ |
| SEO / content experience | [72](72-phase-5-content-seo.md) | ✔ |
| Validation | **this document** | ✔ |

**No production code, no frontend or backend initialisation, no packages, no database, no APIs, no
deployment, no screenshots.**
