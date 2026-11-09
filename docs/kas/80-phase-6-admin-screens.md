# 80 — Admin Screen Specifications

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Implementation-ready
**Last updated:** 2026-08-14

---

## 1. Admin visual language

**CONFIRMED direction** — Admin may be denser, but must **not** look unrelated to KAS.

| | Customer | **Admin** |
|---|---|---|
| Identity | Luxury hospitality | **Professional hospitality operations** |
| Shares | — | **Colour tokens · type family · radius · shadow · icon set** |
| Differs | — | Density · type scale · motion · imagery |
| Density | Editorial | **Operational** — 8–16px rhythm, 20–60 elements per viewport |
| Type | Display face for headlines | **Text face only.** Display face appears **once**, in the KAS Admin wordmark |
| Motion | Reveals permitted | **State changes only** |
| Imagery | Dominant | Functional thumbnails |

**PROPOSED — the connective tissue.** Admin uses the same warm neutral surfaces, the same accent, the
same 8px radius and the same warm-tinted shadows. It reads as *KAS at work*, not as a different
product. What it does **not** inherit is 128px section rhythm and full-bleed photography, because
operators use it for hours a day.

---

## 2. Shell

```
┌ TOP BAR — 56px, surface, border.subtle bottom ────────────────────────────┐
│ KAS Admin   [ All properties ▾ ]      ⌕ search    ⚡ quick    🔔 3    ◔   │
├──────────────┬────────────────────────────────────────────────────────────┤
│ SIDEBAR      │ CONTENT — container.wide, space.6 padding                  │
│ 240px        │                                                            │
│ surface.     │  Page heading (property scope echoed)     space.5          │
│ sunken       │  Filter bar                               space.4          │
│              │  Content                                                   │
└──────────────┴────────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Top bar | 56px, `surface`, `border.subtle` bottom, `z.sticky` |
| Wordmark | `display` face, 18px — the **only** display-face use in admin |
| **Property scope selector** | `secondary` button, always visible. **Scope echoed in every page heading.** Label reads **"All KAS properties"** — in V1 this resolves to the single partner's eight properties ([85](85-partner-property-model-amendment.md) §9) |
| Global search | 320px input, `⌘K` shortcut |
| Sidebar | 240px fixed, `surface.sunken`, `border.subtle` right; collapsible to 64px icons |
| Sidebar group heading | `label` 13px/600, `text.muted`, `tracking.wide`, `space.5` above |
| Sidebar item | 40px, `body-sm` 14px; active = `surface` + **3px `accent.500` left rail** + `text.primary` |
| Badge | `caption` 13px on `accent.100`. **Actionable counts only** |

**Eight areas** — Direct Sales · Operations · Distribution · Commercial · Content · Customers ·
Reviews · Security. Permission-filtered — **hidden, not greyed out**.

---

## 3. ADMIN DASHBOARD

**Purpose** — "What needs me now" in under five seconds. **Layout** — 3-col card grid, `space.5` gutter.

| Row | Cards |
|---|---|
| 1 — Urgent | Unactioned direct requests *(SLA breaches highlighted)* · Follow-ups due/overdue · Expiring holds *(countdown)* |
| 2 — Operations | **Arrivals today** *(all channels)* · Departures today · Occupancy 7/30 days |
| 3 — Distribution | **OTA recording lag** · Buffer overflow alerts · Reconciliation variance |
| 4 — Attention | Reviews awaiting moderation · Merge candidates · Failed email deliveries |

**Card anatomy** — title `label` 13px `text.muted` · metric `display-sm` 30px **tabular** · delta
`caption` + **arrow icon** + semantic colour · optional 32px sparkline · whole card is a link where a
drill-down exists.

**PROPOSED** — Row 1 cards use a **left rule in the SLA colour** (`success` / `warning` / `error`),
paired with a text label. Colour is never the sole signal.

**Responsive** — Tablet 2-col; mobile 1-col with rows 1–2 only.

---

## 4. RESERVATIONS / OPERATIONS

**Purpose** — Operate stays across **every** channel. **Query field: `stayStatus`.**

### 4.1 Arrivals

```
Arrivals — Tuesday 12 September                    [ All properties ▾ ]  [ Print ]
 ┌──────┬──────────────┬───────────┬──────────────┬─────────┬───────┬──────────┐
 │ Time │ Guest        │ Property  │ Rooms        │ Channel │ Nights│ Notes    │
 ├──────┼──────────────┼───────────┼──────────────┼─────────┼───────┼──────────┤
 │14:00 │ Nguyen Van A │ Milestone │ [Deluxe] × 2 │ ● Direct│   2   │ High floor│
 │15:30 │ M. Dubois    │ Milestone │ [Deluxe] × 1 │ ◆ Agoda │   3   │ —        │
 │~23:00│ J. Smith     │ Passion   │ [Suite] × 1  │ ● Direct│   4   │ Late     │
 └──────┴──────────────┴───────────┴──────────────┴─────────┴───────┴──────────┘
