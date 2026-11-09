# 76 — Colour System

**Phase:** 6 — High-Fidelity Visual Design
**Status:** **Architecture FINAL. All values `PROVISIONAL` pending brand assets (config A8).**
**Last updated:** 2026-08-14

---

## 1. Provisional rule — read first

**CONFIRMED direction** — Do not invent final KAS brand colours. Use clearly marked `PROVISIONAL`
tokens. The provisional system must be **intentionally neutral and easy to replace**, and must not
accidentally become the brand.

**PROPOSED — four safeguards:**

1. **All primitive values live in one file.** Semantic tokens map onto them; components reference
   semantics only. The swap touches one file.
2. **The provisional accent is deliberately unremarkable.** A striking placeholder gets adopted by
   default; a plain one gets replaced. That is the correct outcome.
3. **Every provisional value carries the `PROVISIONAL` marker** in the token file comment and in this
   document. It is visible in code review.
4. **A CI contrast check runs against the shipped pairs**, so a brand swap cannot silently break AA.

> ⚠ **The values below are placeholders. They are not the KAS brand palette and must not be presented
> as such in any deliverable, mock-up or stakeholder review.**

---

## 2. Colour philosophy

**PROPOSED**

| Principle | Rationale |
|---|---|
| **Near-monochrome base** | Photography supplies colour; the interface supplies quiet |
| **Warm, not cool** | Cool grey reads as SaaS. Warm neutrals read as hospitality and support the Local Heritage pillar |
| **One accent** | Accent means *"act here"*. A second accent destroys the signal |
| **Semantic colour is functional only** | Success/warning/error/info. Never decorative |
| **No gradients, no glows** | No token exists — an unavailable token cannot be misused |
| **Colour is never the sole carrier of meaning** | Accessibility requirement; also a hierarchy discipline |

---

## 3. Provisional primitives

**⚠ ALL VALUES PROVISIONAL**

### 3.1 Stone — warm neutrals

| Token | Value | Perceived |
|---|---|---|
| `stone.50` | `#FAF8F5` | Warm off-white — page ground |
| `stone.100` | `#F4F1EC` | Card surface |
| `stone.200` | `#E8E3DA` | Subtle border, sunken surface |
| `stone.300` | `#D6CEC2` | Default border |
| `stone.400` | `#B5AA9A` | Strong border, disabled text on dark |

### 3.2 Ink — warm darks

| Token | Value | Perceived |
|---|---|---|
| `ink.500` | `#6B6459` | Muted text |
| `ink.600` | `#524C43` | Secondary text |
| `ink.700` | `#3A352E` | Strong border on light |
| `ink.800` | `#262220` | Inverse surface (footer, flagship band) |
| `ink.900` | `#1A1715` | Primary text |

### 3.3 Accent — deliberately unremarkable

| Token | Value | Perceived |
|---|---|---|
| `accent.100` | `#E6EDEB` | Tint — subtle background |
| `accent.500` | `#3D5A54` | **Muted deep teal-green** — primary action |
| `accent.600` | `#2F4741` | Hover |
| `accent.700` | `#243733` | Active |

**PROPOSED** — Chosen to be *considered but forgettable*: warm-adjacent, low chroma, legible, and
plainly not a brand statement. Replaceable without redesigning anything.

### 3.4 Semantic hues

| Token | Value | Use |
|---|---|---|
| `success.500` / `.100` | `#3F6B4A` / `#E7EFE9` | Confirmed, available |
| `warning.500` / `.100` | `#8A6A2F` / `#F5EEDF` | SLA approaching, expiring hold |
| `error.500` / `.100` | `#8C3A34` / `#F5E6E4` | Validation, breach, unavailable |
| `info.500` / `.100` | `#3A5670` / `#E6ECF2` | Neutral notice |

**PROPOSED** — Muted, warm-shifted, and **not** the default web red/green/amber. Saturated semantic
colour on a near-monochrome ground is jarring and reads as an OTA alert banner.

---

## 4. Semantic tokens

**FINAL architecture · provisional mapping.**

### 4.1 Surface

| Token | Maps to | Purpose |
|---|---|---|
| `color.background` | `stone.50` | Page ground |
| `color.surface` | `#FFFFFF` | Cards, panels, table rows |
| `color.surface.sunken` | `stone.100` | Inset regions, form groups, table stripes |
| `color.surface.elevated` | `#FFFFFF` + `shadow.md` | Dropdowns, popovers, sticky bars |
| `color.surface.overlay` | `#FFFFFF` + `shadow.xl` | Modals, drawers |
| `color.surface.inverse` | `ink.800` | Footer, flagship band, immersive gallery |
| `color.scrim` | `rgba(26,23,21,.55)` | Modal backdrop, text-over-image protection |

### 4.2 Text

