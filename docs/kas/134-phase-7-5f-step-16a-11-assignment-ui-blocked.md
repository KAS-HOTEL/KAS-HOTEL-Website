# PHASE 7.5F — STEP 16A.11 — PARTNER CONSOLE ASSIGNMENT UI (S2)

**Date:** 2026-08-28
**Status:** 🔴 **BLOCKED — the S2 backend is complete, and the frontend has no approved way to name a target owner.**

**0 files changed** under `backend/src`, `frontend/src` or `db/migration`. No migration, no database
write, no OQ status change. This document and the README index are the only additions.

---

## 1. The blocker in one sentence

`POST /assign` requires a body of `{ "salesOwnerId": <uuid> }`, and **there is no endpoint, no DTO
field and no session value anywhere in this repository from which the console can obtain that uuid —
for any user, including the signed-in one.**

---

## 2. What was verified from source

**Route and contract — confirmed, and they match doc 132.**

```
POST /api/v1/admin/sales/requests/{reference}/assign
@PreAuthorize("hasAuthority('sales.request.assign')")     →  204 No Content
body: AssignRequestBody { @NotNull UUID salesOwnerId, String reason }
```

`AdminSalesRequestController:@RequestMapping("/api/v1/admin/sales/requests")` +
`@PostMapping("/{reference}/assign")`. Refusals: **404** out of scope · **409** terminal state or
same-owner · **400 `VALIDATION_FAILED`** with `details[0].field = "salesOwnerId"` when the target is
not assignable. The backend is authoritative, tested, and nothing here proposes changing it.

### 2.1 Three ways to obtain a target, all closed

| Route to a uuid | Verified | Result |
|---|---|---|
| **The detail response** | `SalesRequestDetailView` = `summary` + `lines` + `guest`; `SalesRequestSummaryView`'s 14 fields | **No owner field of any kind.** The console cannot even tell whether a request is assigned |
| **A user-listing endpoint** | All **17** controllers in `backend/src/main/java`; `identity` has no `api` package | **None exists.** No controller returns users, staff or agents |
| **The caller's own identity** (self-assign) | `SessionState = { status, sessionCount }`; `SessionView` = id, device, ip, createdAt, lastSeenAt, current | **No user id.** `SessionView` deliberately omits it, and doc 132 already records that omission as intentional |

**Doc 58 freezes no such route either.** `owner` appears three times in the whole API contract, and
every one is an undefined **filter parameter** on a queue or analytics route (`?salesStatus,leadSource,owner,slaState,property`) — a way to narrow a list of *reservations*, never a source of *users*. Doc 128 already
recorded that those filter parameters have no defined semantics and are not sent.

### 2.2 And there is no display name to show

`app_user` has **no name column** — `email`, `password_hash`, `status`, `locale`, and lifecycle
timestamps. So even the read-only half of the brief's requirement 3A ("show the current owner… never
expose internal UUIDs") has no field to render: the only human-readable identifier a user has in this
schema is their **email address**, and putting staff email on a console screen is a disclosure
question of its own, not a formatting choice.

---

## 3. Why nothing was built

The brief's §18 is explicit: *"If the repository does NOT contain a safe, already-approved source of
valid assignable owners, DO NOT invent one… implement only the portions that are honestly possible."*

Every portion depends on the same missing uuid:

- **Current-owner display** — no field in the response.
- **Target selection** — no list to select from.
- **Self-assign** — no own id, and S4 already performs implicit self-assignment anyway.
- **Submit** — the body's only required field is unobtainable.

An `assign` method was deliberately **not** added to `salesRequestsApi`. Nothing could call it, no test
could exercise a real flow through it, and shipping a client method for a contract the console cannot
satisfy would make the gap harder to see, not easier.

---

## 4. Correcting my own previous report

**Doc 133 §6 said assign and win were "a build gap, not a contract one", and that the
availability-check panel was "the pattern to follow" for both.** That was right about the *interaction*
pattern and wrong about the *dependency*. The availability check needs only a reference, which the URL
already carries. Assignment needs a second identity the console has never been given. I checked the
panel pattern then and did not check the data source; this step checked it.

Whether the same is true of **win (S10)** is worth knowing before it is briefed: `POST /win` takes no
body, so on that evidence it has no equivalent dependency — but that is an observation from this
step's reading, not a verified claim, and it should be confirmed rather than assumed.

---

## 5. What is missing, precisely

Two gaps. Both are contract additions, so both are **owner decisions**, not implementation details.

### Gap A — the detail response cannot say who owns a request

`reservation.sales_owner_id` exists (V12:38) and V27's `reservation_assignment` holds the history. The
data is there; the read contract does not expose it.

> ### ⛔ OWNER DECISION REQUIRED — what the console may show about an owner
>
> **A — add `salesOwnerEmail` (nullable) to `SalesRequestSummaryView`.** No migration; a join the
> scoped query already reaches. **Cost:** staff email becomes visible to every holder of
> `sales.request.view`, which is a disclosure the corpus has not ruled on — it gates *guest* contact
> behind `customer.view` **and** an audit row (doc 59:148) and says nothing about staff.
> **B — add a display-name column to `app_user` and expose that.** Needs a migration and a decision
> about who sets the name.
> **C — expose only `assigned: boolean`.** No new personal data; the console can say "assigned" or
> "unassigned" and nothing more. Smallest of the three, and enough to gate an action.
>
> No recommendation: the corpus records no rule about disclosing staff identity between colleagues.

### Gap B — there is no source of assignable owners

> ### ⛔ OWNER DECISION REQUIRED — where the console gets the list
>
> This needs a route doc 58 does not contain, and it is **downstream of config B24 — sales team
> structure**, which doc 131 §6 confirmed is still `OPEN`. *Who may own a request* is precisely what
> B24 decides: central desk versus per-property, and headcount. A list endpoint built before that
> answer would be encoding a team model nobody has chosen.
>
> **A — answer B24 first**, then add the route it implies.
> **B — add a minimal route now** returning the users the *backend's own* `isAssignableOwner`
> predicate already accepts for this reservation — active, and scoped to its property. That predicate
> exists and is tested, so the list would be exactly the set the POST would accept, with no new rule
> invented. It still needs a path, a permission and a decision on which identifying field it returns
> (Gap A).
> **C — other.**
>
> **B is the only option that adds no business rule**, because the membership test is already written
> and enforced. It still needs the owner to choose a path, a permission and a field, so it is not a
> decision I can make.

---

## 6. Verification

`backend/src` **0** · `frontend/src` **0** · `db/migration` **0** files changed this step, checked by
mtime against doc 133. `git diff --check` clean. The frontend suite was **not re-run**: nothing
executable changed, so a run would only re-report Step 16A.10's **503** tests, 28 files, 22 routes.

**No OQ status changed. No new OQ raised** — both gaps are missing *contract*, recorded here where the
decision sheet convention puts them, and Gap B is an existing open config (B24) reaching a new
consequence rather than a new question.

---

## 7. Next step

**Answer Gap A and Gap B**, then the assignment UI is a single short implementation turn: the
interaction pattern, the error mapping, the busy-state guard and the refresh-after-204 discipline are
all already established by `AvailabilityCheckPanel`, and only the data source is missing.

If you would rather keep moving on UI now, **win (S10) is the better next brief** — `POST /win` takes
no body, so on the evidence above it needs nothing the console does not already have.
