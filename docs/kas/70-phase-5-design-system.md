# 70 — Design System

**Phase:** 5 — UX / UI Experience Design
**Status:** **Structure approved-ready. All colour and type values are `PROVISIONAL`.**
**Last updated:** 2026-08-14

---

## 1. Provisional status — read first

**BLOCKED — config A8 / OQ-004.** No KAS logo, colour values or licensed typefaces have been supplied.

**CONFIRMED direction** — *"Do not choose arbitrary colors without relating them to KAS brand assets.
If brand assets are unavailable: mark tokens as provisional."*

| Layer | Status |
|---|---|
| Token **names and structure** | ✔ Ready — semantic, stable, will not change when brand arrives |
| Token **values** (colour, typeface) | ⚠ **`PROVISIONAL`** — placeholders chosen to be *replaced*, not to pre-empt the brand |
| Spacing, grid, radii, elevation, motion | ✔ Ready — brand-independent |
| Component structure and behaviour | ✔ Ready |

**PROPOSED — the swap procedure.** All provisional values live in **one primitives file**. When A8
arrives: replace the primitive scale, verify contrast (§4.4), verify Vietnamese diacritic rendering
(§3.4). **No component file changes**, because components reference semantic tokens only.

---

## 2. Token architecture

```
PRIMITIVES  ── raw values, provisional        --kas-stone-100 … --kas-ink-900
     ↓
SEMANTIC    ── meaning, stable                --surface-page, --text-primary
     ↓
COMPONENT   ── scoped                         --btn-primary-bg
```

**PROPOSED** — Components **never** reference primitives. This is the discipline that makes the brand
swap a one-file change instead of a search-and-replace across the codebase.

---

## 3. Typography

### 3.1 Roles

| Role | Use | Requirement |
|---|---|---|
| **Display** | Editorial headlines, property names, hero | Refined, characterful. **Must fully support Vietnamese diacritics** |
| **Text** | Body, UI, forms, tables, admin | Highly legible at small sizes. **Full Vietnamese support** |
| **Mono** | References, codes, admin data | Tabular figures |

**⚠ PROVISIONAL** — Typefaces are **not selected**. Selection is blocked on A8 and on the diacritic
test in §3.4.

### 3.2 Scale

**PROPOSED** — Fluid, brand-independent. 1.250 ratio at desktop, compressed on mobile.

| Token | Mobile | Desktop | Use |
|---|---|---|---|
| `--text-display-xl` | 40px | 72px | Hero |
| `--text-display-lg` | 32px | 56px | Section headline |
| `--text-display-md` | 26px | 40px | Property name |
| `--text-heading-lg` | 22px | 28px | Sub-section |
| `--text-heading-md` | 19px | 22px | Card title |
| `--text-heading-sm` | 17px | 18px | Label heading |
| `--text-body-lg` | 17px | 18px | Editorial body |
| `--text-body` | 16px | 16px | Default. **Never below 16px on mobile inputs** — iOS zooms |
| `--text-body-sm` | 14px | 14px | Secondary |
| `--text-caption` | 13px | 13px | Captions, meta |

### 3.3 Line height and measure

| Context | Line height | Measure |
|---|---|---|
| Display | 1.1 | ≤ 16 words |
| Editorial body | **1.7** | **60–75 characters** |
| UI | 1.5 | — |
| Admin tables | 1.4 | — |

**PROPOSED** — Editorial line height is set to **1.7, higher than a typical 1.5**, because Vietnamese
stacked diacritics (ế, ộ, ữ, ằ) need vertical room. It is applied to **both** locales so the two look
like one design rather than two.

### 3.4 Vietnamese constraints — hard requirements

**CONFIRMED**

1. Every candidate face is tested with real strings before selection —
   *"Nghỉ dưỡng tại Thành phố Hồ Chí Minh"*, *"Kỳ nghỉ của bạn"*, *"Gửi yêu cầu đặt phòng"*.
2. **No ALL CAPS in navigation or headings** — it degrades diacritic legibility and reads as shouting.
3. Vietnamese UI labels run **10–20% longer** than English. **No fixed-width buttons, no single-line
   assumptions.**
4. Diacritics must not clip against the line above at display sizes.

---

## 4. Colour

### 4.1 Philosophy

**PROPOSED** — Warm neutral base, one restrained accent, minimal semantic colour. Photography supplies
the colour; the interface supplies the quiet.

| Principle | Rationale |
|---|---|
| Neutral-dominant | Lets photography lead — the Classic Luxury pillar |
| **Warm**, not cool grey | Cool grey reads as SaaS; warm reads as hospitality |
| One accent, used sparingly | Accent means "act here". Overuse destroys the signal |
| Semantic colour is functional only | Success, warning, error, info — never decorative |
| No gradients as identity | Explicitly rejected direction |