| Token | Maps to | On | Contrast* | Purpose |
|---|---|---|---|---|
| `color.text.primary` | `ink.900` | `background` | **≈ 16:1** | Headings, body, prices |
| `color.text.secondary` | `ink.600` | `background` | **≈ 8:1** | Supporting text, metadata |
| `color.text.muted` | `ink.500` | `background` | **≈ 5.4:1** | Captions, helper text |
| `color.text.inverse` | `stone.50` | `surface.inverse` | **≈ 14:1** | Text on dark |
| `color.text.inverse.muted` | `stone.300` | `surface.inverse` | **≈ 7:1** | Secondary on dark |
| `color.text.accent` | `accent.500` | `background` | **≈ 7:1** | Links, accent text |
| `color.text.disabled` | `stone.400` | `background` | ≈ 2.4:1 | **Non-informational only** (§6.3) |

\* Computed against `color.background` `#FAF8F5`. **All values must be verified in CI** — see §6.4.

### 4.3 Border

| Token | Maps to | Purpose |
|---|---|---|
| `color.border.subtle` | `stone.200` | Table rules, dividers |
| `color.border.default` | `stone.300` | Inputs, cards needing an outline |
| `color.border.strong` | `ink.700` | Selected state, emphasis |
| `color.border.focus` | `accent.500` | **Focus ring — 2px, 2px offset** |

### 4.4 Action

| Token | Background | Foreground | Border |
|---|---|---|---|
| `action.primary` | `accent.500` | `stone.50` | none |
| `action.primary.hover` | `accent.600` | `stone.50` | none |
| `action.primary.active` | `accent.700` | `stone.50` | none |
| `action.primary.disabled` | `stone.200` | `ink.500` | none |
| `action.secondary` | transparent | `ink.900` | `border.default` |
| `action.secondary.hover` | `stone.100` | `ink.900` | `border.strong` |
| `action.ghost` | transparent | `accent.500` | none |
| `action.ghost.hover` | `accent.100` | `accent.600` | none |
| `action.destructive` | `error.500` | `stone.50` | none |

**PROPOSED** — `action.primary` on `stone.50` foreground is **≈ 7.5:1** — comfortably AA for a button.

### 4.5 Status

| Token | Background | Foreground | Border |
|---|---|---|---|
| `status.success` | `success.100` | `success.500` | `success.500` @ 40% |
| `status.warning` | `warning.100` | `warning.500` | `warning.500` @ 40% |
| `status.error` | `error.100` | `error.500` | `error.500` @ 40% |
| `status.info` | `info.100` | `info.500` | `info.500` @ 40% |

**CONFIRMED** — Every status is rendered **icon + colour + text**. Colour alone is never the signal.

---

## 5. Component mapping

**PROPOSED** — Which token every major component uses. This is the layer a developer implements against.

| Component | Surface | Text | Border | Action |
|---|---|---|---|---|
| Header (resting) | transparent → `surface` on scroll | `text.primary` | `border.subtle` on scroll | stay control = `action.secondary` |
| Hero overlay text | `scrim` gradient bottom 40% | `text.inverse` | — | primary CTA = `action.primary` |
| Property card | `surface` | name `text.primary`, signature `text.secondary`, meta `text.muted` | none — surface change separates | link = `action.ghost` |
| Room card | `surface` | facts `text.secondary`, price `text.primary` | `border.subtle` top rule | `action.primary` |
| Availability badge | `success.100` | `success.500` | `success.500` @ 40% | — |
| Unavailable badge | `stone.100` | `text.muted` | `border.subtle` | — |
| Verified Stay badge | `accent.100` | `accent.600` | none | — |
| Review card | `surface` | body `text.primary`, meta `text.muted` | `border.subtle` | — |
| Hotel reply | `surface.sunken` | `text.secondary` | left rule `border.default` 2px | — |
| Your Stay panel | `surface.elevated` | `text.primary` | `border.subtle` | `action.primary` |
| Estimated total | — | amount `text.primary`, "estimated" `text.muted` | top rule `border.default` | — |
| Input (resting) | `surface` | `text.primary` | `border.default` | — |
| Input (focus) | `surface` | `text.primary` | `border.focus` 2px + 2px offset | — |
| Input (error) | `surface` | `text.primary`, message `error.500` | `error.500` | — |
| Footer | `surface.inverse` | `text.inverse` / `.muted` | `stone.400` @ 20% | links `text.inverse` |
| Flagship band | `surface.inverse` | `text.inverse` | — | `action.secondary` inverted |
| Admin sidebar | `surface.sunken` | `text.secondary`, active `text.primary` | `border.subtle` | active rail `accent.500` |
| Admin table row | `surface`, alt `surface.sunken` | `text.primary` | `border.subtle` horizontal only | — |
| SLA ● within | — | `success.500` | — | + text label |
| SLA ▲ approaching | — | `warning.500` | — | + text label |
| SLA ■ breached | — | `error.500` | — | + text label |
| Hold countdown ⏳ | `warning.100` | `warning.500` | — | — |
| Modal | `surface.overlay` | `text.primary` | none | — |
| Modal backdrop | `color.scrim` | — | — | — |
| Toast | `surface.elevated` | `text.primary` | left rule 3px semantic | — |

