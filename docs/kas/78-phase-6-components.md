# 78 — Component Library

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Implementation-ready. Colour and typeface values are `PROVISIONAL`.
**Last updated:** 2026-08-14

> Every component below is specified with **anatomy · variants · states · spacing · typography ·
> responsive · accessibility · interaction · usage rules**. Tokens are defined in
> [75](75-phase-6-typography.md)–[77](77-phase-6-layout-grid.md).

---

## 1. Universal state contract

**FINAL** — Every interactive component implements these states. No component may omit one.

| State | Specification |
|---|---|
| **Default** | Resting |
| **Hover** | `motion.fast` 150ms. Elevation `shadow.sm→md` and/or surface shift. **Never the only affordance** |
| **Focus-visible** | `border.focus` **2px ring, 2px offset**, contrast ≥ 3:1. Never suppressed |
| **Active** | Darker action token; no transform on buttons |
| **Disabled** | `action.*.disabled`, `cursor: not-allowed`, `aria-disabled`. **Always accompanied by a visible reason** |
| **Loading** | Spinner replaces the leading icon; label retained; `aria-busy`; non-cancellable on submit |
| **Error** | `error.500` border + icon + message. **Never colour alone** |
| **Selected** | `border.strong` + `surface.sunken`, plus a non-colour indicator |

---

## 2. Navigation

### 2.1 Header

**Anatomy** — logo · primary nav (4 items) · utility cluster (VI/EN · ₫/$ · account · stay control).

| Property | Value |
|---|---|
| Height | 88px resting · **64px condensed** (desktop) · 72/56px (mobile) |
| Surface | `transparent` over hero → `surface` + `shadow.sm` + `border.subtle` on scroll > 120px |
| Container | `container.wide`, page gutters |
| Nav item | `font.size.nav` 15px/500, `text.secondary`; active `text.primary` + 2px `accent.500` underline offset 6px |
| Gap between nav items | `space.6` 32px |
| Logo max height | 32px resting · 24px condensed |
| Z | `z.sticky` 100 |

**Variants** — `transparent` (over hero, `text.inverse`) · `solid` (default) · `condensed` (scrolled).
**Responsive** — Desktop: full. Tablet: nav collapses to Hotels ▾ + menu. Mobile: §2.4.
**Accessibility** — `<header>` + `<nav aria-label="Primary">`; skip link is the first focusable element;
`aria-current="page"`.
**Interaction** — Condense transition `motion.base` 250ms. **Never hides on scroll-down** — booking
intent must always be reachable.

### 2.2 Hotels panel (mega-panel)

**Anatomy** — title "Our Houses" · 8 property entries in 2 columns · footer links (Compare · Map ·
Coming soon).

| Property | Value |
|---|---|
| Width | 720px, right-aligned to trigger |
| Surface | `surface.elevated` + `shadow.lg`, `radius.md` |
| Padding | `space.6` 32px |
| Entry | 56×56px thumbnail (`aspect.thumb`, `radius.sm`) + name + signature line |
| Entry gap | `space.4` 16px |
| Name / signature | `heading-sm` 18px/600 · `caption` 13px `text.muted` |
| Flagship entry | 72×72px thumbnail, listed **first**. **No badge, no label** |

**Usage rules** — **All eight always listed**, generated from data, ordered `isFlagship` then
`sortOrder`. Never "top 4 + view all" — that ranks KAS's own properties.
**Accessibility** — Opens on hover **and** focus; arrow-key navigable; `Esc` closes and **returns focus
to the trigger**; `aria-expanded` on trigger.

### 2.3 Footer

**Anatomy** — 5 columns (Our Hotels · Discover · Your Stay · Policies · KAS) · base row (legal entity
`[PLACEHOLDER]` · language · currency · social · copyright).

| Property | Value |
|---|---|
| Surface | `surface.inverse` |
| Padding | `space.10` 128px top, `space.8` 64px bottom (desktop) |
| Column heading | `label` 13px/600, `text.inverse.muted`, `tracking.wide` |
| Link | `body-sm` 14px, `text.inverse`; hover underline |
| Link gap | `space.3` 12px |
| Base row | `caption` 13px, `text.inverse.muted`, `border-top` `stone.400` @20% |

**Responsive** — Desktop 5 cols · Tablet 3 cols · **Mobile 1 column with accordion groups**.

