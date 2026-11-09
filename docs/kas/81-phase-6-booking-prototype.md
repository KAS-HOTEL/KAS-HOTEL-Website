# 81 — Booking Flow Visual Prototype

**Phase:** 6 — High-Fidelity Visual Design
**Status:** Implementation-ready
**Last updated:** 2026-08-14

> **KAS V1 is a request / sales-assisted booking model.** Nothing in this flow may visually imply
> instant OTA-style payment. Frozen in [57](57-phase-4-reservation-sales.md) and
> [68](68-phase-5-booking-experience.md).

---

## 1. The visual progression

```
SEARCH → RESULTS → ROOM SELECTION → YOUR STAY → CUSTOMER INFORMATION
      → REQUEST SUBMITTED → REQUEST STATUS → CONFIRMED
```

| # | Step | Density | Image ratio | Primary CTA | Exits |
|---|---|---|---|---|---|
| 1 | Search | Transactional | 0% *(overlays hero)* | Search | Full nav |
| 2 | Results | Transactional | 25–35% | Open property | Full nav |
| 3 | Room selection | Transactional | 35–45% | Add to Your Stay | Full nav |
| 4 | **Your Stay** | Transactional | **≤ 15%** | **Request this stay** | **Reduced** |
| 5 | Customer information | Form | **0%** | Continue to review | Back only |
| 6 | Review | Form | **0%** | **Request this stay** | Back, edit any element |
| 7 | Request submitted | Confirmation | 0% | Track this request | **Full nav restored** |
| 8 | Request status | Status | 0% | Contextual | Full nav |
| 9 | Confirmed | Status | 15% *(property thumb)* | Directions · Add to calendar | Full nav |

**PROPOSED — the two deliberate gradients:**

1. **Imagery falls to zero as commitment approaches.** Photography persuades; it does not help someone
   check a date. By step 5 there is none.
2. **Exits narrow, then reopen.** Steps 1–3 sit inside the full site. Steps 4–6 progressively remove
   navigation. Step 7 restores everything. Every exit offered during Your Stay is an invitation to
   abandon.

---

## 2. Progress indicator

**Steps 4–6 only.**

```
  ●━━━━━━━━━━○━━━━━━━━━━○
  Your Stay  Your Details  Review
```

| Element | Spec |
|---|---|
| Type | `label` 13px/600, `tracking.wide` |
| Complete | `accent.500` filled dot 10px |
| Current | `accent.500` ring 12px + `text.primary` label |
| Upcoming | `border.default` hollow dot + `text.muted` label |
| Connector | 2px, `border.subtle`; completed segments `accent.500` |
| Mobile | Labels hidden below 480px; "Step 2 of 3" `caption` beneath |

**CONFIRMED** — The labels are **Your Stay → Your Details → Review**. They are **never** Cart →
Checkout → Payment. There is no payment step, and implying one is the single most damaging vocabulary
error available in this product.

**Accessibility** — `<ol>` with `aria-current="step"`; each step announces "completed" / "current" /
"not completed".

---

## 3. The request statement

**PROPOSED** — A single reusable block, appearing at four points with escalating specificity. Same
component, same tokens, different content weight.

| Where | Treatment |
|---|---|
| Room card, on first add | Toast: *"Added to Your Stay. Nothing is booked yet."* |
| **Your Stay, above the button** | `surface.sunken`, `radius.md`, `space.4`, icon + 2 lines |
| **Review step, above the button** | Same, plus the numbered "What happens next" list |
| Request submitted | Full "What happens next" as rank-1 content |

**Canonical wording**

```
This is a booking request. No payment is taken now.
We'll confirm availability and contact you [within the day].
```

`body-sm` 14px, `text.secondary`; "No payment is taken now" in `font.weight.semibold` `text.primary`.

**CONFIRMED** — The SLA phrase comes from **one settings value** (config A6), so screen, email and the
internal timer can never disagree.

---

## 4. Step-by-step visual specification

### 4.1 Search → Results

**Transition** — Full page load, server-rendered. Search context bar persists at the top, **editable in
place**. No modal, no overlay: the guest must be able to share and bookmark the URL.

**Visual continuity** — The search panel from the hero becomes the sticky context bar. Same tokens,
reduced height 72px → 56px.

### 4.2 Results → Room selection

Property row → property page (`#rooms` anchor) → room cards. **Dates travel with the guest** and are
never re-entered.

**The seam** — the property page is editorial above and transactional below; the sticky stay bar appears
exactly at the transition and carries `View rooms`.

