# PHASE 7.5F — STEP 16A.3 — OQ-174 CONTRACT AMENDMENT

**Date:** 2026-08-27
**Type:** Contract governance. **Documentation only** — no source, test, migration, seed, SQL or
database write. Append-only: no historical document was rewritten.

---

## 1. Status

🟢 **OQ-174 is `CLOSED` by owner ruling.**

**KAS V1 promises the guest a response within 24 hours of `reservation.requested_at`.** The promise is
a **rolling duration**, not a calendar day. `SALES_FIRST_CONTACT_SLA` (**A6**) = **`PT24H`** is the sole
source of truth for both `sla_due_at` and `responsePromise`.

**No implementation is required.** Verification below shows the shipped S1 endpoint already computes
exactly this, and a test already pins it. This amendment closes a **documentation** divergence, not a
code defect. **A6 is unchanged, no setting key was created, and no code was touched.**

**OQ-161 remains 🟡 `DEFERRED`.** Calendar, cutoff, weekend, holiday and escalation semantics stay
outside A6.

---

## 2. OQ-174 before this ruling

Raised by Step 16A.2, doc [122](122-phase-7-5f-step-16a-2-oq051-oq083-reconciliation.md) §11:

> **Issue:** Six-plus guest-facing surfaces promise *"within the day"* … The API now returns
> **`"Within 24 hours"`**, rendered from A6 … because doc 117 §9 requires the promise to derive from A6
> *"and from nothing else"* and V1 *"computes a plain 24-hour offset."*
> **Why it matters:** *"within the day"* and *"within 24 hours"* are **different commercial promises.**
> A request at 23:00 satisfies PT24H by replying at 22:00 the next day — which is not within the day.
> **This document does not choose.**

Doc 122 raised it and deliberately did not decide it. This document records the owner's decision.

---

## 3. Repository verification

Branch `main` @ `c63c498`. Searched **all 102** documents in `docs/kas/` and the backend source
(read-only) for: `OQ-174`, *"within the day"* in both cases, *"within 24 hours"* in both cases,
`responsePromise`, `SALES_FIRST_CONTACT_SLA`, `sla_due_at`, `requested_at`, `A6`, "sales response
promise", "response promise", "guest-facing promise", "promise text", "SLA promise".

**No later amendment or owner decision had already superseded OQ-174.** It appears only in doc 122,
`00-README.md` and `16-open-questions.md` — all written by Step 16A.2.

The five categories the corpus mixes, kept separate:

| # | Category | What it holds |
|---|---|---|
| 1 | **Frozen contract** | doc 58 §3.3 — the field, its type, and the *"single source"* rule |
| 2 | **Existing implementation** | `S1Transaction` — already a rolling `PT24H` |
| 3 | **Draft / proposed wording** | docs 18, 26, 27, 66, 68 — all *"Draft for approval"* |
| 4 | **Historical wording** | docs 14, 28, 51, 54, 57, 73, 79, 81, 84, 112, 116 |
| 5 | **Actual owner decisions** | **D-14** (doc 28 §3) and **doc 117 §2 decision 1** |

---

## 4. Sources containing "within the day"

### 4a. Bracketed placeholders — `[within the day]`

A **slot to be filled from A6**, not a competing promise. These need no supersession; the ruling
simply fills them.

| Source | Doc status |
|---|---|
| [66](66-phase-5-customer-experience.md):107 | Draft for approval |
| [68](68-phase-5-booking-experience.md):109, :177, :207 | Draft for approval |
| [79](79-phase-6-customer-screens.md):200, :253 | Implementation-ready |
| [81](81-phase-6-booking-prototype.md):85, :156 | Implementation-ready |

### 4b. Unbracketed guest-facing copy — **superseded for V1**

| Source | Doc status | Text |
|---|---|---|
| [26](26-booking-ux-information-architecture.md):188, :313, :331, :352 | **Draft for approval** | *"We'll confirm availability and contact you within the day."* |
| [27](27-request-status-architecture.md):54, :156, :331 | **Draft for approval** | *"We've received your request and will contact you within the day."* |

