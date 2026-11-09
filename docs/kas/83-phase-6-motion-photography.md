# 83 — Motion & Photography Direction

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Motion **FINAL**. Photography **specified, no assets exist** (config B8).
**Last updated:** 2026-08-14

---

# PART A — MOTION

## 1. Principles

**CONFIRMED** — KAS motion is **subtle · slow · premium · purposeful**.

| Principle | Rule |
|---|---|
| Motion clarifies, never decorates | Every animation answers "what changed and where did it go?" |
| **Motion never delays a task** | No transition sits between a tap and its result |
| Slower than a consumer app, faster than a splash screen | 150–600ms, never beyond |
| Nothing is understood only through motion | Content and function identical when disabled |
| One moving element at a time | Simultaneous unrelated animation reads as a template |

---

## 2. Motion tokens

**FINAL**

| Token | Value | Use |
|---|---|---|
| `motion.duration.instant` | 0ms | Reduced-motion, immediate state |
| `motion.duration.fast` | **150ms** | Hover, focus, button press, chip toggle |
| `motion.duration.base` | **250ms** | Panel, dropdown, tab, sheet, sticky bar, fade |
| `motion.duration.slow` | **400ms** | Modal, drawer, page-level transitions |
| `motion.duration.reveal` | **600ms** | Scroll reveal — **once per element** |
| `motion.easing.out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances — decelerating |
| `motion.easing.inOut` | `cubic-bezier(0.65, 0, 0.35, 1)` | Transitions between states |
| `motion.easing.in` | `cubic-bezier(0.64, 0, 0.78, 0)` | Exits — accelerating |

**PROPOSED** — `easing.out` is a **strong** deceleration curve. Standard `ease-out` feels mechanical at
these durations; this curve reads as weight settling, which is the difference between "animated" and
"considered".

---

## 3. Interaction specifications

| Interaction | Property | Duration | Easing |
|---|---|---|---|
| **Button hover** | `background-color` | fast 150 | out |
| **Card hover** | `box-shadow` `sm→md` + `translateY(-2px)` | fast 150 | out |
| **Card image hover** | `scale(1.02)`, parent `overflow: hidden` | base 250 | out |
| **Link hover** | `text-decoration` underline grow from left | fast 150 | out |
| **Focus ring** | `outline` appears | instant | — |
| **Nav panel open** | `opacity` 0→1 + `translateY(-8px→0)` | base 250 | out |
| **Nav panel close** | `opacity` 1→0 | fast 150 | in |
| **Mobile overlay** | `translateX(-100%→0)` | base 250 | out |
| **Bottom sheet** | `translateY(100%→0)` | base 250 | out |
| **Modal** | `opacity` 0→1 + `scale(0.98→1)`; backdrop fade | slow 400 | out |
| **Drawer** | `translateX(100%→0)` | slow 400 | out |
| **Toast in** | `translateY(16px→0)` + fade | base 250 | out |
| **Toast out** | fade | fast 150 | in |
| **Accordion** | `height` auto + chevron `rotate(180deg)` | base 250 | inOut |
| **Tab switch** | Indicator `translateX`; content fade | base 250 | inOut |
| **Gallery advance** | `translateX` slide or crossfade | base 250 | inOut |
| **Sticky bar appear** | `translateY(-100%→0)` + fade | base 250 | out |
| **Skeleton shimmer** | `background-position` sweep | 1200ms loop | linear |
| **Quantity change** | Value `opacity` 1→0→1 | fast 150 | inOut |
| **Total recalculation** | Numeric tween old→new | base 250 | inOut |
| **Image reveal on scroll** | `opacity` 0→1 + `translateY(12px→0)` | **reveal 600** | out |
| **Success check** | `scale(0.9→1)` + fade | slow 400 | out |
| **Error shake** | ✖ **Not used** | — | — |
| **Page transition** | ✖ **Not used** — server-rendered navigation | — | — |

---

## 4. Scroll reveal

**PROPOSED** — Used sparingly and with strict limits.

| Rule | Spec |
|---|---|
| Where | Editorial sections only — home bands, property story, facility cards |
| **Never** | Booking flow, forms, search results, room lists, admin, any transactional surface |
| Trigger | 20% of the element in viewport |
| Effect | `opacity` 0→1 + `translateY(12px→0)` |
| Duration | 600ms, `easing.out` |
| **Fires once** | Never re-animates on scroll back |
| Stagger | Maximum 3 children, 80ms apart. Never a cascade of eight tiles |
| Above the fold | **Never** — the hero and first section render immediately |

**CONFIRMED** — Excessive parallax is prohibited. **There is no parallax token.** An unavailable token
cannot be misused.

---

## 5. Loading and state transitions

| Situation | Treatment |
|---|---|
| Page structure | **Server-rendered — no loading state exists** |
| Availability | **Skeleton at final dimensions**, shimmer 1200ms |
| Images | Blurred placeholder at correct aspect ratio → fade 250ms on load |
| Search results | Skeleton rows; **count appears first** |
| **Your Stay recalculation** | Previous total **stays visible**; new value tweens in. **Never blanks** |
| Submit | Blocking overlay, `scrim` + centred card, non-cancellable |
| Long submit (> 8s) | *"Still working…"* appears — **never a silent spinner** |
| Success | 400ms fade + check `scale(0.9→1)`. **No confetti** |
| Error | Alert fades in 250ms. **No shake, no bounce** |

**PROPOSED** — The tone at success is *calm confirmation*, not celebration. Nothing has been booked
yet, and the motion must not overstate what happened.

---

## 6. Reduced motion

```
@media (prefers-reduced-motion: reduce)
  all durations        → 0ms
  scroll reveals       → removed (content visible immediately)
  parallax             → removed
  skeleton shimmer     → static
  numeric tweens       → instant value change
  image fade           → instant
  transforms           → removed; opacity-only where a transition is essential
