# 55 — Central Inventory Model

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative. **Corrects a defect in the earlier availability formula — see §3.2.**
**Last updated:** 2026-08-14

---

## 1. Position in the architecture

**CONFIRMED** — Central Inventory is the **single availability engine** for every channel. Direct
reservations, OTA reservations, holds, maintenance and operational blocks all resolve against it.

```
DIRECT reservations ──┐
OTA reservations ─────┼──► CENTRAL INVENTORY ──► availableDirect ──► website · sales queue
Holds ────────────────┤         (per room type,
Maintenance ──────────┤          per date)
Other blocks ─────────┤
OTA safety buffer ────┘
```

**FUTURE** — `KAS Central Inventory ↕ Channel Manager ↕ Booking.com · Agoda · Ctrip · Traveloka`.
**No integration is implemented in V1 and no OTA API shape is assumed.**

---

## 2. Grain and date semantics

**CONFIRMED**

- Grain: **one room type, one date**. Availability is meaningless without a date.
- A stay `checkIn → checkOut` occupies nights `checkIn … checkOut − 1`. **Check-out night is not
  occupied.** 12 Sep → 14 Sep occupies 12 and 13. Two nights.
- All inventory dates are **property-local calendar dates** in `Asia/Ho_Chi_Minh`. Timestamps are UTC;
  inventory dates are `date`, never `timestamptz`. Conflating them produces midnight-boundary defects.
- Horizon: rolling **24 months**, generated ahead. Beyond it, a request is *"not yet open for
  booking"* — never *"unavailable"*.

---

## 3. Availability calculation

### 3.1 The definition

**PROPOSED — this is the authoritative expression.**

```
Blocked(rt, d)        = maintenance + other_blocks

DirectCommitted(rt,d) = Σ quantity of
                          · direct reservation lines whose stay covers d
                            AND stayStatus ∈ {CONFIRMED, CHECK_IN_READY, CHECKED_IN}
                          · ACTIVE holds covering d, not past expires_at

OtaCommitted(rt, d)   = Σ quantity of
                          · OTA reservation lines whose stay covers d
                            AND stayStatus ∈ {CONFIRMED, CHECK_IN_READY, CHECKED_IN}

UnusedBuffer(rt, d)   = MAX(0, bufferTarget(rt,d) − OtaCommitted(rt,d))

availableDirect(rt,d) = total − Blocked − DirectCommitted − OtaCommitted − UnusedBuffer
```

Guest-facing availability for a stay is the **minimum of `availableDirect` across every night** — never
the first night, never an average.

### 3.2 The correction — a genuine defect in the earlier formula

> ⚠ **Earlier Phase 3 documents specified:**
> `availableDirect = total − ota_allotment − reserved − occupied − maintenance − other_blocks`
> **with `ota_reserved` moving to `occupied` on check-in. That double-counts.**

Worked example — 10 rooms, buffer 5, OTA holds 3, direct holds 2, 1 maintenance:

| | Before OTA check-in | **After OTA check-in** |
|---|---|---|
| **Old formula** | `10 − 5 − 2 − 0 − 1 = 2` ✔ | `10 − 5 − 2 − 3 − 1 = −1` ✘ **breaks the CHECK constraint** |
| **New formula** | `10 − 1 − 2 − 3 − max(0,5−3) = 2` ✔ | `10 − 1 − 2 − 3 − max(0,5−3) = 2` ✔ |

Two things the new model fixes:

1. **Check-in is a relabel, not a new consumption.** A commitment covering night *d* consumes one unit
   of *d* whether the guest is `CONFIRMED`, `CHECK_IN_READY` or `CHECKED_IN`. Treating `occupied` as a
   *separate* subtractable bucket double-counted the same room.
2. **The buffer blocks only its unused portion.** If the buffer is 5 and OTA has already committed 3,
   only **2** more should be withheld — the 3 are already counted in `OtaCommitted`. Subtracting the
   full buffer *and* the OTA commitments withheld 8 rooms for 5 rooms' worth of protection.

