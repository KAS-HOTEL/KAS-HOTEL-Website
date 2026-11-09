# PHASE 7.5F — STEP 16A.26 — END-TO-END PRODUCT VALIDATION

**Date:** 2026-08-31
**Status:** 🟢 **THE WORKFLOW PASSES** — guest request → partner console → WON, in a real browser
against the real stack. **Three defects found**, one fixed here, two blocked on registered decisions.

**Gates:** backend **158 unit + 505 integration = 663**, `BUILD SUCCESS` · frontend **715** (+5),
39 files, 22 routes, typecheck clean, **lint 0 problems**, build clean · **no migration** (29
validated, latest V27) · `git diff --check` clean · database returned to its pre-run state ·
**no OQ changed**.

---

## 1. Environment

| | |
|---|---|
| Backend | Spring Boot 3.5.16 on **http://localhost:8080**, profile `dev`, Java 21 (Temurin 21.0.12) |
| Frontend | Next.js 16.3.1 on **http://localhost:3000**, `.claude/launch.json` → `npm --prefix frontend run start` |
| Database | PostgreSQL 17.10, `kas_web_dev`, role `kas_web_app`, schema `kas` |
| Flyway | **29 migrations validated**, "Schema `kas` is up to date. No migration necessary." |
| Readiness | `UP` on all four components — `db`, `kasSchema`, `kasAuthentication`, `readinessState` |

Two environment secrets were generated for the run, held only in a scratch file outside the
repository and never written to any tracked file: `KAS_JWT_SIGNING_SECRET` (without it every login
returns 422 `CONFIG_MISSING`) and `KAS_DEV_PARTNER_PASSWORD`, used to re-provision the existing dev
account through the repository's own documented tool — `DevPartnerAccountProvisioning`, doc 101 §1.1.
The password from the original provisioning was, by design, never recorded.

**Initial state, recorded before touching anything:** 8 properties (**all `DRAFT`**), 1 partner,
5 users, 18 system settings, 5 distribution channels — and **0 room types, 0 rate rules, 0 inventory
days, 0 reservations**.

---

## 2. Defect 1 — nothing can ever make a hotel bookable (OQ-101)

The guest surface was empty, and correctly so: `GET /public/properties` returned `[]` because all
eight properties are `DRAFT`.

Tracing the way out found there is none.

- `PropertyLifecycleState.OPEN` is **never assigned anywhere in `src/main`**. The single lifecycle
  write is `OnboardingService.approve` → `COMING_SOON` (line 158).
- Bookability requires **`OPEN` exactly**: `PublishedAvailabilityRepository`, `PublishedRateRepository`
  and `PublicAllocationRepository` all carry `p.lifecycle_state = 'OPEN'`.
- **Doc 58 §8:320 freezes the endpoint that would do it** — `POST /admin/properties/{id}/publish`,
  permission `property.manage`. It is not implemented. `PropertyRepository.updateLifecycle` even
  writes `published_at` when the target state is `OPEN`, so the repository already equates publishing
  with `OPEN`; nothing calls it with that value.

This is **OQ-101**, still `OPEN` in doc 16:559 — *"Approval targets `COMING_SOON`; what moves a
property to `OPEN`, and does it require inventory and rates?"* The endpoint is frozen but its
**semantics are the open question**, so it was not implemented here.

Proof of the consequence: the real S1 call for a `DRAFT` property answers
`404 NOT_FOUND {"code":"NOT_FOUND","message":"Property not found"}` — correct behaviour, and a
closed door.

---

## 3. Defect 2 — the submission gate cannot be satisfied by the API

`DRAFT → COMING_SOON` is unreachable too, so the chain is broken twice over.

`POST /admin/properties/{id}/submit` refuses with a precise 422 listing what is missing:

```
shortDescription (both locales) · signatureLine · district · ward
hero image · at least one signature experience
```

Of those six, **only `district` and `ward` can be written** (`UpdatePropertyRequest`). The rest have
**no write path in the entire backend**:

