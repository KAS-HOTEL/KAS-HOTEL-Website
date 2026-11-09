# Phase 7.5F — Step 5.1: Partner Dev Account, Browser E2E & OQ-132

**Date:** 2026-08-19
**Status:** ✅ COMPLETE — OQ-134 and OQ-132 both resolved; the Partner property flow is now proven
end to end in a real browser against the real backend and the real database.

**Gates:** frontend typecheck · lint · **132 tests** · production build · **0 npm vulnerabilities** ·
backend **355 tests** (146 unit + 209 integration) `BUILD SUCCESS` · Flyway **v23, 25 migrations
validated, no new migration** · `git diff --check` clean · secret scan clean.

---

## 1. OQ-134 resolved — one Partner development account

Step 5 could not be exercised end to end because `kas_web_dev` held **0 users**. It now holds
exactly one.

| | |
| --- | --- |
| Email | `partner.dev@kas.invalid` — `.invalid` is reserved by RFC 2606, so it can never resolve or receive mail |
| Role | **ADMIN** (not SUPER_ADMIN) |
| Scope | **PARTNER**, over the single partner already in the database — looked up, never named |
| Status | `ACTIVE`, `two_factor_enabled = false`, locale `vi` |
| Credential | Argon2id, produced by the application's own `PasswordEncoder` bean, stored `{argon2}`-prefixed |

### 1.1 How it is provisioned

`backend/src/test/java/com/kas/platform/devsetup/DevPartnerAccountProvisioning.java`.

**Test scope, so it can never ship.** Nothing capable of creating an administrative account belongs
in the production artefact; test sources are not packaged, cannot be reached by a running server, and
cannot be triggered by a request.

It is deliberately **not a Flyway migration**. A migration would push one developer's login into
every environment that ever runs the schema — that is how a shared credential reaches production.

**Two independent locks.** The file name matches neither the Surefire nor the Failsafe include
pattern, so `mvn test` and `mvn verify` never run it; and it refuses to run unless
`KAS_DEV_PARTNER_PASSWORD` is set. Both must hold at once:

```bash
KAS_DEV_PARTNER_PASSWORD='…' ./mvnw test -Dtest=DevPartnerAccountProvisioning -DfailIfNoSpecifiedTests=false
```

The password is read from the environment, never written to a file, a log, this document or the
source. The class prints identifiers only. It is idempotent — re-running re-hashes the same email
rather than creating a second account — and it stops rather than guessing if more than one partner
ever exists.

### 1.2 How it is removed

```sql
DELETE FROM kas.app_user WHERE email = 'partner.dev@kas.invalid';
```

`role_assignment` and `user_session` both cascade, so that one statement removes the account and every
session it opened.

### 1.3 Where the credential lives

Generated at provisioning time, held outside the repository, and never committed. Verified: neither
the password nor the signing secret appears anywhere under `backend/src`, `frontend/src` or `docs`.

### 1.4 A second environment secret was required

The first browser login failed with **`Required configuration 'kas.security.signing-secret' has not
been supplied`**. That is correct behaviour — `AuthenticationProperties` refuses to default an HMAC
key — but it is an environment variable, not a business value, so a local one was generated:

```bash
export KAS_JWT_SIGNING_SECRET='…'   # ≥32 bytes, local only, never committed
```

> **OQ-135 (new, low severity).** That message reached an **unauthenticated** login page verbatim.
> It carries no secret, but it names an internal configuration key to anyone who can reach `/login`.
> `CONFIG_MISSING` is an operator-facing 422 and the frontend renders 422 text as-is by design (doc 58
> §2.1). The owner decision needed: does the login endpoint return a generic "service unavailable"
> for misconfiguration, or does the sign-in form stop echoing 422 text?

---

## 2. OQ-132 resolved — the admin read now returns what the admin write accepts

### 2.1 The gap

`CreatePropertyRequest` accepted a `name` and wrote it to both locales.
`UpdatePropertyRequest` accepted `district`, `ward`, `city` and `phone`.
Both on the frozen doc 58 §8 route. **`GET` returned none of them.**

An extranet could write a hotel's address and had no way to read it back, and the property list could
identify a hotel only by its slug.

### 2.2 The decision