**Supersedes:** [13](13-database-domain-overview.md) §3.3, [15](15-inventory-rules.md) §1 and §7,
[29](29-direct-sales-crm-architecture.md) §7.1, [50](50-phase-3-amendments.md) §5.1. Those documents'
counter names are retained for history; **this expression governs.**

### 3.3 `occupied` is an indicator, not a bucket

**PROPOSED** — Occupancy is **derived from `stayStatus`**, not maintained as an inventory counter:

```
occupancy(property, d) = count of reservations with stayStatus = CHECKED_IN covering d
```

It is an operational metric. It never appears in the availability expression. This removes an entire
class of double-count defect and is channel-agnostic — a guest in a room is a guest in a room.

### 3.4 Materialised cache vs derived truth

**PROPOSED**

| | Purpose | Authority |
|---|---|---|
| `direct_committed`, `ota_committed`, `buffer_target` on `room_type_inventory_day` | Fast reads for search and calendars | **Cache** |
| The §3.1 expression evaluated over reservation lines and holds | Correctness | **Authority** |

Rules: writes update the cache **in the same transaction** as the underlying change · the database
CHECK constraint is asserted on the cached row, so an oversell cannot be written · a reconciliation job
compares cache against derived truth and **alerts on any drift** · the **submission path always
re-derives under lock** and never trusts the cache.

### 3.5 Defensive expiry

**PROPOSED** — The availability query excludes holds whose `expires_at` has passed **even if the sweep
has not yet run**. A stalled sweep therefore degrades into *slightly generous* availability that the
under-lock re-check still catches — never phantom holds blocking real inventory.

---

## 4. Scenario matrix

**PROPOSED** — Every inventory-affecting event.

| # | Scenario | Effect on §3.1 terms | Atomic with |
|---|---|---|---|
| 1 | **Direct request submitted** | `REQUEST` holds created → `DirectCommitted +q` per night | `salesStatus = REQUESTED` |
| 2 | **Alternative offered with hold** | `ALTERNATIVE_OFFER` holds created → `DirectCommitted +q` | `salesStatus = ALTERNATIVE_OFFERED` |
| 3 | **Alternative offered without hold** | No change; availability re-checked at accept | — |
| 4 | **Alternative accepted** | Accepted hold `CONVERTED`; original `RELEASED` → net change per line difference | Line modification |
| 5 | **Direct sale won** | Accepted hold firm (`expires_at` cleared); others released | `salesStatus = WON` + `stayStatus = CONFIRMED` |
| 6 | **OTA reservation recorded** | `OtaCommitted +q`; `UnusedBuffer` shrinks correspondingly | `stayStatus = CONFIRMED` |
| 7 | **Check-in** (either channel) | **No change** — the commitment already covers the night (§3.3) | `stayStatus = CHECKED_IN` |
| 8 | **Check-out** | Commitment ends after the final night; no retroactive change | `stayStatus = CHECKED_OUT` |
| 9 | **Cancellation** (pre- or post-confirmation) | Commitment removed for all covered nights | `salesStatus`/`stayStatus = CANCELLED` |
| 10 | **No-show** | Commitment removed per policy (config A5) | `stayStatus = NO_SHOW` |
| 11 | **Modification** (dates / rooms / quantity) | Old commitments released, new placed, availability re-checked | One transaction, one lock scope |
| 12 | **Maintenance block** | `Blocked +n`. Cannot exceed remaining availability | Admin action |
| 13 | **Other block** (group, owner, staff) | `Blocked +n` | Admin action |
| 14 | **Hold expiry** | `DirectCommitted −q`; hold `EXPIRED` | Sweep transaction |
| 15 | **Inquiry lost** | Any inquiry holds released | `inquiry.status = LOST` |
| 16 | **Buffer rule change** | `bufferTarget` re-materialised; clamped (§6.2) | Admin action |
| 17 | **`total` change** | Cannot fall below current commitments + blocks on any affected date | Admin action, blocked with conflicting dates named |
| 18 | **Reconciliation** | No mutation. Reports drift | Scheduled job |

