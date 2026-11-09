# 91 — Phase 7.4b: Security Decision & 2FA Amendment

**Type:** Focused security amendment — **not an implementation phase**
**Status:** **SUPERSEDED** by owner decision [150](150-owner-decision-no-2fa.md), dated 2026-10-20. The analysis below records the former proposal and is not current policy.
**Scope:** 2FA mechanism · recovery · staff auth route · rate limiting · lockout · session lifetimes · V22 · audit
**Last updated:** 2026-08-16

> **No code was written. No migration was written. No database object was
> changed.** The only artefacts are this document and an index update.
>
> **Nothing here invents a numeric security threshold.** Every value is either
> traced to a frozen document, marked `PROPOSED`, or registered as an open
> question for the owner.

---

## 1. What this amendment closes

Phase 7.4 shipped authentication, RBAC and scope enforcement, and ended with one
blocker: **`SUPER_ADMIN` cannot authenticate**, because doc 06 §5.2, doc 59 §8
and doc 10 §5.1 all require 2FA for it and no document says what 2FA *is*.

This amendment answers the ten questions needed to finalise that, and separates
three things Phase 7.4 found tangled together:

| | |
|---|---|
| **Frozen** | Stated in a Phase 1–6 document. Binding |
| **PROPOSED** | Recommended here, clearly labelled. Not binding until approved |
| **OPEN** | A value or decision the business/security owner must supply |

---

## 2. What the frozen documents already decide

Before recommending anything, here is what is **not** open. These constrain every
option below.

| Requirement | Source | Status |
|---|---|---|
| 2FA **mandatory** for `SUPER_ADMIN` | doc 06 §5.2 · doc 59 §8 · doc 10 §5.1 and §6 | Frozen (marked PROPOSED in 06, restated as a requirement in 10 §6) |
| 2FA **strongly recommended**, not mandatory, for `ADMIN` | doc 06 §5.2 · doc 59 §8 | Frozen |
| 2FA **optional and FUTURE** for customers | doc 06 §5.1 | Frozen — see §11 |
| No self-registration for staff; `SUPER_ADMIN` creates staff accounts | doc 06 §5.2 · doc 59 §8 | Frozen |
| **Separate login route** for staff | doc 06 §5.2 · doc 59 §8 · doc 10 §5.1 | Frozen — but see §7 |
| Self-hosted auth, **no external dependency on the login path** | doc 11 (auth build-vs-buy) · doc 12 (rejected alternatives) | Frozen |
| Secrets live in a **secret manager**, never the database, rotated, write-only in the admin UI | doc 10 §5.1 · doc 51 §6 | Frozen |
| Rate limiting applies to **login, registration, password reset, booking submission, review submission, search** | doc 10 §5.1 | Frozen (the events) |
| Login rate limiting is **per IP and per account** | doc 58 §10 | Frozen (the dimensions) |
| Failed logins produce **progressive delay, then temporary lock** | doc 06 §6 · doc 10 §5.1 · doc 58 §10 | Frozen (the shape) |
| `SUPER_ADMIN` can **manage 2FA** and force password reset | doc 09 (staff administration) | Frozen |
| Privileged actions are audit-logged: actor, action, target, before/after, timestamp, IP | doc 59 §7.6 | Frozen |
| Step-up re-authentication for destructive actions | doc 06 §5.2 · doc 10 §5.1 | Frozen — not in this amendment's scope |

**What no frozen document supplies:** the 2FA *mechanism*, recovery policy, any
numeric threshold for rate limiting or lockout, and the concrete staff route.
Doc 16 contains **no open question** covering any of them — they were never
registered. §14 registers them.

---

## 3. 2FA mechanism — evaluation

### 3.1 The four candidates against KAS's actual constraints

| | **A. TOTP** | **B. WebAuthn / passkeys** | **C. Email OTP** | **D. SMS OTP** |
|---|---|---|---|---|
| Phishing resistance | Low — a code can be relayed | **High** — origin-bound | Low | Low |
| External provider on the login path | **None** | **None** | Mail provider | SMS gateway |
| Works offline | Yes | Yes | No | No |
| Implementation complexity | Low — RFC 6238 | **High** — attestation, RP ID, credential lifecycle, cross-device UX | Low | Low |
| Recovery complexity | Recovery codes | Second authenticator **or** recovery codes | — | — |
| Operational burden on a tiny team | Low | **Device loss is severe** | Low | Ongoing cost, SIM-swap |
| Storage required | Encrypted secret + replay counter | Credential id, public key, sign count, transports, AAGUID | None | None |
| Available to KAS today | Yes | Yes | **No — no email transport exists** | **No — doc 51 C8 unresolved** |

