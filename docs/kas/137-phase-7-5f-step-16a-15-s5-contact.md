# PHASE 7.5F — STEP 16A.15 — S5 / S6 CONTACT LOGGED, END TO END

**Date:** 2026-08-28
**Status:** 🟢 **COMPLETE** — backend, API client and Partner Console UI, in one step.

**Gates:** backend **155 unit + 443 integration = 598** (+14), `BUILD SUCCESS` · frontend **590**
(+30), 31 files, typecheck clean, **lint 0 problems**, build compiled, **22 routes** (unchanged) ·
**no migration** (29, latest V27) · every reservation-side table **0** · `git diff --check` clean ·
**no OQ changed**.

---

## 1. Contract verified

| | |
|---|---|
| **S5** | `AVAILABILITY_CHECK → CUSTOMER_CONTACTED`, actor **S**, guard **"a contact log entry exists"**, side effect **"contact recorded: channel, direction, outcome"**, holds **maintained**, audit `reservation.contacted` |
| **S6** | `ASSIGNED → CUSTOMER_CONTACTED`, guard **"permitted — clarify dates before checking"**, side effect "contact recorded" |
| Route | doc 58 §5:245 — `POST /sales/requests/{reference}/contact`, permission **`sales.request.manage`**, *"Log a contact"* |
| Fields | doc 29:275 and doc 21:591 both list **"channel, direction, outcome, notes, timestamp, agent"** |

Read from doc 54 and doc 58 directly. Nothing was inferred from S11 or S12 — and the shape genuinely
differs: this transition takes a **structured body**, is **non-terminal**, and **touches no
inventory**.

### 1.1 The store already existed

`reservation_contact_log` was created by **V14:32** and, until this step, **nothing in the codebase
read or wrote it**:

```
reservation_id · admin_id · channel contact_channel NOT NULL · direction contact_direction NOT NULL
outcome text · notes text · contacted_at timestamptz NOT NULL DEFAULT now()
```

Every field doc 54 and doc 29 name is a column. `contact_channel` = PHONE, EMAIL, ZALO, SMS,
IN_PERSON; `contact_direction` = OUTBOUND, INBOUND (V1:89-91). **No migration was needed** — the table
was waiting for its transition, exactly as `reservation_assignment` was not.

### 1.2 The guard and the side effect are one row

Doc 54 S5's guard is *"a contact log entry exists"* and its side effect is *"contact recorded"*. Those
are not two steps: the entry this call writes **is** the one the guard requires. So the insert happens
before the status moves, and a refused insert takes the transition with it.

---

## 2. Backend

```
POST /api/v1/admin/sales/requests/{reference}/contact
@PreAuthorize("hasAuthority('sales.request.manage')")   →  204
ContactRequestBody { channel, direction, outcome?, notes? }
```

One transaction: lock → source-state check (**409**) → insert the contact log → status →
status history → audit `reservation.contacted`.

**Required exactly where the column is.** `channel` and `direction` are `@NotBlank @Pattern` with the
enum values verbatim; `outcome` and `notes` are optional with length caps. A caller cannot be refused
for omitting something the record does not require, and a bad enum value is a **400 naming the field**
rather than a 500 from a failed cast — which is what a plain string passed to `CAST(… AS
contact_channel)` would have produced.

**Neither the timestamp nor the agent is accepted from the caller.** `contacted_at` is the column's own
`DEFAULT now()` and `admin_id` is the session's user. Accepting either would let an agent log a
conversation at a time it did not happen, or in someone else's name. A test posts `contactedAt` and
asserts the **400** that `fail-on-unknown-properties` produces.

**No inventory is read or written.** Doc 54's Hold column for S5 and S6 is *"maintained"*, and a test
asserts holds, `direct_committed` and `available_direct()` are all unchanged across a contact.

### 2.1 Two source states accepted, and one deliberately refused

`CONTACTABLE_FROM = {ASSIGNED, AVAILABILITY_CHECK}` — S6 and S5.

**`ALTERNATIVE_OFFERED` is refused, and that is a real frozen transition being declined.** Doc 54 **S9**
is `ALTERNATIVE_OFFERED → CUSTOMER_CONTACTED` with the same audit event, but it carries a side effect
S5 and S6 do not: *"alternative holds released unless explicitly extended"*. No mechanism for
"explicitly extended" exists, so accepting that source state would either skip the hold release or
invent the rule. The state is unreachable anyway — S7 is not implemented.

**A second contact is refused too.** Doc 54 has no `CUSTOMER_CONTACTED → CUSTOMER_CONTACTED` row.
Logging repeated conversations is obviously real operational behaviour, and doc 21:591 describes a
*"contact history — every touch"*; but a repeated log with no transition is not a transition the
contract describes, and inventing one is the same mistake as inventing an availability-check
self-transition. **This is the one genuine gap this step leaves**, and §6 records it rather than
closing it.

---

## 3. Frontend

`salesRequestsApi.contact(reference, entry)` with a pinned `ContactLogEntry` type — four fields, no
others, because an extra one is a 400.

`ContactLogPanel`: two selects carrying the enum values, an optional outcome input, an optional notes
textarea, one submit.

**No confirmation.** The win panel confirms because it is terminal and seals a price; the terminal
panel takes two clicks because it hands inventory back. This releases nothing and moves no rooms, and
ceremony on routine actions is what teaches agents to click through the ones that matter.

**Direction defaults to OUTBOUND** — the common case — **and channel does not**, because guessing it
would record a fact nobody supplied. Submit stays disabled until a channel is chosen.

**Optional fields send `null`, never `""`.** The columns are nullable, and a blank string would record
that an agent typed nothing rather than that there was nothing to record. A test types whitespace and
asserts `null` is sent.

