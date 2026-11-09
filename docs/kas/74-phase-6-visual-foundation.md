# 74 — Visual Foundation

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Implementation-ready specification. **Colour and typeface values are `PROVISIONAL`.**
**Last updated:** 2026-08-14

> Phase 4 ([51](51-phase-4-configuration.md)–[63](63-phase-4-validation.md)) governs domain and
> contracts. Phase 5 ([64](64-phase-5-ux-principles.md)–[73](73-phase-5-validation.md)) governs UX and
> IA. **Phase 6 adds visual precision only. No prior decision is changed.**

---

## 1. Visual philosophy

**CONFIRMED** — Classic Luxury × Modern Hospitality × Local Heritage.

**PROPOSED — the operating rule that makes it buildable:**

> KAS achieves elegance through **photography, typography, spacing and composition** — never through
> decorative UI effects. If a screen needs a gradient, a glass panel or a glow to look good, the
> photography, type scale or spacing is wrong.

### 1.1 The four instruments, in priority order

| # | Instrument | Carries | Budget |
|---|---|---|---|
| 1 | **Photography** | Atmosphere, place, quality | 45–60% of above-fold area on editorial pages |
| 2 | **Typography** | Hierarchy, voice, credibility | 3 sizes maximum per viewport |
| 3 | **Spacing** | Calm, luxury, grouping | 96–128px between editorial sections at desktop |
| 4 | **Composition** | Rhythm, distinctiveness | Alternating alignment, varied tile sizes |

**PROPOSED** — Decorative effects (`gradient`, `blur`, `glow`, `texture overlay`) are **not in the
system**. There is no token for them. This is deliberate: an unavailable token cannot be misused.

---

## 2. Luxury level

**PROPOSED** — Calibrated explicitly, because "luxury" without a level is unbuildable.

| Dimension | KAS position | Not this |
|---|---|---|
| Formality | **Refined, not formal** | Not black-tie; not gold-and-serif opulence |
| Ornament | **None** | No flourishes, borders-as-decoration, crests |
| Colour | **Near-monochrome + one accent** | Not jewel-toned, not luxury-cliché gold |
| Type | **One display face, restrained** | Not multiple decorative faces |
| Density | **Low on editorial, medium on transactional** | Not sparse-to-the-point-of-empty |
| Photography | **Documentary-warm** | Not glossy over-retouched hotel-brochure |

**PROPOSED — the calibration sentence:** KAS sits closer to *a well-made independent hotel group* than
to *an international luxury chain*. Ornament signals the latter; restraint and real photography signal
the former, and the former is what KAS actually is.

---

## 3. Visual density

**PROPOSED** — Three density modes, each with measurable targets.

| Mode | Where | Vertical rhythm | Elements per viewport | Type sizes |
|---|---|---|---|---|
| **Editorial** | Home, Collection, Property story, About, Experiences | 96–128px section gaps | **3–5** | ≤ 3 |
| **Transactional** | Search, room list, Your Stay, forms, account | 32–48px block gaps | 6–12 | ≤ 4 |
| **Operational** | Admin | 8–16px row gaps | 20–60 | ≤ 3 |

**PROPOSED** — Density is a **property of the surface, not the brand**. The same tokens produce all
three; only spacing selection changes. This is what lets admin be dense without looking unrelated to
KAS ([80](80-phase-6-admin-screens.md) §1).

---

## 4. Whitespace philosophy

**PROPOSED**

| Rule | Specification |
|---|---|
| Whitespace is structural | It groups and separates. It is never "leftover" |
| **Vertical > horizontal** | Section separation carries hierarchy; horizontal padding stays constant |
| Section rhythm | Desktop 128px · Tablet 96px · Mobile 64px between editorial sections |
| Related elements | ≤ 16px apart |
| Unrelated elements | ≥ 48px apart |
| **Never compensate with smaller type** | If a section feels tight, add space. Reducing type size below the scale is prohibited |
| Full-bleed breathing | A full-bleed image is preceded and followed by ≥ 96px desktop |
| Wide viewports | Extra width above 1320px becomes **margin, not content** |

**PROPOSED — the density trap.** Dense layouts are the visual signature of budget travel sites. Every
time a stakeholder asks to "fit more above the fold", the correct answer is that fitting less *is* the
premium signal.

---

## 5. Image-to-text ratio

**PROPOSED** — Measured as the share of viewport area occupied by imagery, above the fold.

| Surface | Target | Floor | Ceiling |
|---|---|---|---|
| Home hero | 85–100% | 70% | 100% |
| Home editorial bands | 45–60% | 35% | 70% |
| Collection page | 55–65% | 45% | 75% |
| Property hero | 80–100% | 70% | 100% |
| Property body sections | 40–55% | 30% | 65% |
| Room list | 35–45% | 25% | 55% |
| Room detail | 50–60% | 40% | 70% |
| Search results | 25–35% | 20% | 45% |
| **Your Stay / forms** | **0–15%** | 0% | 25% |
| Account | 0–15% | 0% | 25% |
| Admin | 0–5% | 0% | 10% |