---

## 5. Holds

**CONFIRMED** — Two types, one table ([53](53-phase-4-database-erd.md) §4.2).

| | `REQUEST` | `ALTERNATIVE_OFFER` |
|---|---|---|
| Created on | Direct request submitted | Sales offers an alternative **and explicitly chooses to hold** |
| Attached to | Reservation | Reservation **or** SalesInquiry |
| Duration | Config **B2** `DIRECT_REQUEST_HOLD_DURATION` | Config **B1** `DIRECT_ALTERNATIVE_HOLD_DURATION` |
| Becomes firm | On `salesStatus = WON` | On acceptance, then `WON` |

**CONFIRMED required fields:** `createdAt` · `expiresAt` · `createdBy` · `reservationId` **XOR**
`inquiryId` · `propertyId` · `roomTypeId` · `quantity` · `status`.

**PROPOSED — three rules:**

1. **`expiresAt` is `NOT NULL` at creation**, always. It is cleared only when a hold becomes firm.
   This is the structural guarantee that no hold — including one on an abandoned inquiry — can lock
   inventory permanently.
2. **No configured duration ⇒ no hold.** With `DIRECT_ALTERNATIVE_HOLD_DURATION` unset, placing an
   alternative hold **fails with an error naming the missing setting**. The system never invents a
   duration.
3. **Holding an alternative is an explicit agent action.** While both the original request hold and an
   alternative hold are active, one guest consumes two sets of rooms. The agent is given an explicit
   *release the original* action alongside the offer.

### 5.1 Expiry sweep

```
every 5 minutes:
  batch = SELECT … FROM inventory_hold
          WHERE status = 'ACTIVE' AND expires_at < now()
  group by reservation/inquiry
  for each group:
    BEGIN
      lock affected room_type_inventory_day rows ORDER BY (room_type_id, date)
      direct_committed -= quantity   (per row)
      hold.status = 'EXPIRED', released_at = now()
      if this was the last REQUEST hold on a reservation:
          transition salesStatus → EXPIRED  (S13)
    COMMIT
    after commit: notify guest and sales owner
```

**Idempotent** — a hold already `EXPIRED`/`RELEASED`/`CONVERTED` is skipped, so a re-run cannot
double-decrement. Sweep lag is monitored; the defensive query in §3.5 means lag degrades safely.

---

## 6. OTA safety buffer

**CONFIRMED** — Configurable by **property + room type + date range / season**
([13](13-database-domain-overview.md) §3.4c). **No universal value is hard-coded.**

### 6.1 Resolution

Rules resolve by `priority`, most specific first. `PERCENTAGE` is of `total` and **rounds up** —
under-buffering is the costlier error. With no matching rule, `bufferTarget = 0`.

### 6.2 Clamping

```
effectiveBuffer = MIN(configuredBuffer,
                      total − Blocked − DirectCommitted − OtaCommitted)
```

Without the clamp, raising a buffer on an already-busy date would violate the oversell CHECK and block
the write. Clamping degrades safely and raises an advisory.

### 6.3 Overflow — recording fails open

**CONFIRMED** — An OTA can sell beyond its buffer when an extranet is stale. **The system must never
refuse to record a real reservation.**

```
recordOtaReservation(rt, dates, qty):
    if OtaCommitted + qty > bufferTarget:
        bufferTarget := OtaCommitted + qty        -- auto-expand
        ALERT "OTA buffer exceeded"
    OtaCommitted += qty
    if the oversell CHECK would now fail:
        RECORD ANYWAY, RAISE P1                    -- genuinely oversold; needs a human
```

