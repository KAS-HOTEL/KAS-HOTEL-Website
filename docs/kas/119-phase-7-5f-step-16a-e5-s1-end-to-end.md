# PHASE 7.5F — STEP 16A — E5 — S1 END TO END

**Date:** 2026-08-27
**Status:** 🟢 **COMPLETE, with one narrow part stopped and reported.** The S1 flow is production-shaped
and fully exercised end to end. The `422` response's **`alternatives`** object is **not** implemented,
because its contents are elided in the only place the corpus defines it — recorded as **OQ-173**.

**Gates:** backend **499 tests** (155 unit + 344 integration), `BUILD SUCCESS` · frontend **419
tests**, untouched · Flyway **28 migrations, latest V26, 0 failed** · **no migration added** ·
database unpolluted · `git diff --check` clean.

---

## 1. What E5 actually found

E4 already delivered the transactional S1 flow. Verifying the tree rather than trusting the E4 report
— as this brief required — showed that **22 of E5's 23 objectives were already implemented and
tested**. E5's real content is therefore three things:

1. the one objective genuinely missing — the `422`'s `alternatives` object;
2. the test cases E5 lists that E4 did not cover;
3. the twenty-question self-audit, answered by hand.

Nothing was rebuilt, and no architecture was redesigned.

---

## 2. The narrow stop — `alternatives` (OQ-173)

Doc 58 §3.3 is the **only** place in the corpus that mentions it:

```jsonc
{ "code": "NO_AVAILABILITY",
  "details": [{ "roomTypeSlug": "…", "requested": 1, "availableForStay": 0 }],
  "alternatives": { "nearestDates": [...], "otherProperties": [...] },
  "correlationId": "…" }
```

Both arrays are **elided**. `nearestDates` and `otherProperties` appear nowhere else — a repository-wide
search returns that single line plus one dangling reference in doc 113 to "the `otherProperties` half
of **OQ-156**", an OQ that is *never defined anywhere*.

So two separate things are missing, and neither can be derived:

| Missing | Why it cannot be guessed |
|---|---|
| The **item shape** of each array | `[...]` is elided. A date? A `{date, availableQuantity}`? A property slug plus a price? |
| The **selection rule** | How near is "nearest"? How many? Which properties — every `OPEN` one, the same district, the same price band? Ordered how? |

A guest acts on alternatives. Emitting a plausible set — "the next three dates", "every other open
property" — would be inventing commercial behaviour, which is exactly what this phase exists to
prevent. Emitting an empty `alternatives: {}` would be no better: it asserts *"there are none"*, which
is a claim the system has not computed.

**The field is therefore absent**, and `ReservationRequestIT.noAvailabilityEnvelopeIsTheFrozenOne`
asserts its absence, so it stays a decision rather than drifting into a guess later.

The rest of the `422` **is** the frozen envelope: `code`, `message`, `details[]` naming the room type
and what was actually available, and `correlationId`.

---

## 3. Tests added

**+8** (491 → **499**).

`ReservationRequestIT` **27 → 33**:

| Test | What it proves |
|---|---|
| an existing ACTIVE hold consumes capacity | a first request's holds are counted, so the next guest is refused |
| one unavailable night of several refuses the whole stay | night one free, night two sold out → **nothing** is written, not even a hold for the free night |
| a released hold frees its capacity and the identity can be held again | V26's ACTIVE-scoping, end to end: the released row is **retained** as history and the same room/night is re-held by a new reservation |
| the public response leaks no internal identifier | no UUID of any kind on the wire, plus eleven denylisted names checked as text |
| no authentication is required, and none is offered | anonymous submission succeeds and **no customer row is created** |
| the 422 carries code, message and details[] — and does NOT invent alternatives | the narrow stop above |

`ReservationConcurrencyIT` **4 → 6**:

| Test | What it proves |
|---|---|
| same key, different body, simultaneous | exactly **one 201 and one 409**, one reservation, one idempotency record |
| the loser never overwrites the stored fingerprint | one fingerprint survives, so the winner's honest retry still replays and the loser's body still conflicts |

The release helper is bounded by `reservation.reference` and adjusts `direct_committed` alongside the
status, because doc 55 §5 gives the capacity back. **No table-wide UPDATE**, per this brief's hygiene
rule.

---

## 4. Self-audit — the twenty questions

| # | Question | Answer |
|---|---|---|
| 1 | Two concurrent identical requests → two reservations? | **No.** Proven by test; the PRIMARY KEY serialises and the loser replays |
| 2 | Same-key/different-body bypass the fingerprint? | **No.** Both the pre-check and the post-failure re-check compare fingerprints; a mismatch raises 409 |
| 3 | Failed availability leaves an idempotency row? | **No.** The row is inserted last, inside the same transaction |
| 4 | Failed request leaves a reservation? | **No.** One transaction; asserted zero after every refusal |
| 5 | Failed request leaves a hold? | **No.** Same transaction; asserted zero |
| 6 | A released hold blocks re-holding? | **No** — V26 scopes uniqueness to `ACTIVE`, now proven end to end |
| 7 | A REQUEST hold fails to affect `available_direct()`? | **No.** It increments `direct_committed`, which the function subtracts; asserted |
| 8 | One night succeeds while another fails? | **No.** New test: night one free, night two sold out → nothing written |
| 9 | `responsePromise` and `sla_due_at` from different values? | **No.** One `Duration` from A6, one clock read once |
| 10 | Missing `Idempotency-Key` becomes 500? | **No.** 400 `VALIDATION_FAILED` naming the header |
| 11 | Malformed country silently discarded? | **No.** 400 since the E4 addendum; lower-case is upper-cased |
| 12 | The 201 gains/loses a field if Jackson config changes? | **Caught** — a test asserts **exactly six keys** |
| 13 | Internal IDs leak? | **No.** New test: no UUID anywhere, eleven denylisted names absent |
| 14 | A uniqueness race becomes an incorrect 500? | **No.** It resolves to the original result or a 409 |
| 15 | The original response replays exactly? | **Yes** — asserted byte-for-byte |
| 16 | Anonymous guest can submit? | **Yes**, and no customer row is created |
| 17 | An account accidentally required? | **No.** `@PublicEndpoint`; `customer_id` stays NULL |
| 18 | Tax or service charge in the V1 snapshot? | **No.** Asserted absent; `tax_minor` and `service_charge_minor` stay NULL |
| 19 | OQ-171 silently resolved? | **No.** All four fields omitted and asserted absent |
| 20 | Email sent inside the transaction? | **No.** There is no mail sender anywhere in the codebase |

---

## 5. What E5 did not touch

No migration. No frontend file. No mail, SMTP or notification infrastructure. No admin or partner
surface. No architectural rule weakened — `ModuleStructureTest`, `ForbiddenConceptsRule`,
`PublicResponseDenylistTest` and `UndeclaredEndpointGuardTest` all pass unchanged.

**OQ-161, OQ-162, OQ-163, OQ-171 and OQ-172 were not resolved**, and none was needed to complete the
implementable part of S1.

---

## 6. New open question

| ID | Question | Status |
|---|---|---|
| **OQ-173** | **The `422 NO_AVAILABILITY` `alternatives` object is undefined.** Doc 58 §3.3 shows `{ "nearestDates": [...], "otherProperties": [...] }` with both arrays elided, and the terms appear nowhere else; doc 113 refers to "the `otherProperties` half of OQ-156", which is itself never defined. The owner must supply **the item shape of each array** and **the selection rule** — how near, how many, which properties, in what order — before it can be emitted. The rest of the 422 envelope is implemented and tested | **new, OPEN** |
