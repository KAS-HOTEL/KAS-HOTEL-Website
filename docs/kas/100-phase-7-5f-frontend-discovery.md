# 100 — Phase 7.5F Step 1: Frontend Discovery

**Date:** 2026-08-18 · **Status:** 📋 **DISCOVERY ONLY — no frontend code written**
**Backend checkpoint:** 345 tests · Flyway v23 · V1–V23 byte-identical · no V24

---

## 1. Existing frontend state

**There is no frontend.** The repository is `backend/` and `docs/` only — no `package.json`,
no `next.config.*`, no `tsconfig.json`, anywhere.

`.gitignore` already anticipates one: `node_modules/`, `.next/`, `dist/`, `build/`,
`*.tsbuildinfo` are ignored. So the ignore rules are in place and nothing needs changing there.

**Nothing is being replaced or migrated.** This is a greenfield frontend against a finished backend.

---

## 2. Frontend framework decision — already frozen

No decision to make. Doc 12 §1 and the README's confirmed-decisions table both state it:

| | |
| --- | --- |
| Framework | **Next.js (App Router)** |
| Language | **TypeScript** |
| UI | **React** |

Doc 12 §170 also settles the app-count question: *"The admin console lives in the **same Next.js
application** under `/admin`, sharing the …"* — **one application, separate route groups**, not
three deployments.

---

## 3. Backend API inventory

Extracted from the controllers themselves, not from class names. **43 endpoints across 14
controllers.**

### 3.1 Public — no authentication (`/api/v1/public/**`)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/public/auth/login` | sets `kas_access` + `kas_refresh` cookies |
| POST | `/public/auth/refresh` | rotating refresh |
| POST | `/public/auth/logout` | authenticated |
| GET | `/public/properties` | published list |
| GET | `/public/properties/{slug}` | detail |
| GET | `/public/properties/{slug}/room-types` | published room types |
| GET | `/public/properties/{slug}/gallery` | property gallery |
| GET | `/public/properties/{slug}/room-types/{rtSlug}/gallery` | room gallery |
| GET | `/public/properties/{slug}/policies` | `?locale=` |
| GET | `/public/availability/properties/{slug}` | `?checkIn&checkOut&locale` |

### 3.2 Authenticated customer (`/api/v1/me/**`)

| Method | Path |
| --- | --- |
| GET · DELETE | `/me/sessions` · `/me/sessions/{id}` |

**That is the entire `/me` surface.** No profile, no stays, no preferences.

### 3.3 Staff (`/api/v1/admin/**`) — permission in the right-hand column

| Method | Path | Permission |
| --- | --- | --- |
| GET · POST | `/admin/properties` | `property.manage` |
| GET · PATCH | `/admin/properties/{id}` | `property.manage` |
| GET | `/admin/properties/{id}/completeness` | `property.manage` |
| POST | `/admin/properties/{id}/submit` | `property.manage` |
| GET | `/admin/properties/{id}/submissions` | `property.manage` |
| GET | `/admin/property-submissions` · `/{id}` | `property.manage` |
| POST | `/admin/property-submissions/{id}/approve` · `/reject` · `/request-changes` | `property.manage` |
| GET · POST | `/admin/properties/{id}/room-types` | `roomtype.manage` |
| GET · PATCH | `/admin/properties/{id}/room-types/{rtId}` | `roomtype.manage` |
| PATCH | `…/room-types/{rtId}/amenities` · `/status` | `roomtype.manage` |
| GET · POST | `/admin/properties/{id}/policies` | `property.manage` |
| GET | `/admin/properties/{id}/policies/{policyId}` | `property.manage` |
| PATCH | `…/policies/{policyId}/translations` · `/status` | `property.manage` |
| GET · POST | `/admin/media` | `media.upload` |
| GET | `/admin/media/{id}` · `/{id}/usages` | `media.upload` |
| PATCH | `/admin/media/{id}/translations` | `media.upload` |
| POST | `/admin/media/{id}/publish` | **`media.publish`** |
| POST · DELETE | `/admin/media/{id}/links` · `/links/{linkId}` | `media.upload` |
| PATCH | `…/links/{linkId}/cover` · `/order` | `media.upload` |
| PATCH | `…/links/{linkId}/status` | **`media.publish`** |
| GET | `/admin/ops/inventory` | `inventory.view` |
| PATCH | `/admin/ops/inventory/{rtId}/{date}` | `inventory.adjust` |
| POST | `/admin/ops/inventory/bulk/preview` · `/bulk` | `inventory.adjust` |
| GET | `/admin/ops/distribution/buffer-rules` | `inventory.view` |
| PUT | `/admin/ops/distribution/buffer-rules` | `inventory.adjust` |
| PATCH | `…/buffer-rules/{id}/status` | `inventory.adjust` |
| POST | `…/buffer-rules/materialise` | `inventory.adjust` |
| GET | `/admin/rates/grid` | **`rate.view`** |
| POST | `/admin/rates/bulk-preview` · `/bulk-apply` | `rate.manage` |
| GET | `/admin/rate-rules` | `rate.view` |
| POST | `/admin/rate-rules` | `rate.manage` |
| PATCH | `/admin/rate-rules/{id}` · `/{id}/status` | `rate.manage` |

### 3.4 The single most important structural fact

**There is no `/api/v1/partner/**` tree, and there is no `PARTNER` role.**

Every endpoint the owner listed under "Partner Portal" is at `/api/v1/admin/**`. Doc 59 §2 and doc 85
§5.1 are explicit: **`PARTNER` is a scope kind, not a role.** The V1 KAS operator authenticates as
`ADMIN` and carries `scope_kind = PARTNER`, which resolves to that partner's properties.

So an Admin Portal and a Partner Portal in V1 are **two presentations over one API**, distinguished by
what the session's scope resolves to — not two API surfaces. See §10.1, because this has a
consequence the owner needs to decide on.

### 3.5 Error contract

```jsonc
{ "code": "NOT_FOUND", "message": "…", "details": [ { "field", "code", "message" } ],
  "correlationId": "…" }
```

Codes (frozen, doc 58 §2.1): `VALIDATION_FAILED` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 ·
`NOT_FOUND` 404 · `VERSION_CONFLICT` / `DUPLICATE_REFERENCE` / `ILLEGAL_TRANSITION` /
`ACCOUNT_ALREADY_EXISTS` 409 ·
`PROPERTY_CLOSED` 410 · `NO_AVAILABILITY` / `OCCUPANCY_EXCEEDED` / `HORIZON_EXCEEDED` /
`CONFIG_MISSING` 422 · `RATE_LIMITED` 429 · `INTERNAL_ERROR` 500 · `AVAILABILITY_UNAVAILABLE` 503.

