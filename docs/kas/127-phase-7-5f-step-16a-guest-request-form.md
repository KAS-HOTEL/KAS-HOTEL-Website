# PHASE 7.5F — STEP 16A — GUEST REQUEST FORM

**Date:** 2026-08-27
**Status:** ✅ **COMPLETE.** The guest can now request a stay, and the request reaches the real
backend endpoint.

**Gates:** frontend **447 tests** (was 419, **+28**), typecheck clean, lint clean, build ✓, **20
routes** · backend **155 + 359 = 514**, `BUILD SUCCESS`, **unchanged** · **0 backend files, 0
migrations, 0 seed rows** · database clean · `git diff --check` clean.

---

## 1. The flow

```
/[locale]/hotels/[slug]   dates  →  availability  →  quote  →  REQUEST  →  confirmation
                          (server-rendered)          (POST)    (POST)     (the 201)
```

The request form appears **only after the backend has priced that exact selection**, and it is built
from the quote — property, dates, adults and lines all come from what was priced. Changing the room
selection discards the quote and the form with it: a request built from a stale selection is a request
for a different stay.

This is one page, not a wizard. The existing hotel page already carries dates and rooms; adding a
route would have meant re-deriving the selection from a URL and putting a guest's stay in query
parameters. **Route count is unchanged at 20.**

## 2. What is sent

Every field of the frozen `ReservationRequestBody`, and **nothing else** — the backend runs
`fail-on-unknown-properties: true`, so an invented field fails the whole request rather than being
ignored.

`propertySlug` · `checkIn` · `checkOut` · `adults` · `children` (always **0**) · `childAges` (always
**[]**) · `lines[]` · `guest{fullName, email, phone, country?, preferredChannel?, bestTimeToContact?}`
· `specialRequests?` · `acceptedTermsVersion` · `marketingConsent` · `locale`.

**Absent on purpose:** `offerCode` — config B23 is `OPEN` and the backend refuses it, so no key is
sent at all rather than `null`. No child control exists, because B10 is `OPEN` (doc 26 §7.4). No
`leadSource`, no total, no currency: the server owns them, and E6 proved a client cannot supply them.

**Empty optionals are omitted, not blanked.** The backend fingerprints the canonical body for
idempotency, so `""` and "absent" are two different requests; one guest input must not be able to
produce both.

`acceptedTermsVersion` is doc 58 §3.3's own `booking-terms-v3`, a constant. **V1 stores it opaquely
and never validates it** — OQ-167 — and there is no policy catalogue endpoint to derive it from. The
guest must tick an explicit acceptance box before the button will submit.

## 3. Idempotency

One logical submission owns one key for its whole life.

```ts
function keyFor(request) {
  const signature = submissionSignature(request);
  if (current?.signature === signature) return current.key;   // retry → same key
  return mint();                                              // edit  → new key
}
```

- **Retry after a network failure → the same key.** The server may already hold the reservation; the
  same key replays the original 201 instead of taking a second set of rooms.
- **A material edit → a new key.** Doc 117 §24.1 answers a reused key carrying a changed body with
  **409**, so reusing it would turn a guest's correction into a hard error.
- Keys come from `crypto.randomUUID`, never `Math.random`, never a hard-coded value, and never the
  reservation reference.

**Double submission is blocked three ways:** the button is `disabled` while in flight, `submit()`
returns early if already submitting, and the confirmation replaces the form entirely on success.

## 4. Errors

| | Shown |
|---|---|
| **400** | The backend's own message, on the backend's own field — `guest.country` lands on the country input. Anything not mapped to a visible control becomes a form-level message rather than being attached to an unrelated field |
| **404** | "not available for booking" — never "not permitted", which would leak the existence doc 85 §6.3 hides |
| **409 `IDEMPOTENCY_KEY_REUSED`** | A recoverable error. **Never a success, never an automatic re-send under a fresh key.** Editing any field mints a new key on its own, which is the recovery |
| **422 `NO_AVAILABILITY`** | Guest wording plus an action that clears the quote so the dates above can be changed. **No `alternatives`** — doc 120 §2 put nearest dates and other properties out of V1, so nothing is invented and no empty list implies the server looked. The backend's message names room-type slugs and is not shown |
| **Network** | A **Try again** button wired to the same handler, so the retry reuses the key |
| **5xx** | A constant, plus the correlation id for support. No stack trace, no backend text |

