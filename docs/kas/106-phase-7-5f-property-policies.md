# Phase 7.5F — Property Policies (Partner UI)

**Date:** 2026-08-19
**Status:** ✅ COMPLETE. **No migration. No backend change at all.**

**Gates:** frontend typecheck · lint (0 warnings) · **230 tests** · build (17 routes) · 0 npm
vulnerabilities · backend **390 tests** `BUILD SUCCESS` · Flyway **v23, 25 validated** ·
`git diff --check` clean · secret scan clean.

Taken up because Step 9 (room media) is legitimately blocked on OQ-106 — see doc 105. Policies need
no storage provider.

---

## 1. Repository findings

Phase 7.5D left the backend complete. **Not one backend file was touched this step** — verified by
mtime and by the regression suite being unchanged at 390.

| Piece | State |
| --- | --- |
| `property_policy` + `property_policy_translation` | already carry types, versions, effective dates, status and per-locale text |
| Eleven frozen types | `property_policy_type_valid` CHECK; `CHECK_IN`/`CHECK_OUT`/`EXTRA_BED`/`DEPOSIT` deliberately absent (OQ-110) |
| Lifecycle | `DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED`, `ARCHIVED` terminal, **no DELETE** |
| Both-locale activation gate | **already enforced** — `bodyLocaleCount < 2` → 400 with `field: body` |
| Current-policy resolution | `effective_from DESC, version DESC`, in SQL |
| Publication ladder | property publicly visible **and** policy `ACTIVE` **and** `effective_from <= current_date`, in SQL |
| Scope | `property.manage`, enforced at the repository boundary |

No stop condition fired.

## 2. Policy API contract — used verbatim

```
GET    /api/v1/admin/properties/{propertyId}/policies                  → PolicyView[]
GET    /api/v1/admin/properties/{propertyId}/policies/{policyId}       → PolicyView
POST   /api/v1/admin/properties/{propertyId}/policies                  { type, effectiveFrom } → DRAFT
PATCH  …/policies/{policyId}/translations                              { locale, summary?, body }
PATCH  …/policies/{policyId}/status?status=                            ACTIVE | PAUSED | ARCHIVED
```

Permission is **`property.manage`** — doc 59 §4.5 has no `policy.manage` (OQ-114). **Doc 58 §8 has no
policies row at all**, so these paths remain an addition awaiting an approved amendment (OQ-111).
Neither was invented here; both are pre-existing and recorded in doc 96.

**No optimistic-locking token exists.** `PolicyView.version` is the *effective-dated version number*,
not a concurrency token, and none was invented. A `409` from an illegal transition is still mapped
through `ApiError`.

## 3. Policy catalogue — a documented local mirror

There is **no policy-type catalogue endpoint**. The eleven values are therefore mirrored in
`lib/domain/policy.ts` from `property.PolicyType`.

That is acceptable only because the values are frozen by a database CHECK — adding one is an owner
decision (OQ-110) — and a test pins the exact list *and* asserts the four deliberately-absent types
never appear, so drift fails in CI rather than in front of a Partner. Recorded as **OQ-144** in case
the owner would rather expose a catalogue endpoint.

## 4. Policy list

All eleven types are listed whether or not a version exists, because *"this property has no
cancellation policy"* is the fact a Partner most needs to see. A configured row shows status, timing,
`Bản N · từ YYYY-MM-DD`, and a per-locale badge (`VI đã có` / `EN chưa có`) — the same condition the
backend counts before it will activate.

**Nothing is prefilled.** No cancellation window, child age, pet fee, deposit or percentage appears
anywhere: `property_policy` has no numeric columns and doc 51 A4/A5/B11/B12 record those as unresolved
business inputs. A test greps the rendered output for `\d+\s*(giờ|ngày|%|tuổi|VND)` and for
`miễn phí|phụ thu|đặt cọc|hoàn tiền` and requires zero matches.

## 5. Policy authoring