Every response carries `X-Correlation-Id`.

### 3.6 Pagination and concurrency

- **No pagination exists anywhere.** No `Pageable`, no `page`/`size` parameters. Every list returns a
  full array. Fine at V1 scale (8 properties, ~15 room types each); the client must not assume a
  page envelope that does not exist.
- **Optimistic concurrency:** `VERSION_CONFLICT` (409) is in the error contract, and `property` and
  `room_type` carry `version` columns. The frontend must handle 409 on those edits (Step 10).

---

## 4. Authentication integration plan

The session model is already decided and must be respected exactly.

| Fact | Value | Consequence for the frontend |
| --- | --- | --- |
| Transport | `HttpOnly` cookies `kas_access`, `kas_refresh` | **JavaScript cannot read the token.** No `localStorage`, no `Authorization` header. Doc 59 §8 forbids it |
| `SameSite` | `Lax` | Cross-site cookie sending is restricted |
| Refresh cookie path | `/api/v1/public/auth` | The refresh cookie is only sent to that path — refresh must call exactly it |
| CSRF | `CookieCsrfTokenRepository.withHttpOnlyFalse()` | Client **must** read the `XSRF-TOKEN` cookie and send it back as `X-XSRF-TOKEN` on every mutating request |
| CORS | **not configured at all** | See below — this is an architectural constraint, not an oversight to work around |

### 4.1 Same-origin is mandatory

With no CORS configuration and `SameSite=Lax` `HttpOnly` cookies, the browser will not send the
session to a different origin. The frontend must therefore be **same-origin with the API**, via Next.js
`rewrites()` proxying `/api/v1/**` to the Spring Boot origin in development and a shared origin in
production.

The alternative — adding CORS and relaxing `SameSite` — would weaken a deliberate backend security
decision to make the frontend simpler, which critical rule 14 forbids. Recommending the proxy.

### 4.2 Session handling

- Auth state is derived from **calling the API**, never from reading a cookie — the client cannot read
  `HttpOnly` cookies. `GET /me/sessions` returning 200 is the "am I signed in?" probe available today.
- A single API client interceptor: on `401`, attempt `POST /public/auth/refresh` once, then retry; if
  refresh also fails, clear client state and route to sign-in.
- **401 ≠ 403 ≠ 404** and each gets distinct UI (§ Step 20). 404 on a cross-partner resource is
  correct and must be shown as "not found", never as "forbidden" — surfacing it as 403 would leak the
  existence the backend deliberately hides.

---

## 5. Admin route map

Doc 22 §8, frozen: all under `/admin/**`, **no locale prefix**, `noindex`, objects addressed by
internal ID.

```
/admin
  /login
  /                          dashboard
  /properties                list (scope-wide)
  /properties/{id}           overview
  /properties/{id}/completeness
  /review                    submission queue        → /admin/property-submissions
  /review/{submissionId}     inspect · approve · reject · request changes
  /media                     library
  /ops/inventory             calendar
  /ops/distribution/buffer-rules
  /rates/grid                rate calendar
  /rates/rules               rate rules
  /account
```

**Marked future/disabled, not built as fake screens** (no backend): users & roles, settings, audit,
vouchers, reservations/operations, sales, analytics.

---

## 6. Partner route map

**Not in the frozen IA** — see §10.1. Proposed, pending owner confirmation:

```
/partner
  /login
  /                                    dashboard
  /properties                          my properties (N, never hardcoded)
  /properties/{id}                     overview
  /properties/{id}/information
  /properties/{id}/rooms               · /rooms/{roomTypeId}
  /properties/{id}/media
  /properties/{id}/policies
  /properties/{id}/inventory
  /properties/{id}/rates               rate calendar
  /properties/{id}/rates/bulk          bulk editor
  /properties/{id}/submission          submission / review status
  /account
```

A **property switcher** in the shell, loaded from `GET /admin/properties` — which already returns
exactly the properties in the session's scope. No property name or count is ever hardcoded.

---

## 7. Customer route map

Doc 22 §3 is frozen and locale-prefixed. Routes marked ⛔ have **no backend** and must not be built as
working pages:

```
/{locale}                                   home
/{locale}/hotels                            property list        ✅ GET /public/properties
/{locale}/hotels/{property}                 detail               ✅
/{locale}/hotels/{property}/rooms           room types           ✅
/{locale}/hotels/{property}/rooms/{rtSlug}  room detail          ✅ (+ room gallery)
/{locale}/hotels/{property}/gallery         gallery              ✅
/{locale}/search                            search results       ⛔ no portfolio search API
/{locale}/stay                              selection            ⛔ no quote API
/{locale}/stay/details · /review · /sent    booking flow         ⛔ no reservation API
/{locale}/account/**                        trips                ⛔ no /me profile or stays
/{locale}/locations · /offers · /about · /policies/{type}        ⛔ no backend
```

Availability for one property **is** available (`GET /public/availability/properties/{slug}`), so
date-and-guest selection *on a property page* works today. Portfolio-wide search does not.

---

## 8. Shared design system plan

Nothing needs inventing — Phase 6 already froze it across docs 74–84.

| Source | Supplies |
| --- | --- |
| 74 visual foundation · 75 typography · 76 colour · 77 layout/grid | tokens |
| 78 components | the component contract |
| 79 customer screens · 80 admin screens | screen specs |
| 82 responsive & accessibility | breakpoints, a11y rules |
| 83 motion & photography | motion budget, image treatment |

Doc 80 §1 already states the Admin/Customer split precisely: **shared** colour tokens, type family,
radius, shadow, icon set; **different** density, type scale, motion and imagery. Admin is
"8–16px rhythm, 20–60 elements per viewport", text face only, display face used exactly once in the
wordmark, motion limited to state changes.

**Plan:** one token layer → one primitive library → two density themes (`editorial` for customer,
`operational` for admin/partner). Not three component libraries.

---

## 9. API / client architecture

```
src/
  app/                    route groups: (customer) (admin) (partner)
  lib/api/
    client.ts             fetch wrapper: credentials:'include', XSRF header, 401→refresh→retry
    errors.ts             ApiError → typed union (401|403|404|409|422|5xx)
    endpoints/            one module per backend controller
  lib/domain/             TS types mirroring backend DTOs — hand-written, reviewed against Java
  lib/auth/               session probe, sign-in/out, route guards
  features/               property, rooms, media, policies, inventory, rates, availability
  ui/                     design-system primitives (tokens, Button, Table, Calendar…)
```

