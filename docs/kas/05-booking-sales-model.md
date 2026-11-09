# 05 — Booking & Sales Model

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. The confirmed model

**CONFIRMED** — KAS operates a **sales-assisted booking request model**. The website does not take
payment and does not issue instant confirmations.

```
Customer
  → Search
  → Select Hotel
  → Select Room Type
  → Select Quantity
  → Your Stay
  → Customer Information
  → Booking Request
        ↓
  → Sales / Admin receives request
  → Sales contacts customer
  → Availability is confirmed
  → Payment is handled separately
  → Booking becomes confirmed
```

**CONFIRMED** — This must **not** be converted into a Booking.com-style instant payment model.

## 2. Why the architecture must respect this precisely

**PROPOSED** — A request model is not "a checkout with the payment step removed". It changes three
things fundamentally, and getting these wrong is the main failure mode for this project:

1. **Availability at request time is provisional, not committed.** The guest is told what the system
   believes is available; sales confirms the truth. The system must therefore be honest about
   confidence without undermining trust.
2. **The valuable artefact is the *lead*, not the transaction.** A request that sales cannot act on
   is a failure even if the guest submitted it happily. Field completeness and contactability matter
   more than funnel speed.
3. **The waiting period is part of the product.** Between submission and sales contact, the guest is
   uncertain. Most booking platforms have no equivalent window. Everything about that window —
   acknowledgement, expectation setting, status visibility, follow-up — is product surface that must
   be deliberately designed rather than left to email defaults.

## 3. Guest-side flow

**PROPOSED** — Step definition, with the requirement each step satisfies.

| # | Step | Guest sees | Requirement |
|---|---|---|---|
| 1 | **Search** | Destination (property or "all KAS"), dates, guests, rooms | Prominent on homepage; persistent in header thereafter |
| 2 | **Select hotel** | Results with real availability and from-price for the dates | Never show a property as available when it is not |
| 3 | **Select room type** | Room types with availability count and price | Only requestable types are selectable |
| 4 | **Select quantity** | Stepper bounded by availability across all nights | Cannot exceed available inventory (**CONFIRMED** requirement) |
| 5 | **Your Stay** | All selected rooms, dates, guests, estimated total | Fully editable; clearly labelled estimate |
| 6 | **Customer information** | Contact details, special requests, arrival info | Minimal required fields; guest checkout allowed |
| 7 | **Review & submit** | Full summary + policies + what happens next | Explicit statement that this is a request |
| 8 | **Request submitted** | Reference code, response-time promise, next steps | Immediate on-screen and email acknowledgement |

### 3.1 The submit moment

**PROPOSED** — The highest-risk moment in the product. Requirements:

- The primary action reads **"Request This Stay"** — never "Book Now", "Pay", or "Confirm Booking".
- Directly adjacent to the button, in plain language: *"This sends a request to the KAS team. We'll
  confirm availability and contact you within [SLA]. No payment is taken now."*
- Policies (cancellation, check-in/out, children, deposit) are visible **before** the button, not
  behind a link the guest is unlikely to open.
- On success: a reference code (**PROPOSED** format `KAS-YYMMDD-XXXX`), a clear statement of what
  happens next and when, the contact channel for questions, and an option to create an account to
  track the request if submitting as a guest.

### 3.2 Required customer information

**PROPOSED** — Minimum viable set. Every additional field costs completion rate; every missing field
costs sales a phone call.

| Field | Required | Rationale |
|---|---|---|
| Full name | Yes | Identification |
| Email | Yes | Acknowledgement and record |
| Phone (with country code) | Yes | Primary sales contact channel in Vietnam |
| Preferred contact channel & time | Recommended | Zalo is standard in Vietnam (OQ-032) |
| Country / nationality | Recommended | Vietnamese properties record guest nationality for registration |
| Estimated arrival time | Optional | Operationally valuable |
| Special requests | Optional | Free text, character-limited |
| Purpose of stay | Optional | Business / leisure — useful for service |
| Company & tax invoice details | Conditional | Vietnamese VAT invoicing (OQ-022) |
| Marketing consent | Explicit opt-in | Must be unticked by default |

**NEEDS CONFIRMATION** — Whether guest (unauthenticated) requests are permitted, or an account is
required. **PROPOSED**: allow guest requests, offer one-click account creation afterwards. Requiring
registration before a request will measurably reduce submissions. OQ-016.

## 4. Direct sales workflow

> **Scope (CONFIRMED, Phase 1.5).** This workflow applies to **direct leads only** — customers who
> reached KAS through the website, Facebook, Zalo, TikTok, Instagram, phone, walk-in, referral, or as
> returning guests. **KAS Sales does not manage OTA customers.** Reservations sold through
> Booking.com, Agoda, Ctrip or Traveloka are external distribution, never sales leads, and never enter
> this workflow. See [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md).