Creating a draft posts `{ type, effectiveFrom: today }`. Editing opens a **drawer** with one textarea
per locale and one save per locale — because the backend takes a single `locale` per request.

**`summary` is not offered.** The API accepts it and never reads it back (`findTranslations` selects
`body` alone), so an input for it would show an empty box while a value was stored. Omitting it is the
honest choice; **OQ-143** records the read gap. A test asserts `summary` is never sent.

## 6. Lifecycle

Only transitions `PolicyStatus.canTransitionTo` accepts are offered — `DRAFT → ACTIVE|ARCHIVED`,
`ACTIVE → PAUSED|ARCHIVED`, `PAUSED → ACTIVE|ARCHIVED`, and **nothing** from `ARCHIVED`. Offering more
would be offering a 409.

An archived policy explains why it is kept rather than showing a dead control: a version may be pinned
by a reservation's `terms_version`. There is no DELETE anywhere.

**A real accessibility defect was found and fixed while testing.** The activate control was labelled
*"Đang áp dụng"* — the same accessible name as the status filter of that name, so two unrelated
controls collided. Transition controls are now **verbs** (`Áp dụng chính sách`, `Tạm ngưng`, `Lưu
trữ`), and a test asserts each name resolves to exactly one control.

## 7. Effective-date behaviour

`policyTiming()` derives `current` / `scheduled` / `inactive` from the two fields the API returns.
The one that matters is **`scheduled`**: an `ACTIVE` version dated in the future is *not* currently
applying, and calling it "current" would be wrong. Pinned by a test.

`newestByType()` picks which version a card summarises using the backend's own comparison
(`effective_from DESC, version DESC`). It decides nothing else — the backend resolves the current
policy and gates visibility, and a second resolver here would eventually disagree.

## 8. Publication safety

Untouched and stated rather than assumed. The drawer says publication requires the property public,
the policy applying **and** the effective date reached — so "ACTIVE" is never presented as "visible".
A test asserts that sentence renders.

## 9. Scope / isolation

The property is resolved first, so a foreign or absent id renders the same not-found page as every
other property screen. Verified live: `/policies` on a bogus property id shows *"Không tìm thấy khách
sạn"* with **no permission wording and no id echoed**. The API answers **404** for the same request.
The frontend never treats a `propertyId` in the URL as proof of ownership.

## 10. UX

A compact extranet list, not a CMS: one row per type, editing in a drawer. Reuses `Card`, `Badge`,
`Button`, `Drawer`, `Textarea`, `EmptyState` and the existing tokens — no second component system and
no new state library.

The empty state is deliberate: *"Chưa có chính sách nào được thiết lập"* plus why policies matter and
what to do next. It carries no `role="alert"`.

## 11. Responsive evidence — measured

| Width | Overflow | Rows | Tabs | Sidebar | Targets < 44px |
| --- | --- | --- | --- | --- | --- |
| **375** (coarse) | **none** (375/375) | 11 | scrolls inside itself | drawer | **none** |
| **768** | **none** (753/753) | 11 | scrolls inside itself | drawer | n/a |
| **1024** | **none** (1009/1009) | 11 | fits | **static column** | n/a |
| **1440** | **none** (1425/1425) | 11 | fits | static | n/a |

Rows collapse to one column below 768px. The tab strip now holds four enabled tabs and still scrolls
in its own container, so the page body never scrolls sideways.

## 12. Accessibility

Labels wired to both textareas; status carried as text plus tint plus `data-policy-status`; filters
are a labelled `role="group"` with `aria-pressed`; the drawer is the Step-4 primitive with
`aria-modal`, Escape, a focus trap and focus return; the empty state is not an alert; errors use
`role="alert"`. The duplicate-accessible-name defect in §6 was found here and fixed in the product.

## 13. Tests