### 4.2 Provisional palette

**⚠ ALL VALUES PROVISIONAL — placeholders pending A8.**

| Token | Provisional | Role |
|---|---|---|
| `--kas-stone-50 … 300` | Warm off-whites → light warm greys | Page and card surfaces, borders |
| `--kas-ink-600 … 900` | Warm dark greys → near-black | Body text, headings |
| `--kas-accent-500` | **`PROVISIONAL`** — deep muted tone | Primary action, links, focus |
| `--kas-accent-100 / 700` | Tint / shade | Hover, subtle backgrounds |
| `--kas-success / warning / error / info` | Muted functional tones | Semantic only |

**PROPOSED** — The provisional accent is deliberately *unremarkable*. A striking placeholder gets
adopted by default; a plain one gets replaced, which is the correct outcome.

### 4.3 Semantic tokens

`--surface-page` · `--surface-raised` · `--surface-sunken` · `--surface-inverse` ·
`--text-primary` · `--text-secondary` · `--text-muted` · `--text-inverse` · `--text-accent` ·
`--border-subtle` · `--border-strong` · `--border-focus` ·
`--action-primary-bg/fg/hover` · `--action-secondary-*` · `--action-ghost-*` ·
`--status-success/warning/error/info-{bg,fg,border}`.

### 4.4 Contrast — a design constraint, not a QA step

**CONFIRMED** — WCAG 2.2 AA: body text ≥ 4.5:1, large text and UI components ≥ 3:1.

> **PROPOSED — the specific trap.** Elegant light-grey-on-white typography is a hallmark of premium
> hospitality design and **routinely fails 4.5:1**. This must be caught in design, not in a pre-launch
> audit when the visual language is already signed off.

Every token pair is contrast-verified when A8 lands, and a CI check asserts the shipped pairs.

### 4.5 Dark mode

**PROPOSED — not in V1.** A hotel site is consumed in daylight-equivalent contexts and the photography
is graded for a light ground. Tokens are structured so dark mode is additive later, but no dark palette
is designed now.

---

## 5. Spacing and grid

**PROPOSED** — 4px base, brand-independent.

