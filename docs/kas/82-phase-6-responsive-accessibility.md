# 82 — Responsive Design & Accessibility (High-Fidelity)

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Implementation-ready
**Relationship:** [71](71-phase-5-responsive-accessibility.md) established the *approach*. This document
adds **measurable values**.
**Last updated:** 2026-08-14

---

## 1. Breakpoint behaviour matrix

**FINAL** — What changes at each breakpoint, per surface. A developer should not have to infer any row.

| Surface | Mobile < 768 | Tablet 768–1023 | Desktop 1024–1439 | Wide ≥ 1440 |
|---|---|---|---|---|
| **Header** | 56px · ☰ logo ⌕ ◔ | 72px · Hotels ▾ + menu | 88px → 64px condensed | Same, `container.wide` |
| **Primary nav** | Overlay only | Hotels ▾ + ☰ | 4 items + utilities | Same |
| **Hero** | `aspect` **4:5**, 70vh min | 16:9, 480px min | 16:9, 560px min | 16:9, capped 720px |
| **Hero headline** | `display-xl` 40px | 56px | 72px | 72px |
| **Search** | Full-screen sequential | 2×2 grid panel | Single row 72px | Single row 72px |
| **Date picker** | 1 scrollable month | 2 months | 2 months | 2 months |
| **Property tiles** | 1-up, all `standard` | 2-up varied | Varied 8/6/4 | Varied, `space.7` gutter |
| **Room cards** | Stacked, image top | 2-up | Image 5 / content 7 | Same |
| **Your Stay** | Bottom sheet | Bottom sheet | Sticky side panel 4 cols | Same |
| **Search results** | List; map full-screen | List; map toggle | 7 list / 5 map | Same |
| **Property sub-nav** | Scrollable chips, sticky 48px | Scrollable chips | Anchored bar | Anchored bar |
| **Gallery** | 1-col + swipe | 2-col grid | 3-col grid | 3-col grid |
| **Forms** | Full-width − 32px | 680px centred | 680px + summary rail | Same |
| **Footer** | 1 col, accordion | 3 cols | 5 cols | 5 cols |
| **Admin sidebar** | Drawer | Collapsible 64px | 240px fixed | 240px fixed |
| **Admin table** | Card rows | Reduced columns | Full table | Full table |
| **Inventory calendar** | ✖ Not supported | ○ Read-only | ✔ Full | ✔ Full |

---

## 2. Mobile navigation — three mechanisms

**CONFIRMED** — Mobile is a design, not a reduction.

### 2.1 Header — orientation