**PROPOSED** — What happens after a direct lead is created — whether the customer submitted it on the
website or a sales agent created it from a social message or phone call — and what the admin console
must support.

```
NEW REQUEST arrives
   ├─ System: acknowledgement email to guest
   ├─ System: notification to sales queue (email / in-app / optionally Zalo or Telegram)
   ├─ System: soft-hold placed on inventory (see §6)
   └─ System: SLA timer starts
        ↓
SALES picks up request  → assigned to a named agent
        ↓
SALES verifies availability against the true operational picture
        ↓
   ┌────────────────┬────────────────────────┬─────────────────────┐
   │ Available      │ Partially available    │ Not available       │
   ├────────────────┼────────────────────────┼─────────────────────┤
   │ Contact guest  │ Contact with           │ Contact with        │
   │ Confirm terms  │ alternatives (dates,   │ alternatives at     │
   │ Arrange payment│ room types, quantity)  │ other KAS properties│
   └────────────────┴────────────────────────┴─────────────────────┘
        ↓
GUEST accepts → payment arranged out-of-band → CONFIRMED
GUEST declines → CANCELLED with reason
NO RESPONSE → follow-up sequence → EXPIRED
```

### 4.1 Admin capabilities required

**PROPOSED**

- A **queue view** ordered by age with SLA breach highlighted, filterable by property, status, and
  assignee
- **Assignment** to a named agent; reassignment with reason
- **Contact log**: channel, timestamp, outcome, notes — every touch recorded
- **Modification** of the request (dates, room types, quantities, price) with full change history and
  guest-visible revision
- **Alternative offering**: propose different dates/types/properties and send to the guest
- **Status transitions** as defined in [14-booking-state-machine.md](14-booking-state-machine.md),
  each requiring the correct permission
- **Payment recording**: method, amount, reference, received date, receipt attachment — recorded as a
  fact, not processed by the platform
- **Internal notes**, never guest-visible, clearly differentiated in the UI from guest-visible messages
- **Templated communications** with per-request personalisation

### 4.2 Service level

**NEEDS CONFIRMATION** — The response-time promise is a business commitment we cannot invent (OQ-013).

**PROPOSED** — For approval:

| Request received | First contact target |
|---|---|
| 08:00–20:00 ICT | Within 2 hours |
| 20:00–08:00 ICT | By 10:00 the next morning |
| Any | Absolute maximum 24 hours |

Whatever is agreed becomes: the on-screen promise, the acknowledgement email text, the SLA timer, and
the escalation threshold. These must always agree — a single settings value drives all four.

## 5. Payment

**CONFIRMED** — The website does not currently integrate payment gateways. Payment is handled outside
the website. Sales is responsible for consultation and payment confirmation.

**CONFIRMED** — KAS may support (currently outside the website, or as future integrations): bank
transfer, QR, VNPay, MoMo, ZaloPay, Visa/Mastercard, payment at hotel.

**CONFIRMED** — Do not implement a payment gateway unless explicitly instructed later. Design the
architecture so it can be added later **without redesigning the booking domain**.

### 5.1 How the architecture stays payment-ready without payment

**PROPOSED**

1. **A `Payment` concept exists in the domain from day one** — but in v1 it only *records* payments
   that happened elsewhere. Fields: method, amount, currency, reference, received date, recorded-by,
   evidence attachment, status.
2. **A `PaymentProvider` port is defined but has exactly one v1 adapter: `ManualPaymentAdapter`.**
   Adding VNPay later means adding an adapter, not restructuring bookings.
3. **The booking state machine already contains `PAYMENT_PENDING`.** The transition into `CONFIRMED`
   is driven by a payment *event*, whether that event originates from a human recording a bank
   transfer or from a gateway webhook. The domain does not care which.
4. **Money is modelled properly from the start**: integer minor units, explicit currency (VND —
   note VND is a **zero-decimal** currency, which must be handled deliberately), amount breakdown
   (room subtotal, taxes, service charge, discounts, total), and an immutable price snapshot on the
   booking so later rate changes never alter a historical booking.
5. **No payment credentials ever touch the platform** in v1. No card fields, no bank credentials.
   This is also the correct security posture — it keeps KAS out of PCI-DSS scope entirely.

**PROPOSED** — Deposit handling: many Vietnamese hotels take a partial deposit to confirm. The model
supports partial payments (multiple `Payment` records against one booking, with a computed balance).
Whether KAS requires a deposit, and at what percentage, is OQ-017.