### 2.4 Mobile navigation

Three mechanisms ([82](82-phase-6-responsive-accessibility.md) §2):

| Mechanism | Spec |
|---|---|
| **Header** | ☰ · logo · ⌕ · ◔ — 56px, four 44px targets |
| **Bottom bar** | 64px, `surface.elevated`, `shadow.lg`, `z.sticky`. **Context-aware primary action** |
| **Menu overlay** | Full-screen, `surface`, **one level deep**. All 8 hotels listed directly |

**Overlay** — slides from left `motion.base` 250ms; focus trapped; `Esc`/✕ closes; body scroll locked.

### 2.5 Breadcrumb

`caption` 13px, `text.muted`; separator `/` with `space.2` either side; current page `text.secondary`,
**not a link**. Property path only. Mobile: single line, horizontally scrollable, no wrap.
**Accessibility** — `<nav aria-label="Breadcrumb">` + ordered list; server-rendered `BreadcrumbList`
schema matching exactly.

---

## 3. Hero

**Anatomy** — full-bleed image · scrim · content block (eyebrow · headline · sub-line · CTA) · anchored
search panel (home only).

| Property | Value |
|---|---|
| Container | `container.full` |
| Aspect | `aspect.hero` 16:9 desktop · **4:5 mobile** |
| Min height | 560px desktop · 480px tablet · 70vh mobile |
| Scrim | `linear-gradient(to top, scrim 0%, transparent 55%)` |
| Content position | Bottom-left, `space.9` 96px from bottom, `space.7` 48px from left edge of `container.content` |
| Headline | `display-xl` 72/56/40px, `text.inverse` |
| Sub-line | `body-lg` 18px, `text.inverse.muted`, max 2 lines |
| Search panel | Overlaps the hero base by 50%, `surface.elevated`, `shadow.lg`, `radius.md` |
| Radius on image | **`radius.none`** |

**Variants** — `home` (with search panel) · `property` (identity bar below) · `editorial` (no CTA).
**Usage rules** — **One image. No carousel** — it multiplies LCP candidates and rarely passes slide
one. No autoplay video with sound. Crop must be **subject-safe**: the scrim region must not cover the
subject.
**Accessibility** — Headline is the `<h1>` on home; descriptive `alt`; contrast measured against the
**darkest scrim region**, not the average.
**Performance** — LCP element: preloaded, `fetchpriority="high"`, explicit dimensions.

---

## 4. Booking search

**Anatomy** — Where · When · Who · Rooms · submit.

| Property | Value |
|---|---|
| Height | 72px desktop · auto mobile |
| Surface | `surface.elevated`, `radius.md`, `shadow.lg` |
| Field padding | `space.4` 16px horizontal, `space.3` 12px vertical |
| Field divider | 1px `border.subtle`, full height |
| Field label | `label` 13px/600, `text.muted`, `tracking.wide` |
| Field value | `body` 16px/500, `text.primary` |
| Submit | 48×48px `action.primary`, `radius.md`, search icon |

**Variants** — `hero` (anchored, full width) · `header` (condensed pill, shows current search) ·
`inline` (search results page) · `mobile` (full-screen sequential).
**Responsive** — Desktop: single row. Tablet: 2×2. **Mobile: tapping any field opens a full-screen
sequential flow — Where → When → Who → Search, one decision per screen.**
**Usage rules** — Defaults are **never empty**: tonight → tomorrow, 2 adults, 1 room. All state
URL-encoded.
**Accessibility** — `<form role="search">`; each field a labelled button opening a popover; the popover
is focus-trapped with `Esc` to close.

---

## 5. Property components

### 5.1 Property card

**Anatomy** — image · (optional availability badge) · name · signature line · district · character tags
· from-price · review score.

| Property | Value |
|---|---|
| Surface | `surface`, `radius.md`, `shadow.none` resting |
| Image | Flush to card edge, `radius.none`, `aspect.tile` 4:3 (feature: `aspect.tileFeature` 3:2) |
| Body padding | `space.5` 24px desktop · `space.4` 16px mobile |
| Name | `heading-md` 22px/600, `text.primary` |
| Signature line | `body-sm` 14px, `text.secondary`, **clamp 2 lines** |
| District | `metadata` 14px/500, `text.muted` |
| Character tags | Chips, `caption` 13px, `surface.sunken`, `radius.pill`, `space.2` padding |
| From-price | `price` 18px/600 + "from" `body-sm` `text.secondary` |
| Internal gap | `space.3` 12px |