### 3.2 Two candidates disqualify themselves

**C. Email OTP — rejected on principle, not merely on practicality.** A second
factor must be a *different* factor. The `SUPER_ADMIN`'s email is the same
channel that would carry a password reset, so an attacker holding the mailbox
holds both factors and 2FA adds nothing. It is also unbuildable today: Phase 7.4
deferred registration, verification and password reset precisely because KAS has
no email transport.

**D. SMS OTP — rejected.** It puts a third-party gateway on the login path, which
doc 11 (auth build-vs-buy) chose self-hosted auth specifically to avoid, and
doc 12 lists "external dependency on login" among the reasons a managed auth
provider was rejected. Credentials for SMS/Zalo are doc 51 **C8 — future,
unsupplied**. SIM-swap is a live risk in the region.

### 3.3 TOTP vs WebAuthn — the real decision

WebAuthn is **objectively the more secure mechanism**: it is phishing-resistant
and TOTP is not. That is a genuine advantage, and this amendment does not pretend
otherwise.

It is nevertheless not recommended for V1, for one reason that outweighs it here:

> **KAS has effectively one `SUPER_ADMIN`, and doc 06 §5.2 / doc 59 §8 make that
> account the only way to create any other staff account.** A locked-out
> `SUPER_ADMIN` is a total operational lockout of the platform. WebAuthn
> concentrates that risk in a physical device whose loss is unrecoverable without
> a second enrolled authenticator — which a one-person admin team is unlikely to
> maintain in practice.

TOTP's weakness is mitigated in this specific setting: the admin surface is a
separate route (§7), is `noindex`, and has a small, known set of users. Its
recovery story — printed one-time codes — is one a small hospitality operator can
actually execute.

### 3.4 Recommendation

> **PROPOSED — OQ-089.** Use **TOTP (RFC 6238)** as the V1 second factor for
> `SUPER_ADMIN`. Model the credential store as **factor-type agnostic** from the
> start (§10), so WebAuthn can be added later as an additional factor type
> without a second migration or a re-enrolment of existing users.

This follows a pattern KAS has used repeatedly — `rate_plan_id` as a null hook
(doc 52 §6), `PARTNER` scope added before a second partner exists (doc 85 §2.3):
model the extension point now, build only what V1 needs.

**This is a recommendation, not a frozen decision.** No document chooses a
mechanism, and this amendment does not claim one does.

---

## 4. Enrolment, verification and disabling

The flows below apply **if OQ-089 is approved as TOTP**. They are described so
implementation carries no ambiguity, not so implementation can begin.

### 4.1 Enrolment

| Step | Behaviour |
|---|---|
| 1. Initiation | Authenticated `SUPER_ADMIN` requests enrolment. Password re-entry is required — this is a step-up action (doc 06 §5.2) |
| 2. Secret generation | 160-bit secret from `SecureRandom`, base32-encoded. Held in a **pending, unactivated** credential row |
| 3. QR provisioning | An `otpauth://totp/` URI is returned **once**, in the enrolment response only. Rendered client-side; the server does not generate or store an image |
| 4. Manual key | The same base32 secret is shown once alongside the QR, for authenticator apps that cannot scan |
| 5. First-code verification | The user submits a current code. It must verify against the pending secret before anything is activated |
| 6. Activation | On success: credential activated, `app_user.two_factor_enabled = true`, recovery codes issued (§5), audit event written |
| 7. Session during enrolment | Enrolment happens inside an already-authenticated session. **No new session is issued and no privilege changes** until activation |
| 8. Failure | A wrong first code leaves the credential pending and activates nothing. Repeated failures are rate-limited as an authentication event (§8) |
| 9. Re-enrolment | Replacing a credential is a fresh enrolment. It **invalidates the previous credential and all outstanding recovery codes**, and revokes all other sessions — doc 06 §6 applies the same rule to a password change |
| 10. Disabling | Only `SUPER_ADMIN` may disable 2FA (doc 09, staff administration). **Disabling 2FA on a `SUPER_ADMIN` account is refused** — the requirement is mandatory, so the account cannot opt out. Disabling on an `ADMIN` account is permitted, since doc 06 §5.2 makes it recommended rather than mandatory |

