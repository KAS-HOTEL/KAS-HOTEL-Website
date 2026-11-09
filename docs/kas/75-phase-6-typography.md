# 75 — Typography System

**Phase:** 6 — High-Fidelity Visual Design
**Status:** **Scale, weights, leading and tracking are FINAL. Typeface selection is `PROVISIONAL`.**
**Last updated:** 2026-08-14

---

## 1. Typeface roles

**⚠ PROVISIONAL — no typeface is selected.** Blocked on config A8 and on the Vietnamese QA in §7.

| Role | Token | Job | Hard requirements |
|---|---|---|---|
| **Display** | `font.family.display` | Editorial headlines, property names, hero, section openers | **Full Vietnamese diacritic coverage** · ≥ 3 weights · optical quality at 40–72px · genuine character without ornament |
| **Text** | `font.family.text` | Body, UI, forms, tables, admin, everything else | **Full Vietnamese diacritic coverage** · excellent at 13–18px · tabular figures · ≥ 4 weights |
| **Mono** | `font.family.mono` | References (`KAS-260912-4F7A`), codes, admin data | Tabular · unambiguous `0/O`, `1/l/I` |

### 1.1 Provisional candidates

**⚠ PROVISIONAL CANDIDATES — for evaluation only. None is selected or licensed.**

| Role | Candidates | Note |
|---|---|---|
| Display | *Playfair Display* · *Cormorant Garamond* · *Lora* · *Source Serif 4* | All claim Vietnamese support and must be **verified** against §7 |
| Text | *Inter* · *Source Sans 3* · *IBM Plex Sans* · *Be Vietnam Pro* | *Be Vietnam Pro* is designed for Vietnamese and is the safest baseline |
| Mono | *JetBrains Mono* · *IBM Plex Mono* | — |

**PROPOSED — the fallback position.** If A8 delivers no display face, **a single well-drawn text face
used across the whole scale is preferable to a badly-chosen display face**. Elegance comes from scale,
spacing and restraint; a display face is an amplifier, not a requirement.

### 1.2 Font stack

```
font.family.display : "[PROVISIONAL]", Georgia, "Times New Roman", serif
font.family.text    : "[PROVISIONAL]", -apple-system, "Segoe UI", Roboto, sans-serif
font.family.mono    : "[PROVISIONAL]", "SFMono-Regular", Consolas, monospace
```

**PROPOSED** — Fallbacks must have Vietnamese coverage; Georgia and the system sans do. Loading:
`font-display: swap`, subset to Latin + **Latin Extended Additional** (the Vietnamese block), preloaded
for display weights used above the fold. Maximum **4 web font files** total.

---

## 2. Type scale

**FINAL — face-independent.** 1.250 ratio at desktop, compressed at mobile.

| Token | Role | Mobile | Tablet | Desktop | Family | Weight | Leading | Tracking |
|---|---|---|---|---|---|---|---|---|
| `font.size.display-xl` | Hero headline | 40px | 56px | **72px** | display | 400 | 1.05 | −0.02em |
| `font.size.display-lg` | Section opener | 32px | 44px | **56px** | display | 400 | 1.10 | −0.015em |
| `font.size.display-md` | Property name (H1) | 26px | 34px | **40px** | display | 400 | 1.15 | −0.01em |
| `font.size.display-sm` | Editorial sub-head | 22px | 26px | **30px** | display | 400 | 1.25 | −0.005em |
| `font.size.heading-lg` | H2 | 22px | 25px | **28px** | text | 600 | 1.30 | −0.005em |
| `font.size.heading-md` | H3 · card title | 19px | 20px | **22px** | text | 600 | 1.35 | 0 |
| `font.size.heading-sm` | H4 · label heading | 17px | 17px | **18px** | text | 600 | 1.40 | 0 |
| `font.size.body-lg` | Editorial body | 17px | 18px | **18px** | text | 400 | **1.70** | 0 |
| `font.size.body` | Default body / UI | **16px** | 16px | **16px** | text | 400 | 1.55 | 0 |
| `font.size.body-sm` | Secondary | 14px | 14px | **14px** | text | 400 | 1.50 | 0 |
| `font.size.caption` | Captions, meta | 13px | 13px | **13px** | text | 400 | 1.45 | 0.01em |
| `font.size.label` | Form labels, table heads | 13px | 13px | **13px** | text | 600 | 1.40 | 0.02em |
| `font.size.button` | Button text | 15px | 15px | **15px** | text | 600 | 1.20 | 0.01em |
| `font.size.nav` | Navigation | 15px | 15px | **15px** | text | 500 | 1.20 | 0.01em |
| `font.size.price-lg` | Room/property price | 22px | 24px | **26px** | text | 600 | 1.20 | −0.01em |
| `font.size.price` | Inline price | 17px | 17px | **18px** | text | 600 | 1.30 | 0 |
| `font.size.price-sm` | Secondary price (USD) | 14px | 14px | **14px** | text | 400 | 1.30 | 0 |
| `font.size.metadata` | Facts row, badges | 13px | 13px | **14px** | text | 500 | 1.40 | 0.01em |

