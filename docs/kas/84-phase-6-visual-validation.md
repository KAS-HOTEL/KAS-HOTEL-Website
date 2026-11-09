# 84 — Final Visual QA & Validation

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Validation executed 2026-08-14
**Last updated:** 2026-08-14

---

## 1. Visual QA results — 20 / 20 PASS

| # | Check | Result | Where satisfied |
|---|---|:--:|---|
| 1 | Classic Luxury direction consistent | **PASS** | Luxury level calibrated with a position table, not adjectives — [74](74-phase-6-visual-foundation.md) §2 |
| 2 | Modern Hospitality clear | **PASS** | Each pillar governs a distinct layer; interaction and clarity is its remit — [74](74-phase-6-visual-foundation.md) §1 |
| 3 | Local Heritage visible without cliché | **PASS** | Expressed as *content and texture* — real districts, warm palette, Vietnamese as first-class type — not as ornament — [74](74-phase-6-visual-foundation.md) §2, [75](75-phase-6-typography.md) §7 |
| 4 | Does not look like a generic OTA | **PASS** | Explicit avoid-list; no promo ribbons, urgency badges or dense card grids; density modes cap elements per viewport — [74](74-phase-6-visual-foundation.md) §3, §12 |
| 5 | Does not look like Modern Village | **PASS** | Reference never supplied; used only for described UX patterns. **No visual identity copied** — [64](64-phase-5-ux-principles.md) §1 |
| 6 | Not a clone of another hotel site | **PASS** | *"No reference site's visual identity is copied. KAS's identity derives from its own brand, its eight properties, and Ho Chi Minh City."* — [64](64-phase-5-ux-principles.md) §1. Adopt/adapt/reject table at §5 |
| 7 | All 8 properties have equal design importance | **PASS** | Panel lists **all eight always**, generated from data. Never "top 4 + view all". No tier, no badge — [78](78-phase-6-components.md) §2.2 |
| 8 | Milestone differentiation comes from real content | **PASS** | Facility blocks render from `Facility` content, **not** `isFlagship`. `isFlagship` controls placement weight only — [79](79-phase-6-customer-screens.md) §3, [83](83-phase-6-motion-photography.md) §14 |
| 9 | Typography supports Vietnamese correctly | **PASS** | 15-point diacritic QA checklist; 1.70 editorial leading; no ALL CAPS; no fixed-width buttons; no negative tracking below 18px — [75](75-phase-6-typography.md) §7 |
| 10 | Provisional brand tokens remain clearly provisional | **PASS** | Four safeguards; every value marked; single-file swap; blocking CI contrast check — [76](76-phase-6-color.md) §1, §8 |
| 11 | WCAG 2.2 AA contrast maintained | **PASS** | Verified pair table with ratios; two named traps; blocking CI check — [76](76-phase-6-color.md) §6 |
| 12 | Mobile remains first-class | **PASS** | Three distinct navigation mechanisms; full breakpoint behaviour matrix; touch spec — [82](82-phase-6-responsive-accessibility.md) §1–3 |
| 13 | Booking flow visually trustworthy | **PASS** | Request statement at four points; progress never says Payment; phone number from step 4 onward — [81](81-phase-6-booking-prototype.md) §3, §6 |
| 14 | Internal states hidden from guests | **PASS** | Guest vocabulary table; `WON`/`ASSIGNED`/`AVAILABILITY_CHECK`/`CUSTOMER_CONTACTED` never appear — [79](79-phase-6-customer-screens.md) §9, [81](81-phase-6-booking-prototype.md) §5 |
| 15 | Physical room numbers hidden | **PASS** | Absent from every customer screen; the public response type has no field capable of carrying one — [79](79-phase-6-customer-screens.md) §3, §11 |
| 16 | OTA remains operational, not Sales-facing | **PASS** | Arrivals channel column **displayed, never used to produce the list**; OTA form has no sales-owner or lead-source field — [80](80-phase-6-admin-screens.md) §4.1, §9 |
| 17 | Photography remains central | **PASS** | *"The photograph is the content"* is design principle 1; image-to-text ratios specified per surface — [64](64-phase-5-ux-principles.md) §3, [74](74-phase-6-visual-foundation.md) §1, §5 |
| 18 | Accessibility respected | **PASS** | Contrast, keyboard, focus, semantics, alt text, forms, screen reader, reduced motion, Vietnamese layout QA — [82](82-phase-6-responsive-accessibility.md) §5–6 |
| 19 | Motion remains restrained | **PASS** | 150–600ms envelope; reveals fire once; **no parallax token exists**; ten prohibitions — [83](83-phase-6-motion-photography.md) §2, §4, §7 |
| 20 | No unsupported business claims appear | **PASS** | Three-state content rule; `[PLACEHOLDER]` visibly marked; lorem ipsum and stock photography prohibited — [64](64-phase-5-ux-principles.md) §10, [83](83-phase-6-motion-photography.md) §8 |