```

| Element | Spec |
|---|---|
| Row height | 48px |
| Channel indicator | ● Direct `accent.500` · ◆ OTA `info.500` — **icon + text label** |
| Special requests | `warning.100` chip where present |
| Print view | Stripped chrome, `surface` white, all rows |

**CONFIRMED — the critical rule.** The channel column is **displayed, never used to produce the list**.
Filtering arrivals by channel would drop OTA guests entirely — the highest-risk defect in the system
([63](63-phase-4-validation.md) R1). The query is `stayStatus`, always.

### 4.2 All reservations · departures · in-house · occupancy

| Screen | Spec |
|---|---|
| All reservations | Admin table. Filters: `stayStatus`, property, dates, **channel (optional, never default)** |
| Departures | `stayStatus = CHECKED_IN` + check-out date |
| In-house | `stayStatus = CHECKED_IN` |
| Occupancy | Derived from `stayStatus`; 30-day bar chart per property, `accent.500` fill |

### 4.3 Inventory calendar

| Element | Spec |
|---|---|
| Layout | Room types down (sticky 180px first column) × dates across (56px cells, 7-day groups separated by 2px `border.default`) |
| Cell | 48px high, shows `available / total` `caption` **tabular** |
| Colour weight | `success.100` comfortable → `warning.100` low → `error.100` sold out |
| Maintenance | Diagonal hatch **+ wrench icon** — pattern, not colour alone |
| Hover popover | Full breakdown: total · direct committed · OTA committed · buffer · maintenance · other blocks |
| Editing | `total`, `maintenance`, `otherBlocks` inline. **`available` is displayed and never editable** |
| Bulk | Range select → panel → **preview grid before commit (mandatory)** |

**Responsive** — Desktop only. Tablet read-only. **Not supported on mobile** — a deliberate choice.

---

## 5. RESERVATION DETAIL

**Layout** — Three columns desktop (4/5/3), stacked on mobile.

```
KAS-260912-4F7A          ⦿ New · 47m · within promise · unassigned   [Assign to me]

┌ LEAD ─────────────────────────────────────────────────────────────────────┐
│ Distribution DIRECT   Lead source FACEBOOK   Detail "[campaign]"          │
│ Sales owner  —                               Next follow-up  —            │
└───────────────────────────────────────────────────────────────────────────┘
┌ GUEST & STAY ──────────┬ WORKFLOW ───────────────┬ HISTORY ───────────────┐
│ Nguyen Van A           │ ① Availability check    │ Timeline               │
│ +84 … · Zalo preferred │   [Deluxe] ×2  4 avail ✔│ Contact log            │
│ Unverified email ⚠     │   [Suite]  ×1  1 avail ✔│ 🔒 Internal notes      │
│ 2 previous stays       │   [ Re-check ]          │ 👁 Guest messages      │
│                        │ ② Log contact           │ Changes                │
│ [Milestone]            │ ③ Confirm · Alternative │ Emails sent            │
│ 12–14 Sep · 2n         │      · Decline          │                        │
│ 3 adults, 1 child (6)  │ ④ Record payment        │                        │
│ Est. [12.450.000] ₫    │ ⑤ [ Mark as WON ]       │                        │
└────────────────────────┴─────────────────────────┴────────────────────────┘
```

| Element | Spec |
|---|---|
| **Lead band** | `surface.sunken`, `radius.md`, `space.4`. **Absent for OTA reservations** |
| Status pill | `caption` 13px/600 + SLA indicator + age |
| Workflow steps | Numbered, `space.4` gap, current step `border.strong` left rule |
| **`Mark as WON`** | Primary button. Route `POST /win`, field `salesStatus = WON` — **route, field and label all agree** |
| **🔒 Internal notes** | `surface.sunken`, lock icon, persistent label *"Internal — never shown to the guest"* |
| **👁 Guest messages** | `surface`, `accent.500` left rule 2px, eye icon, **preview required before send** |

**Alternative offer panel**

```
Offer alternatives                                    up to 3
 ① [Deluxe] × 3, same dates       4 available    ☐ Hold this
 ② Same rooms, 13–15 Sep          available      ☐ Hold this
 ③ [KAS Sonata], same dates       available      ☐ Hold this

 ☐ Release the original hold when sending
 Holds expire after [DIRECT_ALTERNATIVE_HOLD_DURATION]
                                         [ Preview ]   [ Send offer ]