```

**CONFIRMED** — Content and function are **identical**. Nothing is lost.

---

## 7. Motion prohibitions

| Prohibited | Reason |
|---|---|
| Parallax backgrounds | Reads as a template; harms performance and comfort |
| Scroll-jacking | Removes user control |
| Auto-advancing carousels | Confirmed prohibition |
| Cursor-following effects | Contradicts "timeless" |
| Looping decorative animation | Contradicts "calm" |
| Animation between tap and result | Delays the task |
| Motion as the only state indicator | Accessibility failure |
| Bounce, elastic, overshoot easing | Reads as playful, not established |
| Page transition overlays | Server-rendered navigation is faster without them |
| Animated logos or splash screens | — |

---

# PART B — PHOTOGRAPHY

## 8. Status

**BLOCKED — config B8 / OQ-030. No photography exists.**

**CONFIRMED** — Do not invent images KAS does not have.

| Rule | Detail |
|---|---|
| **No stock photography in any deliverable** | A stock-lit lobby is indistinguishable from a real one in a mock-up and will be mistaken for a decision |
| Placeholder frames | Correct aspect ratio, `surface.sunken`, centred label naming the required shot |
| Placeholder label | `[PROPERTY HERO — 16:9 — required]` in `caption` `text.muted` |

**PROPOSED** — Photography has the **longest lead time of any launch dependency**, and the entire
visual direction rests on it. Commissioning should start regardless of other progress.

---

## 9. Direction

**PROPOSED** — Documentary-warm, not glossy brochure.

| Attribute | KAS | Not |
|---|---|---|
| Light | Natural, warm, directional. Golden hour and blue hour favoured | Flat flash, HDR |
| Colour | Warm grade, restrained saturation | Cold, teal-and-orange, oversaturated |
| Retouching | Minimal — clean, not plastic | Heavy skin/surface retouching |
| Lens | Natural perspective, 24–50mm equivalent | **Ultra-wide distortion** that misrepresents room size |
| Framing | Composed, occasional asymmetry | Dead-centre catalogue framing |
| People | Occasional, incidental, real | Posed stock models |
| Styling | Lived-in but immaculate | Over-styled, obviously staged |

**CONFIRMED** — Rooms are shown **honestly**. The room a guest sees is the room they get. Ultra-wide
distortion is prohibited; it is the single most common trust failure in hotel photography.

---

## 10. Shot requirements per property

**PROPOSED** — 12–30 images per property.

| Category | Count | Notes |
|---|---|---|
| **Exterior** | 2–3 | Street context, entrance, façade |
| **Lobby / arrival** | 2–3 | Including one with a staff presence |
| **Each room type** | 3–4 each | Wide, bed detail, bathroom, view from window |
| **Facilities** | 2–4 each | Restaurant, bar, rooftop, gym, pool where present |
| **Neighbourhood** | 3–5 | Street life, nearby landmark, market, local texture |
| **Detail** | 2–4 | Materials, textures, breakfast, a considered object |

---

## 11. Per-property hero distinctiveness

**PROPOSED — the single most important photography rule.**

> Each property's hero uses a **different composition type**. If all eight heroes are the same shot
> type, the eight properties look interchangeable regardless of how good the layout is — which
> directly contradicts the confirmed requirement that they must not.

| Property | Suggested hero composition | Status |
|---|---|---|
| KAS Passion Boutique | Street context / entrance | `[PLACEHOLDER]` |
| KAS Elegance | Interior detail / material | `[PLACEHOLDER]` |
| KAS Ancient Boutique | Heritage architectural detail | `[PLACEHOLDER]` |
| **KAS Milestone Premium** | **Rooftop at dusk** — the portfolio's signature image | `[PLACEHOLDER]` |
| KAS Zody Boutique | Contemporary interior / light | `[PLACEHOLDER]` |
| KAS Sonata Luxury | Room interior / view | `[PLACEHOLDER]` |
| KAS Eliana Luxury | Quiet space / texture | `[PLACEHOLDER]` |
| KAS Dilly | Neighbourhood context | `[PLACEHOLDER]` |

**These are composition suggestions only** — they must be confirmed against what each property actually
offers. **No property characteristic is invented here.**

**CONFIRMED** — Consistent grade across the portfolio, so no property looks cheaper than another.

---

## 12. Aspect ratios and crops

**FINAL**

| Slot | Ratio | Notes |
|---|---|---|
| `aspect.hero` desktop | **16:9** | Subject-safe: the bottom 40–55% carries the scrim and text |
| `aspect.hero` mobile | **4:5** | **A separate crop, not a cropped landscape.** 16:9 on a phone is a letterbox strip |
| `aspect.heroWide` | 21:9 | Flagship band, full-bleed editorial |
| `aspect.tile` | 4:3 | Property tiles |
| `aspect.tileFeature` | 3:2 | Feature tile |
| `aspect.card` | 3:2 | Room and facility cards |
| `aspect.gallery` | Native, letterboxed | **Preserves the photographer's framing** |
| `aspect.thumb` | 1:1 | Thumbnails, Your Stay property image, admin media tiles |
| `aspect.social` | 1.91:1 | Open Graph — matters for **Zalo and Messenger** sharing |

### 12.1 Crop philosophy and focal point

**PROPOSED** — Every asset stores a **focal point** as normalised coordinates `(x, y)`, set by the
editor in admin.

| Rule | Detail |
|---|---|
| Focal point drives `object-position` | So a 4:5 mobile crop keeps the subject, not the ceiling |
| Default | Centre `(0.5, 0.5)`; overridden per asset |
| Hero subject-safe zone | Subject must sit **above** the bottom 55%, where the scrim lives |
| **Never crop through a face or a doorway** | Editorial judgement, enforced in review |
| Room shots | Crop preserves the **sense of the room's proportion** — the honesty rule |
| If the crop cannot support a scrim | **The crop is wrong.** Fix the crop, not the overlay opacity |

### 12.2 Responsive crops

| Breakpoint | Behaviour |
|---|---|
| Mobile < 768 | **Distinct 4:5 crop**, generated at upload from the same original |
| Tablet | 16:9, focal-point positioned |
| Desktop / wide | 16:9, focal-point positioned |

**PROPOSED** — Art-directed via `<picture>` with separate sources, not CSS `object-fit` alone. A
portrait hero on mobile is a design decision, not a scaling artefact.

---

## 13. Loading and placeholder behaviour

| Stage | Treatment |
|---|---|
| Reserved space | **Explicit `width`/`height` from the declared ratio — CLS ≤ 0.1** |
| Placeholder | Blurred low-resolution preview (LQIP) at the correct ratio |
| Load | Fade 250ms; instant under reduced motion |
| Priority | Hero: `fetchpriority="high"`, preloaded. Everything else lazy |
| Format | Modern format with fallback, served by the CDN |
| Sizes | Responsive `srcset` at 640 / 1024 / 1600 / 2400 |
| Failure | `surface.sunken` block at the correct ratio + `caption` `text.muted` — **never a broken-image icon** |
| Missing asset | Placeholder frame naming the required shot |

---

## 14. Milestone — flagship treatment

**CONFIRMED** — Milestone's documented strengths: large restaurant · rooftop bar · gym · premium rooms
· rooftop experience · high-end hospitality.

| Surface | Photographic treatment |
|---|---|
| Homepage flagship band | `aspect.heroWide` 21:9, rooftop at dusk, `surface.inverse` |
| Property hero | Rooftop or exterior at blue hour |
| `#dining` block | Restaurant wide + detail, own gallery |
| `#rooftop` block | **Dusk. The portfolio's signature image** |
| `#wellness` block | Gym, natural light |
| Gallery allocation | Larger — more facility categories to cover |

