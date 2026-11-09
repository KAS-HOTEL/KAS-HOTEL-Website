# 64 — UX Principles & Visual Direction

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval. **Design only — no code.**
**Last updated:** 2026-08-14

> Phase 4 ([51](51-phase-4-configuration.md)–[63](63-phase-4-validation.md)) is the source of truth for
> domain, reservation, inventory, pricing, API, RBAC, customer, reviews and media. **Phase 5 does not
> redesign the business model and does not change any frozen decision.**

---

## 1. Reference material — what was actually available

**Stated honestly, because it affects what this phase can claim.**

| Reference | Supplied? | How used |
|---|---|---|
| **KAS Product Foundation** (Phase 1–4 corpus) | ✔ 44 documents | **The business source of truth.** Overrides everything else |
| **Saigon Collection HTML** | ✖ **Not present in the repository** | The repo contains 44 markdown files and **zero** other files. Designed from the *described* qualities — editorial presentation, large photography, storytelling, local context — not from the artefact |
| **"Modern Village Lifestyle"** | ✖ Not supplied | Designed from the *described* qualities — prominent hotel search, destination discovery, property collection, account experience |
| Marriott · Hilton · Accor · Hyatt · Booking.com · Expedia | Public sites, studied in Phase 1 | Pattern references only ([17](17-research-notes.md), [18](18-information-architecture-v2.md) §9) |

**PROPOSED** — If the Saigon Collection HTML is supplied later, it should be reviewed against §5 of this
document before any layout is finalised. Nothing here depends on it, so its arrival is additive.

**CONFIRMED** — No reference site's visual identity is copied. KAS's identity derives from its own
brand, its eight properties, and Ho Chi Minh City.

---

## 2. Visual direction

**CONFIRMED** — **Classic Luxury × Modern Hospitality × Local Heritage.**

The three are not a blend; each governs a different layer.

| Pillar | Governs | Expressed as |
|---|---|---|
| **Classic Luxury** | Restraint, proportion, typography | Generous whitespace · few elements · refined display type · no ornament · calm hierarchy · nothing shouts |
| **Modern Hospitality** | Interaction and clarity | Fast, obvious booking entry · dates that follow the guest · plain language · mobile equal to desktop · honest availability |
| **Local Heritage** | Content and texture | Ho Chi Minh City as a named place · real districts and landmarks · Vietnamese typography treated as first-class · warm material palette over cold minimalism |

### 2.1 Feels like

elegant · established · trustworthy · warm · premium · timeless · **modern without futurism** ·
hotel-first · image-led · editorial · calm.

### 2.2 Explicitly avoided

**CONFIRMED**

| Avoided | Why it conflicts |
|---|---|
| Generic OTA appearance | Dense cards, promo ribbons, urgency badges — contradicts the confirmed rejection of a "cheap hotel booking website" |
| Corporate SaaS appearance | Dashboard-first, utility-grey, product-tour patterns — KAS is a hotel group, not software |
| Excessive glassmorphism | Reads as 2021 tech product, not established hospitality |
| Excessive gradients | Same |
| Flashy neon | Directly opposed to "timeless" |
| Overly playful UI | Undermines "established" and "trustworthy" |
| Apartment / lifestyle-clone aesthetics | Airbnb-adjacent visual language positions KAS as a marketplace listing, not a hotel group |

**PROPOSED — the tell.** If a screen would look at home in a startup pitch deck, it is wrong. If it
would look at home in a hospitality magazine, it is close.

---

## 3. Design principles

**PROPOSED** — Ranked. Where two conflict, the lower number wins.

1. **The photograph is the content.** Layout serves imagery, not the reverse. Text earns its place
   beside a picture, never on top of one where it harms either.
2. **The guest never learns our operations.** No internal state, no room numbers, no queue mechanics,
   no `WON`, no `AVAILABILITY_CHECK`. Enforced by [54](54-phase-4-state-machines.md) and
   [58](58-phase-4-api-contract.md) §9.
3. **Eight is a curation.** Every discovery screen is designed for a guest choosing among eight known
   properties, never searching a marketplace.
4. **Booking intent is always one tap away — and never shouting.** A quiet, permanent entry point.
5. **The request model is stated, not hidden.** *"This is a booking request. No payment is taken now."*
   Clarity is the trust mechanism, not a caveat to bury.
6. **Additive flagship.** Milestone gets more surface; no property is positioned as lesser.
7. **Honest scarcity only.** Availability counts come from real inventory. No manufactured urgency,
   ever ([02](02-brand-foundation.md) §6.1).
8. **Luxury simplifies.** Fewer items, larger imagery, more space. Never more menus.
9. **Mobile is a design, not a reduction.** Authored mobile-first; distinct patterns where needed.
10. **Slow is not premium.** A performance budget is a design constraint, not an engineering afterthought.