**Frontend 230** (+25). Domain: the eleven frozen types and the four absent ones, the four statuses
and every transition, `PAUSED` reversible vs `ARCHIVED` retained, future-dated `ACTIVE` never
"current", the both-locale gate, newest-version selection. Component: all eleven listed when none is
configured, the empty state, **no invented commercial values**, per-locale badges, raw status
preserved, create through the real API, filtering, both-locale editing with `summary` never sent,
activation blocked and explained, only-legal transitions, archived explained, the publication ladder
stated, 409, the backend's own 400 message, unreachable backend without leaking the host, and empty
web storage.

One existing test updated — the property tab assertion now expects four enabled tabs, because *Chính
sách* became real. It still asserts exactly which are links and which are disabled. No test weakened.

**Backend: no new tests, because no backend code changed.** The 390 existing tests — including the
policy suite from Phase 7.5D and `TaxIsOutOfScopeForV1Test` — all pass untouched.

## 14. Database / Flyway

**No migration**, and none was considered: every field the UI uses already existed. Flyway **v23, 25
migrations validated**. Database after the run: 8 properties, **0 policies**, 0 policy translations —
no pollution, and no sample policy was ever created.

## 15. Security

`localStorage` · `sessionStorage` · `indexedDB` · `Authorization` · `console.*` · `fetch` outside
`lib/api` · hardcoded UUIDs: **all zero** in product code. Live: `document.cookie` is only
`XSRF-TOKEN`; both storages empty. No CORS, `SameSite` or CSRF change. Mutations carry
`X-XSRF-TOKEN` via `lib/api`.

**Tax: zero references.** An earlier scan reported 15 — all were the substring `VAT` inside
`activation`. `TaxIsOutOfScopeForV1Test` is present and untouched.

## 16. Files changed

**Frontend, all new:** `lib/domain/policy.ts` · `lib/api/endpoints/policies.ts` ·
`features/policy/{load,server,actions,PolicyManager,Policy.module.css,policy.test}` ·
`app/partner/(protected)/properties/[propertyId]/policies/page.tsx`.
**Modified:** `lib/api/endpoints/index.ts` · `features/property/tabs.ts` (Chính sách enabled) ·
`features/property/property.test.tsx` (tab assertion).
**Backend:** none. **Docs:** this file; `00-README.md`.

## 17. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-143** | policy `summary` is writable and never readable, so no screen can show or clear one | **new** |
| **OQ-144** | no policy-type catalogue endpoint, so the eleven values are mirrored in the frontend against a frozen CHECK | **new** |
| OQ-111 | doc 58 §8 has no policies row — the routes await an amendment | open (doc 96) |
| OQ-113 | both-locale activation gate — **confirmed live in the backend**, so the UI reflects rather than invents it | open, now evidenced |
| OQ-114 | no `policy.manage`; `property.manage` is used | open (doc 96) |
| OQ-110 · OQ-112 | four absent policy types · `effective_from` timezone | open (doc 96) |
| OQ-106 · OQ-141 · OQ-142 | media storage, owner-link listing, renderable media view | open (doc 105) |

## 18. Known limitations

- `effectiveFrom` is fixed to today on create; scheduling a future version needs a date input, which
  is a small addition once someone needs it. The API already accepts any date.
- Only the newest version per type is summarised on the list. Every version is returned by the API and
  none is hidden by the backend; a version history view is a later addition.
- No optimistic locking on policies, because the backend has none. Two editors saving the same policy
  is last-write-wins **at the translation level** — worth an owner decision if policy authoring
  becomes concurrent.

## 19. Recommendation for the next step

> **Property submission & review** — the workflow that turns everything authored so far into a live
> property.

Phase 7.5A implemented submit, admin review, approve/reject/request-changes and the completeness
invariant, with 208 tests. The Partner overview already shows the completeness sections, and the
Partner now has the means to fill three of the five: name and address (Step 6), room types (Step 8)
and policies (this step). Hero image and signature experiences remain blocked on media (OQ-106) and on
an experiences API — so submission would surface exactly which blockers remain, which is useful in
itself.
