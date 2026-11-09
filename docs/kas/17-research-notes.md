# 17 — Research Notes

**Status of this document:** Reference material informing the Phase 1 recommendations
**Last updated:** 2026-08-14

---

## 1. Scope and method

Research covered established hotel-group direct booking sites (Marriott, Hilton, Accor, Hyatt), the
major OTAs (Booking.com, Expedia), and published UX research on accommodation booking. Sources are
listed in §9.

**Important boundary:** these platforms are studied as **references for patterns and pitfalls only**.
No proprietary UI, layout, code, or branding is copied. Where a pattern is adopted, it is adopted
because it solves a problem KAS actually has — and several widely-used patterns are explicitly
rejected below because they conflict with KAS's brand or booking model.

---

## 2. What hotel-group direct sites do well

**Observed across Marriott, Hilton, Accor, and Hyatt:**

| Pattern | Why it works | KAS application |
|---|---|---|
| Property storytelling above rate comparison | The direct site's advantage over an OTA is narrative — an OTA cannot tell a property's story | Confirmed by the brief; each of the 8 properties gets editorial identity ([03](03-property-map.md)) |
| Persistent search context | Dates and guests carry across every page; the guest never re-enters them | Sticky booking bar on property and room pages ([07](07-customer-journey.md) §4.3) |
| Brand-consistent property templates with per-property variation | Consistency without sameness | Identity as structured data; extended template for the flagship |
| Room type as the unit of sale | Guests choose a product, not a physical unit | Directly matches KAS's confirmed architecture ([04](04-room-architecture.md)) |
| Explicit direct-booking advantage | Member rates, best-rate messaging, direct-only perks | KAS has no loyalty programme yet (OQ-041). The equivalent advantage is *personal service* — which must be stated, not assumed |
| Neighbourhood and local content | Positions the hotel as a place, not a commodity | "What's Around You" homepage and property sections |

**The gap they all share:** none of these operate a request-based model, so none offer a pattern for
the post-submission waiting period. That stage had to be designed from first principles
([07](07-customer-journey.md) §7).

---

## 3. What OTAs do well — and what to reject

**Adopt:**

| Pattern | Rationale |
|---|---|
| Fast, forgiving date-range pickers | The most-used and most error-prone control in the entire funnel |
| Clear per-night and total pricing with a breakdown | Cost transparency at the point of commitment is a consistently replicated finding in checkout research |
| Availability stated plainly | Guests trust specific counts more than vague "limited availability" |
| Map-plus-list synchronised browsing | Location is a primary decision factor in a city context |
| Review structure with sub-scores | Multi-dimension ratings are more useful and more credible than a single number |
| Mobile-first flows | Mobile dominates accommodation traffic |

**Reject — these conflict with KAS's brand rules or booking model:**

| Pattern | Why rejected |
|---|---|
| Manufactured urgency ("5 people are looking at this") | Prohibited by the brand voice rules; erodes trust with exactly the premium audience KAS wants |
| Countdown timers on price or availability | Same |
| Dense promotional banners and discount ribbons | Directly contradicts the confirmed rejection of a "cheap hotel booking website" aesthetic |
| Aggressive upsell interstitials between steps | Adds friction at the highest-value moment |
| Genericised property cards | Contradicts the confirmed requirement that the 8 hotels not look identical |
| Instant-payment checkout | **Explicitly prohibited by the product owner** |
| Hiding unavailable properties | Makes an 8-property portfolio look thin and denies the guest a decision |

**The strategic reading:** OTAs optimise for transaction throughput across millions of undifferentiated
properties. KAS optimises for a relationship with a guest choosing between eight specific hotels.
Copying OTA conversion tactics would import an incentive structure KAS does not share.

---

## 4. Published UX research findings applied

### 4.1 Booking search placement

Baymard's travel-accommodations benchmark identifies homepage booking-search prominence as a common
failure — a quarter of accommodation sites fail to make the booking search the primary homepage
content. **Applied:** the search sits at the base of the hero, immediately usable without scrolling,
and condenses into a persistent header element on scroll — satisfying both the editorial hero
requirement and search prominence ([07](07-customer-journey.md) §3).

### 4.2 Date pickers, room selectors, and guest selectors

The same benchmark treats datepicker UI and logic, room selectors, and guest selectors as distinct,
heavily-researched problem areas within accommodation booking. **Applied:** detailed requirements in
[07](07-customer-journey.md) §4.1 — two months visible on desktop, one scrollable month on mobile,
adults and children separated with per-child ages, and multi-room treated as a first-class case
rather than a hidden option.

