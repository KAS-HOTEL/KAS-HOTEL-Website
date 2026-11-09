# 77 — Layout, Grid & Spacing

**Phase:** 6 — High-Fidelity Visual Design
**Status:** **FINAL — brand-independent.**
**Last updated:** 2026-08-14

---

## 1. Spacing scale

**FINAL** — 4px base. Every margin, padding and gap in the system uses a token from this scale.

| Token | Value | Primary use |
|---|---|---|
| `space.1` | 4px | Icon–label gap, input→helper text |
| `space.2` | 8px | Label→input, chip padding, tight groups |
| `space.3` | 12px | Admin row padding, badge padding |
| `space.4` | 16px | Default gap, paragraph spacing, card padding (mobile) |
| `space.5` | 24px | Card padding (desktop), form field gap |
| `space.6` | 32px | Sub-section gap, card grid gutter |
| `space.7` | 48px | Block gap, unrelated element separation |
| `space.8` | 64px | Section gap (mobile), large block separation |
| `space.9` | 96px | Section gap (tablet), full-bleed breathing room |
| `space.10` | 128px | **Section gap (desktop, editorial)** |
| `space.11` | 160px | Hero→content, exceptional emphasis only |

**PROPOSED** — Values outside this scale are prohibited. `space.11` requires justification in review;
it exists for the single transition from hero into content on the homepage.

---

## 2. Breakpoints

**FINAL**

| Token | Range | Design intent |
|---|---|---|
| `breakpoint.mobile` | **< 768px** | **Primary surface.** Authored first |
| `breakpoint.tablet` | 768–1023px | A genuine layout, not a stretched phone |
| `breakpoint.desktop` | 1024–1439px | Editorial layouts, full navigation |
| `breakpoint.wide` | ≥ 1440px | More whitespace, **not more content** |

**PROPOSED** — Two internal sub-thresholds, used for component reflow only, never for layout changes:
`360px` (smallest supported) and `1280px` (grid gutter step).

---

## 3. Containers

**FINAL**

| Token | Max width | Use |
|---|---|---|
| `container.narrow` | **680px** | Editorial body text, forms, request flow, policy pages |
| `container.content` | **1140px** | Default page container — cards, grids, most sections |
| `container.wide` | **1320px** | Galleries, wide editorial compositions, admin |
| `container.full` | 100% | Hero, flagship band, immersive gallery, footer background |

**PROPOSED — the critical rule:** above 1320px, additional viewport width becomes **margin**. Content
never stretches to fill a 27-inch display. Filling the screen edge to edge is how a premium site starts
looking like a dashboard.

### 3.1 Page gutters

| Breakpoint | Gutter |
|---|---|
| Mobile < 768 | `space.4` **16px** |
| Tablet 768–1023 | `space.6` **32px** |
| Desktop 1024–1439 | `space.7` **48px** |
| Wide ≥ 1440 | `space.8` **64px** |

Gutters are **constant within a breakpoint**. Vertical rhythm carries hierarchy; horizontal padding
does not vary by section.

---

## 4. Grid

**FINAL**

| Breakpoint | Columns | Gutter | Content width |
|---|---|---|---|
| Mobile | **4** | 16px | viewport − 32px |
| Tablet | **8** | 24px | 720px |
| Desktop | **12** | 32px | 1140px |
| Wide | **12** | 40px | 1320px |

### 4.1 Standard column spans

| Layout | Mobile | Tablet | Desktop |
|---|---|---|---|
| Full-width section | 4 | 8 | 12 |
| Editorial text column | 4 | 6 (offset 1) | **6 (offset 3)** — centred, capped at 68ch |
| Two-column editorial (image ∥ text) | 4 stacked | 4 / 4 | **7 / 5** — asymmetric, deliberately |
| Property tile — feature | 4 | 8 | 8 |
| Property tile — standard | 4 | 4 | 6 |
| Property tile — compact | 4 | 4 | 4 |
| Room card | 4 | 8 | 6 |
| Search result row | 4 | 8 | 12 |
| Your Stay side panel | — | — | 4 (sticky) |
| Search results + map | 4 stacked | 8 stacked | 7 list / 5 map |
| Admin sidebar + content | — | 2 / 6 | **240px fixed / remainder** |

**PROPOSED** — The two-column editorial split is **7/5, not 6/6**. Equal halves read as a template;
asymmetry reads as editorial composition and is one of the cheapest ways to avoid a generic look.

---

## 5. Section spacing

**FINAL** — The primary carrier of the Classic Luxury feel.