`--space-1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 24 · `6` 32 · `7` 48 · `8` 64 · `9` 96 · `10` 128 · `11` 160

| Context | Vertical rhythm |
|---|---|
| Editorial section | `--space-10` (128px) desktop · `--space-8` mobile |
| Card internal | `--space-5` |
| Form field gap | `--space-4` |
| Admin table row | `--space-3` |

**PROPOSED** — Whitespace is the primary luxury signal. Density is the visual signature of budget
travel sites. Where a section feels tight, the answer is space, not a smaller type size.

### 5.1 Grid

| Breakpoint | Columns | Gutter | Max content |
|---|---|---|---|
| Mobile < 768 | 4 | 16px | full − 32px |
| Tablet 768–1023 | 8 | 24px | 720px |
| Desktop 1024–1439 | 12 | 32px | 1140px |
| Wide ≥ 1440 | 12 | 40px | 1320px |

**Full-bleed** sections escape the container for hero, flagship band and immersive galleries.
**Editorial measure** caps body text at 60–75 characters regardless of container width.

### 5.2 Radii and elevation

`--radius-sm` 4 · `md` 8 · `lg` 12 · `xl` 20 · `full` 9999.
**PROPOSED** — Restrained. Large radii read as consumer app, not established hospitality.

Elevation: four levels, **soft warm-tinted shadows**, never harsh black. Level 0 flat · 1 card ·
2 hover · 3 sticky bar / dropdown · 4 modal.

---

## 6. Components — customer site

### 6.1 Buttons

| Variant | Use |
|---|---|
| **Primary** | One per view. `REQUEST THIS STAY`, `Add to Your Stay` |
| **Secondary** | Bordered. `View rooms`, `Compare` |
| **Ghost** | Text + underline on hover. Tertiary |
| **Quiet** | The header stay control — bordered, not saturated. **Premium signals confidence, not volume** |

Sizes sm/md/lg. States: default · hover (elevation + 2px lift, 150ms) · **focus-visible (2px ring,
2px offset, ≥ 3:1)** · active · disabled (**always with an inline reason**) · loading (spinner, label
retained, non-cancellable on submit).

### 6.2 Property card

Varied by design — three sizes (feature / standard / compact) with alternating image alignment.
Contains: image (per-property crop) · name · signature line · district · character tags · from-price ·
review score · availability indicator when dates are in context.

**CONFIRMED** — Never a uniform grid. Uniform cards make eight distinct hotels interchangeable.

### 6.3 Room card

Image (swipeable on mobile) · name · **facts row** (area · bed · max guests · view) · 3–4 highlight
amenities · **price with basis stated** · **availability count** · **quantity stepper** ·
Add to Your Stay · Room details link.

### 6.4 Quantity stepper

```
[ − ]  2  [ + ]
```
Bounded by availability across all nights. `+` disables **with an inline reason**. Zero removes the
line with undo. **Never a free-text number input.**

### 6.5 Review card

Rating · display name (first + last initial) · **Verified Stay badge** · stay **month** · property ·
sub-scores · body · photos · hotel reply (indented, attributed). **Moderation state never shown.**

### 6.6 Date range picker

The most-studied failure point in accommodation UX.

| | Desktop | Mobile |
|---|---|---|
| Layout | Two months side by side | **One scrollable month column** |
| Selection | Click in, click out; changing check-out never restarts | Same |
| Disabled | Past dates, beyond horizon | Same |
| Keyboard | Arrows move, Enter selects, Esc closes | — |
| Screen reader | Dates announced with full context, range state announced | — |

**CONFIRMED** — Never a shrunken desktop calendar on mobile.

### 6.7 Guest selector

Adults and children **separated**, with an **age input per child**. Stepper controls. Live capacity
guidance — advisory, never blocking.

### 6.8 Gallery

Primary + thumbnails; immersive full-screen with category tabs, captions, keyboard arrows, `Esc`.
Focus trapped while open, restored on close. Blurred placeholder at the correct aspect ratio —
**no layout shift**.

### 6.9 Forms

Label **above** the field, always visible — never placeholder-as-label. Helper text below. Required
marked on the required field, not the optional ones. **Validation on blur, not on submit.** Errors
adjacent, plain language, programmatically associated. Correct `autocomplete`; numeric keypads.

### 6.10 Status timeline

Vertical. Current state dominant, history quieter. **Guest vocabulary only.** No fixed-step progress
bar — a request can branch.

### 6.11 Modal, alert, badge

Modal: focus-trapped, `Esc`, restores focus, scroll-locked. Never for the booking flow — steps are
pages.
Alert: four semantic variants, icon + text (**never colour alone**).
Badge: Verified Stay · Coming Soon · availability. **No "Best value", no tier, no ranking badge.**

---

## 7. Components — admin

**PROPOSED** — Denser, keyboard-first, sharing tokens only.

| Component | Notes |
|---|---|
| **Data table** | Sticky header, sortable, resizable, row selection, keyboard navigation, tabular figures |
| **Queue row** | Reference · guest · **lead source** · property · stay · value · age · **SLA indicator** · owner |
| **SLA indicator** | ● ▲ ■ — **icon + text, never colour alone** |
| **Filter bar** | Chips with clear-all; state in the URL so a view is bookmarkable |
| **Workspace layout** | Three columns desktop; stacked mobile |
| **Internal note 🔒 / Guest message 👁** | Visually unmistakable: different colour, icon, persistent label. Guest messages require a preview before send |
| **Inventory calendar cell** | `available / total`; colour weight by availability; **`available` never editable**; hover reveals breakdown |
| **Hold indicator ⏳** | Countdown to expiry |
| **Preview grid** | Mandatory before any bulk rate or inventory commit |
| **Media tile** | Thumbnail · category · usage count · **⚠ missing alt text** |
| **Audit entry** | Actor · action · before/after diff · timestamp · reason |

---

## 8. Motion tokens

`--motion-fast` 150ms · `--motion-base` 250ms · `--motion-slow` 400ms · `--motion-reveal` 600ms.
Easing: `--ease-out` for entrances, `--ease-in-out` for transitions.

| Use | Token |
|---|---|
| Hover elevation | fast |
| Fade / panel | base |
| Gallery | base |
| Image reveal | reveal, **once**, opacity + 8–12px rise |
| Sticky bar | base |

**CONFIRMED** — `prefers-reduced-motion` collapses all durations to 0ms and removes reveals and
parallax. **Content and function are identical without motion.**

---

## 9. Iconography

**PROPOSED** — One consistent set: line-based, 1.5px stroke, 24px grid, rounded terminals. Warm, not
technical. **Icons never appear alone where meaning matters** — always paired with text in navigation,
amenities, and status. Amenity icons are drawn from the shared taxonomy so the same amenity looks
identical everywhere.

---

## 10. What is not decided

| Item | Blocked on |
|---|---|
| Logo, lock-ups, clear space | A8 |
| Brand colour values | A8 |
| Typeface selection | A8 + the §3.4 diacritic test |
| Photography treatment and grade | B8 |
| Per-property visual accents | OQ-009 collections |
| Dark mode | Deliberately deferred |
| Illustration style | Not required for V1 |

**PROPOSED** — The system is complete in **structure** and provisional in **identity**. That is the
honest state, and it is deliberately arranged so the identity swap is a one-file change.