---

## 6. Contrast — WCAG 2.2 AA

### 6.1 Requirements

| Element | Minimum |
|---|---|
| Body text (< 18px, or < 14px bold) | **4.5:1** |
| Large text (≥ 18px, or ≥ 14px bold) | **3:1** |
| UI component boundaries, icons carrying meaning | **3:1** |
| Focus indicator against both element and background | **3:1** |
| Disabled controls | Exempt — **but see §6.3** |

### 6.2 Verified pairs

**PROPOSED** — Computed against the provisional palette. **All require CI verification (§6.4).**

| Pair | Ratio | Passes |
|---|---|---|
| `text.primary` on `background` | ≈ 16:1 | AAA |
| `text.primary` on `surface` (#FFF) | ≈ 17:1 | AAA |
| `text.secondary` on `background` | ≈ 8:1 | AAA |
| `text.muted` on `background` | ≈ 5.4:1 | AA |
| `text.muted` on `surface.sunken` | ≈ 5.0:1 | AA |
| `text.accent` on `background` | ≈ 7:1 | AAA |
| `action.primary` fg on bg | ≈ 7.5:1 | AAA |
| `text.inverse` on `surface.inverse` | ≈ 14:1 | AAA |
| `text.inverse.muted` on `surface.inverse` | ≈ 7:1 | AAA |
| `border.focus` on `background` | ≈ 7:1 | Pass |
| `border.default` on `background` | ≈ 1.6:1 | ⚠ **Decorative only** — never the sole boundary of an interactive control |
| Status fg on status bg (all four) | ≥ 5:1 | AA |

### 6.3 The two traps

> **Trap 1 — elegant grey.** Light-grey-on-white typography is a hallmark of premium hospitality design
> and **routinely fails 4.5:1**. `text.muted` at ≈ 5.4:1 is the **floor**; anything lighter is
> rejected. This is caught in design, not in a pre-launch audit when the visual language is signed off.

> **Trap 2 — disabled controls.** `text.disabled` at ≈ 2.4:1 is exempt from AA, but a disabled control
> must **never be the only place information lives**. The disabled `+` on a quantity stepper is always
> accompanied by visible text: *"6 rooms available for these dates"* at `text.secondary`.

### 6.4 CI verification

**PROPOSED** — A build-time check asserts every pair in §6.2 against its declared minimum and **fails
the build** on regression. It runs on the shipped token values, so a brand swap cannot silently break
accessibility. This is the mechanism that makes the provisional→final transition safe.

### 6.5 Text over photography

**PROPOSED** — Never place text directly on an unmodified photograph.

| Technique | Spec |
|---|---|
| **Scrim gradient** *(default)* | `linear-gradient(to top, scrim 0%, transparent 55%)` over the bottom 40–55% |
| Solid panel | `surface` at 92% opacity, `radius.md`, `space.5` padding |
| Inverse block | `surface.inverse`, adjacent to the image rather than over it |

Contrast is measured **against the darkest region of the scrim**, not the average. If a photograph
cannot support a scrim (bright sky where text sits), the **crop is wrong** — fix the crop, not the
overlay opacity.

---

## 7. Dark mode

**PROPOSED — not in V1.** A hotel site is consumed in daylight-equivalent contexts and the photography
will be graded for a light ground. Tokens are structured so a dark palette is purely additive later:
every component references semantics, so dark mode is a second primitives mapping.

---

## 8. Brand swap procedure

**PROPOSED** — When config A8 arrives:

```
1. Replace primitives in tokens/primitives.css        ← the ONLY file that changes
2. Re-map semantics if the brand implies a different structure
   (e.g. a warm accent may need a darker foreground)
3. Run the CI contrast check (§6.4)                   ← blocking
4. Re-verify text-over-photography scrims (§6.5)
5. Re-verify status hues remain distinguishable for colour-vision deficiency
6. Remove every PROVISIONAL marker
7. Visual regression pass across the 12 customer and 6 admin screens
```

**PROPOSED** — Steps 3–5 are **blocking**. A brand palette that fails contrast is not a brand problem
to accept; it is a palette to adjust, and adjusting it is far cheaper before build than after.

---

## 9. Open items

| ID | Item | Effect |
|---|---|---|
| **A8 / OQ-004** | Brand colours | Every value in §3 is a placeholder |
| — | Colour-vision-deficiency check of the four status hues | Run on brand delivery |
| — | Photography grade | The scrim spec assumes a mid-tone grade; verify on B8 delivery |