### 4.3 Room selection → Your Stay

**No navigation on add.** The room list stays put; the Your Stay summary updates in place.

| Breakpoint | Summary |
|---|---|
| Desktop | Sticky side panel, 4 cols, `surface.elevated`, `shadow.lg` |
| Tablet | Sticky side panel, narrower |
| Mobile | **Bottom sheet**, collapsed to a 64px bar showing "N rooms · estimated total · Your Stay →" |

**Add feedback** — the line appears in the summary with a 250ms fade; the total animates from old to
new value over `motion.base` (disabled under reduced motion); a toast confirms with the "nothing is
booked yet" line. **No modal, no full-screen interruption.**

### 4.4 Your Stay

Full specification in [79](79-phase-6-customer-screens.md) §6. Visual emphases:

| Element | Rank | Treatment |
|---|---|---|
| **Estimated total** | 1 | `price-lg` 26px/600, top rule `border.default` |
| **"estimated"** | 2 | `body-sm` `text.muted`, directly beneath — never omitted |
| Request statement | 2 | `surface.sunken` block above the button |
| **Request this stay** | 1 | `primary` `lg`, full-width mobile |
| Good to know | 3 | `surface.sunken`, includes cancellation `[BLOCKED — A4]` |
| Property thumb | 4 | 72×72 — the only image on the screen |

### 4.5 Customer information

`container.narrow` 680px, centred at every breakpoint. Field gap `space.5`; group gap `space.7`.
Validation **on blur**. No imagery.

**PROPOSED** — A **persistent summary rail** on desktop (4 cols, sticky): property, dates, rooms,
estimated total. The guest should never have to go back to remember what they are requesting.

### 4.6 Review

Every element carries `[ Change ]` (`ghost`, `body-sm`) returning to that step **and back to review**,
with all other data intact. A guest who loses their form data here does not come back.

```
WHAT HAPPENS NEXT                          label, tracking.wide
1  Your request reaches the KAS reservations team.
2  We confirm availability and contact you [within the day].
3  We arrange payment together — nothing is charged now.

☐  I've read and accept the booking terms        body-sm, link to policies

           [   Request this stay   ]              primary, lg
```

**Numbered list** — `body` 16px, numbers `accent.500` `font.weight.semibold`, `space.3` between items.

### 4.7 The submit moment

| Requirement | Spec |
|---|---|
| Button label | **"Request this stay"** — sentence case, never uppercase, never "Book"/"Pay"/"Confirm" |
| Loading | Spinner replaces the leading icon; **label retained**; `aria-busy`; **non-cancellable** |
| Overlay | Full-screen `color.scrim` + centred card: *"Sending your request — please don't refresh."* |
| Duration guard | If > 8s, add *"Still working…"* — never a silent spinner |
| Double-submit | Idempotency key; button disabled on first press |
| Failure | Inline `error` alert above the button · selection preserved · correlation ID `caption` · **phone number** |
| Availability lost | Inline explanation + alternatives. **Never a silent quantity reduction** |

### 4.8 Request submitted

Full specification in [79](79-phase-6-customer-screens.md) §8.

**Visual signature** — a single 48px `success.500` check mark, `space.7` above the headline. **No
confetti, no animation beyond a 400ms fade-in.** The tone is *calm confirmation*, not celebration —
nothing has been booked yet, and the design must not overstate it.

### 4.9 Request status

Full specification in [79](79-phase-6-customer-screens.md) §9.

```
┌ CURRENT STATUS ───────────────────────────── rank 1 ─┐
│  Your requested room is available      heading-lg    │
│  Next: we'll arrange payment together. body           │
└──────────────────────────────────────────────────────┘

  ● Your requested room is available        Today 16:20
    │
  ● We're contacting you                    Today 15:40
    │ [Linh] from KAS Reservations called you.
  ● Checking availability                   Today 14:35
    │
  ● Request received                        Today 14:03
```

| Element | Spec |
|---|---|
| Current status block | `surface.sunken`, `radius.md`, `space.5`, `space.7` below |
| Timeline dot | 12px; current `accent.500` filled; past `border.default` |
| Connector | 2px `border.subtle`, `space.5` between entries |
| Label | `body-sm` 14px/600 `text.primary` |
| Timestamp | `caption` 13px `text.muted`, right-aligned |
| Guidance | `body-sm` `text.secondary`, indented `space.5` |

**CONFIRMED** — **No fixed-step progress bar.** A request can branch to alternatives, decline or
expire; a "5 of 7" bar would promise a path that may not happen. The timeline shows what *has*
happened.