```

**PROPOSED** — With the duration unconfigured, the *Hold this* checkboxes are **disabled with an inline
message naming the missing setting** (`CONFIG_MISSING`). The UI never invents a value.
**"Release the original"** is offered inline, because otherwise one guest holds two sets of rooms.

**CONFIRMED — OTA reservation detail** shows: distribution channel, OTA reference, guest, stay, rooms,
rate, recording metadata, stay timeline. **No lead band, no sales owner, no workflow steps, no SLA** —
those fields do not exist on the record.

---

## 6. DIRECT SALES / INQUIRIES

**CONFIRMED** — `channelType = DIRECT` only. **OTA never appears here.**

### 6.1 Inquiries

```
Inquiries                                              [ + New inquiry ]
 ⦿ New (4)   Mine   Follow-up due (2)   All

 Source     Contact        Interest      Question               Owner  Follow-up   Hold
 ─────────────────────────────────────────────────────────────────────────────────────
 FACEBOOK   Nguyen Van A   [Milestone]   "rooms in September?"  —      —           —
 ZALO       Tran Thi B     —             "family room?"         Linh   Today 16:00 ⏳3h
```

| Element | Spec |
|---|---|
| **Lead source** | First-class column, `caption` 13px/600 chip, `surface.sunken` |
| **Hold indicator ⏳** | `warning.100` chip with countdown — only where an `ALTERNATIVE_OFFER` hold exists |
| Qualify | Primary action → panel for property, dates, room types, quantities → **creates a reservation** |

**CONFIRMED** — The inquiry holds no inventory of its own. The hold column is empty unless an agent
explicitly placed one.

### 6.2 Direct request queue

```
Direct Requests                                  [ + New direct request ]
                                                 channelType = DIRECT
 ⦿ New (7)  Mine (3)  Breaching (1)  Follow-up due (5)  Awaiting payment  All

 Ref              Guest         Lead source  Property   Stay           Rooms  Value       Age    SLA Owner
 ────────────────────────────────────────────────────────────────────────────────────────────────────────
 KAS-260912-4F7A  Nguyen Van A  FACEBOOK     Milestone  12–14 Sep(2n)   3    12.450.000₫  47m    ●   —
```

| Element | Spec |
|---|---|
| Default sort | **Oldest unactioned first** — a request model fails by neglect, not by backlog order |
| SLA | ● within `success.500` · ▲ approaching `warning.500` · ■ breached `error.500` — **icon + text tooltip** |
| Filters | Status · **lead source** · property · **sales owner** · dates · value · SLA · follow-up due. **No generic "source" filter** |
| Bulk | Assign, export. **No bulk status transitions** — each request is a guest and a conversation |
| Row hover | `surface.sunken`; Enter opens |

### 6.3 Lead source analytics

**Conversion by lead source** — the headline. Horizontal bars, `accent.500`, tabular percentages.
Grouped: Owned · Social · Human · Relationship. **Never on the same axis as OTA channels.**

---

## 7. INVENTORY

Covered in §4.3. Additional screens:

| Screen | Spec |
|---|---|
| **Availability lookup** | "What can I sell?" — property × room type × date range, used while a guest is on the phone. Result rows show `availableDirect` per night with the **minimum highlighted** |
| **Buffer rules** | Table: property · room type · date range · days · type · value · priority · status. Editor is a drawer. **No default rule ships** — empty state states that `buffer = 0` until configured |
| **Holds** | All active holds: type · reservation/inquiry · room type · dates · quantity · created by · **expiry countdown** · manual release |

---

## 8. MEDIA / CONTENT

**CONFIRMED flow** — UPLOAD → ASSIGN → ORDER → COVER → ALT TEXT → DRAFT → PUBLISH.

### 8.1 Media library

```
Media Library                          [ ⬆ Upload ]   [ ▦ grid | ☰ list ]
 Filters: property · category · status · unused · ⚠ missing alt text

 ┌────────┬────────┬────────┬────────┐
 │  img   │  img   │  img   │  img   │  tile: category chip · usage count
 │ ⚠ alt  │   ✓    │   ✓    │ ⚠ alt  │  ⚠ = cannot publish
 └────────┴────────┴────────┴────────┘