**Expose exactly the identity, location and contact fields the frozen write contract already
accepts.** Nothing invented, no column added, no second endpoint, no migration.

| Field added | Why it is allowed | Source of truth |
| --- | --- | --- |
| `names` (map, locale → name) | `CreatePropertyRequest.name` already writes it, to both locales | `property_translation.name` |
| `district` | `UpdatePropertyRequest.district` already writes it | `property.district` |
| `ward` | `UpdatePropertyRequest.ward` already writes it | `property.ward` |
| `city` | `UpdatePropertyRequest.city` already writes it | `property.city` (`NOT NULL`) |
| `phone` | `UpdatePropertyRequest.phone` already writes it; the hotel's own number, not a person's | `property.phone` |

None appears on the doc 58 §9 denylist. `PropertyAdminView` lives in
`com.kas.platform.onboarding.api`, a package `PublicResponseDenylistTest` scans, so it is held to the
**public** standard even though it is an admin response — and that test still passes.

### 2.3 Deliberately NOT exposed

| Field | Why not |
| --- | --- |
| `partnerId` | doc 58 §9 PARTNER group; and an admin only sees properties their scope already reaches, so the owner is implied |
| `starRating`, `openedYear`, `totalRooms`, `latitude`, `longitude`, `email`, `zalo`, `checkInTime`, `checkOutTime`, `collection`, `country` | columns exist, but **no endpoint writes them**. A read-only field nobody can set reads as a gap in the product rather than a gap in the API — and `totalRooms` in particular would look like an authoritative room count that nothing maintains |
| `version` | belongs with the update contract (doc 58 §2 `If-Match`); nothing reads or writes it yet |
| `createdAt`, `updatedAt`, `publishedAt`, `archivedAt` | not needed to identify a hotel; no screen asks for them |

### 2.4 Final DTO

```jsonc
{
  "id": "uuid",
  "slug": "kas-passion-boutique-hotel",
  "names": { "en": "Kas Passion Boutique Hotel", "vi": "Kas Passion Boutique Hotel" },
  "lifecycleState": "DRAFT|COMING_SOON|OPEN|TEMPORARILY_CLOSED|CLOSED",
  "isFlagship": false,
  "district": "Quận 1",            // omitted entirely when unset (non_null inclusion)
  "ward": "Phường Bến Nghé",       // omitted entirely when unset
  "city": "Ho Chi Minh City",      // NOT NULL — always present
  "phone": "+84 28 3822 0033",     // omitted entirely when unset
  "sortOrder": 1
}
```

`names` is **always present**, possibly `{}`. An empty object says "no name has been written"; an
absent key would be indistinguishable from a field the caller forgot to request.

### 2.5 Localization

Both locales are returned, never resolved server-side. Doc 25 freezes `vi` and `en`, and this is an
**authoring** surface: "the English name is missing" is precisely the fact a Partner needs to see, and
`PropertyCompletenessChecker` blocks submission on it. A single resolved string cannot express it.

The frontend resolves for compact surfaces only — `displayName()` prefers `vi` (the console's own copy
is Vietnamese), falls back to `en`, then to any other locale, then returns **`null`**. It never
manufactures a name from the slug, and the detail page lists every locale explicitly so the
preference decides only what a row shows, never what the operator can find out.

### 2.6 No migration

Confirmed on startup: *"Successfully validated 25 migrations"*, *"Current version of schema kas: 23"*,
*"Schema kas is up to date. No migration necessary."* Every field added was already a column or an
existing table.

### 2.7 Implementation

- `Property` gained `district`, `ward`, `city`, `phone` (the name cannot be a scalar — it is per-locale).
- `PropertyRepository.COLUMNS` selects them; `findNames(Collection<UUID>, AuthorizationScope)` is new —
  **batched**, because a per-property lookup behind a list endpoint is an N+1 waiting to happen, and
  **scope-filtered again** rather than trusting its argument list.
- `PropertyAdminView` maps them explicitly (doc 58 §9 layer 3 — never a spread).
- `PartnerPropertyController` does one batch lookup for the list, one for each single-property response.

---

## 3. Route flow