### 5.2 Vietnamese market context

Local payment behaviour is relevant to how the future gateway phase should be prioritised: QR-based
payment (VietQR via the NAPAS switch) accounts for the majority of Vietnamese payment transactions,
with bank transfer — increasingly initiated via VietQR — the backbone for larger purchases, and MoMo,
ZaloPay and VNPay the dominant wallets. See [17-research-notes.md](17-research-notes.md).

**PROPOSED** — When payment integration is authorised, the priority order should be **VietQR / bank
transfer first**, wallets second, international cards third — the inverse of what a Western-designed
platform would assume. International guests, however, will expect card payment, so cards cannot be
dropped.

## 6. Inventory holds

**NEEDS CONFIRMATION** — Whether a submitted request should hold inventory (OQ-018). This is a
genuine business trade-off, not a technical detail.

| Option | Behaviour | Trade-off |
|---|---|---|
| **A — No hold** | Request does not reduce availability | Simple; risk of overselling the same room to several requesters, forcing sales to disappoint guests |
| **B — Soft hold** *(**PROPOSED**)* | Request holds inventory for a configurable window (default 24h), visible only to admin | Protects the guest experience; needs expiry handling and a release job |
| **C — Hard hold** | Inventory committed until sales resolves | Highest guest protection; blocks inventory on speculative or fraudulent requests |

**PROPOSED — Option B**, with: a configurable window per property, automatic release on expiry, admin
ability to extend, and a clear admin indication of held vs. genuinely booked inventory. A soft hold
is the only option consistent with both "prevent overbooking" (confirmed) and "sales confirms
availability" (confirmed).

Mechanics in [15-inventory-rules.md](15-inventory-rules.md).

## 7. Communications triggered by the booking lifecycle

**CONFIRMED** — Guests receive booking emails, notifications, check-in reminders, and post-stay
thank-you emails.

**PROPOSED** — Full communication map. Timing values require approval (OQ-019).

| Trigger | Channel | Timing | Content |
|---|---|---|---|
| Request submitted | Email + in-app | Immediate | Reference code, full summary, response-time promise, contact details |
| Sales assigned | In-app | Immediate | Named agent |
| Sales contacted | Email (optional) | On log | Recap of the conversation |
| Availability confirmed | Email + in-app | Immediate | Confirmed rooms, dates, final price, payment instructions |
| Payment pending | Email | On transition | Payment methods, deadline, reference |
| Payment reminder | Email | 24h before deadline | Gentle reminder |
| Booking confirmed | Email + in-app | Immediate | Full confirmation, directions, check-in details, cancellation terms |
| Check-in reminder | Email | 48h and 24h before | Directions, arrival time, contact, what to bring |
| Day-of arrival | Email/SMS (**FUTURE**) | Morning of arrival | Warm welcome, contact number |
| Check-out reminder | Email | Morning of departure | Check-out time, late check-out option, invoice |
| Post-stay thank-you | Email | 24h after check-out | Thanks, review invitation, offer for next stay |
| Review reminder | Email | 7 days after, once | Single reminder only |
| Request expiring | Email | Before expiry | Prompt to respond |
| Request cancelled | Email | On transition | Reason, alternatives, no hard feelings |

Architecture in [10-system-requirements.md](10-system-requirements.md) §7.

## 8. What we are explicitly not building

**CONFIRMED / PROPOSED**

- No online payment capture
- No card storage
- No instant confirmation
- No automated availability guarantee to the guest
- No dynamic pricing engine
- No OTA rate parity automation
- No overbooking algorithm

## 9. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| B1 | Guest abandons at submit because a request feels less certain than an OTA booking | Lost revenue | Explicit promise, instant acknowledgement, visible status, named contact, social proof at the decision point |
| B2 | Sales response is slow; guest books elsewhere | Lost revenue, brand damage | SLA timers, ageing queue, escalation, alerting |
| B3 | Sales confirms availability that does not exist | Severe guest harm | Soft holds + reconciliation with operational truth (OQ-011) |
| B4 | Displayed estimate differs from the final quoted price | Trust damage, disputes | Label estimates clearly, itemise, freeze a price snapshot at request time, require explicit guest acceptance of any change |
| B5 | Payment happens off-platform and is never recorded | Reconciliation failure | Mandatory payment recording before `CONFIRMED`; finance export |
| B6 | Speculative or duplicate requests block real inventory | Lost revenue | Soft-hold expiry, duplicate detection, rate limiting, optional email verification for large requests |
| B7 | The request model is quietly redesigned into a checkout by a future contributor | Violates a confirmed constraint | Documented here; language rules enforced in UI copy review |