| Requirement | Reader | Writer |
|---|---|---|
| `property_translation.short_description` | `PropertyCompletenessChecker:65` | **none** — the only INSERT is `(property_id, locale, name)` at `PropertyRepository:126` |
| `property_translation.signature_line` | `PropertyCompletenessChecker:68` | **none** |
| `property_experience` | `PropertyCompletenessChecker:75` (counted) | **none** — no table reference anywhere else in `main` |
| hero image | `PropertyCompletenessChecker` | blocked by **OQ-106** — no object-storage provider, 0 media assets |

So the completeness contract demands artefacts the product cannot author. This is a **defect**, not an
open question: the checker and the write API disagree about what a property is made of. Fixing it
means new authoring endpoints and their contracts, which is feature work outside a validation phase.

---

## 4. Minimal documented setup, and why it was necessary

The real flow was **proven impossible**, not assumed to be, so the brief's escape hatch applied. Two
SQL statements, one property, reversed afterwards:

```sql
UPDATE kas.property  SET lifecycle_state='OPEN', published_at=now() WHERE slug='kas-milestone-premium-hotel';
UPDATE kas.room_type SET status='PUBLISHED' WHERE slug='deluxe-city-view';
```

The second is the same gap in miniature: room types are published only by property approval, and
`PATCH /room-types/{id}/status` **refuses `PUBLISHED` by design** (409 `ILLEGAL_TRANSITION`) so a
partner cannot slip a room onto a live hotel without review.

**Everything else was created through the real product:** the room type via
`POST /admin/properties/{id}/room-types` (201), inventory via `POST /admin/ops/inventory/bulk`
(8 rooms × 12–13 Sep), and the base rate via `PUT /admin/rates/base/{roomTypeId}` (1.850.000 ₫).
**No reservation was ever inserted directly.**

---

## 5. The guest request — through the browser, not the API

`http://localhost:3000/vi/hotels/kas-milestone-premium-hotel`, filled and submitted by hand in the
browser: room quantity 1, 2 adults, guest `Nguyen Van An` / `an.nguyen@example.invalid` /
`+84901234567` / `VN`, a Vietnamese special request, terms accepted, **marketing consent left off**.

The quote returned **3.700.000 ₫** — 2 nights × 1.850.000 ₫, arithmetic correct. The page then showed:

> **Mã yêu cầu KAS-260830-CCYF** · Trạng thái **REQUEST_RECEIVED** · Tạm tính **3.700.000 ₫**

**Reference: `KAS-260830-CCYF`.** The row the database actually held:

| Column | Value |
|---|---|
| `channel_type` / `lead_source` / `sales_status` | `DIRECT` / `WEBSITE` / `REQUESTED` |
| dates, adults | `2026-09-12` → `2026-09-14`, 2 |
| guest | name, email, phone, `VN`, special requests — all exactly as typed |
| `currency` / `total_minor` | `VND` / **3700000**, matching the quote |
| `requested_at` / `sla_due_at` | exactly **24 h** apart — config A6 |
| `customer_id` | **NULL** — anonymous guest, doc 117 §6 |

Plus one `reservation_line` (`Phòng Deluxe hướng phố`, qty 1, 1.850.000 / 3.700.000), one
`reservation_status_history` row (`SALES → REQUESTED`, actor `CUSTOMER`) and one
`reservation_request_idempotency` row.

**The integrity check passes**: the object created by the guest form is the same row, by reference and
by id, that the partner console then read and mutated.

---

## 6. The partner workflow — every transition, UI and database