```
browser (localhost:3000)
  └─ Next.js Server Component
       └─ propertyList() / propertyDetail()        ← React cache(), one call per render pass
            └─ loadPropertyList / loadPropertyDetail
                 └─ lib/api/endpoints/properties.ts
                      └─ lib/api/client.ts          ← the only fetch in the app
                           └─ Cookie: kas_access    ← forwarded explicitly; a server has no browser
                                └─ localhost:8080/api/v1/admin/properties
                                     └─ @PreAuthorize('property.manage')
                                          └─ PropertyRepository + ScopeFilter → SQL WHERE
                                               └─ PostgreSQL kas_web_dev
```

In the browser: `/partner` → `/partner/properties` → `/partner/properties/{propertyId}`. The URL is
the only property context — no stored preference, no "active property" call.

---

## 4. Browser E2E evidence

Real Chromium, real servers, real database. Every row observed in the browser.

| # | Check | Result |
| --- | --- | --- |
| 1–2 | `/partner` anonymous | **307 → `/partner/login?returnTo=%2Fpartner`** |
| 3–4 | Sign in with the dev account | reaches **`/partner`**, `h1` "Tổng quan" |
| 5 | Landing page count | *"Bạn đang quản lý 8 khách sạn."* — from the backend, not a constant |
| 6 | `/partner/properties` | **8 rows**, the real DRAFT seed records |
| 7 | Names | real `property_translation` values, e.g. *Kas Passion Boutique Hotel*, with the slug beneath |
| 8 | PropertySwitcher | all **8 real names** in the `<select>` |
| 9–10 | Select *Kas Dilly Hotel* | navigates to `/partner/properties/cbd977e4-…` |
| 11 | Detail page | renders the real record |
| 12 | Localized name | both locales listed: *Tiếng Việt (vi)* and *English (en)* |
| 13 | Location / contact | `Ho Chi Minh City`; ward, district and phone shown as **"Chưa đặt"** — genuinely unset, no longer "the API does not return this" |
| 14 | Lifecycle | **"Bản nháp (DRAFT)"** — translation and raw value together |
| 15 | Flagship | badge on *Kas Milestone Premium Hotel* only, matching the database |
| 16 | Completeness | 5 backend sections with real missing fields; *Basic information* correctly no longer lists the name |
| 17 | Loading | the streamed fallback renders skeletons and *"Đang tải khách sạn…"* — no placeholder hotel names |
| 18 | Error | backend stopped → *"Hệ thống tạm thời không phản hồi"*; **no** SQL, stack trace, Java class or `ECONNREFUSED` |
| 19 | `/partner/properties/not-a-uuid` | not-found page |
| 20 | `/partner/properties/99999999-…` (absent) | **byte-identical** not-found page |
| 21 | Permission wording | none — regex over the rendered text for `quyền\|permission\|forbidden\|403` returns nothing, and the id is not echoed back |
| 22 | `partnerId` in the UI | absent; the partner UUID appears nowhere in the DOM |
| 23 | Tokens in UI state | none; `document.cookie` is **only** `XSRF-TOKEN` — the session cookies are `HttpOnly` |
| 24 | Web storage | `localStorage.length === 0`, `sessionStorage.length === 0`, before and after switching property |
| 25 | CSRF | login without `X-XSRF-TOKEN` → **403** |
| 26 | Same-origin proxy | `Origin: https://evil.example` → **no `Access-Control-*` headers at all** |

Also observed: **zero client-side API requests**. Every fetch happens in a Server Component, so the
browser never talks to `/api/v1/admin/**` directly.

### 4.1 Cross-partner isolation — how it is proven

The dev database has one partner, and §10 of the brief permits no second one, so a genuine
cross-partner id could not be typed into the browser. The property is established in three parts
instead, which together are stronger than a single click:

1. **Backend, real DB, real login** — `PropertyAdminViewIT.crossPartnerStillReturns404` seeds two
   partners, authenticates as A, requests B's property and asserts **404 `NOT_FOUND`** *and* that B's
   hotel name is absent from the response body (it now has a name to leak, which is why this test was
   added with the field).
2. **Frontend, unit** — `loadPropertyDetail` maps *every* 404 to the same `notFound`, asserted with
   `toEqual` between the absent case and the other-partner case.