Entered values survive every failure. Nothing is reset behind the guest's back.

## 5. The confirmation

Renders **only the six public keys** of `RequestReceiptView`: `reference`, `status`,
`responsePromise`, `trackingUrlIssued`, `estimatedTotal`, `estimateDisclaimer`. No property echo, no
guest echo, no reservation id, no dates — the response carries none of them.

**Nothing claims a message was sent.** Notification delivery is **OQ-162** and no mail sender exists.
`trackingUrlIssued` is the backend's own honesty flag; the UI reads it and, when false, says plainly
that there is no tracking link yet. A test asserts the words *"email sent"*, *"check your inbox"* and
their Vietnamese equivalents never appear.

**SLA** is shown only as `responsePromise`, the string the 201 actually returns. No config value is
read on the client and no deadline is computed.

## 6. Localisation

**EN and VI parity for the whole new surface**, in `features/hotel/requestMessages.ts`.

There is no i18n framework in this application, and this step did not invent one.
`features/auth/messages.ts` states the position: *"a real i18n layer arrives with the customer
experience, and this module is the seam it will replace."* The rest of the guest surface is still
hardcoded Vietnamese. That seam is widened here — the same module shape, now keyed by locale, which
the route already carries. A test compares the two locale objects key-by-key so neither can drift.

**Known limitation:** the surrounding page, the availability list and the quote panel remain
Vietnamese-only. Converting them is a separate piece of work with its own blast radius.

## 7. Accessibility and responsive

Labels, `aria-describedby`, `aria-invalid` and required markers come from the existing `Form`
primitives; the terms checkbox wires its own error id. Errors are **text, not tint** (doc 82). A
single `aria-live="polite"` region announces the whole submission, so a state change is spoken once.
Native controls throughout — no custom listbox.

One column on a phone, two where a label and its field both still fit. Long hotel names, room lists
and the reference wrap rather than overflow. No fixed pixel widths in the new markup.

## 8. Architecture

No second HTTP client, no scattered `fetch` (ESLint and a source guard both forbid it). One additive
change to `lib/api/client.ts`: a `headers` option, because `Idempotency-Key` is a header and nothing
existed to carry one. Caller headers are applied **first**, so `Content-Type`, the CSRF header and
`Cookie` still win — a caller cannot weaken the transport.

New endpoint module `lib/api/endpoints/reservations.ts`, one per controller as the project does.
Domain types and pure validation in `lib/domain/reservationRequest.ts`, testable without a browser.

## 9. Not done

No partner or admin surface · no payment, voucher, discount or tax · no notification or email · no
modification or cancellation · no alternative-property or nearest-date recommendation · no B1 /
`ALTERNATIVE_OFFER` · no **OQ-172** S10 work · no rate limiting (**OQ-163**).

**No OQ status changed.** OQ-172, OQ-162, OQ-163 and OQ-066 remain `OPEN`; OQ-161 remains `DEFERRED`;
OQ-122 (portfolio search) and OQ-159 are untouched.

## 10. Two observations, neither blocking

**`preferredChannel` is not validated by the DTO.** It is cast straight to the `contact_channel`
enum — `CAST(:preferredChannel AS contact_channel)` — so a value outside `PHONE`/`EMAIL`/`ZALO`/`SMS`
would fail in the database rather than at validation. This form can only send the four legal values
(they come from a `<select>`), so it is not blocking and no backend change was made. Worth a
`@Pattern` when the backend is next opened.

**The flow could not be exercised in a live browser.** All 8 properties are `DRAFT` and there are 0
room types, so no availability can render — and creating that data is forbidden by this step's scope.
Coverage is the 28 tests, which drive the real component against the real error contract.
