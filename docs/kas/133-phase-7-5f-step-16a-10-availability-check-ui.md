# PHASE 7.5F — STEP 16A.10 — PARTNER CONSOLE: AVAILABILITY CHECK UI

**Date:** 2026-08-28
**Status:** 🟢 **COMPLETE** — the first Partner Console control for the S2/S3/S4/S10 workflow.

**Gates:** frontend **503** tests (+22), typecheck clean, **lint 0 problems**, build compiled,
22 routes · **backend 0 files changed** · **no migration** (29, latest V27) · **no database write** ·
`git diff --check` clean.

---

## 1. Route, verified from source

The brief proposed `POST /api/v1/partner/reservations/{reference}/availability-check`. **That route
does not exist.** The real one, read from `AdminSalesRequestController`:

```
POST /api/v1/admin/sales/requests/{reference}/availability-check
@PreAuthorize("hasAuthority('sales.request.manage')")   →  204 No Content
```

`@RequestMapping("/api/v1/admin/sales/requests")` + `@PostMapping("/{reference}/availability-check")`.
There is **no `/api/v1/partner` namespace** — OQ-129 resolved that `/partner/**` is frontend IA only,
and `ADMIN` is the partner-facing role carrying PARTNER scope (doc 85 §5.2). The client already
documented this; nothing was changed to accommodate the brief's guess.

Source states accepted, from `SalesRequestService.CHECKABLE_FROM`: **`REQUESTED`, `ASSIGNED`**.

---

## 2. What was built

`salesRequestsApi.availabilityCheck(reference)` — one method on the **existing** client, using the
existing `api.post`, which omits the body and its `Content-Type` when none is given. That matches an
endpoint whose Java signature takes only `@PathVariable`.

`AvailabilityCheckPanel` — a client component beside `DeclineRequestPanel`, built from the existing
`Card`, `Button` and `useToast` primitives and the feature's own CSS module. It is rendered by
`SalesRequestDetailView` when `salesStatus ∈ {REQUESTED, ASSIGNED}`.

### 2.1 One click here, two for decline

A decline is terminal and hands inventory back, so it arms first. A re-check moves no rooms, releases
nothing and creates nothing a guest can see — it is the ordinary next step. Making the routine action
as heavy as the destructive one teaches agents to click through confirmations, so it is a single
click with a loading state and a success toast.

### 2.2 The server owns the outcome

A 204 says the transition happened; it does not say what the check found, and the endpoint returns no
result document. So the panel renders **no availability figure** — `router.refresh()` re-reads the
detail and the status badge shows whatever the server now holds. A test asserts no room count appears.

Double submission is blocked by the `busy` **state**, not by the disabled attribute: a click landing
between the event and the re-render must still be a no-op, or one agent produces two checks.

### 2.3 Errors, through the existing mapping

`messageFor` from `features/auth/messages` — the shared doc 58 §2.1 mapping — handles 401, 403, 404
and everything generic, so a **404 stays "not found" and never becomes "forbidden"**, preserving what
doc 85 §6.3 uses 404 to hide. Two cases get their own wording because the generic text would mislead:

- **409** — "the information changed, reload" describes an optimistic-locking conflict, not a request
  sitting in a state this transition does not leave. Never retried automatically.
- **422 `NO_AVAILABILITY`** — the check ran and the rooms are gone. That is the answer the agent came
  for, not a validation problem, and the server rolled the transition back with it.

Copy is Vietnamese only, matching `DECLINE_COPY` and doc 69 §325 (config A12): the console is
single-language in V1, the guest surface is not.

---

## 3. Gating, and what it is not

`CHECKABLE_FROM` on the client mirrors the backend set. It is a **convenience, never the boundary**:
the backend applies its own source-state check, its permission and its scope filter, so a button that
should not have rendered still cannot perform a transition — and a 409 or 403 is handled either way.

**The frontend models no permissions**, and none was invented. Permissions appear in this codebase
only as documentation on the API client; the backend stays authoritative and a 403 is rendered
through the shared mapping.

No frontend-only transition exists. The UI initiates; the server decides; the page re-reads.

---

## 4. Tests

**+22**, all in `availabilityCheck.test.tsx`: the call and its argument, one-click behaviour, the
in-flight state, double-submit, 204 → refresh + toast, no fabricated result, retry after failure,
409/422/403/404/401/network, the single live region, state gating across `REQUESTED`, `ASSIGNED`,
`AVAILABILITY_CHECK` and all four terminal states, decline still intact, no assign/win control, no
internal identifier, keyboard operation and the accessible name.

**Two existing test files were touched, and no assertion was weakened.** They render
`SalesRequestDetailView`, which now contains a component calling `useToast`, so each gained the
**same additive mock** `inventory.test.tsx` and `policy.test.tsx` already use — only `useToast` is
replaced; `Button`, `Card` and every other primitive stay real. `salesRequest.test.tsx` also gained
the new endpoint on its module mock, matching the comment already there about the decline endpoint.
All 14 decline tests and all pre-existing detail tests pass unchanged.

**Not verified in a browser.** Rendering this page needs an authenticated partner session and a
seeded reservation, and the dev database deliberately holds **zero** reservations. Seeding one to take
a screenshot would invent commercial data. The verification is the 503-test suite, the typecheck and
the build — recorded here rather than dressed up as an end-to-end check.

---

## 5. Files changed

**Frontend production (4):** `lib/api/endpoints/salesRequests.ts`,
`features/salesRequest/AvailabilityCheckPanel.tsx` (new),
`features/salesRequest/SalesRequestDetailView.tsx`, `features/salesRequest/SalesRequest.module.css`.

**Frontend tests (3):** `availabilityCheck.test.tsx` (new), `decline.test.tsx`,
`salesRequest.test.tsx`.

**Docs (2):** this document, `00-README.md`.

**Backend 0 · migrations 0 · database 0 · OQ 0.**

Two stale comments in `SalesRequestDetailView` — flagged in doc 132 §10 as citing B12/OQ-172/B24/B25
as blockers — were corrected as part of editing that file, since the component's behaviour changed
underneath them.

---

## 6. Remaining

**Assign (S2) and win (S10) have working backends and no UI.** That is a build gap, not a contract
one: routes, permissions and error codes are frozen and implemented, and this panel is now the
pattern to follow. Neither was started in this step.