---

## 2. Contract compliance

**No Phase 4 or Phase 5 decision was changed.** Phase 6 adds visual precision only.

| Contract | Phase 6 compliance |
|---|---|
| One Reservation entity | No screen implies two. Operations shows one list with a channel indicator |
| `salesStatus` terminal is `WON` | Admin button reads **"Mark as WON"**; route `/win`; field `salesStatus`. **The guest never sees the word** |
| OTA `salesStatus = NULL` | OTA recording form has **no sales owner and no lead source field** |
| Operational queries use `stayStatus` | Arrivals spec states it explicitly; channel column is display-only |
| Inquiry holds no inventory | Hold indicator ⏳ appears **only** where an explicit alternative hold exists |
| Alternative holds expire | "Held for you until…" for guests; countdown chip for agents |
| `DIRECT_ALTERNATIVE_HOLD_DURATION` not invented | Hold checkboxes **disabled with an inline message naming the missing setting** |
| Availability = room type + quantity | Only `availableDirect` reaches any customer surface |
| Price per room per night, VND base | Basis shown with every amount; **USD absent from step 7 onward** |
| Price snapshot immutable | Admin rate preview states existing reservations are unaffected |
| Public response denylist | No component or screen surfaces a denylisted field |
| Media property/room/facility scoped | Gallery editor scoped by `owner_type` |
| Review requires completed stay | Review screen reachable only where eligible |
| Five primary nav items | Header spec matches [65](65-phase-5-information-architecture.md) exactly |
| Mobile bottom bar is primary navigation | Context-state table carried forward with measurements |

---

## 3. Visual decisions frozen