| # | UI action | Result | Database |
|---|---|---|---|
| 1 | Open `/partner/requests` | request visible in the queue | — |
| 2 | **Kiểm tra phòng trống** | toast, panel updates | `sales_status = AVAILABILITY_CHECK`; `reservation_availability_check` row `outcome = AVAILABLE`, detail `lowestAvailable: 8, coveredNights: 2, satisfied: true` |
| 3 | *(same click)* | — | **assignment happened here**: `reservation_assignment` row, reason **"Implicit self-assignment (S4)"**, `from_owner_id` NULL → `to_owner_id` set, and `reservation.sales_owner_id` populated |
| 4 | **Ghi nhận liên hệ** (Zalo, outbound) | toast naming the new status | `sales_status = CUSTOMER_CONTACTED`; `reservation_contact_log` row `ZALO / OUTBOUND` |
| 5 | **Chốt yêu cầu** → **Xác nhận chốt yêu cầu** | toast: *"Đã chốt yêu cầu. Kỳ nghỉ của khách đã được xác nhận."* | `sales_status = WON`, **`stay_status = CONFIRMED`**, `won_at` set |

**There is no separate "assign" button, and that is correct.** Doc 134 blocks an assignment UI, and
Steps 16A.11 and 16A.13 both reported it BLOCKED — but S4 self-assigns implicitly, so the request
acquired an owner through the product's own designed path.

The final `reservation_status_history` is doc 54 §4's lifecycle exactly, **both machines**:

```
SALES  —          → REQUESTED           CUSTOMER
SALES  REQUESTED  → AVAILABILITY_CHECK  ADMIN
SALES  AVAILABILITY_CHECK → CUSTOMER_CONTACTED  ADMIN
SALES  CUSTOMER_CONTACTED → WON         ADMIN
STAY   —          → CONFIRMED           ADMIN
```

Inventory committed **1 room on 12 and 13 Sep and none on the 14th** — the checkout night is not
occupied, `reservation_dates_ordered` upheld in practice.

**Refresh preserves everything**: after a hard reload the WON badge, the five-row timeline and the
live age all render, and **every action control is gone** — availability-check, contact, win, decline
and cancel all correctly hide on a terminal status.

---

## 7. Fifteen steps of console work, finally seen working

Every step since 16A.5 reported *"Not browser-verified"* because the database held no reservations.
One screenshot retired all of it. The queue row rendered:

```
Mã yêu cầu | Khách | Nguồn khách | Khách sạn | Kỳ nghỉ | Phòng | Giá trị | Tuổi yêu cầu | Hạn phản hồi
KAS-260830-CCYF | Nguyen Van An | WEBSITE | Kas Milestone… | 2026-09-12 → 2026-09-14 · 2 đêm | 1 | 3.700.000 ₫ | 1m | Trong cam kết
```

- **16A.23 lead source** — the `WEBSITE` badge, third column, doc 69 §4.2's position.
- **16A.24 age** — `1m`, then `2m`, `5m`, `8m` as the run went on. Live, and from the server clock.
- **16A.22 SLA** — `Trong cam kết`, with no overdue duration, correct 24 h from the request.
- **16A.20 timeline** — all five events, including the STAY row.
- **16A.12 win dialog** — trigger `Chốt yêu cầu`, confirm `Xác nhận chốt yêu cầu`; the distinct
  labels that step introduced, verified in production rather than in jsdom.
- **16A.25 tab strip** — `Yêu cầu mới` / `Quá hạn` / `Tất cả yêu cầu`, `aria-current` following the
  URL, `?slaState=breached` correctly returning **0 rows** for a request 2 minutes into a 24-hour
  promise, and `?salesStatus=REQUESTED` correctly emptying once the request became WON.

---

## 8. Defect 3 — found by clicking, fixed here

**Clicking a queue tab left the filter bar displaying the previous page's filters.**

Measured, not guessed:

| | URL | `#filter-status` |
|---|---|---|
| Hard load of `?salesStatus=REQUESTED` | correct | **`REQUESTED`** ✅ |
| Soft navigation to the same URL | correct | **`""`** ❌ |

**Root cause.** Every control in the filter bar is uncontrolled — `defaultValue` and `defaultChecked`
apply on mount and never again. A tab is a client-side navigation, so the server re-renders the
filtered list and the component receives new `active` props, but React reuses the same DOM nodes and
the old values survive.