Rules: no `fetch` in components; every endpoint reached through `lib/api/endpoints`; every DTO typed;
server components for reads where possible, client components only where interaction demands it.

**Typed DTOs will be hand-written and reviewed against the Java records** — there is no OpenAPI
document in the repository. Generating a client is not possible today; adding springdoc is a backend
change I have not made and would ask before making.

---

## 10. Missing backend contracts that genuinely block frontend work

### 10.1 Historical blocker — superseded by owner decision 150

This is the most serious finding and it is a **product decision, not a bug**.

- Doc 85 §5.2: `SUPER_ADMIN` = `GLOBAL` scope (the platform operator); `ADMIN` = `PARTNER` scope.
- At the time of this discovery, `SUPER_ADMIN` authentication was blocked by the then-current 2FA
  policy. Owner decision [150](150-owner-decision-no-2fa.md) later removed the gate; the blocker and
  options below are historical and are no longer open.

**Resolved by doc 150:** the Admin Portal is approved, and `SUPER_ADMIN` uses standard
email/password sign-in. The choices below are retained only as a record of the discovery state.

### 10.2 🔴 Customer booking has no backend

Doc 58 §3.3 defines `POST /public/reservations/requests`; **it is not implemented.** Neither is
`/me/stays`, `/me/profile`, customer registration, or `/track/{token}`. Step 18 anticipates this — the
booking flow can only be a **UX shell with an explicit integration boundary**, and no screen may claim
a booking was created.

### 10.3 🔴 Portfolio search and quote have no backend

`GET /public/availability/search` (**OQ-122**) and `POST /public/availability/quote` (**OQ-123**) are
in doc 58 §3.2 but were deliberately not implemented — doc 58 gives the quote's request body and **no
response shape**, and inventing the guest-facing price commitment is exactly what previous phases
refused to do. `/{locale}/search` therefore has no data source.

### 10.4 🟠 Media has no upload endpoint

Doc 95 §5 deferred `POST /admin/media/upload-url` on **OQ-106** — no storage vendor is chosen.
`POST /admin/media` **registers** an asset the server already has a storage key for. A working
drag-and-drop upload is **not buildable** until OQ-106 is answered.

### 10.5 🟠 Public catalogue endpoints absent

No `/public/amenities`, `/public/locations`, `/public/offers`, `/public/reviews`,
`/public/content/pages/{key}`, `/public/policies/{type}`. Amenity filtering, district pages, offers and
CMS pages have no data source.

### 10.6 🟡 There is nothing to display

All 8 properties are `DRAFT`; there are **0 room types, 0 rates, 0 inventory rows, 0 media, 0
policies**. Bookability requires `OPEN` (doc 03 §8).

**The customer experience cannot be meaningfully demonstrated** without production data — room counts
(**A2**/OQ-010), rates (**B6**) and photography (**B8**) — which must not be fabricated. Partner and
Admin portals *can* be built and exercised, because they are the tools that create that data.

### 10.7 🟡 Partner portal is an IA addition

Doc 22 §8 defines `/admin/**` only. Doc 85 §9 states the opposite of a separate portal: *"the existing
property scope selector **already is** the partner view"*, and *"No partner marketplace UI. No partner
onboarding UI."* The owner now wants a distinct Partner Portal. That is a legitimate product
evolution, but it is an **IA amendment** — recorded as **OQ-129**, not silently invented.

---

## 11. Phase 7.5F implementation plan

Sequenced so every step is exercisable against the real backend when it lands.

| Step | Content | Backend ready? |
| --- | --- | --- |
| 2 | Next.js App Router + TS strict, proxy rewrite, env config | ✅ |
| 3 | API client, error mapping, auth/session, route guards | ✅ |
| 4 | Design tokens (docs 74–78) + primitives, two density themes | ✅ |
| 5–7 | Admin / Partner / Customer shells | ✅ (§10.1 gates Admin sign-in) |
| 8 | Property review workflow | ✅ |
| 9 | Partner property management | ✅ |
| 10 | Room management + `VERSION_CONFLICT` UI | ✅ |
| 11 | Media — link/cover/order/publish; **upload deferred** | ⚠️ OQ-106 |
| 12 | Policies — 11 frozen types, effective dating | ✅ |
| 13 | Inventory calendar + bulk | ✅ |
| 14 | **Rate calendar** (`/admin/rates/grid`) | ✅ |
| 15 | **Bulk rate editor** (preview → confirm → apply) | ✅ |
| 16–17 | Customer property + availability | ✅ per-property; ⛔ search |
| 18 | Booking — **UX shell only**, boundary marked | ⛔ |
| 19–21 | Responsive · a11y/states · QA | — |

**Highest-value first:** steps 2–4 unlock everything; steps 13–15 are the owner's stated priority and
are fully backed by working, tested APIs.

---

## 12. Exact first implementation step

> **Step 2 — Frontend Foundation.** Create `frontend/` as a Next.js 15 App Router application with
> TypeScript in `strict` mode; configure `rewrites()` to proxy `/api/v1/**` to the backend origin so
> the session cookies work same-origin (§4.1); establish the `src/` layout of §9; add typecheck, lint
> and build scripts; commit nothing else. **No pages, no design tokens, no API calls yet** — those are
> steps 3 and 4.

Nothing in the backend changes. No migration. No production data.

---

## 13. Open questions raised by this discovery

| ID | Question | Blocking |
| --- | --- | --- |
| **OQ-129** | Is the Partner Portal a separate `/partner/**` experience, contradicting doc 22 §8 and doc 85 §9? | 🟠 shapes steps 6 and 9 |
| **OQ-130** | Given `SUPER_ADMIN` cannot sign in until 2FA ships, what is the Admin Portal in V1? (§10.1) | 🔴 gates step 5 |
| **OQ-131** | Add springdoc/OpenAPI to the backend so the client is generated rather than hand-typed? | 🟡 |
| *(carried)* | OQ-106 media upload · OQ-122 search · OQ-123 quote · booking API · `/me` surface | see §10 |

---

## 14. Step 2 — Frontend Foundation (2026-08-18)

**Status:** ✅ typecheck · lint · tests · production build all green. **0 npm vulnerabilities.**
No feature screens built — that is Steps 5 onward.

### 14.1 Owner decisions recorded