**Never below 16px on any mobile form input** — smaller triggers iOS auto-zoom.

---

## 3. Weights

**FINAL** — Three weights on text, one on display. More weights is more decisions and more font files.

| Token | Value | Use |
|---|---|---|
| `font.weight.regular` | 400 | Body, captions, display headlines |
| `font.weight.medium` | 500 | Navigation, metadata, emphasis within body |
| `font.weight.semibold` | 600 | Headings, buttons, labels, prices |

**PROPOSED** — **Display uses 400 only.** A large serif at 72px carries authority through size; adding
weight makes it heavy rather than elegant. **Bold display type is prohibited.**

---

## 4. Line height

**FINAL**

| Token | Value | Use |
|---|---|---|
| `font.leading.tight` | 1.05–1.15 | Display sizes |
| `font.leading.snug` | 1.20–1.30 | Headings, buttons, prices |
| `font.leading.normal` | 1.40–1.55 | UI text, labels, captions |
| `font.leading.relaxed` | 1.55 | Default body |
| `font.leading.editorial` | **1.70** | Editorial body copy |

**PROPOSED — why editorial is 1.70, not the usual 1.5.** Vietnamese stacks diacritics above **and**
below the baseline (ế, ộ, ữ, ằ, ệ). At 1.5 they crowd the line above at 18px. **1.70 is applied to both
locales** so the two read as one design rather than two, and so a language switch never reflows the
page.

---

## 5. Measure

**FINAL**

| Context | Measure | Enforcement |
|---|---|---|
| Editorial body | **60–75 characters** | `max-width: 68ch` on body containers |
| UI text | ≤ 80 characters | Container width |
| Card description | ≤ 55 characters | Line clamp at 3 lines |
| Admin table cell | Single line, truncate with tooltip | — |
| Display headline | ≤ 16 words, ideally 2–3 lines | Editorial discipline |

**PROPOSED** — Measure is capped **regardless of container width**. A 1320px container does not produce
a 1320px line of text; the text column caps at 68ch and sits within it.

---

## 6. Typographic spacing

**FINAL** — Space **above** a heading is larger than space below it, so headings bind to their content.

| Relationship | Desktop | Mobile |
|---|---|---|
| Above `display-lg` (section opener) | `space.10` 128px | `space.8` 64px |
| Below `display-lg` | `space.5` 24px | `space.4` 16px |
| Above `heading-lg` (H2) | `space.7` 48px | `space.6` 32px |
| Below `heading-lg` | `space.4` 16px | `space.3` 12px |
| Above `heading-md` (H3) | `space.6` 32px | `space.5` 24px |
| Below `heading-md` | `space.3` 12px | `space.2` 8px |
| Between body paragraphs | `space.4` 16px | `space.4` 16px |
| Body → caption | `space.2` 8px | `space.2` 8px |
| Label → input | `space.2` 8px | `space.2` 8px |
| Input → helper/error | `space.1` 4px | `space.1` 4px |

---

## 7. Vietnamese — first-class content

**CONFIRMED** — Vietnamese and English are both first-class.

### 7.1 Structural rules

| Rule | Detail |
|---|---|
| Leading | `editorial` 1.70 minimum for body in **both** locales |
| **No ALL CAPS** in navigation, headings or buttons | Uppercase strips diacritics of vertical room and reads as shouting. Use `font.weight.semibold` + `tracking.wide` instead |
| **No fixed-width buttons** | Vietnamese labels run **10–20% longer**. Buttons size to content with `min-width` only |
| No single-line assumptions | Every label must wrap gracefully to two lines |
| Truncation | Only at `caption`/`metadata`. **Never truncate a property or room name** |
| `lang` attribute | Correct on `<html>`; drives hyphenation, rendering and screen-reader pronunciation |
| Letter-spacing | **Never negative below 18px** in Vietnamese — it collides diacritics with adjacent glyphs |

### 7.2 Diacritic QA checklist

**PROPOSED** — Run against every candidate face before selection, at every size in §2, at **both**
`font-weight` extremes, on **Windows, macOS, iOS and Android**.