**Why it matters.** The bar is a GET form: "Áp dụng" submits whatever the controls display. An agent
who clicked *Yêu cầu mới* and then applied any other filter would **silently discard the filter they
had just chosen**, and the queue and its own controls would disagree about what was being shown.

**Fix.** One `key` on the form, derived from the active filters, so the controls remount exactly when
their defaults would differ:

```tsx
<form key={filterKey(active)} method="get" …>
```

No contract, backend, API or route changed. **Five regression tests** were written **first** and
**all five failed against the unfixed code** — status follows the filter, clears again, every control
updates together, the breached box unticks when the tab moves away, and the clear link stays in step.
Verified again in the live browser afterwards.

---

## 9. Three further findings, recorded not fixed

1. **A toast can cover the confirm dialog's primary button.** The success toast from logging contact
   sat over *Xác nhận chốt yêu cầu*, and the click landed on the toast. The win only proceeded after
   the toast was dismissed. A z-index or placement question — small, real, and reachable by any user
   who acts twice in quick succession.
2. **Timestamps render raw.** The workspace shows `2026-08-30T23:12:34.029874Z` for *Gửi lúc*, *Hạn
   phản hồi* and every timeline row. Correct data, unformatted.
3. **Backend strings ignore `locale=vi`.** The guest receipt returned *"Within 24 hours"* and
   *"Final amount is confirmed by the KAS team."* in English on a Vietnamese page, beside correctly
   translated frontend copy.

None is a business decision; each is a defect a later step can take.

---

## 10. The integration suite shares the dev database

Running the backend suite **with the E2E data still present produced 33 failures**, then **0 after
cleanup** — same code, so nothing regressed. What failed is instructive:
`OnboardingWorkflowIT.seedPropertiesAreNotPublic` (Milestone was `OPEN`), 22 `ReservationRequestIT`
cases, and the suite's own cleanliness guards `theseTestsLeaveNoBusinessDataBehind` and
`theDatabaseIsClean`.

The guards worked exactly as intended. But it means **an E2E run and `mvn verify` cannot both hold
state in `kas_web_dev` at once**, which a project doing more end-to-end work will have to answer.

**The database was returned to its pre-run state**: reservation 0, room_type 0, inventory 0,
non-DRAFT properties 0. Four `*@test.invalid` users from the non-transactional
`ReservationConcurrencyIT` pre-date this run and were left alone.

---

## 11. Verification

Backend **663** (158 + 505), `BUILD SUCCESS`, after cleanup · frontend **715** (+5), 39 files ·
typecheck clean · **lint 0 problems** · build clean, **22 routes** · Flyway **29 validated**, latest
**V27**, **no migration** · `git diff --check` clean · **no OQ changed**.

**Browser verification: PERFORMED.** Chromium against the running stack — guest portfolio empty
state, hotel page, availability, quote, request submission, receipt, partner queue, all three tabs,
the filter bar, the workspace, and all three transitions with their dialogs and toasts.

---

## 12. Next step

The console is not what is holding this product back. **A hotel cannot be published**, and until it
can, the work of the last fifteen steps is unreachable by anyone who has not run two SQL statements.

The order that follows from what this run found:

1. **Owner ruling on OQ-101** — what moves a property to `OPEN`, and does it require inventory and
   rates? This is one decision, and it unblocks the frozen `POST /admin/properties/{id}/publish`.
2. **Then implement `/publish`** — the endpoint is already frozen at doc 58 §8:320 with
   `property.manage`, and `PropertyRepository.updateLifecycle` already does the write.
3. **Close the onboarding authoring gap** (§3) — `shortDescription`, `signatureLine` and signature
   experiences need write paths, or the completeness checker needs to stop requiring what cannot be
   written. Either way it is a contract question worth asking before coding.
4. Only then, the smaller findings in §9.

Step 3 also has a cheaper interim: the hero-image requirement is blocked by **OQ-106**, so even with
authoring endpoints, submission stays shut until object storage is chosen.
