# PHASE 7.5F — STEP 16A.17 — GUEST `/me/stays` + CUSTOMER CANCEL

**Date:** 2026-08-28
**Status:** 🔴 **BLOCKED — and not on A4.** No reservation in this system belongs to anyone.

**0 files changed** under `backend/src`, `frontend/src` or `db/migration`. No migration, no database
write, no OQ status change.

---

## 1. The blocker in one sentence

`GET /me/stays` returns *"own records only"* (doc 58 §4), and **nothing in this system defines "own"**:
`reservation.customer_id` is `NULL` on every row by owner decision, no `customer` row is ever created,
and both frozen routes that would establish the link require **email delivery — OQ-162**, which this
brief puts out of scope.

---

## 2. A4 — checked first, and it is not the blocker

A4 is **`OPEN`** (doc 51:39, *"Cancellation policy"*, owner Commercial + Legal, OQ-045/OQ-055). But it
gates **only the post-`WON` half**, and the corpus already states what to do until it arrives:

| | Pre-`WON` — cancelling a *request* | Post-`WON` — cancelling a *confirmed stay* |
|---|---|---|
| doc 58 §4:191 | **"permitted"** | **"blocked on config A4"** |
| doc 57 §7 | *"guest may self-serve: **yes**, one action, no penalty"* | *"**BLOCKED on policy**"* |
| Until A4 exists | — | doc 57:195: show *"Contact us to change or cancel"* with a phone number and Zalo |

So A4 needed no owner input for this step: the pre-`WON` half is permitted outright, and the post-`WON`
half has a frozen interim behaviour. **Doc 138 §11 flagged A4 as the thing to check; it was the wrong
thing.** The real dependency sits upstream of both halves.

---

## 3. What is actually missing

### 3.1 A guest request belongs to nobody

**OQ-016 is `ANSWERED`** (owner decision 4, doc 117 §20): *"Anonymous guest plus contact details. No
account, no login, no registration; `customer_id` stays nullable."*

Verified in the code and the database:

- `ReservationRepository.insertReservation` — *"`customer_id` stays NULL — OQ-016 closed in favour of
  an anonymous guest"*.
- `grep "INSERT INTO customer"` across all production code and migrations — **no match**. A customer
  row is never created by anything.
- `SELECT count(*) FROM customer` → **0**.
- `ScopeFilter`: `case OWN -> NOTHING`. A customer scope reaches no property, by design.

`GET /me/stays` would therefore return an empty list for every authenticated customer, permanently —
not from a defect, but because the join column is null by decision.

### 3.2 Both frozen ways to establish the link need email

Doc 58 freezes two, and neither exists:

| Route | What it needs |
|---|---|
| `POST /me/link-request` (§4:200) — *"Link a guest-submitted request by **verified email**"* | An email round-trip |
| `GET /public/track/{signedToken}` (§3:121) — guest request tracking, with `POST /public/track/{reference}/resend-link` *"re-issue a tracking link to the recorded email"* | A token delivered by email |

`S1Transaction` already records why the second one is dark: *"`trackingUrlIssued` is **false**: issuing
a tracking link is part of the acknowledgement, and delivery is OQ-162 … Reporting `true` would claim
something the system did not do."*

**Both roads run through OQ-162.**

### 3.3 The shortcut is explicitly forbidden

Matching `reservation.guest_email` against the authenticated user's email would produce a working
`/me/stays` in an afternoon. It is exactly what doc 117 §6 rules out: *"Whether an anonymous request
creates a `customer` row is an implementation decision constrained by doc 05's **'never auto-merge on
a weak signal'**; `customer.email` is UNIQUE."*

An email match **is** a weak signal, and here it would decide who may **read guest contact details and
cancel a booking**. That is a data-disclosure and authorization rule, which is why doc 58 gives it a
dedicated route with *verified* in its description rather than an implicit join.

---

## 4. Why nothing was built

Every part of the brief's goal depends on the same missing predicate:

- **`GET /me/stays`** — no ownership predicate; would return `[]` forever.
- **`GET /me/stays/{reference}`** — same.
- **`POST /me/stays/{reference}/cancel`** — authorization requires knowing the stay is the caller's,
  which is the same predicate. Its post-`WON` half is additionally A4.
- **The guest UI** — nothing to render.

Building any of it would mean inventing the disclosure rule doc 05 forbids. Per the brief's stop
condition 3, that is where this stops.

**No `/me/stays` route was added returning an empty list.** A route that structurally cannot return a
result is worse than its absence: it looks implemented.

---

## 5. What would unblock it

**Nothing here is an owner decision.** All three are implementation work whose contracts are already
frozen — they were simply excluded from this step's scope:

1. **OQ-162 — email delivery.** Both link mechanisms need it. It is the single upstream dependency,
   and it now blocks the entire guest surface rather than only the acknowledgement.
2. Then **`GET /public/track/{signedToken}`** — the shorter path. It needs no account, no
   `customer_id` and no A4: the guest gets a signed link with their acknowledgement and sees their own
   request. This is the corpus's own answer for an anonymous guest.
3. Or **`POST /me/link-request`** — the account path, which additionally needs a `customer` row to
   exist, and doc 117 §6 leaves *whether an anonymous request creates one* an open implementation
   decision constrained by doc 05.

**Route 2 is the smaller and more faithful one**, and it is what `trackingUrlIssued` was put in the S1
receipt for.

---

## 6. Verification

`backend/src` **0** · `frontend/src` **0** · `db/migration` **0** files changed, checked by mtime
against doc 138. `git diff --check` clean. Suites not re-run — nothing executable changed, so the last
verified state stands: backend **616**, frontend **590**, 29 migrations, latest V27.

**No OQ status changed. No new OQ raised** — every dependency above is an existing frozen route or an
existing open question (OQ-162, A4/OQ-045, OQ-016 as answered).

---

## 7. Next step

**Implement OQ-162's delivery seam, then `GET /public/track/{signedToken}`.** That is the smallest
path to a guest who can see their own request, it needs no owner decision, and it retires the
`trackingUrlIssued: false` that has been honest-but-empty since Step 16A.

A4 remains genuinely open, but it only gates cancelling a *confirmed* stay, and doc 57:195 already
says what to show until it arrives.