### 4.2 Verification at login

```
email + password  ->  verified
        |
        v
account state checked (ACTIVE, not locked)
        |
        v
does the actor's role require a second factor?
        |
        +-- no  -> session issued
        |
        +-- yes -> is an ACTIVATED credential present?
                     |
                     +-- no  -> REFUSE (fail closed). No session.
                     |
                     +-- yes -> second-factor challenge
                                  |
                                  +-- valid TOTP code     -> session issued
                                  +-- valid recovery code -> session issued, code consumed
                                  +-- otherwise           -> REFUSE
```

**No session, no cookie and no token is issued at any point before the second
factor succeeds.** The intermediate state is a short-lived challenge that confers
no authority.

Replay prevention: the last accepted time-step is recorded on the credential, and
a code from that step or earlier is refused. The accepted clock-drift window is
**configuration, not a constant** — OQ-089a.

### 4.3 Secret protection — encrypted, not hashed

**Why hashing is insufficient:** verification recomputes an HOTP value from the
shared secret. A one-way hash makes that arithmetic impossible. A TOTP secret is
a *shared* secret, unlike a password, and must be recoverable by the server.

| Concern | Decision |
|---|---|
| What is encrypted | The TOTP secret, at rest, in the credential row |
| What is hashed instead | Recovery codes — one-time, never needing recovery (§5) |
| Where the key comes from | A **secret manager**. Doc 10 §5.1 and doc 51 §6 already freeze this: "Secrets — in a secret manager; never in the repository; rotated; write-only in admin UI" |
| Never stored in the database | The encryption key, the plaintext secret, the `otpauth://` URI, any QR image, any recovery code in plaintext |
| Never logged | All of the above, plus submitted codes |

**Operational dependency, not a decision this amendment makes:** which secret
manager, and the key rotation procedure. Doc 51 §6 fixes the *class* of storage;
the product and the runbook are **OQ-095**. Implementation must fail closed and
loudly — the same `CONFIG_MISSING` mechanism Phase 7.3 built — when the key is
absent, exactly as the JWT signing secret does today.

---

## 5. Recovery codes

**Required.** Without them, a lost authenticator permanently locks the only
account that can create staff accounts.

| Property | Decision |
|---|---|
| Issued | At 2FA activation, and on explicit regeneration |
| Quantity | **PROPOSED: 10.** No frozen document supplies a number — **OQ-090** |
| Generation | `SecureRandom`, independent of the TOTP secret |
| Storage | **Argon2id hashes**, using the existing `PasswordEncoder` bean. Never plaintext |
| Usage | **One time.** A consumed code is marked used, never deleted, so history survives |
| Display | Shown **once**, in the response that issues them. Never retrievable afterwards through any endpoint |
| Regeneration | `SUPER_ADMIN` only, as a step-up action. **Invalidates every outstanding code** |
| Invalidation | All codes are invalidated on re-enrolment, on 2FA disable, and on regeneration |
| Audit | Issuance, consumption, exhaustion and regeneration are audited (§13). Consumption is **security-significant** — it means the primary factor failed |
| Exhaustion | When the last code is consumed the account still authenticates, but the event is audited and should alert. Zero remaining codes is **not** a lockout |

---

## 6. `SUPER_ADMIN` failure mode — no bypass

The rule is unchanged and absolute:

> **No password-only `SUPER_ADMIN` login.**

Fail closed in every case: not enrolled, disabled, invalid code, credential
missing, encryption key absent, or mechanism misconfigured. The response is the
same uniform `401` Phase 7.4 already returns for every authentication failure;
the real reason is logged server-side against the correlation id.

**No `?skip2fa=true`, no `?emergency=true`, no bypass header, no environment flag
and no "development mode" exception.** A bypass that exists in code exists in
production.

### 6.1 Emergency recovery is an operational procedure

If both the authenticator and all recovery codes are lost, recovery is a
**controlled administrative action outside the application**, not an API:

1. Out-of-band identity verification of the requester, by a procedure the owner
   defines.
2. A database administrator, acting with credentials **separate from the
   application runtime role** — `kas_web_app` cannot do this, it is least
   privilege by design (doc 88 §2) — deactivates the credential row.
3. The action is recorded outside the application, because the actor is not an
   application user.
4. The account re-enrols at next login, which is itself audited.