| Relationship | Mobile | Tablet | Desktop |
|---|---|---|---|
| **Editorial section → editorial section** | `space.8` 64px | `space.9` 96px | **`space.10` 128px** |
| Transactional block → block | `space.6` 32px | `space.6` 32px | `space.7` 48px |
| Hero → first content section | `space.8` 64px | `space.9` 96px | **`space.11` 160px** |
| Before / after a full-bleed band | `space.8` 64px | `space.9` 96px | `space.9` 96px |
| Last section → footer | `space.8` 64px | `space.9` 96px | `space.10` 128px |
| Within a section, heading → content | `space.5` 24px | `space.5` 24px | `space.5` 24px |
| Admin section → section | `space.5` 24px | `space.5` 24px | `space.6` 32px |

**PROPOSED** — 128px between desktop editorial sections is **deliberately generous**. It is the single
most effective non-photographic signal of a premium brand, and the first thing eroded under pressure to
"fit more above the fold". It should be defended in review.

---

## 6. Card spacing

**FINAL**

| Card | Padding (mobile) | Padding (desktop) | Internal gap |
|---|---|---|---|
| Property card | `space.4` 16px | `space.5` 24px | `space.3` 12px |
| Room card | `space.4` 16px | `space.5` 24px | `space.4` 16px |
| Review card | `space.4` 16px | `space.5` 24px | `space.3` 12px |
| Facility card | `space.4` 16px | `space.5` 24px | `space.3` 12px |
| Your Stay line | `space.4` 16px vertical | `space.4` 16px vertical | `space.2` 8px |
| Admin dashboard card | `space.4` 16px | `space.5` 24px | `space.3` 12px |
| Admin table cell | `space.3` 12px × `space.4` 16px | same | — |

**PROPOSED** — **Card imagery is flush to the card edge** — zero padding above the image. The image
meets the card boundary squarely (`radius.none` on the image, `radius.md` on the card). Padded imagery
inside a card reads as a widget, not a piece of editorial.

### 6.1 Grid gutters between cards

| Grid | Mobile | Tablet | Desktop |
|---|---|---|---|
| Property tiles (editorial, varied) | `space.6` 32px | `space.6` 32px | **`space.7` 48px** |
| Room cards | `space.4` 16px | `space.5` 24px | `space.6` 32px |
| Review cards | `space.4` 16px | `space.5` 24px | `space.6` 32px |
| Admin dashboard cards | `space.4` 16px | `space.4` 16px | `space.5` 24px |

Property tiles use a **larger gutter than any other grid**. They are editorial objects, not a results
list, and the extra separation is what stops eight tiles reading as a table.

---

## 7. Aspect ratios

**FINAL** — Every image slot has a fixed ratio, so `width`/`height` are always known and CLS is
structurally prevented.

| Token | Ratio | Use |
|---|---|---|
| `aspect.hero` | **16:9** desktop · **4:5** mobile | Property and home hero |
| `aspect.heroWide` | **21:9** | Flagship band, full-bleed editorial |
| `aspect.tile` | **4:3** | Property tiles |
| `aspect.tileFeature` | **3:2** | Feature property tile |
| `aspect.card` | **3:2** | Room cards, facility cards |
| `aspect.gallery` | native, letterboxed | Immersive gallery — preserves the photographer's framing |
| `aspect.thumb` | **1:1** | Gallery thumbnails, Your Stay property thumb, admin media tiles |
| `aspect.social` | **1.91:1** | Open Graph — matters for Zalo and Messenger sharing |

**PROPOSED** — The **mobile hero switches to 4:5 portrait**, not a cropped landscape. A 16:9 hero on a
phone is a letterbox strip; 4:5 fills the viewport and gives the photograph presence. This requires a
separate crop per image ([83](83-phase-6-motion-photography.md) §4).

---

## 8. Z-index scale

**FINAL**

| Token | Value | Use |
|---|---|---|
| `z.base` | 0 | Page content |
| `z.sticky` | 100 | Sticky stay bar, sticky header, sticky side panel |
| `z.dropdown` | 200 | Hotels panel, select menus, date picker |
| `z.overlay` | 300 | Mobile menu overlay, immersive gallery |
| `z.modal` | 400 | Modals, drawers, bottom sheets, confirmation dialogs |
| `z.toast` | 500 | Toasts — always above everything |

Values outside this scale are prohibited. Arbitrary `z-index: 9999` is a defect.

---

## 9. Page layout patterns

### 9.1 Editorial page — Home, Collection, Property, About

```
┌ HERO — container.full, aspect.hero ──────────────────────────┐
└──────────────────────────────────────────────────────────────┘
                     space.11 (160px desktop)
┌ SECTION — container.content ─────────────────────────────────┐
│  heading (space.5 below) · content                           │
└──────────────────────────────────────────────────────────────┘
                     space.10 (128px)
┌ FULL-BLEED BAND — container.full, surface.inverse ───────────┐
└──────────────────────────────────────────────────────────────┘
                     space.9 (96px)
┌ SECTION — container.content ─────────────────────────────────┐
└──────────────────────────────────────────────────────────────┘
                     space.10
┌ FOOTER — container.full, surface.inverse ────────────────────┐
```

