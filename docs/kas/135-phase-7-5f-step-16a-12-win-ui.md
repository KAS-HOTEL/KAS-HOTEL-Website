# PHASE 7.5F — STEP 16A.12 — PARTNER CONSOLE: WIN UI (S10)

**Date:** 2026-08-28
**Status:** 🟢 **COMPLETE** — the Partner Console can now carry a request from `REQUESTED` to `WON`.

**Gates:** frontend **534** tests (+31), 29 files, typecheck clean, **lint 0 problems**, build
compiled, **22 routes** (unchanged) · **backend 0 files** · **no migration** (29, latest V27) ·
**no database write** · `git diff --check` clean · **no OQ changed**.

---

## 1. Route and contract, verified from source

```
POST /api/v1/admin/sales/requests/{reference}/win
@PreAuthorize("hasAuthority('reservation.win')")     →  204 No Content
public void win(@PathVariable String reference)      →  NO BODY
```

`AdminSalesRequestController:176-181`. Doc 132's report matches the source exactly; nothing
contradicted it, so no stop condition was reached.

**Source states**, from `SalesRequestService.WINNABLE_FROM`: `AVAILABILITY_CHECK`,
`CUSTOMER_CONTACTED`, `ALTERNATIVE_OFFERED`. `REQUESTED` is absent — owner decision 3 of Step 16A.9
kept doc 54's prohibition instead of adding a shortcut.

**Every refusal it can raise**, read from `win(...)` rather than assumed:

| | |
|---|---|
| **404** | absent, another partner's, or an OTA reservation |
| **409 `ILLEGAL_TRANSITION`** | any state outside the three above — which is what a second win is |
| **422 `NO_AVAILABILITY`** | the under-lock re-check found the rooms gone; the whole transition rolls back |
| **422 `CONFIG_MISSING`** | B12 requires a deposit, **or** B12 is unset (`requireBoolean` → `MissingConfigurationException`, which carries the same code) |
| 401 · 403 | unauthenticated · missing `reservation.win` or CSRF |

**There is no 400.** The route takes nothing to validate, and no test pretends otherwise.

---

## 2. What was built

`salesRequestsApi.win(reference)` — one method on the existing client, `api.post` with **no body**,
matching the Java signature.

`WinRequestPanel` — a client component beside the availability-check and decline panels, rendered by
`SalesRequestDetailView` when `salesStatus ∈ WINNABLE_FROM`.

### 2.1 This one confirms, and the availability check does not

A re-check reads. A win **commits**: it opens `stayStatus = CONFIRMED`, makes the held rooms firm,
seals the price the guest will be charged, and reaches a status doc 54 freezes as terminal.

So it uses the console's existing **`ConfirmDialog`** — the same component `BaseRatePanel` and
`BulkRateEditor` use before an irreversible write. No dialog framework was added. The underlying
`Dialog` already moves focus in and back, traps Tab, closes on Escape, sets `aria-modal` and carries
an accessible name via `aria-labelledby`; none of that was reimplemented.

The decline panel's two-click inline pattern was **not** reused here: a modal is the console's
established affordance for an irreversible write, and decline predates `ConfirmDialog` being used in
this feature.

### 2.2 Double submission

Guarded on the `busy` **state inside the handler**, not on the dialog's `disabled` attributes. `ConfirmDialog`
disables both buttons and refuses to close while busy, but a repeated `Enter` landing between the
click and the re-render would still reach the handler — so the handler returns early. Two tests pin
it: three clicks and three consecutive `Enter` presses each produce **exactly one** request.

The trigger button is also disabled while busy, so the dialog cannot be re-opened mid-flight.

### 2.3 Nothing is claimed before the server says so

On 204: close the dialog → `router.refresh()` → success toast. **Nothing sets `salesStatus` to
`WON`.** The 204 carries no state, and the badge is rendered by the detail view from server data —
this component holds no copy of it to flip. A test asserts that mid-flight the panel says nothing
about the outcome and `refresh` has not been called.

### 2.4 Copy — and one defect the tests caught

Vietnamese only (doc 69 §325, config A12). The wording says what the action does to the record and
stops: no lock, counter, hold identifier, UUID or setting key appears anywhere an agent reads.

**The first draft labelled the trigger and the dialog's confirm button identically** —
"Xác nhận yêu cầu" on both. The tests caught it as an ambiguous accessible name, and it was a real UX
defect: the confirmation step must read as the commitment, not repeat the trigger. Fixed by adopting
the decline panel's own convention — action then "Xác nhận …" — and the sales verb doc 58 §5
deliberately chose when it named the route `/win` rather than `/confirm`:

- trigger **"Chốt yêu cầu"** · dialog confirm **"Xác nhận chốt yêu cầu"** · cancel "Huỷ"
  (`ConfirmDialog`'s own default).

---

## 3. Error handling

The shared doc 58 §2.1 mapping (`messageFor`) does the general work, so **404 stays "not found" and
never becomes "forbidden"** — what doc 85 §6.3 uses 404 to hide. Three cases get their own wording,
because the generic text would mislead:

- **409** → *"no longer in a state that can be closed — reload to see the latest."* The generic
  "information changed" describes an optimistic-locking conflict, not this.
- **422 `NO_AVAILABILITY`** → the rooms are gone, the request was not won, the status is unchanged.
  **The useful backend answer is preserved rather than flattened into "something went wrong"**, and a
  test asserts no generic failure text appears.
- **422 `CONFIG_MISSING`** → the backend's own message names `DEPOSIT_REQUIRED_TO_CONFIRM` in English.
  That is right for an operator reading a log and wrong for a Vietnamese console, so it is replaced
  with copy pointing at the administrator. A test asserts the setting key never reaches the screen.

---

## 4. State gating, accessibility, responsive

`WINNABLE_FROM` on the client mirrors the backend set. It is a **convenience, never the boundary**:
the backend applies its own source-state check, permission, scope filter and B12 guard, so a control
that should not have rendered still cannot perform a transition — and a 409 is handled either way.

Keyboard: the trigger is reachable by Tab and activates on Enter; the dialog takes focus, confirms
from the keyboard, and closes on Escape. `aria-busy` during submission comes from `Button`; failures
land in a single `aria-live="polite"` region with `role="alert"`; success uses the existing toast.
Tests cover Tab → Enter → Enter, Escape, the dialog's `aria-modal` and that focus is inside it.

Responsive: the actions container added in Step 16A.10 is a single flex column at every width, and
the win panel is another `Card` in it. No new breakpoint, no side-by-side cards, no horizontal
scroll.

---

## 5. Not built, deliberately

**No payment UI** — no form, amount, method, deposit or receipt. B12 was answered pay-at-hotel for
V1 (OQ-017, closed) and the backend needs nothing. A test asserts no payment vocabulary and no number
input appears.

**No assignment UI** — doc 134's dependency is untouched. A test asserts no assign control and no
`combobox` were introduced. The detail view's standing note still says the console has no
assignment action; only the half about confirmation was removed, since that half is now false.

---

## 6. Tests

**+31**, in `win.test.tsx`: confirmation required before any call · cancel and Escape · exactly one
call with the reference and no body · busy state · three clicks → one request · three `Enter`
presses → one request · trigger disabled mid-flight · 204 → close, refresh, toast · no optimistic
`WON` · 409 · `NO_AVAILABILITY` preserved · `CONFIG_MISSING` without the setting key · 403 · 404 kept
distinct from forbidden · 401 · network · dialog closes on failure and can be retried · single live
region · offered from all three source states · not from `REQUESTED` · not once `WON` · not in any
other terminal state · win and decline together with the check correctly absent · no assignment
control · no payment control · no internal identifier · decline unchanged · three accessibility
tests.

**No existing test was weakened, deleted or broadened.** `availabilityCheck.test.tsx`,
`decline.test.tsx` and `salesRequest.test.tsx` all pass **unchanged** — the win panel renders only
from states those files do not use for their action assertions, so no mock or expectation needed
adjusting.

`ConfirmDialog` is exercised through this feature rather than re-tested as a primitive: the mock
replaces only `useToast`, so the real dialog's focus, Escape and disabled behaviour are what the
tests run against.

**Not browser-verified.** The page needs an authenticated partner session and a reservation at
`AVAILABILITY_CHECK`; the dev database deliberately holds **zero** reservations, and seeding one
would invent commercial data. Recorded rather than dressed up.

---

## 7. Regression

| | Before (16A.10) | After |
|---|--:|--:|
| Frontend tests | 503 | **534** |
| Test files | 28 | **29** |
| Routes | 22 | **22** |

`tsc --noEmit` clean · `eslint .` **0 problems** · `next build` compiled.

**Backend, migrations, seeds and database: 0 changes**, verified by mtime against doc 134. No backend
test was touched.

---

## 8. Files changed

**Frontend production (3):** `lib/api/endpoints/salesRequests.ts`,
`features/salesRequest/WinRequestPanel.tsx` (new), `features/salesRequest/SalesRequestDetailView.tsx`.

**Frontend tests (1):** `features/salesRequest/win.test.tsx` (new).

**Docs (2):** this document, `00-README.md`.

No CSS change was needed — the actions container and the panel classes from Step 16A.10 already fit.

---

## 9. OQ status

**None changed, none raised.** OQ-171, 172, 173, 174 and 017 remain `CLOSED`; OQ-162, 163 and 066
remain `OPEN`; OQ-161 remains `DEFERRED`. **Step 16A.11's assignment dependency is untouched and is
not closed by this work** — a win UI says nothing about where an owner list comes from.

---

## 10. Next step

The console now runs the full direct-sales path it is able to: **request → availability check → win**,
with decline available throughout.

What remains, in the order the repository is ready for it:

1. **Assignment (S2)** — still blocked on doc 134's two owner decisions, and the older of the two
   is downstream of config **B24**, still `OPEN`.
2. **OQ-162** — no transition sends anything, and the console says so on every screen. It is the only
   remaining gap the guest can perceive.
3. **S12 cancel** — shares S11's shape, has its own frozen route, and needs no new decision.
