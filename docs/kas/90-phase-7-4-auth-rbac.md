# 90 — Phase 7.4: Authentication, RBAC & Scope Enforcement

**Phase:** 7.4 — Auth + RBAC + Authorization/Scope
**Status:** ✅ **COMPLETE — AWAITING REVIEW**, with **one blocker reported** (§5.3)
**Target:** `kas_web_dev` / `kas_web_app` / schema `kas`
**Executed:** 2026-08-16
**Last updated:** 2026-08-16

> **No database change was made.** No migration was written, V1–V21 are
> byte-identical, Flyway validates 22 migrations, and the frozen schema still
> holds 53 domain tables. §6 explains why V22 was not required.
>
> **Nothing was written to `kas_web_dev`.** Every integration test runs inside a
> transaction that is rolled back; `app_user`, `role_assignment`, `user_session`,
> `partner` and `property` all hold **0 rows** afterwards, as before.
>
> **All 18 business configuration values remain `NULL`.** Nothing was invented.

---

## 1. What was implemented

| Area | Delivered |
|---|---|
| **Authentication** | Login, refresh with rotation, logout, session listing and revocation |
| **Tokens** | Signed short-lived access token + opaque rotating refresh, both `HttpOnly` cookies |
| **RBAC** | The doc 59 §4 catalogue enforced by `@PreAuthorize` on every handler |
| **Scope** | GLOBAL · PARTNER · PROPERTY · OWN resolved centrally, applied at the repository |
| **Deny by default** | Chain rules + `@PreAuthorize` + a **runtime** undeclared-endpoint guard + the build-time test |
| **Isolation** | Cross-partner 404, proven at both HTTP and repository level |
| **Endpoints** | 6 auth/session + 2 property reads (§7) |
| **Tests** | **192 passing** — 143 unit/architecture, 49 integration |

---

## 2. Authentication design

### 2.1 The token model was derived, not chosen

The frozen schema settled it. `user_session` carries **exactly one** token
column — `refresh_token_hash`, `UNIQUE`, `NOT NULL`. So:

- the **refresh token** is the stored half: opaque, 256 bits of `SecureRandom`,
  persisted only as a SHA-256 digest, unique per session;
- the **access token** has nowhere to be stored, so it must be self-contained
  and tamper-proof — a signed token.

Doc 59 §8 independently requires "short access token + rotating refresh", which
is the same answer. Nothing here was a preference.

### 2.2 Lifetimes came from doc 06 §5.3

Doc 59 §8 requires short-lived tokens without numbers. **Doc 06 §5.3 supplies
them** and is the only frozen document that does:

> **PROPOSED** lifetimes: customer access 15 min / refresh 30 days; staff access
> 15 min / refresh 12 h

They are configuration (`kas.security.*`), not literals in code, and are still
marked PROPOSED upstream — **they should be confirmed before launch.**

### 2.3 Revocation is genuine

Doc 59 §8: "logout genuinely invalidates". A signed access token cannot be
withdrawn, so the access token carries a `sid` claim and
`TokenAuthenticationFilter` checks the session row is still active on **every**
request. `logoutInvalidatesTheSession` proves it: after logout the token is
still cryptographically valid and unexpired, and the request is refused.

Permissions and scope are deliberately **not** in the token. They are resolved
from the database per request, so a revoked role assignment takes effect
immediately rather than at the next expiry.

### 2.4 Rotation preserves the device entry

Refresh rotates the token **on the same session row**, with the previous digest
in the `UPDATE` predicate. Two consequences: a replayed token cannot rotate
twice, and the row stays the device entry `GET /me/sessions` lists — recreating
it every refresh would turn one signed-in phone into a new "session" every
fifteen minutes and make the list useless for spotting an intruder.

### 2.5 Failure is uniform

Unknown email, wrong password, missing credential, suspended, disabled,
unverified, locked, expired refresh and unverifiable second factor all raise one
`InvalidCredentialsException` with one message and one code. When no account
exists, a real Argon2id verification still runs against a throwaway hash, so
response time does not disclose existence either.
`failureDoesNotDiscloseAccountExistence` asserts the three bodies are
byte-identical apart from the correlation id.