This requires a written runbook and a named approver — **OQ-096**. It is
deliberately awkward: an easy emergency path is an attacker's easiest path.

---

## 7. Staff authentication route — a doc 58 omission

### 7.1 The finding

**Three frozen documents require a separate staff route:**

- doc 06 §5.2 — "Separate login route from the customer site"
- doc 59 §8 — "Staff login is a distinct route from the customer site"
- doc 10 §5.1 — "Admin hardening | **Separate route**, mandatory 2FA for `SUPER_ADMIN`…"

**Doc 58 defines none.** §3.4 places `/login`, `/logout` and `/refresh` under the
Public Customer surface, and §8 (Admin / Platform API) lists no authentication
endpoints at all.

### 7.2 Assessment: omission, not conflict

This is **not** a contradiction between documents. Doc 58 does not say staff
*must* use the public route; it simply never enumerates the staff one. Three
documents state a requirement that the fourth did not express as a path.

Phase 7.4 therefore implemented staff login on `/api/v1/public/auth/login`,
because inventing an endpoint name was forbidden. That is a **known deviation
from doc 06 §5.2, doc 59 §8 and doc 10 §5.1**, and is recorded as such.

### 7.3 Decision required

> **This requires an approved amendment to doc 58 §8.** It is not something this
> phase can resolve alone: doc 58 is the frozen API contract, and adding a route
> to it is a contract change. **OQ-091.**

**PROPOSED recommendation, pending that amendment:** add
`POST /api/v1/admin/auth/login`, `/refresh` and `/logout` to doc 58 §8, mirroring
§3.4. That delivers what the three requiring documents are reaching for — the
admin route can carry stricter rate limits, `noindex`, tighter cookie scoping,
separate monitoring, and eventually IP allowlisting (doc 06 §5.2, FUTURE) — none
of which can be applied selectively while staff and guests share one path.

The customer route is unchanged either way.

---

## 8. Rate limiting — architecture frozen, values open

### 8.1 What is decided

| Aspect | Decision | Status |
|---|---|---|
| Which events | Login, registration, password reset, booking submission, review submission, search | **Frozen** — doc 10 §5.1 |
| Login dimensions | **Per IP and per account**, independently | **Frozen** — doc 58 §10 |
| Additional 2FA events | Second-factor verification and recovery-code use are rate-limited as authentication events | **PROPOSED** — they are login attempts by another name |
| Successful login | **Resets the per-account counter. Does NOT reset the per-IP counter** | **PROPOSED** — otherwise one valid credential clears the shield for an address doing credential stuffing |
| Counting | Refusals count. A request already rejected by the limiter does not extend the window unless the owner decides otherwise | **PROPOSED** |
| Storage | **In-process for V1.** Doc 10 (sizing, OQ-037) puts concurrent public sessions at "peak in the low hundreds", and V1 runs a single instance | **PROPOSED** |
| Distribution | Redis becomes **required** when more than one application instance runs — an in-process limiter is per-instance and silently multiplies the effective limit by the instance count. Doc 12's recommended stack table already includes Redis, so this is adoption, not a new dependency | **PROPOSED** |
| Limiter unavailable | With an in-process limiter there is no availability failure mode. **When distributed limiting is introduced, authentication endpoints must fail closed** and content endpoints may fail open — that decision belongs with that change | **PROPOSED** |
| Response | `429 RATE_LIMITED` | **Frozen** — doc 58 §2.1 |

### 8.2 What is not decided

> **No threshold is proposed here.** Not attempts, not windows, not durations.
> Doc 58 §10 marks the whole table `PROPOSED` and supplies no numbers, and this
> amendment will not invent them. **OQ-092.**

Every threshold becomes a named configuration value that fails loudly when
absent, using the mechanism Phase 7.3 built. **The architecture can be
implemented before the values exist; it cannot be enabled without them.**

---

## 9. Account lockout

### 9.1 The frozen shape

Three documents agree, and they exclude permanent lockout:

- doc 06 §6 — "Failed logins | **Progressive delay, then temporary lock**; alert the account owner by email"
- doc 10 §5.1 — "progressive lockout"
- doc 58 §10 — "Progressive lockout"

**Permanent lockout is therefore already excluded by the frozen documents** and is
not evaluated further. Administrative unlock remains available to `SUPER_ADMIN`
through account status (doc 09, staff administration).