**No outcome vocabulary is offered** — an input, not a select, because the column is free text and no
frozen document enumerates outcomes.

Gate: `ASSIGNED` and `AVAILABILITY_CHECK`, mirroring the backend. On 204: `router.refresh()` then a
success toast; nothing sets the status locally.

---

## 4. Security

Permission `sales.request.manage` at the endpoint — doc 58 §5's own, not inferred. `insertContactLog`
carries `AuthorizationScope` and applies `ScopeFilter`, and is an `INSERT … SELECT` behind the
ownership join so `reservation_id` comes from the query rather than the caller.

Cross-partner → **404, and nothing written**. Unknown reference → 404. Unauthenticated → 401, missing
CSRF → 403. Terminal → 409. All tested, and each asserts `contactLogCountFor` is **zero** — a refused
transition must not leave a record behind.

`ScopeEnforcementStructureTest` and every architecture guard pass unchanged. **No guard was weakened.**

**Audit discretion:** the audit row carries `channel` and `direction` — operational facts — and
deliberately **not** `outcome` or `notes`, which can contain whatever an agent typed, including things
a guest said.

---

## 5. Tests

| | Before | After |
|---|--:|--:|
| Backend unit | 155 | **155** |
| Backend integration | 429 | **443** (+14) |
| Frontend | 560 | **590** (+30) |

`SalesRequestContactIT` **14 new**, including every one of the ten channel/direction combinations, and
a test proving a contacted request is then **winnable** — S10's second source state was unreachable
until now.

`contact.test.tsx` **30 new**.

**No existing test was weakened.** One was **corrected**, and it was mine:

> `win.test.tsx` asserted `queryByRole('combobox')` is null, as a proxy for *"no assignment control
> exists"*. The proxy stopped being true the moment the contact panel arrived with its own two selects
> — the claim it stood for did not. Replaced with the actual claim: the only comboboxes present are
> `contact-channel` and `contact-direction`, which fails the moment an owner picker appears. Narrower
> to state, stronger to hold.

One test-fixture bug of mine, fixed rather than worked around: a label built from
`channel.charAt(0)` produced uppercase partner codes, which `partner_code_format CHECK (code ~
'^[a-z0-9][a-z0-9-]*$')` refuses.

**Not browser-verified** — the page needs a session and a live reservation, and the dev database
deliberately holds zero.

---

## 6. The gap this step leaves

**Logging a second contact has no frozen transition.** Doc 21:591 describes a contact *history* —
*"every touch: channel, direction, outcome, notes, timestamp, agent"* — and the table's index is
`(reservation_id, contacted_at DESC)`, which is the shape of a list, not of a single row. But doc 54
has no `CUSTOMER_CONTACTED → CUSTOMER_CONTACTED` row, so a repeat is currently a 409.

This is **not** closed here, and no OQ is raised for it: it is a plain contract gap of the same kind
doc 131 records. The smallest resolution would mirror owner decision 5 for assignment — *"reassignment
without a status change is supported"* — but that was an explicit owner ruling, and this would need
its own.

---

## 7. Files changed

**Backend production (3):** `SalesRequestRepository.java` (+`insertContactLog`),
`SalesRequestService.java` (+`logContact`), `AdminSalesRequestController.java` (+`contact`);
**(1 new)** `api/ContactRequestBody.java`.

**Backend tests (2):** `SalesRequestContactIT.java` (new), `SecurityFixtures.java` (+2 readers).

**Frontend production (3):** `ContactLogPanel.tsx` (new), `SalesRequestDetailView.tsx`,
`endpoints/salesRequests.ts`.

**Frontend tests (2):** `contact.test.tsx` (new), `win.test.tsx` (one proxy assertion corrected).

**Migrations: 0. Docs (2):** this document, `00-README.md`.

---

## 8. OQ status

**None changed, none raised.** OQ-171/172/173/174/017 `CLOSED`; **OQ-162, OQ-163, OQ-066 `OPEN`**;
OQ-161 `DEFERRED`. Step 16A.11's assignment dependency untouched.

Doc 54 S5's notification is *"optional guest email"* and none is sent — doc 117 §8.1's basis. A test
asserts `email_log` stays empty.

---

## 9. Where the workflow now stands

```
REQUESTED ──assign(S2)──► ASSIGNED ──────contact(S6)──────► CUSTOMER_CONTACTED
    │                        │                                      │
    └──check(S4)──► AVAILABILITY_CHECK ──contact(S5)────────────────┤
                             │                                      │
                             └──────────win(S10)──► WON ◄───────────┘
    any non-terminal ──decline(S11) / cancel(S12)──► DECLINED / CANCELLED
```

**Eight of doc 54's thirteen transitions are implemented**, and every one has a console control except
S2, whose UI is blocked on doc 134's two owner decisions.

---

## 10. Next step

**S7–S9, the alternative offer**, is the remaining sales path — and it is **not** ready: S7 needs
config **B1** (`DIRECT_ALTERNATIVE_HOLD_DURATION`, unset) and **B19** (offer expiry, unset), and S9
needs the "explicitly extended" rule that does not exist. Doc 131 §11 already recorded B1 and B19 as
non-blocking *for that step*; they block this one.

So the two implementable candidates are:

1. **S13 expiry** — `reservation.expired` when a request hold lapses. Doc 55 §5.1 already defines the
   sweep query, and B2 is supplied. It needs a scheduler decision the corpus may not have made, which
   should be verified before starting.
2. **OQ-162** — still the only gap a guest can perceive. Needs an owner decision on channel and
   provider before any code.

Neither is a documentation phase; both start with reading their frozen contract.