**CONFIRMED — the boundary.** Do **not** make the entire website revolve around Property 4. Milestone
occupies **one band of eleven** on the homepage and **one featured position among eight** on the
collection page. Its prominence comes from **having more real content**, not from the design privileging
it.

**CONFIRMED** — Facility blocks render for **any property with the content**. If another property gains
a rooftop, it receives identical treatment.

---

## 15. Photography QA checklist

| # | Check |
|---|---|
| 1 | Each property's hero is a **different composition type** |
| 2 | Consistent grade across all eight properties |
| 3 | No ultra-wide distortion in any room shot |
| 4 | Every hero has a subject-safe zone supporting the scrim |
| 5 | Every asset has a focal point set |
| 6 | Distinct 4:5 mobile hero crop exists per property |
| 7 | Every public asset has alt text in **both locales** |
| 8 | No stock photography anywhere |
| 9 | Contrast verified against the **darkest scrim region**, not the average |
| 10 | Room photography honestly represents proportion |
| 11 | Homepage above-fold payload ≤ 1.2MB |
| 12 | Every image slot declares explicit dimensions |
| 13 | Neighbourhood imagery present per property — the Local Heritage pillar |
| 14 | No property published below the quality bar |

---

## 16. Open dependencies

| ID | Item | Status |
|---|---|---|
| **B8 / OQ-030** | **All photography** — the entire visual direction has no content | **OPEN** |
| A8 / OQ-004 | Brand assets — informs the grade and scrim tuning | **OPEN** |
| B27 / OQ-061 | Vietnamese alt text and captions | **OPEN** |
| A9 / OQ-031 | Which facilities each property actually has — drives the shot list | **OPEN** |
| — | Existing KAS image inventory for import mapping | **OPEN** |

**PROPOSED** — The photography specification is complete and actionable. **It has no assets.** Nothing
in this document compensates for the absence of B8, and commissioning it is the highest-leverage action
available before Phase 7.