### 9.2 Why progressive delay plus temporary lock is the right shape

Rate limiting alone leaves a slow, distributed attack unbounded per account.
Aggressive lockout creates the opposite problem — a denial of service: **anyone
who knows a staff email can lock that account out by failing logins
deliberately.** For KAS this is acute, because locking the single `SUPER_ADMIN`
would stop staff administration entirely.

The frozen shape resolves the tension correctly:

- **per-IP rate limiting** absorbs a bulk attack without touching the account;
- **progressive delay** makes per-account guessing uneconomic while staying
  invisible to a legitimate user who mistypes once;
- **temporary lock** bounds the worst case and expires without intervention, so a
  malicious lockout is a nuisance rather than an outage.

### 9.3 Storage — no migration needed

`app_user.failed_login_count` and `app_user.locked_until` already exist and are
sufficient. Phase 7.4 already maintains the counter and honours an operator-set
`locked_until`; only the automatic transition is missing, and it is missing
because it needs a threshold.

> **No threshold, delay curve or lock duration is proposed. OQ-093.**

---

## 10. V22 — REQUIRED, with evidence

### 10.1 Evidence

The complete 2FA-related storage in the frozen schema is:

```
app_user.two_factor_enabled   boolean NOT NULL
```

Verified by query against `kas_web_dev`: **no column anywhere in schema `kas`
matches `%factor%`, `%totp%`, `%otp%`, `%recovery%`, `%mfa%` or `%secret%`** other
than that one flag.

A boolean cannot hold the encrypted secret, enrolment state, activation
timestamp, the last-accepted time-step needed for replay prevention, or any
recovery code. There is no other table to put them in: `system_setting` is global
configuration rather than per-user credentials, and `user_session` is session
state.

> **V22 IS REQUIRED.** 2FA cannot be represented safely with the existing schema.
> **It is not written in this amendment** — the phase brief limits this to
> decisions, and a migration should follow the approved mechanism, not precede it.

### 10.2 Specification for V22, when approved

Two tables, deliberately **factor-type agnostic**, so adding WebAuthn later is a
new row type rather than a new migration.

**`user_mfa_credential`**

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `user_id` | uuid FK to `app_user`, **ON DELETE CASCADE** |
| `type` | enum `mfa_credential_type` — `TOTP` in V1; the enum is the extension point |
| `secret_encrypted` | bytea. **Encrypted**, never plaintext, never hashed (§4.3) |
| `status` | enum — `PENDING`, `ACTIVE`, `REVOKED`. A pending credential grants nothing |
| `last_used_step` | bigint, nullable. TOTP replay prevention |
| `activated_at`, `created_at`, `revoked_at` | timestamptz |

Constraints: **at most one `ACTIVE` credential per (user, type)**, as a partial
unique index — the same technique V21 used to close the global-policy gap.
`secret_encrypted NOT NULL` when `type = 'TOTP'`. Index on `(user_id) WHERE
status = 'ACTIVE'`.

**`user_recovery_code`**

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `user_id` | uuid FK to `app_user`, **ON DELETE CASCADE** |
| `code_hash` | text, **Argon2id**. Unique |
| `used_at` | timestamptz, nullable. Consumption marks, never deletes |
| `created_at`, `invalidated_at` | timestamptz |

Index on `(user_id) WHERE used_at IS NULL AND invalidated_at IS NULL`.

**Ownership:** both tables are SECURITY class (doc 52 §1) — never cached, never
public, never present in any response type. Every column name above must join the
doc 58 §9 denylist family alongside `passwordHash` and `refreshTokenHash`.

**Compatibility:** additive only. No existing table, column or constraint is
touched, so V1–V21 remain untouched and `flyway validate` stays clean.
`app_user.two_factor_enabled` is retained as the fast "does this account require
a challenge" flag, derived from credential state.

### 10.3 What V22 must NOT include

`audit_log.correlation_id` and `audit_log.scope` remain **deferred**, unchanged
from doc 89 §8 and doc 90 §6. Doc 59 §7.6 lists what a privileged action must
record — actor, action, target, before/after, timestamp, IP — and every one of
those has a column. They are convenient, not required, and doc 90 declined to
create a migration for that reason. **Bundling them into V22 because a migration
is happening anyway would be exactly that mistake with better timing.**

---

## 11. Customer authentication — explicitly unchanged

Doc 06 §5.1 is unambiguous: customer 2FA is **"Optional — FUTURE"**.