**Variants** — `feature` (8 cols, image left, text right, asymmetric) · `standard` (6 cols, stacked) ·
`compact` (4 cols) · `coming-soon` (muted, no price, no availability).
**States** — hover: `shadow.md` + 2px lift `motion.fast`; image scale 1.02 with `overflow: hidden`.
**Usage rules** — **Never a uniform grid.** Tiles alternate size and image alignment. Milestone appears
first with `feature` treatment — **placement is the only emphasis; no badge, no tier label**.
**Accessibility** — Whole card is one link; name is the accessible name; hover scale respects
`prefers-reduced-motion`.

### 5.2 Property grid

Editorial varied layout, **not** an equal grid.

| Breakpoint | Pattern |
|---|---|
| Desktop | Row 1: feature (8) + compact (4). Row 2: standard (6) + standard (6). Row 3: compact ×3 (4/4/4). Alternating image alignment |
| Tablet | 2-up, alternating feature/standard |
| Mobile | 1-up full-width, all `standard` |

Gutter `space.7` 48px desktop — larger than any other grid, so eight tiles read as editorial rather
than as a table.

### 5.3 Property hero + identity bar

**Anatomy** — hero image · identity bar (name · signature · district · score · from-price) · sticky
stay bar.

| Element | Spec |
|---|---|
| Name | `display-md` 40px, `text.primary` |
| Signature | `body-lg` 18px, `text.secondary`, `space.2` below |
| Meta row | `metadata` 14px/500, `text.muted`, middot-separated |
| Identity bar padding | `space.7` 48px vertical |
| Gallery count chip | `caption` 13px on `scrim`, bottom-right of hero, `space.4` inset |

### 5.4 Facility card

For Dining · Rooftop · Wellness ([79](79-phase-6-customer-screens.md) §3).

| Property | Value |
|---|---|
| Layout | Asymmetric 7/5 — image and text alternate side per card |
| Image | `aspect.card` 3:2, `radius.none` |
| Title | `display-sm` 30px display face |
| Body | `body-lg` 18px/1.70, max 68ch |
| Meta | Hours, access — `body-sm`, `text.secondary` |
| Gap between cards | `space.9` 96px |

**Usage rules** — Renders for **any property with facility content**, not only the flagship. This is
the structural guarantee that flagship treatment is additive.

---

## 6. Room components

### 6.1 Room card

**Anatomy** — image · name · facts row · highlight amenities · price block · availability · quantity
stepper · add button · details link.

| Element | Spec |
|---|---|
| Layout | Desktop: image left 5/12, content right 7/12. Mobile: stacked, image top |
| Image | `aspect.card` 3:2, `radius.none`, swipeable on mobile |
| Name | `heading-md` 22px/600 |
| Facts row | `metadata` 14px/500, `text.secondary`, middot-separated. **Wraps, never truncates** |
| Amenities | 3–4 icon+label pairs, `caption` 13px, `space.4` gap |
| Price | `price-lg` 26px/600 + basis `body-sm` `text.secondary` + USD `price-sm` `text.muted` |
| Availability | See 6.3 |
| Card padding | `space.5` 24px |
| Top rule | 1px `border.subtle` between cards |

**States** — `available` · `selected` (`border.strong` + `surface.sunken` + quantity shown) ·
`unavailable` (60% opacity, controls disabled, **reason text visible**, nearest dates offered) ·
`loading`.
**Usage rules** — Unavailable cards stay **visible and muted, never removed**.

### 6.2 Quantity selector

```
[ − ]  2  [ + ]
```

| Property | Value |
|---|---|
| Track | `radius.pill`, `border.default`, height 44px |
| Buttons | 44×44px, `action.ghost` |
| Value | `heading-sm` 18px/600, min-width 40px, centred, **tabular figures** |
| Disabled `+` | `text.disabled` + **inline reason below**: *"6 rooms available for these dates"* |

