# 57 — Reservation & Sales Inquiry Model

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative
**Last updated:** 2026-08-14

---

## 1. The two objects

| | **SalesInquiry** | **Reservation** |
|---|---|---|
| Represents | A direct conversation before the stay is specified | A specified stay, whatever channel sold it |
| Requires | Lead source + a contact fragment | Property + dates + ≥1 room type + quantity |
| Channels | **DIRECT only** | **All channels** |
| Inventory | **None of its own** | Holds, then firm commitment |
| Lifecycle | `NEW → QUALIFIED \| LOST` | `salesStatus` + `stayStatus` |
| V1 | ✔ **CONFIRMED** | ✔ |

**CONFIRMED** — The inquiry is **not a parallel booking entity**. Once enough information exists it
*qualifies into* a reservation and becomes terminal. There is no duplication: every field it holds is
one that does not yet exist as reservation data.

---

## 2. Customer-facing flow

**CONFIRMED**

```
SEARCH → PROPERTY → ROOM TYPE → QUANTITY → STAY SUMMARY → CUSTOMER DETAILS
      → REQUEST → KAS SALES → AVAILABILITY → CUSTOMER CONTACT → PAYMENT → CONFIRMED
```

| Step | System state | Guest sees |
|---|---|---|
| Search | — | Properties with availability for the dates |
| Property | — | Rooms, price, availability |
| Room type + quantity | — | `[−] qty [+]`, bounded by availability across **all** nights |
| Stay summary ("Your Stay") | Client/session state — **not a persisted entity** | Lines, dates, guests, **estimated** total |
| Customer details | — | Minimal required fields |
| **Request** | `salesStatus = REQUESTED`, holds placed | "Request received" + reference |
| KAS Sales | `ASSIGNED → AVAILABILITY_CHECK → CUSTOMER_CONTACTED` | Plain-language status |
| Availability / alternatives | `ALTERNATIVE_OFFERED` | "Alternative options available" |
| Payment | Recorded, not processed | "Payment instructions ready" |
| **Confirmed** | `salesStatus = WON` + `stayStatus = CONFIRMED` | "Booking confirmed" |

**CONFIRMED** — Primary CTA is **REQUEST THIS STAY**. Never *Book Now*, *Pay Now*, or *Confirm*.

### 2.1 Multi-selection

**CONFIRMED** — A guest may select multiple room types, multiple quantities, and multiple rooms in one
request.

| Rule | Detail |
|---|---|
| One property per request | All lines share one property (OQ-014) |
| One date range per request | All lines share check-in and check-out |
| Quantity ceiling per line | **Minimum availability across every night** of the stay |
| Portfolio ceiling | Config B15 — above it, routed as a group enquiry |
| Occupancy guidance | Advisory, never blocking: *"2 rooms fit up to 4 guests. Add a room for your 5th?"* |
| Live re-validation | On stay-summary open, on any change, and **under lock at submission** |

### 2.2 What the guest sees, and never sees

| Sees | Never sees |
|---|---|
| Room type name | **Physical room numbers** |
| **Available quantity** | `total`, `maintenance`, blocks, buffer, commitments |
| Price per room per night | Rate rules, `ruleId`, margin |
| Amenities, images, area, bed, max guests | Holds, `expiresAt`, hold mechanics |
| Plain-language request status | `salesStatus`, `salesOwner`, `leadSource` |
| — | `distributionChannel`, `otaReference`, internal notes, SLA timers |

---

## 3. Sales-created requests — on behalf of the customer

**CONFIRMED** — Direct Sales may create a request for a customer who arrived through Facebook, Zalo,
TikTok, Instagram, Phone, Walk-in, Referral, or as a Returning Customer.

```
Same object. Different door.

Website        customer creates it          leadSource = WEBSITE   createdBy = NULL
Social/phone   sales creates it on          leadSource = FACEBOOK  createdBy = <agent>
               the customer's behalf                  ZALO / TIKTOK / INSTAGRAM /
                                                      PHONE / WALK_IN / REFERRAL /
                                                      RETURNING_CUSTOMER
```