---

## 3. RBAC

The doc 59 §4 catalogue from Phase 7.3 is unchanged and now enforced.
Authorities **are** the permission strings — `hasAuthority('property.manage')`,
never `hasRole(...)` — because doc 59 §1 requires permission checks wherever a
future role might need the same capability.

Three questions are answered separately and failed separately:

| Question | Mechanism | Failure |
|---|---|---|
| Who are you? | `TokenAuthenticationFilter` | 401 |
| What may you do? | `@PreAuthorize` + doc 59 §4 permission | 403 |
| Which rows? | `AuthorizationScope` at the repository | 404 |

`customerLacksAdminPermission` proves the middle one in isolation: the caller is
definitely authenticated and still refused.

---

## 4. Scope enforcement

`ScopeResolver` turns active role assignments into one `AuthorizationScope`
(broadest wins: GLOBAL > PARTNER > PROPERTY > OWN). Repositories take it as a
parameter — there is no unscoped overload, and
`ScopeEnforcementStructureTest` fails the build if one appears.

**The scope predicate is `AND`ed into the same statement as the identity
predicate.** Nothing is fetched and then checked, so supplying another partner's
`property_id` selects no row — doc 85 §10 control 5. That is why
`propertyScopeCannotBeBypassedByPathManipulation` passes for every one of the
seven properties it tries.

### Partner → 8 properties

`partnerAdminReachesAllEightProperties`: one account, one role assignment,
`ADMIN` + `PARTNER` scope → all eight. No enumerated array, no eight accounts.

`newPropertyIsReachedWithoutTouchingTheUser` adds a ninth property **after**
login and asserts the admin sees nine — the silent failure doc 85 §2.2 problem 2
describes, closed.

---

## 5. Ambiguities resolved, and one blocker

### 5.1 "PARTNER" is a scope kind, not a role — resolved, not a document conflict

The phase brief lists roles as `SUPER_ADMIN, ADMIN, PARTNER, CUSTOMER`. **No
`PARTNER` role exists** and none was created:

- doc 59 §2: "**`PARTNER` is a scope kind, not a role.** No role is added,
  renamed or removed."
- doc 85 §5.1: same, verbatim.
- the PostgreSQL enum is `user_role = CUSTOMER | ADMIN | SUPER_ADMIN`. Adding a
  role would require altering a frozen enum.

The brief's own **SCOPE MODEL** section states the intended answer —
"ADMIN → PARTNER → V1 resolves to the one KAS Partner and all 8 properties" —
so Partner/Sales is **`ADMIN` holding `PARTNER` scope**, exactly one role, which
is what "Partner/Sales is ONE role" asks for. No stop condition was triggered.

### 5.2 Endpoints deferred, with reasons

Doc 58 §3.4 names `/register`, `/forgot-password`, `/reset-password`,
`/verify-email`, `/resend-verification`. **None was implemented.** All five need
email delivery, which does not exist, and each needs a token lifetime and a
message body that no frozen document supplies. Doc 06 §5.1 requires "breach-list
checking" at registration, which needs a breach list nobody has chosen. Building
them now would mean inventing behaviour.

### 5.3 Historical blocker — superseded by owner decision 150

At the time Phase 7.4 was completed, `SUPER_ADMIN` sign-in was blocked on a 2FA
mechanism decision. On 2026-10-20, the owner decided that 2FA is not required in
V1. See [150](150-owner-decision-no-2fa.md); the historical analysis below is
retained as a record of the earlier phase state.

Doc 06 §5.2 and doc 59 §8 make **2FA mandatory for `SUPER_ADMIN`**. It cannot be
implemented, and two things are missing:

| Missing | Detail |
|---|---|
| **Mechanism** | TOTP, SMS and email OTP are all plausible; no document chooses. Doc 06 §5.1 lists phone/OTP as FUTURE |
| **Storage** | `app_user` has `two_factor_enabled` but **no secret, no recovery codes, no enrolment state**. Adding them needs a migration for a mechanism nobody has selected |

**Resolution: fail closed.** `TwoFactorPolicy` refuses password-only
authentication for any role requiring a second factor, so `SUPER_ADMIN` cannot
log in. Letting the highest-value credential in the system in on a password
alone would silently downgrade a frozen control.

**Consequence:** no `SUPER_ADMIN` can sign in, and doc 59 §8 says staff accounts
are created by `SUPER_ADMIN` only — so staff onboarding is blocked until this is
answered. GLOBAL scope is still verified, at the authorization layer, by
`globalScopeReachesEverything`.

**Needed from the owner:** the 2FA mechanism. Then a V22 migration for its
storage, and enrolment/verification endpoints.

### 5.4 Two PROPOSED controls not implemented

| Control | Why not |
|---|---|
| **Progressive lockout** | Doc 58 §10 is marked **PROPOSED** and gives no threshold or delay. `failed_login_count` is incremented and cleared, and an operator-set `locked_until` is honoured, but **no automatic lock** is applied — a threshold would be invented |
| **Rate limiting** | Doc 58 §10, also PROPOSED, also unvalued |

**Amended 2026-10-24 ([doc 154](154-owner-decision-shared-admin-account.md)):** the owner set the lockout — 5 consecutive wrong passwords lock the account for 15 minutes (`kas.security.lockout-max-failures`, `kas.security.lockout-duration`). While locked, even the right password is refused and attempts do not extend the lock; a completed customer password reset lifts it. Per-IP rate limiting remains open and belongs at the reverse proxy.

### 5.5 Contract gap: no staff login route

Doc 59 §8 and doc 06 §5.2 both require "a separate login route from the customer
site". **Doc 58 defines no such route** — §3.4 places `/login` under the Public
Customer surface and §8 lists no auth endpoints.

Staff therefore authenticate through `/api/v1/public/auth/login`, because
inventing an admin auth path would be inventing an endpoint name. **Doc 58 needs
a staff auth route added before production.** Recorded, not resolved.

---

## 6. Database — no change, and why

**No migration was written.** Two candidates were considered and both declined:

| Candidate | Decision |
|---|---|
| Session/token storage | **Not needed.** `user_session` already carries `refresh_token_hash` UNIQUE, `expires_at`, `revoked_at`, `device`, `ip`, `user_agent`, `last_seen_at` and a partial index on active sessions — everything doc 59 §8 and doc 58 §4 require |
| `audit_log.correlation_id` / `scope` | **Not required by Phase 7.4.** Doc 59 §7.6 lists what a privileged action must record: "actor, action, target, before/after, timestamp, IP". Neither field is in that list, and every field that is has a column. Doc 89 §8 recommended V22 as a convenience, not a requirement — it stays deferred rather than being written because it seemed useful |

---

## 7. Endpoints implemented

| Method | Path | Authorisation | Source |
|---|---|---|---|
| POST | `/api/v1/public/auth/login` | `@PublicEndpoint` | doc 58 §3.4 |
| POST | `/api/v1/public/auth/refresh` | `@PublicEndpoint` | doc 58 §3.4 |
| POST | `/api/v1/public/auth/logout` | `isAuthenticated()` | doc 58 §3.4 |
| GET | `/api/v1/me/sessions` | `isAuthenticated()` + ownership | doc 58 §4 |
| DELETE | `/api/v1/me/sessions/{id}` | `isAuthenticated()` + ownership | doc 58 §4 |
| DELETE | `/api/v1/me/sessions` | `isAuthenticated()` + ownership | doc 58 §4 |
| GET | `/api/v1/admin/properties` | `property.manage` | doc 58 §8 |
| GET | `/api/v1/admin/properties/{id}` | `property.manage` | doc 58 §8 |

