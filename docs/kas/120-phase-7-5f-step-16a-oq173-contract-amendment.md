# STEP 16A — OQ-173 — `alternatives` IS OUT OF V1
## CONTRACT AMENDMENT

**Date:** 2026-08-27
**Phase:** 7.5F — Step 16A, after E5
**Amends:** doc [58](58-phase-4-api-contract.md) §3.3's `422 NO_AVAILABILITY` block — **that block
only**
**Closes:** **OQ-173**

**Contract only. No source, test, migration, seed or frontend change.**

---

## 1. What OQ-173 was

Doc 58 §3.3 is the **only** place in the corpus that mentions the concept:

```jsonc
{ "code": "NO_AVAILABILITY",
  "details": [{ "roomTypeSlug": "suite-balcony", "requested": 1, "availableForStay": 0 }],
  "alternatives": { "nearestDates": [...], "otherProperties": [...] },
  "correlationId": "…" }
```

Both arrays are **elided**. A repository-wide search for `nearestDates` and `otherProperties` returns
that single line, plus one dangling reference in doc [113](113-phase-7-5f-step-16b-portfolio-search.md):227
to *"the `otherProperties` half of OQ-156"* — an OQ that is **never defined anywhere**.

Twenty dimensions had to be decided before a single item could be emitted, and the corpus answers
none of them: whether `alternatives` exists in V1 at all; the item shape of each array; what "nearest"
measures; how many; whether nearest dates must preserve stay length, room type, occupancy or valid
pricing; what qualifies as another property; how many; whether they must match availability,
occupancy, duration or pricing; the ordering; whether unpublished properties may appear; what happens
when there are none; whether the response is still `422`; and whether the field is mandatory or
omitted when empty.

**Two near misses were checked and ruled out**, because both are a different subject:

| Source | Why it does not decide OQ-173 |
|---|---|
| doc 66:181-183 — *"nearest available dates"*, *"portfolio-wide nearest available dates"* | A **search-results wireframe**, marked **PROPOSED** in a document whose own status is *"Draft for approval"*. Its surface is `GET /public/availability/search`, which is **OQ-122** and itself blocked. It defines no item shape, no distance rule, no count and no ordering |
| doc 50 §13.3 / OQ-083 — alternative offer holds | The **sales-mediated `ALTERNATIVE_OFFER` hold** (transition S7, config B1). A human agent proposing an alternative and choosing to hold it — not an array computed into an error response |

---

## 2. Owner decision

**CONFIRMED.** For V1, `alternatives` is **OUT OF SCOPE**.

- The reservation-request endpoint performs **no nearest-date search**.
- It performs **no alternative-property search**.
- It makes **no commercial recommendation** of any kind.

This is deliberate, not an oversight, and not a temporary shortcut awaiting implementation effort.

---

## 3. The frozen V1 `422 NO_AVAILABILITY` shape

```jsonc
{ "code": "NO_AVAILABILITY",
  "message": "…",
  "details": [ … ],
  "correlationId": "…" }
```

**`alternatives` MUST NOT be present.**

Everything else is unchanged and remains governed by the existing contract: doc 58 §2's error
envelope, §2.1's code, and the `details[]` semantics the availability path already produces. **No new
message text is introduced by this amendment** — it resolves the presence or absence of one field and
nothing else.

---

## 4. The distinction this amendment exists to protect

There are two different statements, and V1 makes only the second:

| | Statement | Is this what V1 says? |
|---|---|---|
| **A** | "There are no alternatives." | **No** |
| **B** | "This endpoint does not calculate alternatives." | **Yes** |

**Never represent B as A.**

This is why the field is **absent** rather than empty. Emitting

```jsonc
"alternatives": { "nearestDates": [], "otherProperties": [] }
```

would assert that the server looked and found nothing — a claim about real hotels on real dates that
the system never computed. A guest reading it would reasonably conclude their stay is impossible
anywhere in the portfolio, and might abandon a booking KAS could have taken. An absent field makes no
claim at all, which is the only honest position available while the selection rules are undefined.

The same reasoning forbids an `alternatives: {}` placeholder, or a `null`, or any other shape that
occupies the key.

---

## 5. Deferred

Nearest-date selection and alternative-property selection are **deferred in full**, including every
dimension listed in §1.

Introducing either later requires **a separate owner-approved contract amendment** that answers those
dimensions first. It is not a matter of implementation effort: the rules do not exist yet, and a guest
acts on what alternatives say.

---

## 6. E5's omission was correct

Doc [119](119-phase-7-5f-step-16a-e5-s1-end-to-end.md) §2 stopped this narrow part rather than
guessing, and left the rest of S1 complete. That was the right call and is now the frozen contract.

`ReservationRequestIT.noAvailabilityEnvelopeIsTheFrozenOne` already asserts the absence of
`alternatives`, `nearestDates` and `otherProperties` on the wire. **That test now encodes an owner
decision rather than an open question**, and it required no change to do so — which is the outcome a
correctly-scoped stop is supposed to produce.

---

## 7. What this amendment does not touch

The `201` contract · idempotency semantics, including `IDEMPOTENCY_KEY_REUSED` · A6 and B2, both
`PT24H` · anonymous guest identity · the price snapshot · `acceptedTermsVersion` · the S1 guard and
its effects · every other `422` in doc 58 §2.1.

No historical document is rewritten. Doc 58 §3.3's block stays as written; this section supersedes its
`alternatives` line for V1, in the same way doc 117 §24 and doc 58 §11.3 record their amendments.

---

## 8. OQ status after this amendment

| OQ | Status |
|---|---|
| **OQ-173** `alternatives` in the 422 | 🟢 **CLOSED** — out of V1 scope by owner decision |
| OQ-167 `acceptedTermsVersion` · OQ-170 same key, different body | 🟢 CLOSED (doc 117 §24) |
| OQ-171 snapshot typed shape · OQ-172 `expiresAt` at S10 | 🔴 OPEN |
| OQ-162 notification delivery · OQ-163 rate limiting | 🔴 OPEN |
| OQ-161 A6 calendars and escalation | 🟡 DEFERRED |

**E6 has not started.**