**PROPOSED** — `createdBy` distinguishes self-service from agent-created without changing the entity.
`salesOwnerId` is who *owns* it; `createdBy` is who *entered* it. They are frequently the same person
and occasionally not — the distinction matters for attribution and for audit.

### 3.1 Two creation paths for sales

| Path | When | Result |
|---|---|---|
| **Direct creation** | The customer's first message already contains property, dates, room type and quantity | Reservation at `salesStatus = REQUESTED`. No inquiry |
| **Via inquiry** | *"Do you have rooms in September?"* — nothing specified yet | `SalesInquiry` at `NEW`, qualified later into a reservation |

**PROPOSED** — Sales should not be forced through the inquiry when the information already exists. The
inquiry exists to make vague enquiries **visible**, not to add a step to clear ones.

---

## 4. Reservation composition

### 4.1 Header

| Group | Fields |
|---|---|
| **Identity** | `id`, `reference` (`KAS-YYMMDD-XXXX`, non-sequential) |
| **Channel** | `distributionChannelId`, `channelType`, `otaReference` (OTA only) |
| **Direct sales** | `leadSource`, `leadSourceDetail`, `salesOwnerId`, `inquiryId` — **all NULL for OTA** |
| **Lifecycle** | `salesStatus` (NULL for OTA), `stayStatus` |
| **Stay** | `propertyId`, `checkIn`, `checkOut`, `adults`, `children`, `childrenAges[]` |
| **Guest** | `customerId` (nullable), name, email, phone, country, preferred channel, special requests |
| **Commercial** | `priceSnapshot`, subtotal / tax / service charge / discount / total, currency, `voucherId`, `termsVersion` |
| **Provenance** | `createdBy`, `requestedAt`, `wonAt`, `confirmedAt`, `slaDueAt` |

### 4.2 ReservationLine

```
reservation_line
  reservation_id, room_type_id
  quantity                     ≥ 1
  room_type_name_snapshot      survives later renames
  nightly_price_minor          snapshot
  line_total_minor             snapshot
  UNIQUE (reservation_id, room_type_id)
```

**PROPOSED** — Same room type, several rooms = **one line, quantity N**. Not N lines. Different room
types = separate lines.

### 4.3 Guest counts

**PROPOSED** — Guest counts sit on the **reservation**, not the line. A party of 4 across 2 room types
is 4 guests on the stay; attributing them per line would be fiction unless the guest assigns them, and
they have no reason to.

`childrenAges[]` is required whenever `children > 0` — child pricing (config B10) and occupancy
validation both depend on it.

---

## 5. Payment

**CONFIRMED** — V1 **records** payments made elsewhere. No gateway, no card data, no credentials.

| Aspect | Rule |
|---|---|
| Model | `payment` rows against a reservation; multiple permitted (deposits) |
| Fields | Method, amount, currency, external reference, `receivedAt`, `recordedBy`, evidence attachment |
| Required to reach `WON` | Depends on config B12 — deposit rule, or pay-at-hotel |
| Balance | Computed: `total − Σ verified payments` |
| Guest visibility | Summary only — amount, date, method. Never internal reconciliation fields |
| **Future** | A `PaymentProvider` port exists with one V1 adapter, `ManualPaymentAdapter` |

---

## 6. Modification

**PROPOSED** — Sales-mediated after submission. Never silent.

```
1. Agent proposes the change (dates / room types / quantities)
2. Availability re-checked under lock for the new shape
3. Old holds released, new holds placed — one transaction
4. Price recomputed; snapshot re-versioned, prior version retained
5. Change written to reservation_change with before/after and reason
6. Guest notified; where price increased, explicit acceptance is required
7. Only then does the reservation reflect the change
```

