# 71 — Responsive Design & Accessibility

**Phase:** 5 — UX / UI Experience Design
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Breakpoints

| Name | Range | Design intent |
|---|---|---|
| **Mobile** | < 768px | **Primary surface.** Authored first |
| **Tablet** | 768–1023px | Genuine layout, not a stretched phone |
| **Desktop** | 1024–1439px | Editorial layouts, full navigation |
| **Wide** | ≥ 1440px | More whitespace, **not more content** |

**PROPOSED** — At Wide the content max-width caps at 1320px. Extra viewport becomes margin. Filling a
27-inch screen edge to edge is how a premium site starts looking like a dashboard.

---

## 2. Mobile is a design, not a reduction

**CONFIRMED** — Do not simply shrink desktop layouts.

**PROPOSED** — Mobile uses **three separate navigation mechanisms**, each for a different job:

```
┌─────────────────────────────────┐
│  ☰      K A S      ⌕      ◔     │  ← header: orientation
└─────────────────────────────────┘
                 …
┌─────────────────────────────────┐
│  From [1.850.000] ₫  View rooms │  ← bottom bar: ACTION
└─────────────────────────────────┘
```

1. **Header** — menu · brand · **search** · account. Search is a separate icon because it is a *task*,
   not a destination, and burying it costs conversion.
2. **Bottom bar** — context-aware, and the **actual primary navigation on mobile**. It carries the
   guest through the funnel without ever opening a menu.
3. **Menu overlay** — full-screen, **one level deep**. No accordions, no nested drawers. Nested mobile
   menus are a leading cause of subcategory abandonment.

### 2.1 Bottom bar states

| Context | Shows |
|---|---|
| Home, brand pages | *Find your stay* |
| Collection, Locations | *Check availability* |
| Property (no dates) | From-price · *Check availability* |
| Property (dates set) | From-price · *View rooms* |
| Room list (empty) | Dates summary · *Select a room* |
| Room list (selected) | **N rooms · estimated total · *Your Stay* →** |
| Your Stay | ***Request This Stay*** |
| Request flow | *Continue* / ***Request This Stay*** on the final step |
| Account, status | **No bar** — nothing to sell here |

One bar, never two. It never covers the focused element, and it hides in immersive gallery mode.

### 2.2 Menu overlay

**All eight hotels listed directly.** A "Hotels →" submenu leading to a second screen of eight names
adds a tap and gains nothing.

```
Our Hotels        eight names, listed
Discover          Locations · Experiences · Compare · Offers · Our story
Guest             Sign in / My KAS · Contact · FAQ
                  Tiếng Việt · English   |   ₫ VND · $ USD
```

---

## 3. Per-surface responsive behaviour

| Surface | Mobile | Tablet | Desktop |
|---|---|---|---|
| **Search** | Full-screen sequential: **Where → When → Who → Search**, one decision per screen | Inline panel | Inline bar |
| **Date picker** | **One scrollable month column**, touch-first | Two months | Two months |
| **Collection** | Stacked full-width tiles | 2-up, varied | Editorial varied grid |
| **Search results** | Stacked rows; map as a full-screen mode with a list drawer | 2-up + map toggle | List + side map |
| **Property page** | Sticky **chip sub-nav** under the header | Same | Anchored sub-nav |
| **Gallery** | Full-screen swipe, pinch-zoom | Grid + lightbox | Grid + lightbox |
| **Room cards** | Full-width, image on top | 2-up | 2-up with side Your Stay panel |
| **Your Stay** | **Bottom sheet**, expandable — never a separate page, so selection context is never lost | Side panel | Sticky side panel |
| **Request flow** | One question group per screen, visible step indicator | Two columns | Two columns with summary rail |
| **Status timeline** | Vertical, most recent at top | Vertical | Vertical with side detail |
| **My KAS** | List-based, one level deep | Two columns | Left rail + content |
| **Reviews** | Stacked cards | 2-up | 2-up |
| **Admin queue** | Card rows, key fields only | Table, reduced columns | Full table |
| **Admin workspace** | Stacked sections | Two columns | Three columns |
| **Inventory calendar** | ✖ Not supported | ○ Read-only | ✔ Full |

**PROPOSED — the admin mobile priority is deliberate.** An agent must be able to **see a new request,
check availability, log a contact, mark it won, and record an OTA reservation** from a phone.
Everything else can wait for a desk.

---

## 4. Touch and input

| Requirement | Spec |
|---|---|
| Tap targets | **≥ 44 × 44px**, with ≥ 8px between adjacent targets |
| Thumb zone | Primary actions in the lower third on mobile |
| Input font size | **≥ 16px** — smaller triggers iOS auto-zoom |
| Keyboards | `inputmode="numeric"` for quantities, `tel` for phone, `email` for email |
| Autocomplete | Correct tokens throughout — `name`, `email`, `tel`, `country` |
| Hover | **Never the only way to reveal information.** Captions and amenity labels are always visible |
| Gestures | Swipe in galleries only. **No swipe-to-delete, no gesture-only actions** |

---

## 5. Performance as a design constraint

**CONFIRMED** — Measured on a mid-range Android over throttled 4G, at p75, in Vietnam
([10](10-system-requirements.md) §2).

| Metric | Target | Design consequence |
|---|---|---|
| **LCP** | ≤ 2.5s | Hero image is the LCP element: preloaded, correctly sized, modern format |
| **INP** | ≤ 200ms | Date picker and steppers must feel instant |
| **CLS** | ≤ 0.1 | **Every image has explicit dimensions.** Skeletons match final size |
| Homepage images | ≤ 1.2MB, lazy below fold | Limits hero count; one image, chosen well |
| Initial JS | ≤ 200KB gzipped | No heavy carousel or map SDK on first load |