**Usage rules** — Range `0 … min(availableDirect across all nights, config B15)`. Zero removes the line
**with undo**. **Never a free-text number input.**
**Accessibility** — `role="group"` with an accessible name; buttons labelled "Decrease/Increase
[room name]"; value in an `aria-live="polite"` region announcing *"Deluxe Room, 2 rooms selected"*.

### 6.3 Availability badge

| Variant | Surface | Text | Content |
|---|---|---|---|
| `available` | `success.100` | `success.500` | "6 rooms available for your dates" |
| `limited` | `warning.100` | `warning.500` | "2 rooms available" — **only when literally true** |
| `unavailable` | `stone.100` | `text.muted` | "Not available 12–14 Sep" |
| `not-open` | `stone.100` | `text.muted` | "Not yet open for booking" |
| `degraded` | `info.100` | `info.500` | "Availability temporarily unavailable" |

`caption` 13px/500, `radius.sm`, `space.2`×`space.3` padding, icon + text.
**CONFIRMED** — Never a fabricated number. Never manufactured urgency.

### 6.4 Room gallery

Primary image + thumbnail strip; immersive full-screen on tap.

| Element | Spec |
|---|---|
| Primary | `aspect.card`, `radius.none` |
| Thumbnails | 72×72 `aspect.thumb`, `space.2` gap, active `border.strong` 2px |
| Immersive | `surface.inverse`, `z.overlay`, `aspect.gallery` letterboxed, caption bottom-left `caption` on scrim |
| Counter | "3 / 24" `caption`, top-right |

**Accessibility** — Focus trapped; `Esc` closes and restores focus; arrow keys navigate; position
announced *"Image 3 of 24"*; every image has alt text.

### 6.5 Amenity list

Grouped by category. Icon 20px + label `body-sm` 14px, `space.2` gap. Grid: 3 cols desktop, 2 tablet,
1 mobile; `space.3` row gap, `space.6` column gap. Highlights promoted to the top with
`font.weight.medium`.
**Usage rules** — **Icons never appear alone.** Category headings `label` 13px/600 `text.muted`
`tracking.wide`.

### 6.6 Price display

```
1.850.000 ₫   per room / night
≈ $73         approximate
```

Amount `price-lg`/`price` 600 **tabular figures** `text.primary` · basis `body-sm` `text.secondary` ·
USD `price-sm` `text.muted`.
**CONFIRMED** — Basis always shown. **USD never appears at or after commitment.**

---

## 7. Location block

**Anatomy** — static map image · address · directions · nearby landmarks list.

| Element | Spec |
|---|---|
| Map | **Static image by default**, `aspect.card` 3:2, `radius.md`. Interactive on tap |
| Address | `body` 16px, `text.primary` |
| Landmark row | Name `body-sm` + distance `metadata` `text.muted`, `space.3` gap |
| Layout | 7/5 asymmetric — map left, list right |

**Usage rules** — Static-first is a performance **and** cost decision. All distances `[PLACEHOLDER]`
pending OQ-060; **never estimated**.

---

## 8. Review components

### 8.1 Review card

| Element | Spec |
|---|---|
| Surface | `surface`, `radius.md`, `border.subtle` |
| Padding | `space.5` 24px |
| Rating | Stars 16px + numeral `heading-sm` 18px/600 |
| Name + badge | `body-sm` 14px/500 + Verified Stay badge |
| Meta | `caption` 13px `text.muted` — **stay month only, never exact dates** |
| Sub-scores | 5 inline pairs, `caption` 13px, `space.4` gap, wraps |
| Body | `body` 16px/1.70, clamp 6 lines with "Read more" |
| Photos | 72×72 `aspect.thumb` row, `space.2` gap |
| Reply | `surface.sunken`, left rule 2px `border.default`, `space.4` padding, `space.4` above |

**CONFIRMED** — **Moderation state is never shown to guests.**

### 8.2 Verified Stay badge

`accent.100` bg, `accent.600` text, `caption` 13px/600, `radius.sm`, check icon + "Verified Stay",
`space.1`×`space.2` padding.
**Usage rules** — Applied **only** where a completed reservation exists. Never decorative.

---

## 9. Actions

### 9.1 Button

| Size | Height | Padding | Type |
|---|---|---|---|
| `sm` | 36px | `space.4` 16px | `button` 15px/600 |
| `md` | 44px | `space.5` 24px | `button` 15px/600 |
| `lg` | 52px | `space.6` 32px | `button` 15px/600 |