### 9.2 Transactional page — Search, Room list, Your Stay

```
┌ HEADER (sticky, z.sticky) ───────────────────────────────────┐
├ SEARCH CONTEXT BAR ──────────────────────────────────────────┤
│                     space.6 (32px)                           │
├ container.content ───────────────────┬───────────────────────┤
│  Results / room cards                │  Your Stay panel      │
│  space.6 between cards               │  sticky, z.sticky     │
│  (8 cols desktop)                    │  (4 cols)             │
└──────────────────────────────────────┴───────────────────────┘
```

### 9.3 Form page — Details, Review, Account

```
┌ container.narrow (680px), centred ───────────────────────────┐
│  Step indicator                                              │
│                     space.6                                  │
│  Field group        space.5 between fields                   │
│                     space.7 between groups                   │
│                     space.7                                  │
│  Primary action (full-width mobile, auto desktop)            │
└──────────────────────────────────────────────────────────────┘
```

**PROPOSED** — Forms use `container.narrow` even on wide displays. A 1140px-wide form is harder to
complete than a 680px one; the eye loses the label–input relationship across long horizontal distances.

### 9.4 Admin page

```
┌ TOP BAR — 56px fixed ────────────────────────────────────────┐
├──────────┬───────────────────────────────────────────────────┤
│ SIDEBAR  │  container.wide (1320px)                          │
│ 240px    │  Page heading (with property scope echoed)        │
│ fixed    │                space.5                            │
│          │  Filter bar                                       │
│          │                space.4                            │
│          │  Content — table / calendar / workspace           │
└──────────┴───────────────────────────────────────────────────┘
```

---

## 10. Sticky behaviour

**FINAL**

| Element | Trigger | Height | Breakpoints |
|---|---|---|---|
| Header (condensed) | Scroll > 120px | 64px desktop · 56px mobile | All |
| Property stay bar | Hero leaves viewport | 64px | Desktop, tablet |
| Property sub-nav chips | Below identity bar | 48px | Mobile, tablet |
| Your Stay side panel | Below search context bar | auto, `max-height: calc(100vh - 120px)` | Desktop |
| **Mobile bottom bar** | Always, context-aware | **64px** | Mobile only |
| Admin top bar | Always | 56px | All |
| Admin table header | Table scroll | 40px | All |

**PROPOSED — the collision rule:** the mobile bottom bar and any sticky header **never both compress
the viewport below 60% of its height**. On short viewports (< 640px tall) the sub-nav chips hide and
only the bottom bar persists. Scrollable content carries `padding-bottom: 80px` so the bar never covers
the last element or a focused input.

---

## 11. Responsive reflow rules

**FINAL** — How each layout collapses, in order.

| Desktop | Tablet | Mobile |
|---|---|---|
| 12-col editorial, 7/5 asymmetric | 8-col, 4/4 | 4-col stacked, image first |
| Property tiles varied (8/6/4) | 2-up varied | 1-up full-width |
| Room list + sticky Your Stay panel | Room list, Your Stay as a bottom sheet | Room list, Your Stay as a bottom sheet |
| Search list + map side by side | List, map as a toggle | List, map as a full-screen mode |
| Form 680px centred | 680px centred | Full-width − 32px gutters |
| Admin sidebar + table | Collapsible sidebar + table | Sidebar as a drawer, table as card rows |
| Gallery 3-col grid | 2-col grid | 1-col + horizontal swipe |
| Footer 5 columns | 3 columns | 1 column, accordion |

**CONFIRMED** — Mobile is authored first and reflow is designed, not derived. Where the desktop pattern
does not collapse sensibly, the mobile pattern is **different by design** — see
[82](82-phase-6-responsive-accessibility.md).

---

## 12. Layout QA checklist

| # | Check |
|---|---|
| 1 | Every spacing value maps to a `space.*` token |
| 2 | No content exceeds `container.wide` at any viewport |
| 3 | Editorial text is capped at 68ch regardless of container |
| 4 | Every image slot has a declared `aspect.*` and explicit dimensions |
| 5 | Section rhythm is 128/96/64 desktop/tablet/mobile on editorial pages |
| 6 | Page gutters are constant within a breakpoint |
| 7 | Sticky elements never occupy more than 40% of viewport height combined |
| 8 | Scrollable regions have bottom padding clearing the mobile bar |
| 9 | No `z-index` outside the `z.*` scale |
| 10 | Two-column editorial is asymmetric (7/5), not 6/6 |
| 11 | Forms use `container.narrow` at every breakpoint |
| 12 | Card imagery is flush to the card edge |