Nothing in this amendment applies to customers. Specifically **not** proposed and
**not** implied: mandatory customer TOTP, mandatory customer WebAuthn, social
login, OAuth, Google/Apple/Facebook login, or phone/OTP login. Social and Zalo
login remain doc 06 §5.1 / OQ-026 **FUTURE**; SMS credentials remain doc 51 C8.

Customer session semantics are unchanged.

---

## 12. Session lifetimes — remain PROPOSED

Doc 06 §5.3 supplies the only numbers in any frozen document — customer access
15 min / refresh 30 days; staff access 15 min / refresh 12 h — and marks them
`PROPOSED`.

> **Decision: retained as PROPOSED, held as configuration. Not frozen here.**
> **OQ-094.**

They are already implemented as `kas.security.*` configuration rather than
constants, so confirming or changing them is a configuration change requiring no
code edit. This amendment does not promote a PROPOSED value to policy on the
business's behalf.

---

## 13. Audit — existing model, no schema change

Doc 59 §7.6 and doc 09 (audit log) are the authority and are sufficient.
`audit_log.action` and `entity_type` are `text`, so **new event types need no
migration and no enum change** — audit events are data.

Security events to record, all within the existing model:

| Event | Why |
|---|---|
| Login succeeded / failed | doc 59 §7.6 |
| Logout · session revoked · sign-out-everywhere | Doc 09 — `SUPER_ADMIN` views and revokes sessions |
| 2FA enrolment started / activated / re-enrolled | Doc 09 — `SUPER_ADMIN` manages 2FA |
| 2FA verification succeeded / failed | Repeated failures are the signal of a stolen password |
| **Recovery code consumed / exhausted / regenerated** | The primary factor failed. The most security-significant event in this amendment |
| 2FA disabled | A privilege-reducing change to a security control |
| Account locked / administratively unlocked | Doc 09 |
| Emergency out-of-band recovery | Recorded outside the application (§6.1) — the actor is not an application user |

**Never in an audit payload:** TOTP secrets, submitted codes, recovery codes,
tokens, password material. Phase 7.3's `SensitiveKeyRedactor` already strips these
key names on the way in, which matters because `audit_log` rejects UPDATE and
DELETE — anything written there is permanent.

---

## 14. Open questions registered

New. Doc 16 contains no entry for any of these; they should be added to it on
approval, which this amendment does not do unilaterally.

| ID | Category | Question | Blocks |
|---|---|---|---|
| **OQ-089** | Security | Approve **TOTP** as the V1 second factor for `SUPER_ADMIN`? | `SUPER_ADMIN` login, V22 |
| **OQ-089a** | Security | Accepted TOTP clock-drift window | 2FA verification |
| **OQ-090** | Security | Number of recovery codes issued (**PROPOSED: 10**) | 2FA activation |
| **OQ-091** | API contract | Amend doc 58 §8 to add a staff authentication route? | Doc 06 §5.2, 59 §8, 10 §5.1 compliance |
| **OQ-092** | Security | Rate-limit thresholds and windows per event | Enabling rate limiting |
| **OQ-093** | Security | Progressive-delay curve and temporary-lock duration | Enabling automatic lockout |
| **OQ-094** | Security | Confirm or change the doc 06 §5.3 session lifetimes | Promoting them from PROPOSED |
| **OQ-095** | Operational | Which secret manager, and the key rotation procedure | TOTP secret encryption |
| **OQ-096** | Operational | Emergency 2FA recovery runbook and named approver | §6.1 |
| **OQ-097** | Security | Should `ADMIN` 2FA move from "strongly recommended" to mandatory? | Currently recommended only — doc 06 §5.2 |

---

## 15. Security properties — frozen vs open