| ID | Decision |
| --- | --- |
| **OQ-129** | ✅ **RESOLVED — separate Partner Portal frontend IA approved.** A `/partner/**` route group exists. It creates **no** `PARTNER` role, permission, authentication model or API namespace: the backend stays `ADMIN` role + `PARTNER` scope (doc 59 §2, doc 85 §5.1), and the tree consumes the existing `/api/v1/admin/**` contract. This amends doc 22 §8 and doc 85 §9, which described one console with a scope selector. |
| **OQ-130** | ✅ **RESOLVED — Admin Portal approved to build.** Its historical authentication gate was superseded by owner decision [150](150-owner-decision-no-2fa.md); SUPER_ADMIN now uses the standard email-and-password session flow. |

### 14.2 Stack

`next@16.3.1` · `react@19.2.8` · `react-dom@19.2.8` · `typescript@5.7.2` · `eslint@9.39.5` ·
`eslint-config-next@16.3.1` · `vitest@4.1.10`.

**Next 15.5.4 was rejected.** It sits inside the vulnerable range of ~26 advisories including a
critical RCE in the React flight protocol (GHSA-9qr9-h5gf-34mp). 16.3.1 is the first release outside
that range. `eslint` was likewise moved to 9.39.5 to clear GHSA-xffm-g5w8-qvg7. Final audit: **0
vulnerabilities**, production and dev.

### 14.3 Same-origin proxy — the architectural constraint

`next.config.ts` rewrites `/api/v1/:path*` to `KAS_API_ORIGIN`. The browser only ever talks to the
frontend origin.

This is not a convenience. The backend sends the session as `HttpOnly`, `SameSite=Lax` cookies and
configures **no CORS**; a different origin simply would not receive it. Adding CORS and relaxing
`SameSite` would weaken a deliberate backend security decision to simplify the frontend, which the
brief forbids.

`src/lib/api/client.ts` is the only place `fetch` is called, and **ESLint enforces that** — a
`no-restricted-globals` rule blocks `fetch` in `app/`, `features/` and `ui/`. Without it, the typed
layer quietly stops being the only route to the backend, taking CSRF, cookie forwarding and doc 58
error mapping with it.

The client works in both execution contexts: relative and proxied in the browser; absolute to
`KAS_API_ORIGIN` on the server with the incoming `Cookie` header forwarded from `next/headers`.

### 14.4 Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `KAS_API_ORIGIN` | server only | Backend origin for the proxy. Default `http://localhost:8080` — Spring Boot's default; `application.yml` sets no `server.port` |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | public | **Routing fallback only.** The business value is `DEFAULT_LOCALE` (A11 / OQ-065) and is still NULL in the backend; this stands in for nothing |
| `NEXT_TELEMETRY_DISABLED` | build | Next collects anonymous telemetry by default. Disabled explicitly rather than left to a per-machine setting |

`.env.example` is committed and holds no secret. `.env*` is git-ignored; `.env.example` is
un-ignored by the existing root rules. Verified with `git check-ignore`.

### 14.5 Authentication boundary

Signed-in state is resolved by **calling the backend**, never by reading a cookie — the session
cookies are `HttpOnly`, and a cookie's presence proves nothing about an expired or revoked token.
`GET /api/v1/me/sessions` is the probe, and it is the only `/me` endpoint that exists.

`resolveSession()` returns `authenticated | anonymous | unavailable`. The third matters: rendering a
sign-in page because the API was unreachable would tell the user something false and appear to log
them out of a valid session.

`ApiError` distinguishes 401 / 403 / 404 / 409 / 422 and carries `correlationId`. **404 is rendered
as "not found", never as "forbidden"** — doc 85 §6.3 returns 404 for another partner's records
precisely so their existence is not disclosed, and re-describing it would undo that.

Route guards are navigation convenience only. Doc 59 §7.1 is deny-by-default and the backend
enforces every permission and scope; nothing here infers authority.

### 14.6 Design system

One token system in `src/ui/tokens.css`, **transcribed** from docs 74–78 — the stone/ink/accent
ramps, the semantic hues, the doc 77 spacing scale, the doc 75 type scale, radius, shadow and
z-index.

Two density modes, not two libraries. `[data-density='operational']` implements doc 80 §1's
management rhythm and is set by the admin and partner layouts. Colour, type family, radius and
shadow are untouched between them; only rhythm, control size and the display-face rule change —
exactly the split doc 80 §1 specifies.

Primitives so far: `Button`, `EmptyState`, `ErrorState`, `Skeleton`, `IntegrationBoundary`. The rest
arrive with the screens that need them.

`IntegrationBoundary` is deliberate: where a backend contract does not exist, the UI says so and
names the open question, rather than simulating the feature.

### 14.7 Routes

```
/                          → redirect to /{DEFAULT_LOCALE}
/[locale]                  customer (doc 22 §3, locale-prefixed; unknown locale → 404)
/admin, /admin/properties  operational density; X-Robots-Tag noindex
/partner, /partner/properties
```

`noindex` is set as an HTTP header for both consoles — doc 22 §8 wants three independent layers, and
this is one of them.

### 14.8 Gates

| Gate | Result |
| --- | --- |
| `npm install` | clean · **0 vulnerabilities** |
| `npm run typecheck` | **pass** — `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`. No `any` anywhere |
| `npm run lint` | **pass**, 0 errors 0 warnings |
| `npm run test` | **7 tests, 2 files, all pass** |
| `npm run build` | **pass** — 7 routes |
| Fresh-clone check | `typecheck` passes with no generated `next-env.d.ts` or `.next` — verified by removing them |
| Secret scan | clean |
| Backend | untouched — 345 tests, Flyway v23, no V24 |