**PROPOSED — two specific decisions this forces:**

1. **Static map image by default** on property pages; interactive only on tap. Loading a map SDK on
   every property page is both a performance and a cost decision.
2. **No hero carousel.** One photograph. A carousel multiplies LCP candidates and rarely gets past the
   first slide.

---

## 6. Accessibility — WCAG 2.2 AA

### 6.1 Keyboard navigation

| Requirement | Spec |
|---|---|
| Skip link | First focusable element on every page |
| Tab order | Follows visual order; no positive `tabindex` |
| **Hotels panel** | Opens on focus, arrow-navigable, `Esc` closes, **focus returns to the trigger** |
| Mobile overlay | Focus trapped while open, restored on close |
| Modal / gallery | Focus trapped, `Esc` closes, focus restored |
| **Date picker** | Fully operable: arrows move by day, PageUp/Down by month, Enter selects, Esc closes |
| Quantity stepper | Arrow keys adjust; the value is a live region |
| Sticky bottom bar | **Never obscures the focused element**; scrollable content has bottom padding |
| Admin tables | Arrow-key cell navigation; Enter opens the row |

### 6.2 Focus states

**CONFIRMED** — Visible on **every** interactive element. 2px ring, 2px offset, contrast ≥ 3:1 against
both the element and its background. `:focus-visible` so mouse users are not shown rings, **but focus
is never suppressed outright**.

### 6.3 Semantic hierarchy

- **One `<h1>` per page**; logical descent with no skipped levels.
- Landmarks: `header` · `nav` (labelled) · `main` · `aside` · `footer`.
- Lists are lists. Tables are tables with `<th>` and scope. Buttons are `<button>`; links are `<a>`.
- Property page: `h1` = property name; section headings `h2`; room names `h3`.

### 6.4 Contrast

Body text ≥ 4.5:1 · large text and UI components ≥ 3:1 · focus indicators ≥ 3:1 · text over
photography uses a scrim or a solid panel, **never a raw overlay hoping for the best**.

> **The specific risk:** elegant light-grey-on-white is a hallmark of premium hospitality design and
> **routinely fails 4.5:1**. Caught in design, not in a pre-launch audit
> ([70](70-phase-5-design-system.md) §4.4).

### 6.5 Alt text

**CONFIRMED** — Required in **both locales** before an asset can be used publicly — a publish gate, not
a backlog item ([62](62-phase-4-media.md) §5).

| Image | Alt approach |
|---|---|
| Property hero | Describe the place: *"The rooftop terrace at dusk, looking north over District 1"* |
| Room | Describe the room: bed, light, view |
| Amenity icon | `aria-hidden`; the adjacent text carries meaning |
| Decorative | Empty `alt=""` |
| Guest review photo | Guest-supplied caption, or a generic fallback |

**PROPOSED** — A hotel gallery is **content**, not decoration. English alt text on a Vietnamese page is
itself a failure.

### 6.6 Forms

Visible label above every field (**never placeholder-as-label**) · helper text programmatically
associated · errors adjacent, in plain language, associated via `aria-describedby` · error summary at
the top of long forms with links to fields · required marked in text, not by colour alone · fieldsets
with legends for grouped inputs · success confirmed in a live region.

### 6.7 Error states

Every error: **icon + colour + text** — never colour alone. Plain language, no codes in the primary
message. Announced via `role="alert"`. **Every booking-path error shows a phone number.**

### 6.8 Screen readers

| Requirement | Spec |
|---|---|
| Availability | *"6 rooms available for your dates"* announced with the room name, not as an orphan number |
| Quantity change | Announced in a live region: *"Deluxe Room, 2 rooms selected"* |
| Your Stay updates | Polite live region — never assertive interruptions |
| **Status timeline** | Ordered list; current state announced first |
| Price | *"1,850,000 dong per room per night"* — the basis is read, not implied |
| Gallery | Image position announced: *"Image 3 of 24"* |
| **Language switch** | Announces the target language **in that language** — *Tiếng Việt*, not "Vietnamese" |
| `lang` attribute | Correct on `<html>`; critical for Vietnamese pronunciation and rendering |
| Testing | The booking flow tested with a screen reader before launch, at minimum |

### 6.9 Motion and cognition

`prefers-reduced-motion` fully honoured — reveals instant, transitions 0ms, no parallax. **Nothing
requires motion to be understood.** No time limits on forms; the Your Stay expiry warns and offers an
extension rather than expiring silently. No flashing content.

### 6.10 Property accessibility information

**PROPOSED** — Accessibility facts *about the buildings* (step-free entrance, lift, accessible bathroom)
are stated **plainly and completely** in Good to know.

**This is the clearest case where the positive-framing rule does not apply.** A guest who needs step-free
access must be able to find out, unambiguously. Blocked on config A9. → **OQ-003**

---

## 7. Testing gates

| Gate | When | Blocking |
|---|---|---|
| Automated axe checks | Every build | ✔ |
| Keyboard-only pass on the booking flow | Every release | ✔ |
| Screen-reader pass on the booking flow | Pre-launch, then per major change | ✔ |
| Contrast verification of all token pairs | On brand-asset delivery, then in CI | ✔ |
| Real-device testing, mid-range Android over 4G | Pre-launch | ✔ |
| Vietnamese diacritic rendering across breakpoints | On typeface selection | ✔ |
| Lighthouse CI budgets | Every build | ✔ |

---

## 8. Open dependencies

| ID | Blocks |
|---|---|
| **A8** | Typeface selection and the diacritic test; contrast verification |
| **B8** | Alt text authoring; image dimension planning |
| A9 / OQ-031 | Property accessibility facts |
| B27 | Vietnamese label set — length testing depends on final strings |
| OQ-003 | Confirmation that factual disclosure overrides positive framing |
