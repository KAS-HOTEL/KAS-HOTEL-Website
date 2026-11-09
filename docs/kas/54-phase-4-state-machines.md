# 54 — State Machines: Transition Contract

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Implementation contract. **Canonical narrative remains [14](14-booking-state-machine.md).**
**Last updated:** 2026-08-14

> [14](14-booking-state-machine.md) defines the lifecycles and the reasoning. This document adds the
> **executable contract**: for every transition — actor, guard, side effects, inventory effect,
> notification effect, and audit event.

---

## 1. The three lifecycles

```
SALES INQUIRY   NEW → QUALIFIED → creates Reservation
                NEW | QUALIFIED → LOST

DIRECT SALES    REQUESTED → ASSIGNED → AVAILABILITY_CHECK → CUSTOMER_CONTACTED
   salesStatus  → ALTERNATIVE_OFFERED → WON
                terminal: WON | DECLINED | CANCELLED | EXPIRED

STAY            CONFIRMED → CHECK_IN_READY → CHECKED_IN → CHECKED_OUT → COMPLETED
   stayStatus   exceptions: CANCELLED, NO_SHOW

OTA             salesStatus = NULL · stayStatus = CONFIRMED on entry
```

**CONFIRMED** — **Never a generic `status` field.** Operational queries use `stayStatus`; sales
analytics use `salesStatus`.

---

## 2. Actors

| Code | Actor | Notes |
|---|---|---|
| `C` | Customer | Public or authenticated |
| `S` | Sales | Permission-gated, DIRECT only |
| `O` | Operations | Property Admin, Reservations Staff, Front Desk |
| `Y` | System | Scheduled jobs — all idempotent |

---

## 3. Sales Inquiry transitions

| # | From → To | Actor | Guard | Side effects | Inventory | Notification | Audit |
|---|---|---|---|---|---|---|---|
| **I1** | — → `NEW` | S | `leadSource` required; ≥1 contact field | Owner may be assigned; follow-up scheduled | **None** | Owner notified | `inquiry.created` |
| **I2** | `NEW` → `QUALIFIED` | S | Property, dates, ≥1 room type + quantity captured **and** availability confirmed | **Creates reservation** at `salesStatus = REQUESTED`; `qualified_reservation_id` set; inquiry frozen | Request hold created on the reservation (§4 S1) | Guest acknowledgement | `inquiry.qualified` |
| **I3** | `NEW` → `LOST` | S | Reason required | Follow-ups cancelled | **All inquiry holds released** | Owner notified | `inquiry.lost` |
| **I4** | `QUALIFIED` → `LOST` | S | Qualification abandoned before reservation creation | As I3 | As I3 | — | `inquiry.lost` |
| **I5** | `NEW`\|`QUALIFIED` → `LOST` | Y | Follow-up attempts exhausted — **threshold OQ-080 / config B18** | Auto-close | **All inquiry holds released** | Owner notified | `inquiry.auto_lost` |

**CONFIRMED** — The inquiry itself never holds inventory. Rows I3–I5 release holds only where an
explicit `ALTERNATIVE_OFFER` hold was placed during the conversation
([14](14-booking-state-machine.md) §3.2).

---

## 4. Direct sales transitions — `salesStatus`