**PROPOSED** — The ratio **drops deliberately as the guest moves toward committing**. Photography
persuades; it does not help someone check a date. Imagery in Your Stay is a single small property
thumbnail — nothing more.

---

## 6. Editorial vs transactional balance

**PROPOSED** — Each page declares one mode. Mixed modes are a defect.

```
EDITORIAL                              TRANSACTIONAL
Home · Collection · Property story  →  Search · Room list · Your Stay
About · Story · Experiences            Details · Review · Account · Admin

full-bleed sections                    contained, gridded
asymmetric composition                 symmetric, predictable
display type                           text type
128px rhythm                           32–48px rhythm
motion: reveals permitted              motion: state changes only
```

**PROPOSED — the transition point is the property page.** Its top half is editorial (hero, story,
experiences); its lower half is transactional (rooms, availability, price). The **sticky stay bar** is
the seam, and it appears exactly where the mode changes.

---

## 7. Border philosophy

**PROPOSED** — Borders are used **sparingly, and only to do a job**.

| Use | Token | Value |
|---|---|---|
| Separate content of equal weight | `border.subtle` | 1px, `color.border.subtle` |
| Define an interactive boundary | `border.default` | 1px, `color.border.default` |
| Emphasise a selected state | `border.strong` | 1px, `color.border.strong` |
| Focus indicator | `border.focus` | **2px**, `color.border.focus`, 2px offset |
| Input resting | `border.default` | 1px |
| Table rules | `border.subtle` | 1px, horizontal only |

| Prohibited | Why |
|---|---|
| Borders as decoration | Ornament |
| Double borders, inset borders | Dated, fussy |
| Borders on cards **that already have a distinct surface** | Redundant; adds visual noise |
| Vertical table rules | Reads as a spreadsheet |
| Borders wider than 2px | Never needed |

**PROPOSED** — Prefer **surface change over border** to separate regions. A card sits on a different
surface; it does not need an outline as well.

---

## 8. Corner radius philosophy

**PROPOSED** — Restrained. Large radii read as consumer app, not established hospitality.

| Token | Value | Use |
|---|---|---|
| `radius.none` | 0 | **Photography, hero images, full-bleed media** |
| `radius.sm` | 4px | Inputs, small controls, badges, chips |
| `radius.md` | 8px | Buttons, cards, panels, dropdowns |
| `radius.lg` | 12px | Modals, drawers, bottom sheets |
| `radius.pill` | 999px | Filter chips, quantity stepper track, avatars only |

**CONFIRMED direction — avoid excessive rounded cards.**

| Rule | Detail |
|---|---|
| **Editorial imagery is square-cornered** | Rounded corners on a hero photograph read as a lifestyle app. Photography gets `radius.none` |
| Room and property card images | `radius.none` at the top, card body `radius.md` — the image meets the card edge squarely |
| Maximum on any card | `radius.md` (8px) |
| `radius.pill` | Chips, stepper and avatars only. **Never on primary buttons** |

---

## 9. Shadow philosophy

**PROPOSED** — Shadows indicate **elevation only**, never decoration. Warm-tinted, never neutral black.

| Token | Value *(provisional tint)* | Use |
|---|---|---|
| `shadow.none` | none | Editorial surfaces, flat cards, images |
| `shadow.sm` | `0 1px 2px rgba(38,34,32,.06)` | Resting card on a matching surface |
| `shadow.md` | `0 2px 8px rgba(38,34,32,.08)` | Hover elevation, dropdown |
| `shadow.lg` | `0 8px 24px rgba(38,34,32,.10)` | Sticky bars, popovers, bottom sheet |
| `shadow.xl` | `0 16px 48px rgba(38,34,32,.14)` | Modal, drawer |

| Rule | Detail |
|---|---|
| Warm tint | Derived from `ink-800`, not `#000`. Neutral-black shadows read cold and technical |
| Low opacity | Nothing above 14% |
| **No coloured shadows, no glows** | No token exists |
| **No shadow on editorial imagery** | Photography sits flat on the page |
| Admin | `shadow.sm` and `shadow.md` only — operators do not need depth theatre |

---

## 10. Surface hierarchy

**PROPOSED** — Four surfaces. A surface change communicates grouping without a border.

| Level | Token | Use | Elevation |
|---|---|---|---|
| 0 | `color.background` | Page ground | none |
| 1 | `color.surface` | Cards, panels, table rows | `shadow.none` or `sm` |
| 2 | `color.surface.elevated` | Dropdowns, popovers, sticky bars | `shadow.md`–`lg` |
| 3 | `color.surface.overlay` | Modals, drawers | `shadow.xl` + scrim |
| — | `color.surface.inverse` | Footer, flagship band, immersive gallery | none |

**PROPOSED** — **Maximum two surface levels visible in one region.** Cards on panels on sections
produce visual mush; if three levels are needed, the layout is wrong.

