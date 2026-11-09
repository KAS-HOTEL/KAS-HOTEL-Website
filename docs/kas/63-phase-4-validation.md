# 63 — Architecture Validation

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Validation executed 2026-08-14
**Last updated:** 2026-08-14

---

## 1. Invariant results — 25 / 25 PASS

Executed by automated sweep across `C:\Kas-Web\docs\kas\`.

| # | Invariant | Result | Where guaranteed |
|---|---|:--:|---|
| 1 | No generic `booking.source` | **PASS** | Three fields: `distribution_channel_id`, `lead_source`, `sales_owner_id` — [53](53-phase-4-database-erd.md) §5.2 |
| 2 | One Reservation entity | **PASS** | [52](52-phase-4-domain-model.md) §3.6, §6 |
| 3 | No `DirectReservation` | **PASS** | Prohibited — [52](52-phase-4-domain-model.md) §6 |
| 4 | No `OTAReservation` | **PASS** | Prohibited — [52](52-phase-4-domain-model.md) §6 |
| 5 | OTA has no Sales Owner | **PASS** | CHECK constraint — [53](53-phase-4-database-erd.md) §5.2 |
| 6 | OTA has no Lead Source | **PASS** | Same CHECK constraint |
| 7 | OTA `salesStatus = NULL` | **PASS** | Dedicated CHECK constraint |
| 8 | OTA `stayStatus = CONFIRMED` on entry | **PASS** | Transition T1b — [54](54-phase-4-state-machines.md) §5 |
| 9 | Direct successful sale = `salesStatus = WON` | **PASS** | S10 — [54](54-phase-4-state-machines.md) §4 |
| 10 | Operational queries use `stayStatus` | **PASS** | Query rules + separate index — [54](54-phase-4-state-machines.md) §6, [53](53-phase-4-database-erd.md) §5.2 |
| 11 | Sales analytics use `salesStatus` | **PASS** | [60](60-phase-4-admin-operations.md) §6 |
| 12 | Inquiry does not hold inventory | **PASS** | [52](52-phase-4-domain-model.md) §3.5, [14](14-booking-state-machine.md) §3.2 |
| 13 | Alternative holds expire | **PASS** | `expires_at NOT NULL` — [53](53-phase-4-database-erd.md) §4.2 |
| 14 | Expired holds cannot consume availability | **PASS** | Sweep **plus** defensive query exclusion — [55](55-phase-4-inventory.md) §3.5 |
| 15 | No negative availability | **PASS** | CHECK constraint — [53](53-phase-4-database-erd.md) §4.1 |
| 16 | No physical room numbers in public API | **PASS** | Field does not exist; denylist test — [58](58-phase-4-api-contract.md) §9 |
| 17 | Rate changes do not rewrite historical price | **PASS** | Sealed snapshot — [56](56-phase-4-pricing.md) §5 |
| 18 | Customer 360 does not blindly merge weak identities | **PASS** | Confidence tiers — [61](61-phase-4-customer-review.md) §2 |
| 19 | Review requires an eligible completed stay | **PASS** | `stayStatus = COMPLETED` + unique FK — [61](61-phase-4-customer-review.md) §5.1 |
| 20 | Media is property / room / facility scoped | **PASS** | `media_link.owner_type` — [62](62-phase-4-media.md) §2.2 |
| 21 | OTA integrations remain future | **PASS** | [55](55-phase-4-inventory.md) §1, [58](58-phase-4-api-contract.md) §12 |
| 22 | Central Inventory is the common availability engine | **PASS** | [55](55-phase-4-inventory.md) §1 |
| 23 | RBAC prevents unauthorised property access | **PASS** | Scope applied **at the data layer** — [59](59-phase-4-rbac.md) §2, §7 |
| 24 | Internal notes are never public | **PASS** | Separate table, no guest surface — [53](53-phase-4-database-erd.md) §5.4 |
| 25 | OTA internal metadata is never public | **PASS** | Denylist — [58](58-phase-4-api-contract.md) §9 |

---

## 2. Terminology sweep

**CONFIRMED direction** — Historical correction notes must not be silently changed.

| Pattern | Files | Assessment |
|---|---|---|
| `booking.source` / `sales_source` / `bookings_by_source` | `28`, `29` | ✔ **Correction and prohibition text only.** Preserved deliberately |
| `DirectReservation` / `OTAReservation` | `14`, `28`, `52` | ✔ **Prohibition statements only** ("there is no…") |
| `salesStatus = CONFIRMED` | `14` | ✔ **One occurrence — the supersession note in the header.** Correct history |
| "Book Now" / "Pay Now" | `02`, `05`, `18`, `20`, `26`, `57` | ✔ **Prohibition lists only** — every occurrence is a "never use" rule |
| Generic `status` field | `00`, `14`, `28`, `54` | ✔ **Prohibition statements only** |

**No prohibited concept appears as a live design element anywhere in the corpus.**

---

## 3. Cross-domain consistency

| Pair | Consistent | Note |
|---|:--:|---|
| Domain ↔ ERD | ✔ | `reservation` naming applied; supersession recorded ([52](52-phase-4-domain-model.md) §9) |
| ERD ↔ State machines | ✔ | Two enum columns; two indexes mirroring the two query paths |
| State machines ↔ Inventory | ✔ | Every transition's inventory effect specified in both |
| Inventory ↔ Pricing | ✔ | Availability and price resolve independently; both snapshot at S1 |
| Pricing ↔ Reservation | ✔ | Snapshot sealed at `WON`; line-level denormalised copies |
| Reservation ↔ API | ✔ | `/win` route mirrors `salesStatus = WON` |
| API ↔ RBAC | ✔ | Every endpoint declares a permission; undeclared fails CI |
| RBAC ↔ Admin | ✔ | Eight areas map to permission groups |
| Admin ↔ Customer | ✔ | Merge candidates reviewed, not auto-applied |
| Customer ↔ Review | ✔ | Eligibility on `stayStatus`, channel-agnostic |
| Review ↔ Media | ✔ | `owner_type = REVIEW`, moderated separately |
| Media ↔ API | ✔ | `storage_key` on the denylist |

---

## 4. Defects found and corrected in Phase 4

**PROPOSED** — Two genuine defects in previously approved documents, corrected here.

### 4.1 Availability double-count — corrected

**Severity: HIGH.** The Phase 3 formula
`available = total − ota_allotment − reserved − occupied − maintenance − other_blocks`
double-counted an OTA room once its guest checked in: the room left `ota_reserved`, entered `occupied`,
**and remained inside `ota_allotment`**. On a full date this drives availability negative and the CHECK
constraint blocks legitimate writes.

Corrected in [55](55-phase-4-inventory.md) §3, two ways: check-in is a **relabel, not a new
consumption** (occupancy is derived from `stayStatus`, not a subtractable bucket), and the buffer blocks
only its **unused** portion — `MAX(0, bufferTarget − OtaCommitted)`.

### 4.2 Hold constraint that would refuse reality — withdrawn

**Severity: MEDIUM.** `CHECK (ota_reserved <= ota_allotment)` would have refused to record a real OTA
reservation when a channel oversold its block. Withdrawn in Phase 3.5 and confirmed here:
**availability fails closed; recording fails open** ([55](55-phase-4-inventory.md) §6.3).

---

## 5. Residual risks

| # | Risk | Severity | Mitigation |
|---|---|:--:|---|
| R1 | **An operational query filters on `salesStatus`**, silently dropping every OTA reservation from arrivals | **HIGH** | `WON`/`CONFIRMED` split removes the shared value · separate read models · **blocking CI channel-completeness test** · lint rule · separate indexes |
| R2 | **The OTA recording process does not exist operationally** — the hub decision assumes a human process nobody has described | **HIGH** | Config B25. **Not solvable in architecture** |
| R3 | Cached inventory counters drift from derived truth | MEDIUM | Reconciliation alerts, never auto-corrects; submission always re-derives under lock |
| R4 | Alternative holds double-consume while both are active | MEDIUM | Short expiry (B1) · explicit agent action · explicit "release the original" |
| R5 | Public response leaks an internal field via a new endpoint | MEDIUM | Separate types where the field cannot exist · explicit mappers · **blocking denylist test** |
| R6 | Deadlock between concurrent inventory transactions | MEDIUM | Deterministic lock ordering `(room_type_id, date)` · concurrency test |
| R7 | Wrong customer merge exposes one guest's history to another | MEDIUM | No auto-merge below HIGH · reversible · audited · most-restrictive consent wins |
| R8 | Sweep stalls, leaving expired holds active | LOW | Defensive query exclusion (§[55](55-phase-4-inventory.md) §3.5) degrades safely |
| R9 | Price dispute unanswerable after rules change | LOW | Snapshot records `ruleId`; rules archived, never deleted |
| R10 | Photography absent at launch | **HIGH** | Config B8. **Not solvable in architecture** |
| R11 | Cancellation policy undefined blocks the booking flow | **HIGH** | Config A4/A5. **Not solvable in architecture** |

**PROPOSED** — R2, R10 and R11 are the three risks the architecture **cannot** mitigate. All three are
business inputs.

---

## 6. Test contract for implementation

**Blocking in CI:**

| Test | Asserts |
|---|---|
| **Channel completeness** | One direct + one OTA reservation on the same date both appear in every operational endpoint |
| **Public denylist** | No Public or `/me` response contains any denylisted key, at any nesting depth, across all fixtures |
| **Public allowlist** | The public room-type response matches the approved shape exactly |
| **Concurrency / oversell** | *N* simultaneous requests for the last room → exactly one succeeds; availability ends at 0 |
| **Hold expiry** | An expired hold releases inventory and it becomes available again |
| **Price immutability** | Reservation → `WON` → edit the rate rule → total unchanged |
| **Illegal transitions** | Every illegal transition in [54](54-phase-4-state-machines.md) is rejected |
| **OTA constraint** | Inserting an OTA reservation with a lead source or sales owner fails at the database |
| **Endpoint permission declaration** | No endpoint lacks a declared permission |
| **Config-missing** | Placing an alternative hold with `DIRECT_ALTERNATIVE_HOLD_DURATION` unset returns `CONFIG_MISSING` |

---

## 7. Phase 4 completeness

| Section | Document | Complete |
|---|---|:--:|
| 4.1 Business configuration freeze | [51](51-phase-4-configuration.md) | ✔ |
| 4.2 Domain model | [52](52-phase-4-domain-model.md) | ✔ |
| 4.3 Database / ERD | [53](53-phase-4-database-erd.md) | ✔ |
| 4.4 State machines | [54](54-phase-4-state-machines.md) | ✔ |
| 4.5 Inventory model | [55](55-phase-4-inventory.md) | ✔ |
| 4.6 Pricing model | [56](56-phase-4-pricing.md) | ✔ |
| 4.7 Reservation + Sales Inquiry | [57](57-phase-4-reservation-sales.md) | ✔ |
| 4.8 API contract | [58](58-phase-4-api-contract.md) | ✔ |
| 4.9 RBAC / permissions | [59](59-phase-4-rbac.md) | ✔ |
| 4.10 Admin operational model | [60](60-phase-4-admin-operations.md) | ✔ |
| 4.11 Customer data / review | [61](61-phase-4-customer-review.md) | ✔ |
| 4.12 Media | [62](62-phase-4-media.md) | ✔ |
| 4.13 Architecture validation | **this document** | ✔ |

**Contracts frozen. No production code, dependencies, migrations, APIs, UI or deployment produced.**