---

## 4. The two design languages

**PROPOSED** — KAS ships **two** interfaces with different jobs. They share tokens; they share
almost nothing else.

| | **Customer site** | **Admin console** |
|---|---|---|
| Job | Persuade, reassure, convert | Operate quickly and accurately |
| Density | Generous | Dense |
| Imagery | Dominant | Functional thumbnails |
| Type scale | Wide, editorial | Compact, tabular |
| Motion | Subtle reveals | Near-none — state changes only |
| Colour | Restrained, warm | Functional, with semantic status colour |
| Input | Guided, forgiving | Keyboard-first, fast |
| Measured by | Trust and completion | Actions per minute, error rate |

**PROPOSED** — Forcing the editorial language into admin would slow operators who use it for hours a
day. Forcing admin density onto the customer site would make KAS look like an OTA. They share the
colour and type **tokens**; they do not share layout, density or motion.

---

## 5. Reference patterns — adopt, adapt, reject

**CONFIRMED direction** — References inform UX; **KAS business rules always override**.

### 5.1 Adopt

| Pattern | From | Why |
|---|---|---|
| Prominent homepage hotel search | Reference 1; Baymard finding | Booking intent must never hunt |
| Destination discovery | Reference 1 | Serves place-first intent, which a city hotel group depends on |
| Property collection presentation | Reference 1 | Eight properties as a curated set, not a results list |
| Editorial hotel presentation | Reference 2 (described) | The direct site's only structural advantage over an OTA is story |
| Large photography | Reference 2 (described) | Matches image-led direction |
| Experience-led presentation | Reference 2 (described) | Milestone's rooftop and restaurant are experiences, not amenities |
| Local context as content | Reference 2 (described) | Serves the Local Heritage pillar |
| Persistent search context | Chains | Dates follow the guest; re-entry is the commonest avoidable friction |

### 5.2 Adapt

| Pattern | Typically | KAS |
|---|---|---|
| Property grid | Uniform cards | **Editorial varied tiles.** Uniform cards make eight distinct hotels interchangeable |
| Room listing | Rate-first table | Image-led room cards with facts, availability and a quantity stepper |
| Checkout progress | Cart → Delivery → **Payment** → Confirm | **Your Stay → Your Details → Review → Request Sent.** No payment step exists |
| Loyalty hook | "Sign in for member rates" | **Placeholder only.** No programme exists (OQ-041) — we do not imply a discount KAS cannot honour |
| Comparison table | Green ticks / red crosses | Neutral "Not at this property" |
| Rating display | Score as identity | Score as supporting evidence beneath the name and signature line |

### 5.3 Reject

**CONFIRMED** — Instant-payment checkout · "Book Now" / "Pay Now" / "Confirm" as the primary CTA ·
countdown timers · "X people viewing" · hiding unavailable properties · promo ribbons and discount
badges · upsell interstitials between booking steps · infinite scroll on eight results · review score
as primary property identity · flight/car cross-sell · account wall before booking · arrival
newsletter pop-up · pre-consented cookie banner · dashboard-first homepage.

---

## 6. Brand asset dependency

**BLOCKED — config A8 / OQ-004.** No logo, colour values, or licensed typefaces have been supplied.

**PROPOSED** — Consequences, stated so nothing is quietly invented:

1. **Every colour and type token in [70](70-phase-5-design-system.md) is `PROVISIONAL`.** They are
   structurally correct semantic tokens with placeholder values, designed to be swapped in one file.
2. **No KAS brand colour is invented.** The provisional palette is a neutral warm system chosen to be
   *replaceable*, not to pre-empt the brand.
3. **Typeface selection is deferred**, with a hard constraint recorded: any display face must fully
   support Vietnamese diacritics and be tested with real strings before selection
   ([25](25-i18n-currency-architecture.md) §4.2).
4. **Layout, hierarchy, spacing and interaction are not blocked** by A8 and are specified fully.

**PROPOSED** — This is the honest split: *structure* can be designed now; *identity* cannot be
invented. Delivering a palette that looks decided would be worse than delivering one marked
provisional, because it would be adopted by default.

---

## 7. Photography direction

**BLOCKED — config B8 / OQ-030.** No photography exists.

**PROPOSED** — Requirements recorded now because B8 has the longest lead time of any launch dependency
and the entire visual direction rests on it:

| Requirement | Detail |
|---|---|
| **Per-property hero distinctiveness** | Each property's hero uses a **different composition** — wide exterior, interior detail, rooftop, street context. Eight identical shot types make eight hotels look interchangeable regardless of layout |
| Consistent grade | One colour treatment across the portfolio, so no property looks cheaper than another |
| Real rooms, honestly | No wide-angle distortion. The room a guest sees is the room they get |
| Human presence, sparingly | The brand thesis is people; occasional staff and guest presence, never stock-looking |
| Local texture | Street, neighbourhood, market, light — serving the Local Heritage pillar |
| Milestone signature | **Rooftop at dusk** is the portfolio's most distinctive available asset |
| Coverage per property | 12–30 images: exterior, lobby, each room type, facilities, neighbourhood |
| Aspect ratios | Shot to the slots in [62](62-phase-4-media.md) §8 |