```

Grid 4/3/2 cols, `aspect.thumb`, `space.3` gap. Selected = 2px `accent.500` + check.

### 8.2 Asset detail

| Block | Contents |
|---|---|
| Preview | Full image, dimensions, size, format |
| **Alt text** | **Both locales, required.** Empty = `warning` banner *"Cannot be published without alt text"* |
| Caption | Both locales, optional |
| Category, tags | Select + chips |
| **Usages** | Every place it appears, with links. **Delete blocked while non-empty — the block names the usages** |
| Replace | Updates every usage at once |

### 8.3 Gallery editor

```
KAS Milestone Premium Hotel — Property gallery     ● 18 published · ○ 3 draft

 ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
 │ ★ COVER│ │   2    │ │   3    │ │ + Add  │     drag to reorder
 │  ✓ alt │ │  ✓ alt │ │ ⚠ alt  │ │        │
 └────────┘ └────────┘ └────────┘ └────────┘
 Categories: Exterior · Lobby · Rooms · Dining · Facilities · Neighbourhood
                                    [ Preview as guest ]   [ Publish ]
```

| Element | Spec |
|---|---|
| Tile | 160×160, `aspect.thumb`, drag handle on hover |
| Cover | ★ badge, `accent.500`. **Exactly one per owner** |
| Missing alt | ⚠ `warning.500`, blocks publish |
| **Preview as guest** | Any draft, either locale, any breakpoint |
| Publish | Primary; disabled with a reason if any asset lacks alt text |

**Scoped variants** — Property gallery · Room gallery · Facility gallery. Same component, different
`owner_type`.

**CONFIRMED** — The website reflects published content **without a deploy**. No developer intervention
for normal image management.

---

## 9. Distribution — OTA recording

```
Record OTA reservation                                    TRANSITIONAL — V1

  Channel *        [ Booking.com ▾ ]
  OTA reference *  [ ____________ ]
  Property *       [ ▾ ]      Dates *  [ ___ ] → [ ___ ]
  Rooms *          [ room type ▾ ] × [ qty ]              [ + add ]
  Guest            name · email · phone
  Rate             [ ______ ] ₫
  Received at *    [ date/time ]        ← measures recording lag

                          [ Save and add another ]   [ Save ]
```

| Rule | Spec |
|---|---|
| **No sales owner field. No lead source field.** | They do not exist on this form |
| Keyboard-driven | Tab order top to bottom; `Save and add another` retains channel and property |
| Duplicate detection | On `(channel, otaReference)` → inline warning with a link to the existing record |
| **Never rejected** | Buffer overflow auto-expands and shows a `warning` banner; genuine oversell records and shows an `error` banner |
| Label | `TRANSITIONAL — V1` chip in the page heading |

**Channel Status** — per channel: buffer configured vs used · recorded reservations · **recording lag
distribution** · reconciliation variance · overflow alerts. This is where the buffer's retirement
criteria are measured.

---

## 10. Admin QA checklist

| # | Check |
|---|---|
| 1 | Admin shares KAS colour, type family, radius and shadow tokens |
| 2 | Display face appears **once** — the wordmark |
| 3 | Property scope visible on every screen and echoed in headings |
| 4 | **Arrivals query uses `stayStatus`; channel is display-only** |
| 5 | Direct Sales screens are `channelType = DIRECT` by construction |
| 6 | OTA recording form has **no sales owner and no lead source field** |
| 7 | `Mark as WON` — label, route and field all agree |
| 8 | 🔒 internal and 👁 guest-visible are visually unmistakable |
| 9 | Guest messages require a preview before send |
| 10 | `available` is displayed, never editable |
| 11 | Bulk rate and inventory changes require a preview grid |
| 12 | Alt text is a publish gate; media delete is blocked while in use |
| 13 | SLA and status use icon + text, never colour alone |
| 14 | Numeric columns use tabular figures |
| 15 | Queue, workspace, arrivals, availability lookup and OTA recording work on mobile |