Two defects were found and fixed by running the toolchain rather than trusting it: `FlatCompat` fails
against `eslint-config-next` 16, which exports flat config arrays directly (verified against the
package's `exports` map); and the Vitest config needed `.mts` to avoid a CommonJS/ESM loader warning.

---

## 15. Step 3 — Authentication & Session (2026-08-18)

**Status:** ✅ typecheck · lint · **32 tests** · production build all green. Verified **live** against
the running backend through the Next proxy. Backend untouched: Flyway v23, 0 users, 8 properties.

### 15.1 The finding that changed the implementation

**Login requires the CSRF token, and a first-visit browser does not have one.**

Verified against the running backend rather than reasoned about:

```
POST /api/v1/public/auth/login   (no X-XSRF-TOKEN)  -> 403 FORBIDDEN
POST /api/v1/public/auth/login   (with token)       -> 401 UNAUTHENTICATED
GET  /api/v1/public/properties                      -> Set-Cookie: XSRF-TOKEN=…
```

Spring writes `XSRF-TOKEN` from `CsrfCookieFilter`, which only runs when a request reaches Spring. A
Next.js page render does not. So on a first visit to `/partner/login` the browser holds no token and
the **very first login attempt would 403** — which the user would read as "wrong password".

`lib/api/csrf.ts` primes the token with one cheap public GET before the first mutation, single-flight
so concurrent submits share it. Without this the sign-in page would have been broken in a way that
looked like a credentials problem.

### 15.2 Historical 2FA boundary — superseded by owner decision 150

At the time of this discovery, `AuthenticationService` refused a `SUPER_ADMIN` login while `TwoFactorPolicy.secondFactorVerificationAvailable()`
returns `false`. That refusal throws `InvalidCredentialsException` — **the same 401 and the same
generic message as a wrong password**. Verified: `{"code":"UNAUTHENTICATED","message":"Those credentials are not valid."}`.

This is deliberate account-enumeration resistance, and it means **the frontend cannot detect the 2FA
case from the response**. So `/admin/login` states the constraint up front as known context rather
than inferring it from a failure. Inferring it would be a guess, and would also leak which accounts
are `SUPER_ADMIN`.

**No bypass exists**: no password-only path, no development flag, no emergency parameter, no
simulated TOTP, no fake session. When the real second-factor contract is specified, it is added there.

### 15.3 Refresh — single-flight, and why

`lib/api/refresh.ts` coalesces concurrent 401s into one `POST /refresh`.

The refresh token **rotates**. Six parallel dashboard reads failing at once would fire six refreshes;
the first rotates the token and the other five present one that no longer exists — logging the user
out of a perfectly valid session. One shared promise prevents that.

Loop safety, each a test: retried **at most once**; the auth endpoints are never refreshed (a 401
from `/login` means wrong credentials, and refreshing `/refresh` is the loop itself); a failed
refresh is not cached, so a later legitimate attempt still works.

**Refresh is browser-only.** A Server Component cannot write the rotated `Set-Cookie` back to the
browser, so refreshing there would rotate the token, discard the new one, and destroy the session. A
server-side 401 is reported as a 401.

### 15.4 Login is a client POST, not a Server Action

Deliberate. The browser must receive the backend's `Set-Cookie` headers with their exact flags —
`HttpOnly`, `Secure`, `SameSite=Lax`, and the refresh cookie's `Path=/api/v1/public/auth`. A Server
Action would mean the Next server received them and had to re-issue them by hand; one lost `Path` or
widened `SameSite` would weaken the session silently. Through the proxy they arrive untouched.

### 15.5 Route guards are navigation, not authorisation

The guard lives in a nested `(protected)` route group, not on `partner/layout.tsx` — a guard on the
parent would also guard `/partner/login` and redirect the sign-in page to itself.

It checks **only** whether a session exists. There is no client-side role or permission model to
check: the session cookies are `HttpOnly` and the frontend never learns what the caller may do. Doc
59 §7.1 is deny-by-default and the backend authorises every request in its own SQL. A frontend
carrying a permission set would eventually be trusted for one, and the first bug in it would be a
security bug.

`safeReturnTo` rejects `//host`, absolute URLs and `../` — an unvalidated `returnTo` on a public
sign-in page is the classic open-redirect credential-harvesting hop.

**Backend outage is not signed-out.** `resolveSession()` keeps `unavailable` distinct from
`anonymous`; collapsing them would tell a user with a valid session that they had been logged out
every time the API hiccuped.

### 15.6 Error mapping

| Status | Message |
| --- | --- |
| 401 (session) | *Phiên đăng nhập đã hết hạn.* |
| 401 (sign-in) | *Email hoặc mật khẩu không đúng.* — "your session has ended" would be nonsense on a login page |
| 403 | *Bạn không có quyền thực hiện thao tác này.* |
| 404 | *Không tìm thấy tài nguyên.* — **identical wording whether absent or out of scope.** Doc 85 §6.3 returns 404 for another partner's records so their existence is not disclosed; softening it to a permission message would undo that |
| 409 | *Thông tin đã thay đổi. Vui lòng tải lại và thử lại.* |
| 422 | the backend's own text — authored for the caller and actionable |
| 5xx | a constant. **Never** `error.message`, which is why a `PSQLException` cannot reach a user |

### 15.7 Live end-to-end verification

Both servers started, exercised, and stopped:

| Check | Result |
| --- | --- |
| Proxy reaches backend | `GET /api/v1/public/properties` via `:3000` → **200** |
| Proxied GET issues `XSRF-TOKEN` to the browser | ✅ |
| Login through proxy **without** CSRF | **403** — confirms the guard is real |
| Login through proxy **with** CSRF | **401** — plumbing correct, credentials rejected |
| `/partner` while anonymous | **307 → `/partner/login?returnTo=%2Fpartner`** |
| `/partner/login` while anonymous | **200** — reachable, not caught by its own guard |
| `X-Robots-Tag` on consoles | `noindex, nofollow` |

### 15.8 Security scan

| Search | Result |
| --- | --- |
| `localStorage` · `sessionStorage` · `IndexedDB` | **none** |
| `Authorization` header | only in the test asserting it is never set |
| `console.*` | **none** |
| access/refresh token in state, context or props | **none** — login returns `204` with an empty body; there is nothing to store |
| `document.cookie` | one read, of `XSRF-TOKEN` only — the single cookie Spring deliberately makes readable |
| `fetch` outside `lib/api` | **none**, enforced by ESLint |

### 15.9 Gates

typecheck **pass** · lint **pass** (0 warnings) · **32 tests pass** (was 7) · build **pass**, 9 routes.

One test failure was a test artefact, not a code bug: `vi.resetModules()` gives the freshly-imported
client its own `ApiError` class object, so `toBeInstanceOf` compared two different classes. Asserted
on the contract (`status`, `code`) instead.

### 15.10 Blockers

None for Step 4. Unchanged from §10: booking, portfolio search, quote, `/me` profile and media
upload have no backend contract, and nothing simulates them. The earlier 2FA gate was removed by
owner decision 150.

---

## 16. Step 4 — Design System & Application Shells (2026-08-19)

**Status:** ✅ typecheck · lint · **62 tests** · production build · **0 npm vulnerabilities**.
Verified in a real browser at desktop and mobile. Backend untouched.

### 16.1 Tokens — extended, not duplicated

The Step 2 token file already held 79 tokens transcribed from docs 74–78. Only two semantic groups
the brief names were genuinely absent, so five tokens were added and nothing was re-declared:

| Added | Why |
| --- | --- |
| `--surface-elevated` | the ground for modals, drawers and popovers — distinct from `--surface` so a dialog reads as *above* the page |
| `--surface-disabled`, `--text-disabled` | doc 76 lists `stone.400` as disabled text |
| `--danger-500/100` | *danger* is a destructive **action**, *error* is a failed one. Same hue, different intent — aliased to `error` rather than duplicating the value |

Total: **84 distinct tokens** (93 declarations, the extra 9 being density, pointer, breakpoint and
reduced-motion overrides). Every value still traces to a frozen document; none was invented.

### 16.2 A real accessibility defect, found by measuring

The operational density is 34px, which is right for a mouse on a dense console. Measured in the
browser at 375px it was **also 34px on touch** — and doc 82 §7 and doc 71 §6 both set a hard floor:
*"Minimum target 44 × 44px"*.

Fixed with a `@media (pointer: coarse)` override that raises operational controls and rows to 44px.
Keyed on the **input device**, not a width breakpoint, because that is what the rule is actually
about: a touch laptop at 1400px still needs 44px, and a narrow window on a desktop does not.

Verified both ways in the browser: **44px** with `pointer: coarse`, **34px** with a fine pointer, and
no horizontal overflow at 375px.

> Found only because the value was measured rather than assumed. Three earlier browser checks
> reported the old figure because `next start` was serving a deleted build — the page was linking a
> stylesheet that no longer existed on disk. `pkill` had not actually stopped the old server; killing
> by listening port did.

### 16.3 Primitives

22 exported components across 9 files, grouped by cohesion rather than one file each:

| File | Primitives |
| --- | --- |
| `Form.tsx` | `FormControl`, `Input`, `Select`, `Textarea` |
| `Dialog.tsx` | `Dialog`, `Modal`, `Drawer`, `ConfirmDialog` |
| `Display.tsx` | `Card`, `Badge`, `Tabs`, `Breadcrumb` |
| `Table.tsx` | `Table` (generic over the row type) |
| `CalendarCell.tsx` · `DatePicker.tsx` | `CalendarCell`, `DatePicker`, `DateRangePicker` |
| `Toast.tsx` · `States.tsx` · `Button.tsx` | `ToastProvider`/`useToast`, `Skeleton`, `EmptyState`, `ErrorState`, `IntegrationBoundary`, `Button` |

No `any`. `Field.tsx` from Step 3 was superseded by `Form.tsx` and removed rather than left as a
second way to render an input.

### 16.4 CalendarCell — the one that had to be right

It carries both the inventory calendar (Step 13) and the rate calendar (Steps 14–15), so it knows
nothing about rooms, prices or availability. It renders a value, an optional secondary, and a state.

That constraint is the point: the backend is authoritative for both — doc 15 §2.2 puts the oversell
guarantee in a database CHECK and doc 56 §3.1 puts rate precedence in `RateResolver` — so a cell that
computed anything would be a second implementation of a rule that already has one home.

**`unconfigured` is not zero.** Doc 15 §12 treats a missing inventory row as unavailable, never as
zero available; doc 56 §9 leaves base rates OPEN so an unpriced cell is a gap, not a free room.
`value === null` renders a dash plus a screen-reader "chưa cấu hình". A test asserts a real `0` still
renders as `0`, so the two cases cannot be conflated in either direction.

### 16.5 DatePicker — native, and business-free

Native `input type="date"` brings keyboard entry, locale formatting, the platform calendar and the
mobile wheel, all accessible. A hand-rolled calendar reimplements each and usually ships without
arrow-key navigation.

It knows nothing about the 24-month horizon, `MAX_STAY_NIGHTS` or which dates carry inventory —
those are backend-owned, so the feature layer supplies `min`/`max`. `DateRangePicker` enforces only
that the end cannot precede the start, which is arithmetic rather than policy.

### 16.6 Shells

One `AppShell` for both consoles — Admin and Partner differ in navigation and header content, not in
chrome. Sidebar is a permanent column ≥1024px and an overlay drawer below, from **one component
tree** (doc 82); there is no separate mobile build.

Navigation is honest: every item is `available` only where doc 100 §3 confirms an endpoint, and
everything else is rendered disabled with a reason. Admin's Partners/Operations/Audit are marked
"Chưa có API" because none exists.

`CustomerShell` is deliberately separate and carries no `data-density`, so it keeps the editorial
defaults — 44px controls, `space-5` rhythm, and the display face for the wordmark, which the consoles
never use (doc 80 §1). It renders **no** search, cards, prices or availability: those have no backend
contract, and `/hotels` shows the real empty state because all eight seed properties are DRAFT.

### 16.7 PropertySwitcher

Presentational: it takes a list and reports a choice. Fetching belongs to Step 9, where the DTO gets
typed against the real response.

Four states, each tested: **N properties** (never eight — nothing assumes a count), **one property**
(a label, not a one-option dropdown that invites a click doing nothing), **none** (a real state, not
an error — the seed properties are DRAFT), and **failed to load** (an alert, kept distinct from
empty, because "you have no hotels" and "we could not ask" are different facts).

### 16.8 Icons — a documented decision to add nothing

No icon dependency existed. Ten icons are needed across the whole shell, and the project has held
0 vulnerabilities through three steps. A local inline-SVG set at `ui/icons` costs nothing and is
`currentColor`, single-stroke, `aria-hidden` by default — an icon is decoration unless a caller gives
it a label.

### 16.9 Accessibility

Asserted through the accessibility tree, not class names — that is what assistive technology
receives, and it survives restyling.

- Labels wired via `htmlFor`; description and error both joined into `aria-describedby`
- Errors carry an icon **and** colour — doc 82 forbids colour as the only signal, so every state
  survives greyscale
- `Table` uses real `th scope="col"` and a caption; a div grid announces nothing
- Dialogs: `aria-modal`, an accessible name, Escape, a Tab trap, scroll lock, and **focus returned to
  whatever opened them** — without that a keyboard user is dumped at the top of the document on every
  dismiss
- Skip links in both shells; verified present in the rendered HTML
- `aria-busy` on loading buttons, selects and tables
- Browser accessibility tree at `/partner/login`: `main` → heading → two labelled textboxes → submit

### 16.10 Gates

| Gate | Result |
| --- | --- |
| typecheck | **pass** — strict, no `any` |
| lint | **pass**, 0 warnings |
| tests | **62 pass** (was 32) across 8 files |
| build | **pass**, 10 routes |
| `npm audit` | **0 vulnerabilities** (added `jsdom`, `@testing-library/react`, `user-event`) |

### 16.11 Security regression

`localStorage`/`sessionStorage`/`IndexedDB`: none. `Authorization`: only the test asserting it is
never set. `console.*`: none. Tokens in UI state: none. `fetch` outside `lib/api`: none, ESLint
enforced. No CORS added, `SameSite` untouched, CSRF unchanged — the only matches for those terms are
comments explaining why they are not done. Backend: no tracked file modified.

### 16.12 Known, deliberate

On a fine pointer a text input renders ~44px while a button renders 34px, because `min-height` is a
floor and the input grows with its 16px text. Left as is: forcing a fixed height would clip at
browser zoom, which is a worse accessibility trade than a 10px mismatch when the two sit side by side.

### 16.13 Blockers

None for Step 5. Unchanged from §10: booking, portfolio search, quote, `/me` profile and media upload
have no backend contract; the earlier `SUPER_ADMIN` 2FA gate was removed by owner decision 150.

---

## 17. Step 5 — Partner Property List & Detail (2026-08-19)

**Status:** ✅ typecheck · lint · **118 frontend tests** · production build · **0 npm vulnerabilities**.
Backend re-verified unmodified: **345 tests pass** (146 unit + 199 integration), `BUILD SUCCESS`.

The first end-to-end Partner feature. Read-only.

⚠️ **One blocker on live verification:** `kas_web_dev` holds **0 users and 0 role assignments**, so no
Partner can sign in and the browser flow could not be exercised. See §17.11.

### 17.1 The backend contract, read from the Java

Taken from `onboarding.api.PartnerPropertyController`, `PropertyAdminView`, `PropertyRepository` and
`PropertyCompletenessChecker` — not inferred from database columns.

| Endpoint | Method | Permission | Response |
| --- | --- | --- | --- |
| `/api/v1/admin/properties` | GET | `property.manage` | `PropertyAdminView[]`, ordered `sort_order, slug` |
| `/api/v1/admin/properties/{id}` | GET | `property.manage` | `PropertyAdminView` · **404 when out of scope** |
| `/api/v1/admin/properties/{id}/completeness` | GET | `property.manage` | `CompletenessResult` · same 404 |

```jsonc
// PropertyAdminView — five record components, no extra accessors, five JSON keys
{ "id": "uuid", "slug": "string",
  "lifecycleState": "DRAFT|COMING_SOON|OPEN|TEMPORARILY_CLOSED|CLOSED",
  "isFlagship": false, "sortOrder": 1 }

// CompletenessResult — `complete` is NOT a record component; it comes from the
// public isComplete() accessor, which Jackson serialises alongside them.
{ "sections": [{ "name": "Basic information", "complete": false,
                 "missing": ["name (both locales)"] }],
  "complete": false }
```

No field is nullable, so `spring.jackson.default-property-inclusion: non_null` is not observable on
either response. The `$.complete` key was **not** assumed from reading the record — the backend's own
`OnboardingWorkflowIT` asserts it.

Five completeness sections, fixed: *Basic information · Location · Room types · Property images ·
Signature experiences*.

There is **no `/api/v1/partner/**` tree**. Both consoles call the same handlers; the caller's
`AuthorizationScope` is folded into the SQL `WHERE` clause by `PropertyRepository`, so a
PARTNER-scoped session receives exactly its own estate — no filter to pass, none to forget.
`partnerId` is absent by design (doc 58 §9 denylist).

**Not wrapped, deliberately:** `POST /admin/properties`, `PATCH /admin/properties/{id}`,
`POST /{id}/submit`, `GET /{id}/submissions`. Step 5 is read-only, and a typed function is an
invitation to call it.

### 17.2 The finding that shaped the screen

**`PropertyAdminView` returns no display name, no address and no phone.**

That is not missing seed data. `property` has `city`, `district`, `ward`, `phone`; `city` is populated
for all eight rows; `property_translation` holds a name in **both locales for all eight**. But
`PropertyRepository.COLUMNS` does not select the address columns, the `Property` record has no field
able to hold a name, and `PropertyAdminView` exposes neither.

`PATCH /admin/properties/{id}` **writes** `district`, `ward`, `city` and `phone`. `GET` never reads
them back. That write-without-read asymmetry is **OQ-132**.

So the slug is the only human-readable identity this API returns, and the slug is what the UI shows —
verbatim, never title-cased into something name-shaped. A slug sometimes prettifies into the real
name and sometimes into a lie, and the code has no way to tell which it is holding.

Address and contact render as explicit gaps worded *"Không có trong phản hồi của API"* — **not**
*"Chưa có dữ liệu"*, which would blame the partner for a field the endpoint simply does not publish.

### 17.3 Table, not cards

The brief left the choice to the data. Five scalars, no image, no name, no summary: a card holding a
slug and a status badge is a table row with wasted space around it, and it would imply a richness the
response does not have. Four columns — slug (a link), status, flagship, sort order.

A test asserts the header count is exactly four and that no occupancy, revenue, booking, rating, ADR
or RevPAR wording appears anywhere in the table. None of those has an endpoint, and a dashboard of
plausible numbers is the most convincing way to fabricate a product.

The landing page reports one fact — how many properties the session reaches — because that is the one
number the backend can actually answer.

### 17.4 Lifecycle

The five frozen doc 52 §3.1 states, translated and never reinterpreted. `DRAFT` → *Bản nháp*; not
*Chờ duyệt* (a draft is not waiting for anyone) and not *Chưa kích hoạt* (that is what `CLOSED` and
`TEMPORARILY_CLOSED` mean).

Each badge carries the raw value in `data-lifecycle-state` and its tooltip, and the detail page prints
both — *Bản nháp (DRAFT)* — so the translation is never the only record of what the backend said. An
unrecognised sixth state renders as itself rather than being mapped onto something familiar.

`isPubliclyVisible()` is mirrored so a partner learns *why* a draft is not on the website. It gates
nothing; a test pins all five states to the doc, so drift from the backend enum fails there instead of
telling someone their draft is live.

### 17.5 Cross-partner isolation

Three causes, one answer:

| Input | Backend | Frontend |
| --- | --- | --- |
| id names **another partner's** hotel | **404** (doc 85 §6.3) | `notFound()` |
| id names nothing | 404 | `notFound()` |
| id is not a UUID | **400 `VALIDATION_FAILED`** | `notFound()`, answered locally — no round-trip |

`loadPropertyDetail` collapses all three *before* the page component sees them, so there is no branch
that could later grow a distinguishing message. A test asserts the two 404 results are `toEqual` each
other: the contract is indistinguishability, so indistinguishability is what is asserted.

The not-found page never says "you do not have permission", never names a partner, and does not echo
the id back — with a test that greps its rendered text for exactly those leaks.

A **403 is deliberately not** mapped to not-found: it means the account lacks `property.manage`
altogether, which is a real misconfiguration, and hiding it would hide a genuine problem.

### 17.6 The URL is the property context

`PropertySwitcherControl` turns a choice into `router.push('/partner/properties/{id}')` and nothing
else happens: no global state, no stored preference, no request telling the backend which hotel is
"active" — there is no such endpoint and there should not be, because scope is re-decided per request
from the session.

The context is therefore shareable, bookmarkable, restorable on reload and correct in two tabs at
once, and the active id is *read from the route* rather than remembered, so it cannot drift from what
the page is showing. A test asserts `localStorage` and `sessionStorage` are still empty after a
switch.

If the chosen property 404s, not-found renders. The switcher does **not** fall back to another
property: silently redirecting would hide the answer and, for another partner's id, would convert a
deliberate 404 into an observable difference.

`SwitchableProperty.name` was renamed to `label` — a field called `name` fed a slug is how a screen
starts claiming to show something it never received.

### 17.7 States

| State | Treatment |
| --- | --- |
| Loading (list) | the real `PropertyTable` in its loading state, so nothing shifts when data lands |
| Loading (detail) | skeletons only — **not** the slug from the URL, because naming the property before the backend authorised reading it would display, however briefly, something the caller may have no right to see |
| Empty | a real state, not an error; says creation belongs to the onboarding step rather than offering a button that does not exist |
| Error | `ErrorState` over `ApiError` — 401 session, 403 permission, 404 not-found, 409 conflict, 422 the backend's own text, 5xx a constant plus correlation id |
| Network down | becomes an `ApiError` with status `0` — not a fake 500, so nobody hunts for a correlation id that never existed |
| Switcher failure | a message in the header, not a dead console: a broken switcher is not a broken portal |
| Completeness failure | a degraded panel; explicitly not allowed to turn a found property into a not-found one |

### 17.8 Accessibility

Asserted through the accessibility tree in jsdom (see §17.11 for what could not be checked in a
browser):

- exactly one `h1` per page — including not-found, the error branch and the loading state, each of
  which had none until this was checked
- property rows are real `<a>` links, so they open in a new tab and are reachable by Tab
- status is words plus tint, never tint alone
- `aria-busy` on both loading surfaces; `role="alert"` on switcher and error states
- the switcher's `<select>` is labelled *"Khách sạn đang chọn"*
- breadcrumb is a real `<nav>`/`<ol>`; tabs mark the current page with `aria-current`
- disabled future areas are non-interactive `<span aria-disabled>`, not links that go nowhere

### 17.9 Responsive

Structural, not measured — the screens are behind the sign-in gate (§17.11). `Property.module.css`
contains **no fixed widths**: the detail grid is `repeat(auto-fit, minmax(min(100%, 320px), 1fr))`,
the definition list collapses to one column below 600px, and `overflow-wrap: anywhere` is set on the
identity link, the heading and every `<dd>` — a 36-character UUID is the one string on these screens
long enough to push a 375px viewport sideways. The table itself is the Step-4 primitive, whose own
scroll container was measured in the browser at 375/768/1024/1440 during Step 4.

### 17.10 Structural guards

`guards.test.ts` reads the shipped source — the frontend's answer to ArchUnit — and fails the build
rather than a checklist:

no `kas-…-hotel` slug in product code · no property count compared against 2 or more (`=== 0` and
`=== 1` are real cases: an empty scope, and the single property that renders as a label) · `fetch`
only under `lib/api` · no `localStorage`/`sessionStorage`/`indexedDB` · no `Authorization` header ·
no `console.*` · no `Access-Control-Allow-Origin`, no `SameSite=None`, no `credentials: 'omit'`.

Comments are stripped before scanning. Several modules explain in prose exactly why they do not touch
web storage or add CORS, and a guard that failed on the explanation would push authors toward
deleting the reasoning instead of keeping the rule.

### 17.11 Blocker — live verification needs a Partner account

`kas_web_dev`: **0 rows in `app_user`, 0 in `role_assignment`** (8 properties, 1 partner). Nobody can
sign in, so login → list → detail → cross-partner 404 could not be exercised in a browser, and the
property screens could not be measured at the four widths.

What **was** verified live, against the running backend and through the Next proxy:

| Check | Result |
| --- | --- |
| `GET /api/v1/admin/properties` unauthenticated | **401** |
| `GET /api/v1/admin/properties/{id}` unauthenticated | **401** |
| `GET /api/v1/admin/properties/{id}/completeness` unauthenticated | **401** |
| Same call through the frontend proxy on `:3000` | **401** — reaches the backend, no CORS involved |
| `/partner/properties` anonymous | **307 → `/partner/login?returnTo=…`** |
| `/partner/properties/{uuid}` anonymous | **307 → login** |
| `/partner/properties/not-a-uuid` anonymous | **307 → login** — the guard runs before any property code |
| `X-Robots-Tag` on the new routes | `noindex, nofollow` |
| `GET /api/v1/public/properties` | `[]` — confirms all eight are DRAFT and correctly invisible |

The authentication boundary holds on every new route. The data path is proven by unit tests and by
reading the Java, not by a live round-trip.

Creating that account is an owner decision, not a developer's: it means choosing an email and writing
an Argon2id credential into a database. Nothing technical blocks it — **one PARTNER-scoped user is
enough**, and no property, room, rate or media data is needed.

### 17.12 Open questions raised

| # | Question |
| --- | --- |
| **OQ-132** | `PropertyAdminView` returns no name, address or phone, though `PATCH` writes address and contact and both locales' names exist. Should the admin read expose them? |
| **OQ-133** | `CompletenessResult` section and field names are English-only, and are also what a refused submit puts in `details[]`. Bilingual labels belong in the backend, not a frontend lookup. |
| **OQ-134** | No dev Partner account exists, so no frontend feature can be exercised end-to-end (§17.11). |