**CONFIRMED** — `WON`, `ASSIGNED`, `AVAILABILITY_CHECK`, `CUSTOMER_CONTACTED` **never appear**.

### 4.10 Alternatives

```
ALTERNATIVE OPTIONS AVAILABLE                       heading-lg

We couldn't confirm [Suite Balcony] for 12–14 Sep.
Here are three options — each keeps the rest of your stay as requested.

┌───────────────────────────────────────────────────────────┐
│ ① Same hotel, different room          heading-sm          │
│   [Deluxe] × 3 · 12–14 Sep                                │
│   [11.100.000] ₫       −[1.350.000] ₫    price + delta    │
│                                       [ Choose this ]     │
├───────────────────────────────────────────────────────────┤
│ ② Same rooms, shifted dates                               │
│ ③ Another KAS hotel — [KAS Sonata], District [3]          │
└───────────────────────────────────────────────────────────┘

Held for you until [date/time]        ← only when a hold exists

None of these work?   [ Talk to us ]      [ Cancel my request ]
```

| Rule | Spec |
|---|---|
| Maximum three | More becomes a search results page, which is not what a waiting guest wants |
| **What differs** | The card headline states the difference, not the whole offer |
| Price delta | `caption`, semantic colour + sign. Never highlighted as a "deal" |
| Other KAS property | **Neutral presentation** — no "cheaper", no "upgrade", no comparison badge |
| **"Held for you until"** | `warning.100` chip. Appears **only** where an `ALTERNATIVE_OFFER` hold is active. Framed as KAS holding something *for* the guest |

### 4.11 Confirmed

`success` status band, rank 1: **"Your stay is confirmed"**. Then: property with image · dates ·
rooms · total in **VND only** · directions · check-in details · contact · Add to calendar.

**CONFIRMED** — USD **disappears entirely** from this point onward: not here, not in email, not in the
price snapshot ([56](56-phase-4-pricing.md) §6).

---

## 5. What must never appear

| Prohibited | Reason |
|---|---|
| "Book Now" · "Pay Now" · "Confirm Booking" · "Checkout" | Misrepresents the model |
| Cart / basket iconography | It is a stay being assembled, not goods purchased |
| Payment card logos or a payment step | No gateway in V1 |
| Countdown timer on price or availability | Manufactured urgency, prohibited |
| "X people are viewing" | Fabricated social pressure |
| Instant-confirmation language before `stayStatus = CONFIRMED` | Legally and factually wrong |
| Internal state names | Confirmed prohibition |
| Physical room numbers | Confirmed prohibition |
| USD at or after commitment | Would create a price KAS never quoted |
| Fixed-step progress bar in status | Promises a path that may not happen |

---

## 6. Trust devices, by step

| Step | Device |
|---|---|
| 2 Results | Real availability counts · verified review scores |
| 3 Room selection | Honest availability · price basis stated |
| 4 Your Stay | "estimated" label · policy block · request statement |
| 5 Details | Minimal fields · **"No payment is taken"** repeated |
| 6 Review | Full summary · every element editable · "What happens next" |
| 7 Submitted | Reference · response promise · **phone number** · masked email |
| 8 Status | Named agent (first name) · timeline · **phone number** |
| 9 Confirmed | Full details · directions · property contact |

**PROPOSED** — A **phone number appears on every screen from step 4 onward, and on every error state**.
In a request model the human channel is not a fallback — it is the product.

---

## 7. Flow QA checklist

| # | Check |
|---|---|
| 1 | Progress indicator reads Your Stay → Your Details → Review |
| 2 | No screen implies instant payment or instant confirmation |
| 3 | "Request this stay" is the label at both submit points |
| 4 | The request statement appears at all four defined points |
| 5 | Dates are never re-entered once given |
| 6 | Imagery falls to 0% by step 5 |
| 7 | Exits narrow at steps 4–6 and reopen at step 7 |
| 8 | "estimated" accompanies every total before confirmation |
| 9 | USD absent from step 7 onward |
| 10 | Internal state names absent from all customer screens |
| 11 | No physical room numbers anywhere |
| 12 | Phone number present from step 4 onward and on every error |
| 13 | Submit is non-cancellable, idempotent, with a "don't refresh" message |
| 14 | Availability lost → alternatives, never a silent reduction |
| 15 | "Held for you until" appears only where a real hold exists |
| 16 | Cancellation block present in structure, **empty and blocking until config A4** |