**Why `isAuthenticated()` rather than a permission on `/me/sessions`:** doc 59
§4.8 lists the OWN-scope permissions and **defines none for session
management**. Doc 58 §4 states the control that applies instead — "Ownership is
checked on every record" — and ownership is enforced in SQL. Requiring a
permission would mean inventing one.

The two property reads exist because PARTNER scope and cross-partner 404 are
claims about an endpoint, not about a repository, and could not otherwise be
proven. `POST`/`PATCH` from doc 58 §8 were not implemented.

**Login, refresh and logout return `204` with no body.** Tokens travel as
cookies, and doc 58 §9 denylists `permissions[]` and `roleAssignments`, so a body
could carry nothing useful. A body that does not exist cannot leak.

---

## 8. Defects found and fixed

Five, all found by running the system rather than by reading it.

| # | Defect | Consequence had it shipped |
|---|---|---|
| 1 | `TokenAuthenticationFilter` skipped authentication because its `authentication == null` guard is never true — `AnonymousAuthenticationFilter` populates an anonymous token first | **Every authenticated request would have arrived anonymous** while login itself looked healthy. Found by instrumenting the pipeline after two wrong hypotheses |
| 2 | The filter was a `@Component`, so Boot also auto-registered it in the servlet chain, where it ran before `SecurityContextHolderFilter` and had its result discarded — and `OncePerRequestFilter` then skipped the correctly-ordered run | Same symptom, second cause |
| 3 | The filter mutated the deferred security context instead of installing a new one | Same symptom, third cause |
| 4 | `SessionView` exposed `expiresAt`, which is on the doc 58 §9 denylist | Caught by the denylist test. Field removed rather than adding a second name exception |
| 5 | An anonymous caller on a permitted path got 403 where doc 58 §2.1 requires 401 | Inconsistent contract; `/logout` reported 403 while `/me/sessions` reported 401 |

`kasAuthentication` was also found to be absent from the readiness group, so the
indicator could not do its job. Added.

---

## 9. Tests — 192 passing, 0 failures, 0 skipped

| Suite | Count | Covers |
|---|---:|---|
| Phase 7.3 regression | 143 | All prior architecture, denylist, module, error and Flyway tests **unchanged and passing** |
| `AuthenticationIT` | 16 | Login, wrong password, suspended/disabled/unverified, enumeration resistance, hashing, cookies, logout revocation, rotation, replay, forged token, CSRF, SUPER_ADMIN refusal, anonymous 401 |
| `PartnerIsolationIT` | 8 | 8 properties, ninth property, own property, cross-partner 404, indistinguishability, non-overlap, **repository-level isolation**, OWN reaches nothing |
| `RbacAndScopeIT` | 15 | Permission enforcement, no-assignment, undeclared route, GLOBAL, PROPERTY end-to-end, path manipulation, OWN session isolation, sign-out-everywhere scoping |
| `DatabaseConnectivityIT` · `FlywayHistoryIT` | 10 | Unchanged |

Every integration test authenticates through the real endpoint, carries real
cookies, passes the real filter chain and reaches PostgreSQL. Nothing asserts
that a helper returns true.

**Non-vacuity:** `UndeclaredEndpointGuardTest` runs the runtime guard against a
deliberately undeclared controller and asserts it is refused; the Phase 7.3
fixtures for the denylist, layering and scope rules still prove those catch
violations.

---

## 10. Verification executed

| # | Check | Result |
|---|---|---|
| 1 | `mvnw clean verify` | ✅ 143 + 49, BUILD SUCCESS |
| 2 | Application startup, dev profile | ✅ |
| 3 | Flyway at startup | ✅ "Successfully validated 22 migrations" · version 21 · up to date |
| 4 | Readiness **without** signing secret | ✅ **DOWN**, naming `kas.security.signing-secret` |
| 5 | Readiness **with** signing secret | ✅ UP · db UP · kasSchema UP · kasAuthentication UP |
| 6 | Unauthenticated `/me/sessions` · `/admin/properties` | ✅ 401 |
| 7 | Unauthenticated `/public/auth/logout` | ✅ 401 |
| 8 | `/actuator/env` | ✅ 401 |
| 9 | Credential scan of startup log | ✅ none |
| 10 | Test-data leakage into `kas_web_dev` | ✅ all tables 0 rows |
| 11 | Frozen schema | ✅ 53 domain tables · 22 Flyway rows · 0 baseline rows |
| 12 | `system_setting` | ✅ 18 keys, 0 with values |
| 13 | V1–V21 vs committed blobs | ✅ 0 of 23 differ |
| 14 | `git diff --check` | ✅ |