### 4.3 Cost transparency and progress clarity

Nielsen Norman Group's cart and checkout research emphasises transparent costs, progress indicators,
and unambiguous action labelling — vague "Continue"/"Next" labels leave users unsure what happens
next. **Applied:** named steps in the request flow; itemised estimate; and the deliberately explicit
label **"Request This Stay"** with adjacent text stating that no payment is taken. In a request model
the ambiguity risk is higher than usual, because the guest genuinely does not know whether they have
just booked something.

### 4.4 Trust signals

The same body of research identifies visible security, clear policies, and credible trust markers as
determinants of completion. **Applied:** [02](02-brand-foundation.md) §8 — verified-stay reviews, an
explicit response promise, real photography, a named human contact, policy summary before submission,
and real business details. Notably, KAS's strongest trust asset is one an OTA cannot replicate: a
named person who will call.

### 4.5 Mobile

Industry analysis of hotel booking engines points to mobile abandonment near 80%, with fast load,
simple date pickers, and rates visible above the fold cited as the practical remedies. **Applied:**
mobile-first as a stated product principle, performance budgets measured on mid-range Android over
4G, and Your Stay implemented as a bottom sheet so context is never lost.

---

## 5. Direct booking economics

Findings that inform the commercial framing in [01](01-product-foundation.md) §6:

- Well-optimised hotel direct booking sites are reported to convert around **2–4%**, with strong
  boutique performers reaching 5%+, against an industry average of **1–2%**.
- Direct bookings carry materially higher average value than OTA bookings — SiteMinder data cited at
  **USD 519 direct vs USD 312 via OTA**, a ~62% premium.
- Member-only rates are widely described as the single most effective lever for shifting OTA bookings
  to direct — relevant to OQ-041.
- Rate parity agreements in 2026 are predominantly *narrow* parity: the publicly visible direct rate
  must match OTA rates, but lower rates are permitted for closed user groups. **This is the
  mechanism that makes a member rate legally viable**, and is worth understanding before KAS
  considers loyalty.

**Caveat:** these are external industry benchmarks from vendor and consultancy sources, not KAS data.
They inform framing and prioritisation; they are **not** KAS targets. Real targets require OQ-043.

---

## 6. Vietnamese market context

Relevant to payment sequencing ([05](05-booking-sales-model.md) §5.2) and communication channels:

- **QR payment dominates.** QR-code payments account for the majority of Vietnamese payment
  transactions — over half in 2025. VietQR, the interoperable standard operated through the NAPAS
  national switch, handles on the order of 15 million transfers a day.
- **Bank transfer, increasingly initiated via VietQR, is the backbone for larger purchases** — which
  is precisely the category a hotel stay falls into.
- **Wallets:** MoMo is the largest e-wallet with tens of millions of users; ZaloPay had around 20
  million active users as of mid-2025, benefiting from its integration with the Zalo messaging app;
  VNPay's QR network is widely deployed across banks and merchants.

**Implications for KAS:**

1. When payment integration is eventually authorised, the priority order should be **VietQR / bank
   transfer first, wallets second, international cards third** — the inverse of what a
   Western-designed platform would assume.
2. International guests will still expect card payment, so cards cannot be dropped — but they are not
   the primary rail for the domestic audience.
3. **Zalo is the dominant messaging platform in Vietnam**, which is why it appears as a first-class
   contact-preference option in the booking form (OQ-032) rather than as an afterthought.
4. Vietnamese-language content is not a translation exercise appended at the end. It is a primary
   requirement (OQ-020), and it constrains typography — display faces must fully support Vietnamese
   diacritics, which eliminates many otherwise attractive options.

---

## 7. Accessibility and inclusive design

- **WCAG 2.2 AA** adopted as the standard ([07](07-customer-journey.md) §11,
  [10](10-system-requirements.md) NFR-04).
- The two highest-risk components in this product are the **date-range picker** (complex keyboard and
  screen-reader semantics) and the **image gallery** (a hotel gallery is content, not decoration, and
  needs real alternative text).
- A specific tension to watch: elegant light-grey-on-white typography is a hallmark of premium
  hospitality design and routinely fails the 4.5:1 contrast requirement. This must be caught in
  design, not in a pre-launch audit when the visual language is already signed off.
- Accessibility information *about the properties* must be stated factually and completely — this is
  the clearest case where the positive-framing rule must not apply (OQ-003).