**The principle: availability fails closed; recording fails open.** Refusing to *sell* when uncertain
is correct. Refusing to *record reality* is not — the guest exists and is arriving regardless.

### 6.4 Retirement

**CONFIRMED** — The buffer is **transitional, not permanent architecture**.

```
Stage 1 (launch)   Buffer configured per property/room type/season + manual recording
Stage 2            Buffer reduced as recording reliability is measured
Stage 3            Buffer minimal; recording is the operational truth
Stage 4 (FUTURE)   Channel manager. Buffer → 0. Recording automated
```

Stage-2 exit **measurements** are defined; **thresholds are business-supplied** (config B4, B5). No SLA
is invented.

---

## 7. Concurrency and safety

**PROPOSED**

| Requirement | Mechanism |
|---|---|
| **No negative availability** | Database CHECK on the cached inventory row. Refused before it can go negative |
| **No double allocation** | `SELECT … FOR UPDATE` on every affected inventory row, **ordered by `(room_type_id, date)`** — deterministic ordering prevents deadlock. Plus the unique hold constraint |
| **No expired hold consuming availability** | Mandatory `expires_at` + sweep + **defensive exclusion in the availability query** (§3.5) |
| **No permanent lock by abandoned inquiries** | Every hold has a mandatory expiry regardless of what it references; `LOST` releases immediately |
| **Idempotency** | Submission carries an idempotency key; sweep and timer jobs are re-runnable |
| **Cache drift** | Reconciliation job compares cache against derived truth; alerts, never silently corrects |

### 7.1 The submission transaction

```
BEGIN
  1. SELECT … FOR UPDATE on all (room_type_id, date) rows, ORDER BY room_type_id, date
  2. Re-derive availability under lock (§3.1) — the guest's screen is a stale snapshot
     insufficient → ROLLBACK, return a domain error with alternatives
  3. Create holds; update cached counters
     the CHECK constraint fires here if anything is wrong
  4. Create reservation, lines, price snapshot
  5. Write status history
COMMIT
-- AFTER commit: emit events → acknowledgement email, sales notification
```

Emails are emitted **after** commit. A provider outage must not roll back a reservation, and a
rolled-back transaction must not have sent mail.

---

## 8. Reconciliation

**PROPOSED** — Daily, per property.

| Check | Action on mismatch |
|---|---|
| Cached counters vs derived truth (§3.4) | Alert; report the delta. **Never auto-correct** — silent correction hides the cause |
| `direct_committed` vs sum of active holds + firm direct commitments | Alert |
| `ota_committed` vs recorded OTA reservations | Alert |
| KAS vs OTA extranet position | Alert beyond tolerance (config B5) |
| Active holds past `expires_at` | Alert on sweep lag |
| Recording lag distribution | Reported; threshold is config B4 |

---

## 9. Customer-facing availability

**CONFIRMED** — Customers see **room type + available quantity**. Never room numbers, never internal
counters.

| Situation | Display |
|---|---|
| Comfortable availability | "Available for your dates" |
| Genuinely low | "**3 rooms available**" — **only when literally true** |
| Zero for this room type | "Not available 12–14 Sep" + nearest available dates |
| Zero property-wide | Property shown, marked unavailable, with alternative dates and other KAS hotels |
| Beyond horizon | "Not yet open for booking — contact us" |
| Service degraded | "Availability temporarily unavailable — please contact us". **Never a guessed number** |

Scarcity messaging derives from real inventory. Manufactured urgency is prohibited
([02](02-brand-foundation.md) §6.1).

---

## 10. Caching

| Data | Cache | TTL |
|---|---|---|
| Property / room type content | CDN + HTTP | Hours; invalidated on publish |
| Availability search results | Redis | **≤ 60s**, invalidated eagerly on any inventory change for the affected room type and dates |
| **Availability at submission** | **Never cached** | Always re-derived under lock |