| # | Decision | Rationale |
|---|---|---|
| V1 | **Elegance = photography + typography + spacing + composition.** No decorative-effect tokens exist | An unavailable token cannot be misused |
| V2 | **Section rhythm 128 / 96 / 64px** desktop/tablet/mobile on editorial pages | The single most effective non-photographic premium signal |
| V3 | **Image-to-text ratio falls as commitment approaches** — 85% at hero, 0% at the details form | Photography persuades; it does not help check a date |
| V4 | **`radius.none` on all editorial photography** | Rounded corners on a hero read as a lifestyle app |
| V5 | **Max `radius.md` 8px on cards; `radius.pill` for chips and steppers only** | Confirmed avoid-list: excessive rounded cards |
| V6 | **Warm-tinted shadows derived from `ink-800`, never `#000`** | Neutral-black shadows read cold and technical |
| V7 | **Maximum two surface levels visible in one region** | Three levels produce visual mush |
| V8 | **Inverse surface used at most twice per page** | Overuse turns a calm site into a striped one |
| V9 | **Display face at weight 400 only. Bold display is prohibited** | Size carries authority; weight makes it heavy, not elegant |
| V10 | **Editorial leading 1.70 in both locales** | Vietnamese stacked diacritics need vertical room; one design, not two |
| V11 | **Display sizes fluid; body and UI sizes stepped** | Fluid body text produces unpredictable measure |
| V12 | **Two-column editorial is 7/5, not 6/6** | Equal halves read as a template |
| V13 | **Above 1320px, extra width becomes margin** | Filling a 27-inch display is how a premium site becomes a dashboard |
| V14 | **Forms use `container.narrow` 680px at every breakpoint** | A 1140px form loses the label–input relationship |
| V15 | **Card imagery is flush to the card edge** | Padded imagery reads as a widget, not editorial |
| V16 | **Property tile gutter 48px — larger than any other grid** | Stops eight tiles reading as a table |
| V17 | **Mobile hero is a distinct 4:5 crop, art-directed** | 16:9 on a phone is a letterbox strip |
| V18 | **One hero image. No carousel** | Multiplies LCP candidates; rarely passes slide one |
| V19 | **Static map by default, interactive on tap** | Performance and cost |
| V20 | **Focal point stored per asset, drives `object-position`** | A 4:5 crop keeps the subject, not the ceiling |
| V21 | **Scroll reveals fire once, never above the fold, never in transactional flows** | Motion must not delay a task |
| V22 | **No parallax token exists** | Confirmed prohibition, made structural |
| V23 | **Success = 400ms fade + check. No confetti** | Nothing is booked yet; motion must not overstate it |
| V24 | **Provisional accent is deliberately unremarkable** | A striking placeholder gets adopted by default |
| V25 | **Admin shares tokens, not density** | Operators work in it for hours; editorial rhythm would slow them |
| V26 | **Display face appears once in admin — the wordmark** | Connective tissue without editorial cost |
| V27 | **Buttons have no fixed width, `min-width` only** | Vietnamese labels run 10–20% longer |
| V28 | **Sentence case everywhere. No uppercase** | Strips diacritics of vertical room; reads as shouting |

---

## 4. Provisional decisions

**⚠ These are placeholders and must not be presented as the KAS brand.**

| Item | Status | Replaced by |
|---|---|---|
| Colour primitives — stone, ink, accent, semantic hues | **PROVISIONAL** | Config A8 |
| Typeface selection — display, text, mono | **PROVISIONAL CANDIDATES** | Config A8 + the §7.2 diacritic QA |
| Accent hue `#3D5A54` | **PROVISIONAL** | Config A8 |
| Photography compositions per property | **SUGGESTIONS ONLY** | Confirmation against what each property actually offers |
| Contrast ratios in [76](76-phase-6-color.md) §6.2 | **Computed, requiring CI verification** | Blocking CI check |
| Shadow tint | **PROVISIONAL** — derived from provisional `ink-800` | Config A8 |

**FINAL and brand-independent:** spacing scale · grid · containers · breakpoints · radius · elevation
levels · z-index · aspect ratios · type scale, weights, leading, tracking · motion durations and
easing · component anatomy, states and behaviour · screen layouts · accessibility contract.

---

## 5. Brand inputs still required

| ID | Input | Blocks |
|---|---|---|
| **A8 / OQ-004** | **Vector logo + lock-ups + clear-space rules** | Header, footer, admin wordmark, favicon, social image |
| **A8 / OQ-004** | **Brand colour values** | Every colour token; contrast re-verification |
| **A8 / OQ-004** | **Licensed typefaces with Vietnamese coverage** | Typeface selection; the entire §7.2 QA |
| A8 | Existing brand guideline, if any | Alignment check |
| OQ-009 | Collections vs tiers | Character filter, tile grouping |
| B27 / OQ-061 | Vietnamese label set | Layout QA at 320px; button wrapping |
| OQ-021 | Legal entity details | Footer |
| OQ-001 | Meaning of "KAS" | Story page |

---

## 6. Photography inputs still required

| ID | Input | Blocks |
|---|---|---|
| **B8 / OQ-030** | **12–30 images per property × 8 properties** | Every editorial surface |
| **B8** | **Per-property hero with a distinct composition** | The eight-properties-are-distinct requirement |
| **B8** | Room-type sets, 3–4 per type | Room cards and detail |
| **B8** | Facility sets — Milestone restaurant, rooftop, gym | Flagship blocks |
| **B8** | Neighbourhood imagery per property | Local Heritage pillar |
| **B8** | Distinct 4:5 mobile hero crops | Mobile hero |
| B8 + B27 | Alt text and captions, both locales | **Publish gate — no asset goes public without it** |
| A9 / OQ-031 | Which facilities each property actually has | The shot list itself |
| — | Existing KAS image inventory | Import mapping |