---

## 8. Patterns designed from first principles

No competitor pattern existed for these, because no comparable platform runs a request-based model:

| Problem | KAS approach |
|---|---|
| The waiting period between request and confirmation | Designed as a first-class product stage with status visibility, a named contact, and proactive communication ([07](07-customer-journey.md) §7) |
| Communicating "this is a request, not a booking" without deflating the guest | Explicit, calm language positioning it as personal service rather than as a missing feature |
| Availability that is provisional but must not feel unreliable | Real counts, soft holds, honest language, and a system that fails closed |
| Presenting 8 properties without ranking them | Non-hierarchical collections; identity as structured data; flagship treated as *additive* rather than comparative |
| A flagship that does not diminish the other seven | Milestone gets more; the others get their own — never less ([02](02-brand-foundation.md) §5) |

---

## 9. Sources

Industry and UX research consulted:

- [Baymard Institute — Hotel & Property Rental Ecommerce UX Research](https://baymard.com/research/travel-accommodations)
- [Baymard Institute — Travel Accommodations UX Benchmark](https://baymard.com/blog/travel-accommodations-2024-benchmark)
- [Baymard Institute — Make the Booking Search Feature the Primary Homepage Content](https://baymard.com/blog/travel-accommodations-booking-search)
- [Baymard Institute — Booking.com UX Case Study](https://baymard.com/ux-benchmark/case-studies/booking-com)
- [Nielsen Norman Group — Shopping Carts, Checkout & Registration report](https://www.nngroup.com/reports/ecommerce-ux-shopping-carts-checkout-registration/)
- [Nielsen Norman Group — Ecommerce usability research reports](https://www.nngroup.com/reports/topic/e-commerce/)
- [Hotel Website Conversion Rate Benchmarks 2026: Direct Booking vs OTAs](https://bookbetterdirect.com/hotel-website-conversion-rate-benchmarks-2026-direct-booking-vs-otas/)
- [Hotel Direct Booking Conversion 2026: The Website Playbook](https://www.prostay.com/blog/hotel-direct-booking-conversion-2026/)
- [Hotel Conversion Rate Benchmarks & Boosting Tips for 2026 — Roomstay](https://www.roomstay.io/blog/optimising-hotel-average-conversion-rate)
- [How to Boost Hotel Direct Bookings in 2026 — Stayntouch](https://www.stayntouch.com/articles/boost-hotel-direct-bookings-2026)
- [Hotel Direct Booking Websites: 12 Best Practices for 2026 — PriceLabs](https://hello.pricelabs.co/blog/hotel-direct-booking-websites/)
- [Most popular payment methods in Vietnam — Antom](https://knowledge.antom.com/most-popular-payment-methods-in-vietnam)
- [Vietnam's Top Payment Methods (MoMo, ZaloPay, VietQR) Explained — Transfi](https://www.transfi.com/blog/vietnams-top-payment-methods-momo-zalopay-vietqr-explained)
- [Vietnamese payment apps: MoMo, ZaloPay, VNPay compared](https://vietnamkb.com/practical/vietnamese-banking-apps-momo-zalopay-vnpay)
- [How to Accept Payments in Vietnam — piqpay](https://piqpay.com/blog/accept-payments-vietnam-momo-vietqr)

Hotel group and OTA sites reviewed as pattern references only, not reproduced in any form:
Marriott, Hilton, Accor, Hyatt, Booking.com, Expedia.

**Note on source quality:** the Baymard and Nielsen Norman material is primary usability research and
is weighted accordingly. The conversion-benchmark and payment-market figures come from vendor and
consultancy publications and are treated as directional context, not as established fact. Where a
figure materially influences a recommendation, that dependency is stated.

---

## 10. Recommended further research

| Topic | Why | Priority |
|---|---|---|
| Guest interviews (5–8 recent KAS guests) | Validate personas and journeys against real behaviour (OQ-044) | High |
| Sales team interviews (2–3 staff) | The real sales workflow is only documented in people's heads today; the admin console depends on it (OQ-048) | High |
| Competitive review of HCMC boutique hotel sites | Local market expectations differ from international chains | Medium |
| Vietnamese-language content review | Tone and terminology in Vietnamese, not translated English | Medium |
| Usability testing of the request flow prototype | The submit moment is the highest-risk interaction in the product | High, in Phase 2 |
| Vietnamese personal data law review | Blocks hosting and retention decisions (OQ-027, OQ-039) | High, legal |