| # | From → To | Actor | Guard | Side effects | Inventory | Notification | Audit |
|---|---|---|---|---|---|---|---|
| **S1** | — → `REQUESTED` | C / S | Availability confirmed for all lines on all nights **under lock**; occupancy valid; contact present; idempotency key unused | Reference issued; **price snapshot frozen**; SLA timer started | **`REQUEST` holds created**, `expiresAt = now + DIRECT_REQUEST_HOLD_DURATION` (config B2) | Guest acknowledgement email + in-app; sales queue notified | `reservation.requested` |
| **S2** | `REQUESTED` → `ASSIGNED` | S | Permission `sales.inquiry.manage`; DIRECT only | Owner recorded; assignment history | Holds maintained | In-app: named agent | `reservation.assigned` |
| **S3** | `ASSIGNED` → `AVAILABILITY_CHECK` | S | — | Live availability re-check recorded with result | Holds maintained | In-app | `reservation.availability_checked` |
| **S4** | `REQUESTED` → `AVAILABILITY_CHECK` | S | Implicit self-assignment | S2 + S3 | Maintained | In-app | both events |
| **S5** | `AVAILABILITY_CHECK` → `CUSTOMER_CONTACTED` | S | A contact log entry exists | Contact recorded: channel, direction, outcome | Maintained | Optional guest email | `reservation.contacted` |
| **S6** | `ASSIGNED` → `CUSTOMER_CONTACTED` | S | Permitted — clarify dates before checking | Contact recorded | Maintained | — | `reservation.contacted` |
| **S7** | `CUSTOMER_CONTACTED` → `ALTERNATIVE_OFFERED` | S | ≥1 alternative, each availability-checked at send | Structured offer sent; offer expiry set (config B19) | **Optional `ALTERNATIVE_OFFER` holds**, `expiresAt = now + DIRECT_ALTERNATIVE_HOLD_DURATION` (config B1) | Guest email + in-app | `reservation.alternative_offered` |
| **S8** | `ALTERNATIVE_OFFERED` → `ALTERNATIVE_OFFERED` | S | Revised offer | Prior offer superseded, retained | **Superseded holds released**; new holds created | Guest email | `reservation.alternative_revised` |
| **S9** | `ALTERNATIVE_OFFERED` → `CUSTOMER_CONTACTED` | S | Guest responded, still negotiating | — | Alternative holds released unless explicitly extended | — | `reservation.contacted` |
| **S10** | `AVAILABILITY_CHECK`\|`CUSTOMER_CONTACTED`\|`ALTERNATIVE_OFFERED` → **`WON`** | S | Availability re-verified **under lock**; guest accepted; permission `reservation.win`; payment recorded **or** pay-at-hotel permitted (config B12) | **Opens `stayStatus = CONFIRMED` in the same transaction**; `won_at` set; snapshot sealed | **Accepted hold becomes firm — `expiresAt` cleared. All other holds on the reservation released** | Confirmation email + in-app; check-in reminders scheduled | `reservation.won` + `reservation.confirmed` |
| **S11** | any non-terminal → `DECLINED` | S | Reason required | Guest offered alternatives where possible | **All holds released** | Guest email + in-app | `reservation.declined` |
| **S12** | any non-terminal → `CANCELLED` | C / S | Reason required | — | **All holds released** | Guest email + in-app | `reservation.cancelled` |
| **S13** | any non-terminal → `EXPIRED` | Y | Request hold expired without resolution | — | **All holds released** | Guest + owner notified; warning sent before expiry | `reservation.expired` |

**Prohibited:** any transition out of a terminal state · `REQUESTED → WON` without an availability
check · customer-initiated transitions other than S12 on their own request.

**CONFIRMED** — `salesStatus` **freezes** at its terminal value. A later stay cancellation moves
`stayStatus` only ([14](14-booking-state-machine.md) §4.2).

---

## 5. Stay transitions — `stayStatus`

| # | From → To | Actor | Guard | Side effects | Inventory | Notification | Audit |
|---|---|---|---|---|---|---|---|
| **T1a** | `NULL` → `CONFIRMED` | S | Via S10 (`salesStatus = WON`) | `confirmed_at` set | Direct hold firm | Confirmation | `reservation.confirmed` |
| **T1b** | `NULL` → `CONFIRMED` | O | **OTA recording.** Permission `reservation.ota.record`; `otaReference` unique per channel | Reservation created with `salesStatus = NULL` | **`ota_committed += qty`** | **No sales notification.** Optional guest confirmation subject to §8 | `reservation.ota_recorded` |
| **T2** | `CONFIRMED` → `CHECK_IN_READY` | Y | Arrival window reached (config B17) | Property arrival list updated | Unchanged | Guest reminder | `stay.check_in_ready` |
| **T3** | `CHECK_IN_READY` → `CHECKED_IN` | O | On or after check-in date; permission `reservation.checkin` | Arrival recorded | Commitment relabelled in-residence — **no net availability change** ([55](55-phase-4-inventory.md) §3.3) | Optional welcome | `stay.checked_in` |
| **T4** | `CONFIRMED` → `CHECKED_IN` | O | Direct check-in, skipping T2 | As T3 | As T3 | — | `stay.checked_in` |
| **T5** | `CHECK_IN_READY` → `NO_SHOW` | O | Guest absent past cutoff (config A5). **Operator-prompted, never automatic** | Charge per policy | **Commitment released** | Internal only | `stay.no_show` |
| **T6** | `CHECKED_IN` → `CHECKED_OUT` | O | On or after check-out date | Departure recorded | **Commitment released** | Check-out email | `stay.checked_out` |
| **T7** | `CHECKED_OUT` → `COMPLETED` | Y | Settlement window elapsed (config B17) | **Review eligibility unlocked** | — | Thank-you + review invitation, **subject to §8** | `stay.completed` |
| **T8** | `CONFIRMED`\|`CHECK_IN_READY` → `CANCELLED` | O / C | Per cancellation policy (config A4) | Cancellation terms applied | **Commitment released** | Guest email | `stay.cancelled` |