**PROPOSED** — B8 has the **longest lead time of any launch dependency** and the entire visual
direction rests on it. Commissioning should proceed regardless of other progress.

---

## 7. UX / visual risks

| # | Risk | Severity | Mitigation |
|---|---|:--:|---|
| **R1** | **Photography absent or uneven.** Uneven quality creates an implicit ranking across the eight properties, contradicting the brand rules | **HIGH** | Consistent shot list and grade; per-property hero distinctiveness rule; no property published below the bar. **Not solvable in design** |
| **R2** | **Provisional palette adopted as final by default** | **HIGH** | Deliberately unremarkable accent; every value marked; single-file swap; blocking CI contrast check on the new values |
| **R3** | Elegant light-grey typography fails contrast | MEDIUM | `text.muted` ≈ 5.4:1 is the **floor**; blocking CI check; named as a trap in [76](76-phase-6-color.md) §6.3 |
| **R4** | Vietnamese labels break fixed-width layouts | MEDIUM | No fixed-width buttons; 10-point layout QA at 320px on B27 delivery |
| **R5** | Section rhythm eroded under "fit more above the fold" pressure | MEDIUM | 128px is documented as a **decision to defend in review**, with the rationale attached |
| **R6** | Typeface chosen for aesthetics, failing diacritics | MEDIUM | A face failing QA checks 1–5 is **rejected regardless of aesthetics** — a clipped diacritic is a misspelling |
| **R7** | Flagship emphasis makes the other seven feel like consolation | MEDIUM | Content-driven facility blocks; one band of eleven; Experiences page carries every property |
| **R8** | Hero LCP exceeds 2.5s on mid-range Android over 4G | MEDIUM | One image, preloaded, art-directed crops, ≤ 1.2MB above-fold budget |
| **R9** | Text-over-photography fails contrast on bright crops | MEDIUM | Contrast measured against the **darkest scrim region**; *"if the crop cannot support a scrim, the crop is wrong"* |
| **R10** | Admin drifts into a generic dashboard look | LOW | Shares colour, type family, radius, shadow and icon set; wordmark uses the display face |
| **R11** | Reduced-motion users lose meaning | LOW | Nothing is understood only through motion; content identical when disabled |

---

## 8. Accessibility status

| Area | Status |
|---|---|
| Contrast | ✔ Specified with ratios; **blocking CI check defined**; two traps named |
| Keyboard | ✔ Full contract per component, including the date picker |
| Focus | ✔ 2px/2px offset, ≥ 3:1, never suppressed, inverse variant on dark |
| Touch targets | ✔ 44×44px, 8px separation, ≥ 16px inputs |
| Semantics | ✔ One `h1`, landmarks, real tables, real buttons |
| Alt text | ✔ **Publish gate**, both locales |
| Forms | ✔ Labels above, blur validation, `aria-describedby`, error summary |
| Screen reader | ✔ Per-element announcement specification |
| Reduced motion | ✔ Complete; content identical |
| Vietnamese | ✔ 15-point face QA + 10-point layout QA |
| Property accessibility facts | ⚠ **Blocked on A9** — the one case where positive framing does not apply |
| **Verification against real values** | ⚠ **Blocked on A8** — ratios are computed, not yet measured on brand colours |

**Standard: WCAG 2.2 AA.** The specification is complete; **verification is blocked on brand assets.**

---

## 9. Phase 6 completeness