| Property | Status |
|---|---|
| 2FA mandatory for `SUPER_ADMIN` | **Frozen** — doc 06 §5.2, 59 §8, 10 §6 |
| No password-only `SUPER_ADMIN` login, no bypass | **Frozen here.** Non-negotiable |
| 2FA for `ADMIN` | Open — strongly recommended, not mandatory. OQ-097 |
| 2FA for customers | **Frozen** — optional, FUTURE. Not in scope |
| 2FA for future staff roles | Open — inherits `ADMIN`'s answer via OQ-097 |
| Mechanism (TOTP) | **PROPOSED** — OQ-089 |
| Recovery via one-time codes | **PROPOSED**, quantity OQ-090 |
| Secret encrypted at rest, key from a secret manager | **Frozen** — doc 10 §5.1, doc 51 §6. Product is OQ-095 |
| Staff login route | **Requires a doc 58 amendment** — OQ-091 |
| Rate-limit architecture | Events and dimensions frozen; thresholds OQ-092 |
| Lockout architecture | Shape frozen (progressive then temporary); thresholds OQ-093 |
| Session lifetimes | Remain PROPOSED — OQ-094 |
| V22 | **REQUIRED**, specified, **not written** |
| Audit events | Existing model sufficient, no schema change |
| `correlation_id` / `scope` on `audit_log` | **Still deferred** |

---

## 16. Unchanged by this amendment

**The partner model is untouched.** 1 Partner to N Properties. V1: one
Partner/Sales, eight properties. Partner/Sales remains **one** role — `ADMIN`
holding `PARTNER` scope (doc 59 §2, doc 85 §5.1: `PARTNER` is a scope kind, not a
role). No account per hotel, no role per hotel, no per-property permission set, no
hard-coded property id.

**No role was invented. No permission was invented. No scope rule was invented.**
The doc 59 §4 catalogue is unchanged. 2FA is an *authentication* control and
grants nothing — it gates whether a session is issued, never what that session may
do.

---

## 17. Exit criteria

| Criterion | Status |
|---|:--:|
| 2FA requirement explicitly decided | Yes — mandatory for `SUPER_ADMIN` |
| Mechanism decided or explicitly left open | Yes — TOTP **PROPOSED**, OQ-089 |
| Password-only `SUPER_ADMIN` login remains prohibited | Yes |
| Enrolment flow documented | §4.1 |
| Verification flow documented | §4.2 |
| Recovery mechanism documented | §5, §6.1 |
| Recovery code policy documented | Yes, quantity PROPOSED |
| Secret protection documented | §4.3, including why hashing fails |
| Staff route resolved or flagged | **Flagged** — doc 58 amendment, OQ-091 |
| Rate-limit architecture resolved | §8 |
| Numeric thresholds NOT invented | Yes — none proposed |
| Lockout architecture resolved | §9 |
| Session lifetime status documented | Remain PROPOSED |
| Audit requirements reviewed | Existing model |
| V22 requirement decided | **REQUIRED**, specified, unwritten |
| Partner to N Properties unchanged | Yes |
| `ADMIN` + `PARTNER` scope unchanged | Yes |
| No frozen migration modified | Yes |
| No legacy database touched | Yes — none connected |
| No implementation started | Yes — zero code |
| Documentation consistency validated | §18 |
| `git diff --check` PASS | Yes |
| No secrets introduced | Yes |
| Phase 7.5 NOT started | Yes |

---

## 18. Consistency validation

| Check | Result |
|---|---|
| Every decision traces to a frozen document or is labelled PROPOSED/OPEN | §2 lists sources; §14 lists what is open |
| No hidden contradiction | One is surfaced explicitly: the doc 58 staff-route omission (§7), assessed as an omission rather than a conflict, with evidence from three documents |
| No role invented | Yes |
| No permission invented | Yes |
| No scope rule invented | Yes |
| No schema change proposed without evidence | §10.1 is a query result, not an assumption |
| No security threshold invented | OQ-092 and OQ-093 left open; OQ-090 labelled PROPOSED |
| No production secret introduced | Yes |
| No legacy database touched | Yes |
| No existing migration modified | V1–V21 byte-identical |
| No implementation test claimed for unimplemented features | This document claims none |

---

## 19. Phase 7.5 readiness

**Phase 7.5 (Central Inventory) is not blocked by this amendment.** Inventory
depends on the authorization layer, which Phase 7.4 delivered and verified;
`ADMIN` + `PARTNER` scope reaches all eight properties today.

Two caveats the owner should weigh:

1. **`SUPER_ADMIN` still cannot log in** until OQ-089 is approved and V22 built.
   Inventory work does not need `SUPER_ADMIN`, but no new staff account can be
   created while it stands.
2. **Inventory has its own blockers this amendment does not touch** — room types
   (doc 51 A1), room quantities (A2) and OTA safety buffer values (B3) are all
   still unsupplied, and doc 88 §11 records `INVENTORY_HORIZON_MONTHS` as `NULL`.
   Those are the binding constraints on 7.5, not security.