| Variant | Spec |
|---|---|
| `primary` | `action.primary`, `radius.md`. **One per view** |
| `secondary` | transparent + `border.default`, `text.primary` |
| `ghost` | transparent, `text.accent`, underline on hover |
| `quiet` | The header stay control — bordered, low emphasis. **Premium signals confidence, not volume** |
| `destructive` | `action.destructive` — admin only |

**Usage rules** — **Sentence case, never uppercase.** `radius.md` 8px, **never `radius.pill`**.
**No fixed width** — `min-width: 140px` only, so Vietnamese labels (10–20% longer) never clip.
Full-width on mobile within forms.
**Accessibility** — `<button>` for actions, `<a>` for navigation. 44px minimum target. Loading retains
the label and sets `aria-busy`.

### 9.2 CTA band

Full-bleed `surface.inverse`, `space.10` 128px vertical, centred `container.narrow`. Headline
`display-lg`, sub-line `body-lg` `text.inverse.muted`, one `primary` button.
**Usage rules** — **Maximum one per page.**

---

## 10. Forms

### 10.1 Input

| Element | Spec |
|---|---|
| Height | 48px (**≥ 44px touch, ≥ 16px font to prevent iOS zoom**) |
| Padding | `space.4` 16px |
| Border | `border.default` 1px, `radius.sm` |
| Label | **Above, always visible**, `label` 13px/600, `space.2` below |
| Helper | `caption` 13px `text.muted`, `space.1` below |
| Error | `error.500` border + icon + message `caption` `error.500` |
| Focus | `border.focus` 2px, 2px offset |

**Usage rules** — **Never placeholder-as-label.** Validation **on blur, not on submit**. Required
marked on required fields, not optional ones. Correct `autocomplete` and `inputmode`.
**Accessibility** — `<label for>`; helper and error linked via `aria-describedby`; `aria-invalid` on
error; error announced via `role="alert"`.

### 10.2 Select · 10.3 Date picker · 10.4 Guest selector

| Component | Key specification |
|---|---|
| **Select** | Native on mobile; custom listbox on desktop (`surface.elevated`, `shadow.md`, 44px options, arrow-key navigation, type-ahead) |
| **Date picker** | Desktop **2 months side by side**; **mobile 1 scrollable month column**. Day cell 44×44px. Range: start `accent.500`, between `accent.100`, end `accent.500`. Past disabled. Arrows move by day, PageUp/Down by month, Enter selects, Esc closes. **Never a shrunken desktop calendar on mobile** |
| **Guest selector** | Adults and children **separated**, **age input per child**, steppers. Live capacity guidance — **advisory, never blocking** |

---

## 11. Feedback

| Component | Spec |
|---|---|
| **Alert** | Inline. `status.*` bg + 3px left rule + icon + title `heading-sm` + body `body-sm`. `space.4` padding, `radius.sm`. **Icon + colour + text, never colour alone** |
| **Toast** | `surface.elevated`, `shadow.lg`, `radius.md`, bottom-right desktop / bottom-full mobile above the bar. Auto-dismiss 5s (**never for errors**). `role="status"`; errors `role="alert"` |
| **Modal** | `surface.overlay`, `radius.lg`, `shadow.xl`, max 560px, `space.6` padding. Backdrop `color.scrim`. Focus trapped, `Esc` closes, focus restored, body scroll locked. **Never used for booking steps — those are pages** |
| **Drawer** | Right (desktop) / bottom sheet (mobile). `radius.lg` on leading edges. Drag handle on mobile. Same focus contract as modal |
| **Confirmation dialog** | Modal variant. Title states the consequence, not "Are you sure?". Destructive action is `destructive`; cancel is `secondary` and **focused by default** |

---

## 12. Structure

| Component | Spec |
|---|---|
| **Accordion** | Header 56px, `heading-sm`, chevron rotates 180° `motion.fast`. `border.subtle` between items. `<button aria-expanded>` + region. **Never for content required to make a decision** |
| **Tabs** | 48px, `body` 16px/500; active `text.primary` + 2px `accent.500` underline. Arrow-key navigation, `role="tablist"`. Mobile: horizontally scrollable, no wrap |
| **Pagination** | 44×44px targets, current `action.primary`. `<nav aria-label="Pagination">`, `aria-current="page"`. Used on reviews only |
| **Status badge** | `caption` 13px/600, `radius.sm`, `space.1`×`space.2`. Guest-facing = plain language; admin = operational. **Icon + text always** |