**CONFIRMED** — T1b is the **only** path by which an OTA reservation enters. It never traverses §4.

---

## 6. Query rules — binding

**CONFIRMED**

| Query | Field | Predicate |
|---|---|---|
| Arrivals today | `stayStatus` | `= CHECK_IN_READY` (+ `CONFIRMED` where T2 has not yet run) |
| In house | `stayStatus` | `= CHECKED_IN` |
| Departures today | `stayStatus` | `= CHECKED_IN` AND `check_out = today` |
| Completed stays | `stayStatus` | `= COMPLETED` |
| Live reservations | `stayStatus` | `NOT IN (CANCELLED, NO_SHOW, COMPLETED)` |
| Review eligibility | `stayStatus` | `= COMPLETED` |
| Occupancy | `stayStatus` | + inventory |
| **Direct conversion** | `salesStatus` | **`= WON`** AND `channelType = DIRECT` |
| Lost direct sales | `salesStatus` | `IN (DECLINED, CANCELLED, EXPIRED)` |
| Sales SLA / response time | `salesStatus` | + `channelType = DIRECT` |
| **OTA reservations** | `salesStatus` | **`IS NULL`** |

**Enforcement:** operational read models expose `stayStatus` only · a **blocking CI
channel-completeness test** (one direct + one OTA reservation on the same date must both appear in
every operational endpoint) · a lint rule barring `salesStatus` from the operations module · neither
field is ever abbreviated to `status`.

---

## 7. Timers

All jobs **idempotent** — a re-run must not double-send or double-apply.

| Timer | Applies to | Value |
|---|---|---|
| First-contact SLA | Direct | Config A6 ("within the day") |
| Request hold expiry | Direct | Config B2 |
| **Alternative hold expiry** | Direct | **Config B1 — `DIRECT_ALTERNATIVE_HOLD_DURATION`** |
| Alternative offer response expiry | Direct | Config B19 |
| Payment deadline | Direct | Config B12 |
| Inquiry follow-up | Inquiry | Config B18 |
| `CHECK_IN_READY` | **All channels** | Config B17 |
| Check-in reminders | All channels | Config B17 |
| No-show cutoff | All channels | Config A5 — prompts an operator |
| Auto-complete | All channels | Config B17 |
| Review invitation | All channels | Config B17, subject to §8 |
| Hold expiry sweep | All | **PROPOSED**: every 5 minutes |
| OTA recording lag | OTA | **Measured, not enforced.** Config B4 |

---

## 8. Notification gating

**CONFIRMED** — Transactional and marketing communication are separate, and OTA contact data is not
automatically usable for marketing.

| Event | Direct guest | OTA guest |
|---|---|---|
| Request acknowledgement | ✔ | n/a |
| Availability / alternatives / payment | ✔ | n/a |
| Confirmation | ✔ | ⚠ Only if usable contact details exist (**OQ-077**) |
| Pre-arrival, check-in, check-out | ✔ | ⚠ Same caveat |
| **Review invitation** | ✔ | ⚠ Permitted as service communication, but **must contain no direct-booking solicitation** — **OQ-078, legal L3** |
| **Marketing** | Explicit opt-in only | **Never assumed.** Consent **and** OTA-contract review required |

---

## 9. Implementation contract

1. Transitions execute **only** through the state machine service; no code path assigns
   `sales_status` or `stay_status` directly.
2. Every transition validates **legality, guard, and actor permission**.
3. Every transition writes `reservation_status_history` with `field ∈ {SALES, STAY}`.
4. Every transition emits its audit event; notifications subscribe to events. **Email failure never
   rolls back a business transaction.**
5. Transition + inventory movement + hold changes + history are **one atomic transaction**.
6. Exhaustive tests: every legal transition succeeds under its guard; every illegal transition is
   rejected with a domain error.
7. **Blocking CI tests:** channel-completeness (§6) · concurrency (exactly one of *N* simultaneous
   requests for the last room succeeds) · hold expiry (released inventory becomes available again).
8. `expires_at` is `NOT NULL` on every hold at creation.
9. OTA reservations are created with `sales_status = NULL` — never a placeholder.
10. **No generic `status` field exists.**