3. **Frontend, browser** — the malformed-id and absent-id pages above are byte-identical, and the
   not-found page is tested for the specific leaks it must never produce.

At SQL level the two cases are the same code path: `ScopeFilter` puts `p.partner_id = :scope` in the
same statement as the identity predicate, so a foreign id simply does not match a row.

---

## 5. Responsive measurements

Measured in the browser with `getBoundingClientRect`, not inferred from CSS.

| Width | Pointer | Horizontal overflow | Sidebar | Nav toggle | Switcher | Detail grid | Targets < 44px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **375** | coarse | **none** (375/375) | fixed drawer, off-screen at `-240` | 44px | 44px | 1 column | **none** |
| **768** | fine | **none** (753/753) | fixed drawer | 34px | 34px | 2 columns | n/a (mouse) |
| **1024** | fine | **none** (1009/1009) | **static, 240px** | hidden | 34px | 2 columns | n/a |
| **1440** | fine | **none** (1440/1440) | static | hidden | 34px | 2 columns | n/a |

The table scrolls **inside its own container** at 375px (`tableScrollsInside: true`) and not at all
from 768px up; the page body never scrolls sideways. The 36-character UUID fits its `<dd>` at every
width — `overflow-wrap: anywhere` doing its job.

Keyboard order at 1280px: **skip link → nav toggle → property switcher → sign out → sidebar links →
page content**, with `#main` present as the skip target.

### 5.1 Three real touch-target defects, found and fixed

Only visible now that an authenticated shell could finally be loaded:

| Element | Was | Now |
| --- | --- | --- |
| Nav toggle (`AppShell.module.css`) | hardcoded **36×36px** | `var(--density-control-height)` → 34px mouse, **44px touch** |
| Sidebar links | `min-height: 40px` | `max(40px, var(--density-control-height))` — keeps the comfortable 40px on desktop, reaches 44px on touch |
| Breadcrumb links | **22px** | `min-height` under `@media (pointer: coarse)` — a breadcrumb is a navigation control, so the WCAG 2.5.8 inline-text exemption does not cover it |

After the fix, the 375px sweep reports `belowMinimum: []` on both the list and the detail page.

> One measurement trap worth recording: resizing the viewport **without reloading** left the previous
> media-query results in place, and the first 375px reading showed 34px controls that were actually
> 44px. The browser tool's own guidance says to reload after switching device emulation; the numbers
> above are all post-reload.

### 5.2 A harness artifact, not a product defect

In this environment the Browser pane never composites (`requestAnimationFrame` never fires — proven by
a 30-second timeout). React's streamed Suspense reveal is therefore starved, so the detail page
sometimes kept showing `loading.tsx` with the resolved content present but `hidden`, and briefly had
two `h1`s in the DOM.

Established as environmental, not a bug: the server response contains the complete correct content
plus the `$RC("B:0","S:0")` reveal script (verified with `curl`), the same mechanism revealed
correctly on the list page and on the detail page at 1440px, and there were no console errors. Where
the reveal was starved, it was performed manually so layout could be measured — the markup and CSS
measured are the real ones.

---

## 6. Security evidence

| Rule | Evidence |
| --- | --- |
| PARTNER is a scope, not a role | the account is `role = ADMIN`, `scope_kind = PARTNER`; no new role exists |
| No frontend authorization | no permission or role is read anywhere in the client; the guard only asks "did the backend answer?" |
| Cross-partner = 404 | §4.1 above |
| No `partnerId` in responses | absent from `PropertyAdminView`; asserted in `PropertyAdminViewIT` on both list and detail, and in the DOM |
| No tokens in UI state | login returns `204` with an empty body — there is nothing to store |
| No web storage | source guard + browser assertion, both empty |
| No `fetch` outside `lib/api` | ESLint rule and `guards.test.ts` |
| No CORS | no `Access-Control-*` header even with a hostile `Origin` |
| No `SameSite` change | untouched |
| No CSRF weakening | login without the header → 403 |
| No hardcoded eight | `guards.test.ts` rejects any `kas-…-hotel` slug and any property count compared against ≥ 2 |
| Secret scan | the only match is the pre-existing, self-labelled `test-only-signing-key-not-a-secret-…` |
| `git diff --check` | clean |

---

## 7. Tests