Both documents' own status line reads **"Draft for approval"**. Neither is a frozen contract, and
neither is an owner decision.

### 4c. Configuration and reference wording — descriptive, not a promise

[51](51-phase-4-configuration.md):41 names A6 *"'Within the day' SLA definition"* — the **label** of the
config item. Also [14](14-booking-state-machine.md):471 (which itself defers to *"boundary is
OQ-051"*), [54](54-phase-4-state-machines.md):136, [57](57-phase-4-reservation-sales.md):248,
[73](73-phase-5-validation.md):96, [84](84-phase-6-visual-validation.md):221,
[112](112-phase-7-5f-step-15-guest-quote.md):332-333, [116](116-phase-7-5f-step-16a-reservation-request-discovery.md):224.

### 4d. The frozen contract's example value

[58](58-phase-4-api-contract.md) §3.3:150:

```jsonc
"responsePromise": "within the day",   // from config A6 — single source
```

The comment is the operative part: the value is **sourced from A6**, never authored. Doc 117 §9 later
froze the derivation. The **field, its type and the single-source rule stand**; the literal string is
an illustrative example, superseded by §8 below.

### 4e. ⚠️ The one genuine prior owner decision — **D-14**

[28](28-phase-2-decisions.md) §3:38, in the Phase 1.5 decision log:

> | D-14 | Sales response promise | **Within the day** | Resolves **OQ-013** in spirit; boundary rules undefined (§4.4) | 21, 26, 27 |

**This is recorded as a decision, and this amendment does not pretend otherwise.** Two qualifications
sit on its face: it resolves OQ-013 *"in spirit"*, and its *"boundary rules"* are *"undefined"*. Doc 28
§4.4 then asks the exact question OQ-174 asks:

> Unanswered: a request at 23:40 — same day or next? Weekends? Vietnamese public holidays? Calendar day
> or business day? … → **OQ-051**

**D-14's wording is superseded for V1 by this ruling** (§14). The supersession is recorded here, in
the register, and nowhere else — doc 28 is not edited.

---

## 5. Sources containing "within 24 hours"

**In documentation:** only doc [122](122-phase-7-5f-step-16a-2-oq051-oq083-reconciliation.md) §11,
where OQ-174 was raised, and the register row for it.

**In shipped code** — the substantive finding:

`S1Transaction`:

```java
OffsetDateTime requestedAt = OffsetDateTime.now(clock);
Duration sla = settings.requireDuration(SettingKey.SALES_FIRST_CONTACT_SLA);
OffsetDateTime slaDueAt = requestedAt.plus(sla);
...
private String responsePromise(Duration sla) {
    return "Within " + sla.toHours() + " hours";
}
```

`ReservationRequestIT` already pins both halves:

```java
assertThat(fixtures.reservationSecondsBetween(reference, "requested_at", "sla_due_at"))
        .isEqualTo(PT24H_SECONDS);
assertThat(promise).contains("Within 24 hours");
```

The literal `"Within 24 hours"` exists **only in the test assertion**. Production builds the sentence
from the `Duration`, so if A6 ever changed, the wording would change with it — the invariant doc 117 §9
requires.

---

## 6. Why the two phrases are not equivalent

They differ whenever a request arrives late in the day.

```
requested_at   = 2026-08-27 23:00 ICT

"Within 24 hours"   →  due 2026-08-28 23:00   ← VALID under the frozen V1 contract
"within the day"    →  due 2026-08-27 23:59   ← a different, much shorter commitment
```

A response at **2026-08-28 22:00** honours the first and breaks the second. One phrase is a **rolling
duration measured from an instant**; the other is a **boundary of the calendar day**. Substituting one
for the other silently changes what KAS owes the guest — which is why this needed an owner ruling
rather than a copy edit.

**`PT24H` must never be reinterpreted as `2026-08-27 23:59:59`.** That would introduce calendar
semantics A6 does not contain.

---

## 7. Owner ruling

**OPTION A — FROZEN.** *"Within 24 hours."*

1. KAS V1 promises the guest a response **within 24 hours of `reservation.requested_at`**.
2. **A6 = `PT24H` is the sole source of truth.**
3. `sla_due_at` = `requested_at` + `SALES_FIRST_CONTACT_SLA`.
4. `responsePromise` **must** derive from the same A6 value.
5. **No calendar-day interpretation applies in V1.**
6. *"within the day"* is **not** a valid synonym for the V1 API promise.
7. Documents and wireframes using *"within the day"* are **superseded guest-facing wording** where
   they conflict with the frozen V1 contract.
8. The supersession is recorded through the amendment mechanism of docs 117 and 122. **Historical
   documents are not rewritten.**
9. **OQ-161 remains `DEFERRED`** — calendar, cutoff, weekend, holiday and escalation semantics are
   still outside A6.
10. **No new setting key.**
11. **A6 is not changed from `PT24H`.**
12. **No implementation code was modified in this step.**

Option B (*"within the day"*) is **rejected for V1**. Adopting it would require calendar semantics A6
does not carry, which would reopen **OQ-161** — currently deferred by owner decision.

---

## 8. Frozen V1 guest-facing promise

The V1 promise is **a rolling 24-hour duration from `requested_at`**, rendered from A6.

| | Frozen |
|---|---|
| Semantics | Rolling duration. Calendar day boundaries have **no effect** |
| Measured from | `reservation.requested_at`, from **one** authoritative server clock read once |
| Source | **A6 `SALES_FIRST_CONTACT_SLA`**, and nothing else |
| Current rendering | `"Within " + sla.toHours() + " hours"` → **`"Within 24 hours"`** at `PT24H` |
| Language | **English.** The backend has no i18n mechanism; Vietnamese copy is config **B27 / OQ-061**, untouched here |

**Doc 58 §3.3's example string `"within the day"` is superseded as a literal value.** The field name,
its type (`string`), and the *"from config A6 — single source"* rule are **unchanged and still frozen**.

---

## 9. A6 relationship

**A6 is unchanged.** `SALES_FIRST_CONTACT_SLA = PT24H`, GLOBAL scope, frozen by doc
[117](117-phase-7-5f-step-16a-contract-amendment.md) §2 decision 1, which also closed **OQ-051**
(reconciled in doc [122](122-phase-7-5f-step-16a-2-oq051-oq083-reconciliation.md) §4).

This amendment **adds no semantics to A6**. It rules on which of two readings of the *existing* value
is the promise — and selects the one A6's declared type (`Duration`) can actually express.

Doc 117 §9's constraints stand verbatim: *"No additional SLA setting key may be created"*; unset A6 →
`MissingConfigurationException` → **422 `CONFIG_MISSING`** naming the key.

The config item's **label** in doc 51:41 still reads *"'Within the day' SLA definition"*. That label is
historical and is not edited; its **value** is `PT24H` and its **meaning** is §8.

---

## 10. `responsePromise` relationship

`responsePromise` is a **rendering of A6**, never independently authored copy. Doc 117 §9 already froze
this, and the ruling changes nothing about the mechanism — only the confirmation that the rendered
sentence, not *"within the day"*, is the promise KAS makes.

**Frozen invariants:** derived from A6 alone; changes automatically if A6 changes; never hardcoded;
never computed by logic different from `sla_due_at`.

---

## 11. `sla_due_at` relationship

```
reservation.sla_due_at = requested_at + SALES_FIRST_CONTACT_SLA
```

Plain instant arithmetic. **No rounding, no truncation to midnight, no timezone-dependent day
boundary, no business-day skip.** `responsePromise` and `sla_due_at` are two renderings of **one**
deadline computed from **one** clock read — doc 117 §9 forbids two calculations, and this ruling
reaffirms it.

---

## 12. Calendar semantics explicitly excluded

**None of the following exists in V1, and none may be introduced without a new owner decision:**

- truncation of `sla_due_at` to end-of-day
- a cutoff hour after which the deadline moves to the next morning
- weekend exclusion or extension
- Vietnamese public-holiday handling
- business-day arithmetic of any kind
- timezone-dependent day boundaries (ICT or otherwise)
- escalation thresholds or breach-severity tiers

All of these are **OQ-161**, and OQ-161 is deferred.

---

## 13. OQ-161 relationship

**OQ-161 remains 🟡 `DEFERRED` and is not affected by this ruling.**

OQ-161 records that A6's declared type — a single ISO-8601 `Duration` — cannot hold A6's original
four-part definition (cutoff hour, weekends, public holidays, escalation threshold). Doc 117 §2
deferred those three components.

This ruling is **consistent with that deferral, not a resolution of it**: choosing the rolling-duration
reading is precisely the reading a single `Duration` can express. Option B would have required the
deferred semantics and therefore would have reopened OQ-161.

**OQ-161 is not closed, not narrowed and not amended here.**

---

## 14. Superseded wording policy

**Historical documents are not rewritten.** Supersession is recorded here and in the register.

| Superseded | By | Reach |
|---|---|---|
| **D-14** (doc 28 §3:38) — *"Sales response promise: Within the day"* | This ruling | **V1 wording only.** D-14's qualifications (*"in spirit"*, *"boundary rules undefined"*) are on its own face, and doc 28 §4.4 routed the boundary to OQ-051, which doc 117 answered with `PT24H` |
| Doc 58 §3.3's example value `"within the day"` | §8 | **The literal string only.** Field, type and single-source rule unchanged |
| Unbracketed copy in docs 26 and 27 | §7.7 | Superseded guest-facing wording. Both are *"Draft for approval"* |
| Bracketed `[within the day]` in docs 66, 68, 79, 81 | §8 | **Not a conflict** — a placeholder now filled from A6 |

**Rules for anyone editing these surfaces later:** do not use *"within the day"* for the V1 promise; do
not author the sentence by hand — render it from A6; do not translate it in the backend, which has no
i18n mechanism (that is **OQ-061 / B27**).

**⚠️ OQ-013 — substance changed, status deliberately not changed here.** Doc 28:118 records OQ-013
(*"What response time will KAS commit to publicly?"*) as `ANSWERED` **in principle** with the value
*"Within the day"*, while the register's Part I entry still reads `BLOCKING`. This ruling supplies a
concrete public commitment — **24 hours from `requested_at`** — which is the substance OQ-013 asked
for. **This step rules only on OQ-174**, so OQ-013's status word is left as found and annotated in the
register. Promoting it is a separate owner call.

---

## 15. What implementation must and must not change later

**Must not change** — the shipped S1 endpoint **already conforms**:

| Behaviour | Already correct |
|---|---|
| `slaDueAt = requestedAt.plus(sla)` | ✅ rolling, no calendar arithmetic |
| `responsePromise` rendered from the same `Duration` | ✅ `"Within " + sla.toHours() + " hours"` |
| One clock read, one deadline | ✅ doc 117 §9 |
| Unset A6 → 422 `CONFIG_MISSING` | ✅ `requireDuration` |
| Pinned by test | ✅ `ReservationRequestIT` asserts both halves |

**No code change is required by this ruling, and none was made.**

**Must change, when those surfaces are next built or revised** — the frontend and any future email
template must render the promise **from the API's `responsePromise` field**, never from a hardcoded
string and never as *"within the day"*. No frontend file was touched here; the guest request form is a
later step.

**Must not be introduced:** any of §12's calendar semantics; a second SLA setting key; backend
translation of the sentence.

### 15.1 One stale string survives in the database — recorded, not fixed

`V20__system_setting.sql`:56 seeds A6's **description** column with the superseded phrase, and the row
is live:

```
The "within the day" promise, as an operational rule. Drives on-screen text,
email, timer and escalation from ONE value.
```

**It is not guest-facing and not part of any contract.** `JdbcSystemSettingRepository` issues exactly
one query — `SELECT value FROM system_setting WHERE key = :key …` — so `description` is **never read by
the application** and never leaves the database. It is an operator-facing note in the schema.

**It was not corrected here.** V20 is an applied migration and must never be edited (migration README
rule 1), and this step writes no migration. Correcting it needs a **forward-fix migration** in a future
implementation step — a one-line `UPDATE … SET description = …` on a single keyed row. Recorded so it
is not mistaken later for a surviving calendar semantic. **No new OQ is raised for it**: the promise
itself is now unambiguous, and this is a comment that trails it.

---

## 16. Explicitly out of scope

Described only as already recorded; **nothing below was decided:**

| Subject | Status, unchanged |
|---|---|
| Notification delivery, email templates and timing | **OQ-162** `OPEN` |
| Escalation, weekends, holidays, cutoff hours | **OQ-161** `DEFERRED` |
| Vietnamese copy for the promise | **OQ-061 / B27** `OPEN` |
| **B1** `DIRECT_ALTERNATIVE_HOLD_DURATION` | `CONFIG REQUIRED`, `NULL` |
| **B19** / **OQ-066** offer response expiry | `OPEN`, contradiction recorded in doc 122 §10 |
| **OQ-171** snapshot typed shape | `OPEN` |
| **OQ-172** `expiresAt` at S10 | `OPEN` |
| **OQ-163** rate limiting | `OPEN` |
| S7 · S10 · snapshot structure | untouched |

---

## 17. OQ status after this amendment

| OQ | Status | Note |
|---|---|---|
| **OQ-174** | 🟢 **CLOSED** | Owner ruling: *"Within 24 hours"*; A6 is the source of truth |
| **OQ-161** | 🟡 **DEFERRED** | Unchanged — calendar semantics remain outside A6 |
| **OQ-051** | 🟢 CLOSED | Unchanged (doc 117 §2, reconciled doc 122 §4) |
| **OQ-013** | *(as found)* | Substance now supplied; status word deliberately unchanged — §14 |
| **OQ-171 · OQ-172 · OQ-162 · OQ-163 · OQ-066** | 🔴 **OPEN** | Untouched |
| **OQ-083** | 🟢 RESOLVED | Unchanged (doc 122 §7) |
| **OQ-173** | 🟢 CLOSED | Unchanged (doc 120 §2) |

---

## 18. Verification

**No build, no test run, no application start, no database write.** Backend source was read
**read-only** to establish what ships today.

| Check | Result |
|---|---|
| Tracked files modified outside `docs/` | **none** |
| `backend/src/main/java` · `backend/src/test/java` · `frontend/src` · `db/migration` | **unmodified** |
| Migrations | **28** files, latest **V26**, **no V27** |
| `git diff --check` | **clean** |
| A6 · B2 | `PT24H` · `PT24H` — unchanged, no write issued |
| Baseline | **inherited from E6, not re-run** — backend **506** (155 + 351), frontend **419** |
| A6's `description` column | still carries the superseded phrase (V20:56) — **not read by the application**, see §15.1 |

---

## 19. Files changed

| File | Change |
|---|---|
| **this document** | New |
| [16-open-questions.md](16-open-questions.md) | OQ-174 → `CLOSED` with the ruling; OQ-013 annotated per §14; Part II tally |
| [00-README.md](00-README.md) | Current phase; index row 123; the sales-promise fact line |

No other document, and no source, test, migration or seed file.

---

## 20. Stop condition

**STOP.** E7 not begun; no implementation; the API is untouched; the frontend is untouched; no calendar
semantics implemented; OQ-161 still deferred; no new setting key; A6 still `PT24H`.