---

## 11. Risks

| # | Risk | Severity | Note |
|---|---|:--:|---|
| R1 | **`SUPER_ADMIN` cannot log in** | 🔴 | §5.3. Blocks staff onboarding. Needs a 2FA mechanism decision |
| R2 | No separate staff login route | 🟠 | §5.5. Doc 58 gap; staff share the public login path |
| R3 | No automatic lockout, no rate limiting | 🟠 | §5.4. **Lockout applied 2026-10-24 (doc 154): 5 failures → 15 min, per account.** Per-IP rate limiting still absent |
| R4 | Session lifetimes are PROPOSED | 🟠 | §2.2. From doc 06 §5.3; confirm before launch |
| R5 | Password reset / registration absent | 🟠 | §5.2. A user who forgets a password cannot recover it |
| R6 | No breach-list checking, no password policy | 🟠 | Doc 06 §5.1 requires both at registration; registration is deferred |
| R7 | Integration tests write to the **dev** database | 🟢 | Transactional and rolled back; verified 0 rows after |
| R8 | 18 business config values outstanding | 🟠 | Unchanged from Phase 7.3 |

---

## 12. Exit criteria

| Criterion | Status |
|---|:--:|
| Authentication implemented | ✅ |
| Password security verified | ✅ Argon2id, never stored plain, never returned, never logged |
| No default Spring user | ✅ `NoDefaultUserTest` still passing |
| RBAC from the frozen catalogue | ✅ no permission invented |
| GLOBAL scope verified | ✅ |
| PARTNER scope verified | ✅ |
| PROPERTY scope verified | ✅ end to end |
| OWN scope verified | ✅ |
| Partner/Sales manages all 8 V1 properties | ✅ and a ninth |
| Partner isolation verified | ✅ HTTP **and** repository |
| 404 resource-hiding verified | ✅ indistinguishable from a genuine 404 |
| Deny-by-default verified | ✅ build-time **and** runtime |
| No undeclared endpoint accessible | ✅ |
| API denylist verified | ✅ nested + collection + a real violation caught |
| Audit behaviour | ✅ **explicitly deferred**, §6 |
| Database changes via new migration only | ✅ no change made |
| Flyway validate PASS | ✅ 22 migrations |
| Phase 7.3 regression PASS | ✅ 143/143 |
| Phase 7.4 security tests PASS | ✅ 49/49 |
| Application startup PASS | ✅ |
| `git diff --check` PASS | ✅ |
| No secrets introduced | ✅ |
| No legacy database touched | ✅ |
| No files outside `C:\Kas-Web` touched | ✅ |
| Phase 7.4 document created | ✅ this document |
| README updated | ✅ |
| Nothing committed/pushed | ✅ |

---

## 13. Phase 7.5 recommendation

**Do not start 7.5 until §5.3 is answered.** The 2FA decision blocks staff
onboarding, and every admin surface after this phase assumes a staff account
exists.

Suggested order once it is:

1. **2FA mechanism + V22** for its storage, then enrolment and verification.
2. **Rate limiting and lockout thresholds** (doc 58 §10) — these are the controls
   currently missing from a publicly reachable login endpoint.
3. **Staff login route** added to doc 58, then implemented.
4. **Registration, email verification and password reset**, together with the
   email transport they all need.

Inventory remains untouched and is not recommended next: it depends on business
configuration that is still outstanding.