```
┌───────────────────────────────────┐
│  ☰       K A S       ⌕       ◔    │   56px
└───────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Height | 56px · `surface` · `border.subtle` bottom on scroll |
| Targets | Four, each **44×44px**, `space.2` 8px between |
| Logo | Centred, max-height 24px |
| Search icon | **Separate from the menu** — search is a task, not a destination; burying it costs conversion |

### 2.2 Bottom bar — the primary navigation

```
┌───────────────────────────────────┐
│  From [1.850.000] ₫   View rooms  │   64px
└───────────────────────────────────┘
```

| Property | Value |
|---|---|
| Height | **64px** · `surface.elevated` · `shadow.lg` · `z.sticky` 100 |
| Padding | `space.4` 16px horizontal |
| Left content | Context label `caption` + value `price` / `body-sm` |
| Right action | `primary` button, `md` 44px, min-width 140px |
| Safe area | `padding-bottom: env(safe-area-inset-bottom)` |
| Scroll clearance | Page content carries `padding-bottom: 80px` |

**Context states** — see [71](71-phase-5-responsive-accessibility.md) §2.1. **One bar, never two.**
It hides in immersive gallery mode and is absent on account and status screens.

### 2.3 Menu overlay

| Property | Value |
|---|---|
| Presentation | Full-screen, `surface`, slides from left `motion.base` 250ms |
| Depth | **One level.** No accordions, no nested drawers |
| Item height | 56px, `body` 16px |
| Group heading | `label` 13px `text.muted` `tracking.wide`, `space.6` above |
| Hotels | **All eight listed directly** — a submenu to a second screen of eight names adds a tap and gains nothing |
| Close | ✕ 44×44px top-left, `Esc`, or swipe left |
| Focus | Trapped while open; restored to ☰ on close |
| Body | `overflow: hidden` while open |

---

## 3. Touch specification

**FINAL**

| Requirement | Value |
|---|---|
| Minimum target | **44 × 44px** |
| Minimum separation | **8px** between adjacent targets |
| Thumb zone | Primary actions in the lower third on mobile |
| Input font size | **≥ 16px** — smaller triggers iOS auto-zoom |
| Stepper buttons | 44 × 44px each |
| Date cell | 44 × 44px |
| Star rating | 44 × 44px per star |
| Gallery swipe threshold | 40px horizontal, < 30° from horizontal |
| Bottom sheet drag handle | 32 × 4px, `border.default`, 44px touch area |

| Prohibited | Reason |
|---|---|
| Hover-only reveals | Hover does not exist on touch |
| Swipe-to-delete | Destructive and undiscoverable |
| Gesture-only actions | Every action needs a visible control |
| Long-press requirements | Undiscoverable |

---

## 4. Performance budgets

**FINAL** — Measured on a **mid-range Android over throttled 4G, at p75, in Vietnam**.

| Metric | Target | Design consequence |
|---|---|---|
| **LCP** | ≤ 2.5s | Hero is the LCP element: preloaded, `fetchpriority="high"`, correctly sized, modern format |
| **INP** | ≤ 200ms | Date picker and steppers must feel instant — no network round-trip on tap |
| **CLS** | ≤ 0.1 | **Every image has explicit `width`/`height`.** Skeletons match final dimensions |
| **TTFB** | ≤ 600ms | Server-rendered, in-region hosting |
| Homepage image payload | ≤ 1.2MB above fold | Limits hero count to **one** |
| Initial JS | ≤ 200KB gzipped | No map SDK, no carousel library on first load |
| Web fonts | ≤ 4 files, subset Latin + Latin Extended Additional | `font-display: swap` |

**PROPOSED — three design decisions this forces:**

1. **No hero carousel.** Multiplies LCP candidates; rarely passes slide one.
2. **Static map image by default**, interactive on tap. A map SDK on every property page is a
   performance *and* a cost decision.
3. **Skeletons, not spinners**, wherever the final dimensions are known.

---

## 5. Accessibility — WCAG 2.2 AA

### 5.1 Contrast

| Element | Minimum | Provisional value |
|---|---|---|
| Body text | 4.5:1 | `text.primary` ≈ 16:1 · `text.muted` ≈ 5.4:1 **(the floor)** |
| Large text ≥ 18px | 3:1 | All pass |
| UI component boundaries | 3:1 | `border.focus` ≈ 7:1 |
| Focus indicator | 3:1 against **both** element and background | 2px ring, 2px offset |
| Icons carrying meaning | 3:1 | Semantic icons |

**CI check is blocking** ([76](76-phase-6-color.md) §6.4).

> **Trap 1 — elegant grey.** Light-grey-on-white is a hallmark of premium hospitality design and
> routinely fails 4.5:1. `text.muted` at ≈ 5.4:1 is the floor; anything lighter is rejected.
>
> **Trap 2 — disabled controls.** Exempt from AA, but a disabled control must **never** be the only
> place information lives. The disabled `+` on a stepper is always accompanied by visible text:
> *"6 rooms available for these dates"* at `text.secondary`.

### 5.2 Keyboard navigation

| Component | Contract |
|---|---|
| Skip link | **First focusable element** on every page |
| Tab order | Follows visual order. **No positive `tabindex`** |
| Hotels panel | Opens on focus · arrows navigate · `Esc` closes · **focus returns to trigger** |
| Mobile overlay | Focus trapped · `Esc` closes · focus restored to ☰ |
| Modal / drawer / gallery | Focus trapped · `Esc` closes · focus restored |
| **Date picker** | ← → by day · ↑ ↓ by week · PageUp/Down by month · Enter selects · `Esc` closes |
| Quantity stepper | ← → or ↑ ↓ adjust · value in a live region |
| Tabs | ← → move · Home/End jump · `role="tablist"` |
| Accordion | Enter/Space toggle · `aria-expanded` |
| Admin table | Arrow keys move by cell · Enter opens the row |
| Sticky bottom bar | **Never obscures the focused element** — scroll padding 80px |

### 5.3 Focus states

**FINAL** — 2px ring, 2px offset, `border.focus`, contrast ≥ 3:1 against element **and** background.
`:focus-visible` so mouse users are not shown rings — **but focus is never suppressed outright.**
On dark surfaces the ring switches to `stone.50` to maintain contrast.

### 5.4 Semantic hierarchy

- **One `<h1>` per page**; logical descent, no skipped levels.
- Landmarks: `<header>` · `<nav aria-label>` · `<main>` · `<aside>` · `<footer>`.
- Lists are lists. Tables are `<table>` with `<th scope>`. Buttons are `<button>`; links are `<a>`.
- Property page: `h1` = property name · sections `h2` · room and facility names `h3`.
- A visually small heading is still an `h2` if it opens a section — **size comes from tokens, not tag
  choice**.

### 5.5 Forms

| Requirement | Spec |
|---|---|
| Label | **Above the field, always visible.** Never placeholder-as-label |
| Helper / error | Linked via `aria-describedby` |
| Invalid | `aria-invalid="true"` |
| Error announcement | `role="alert"` |
| Error summary | Top of long forms, with links to the offending fields |
| Required | Marked in text on required fields — not by colour, not by marking optional ones |
| Grouping | `<fieldset>` + `<legend>` |
| Success | Announced in a live region |
| Autofill | Correct `autocomplete` and `inputmode` throughout |

### 5.6 Screen reader behaviour

| Element | Announcement |
|---|---|
| Availability | *"Deluxe Room, 6 rooms available for your dates"* — never an orphan number |
| Quantity change | Live region: *"Deluxe Room, 2 rooms selected"* |
| Your Stay update | **Polite** live region — never assertive interruptions |
| Price | *"1,850,000 dong per room per night"* — **the basis is read, not implied** |
| Gallery | *"Image 3 of 24"* |
| Status timeline | Ordered list; **current state announced first** |
| Language switch | Announces the target language **in that language** — *Tiếng Việt*, not "Vietnamese" |
| `lang` attribute | Correct on `<html>` — drives Vietnamese pronunciation and rendering |
| Star rating | Radio group with visible labels; **not hover-dependent** |

### 5.7 Alt text

**CONFIRMED** — Required in **both locales** before an asset can be used publicly — a **publish gate**,
not a backlog item.

| Image | Approach |
|---|---|
| Property hero | Describe the place: *"The rooftop terrace at dusk, looking north over District 1"* |
| Room | Describe the room: bed, light, view |
| Amenity icon | `aria-hidden`; adjacent text carries meaning |
| Decorative | `alt=""` |
| Review photo | Guest caption, or a generic fallback |

**A hotel gallery is content, not decoration.** English alt text on a Vietnamese page is itself a
failure.

### 5.8 Reduced motion

`prefers-reduced-motion: reduce` →

| Effect | Behaviour |
|---|---|
| Image reveals | Instant, no transform |
| Transitions | 0ms |
| Parallax | Removed entirely |
| Skeleton shimmer | Static |
| Total animation | Removed |
| Auto-advancing anything | **Does not exist in the system** |

**CONFIRMED** — **Nothing requires motion to be understood.** Content and function are identical.

### 5.9 Cognitive accessibility

No time limits on forms. Your Stay expiry **warns and offers an extension** rather than expiring
silently. No flashing content. Plain language throughout — guest-facing status uses everyday wording,
never internal vocabulary. Every error names the next action.

### 5.10 Property accessibility information

**PROPOSED** — Accessibility facts *about the buildings* (step-free entrance, lift, accessible bathroom)
are stated **plainly and completely** in Good to know.

**This is the clearest case where the positive-framing rule does not apply.** A guest who needs
step-free access must be able to find out unambiguously. Blocked on config A9 → **OQ-003**.

---

## 6. Vietnamese typography QA in layout

**FINAL** — Beyond the face-level checks in [75](75-phase-6-typography.md) §7.2, these are **layout**
checks.

| # | Check | Where |
|---|---|---|
| 1 | Button labels wrap to two lines without clipping | All primary buttons at 320px |
| 2 | Nav items fit at 15px without truncation | Header, tablet width |
| 3 | Facts row wraps, never truncates | Room card at 320px |
| 4 | Table column headings fit or wrap | Admin queue |
| 5 | Form labels do not overlap inputs | All forms at 320px |
| 6 | Status labels fit their badges | Request status |
| 7 | Property names do not truncate | Cards, breadcrumbs, panel |
| 8 | Line height 1.70 prevents diacritic collision | Editorial body, 8+ lines |
| 9 | Price + basis fits one line at 320px | Room card |
| 10 | Footer column headings fit | Mobile accordion |

**Vietnamese labels run 10–20% longer than English.** Every check is run with **real strings** from the
B27 label set, at 320px, 375px and 768px.

---

## 7. Testing gates

| Gate | When | Blocking |
|---|---|---|
| Automated axe checks | Every build | ✔ |
| **Contrast verification of all token pairs** | Every build; re-run on brand delivery | ✔ |
| Keyboard-only pass, booking flow | Every release | ✔ |
| Screen-reader pass, booking flow | Pre-launch, then per major change | ✔ |
| Real-device, mid-range Android over 4G | Pre-launch | ✔ |
| Vietnamese layout QA (§6) | On B27 delivery | ✔ |
| Vietnamese diacritic QA ([75](75-phase-6-typography.md) §7.2) | On typeface selection | ✔ |
| Lighthouse CI budgets | Every build | ✔ |
| Reduced-motion pass | Pre-launch | ✔ |

---

## 8. Open dependencies

| ID | Blocks |
|---|---|
| **A8** | Typeface selection · contrast verification against real brand values |
| **B8** | Alt text authoring · image dimension planning · scrim verification |
| **B27 / OQ-061** | Vietnamese layout QA — needs final strings |
| A9 / OQ-031 | Property accessibility facts |
| OQ-003 | Confirmation that factual disclosure overrides positive framing |