**CONFIRMED** — After `WON`, the price snapshot is sealed. A post-`WON` modification creates a new
snapshot version with an explicit acceptance record; it never mutates the sealed one.

---

## 7. Cancellation

**BLOCKED — config A4 / A5.**

**PROPOSED** — Two situations that must not be conflated:

| | Cancelling a **request** (pre-`WON`) | Cancelling a **confirmed stay** (post-`WON`) |
|---|---|---|
| Nature | Withdrawing a request. Nothing agreed, nothing paid | Cancelling an agreed stay, possibly after payment |
| Guest may self-serve | **PROPOSED: yes**, one action, no penalty | **BLOCKED on policy** |
| Effect | `salesStatus = CANCELLED`; holds released | `stayStatus = CANCELLED`; commitment released; `salesStatus` stays `WON` |

Until A4 exists, a confirmed booking shows **"Contact us to change or cancel"** with a phone number and
Zalo. That is honest and safe, but it is a stopgap and should not survive launch.

---

## 8. Expiry

| Object | Trigger | Result |
|---|---|---|
| Request hold | `expiresAt` (config B2) | `salesStatus = EXPIRED`; holds released; guest warned beforehand |
| Alternative hold | `expiresAt` (config **B1**) | Hold `EXPIRED`; offer may be re-made if availability allows |
| Alternative offer | Offer expiry (config B19) | Offer lapses; reservation returns to `CUSTOMER_CONTACTED` |
| Payment deadline | Config B12 | `EXPIRED` unless extended |
| Inquiry | Follow-up attempts exhausted (config B18) | `LOST`; any holds released |

**PROPOSED** — An expired request offers **"Recreate this request"**, pre-filled. A guest who already
wanted to stay should not have to re-enter everything.

---

## 9. Idempotency and duplicates

| Risk | Mechanism |
|---|---|
| Double submission (network retry) | Idempotency key on submit; the second attempt returns the first reservation |
| Duplicate OTA recording | `UNIQUE (distribution_channel_id, ota_reference)`; returns the existing reservation |
| Duplicate guest requests | Detected on (email, property, dates); surfaced to sales, **not auto-merged** |
| Retried timer job | All jobs idempotent; holds already terminal are skipped |

---

## 10. Field-level contract

| Field | Direct | OTA | Enforcement |
|---|---|---|---|
| `distributionChannelId` | `DIRECT` | one of 4 OTAs | FK |
| `leadSource` | **required** | **NULL** | CHECK |
| `salesOwnerId` | optional | **NULL** | CHECK |
| `salesStatus` | required | **NULL** | CHECK |
| `stayStatus` | NULL until `WON` | **`CONFIRMED` on entry** | Application |
| `otaReference` | **NULL** | **required** | CHECK |
| `inquiryId` | optional | NULL | Application |
| `createdBy` | NULL if self-service | recording staff | — |
| `priceSnapshot` | required at `REQUESTED` | required at recording | Application |
| Holds | `REQUEST` + optional `ALTERNATIVE_OFFER` | **none** — already sold | Application |

---

## 11. Open items

| Config | Item | Impact |
|---|---|---|
| **A4 / A5** | Cancellation and no-show policy | **Blocks the booking flow from publishing** |
| A6 | "Within the day" SLA boundary | Guest-facing promise, timers, escalation |
| A7 | VAT / service charge | Every displayed price |
| B1 | `DIRECT_ALTERNATIVE_HOLD_DURATION` | Alternative holds |
| B2 | `DIRECT_REQUEST_HOLD_DURATION` | Request holds |
| B12 | Deposit rule | `WON` guard |
| B15 | Group threshold | Request ceiling |
| B19 | Alternative offer response expiry | Offer lifecycle |
| OQ-014 | Multi-property requests permitted? | **PROPOSED: no** |
| OQ-016 | Guest (unauthenticated) submission permitted? | **PROPOSED: yes** |
| OQ-025 | Email verification before submission? | **PROPOSED: no**, flag for sales |