**PROPOSED — the inverse surface is a deliberate editorial device**, used at most **twice per page**:
the footer always, and one full-bleed band (typically the flagship or the service promise). Overuse
turns a calm site into a striped one.

---

## 11. Visual hierarchy

**PROPOSED** — Five ranks. Every screen assigns each element exactly one.

| Rank | Purpose | Achieved by |
|---|---|---|
| **1 — Primary** | The one thing this screen is for | Largest type or full-bleed image · primary button · highest contrast |
| **2 — Supporting** | Directly enables rank 1 | Secondary type sizes · secondary button · standard contrast |
| **3 — Contextual** | Orientation and confidence | Body text · metadata · muted colour |
| **4 — Ambient** | Present, not competing | Captions · helper text · `text.muted` |
| **5 — Recessive** | Legal, structural | Footer detail · smallest size, still ≥ 4.5:1 |

### 11.1 The rules that make it enforceable

**PROPOSED**

1. **One rank-1 element per viewport.** Two primary buttons in view is a defect.
2. **Contrast follows rank.** Rank 1 uses `text.primary`; rank 4 uses `text.muted`. Rank never
   inverts.
3. **Size steps by at least one scale increment** between adjacent ranks — never by 1–2px.
4. **Colour is never the only rank signal.** Size, weight and position carry it too — an accessibility
   requirement as much as a design one.
5. **The primary action is visually singular** on every screen: `REQUEST THIS STAY` on Your Stay,
   `Add to Your Stay` on a room card, `View rooms` on a property page.

### 11.2 Worked example — property page above the fold

| Element | Rank | Treatment |
|---|---|---|
| Hero photograph | 1 | Full-bleed, 100% width, `radius.none` |
| Property name | 1 | `display-md`, `text.primary` |
| Signature line | 2 | `body-lg`, `text.secondary` |
| District · review score · from-price | 3 | `body-sm`, `text.secondary` |
| `View rooms` button | 1 | Primary button — the one action |
| Sticky stay bar dates | 2 | `body-sm`, `text.primary` |
| Gallery count "24 photos" | 4 | `caption`, `text.muted` |

---

## 12. What the system deliberately excludes

| Excluded | Reason |
|---|---|
| Gradients as identity | Confirmed avoid-list. No token exists |
| Glassmorphism / backdrop blur | Confirmed avoid-list |
| Neon, glow, saturated accent floods | Confirmed avoid-list |
| Large corner radii (≥ 16px on cards) | Reads as consumer app |
| Decorative illustration | Photography carries the brand |
| Icon-only navigation | Icons always paired with text |
| Dark mode | Deferred ([70](70-phase-5-design-system.md) §4.5); tokens permit it later |
| Multiple accent colours | One accent. Overuse destroys the signal |
| Texture overlays, film grain, vignettes | Photography is presented honestly |
| Animated backgrounds, video heroes with sound | Performance and calm |

---

## 13. Token namespaces

**PROPOSED** — Every reusable visual decision maps to a token. Full definitions in
[75](75-phase-6-typography.md)–[77](77-phase-6-layout-grid.md).

```
color.*        background · surface · surface.elevated · surface.overlay · surface.inverse
               text.primary · text.secondary · text.muted · text.inverse · text.accent
               border.subtle · border.default · border.strong · border.focus
               action.primary.* · action.secondary.* · action.ghost.*
               status.success|warning|error|info.{bg,fg,border}          ⚠ PROVISIONAL VALUES

font.family.*  display · text · mono                                     ⚠ PROVISIONAL
font.size.*    display-xl … caption
font.weight.*  regular · medium · semibold
font.leading.* tight · snug · normal · relaxed · editorial
font.tracking.* tight · normal · wide

space.1 … space.11        4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160
radius.*                  none · sm · md · lg · pill
shadow.*                  none · sm · md · lg · xl
motion.duration.*         instant · fast · base · slow · reveal
motion.easing.*           out · inOut · in
breakpoint.*              mobile · tablet · desktop · wide
container.*               narrow · content · wide · full
z.*                       base · sticky · dropdown · overlay · modal · toast
aspect.*                  hero · tile · card · gallery · social
```

**PROPOSED — the discipline:** components reference **semantic tokens only**, never primitives. When
brand assets arrive, one primitives file changes and no component file is touched.

---

## 14. Provisional status

**BLOCKED — config A8 / OQ-004.**

| Layer | Status |
|---|---|
| Structure, spacing, radius, shadow, elevation, hierarchy, composition | ✔ **Final** — brand-independent |
| Colour **values** | ⚠ **PROVISIONAL** — [76](76-phase-6-color.md) |
| Typeface **selection** | ⚠ **PROVISIONAL CANDIDATES** — [75](75-phase-6-typography.md) |
| Type **scale, weights, leading, tracking** | ✔ **Final** — face-independent |
| Photography treatment | ⚠ Specified, **no assets exist** (B8) — [83](83-phase-6-motion-photography.md) |

**PROPOSED** — Everything a developer needs to build layout, hierarchy, spacing, states and interaction
is **final**. Only the palette and the face are pending, and both swap in one file.