**PROPOSED** — Until B8 arrives, all designs use clearly-marked placeholder frames at the correct
aspect ratios. **No stock photography is used in any deliverable**, because a stock-lit lobby is
indistinguishable from a real one in a mock-up and will be mistaken for a decision.

---

## 8. Motion

**CONFIRMED** — Subtle only.

| Permitted | Spec |
|---|---|
| Image reveal on scroll | Opacity + 8–12px rise, 400–600ms, ease-out, **once** |
| Fade transitions | 200–300ms |
| Gallery transitions | Smooth slide/crossfade, ≤ 300ms |
| Hover elevation | Shadow and 2–4px lift, 150ms |
| Navigation transitions | Panel and overlay, 200–250ms |
| Sticky bar appearance | Slide + fade, 200ms |

| Prohibited | Why |
|---|---|
| Excessive parallax | Reads as a template; harms performance and comfort |
| Distracting or looping animation | Contradicts "calm" |
| Motion required to understand content | Accessibility failure |
| Animation that harms performance | INP and LCP are launch gates |
| Scroll-jacking, cursor effects, auto-playing video with sound | Contradicts every pillar |

**CONFIRMED** — `prefers-reduced-motion` is fully honoured: reveals become instant, transitions
collapse to 0ms, no parallax. Content and function are identical without motion.

---

## 9. Tone in the interface

**PROPOSED** — [02](02-brand-foundation.md) §6 governs voice. UI-specific rules:

- Sentence case throughout. **No ALL CAPS navigation** — it also degrades Vietnamese diacritic legibility.
- No exclamation marks in interface copy.
- Errors: apologise once, explain plainly, give the next action. Every booking-path error shows a
  phone number — in a request model the human channel *is* the product.
- Empty states are neutral, never apologetic, never fabricated.
- Numbers are specific: "eight hotels", "6 rooms available", "a 6-minute walk to Ben Thanh Market"
  — **using real values only** (§10).

---

## 10. No invented business facts

**CONFIRMED** — Do not write fake hotel facts.

**PROPOSED** — Every design deliverable distinguishes three states, visibly:

| State | Rendering in deliverables |
|---|---|
| **Real** | Documented in Phase 1–4 — the 8 property names, Milestone's flagship strengths, the request model |
| **`[PLACEHOLDER]`** | Structurally required, value unknown — room type names, rates, distances, amenities, addresses |
| **Omitted** | Not designed at all until the business decides — e.g. cancellation terms |

**PROPOSED** — Placeholders are rendered in a distinct style in all mock-ups so a reviewer can never
mistake `[Deluxe Room — placeholder]` for an approved room name. Silent lorem-ipsum is prohibited: it
reads as decided.

---

## 11. Flagship handling

**CONFIRMED** — Milestone's documented strengths ([01](01-product-foundation.md),
[03](03-property-map.md) §4): **large restaurant · rooftop bar · gym · premium rooms · rooftop
experience · high-end hospitality.**

> **Note:** the Phase 5 brief names two of these (restaurant, rooftop bar). The documented set is
> larger and is used, since Phase 1–4 is the source of truth. If the set has narrowed, that is a
> business correction to record — not something to infer from a brief's shorthand.

**CONFIRMED** — Flagship treatment is **additive**, and must not distort the brand around one property.

| Milestone gets | No property gets |
|---|---|
| A dedicated homepage editorial band | A "lesser" label, tier, or ranking |
| Featured position on the collection page | Comparative language against another KAS property |
| Extended facility blocks (Dining, Rooftop, Wellness) | A truncated template |
| Larger gallery allocation | Fewer available content blocks |

**CONFIRMED** — Facility blocks render for **any** property that has content in them
([23](23-content-architecture.md) §5). Milestone stands out because it *has* more, not because the
system *permits* it more. Every other property must publish at least one signature experience before
it can go live — the publish-checklist rule that structurally prevents "one rich page and seven thin
ones".

---

## 12. Phase 5 scope

| In | Out |
|---|---|
| Layout, hierarchy, composition, flows | Production code |
| Component inventory and behaviour | Frontend or backend initialisation |
| Provisional design tokens | Package installation |
| Responsive and accessibility specification | Database, APIs, deployment |
| Content and SEO UX requirements | Final visual identity (**blocked on A8**) |
| Admin operational UX | Real photography (**blocked on B8**) |
| Motion specification | Screenshots or rendered comps (not requested) |