| Brief section | Document | Complete |
|---|---|:--:|
| 6.1 Visual foundation | [74](74-phase-6-visual-foundation.md) | ✔ |
| 6.2 Typography | [75](75-phase-6-typography.md) | ✔ *(faces provisional)* |
| 6.3 Colour system | [76](76-phase-6-color.md) | ✔ *(values provisional)* |
| 6.4 Spacing / grid / layout | [77](77-phase-6-layout-grid.md) | ✔ |
| 6.5 Component library — 45 components | [78](78-phase-6-components.md) | ✔ |
| 6.6 Customer screens — 12 | [79](79-phase-6-customer-screens.md) | ✔ |
| 6.7 Admin screens — 6 | [80](80-phase-6-admin-screens.md) | ✔ |
| 6.8 Booking flow prototype | [81](81-phase-6-booking-prototype.md) | ✔ |
| 6.9 Responsive design | [82](82-phase-6-responsive-accessibility.md) | ✔ |
| 6.10 Accessibility | [82](82-phase-6-responsive-accessibility.md) | ✔ |
| 6.11 Motion / interaction | [83](83-phase-6-motion-photography.md) Part A | ✔ |
| 6.12 Image / photography direction | [83](83-phase-6-motion-photography.md) Part B | ✔ *(no assets)* |
| 6.13 Final visual QA | **this document** | ✔ |

**No production code, no frontend or backend initialisation, no packages, no database, no APIs, no
deployment, no screenshots, no design-tool files.**

---

## 10. Phase 7 implementation dependencies

**PROPOSED** — What must exist before implementation can begin, in dependency order.

### 10.1 Blocking

| # | Dependency | Blocks |
|---|---|---|
| 1 | **A8 brand assets** | Token finalisation, typeface loading, contrast verification |
| 2 | **A1/A2 room types and quantities** | Every room surface, the domain freeze |
| 3 | **A4/A5 cancellation and no-show** | **The booking flow cannot publish** |
| 4 | **A6 "within the day" definition** | Six surfaces from one settings value |
| 5 | **A7 VAT / service charge** | Every displayed price |
| 6 | **A3 + L1 hosting region and data protection** | Infrastructure |
| 7 | **B6 rates** | Every price |
| 8 | **B8 photography** | Every editorial surface |

### 10.2 Configuration required before production

`DIRECT_ALTERNATIVE_HOLD_DURATION` (B1) · `DIRECT_REQUEST_HOLD_DURATION` (B2) · OTA safety buffer
values (B3) · recording lag threshold (B4) · reconciliation tolerance (B5) · channel volume (B7) ·
deposit rule (B12) · group threshold (B15) · review window (B16) · lifecycle timings (B17) ·
**OTA recording process owner (B25)** · Vietnamese label set (B27).

### 10.3 Ready for implementation now

| Deliverable | Source |
|---|---|
| Token structure and all brand-independent values | [74](74-phase-6-visual-foundation.md) §13, [77](77-phase-6-layout-grid.md) |
| Type scale, weights, leading, tracking | [75](75-phase-6-typography.md) §2–6 |
| Semantic colour architecture | [76](76-phase-6-color.md) §4–5 |
| Grid, containers, breakpoints, spacing | [77](77-phase-6-layout-grid.md) |
| 45 component specifications | [78](78-phase-6-components.md) |
| 12 customer + 6 admin screen layouts | [79](79-phase-6-customer-screens.md), [80](80-phase-6-admin-screens.md) |
| Booking flow behaviour | [81](81-phase-6-booking-prototype.md) |
| Responsive matrix and accessibility contract | [82](82-phase-6-responsive-accessibility.md) |
| Motion tokens and interaction specs | [83](83-phase-6-motion-photography.md) Part A |
| API contract, domain, state machines | [52](52-phase-4-domain-model.md)–[58](58-phase-4-api-contract.md) |

### 10.4 Recommended Phase 7 order

Unchanged from [63](63-phase-4-validation.md) §7:

```
schema → auth/RBAC → INVENTORY → rates → reservation → public API
      → admin (Operations → Sales → Distribution) → media → reviews
      → frontend → hardening
```

**Build inventory before the booking flow.** Everything above it depends on availability being correct,
and it is the only part where a defect costs a guest their room.

**PROPOSED** — The frontend can begin against the token system and component specifications **before**
A8 arrives, using provisional values. The swap is a one-file change by design. **Do not wait on brand
assets to start building structure** — but do not ship provisional colour to production either.