| Suite | Count | Change |
| --- | --- | --- |
| Frontend | **132** | +14 (localization, address formatting, identity rendering, per-locale detail) |
| Backend unit | 146 | unchanged |
| Backend integration | **209** | +10 (`PropertyAdminViewIT`) |
| **Backend total** | **355** | was 345 |

`PropertyAdminViewIT` is a **round-trip** test: everything asserted on the response was put there
through the API itself — `POST` for the name, `PATCH` for the address — not through fixture SQL. That
is what makes it a symmetry test rather than a projection test that happens to pass. It also covers
per-locale names, a single-locale property, an empty name map, `non_null` omission, `partnerId`
absence, cross-partner 404 with no name leak, repository-level scope on the batch name lookup, and the
empty-id-list case that would otherwise emit `IN ()`.

No existing test was weakened. `PublicResponseDenylistTest` still passes with the enriched DTO.

---

## 8. Database & Flyway

| | Before | After |
| --- | --- | --- |
| Flyway | v23, 25 migrations | **v23, 25 migrations, validated on startup** |
| `app_user` | 0 | **1** (the dev account) |
| `role_assignment` | 0 | **1** (ADMIN / PARTNER) |
| `partner` | 1 | 1 |
| `property` | 8, all DRAFT | **8, all DRAFT** — not renamed, not opened |
| `room_type`, `rate_rule`, `room_type_inventory_day`, `media_asset`, `property_policy`, `reservation` | 0 | **0** |

The account and its assignment are the only new rows anywhere.

---

## 9. Files changed

**Backend (4 modified, 2 added)**
`property/Property.java` · `property/PropertyRepository.java` · `onboarding/api/PropertyAdminView.java` ·
`onboarding/api/PartnerPropertyController.java` · **+** `test/.../devsetup/DevPartnerAccountProvisioning.java` ·
**+** `test/.../security/it/PropertyAdminViewIT.java`

**Frontend (9 modified, 1 added)**
`lib/domain/property.ts` (+ test) · `features/property/PropertyTable.tsx` · `PropertyDetailView.tsx` ·
`Property.module.css` · `property.test.tsx` · `load.test.ts` · `features/shell/AppShell.module.css` ·
`ui/primitives/Display.module.css` · `app/partner/(protected)/layout.tsx` · **+** `features/property/address.ts`

**Docs** — this file; `00-README.md` updated.

---

## 10. Remaining open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-132** | admin read exposes no identity | ✅ **RESOLVED** — §2 |
| **OQ-134** | no dev Partner account | ✅ **RESOLVED** — §1 |
| **OQ-133** | `CompletenessResult` section and field names are English-only, and are also what a refused submit puts in `details[]`. Bilingual labels belong in the backend, not a frontend lookup | open |
| **OQ-135** | a `CONFIG_MISSING` message reached an unauthenticated login page verbatim (§1.4) | **new**, low severity |
| carried | OQ-106 media upload · OQ-122 search · OQ-123 quote · booking API · `/me` profile · SUPER_ADMIN 2FA | open |

---

## 11. Recommended Step 6

> **Partner property information — the first write.** Turn the read-only overview into an editor for
> exactly the fields `PATCH /api/v1/admin/properties/{id}` and the name endpoints already accept:
> name per locale, district, ward, city, phone.

Why this one:

- Step 5.1 made every one of those fields readable; the round trip is now half-built, and the write
  side is already implemented, tested and scope-enforced.
- It is the first screen that **changes** data, so it is where the mutation patterns get established:
  CSRF on a real form, `422` field errors rendered against `ApiError.fieldErrors()`, optimistic-lock
  handling, and the `version` / `If-Match` question deferred in §2.3.
- It moves the eight DRAFT properties toward completeness, which every later step depends on —
  `PropertyCompletenessChecker` currently blocks submission on `shortDescription`, `signatureLine`,
  `district`, `ward`, room types, a hero image and a signature experience.
- It needs no new backend endpoint.

The one decision it forces: `UpdatePropertyRequest` takes no `version`, so the doc 58 §2 optimistic
lock is not currently reachable from the API. Either the request grows a `version`, or concurrent
partner edits silently last-write-wins — an owner decision, and the right moment to make it.