---

## 13. States

| Component | Spec |
|---|---|
| **Empty state** | Centred, `container.narrow`. Optional 48px icon `text.muted` · title `heading-md` · body `body-sm` `text.secondary` · **one action**. `space.9` 96px vertical padding. **Neutral tone — never apologetic, never fabricated** |
| **Loading** | **Skeletons at final dimensions**, `surface.sunken`, `radius.sm`, subtle shimmer (disabled under reduced motion). Server-rendered shells have no loading state. **Your Stay recalculation keeps the previous total visible rather than blanking** |
| **Error** | Inline for field/section; full-page for 404/500/410. Icon + title + plain explanation + action + correlation ID `caption` `text.muted`. **Every booking-path error shows a phone number** |

---

## 14. Admin components

| Component | Spec |
|---|---|
| **Admin sidebar** | 240px fixed, `surface.sunken`, `border.subtle` right. Group heading `label` 13px `text.muted` `tracking.wide`; item 40px, `body-sm` 14px; active = `surface` + 3px `accent.500` left rail + `text.primary`. Badge = actionable counts only. Collapsible to 64px icons |
| **Admin table** | Row 48px, cell padding `space.3`×`space.4`. Header 40px sticky, `label` 13px/600, sortable with arrow. `border.subtle` **horizontal rules only — no vertical rules**. Zebra `surface.sunken`. Hover `surface.sunken`. **Tabular figures on every numeric column.** `<table>` with `<th scope>`; arrow-key cell navigation; Enter opens the row |
| **Admin filter bar** | 56px, `surface`, `border.subtle` bottom. Chips `radius.pill`, `caption` 13px, active `accent.100`/`accent.600` with an ✕. "Clear all" `ghost`. **State in the URL so a view is bookmarkable** |
| **Admin dashboard card** | `surface`, `radius.md`, `border.subtle`, `space.5` padding. Title `label` 13px `text.muted`; metric `display-sm` 30px **tabular**; delta `caption` with semantic colour **+ arrow icon**; optional sparkline 32px. Whole card is a link where a drill-down exists |
| **Admin calendar (inventory)** | Row = room type (sticky first column 180px), column = date (56px wide, 7-day groups separated by 2px `border.default`). Cell 48px shows `available / total` `caption` **tabular**. Colour weight by availability ratio; sold-out `error.100`; maintenance diagonal hatch **+ icon**. Hover popover shows the full breakdown. **`available` is displayed and never editable.** Horizontal scroll with sticky row headers; desktop only |
| **Media uploader** | Dropzone 200px, 2px dashed `border.default`, `radius.md`; hover/drag `accent.500` + `accent.100`. Per-file row: 48×48 thumb · name · progress bar 4px `accent.500` · status icon. **⚠ badge on any asset lacking alt text** |
| **Media gallery / library** | Grid 4/3/2 cols, `aspect.thumb`, `space.3` gap. Tile shows category chip, usage count, **⚠ missing-alt badge**. Selected = 2px `accent.500` + check. Drag to reorder in gallery mode; **cover marked ★**. Delete **blocked while in use — the block names the usages** |

---

## 15. Component QA checklist

| # | Check |
|---|---|
| 1 | All eight universal states implemented (§1) |
| 2 | Focus-visible present, 2px/2px offset, ≥ 3:1 — never suppressed |
| 3 | Touch targets ≥ 44×44px with ≥ 8px separation |
| 4 | No colour-only meaning anywhere |
| 5 | Every disabled control carries a visible reason |
| 6 | Every spacing value maps to a `space.*` token |
| 7 | Every image slot has a declared `aspect.*` |
| 8 | No component uses a value outside the token scales |
| 9 | Buttons have no fixed width — Vietnamese labels wrap cleanly |
| 10 | No uppercase in navigation, headings or buttons |
| 11 | Numeric columns and prices use tabular figures |
| 12 | Motion respects `prefers-reduced-motion` |
| 13 | No component exposes a denylisted field ([58](58-phase-4-api-contract.md) §9) |
| 14 | Guest-facing components never show internal states or room numbers |