| # | Check | Test string |
|---|---|---|
| 1 | Stacked diacritics render fully, unclipped | `ế ộ ữ ằ ệ ợ ẫ ỗ` |
| 2 | Display sizes do not clip the ascender diacritic | `Nghỉ dưỡng tại Thành phố Hồ Chí Minh` (72px) |
| 3 | Descender + diacritic combination | `Kỳ nghỉ của bạn` |
| 4 | Đ / đ drawn correctly, not a hacked D | `Đặt phòng · đến · đi` |
| 5 | Ư / ư and Ơ / ơ horns are correct, not accents | `Ưu đãi · Phòng đơn` |
| 6 | Body at 16px/1.70 shows no line collision | Full paragraph, 8+ lines |
| 7 | Button label wraps without clipping | `Gửi yêu cầu đặt phòng` |
| 8 | Navigation at 15px is legible | `Khách sạn · Vị trí · Trải nghiệm · Về KAS` |
| 9 | Tabular figures align in admin tables | `1.850.000 ₫` repeated |
| 10 | Currency symbol ₫ present and correctly positioned | `1.850.000 ₫` |
| 11 | Mixed VI/EN in one line does not shift baseline | `KAS Milestone Premium Hotel — Phòng Deluxe` |
| 12 | Fallback face also has full coverage | Disable the web font and re-run 1–11 |
| 13 | Long Vietnamese label in a narrow mobile container | `Thông tin của bạn` at 320px |
| 14 | Uppercase is **not** used anywhere it would be needed | Visual audit |
| 15 | Line-break behaviour on Vietnamese compound words | Full paragraph at 320px |

**PROPOSED** — A face failing checks 1–5 is **rejected regardless of aesthetics.** This is not
negotiable: a clipped diacritic is a misspelling to a Vietnamese reader.

---

## 8. Role-specific specifications

### 8.1 Price

**PROPOSED** — Price is a distinct typographic object with a fixed composition.

```
1.850.000 ₫   per room / night        ← price + basis, always together
≈ $73         approximate             ← indicative, one step down
```

| Element | Token | Colour |
|---|---|---|
| Amount | `price-lg` / `price` · 600 · tabular figures | `text.primary` |
| Currency symbol | Same size, `font.weight.regular` | `text.primary` |
| **Basis** ("per room / night") | `body-sm` · 400 | `text.secondary` |
| USD indicative | `price-sm` · 400 | `text.muted` |
| "from" prefix | `body-sm` · 400 | `text.secondary` |

**CONFIRMED** — The **basis is always shown with the amount**. Per-person pricing is common in the
region; ambiguity causes disputes. **USD never appears at or after commitment.**

### 8.2 Navigation

`font.size.nav` 15px · 500 · `tracking` 0.01em · sentence case. Active item: `text.primary` +
`aria-current`; inactive: `text.secondary`. **No uppercase, no letter-spaced small caps.**

### 8.3 Buttons

`font.size.button` 15px · 600 · `leading.snug` · sentence case. **Never uppercase.** `REQUEST THIS
STAY` renders as **"Request this stay"** — the small-caps rendering in earlier documents was shorthand
for prominence, not a typographic instruction.

### 8.4 Metadata / facts row

`font.size.metadata` 13–14px · 500 · `text.secondary`, separated by a middot with `space.2` either
side: `28 m² · 1 King bed · Up to 2 guests · City view`. Wraps to two lines on mobile; never truncates.

### 8.5 Admin tables

`body-sm` 14px · 400 · `leading.normal` 1.40. Column heads `label` 13px · 600 · `text.secondary`.
**Tabular figures mandatory** on every numeric column.

---

## 9. Responsive behaviour

**PROPOSED** — Fluid interpolation between the mobile and desktop values in §2, clamped at both ends.

```
font.size.display-xl : clamp(40px, 2.5rem + 3.5vw, 72px)
font.size.display-lg : clamp(32px, 2rem + 2.5vw, 56px)
font.size.display-md : clamp(26px, 1.6rem + 1.8vw, 40px)
font.size.heading-lg : clamp(22px, 1.4rem + 0.6vw, 28px)
body and below       : fixed per breakpoint — fluid body text harms readability
```

**PROPOSED** — Display sizes are fluid; **body and UI sizes are stepped, not fluid**. Fluid body text
produces unpredictable measure and inconsistent rhythm, and gains nothing.

---

## 10. Open items

| ID | Item | Effect |
|---|---|---|
| **A8 / OQ-004** | Typeface selection and licensing | The scale is final; the faces are not chosen |
| **B27 / OQ-061** | Vietnamese label set | §7.2 checks 7, 8, 13, 15 need final strings |
| — | Diacritic QA execution | Cannot run until candidates are shortlisted with A8 |
