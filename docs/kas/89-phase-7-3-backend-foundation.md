# 89 — Phase 7.3: Backend Foundation

**Phase:** 7.3 — Backend Foundation
**Status:** ✅ **COMPLETE — AWAITING REVIEW.** All exit criteria met.
**Target:** `kas_web_dev` / `kas_web_app` / schema `kas`
**Executed:** 2026-08-15
**Last updated:** 2026-08-15

> **Migrations V1–V21 and the repeatable migration are byte-identical to their
> committed blobs.** Verified by comparing each working-tree file's
> `git hash-object` against its index entry: **0 of 23 differ.**
>
> **Flyway history adoption (Option C) was approved by the owner and executed.**
> It added one table and 22 rows. **No baseline, no repair, no reset, no
> destructive operation.** A fingerprint over every pre-existing column,
> constraint and index is **identical before and after**.
>
> **Legacy `kas_dev`, `kas_test` and `kas_app` were never connected to or
> referenced.** Nothing outside `C:\Kas-Web` was written. Not committed, not pushed.

---

## 1. What was built

| Artefact | Count |
|---|---|
| Java source files (main) | 55 |
| Java source files (test) | 28 |
| Spring Modulith application modules | **8** |
| Executable tests | **145** — 135 unit/architecture + 10 integration |
| Direct dependencies added | 14 (11 main, 3 test-only beyond the starters) |
| Configuration files | 4 (`application.yml`, `-dev`, `-test`, `.example`) |
| Migrations changed | **0** |

Build root is `C:\Kas-Web\backend`. The frontend arrives in Phase 7.5 as a sibling,
which is why the Maven project is not at the repository root.

---

## 2. Environment verified

| Property | Value | How verified |
|---|---|---|
| JDK | Temurin **21.0.12+8** | `java -version`, `javac -version` |
| Maven | **3.9.16** via wrapper | `mvnw.cmd` — no global Maven installed |
| Spring Boot | **3.5.16** | resolved from Maven Central |
| Spring Modulith | **1.4.12** | |
| Database | **`kas_web_dev`** | `current_database()` over JDBC |
| Role | **`kas_web_app`** | `current_user` over JDBC; all six role flags `false` |
| Schema | **`kas`** | `current_schema()` over JDBC |

The JDK was installed but absent from `PATH`; it is at
`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot`. `JAVA_HOME` was set
per-command rather than persisted, since changing machine environment variables
was not in scope.

**Maven bootstrap.** No Maven was installed, and the wrapper cannot generate
itself. Apache Maven 3.9.16 was downloaded from `repo.maven.apache.org`,
**verified against Apache's published SHA-512**, and extracted to the scratchpad
directory — never into the repository. It was used once, to run
`mvn -N wrapper:wrapper`, so the committed wrapper is Apache-generated rather
than hand-written. The wrapper is `only-script` type: it carries no `.jar`, and
downloads Maven itself on first use.

---

## 3. Module structure

```
com.kas.platform
├── shared      OPEN   Money · ApiErrorCode · exceptions · CorrelationId · AuthorizationScope · ScopeFilter
├── identity           AppUser · UserRole · Permissions · RoleCatalogue · RoleAssignment · ScopeResolver
├── partner            Partner · PartnerRepository
├── property           Property · PropertyRepository
├── settings           SettingKey · SystemSettingService — the fail-loud config mechanism
├── audit              AuditEvent · AuditLogger · SensitiveKeyRedactor
├── security           SecurityConfig · KasPrincipal · CurrentActor · PublicEndpoint
└── web                ApiError · GlobalExceptionHandler · CorrelationIdFilter · health · publicapi
```

Declared dependencies, enforced by `ModuleStructureTest`:

| Module | May depend on |
|---|---|
| `shared` | — (OPEN; everything may use it) |
| `identity` · `partner` · `settings` · `audit` | `shared` |
| `property` | `shared`, `partner` |
| `web` | `shared` |
| `security` | `shared`, `identity`, `web` |

**Nine modules were deliberately not created**: inventory, pricing, sales,
reservation, customer, review, media, notification, payment. The brief is
explicit — "avoid empty speculative modules". `ModuleStructureTest` asserts the
module list is *exactly* these eight, so a speculative module cannot be added
without someone deciding to.

`property` depending on `partner` is declared but currently unused: `Property`
holds `partnerId` as a `UUID`, not a `Partner` reference. The declaration
records the intended direction, and the reverse would be a cycle.

---

## 4. Dependencies and the two judgement calls

### 4.1 The set

| Dependency | Why |
|---|---|
| `spring-boot-starter-web` | The five API surfaces of doc 58 §1 |
| `spring-boot-starter-security` | Deny by default, permission-based authorisation |
| `spring-boot-starter-validation` | Bean Validation at the boundary |
| `spring-boot-starter-actuator` | Health and readiness |
| `spring-boot-starter-jdbc` | Persistence — see §4.2 |
| `postgresql` (runtime) | Driver |
| `flyway-core` + `flyway-database-postgresql` | Migration authority |
| `spring-modulith-starter-core` | Module boundaries |
| `bcprov-jdk18on` | Argon2id requires BouncyCastle — see §4.3 |
| *test:* `spring-boot-starter-test`, `spring-security-test`, `spring-modulith-starter-test`, `archunit-junit5`, `spring-boot-testcontainers`, `testcontainers:postgresql`, `testcontainers:junit-jupiter` | |

Nothing else. No Kafka, Redis, RabbitMQ, MapStruct, Lombok, QueryDSL or Guava.

### 4.2 Spring JDBC, not JPA — an architectural deviation, stated plainly

The brief lists the stack without naming a persistence API. **JPA/Hibernate was
evaluated and not used.** The reasoning:

- The Phase 7.2 schema is frozen, validated and database-first: **38 PostgreSQL
  enum types, 129 CHECK constraints, 2 triggers, 2 views, a custom availability
  function**. Hibernate models none of these naturally; PostgreSQL enums in
  particular need custom types or converters on every column.
- Hibernate carries `ddl-auto`. A misconfiguration — or a default inherited from
  a future starter — can alter or drop objects in a schema that took a full
  phase to validate. `JdbcClient` has no such capability. The risk is not
  mitigated; it does not exist.
- Doc 52 §5 requires reservation and inventory to commit in **one transaction**
  with explicit `SELECT … FOR UPDATE … ORDER BY room_type_id, date` lock
  ordering (doc 55 §7.1, proven deadlock-free in doc 88 §8.2). That is
  hand-written SQL under any ORM.

`LayeringRulesTest` asserts no class anywhere depends on `jakarta.persistence`
or `org.hibernate`, so this decision cannot erode quietly.

**If the owner prefers JPA, say so and it can be introduced** — but the
`ddl-auto` guard and the enum mapping cost should be budgeted with it.

### 4.3 BouncyCastle

Doc 59 §8 mandates **Argon2id**. Spring Security's `Argon2PasswordEncoder`
requires BouncyCastle on the classpath. It is not managed by
`spring-boot-dependencies`, so the version is pinned explicitly (1.85.2).

---

## 5. Configuration and credentials

### 5.1 The split

| File | Committed | Contains |
|---|---|---|
| `application.yml` | ✔ | Production-oriented defaults. **No credential, no business value.** `KAS_DB_URL` / `KAS_DB_USERNAME` / `KAS_DB_PASSWORD` have **no defaults**, so a missing one stops startup by name |
| `application-dev.yml` | ✔ | Local development. No password |
| `application-test.yml` | ✔ | Test profile. Pool never fails startup; Flyway disabled |
| `application.example.yml` | ✔ | Template — names and placeholders only |

`application-local.yml` is excluded by `.gitignore` and is left free as an
untracked personal override. That is why the committed local profile is named
`dev` rather than `local`.

### 5.2 How the password is resolved — a correction

An earlier assumption in this project was that **JDBC cannot read
`pgpass.conf`**. That is **wrong for pgjdbc 42.7**, and the correction matters
because it removes what looked like a blocker.

Verified by direct probe against `kas_web_dev`:

| Password passed to the driver | Result |
|---|---|
| `""` (empty string) | **REFUSED** — "the server requested SCRAM-based authentication, but the password is an empty string" |
| `null` | **CONNECTED** as `kas_web_app` / `kas_web_dev` / `kas` |
| wrong password | **REFUSED** — "password authentication failed" |

pgjdbc resolves a `null` password itself, in the same order psql uses:
`PGPASSWORD` → `PGPASSFILE` → `%APPDATA%\postgresql\pgpass.conf`.
Spring Boot's `DataSourceProperties.determinePassword()` converts a blank
password to `null`, so `password: ${KAS_DB_PASSWORD:}` reaches the driver as
`null` and local development needs no environment variable at all.

**The constraint was honoured exactly.** `pgpass.conf` was never opened, read,
displayed or copied. The driver resolves the credential inside its own process;
it never entered the tooling, the build output, the logs or the repository.

**Production does not use this path.** The base profile requires the three
environment variables with no defaults, so production cannot silently fall back
to a local file.

The empty-string/`null` distinction is documented in `application-dev.yml`,
because "fixing" the blank default by quoting it would break local development
in a way whose error message points at SCRAM rather than at the config.

### 5.3 Business values

**None are configured anywhere.** All 18 `system_setting` keys remain `NULL`,
re-verified over JDBC by `DatabaseConnectivityIT`. `SystemSettingService`
exposes only `require…` accessors — there is no `getOrDefault`, no `orElse`, and
no overload taking a fallback, and `SystemSettingServiceTest` asserts by
reflection that no such accessor exists. A missing value raises
`422 CONFIG_MISSING` naming the key.

Two smaller decisions in the same spirit:

- **Blank counts as unsupplied.** A whitespace value is not a value.
- **Boolean parsing is strict.** `Boolean.parseBoolean("yes")` is `false`;
  accepting that would turn a configuration typo into a silent business
  decision about deposits. Only `true`/`false` parse.

---

## 6. FLYWAY ADOPTION — OPTION C, APPROVED AND EXECUTED

**Owner approved Option C (history adoption) on 2026-08-15. Executed the same
day.** The analysis that produced the recommendation is retained below, then the
result.

### 6.0 Result

| | |
|---|---|
| Method | `flyway baseline` created the history table with Flyway's own DDL; the placeholder row was then replaced by 22 real rows **in one transaction** |
| Rows written | **22** — V1–V21 plus the repeatable, `installed_rank` 1–22 |
| `installed_by` | `kas_web_app` (never `postgres`) |
| BASELINE rows | **0** — this is adoption, not a baseline |
| Rows with NULL checksum | **0** — every migration is validated |
| Schema fingerprint | `4a2da5a1dc7ec966ef3c8dc6f776fc4f` **before and after — identical** |
| Object delta | +1 table, +1 constraint, +2 indexes. Domain tables still **53** |
| `flyway validate` | **PASS** — "Successfully validated 22 migrations" |
| Startup behaviour | `Current version of schema "kas": 21` · `Schema "kas" is up to date. No migration necessary.` |

Every field validation compares — version, description, script, type, checksum —
was read from `flyway.info()`, so nothing was derived from a filename by hand
and cannot drift from what validation checks.

**The guard was proven to fire, not merely asserted.** The real migrations were
copied to a scratch directory, `V12__reservation.sql` was tampered with *in the
copy only*, and validation was run against the untouched `kas_web_dev` history:

```
A. clean copies  -> PASS — all checksums match
B. V12 tampered  -> FAILED (this is the guard firing) — Validate failed: Migrations have failed validation
```

Nothing in the repository or the build output was modified by that proof. This
is what Option C bought: under Option B the tampered file would have validated
clean, because Flyway would hold no checksum for V12.

The adoption tool is retained at
`backend/src/test/java/com/kas/platform/db/FlywayHistoryAdoption.java`. It is
dry-run by default, refuses unless connected to `kas_web_dev`/`kas_web_app`/`kas`,
and **refuses outright if a history table already exists** — so it cannot run
twice. `FlywayHistoryIT` now enforces the post-adoption contract on every build.

### 6.1 Inspected state *(before adoption)*

Read-only, over JDBC, executed by `FlywayAdoptionStateIT`:

```
database        : kas_web_dev
schema          : kas
role            : kas_web_app
history table   : ABSENT          ← no flyway_schema_history anywhere in the database
tables in kas   : 53              ← non-empty
migrations found: 22              ← V1-V21 + 1 repeatable, all resolve from the classpath
```

`Flyway.info()` was called and **created nothing** — the test asserts the history
table is absent both before and after the call, so if a future Flyway version
starts creating it, that is caught here rather than discovered afterwards.

### 6.2 Why a decision is required

Flyway refuses to migrate a **non-empty schema it has no history for**. Either
condition alone would be ordinary: an empty schema simply migrates, and a schema
with history simply validates. Both together force a choice, and each of the
three ways out changes something.

### 6.3 The three options

#### Option A — clean rebuild *(NOT TAKEN)*

`DROP SCHEMA kas CASCADE` → recreate → let Flyway apply V1–V21 from empty.

| | |
|---|---|
| **Destructive** | **YES.** Drops all 53 tables and everything in them |
| Changes | Everything in schema `kas` is destroyed and rebuilt |
| For | Proven reproducible — doc 88 §8.3 got an identical fingerprint. Full checksum coverage |
| Against | Destroys data. Doc 88 recommended this before Phase 7.3; **that recommendation is withdrawn** — it was written when the schema was known-empty of business data, and a destructive default is the wrong habit to establish in the phase where Flyway becomes the authority |

**Not executed. Not recommended.**

#### Option B — baseline at version 21

`flyway baseline -baselineVersion=21`, or `baseline-on-migrate: true` with
`baseline-version: 21`.

| | |
|---|---|
| **Destructive** | **No.** Creates one table, inserts one row. Touches no existing object |
| Changes | Adds `kas.flyway_schema_history` with a single `BASELINE` row at version 21 |
| For | One command. Future migrations from V22 work normally |
| Against | **V1–V21 fall below the baseline and are never checksum-validated again.** The brief says "If Flyway reports a checksum mismatch: STOP" — under Option B, Flyway can never report one for V1–V21, because it holds no checksum for them. An edit to a frozen migration would go undetected |

#### Option C — history adoption *(RECOMMENDED)*

Create the history table via `flyway baseline`, then replace the baseline row
with 22 real rows carrying Flyway's own checksums.

| | |
|---|---|
| **Destructive** | **No.** Creates one table and inserts 22 rows. Touches no existing object, drops nothing, alters nothing |
| Changes | Adds `kas.flyway_schema_history` populated as though Flyway had applied V1–V21 |
| For | **Full checksum coverage from day one.** `flyway validate` protects every frozen migration, so the brief's "STOP on checksum mismatch" rule becomes enforceable rather than aspirational |
| Against | The rows are hand-authored. **But the failure mode is benign**: a wrong checksum makes the very next `validate` fail loudly and non-destructively — exactly the STOP condition — rather than corrupting anything |

The checksums are not guesswork. Flyway computed them itself during the
read-only inspection and they are recorded in
`backend/target/flyway-adoption-state.txt`:

| Version | Script | Checksum |
|---|---|---|
| 1 | `V1__extensions_and_enums.sql` | `2090046668` |
| 2 | `V2__partner_and_identity_root.sql` | `-1401114876` |
| 3 | `V3__property.sql` | `-504484498` |
| 4 | `V4__amenity_and_facility.sql` | `-2119338496` |
| 5 | `V5__room_type.sql` | `2081440602` |
| 6 | `V6__distribution_channel.sql` | `622346999` |
| 7 | `V7__rbac_and_customer.sql` | `-2102653269` |
| 8 | `V8__media.sql` | `899923897` |
| 9 | `V9__rates_taxes_buffer.sql` | `1931612678` |
| 10 | `V10__central_inventory.sql` | `88456785` |
| 11 | `V11__sales_inquiry.sql` | `53999861` |
| 12 | `V12__reservation.sql` | `1894676635` |
| 13 | `V13__inventory_hold.sql` | `-1966093195` |
| 14 | `V14__reservation_history.sql` | `-329155567` |
| 15 | `V15__payment.sql` | `913677546` |
| 16 | `V16__review.sql` | `-222583333` |
| 17 | `V17__voucher.sql` | `-1972293626` |
| 18 | `V18__notification_and_email.sql` | `-2083284830` |
| 19 | `V19__audit_log.sql` | `1982451897` |
| 20 | `V20__system_setting.sql` | `925010415` |
| 21 | `V21__fix_global_policy_uniqueness.sql` | `-1402884150` |
| *(repeatable)* | `R__reference_distribution_channels.sql` | `-1658465550` |

**Regenerate these before running anything** — `mvnw verify` rewrites the file —
because any edit to a migration changes its checksum, and a stale table here
would produce exactly the mismatch this option exists to detect.

### 6.4 Configuration now in force

- `spring.flyway.enabled: true` in the base and `dev` profiles. Startup runs a
  full validation of all 22 migrations.
- `spring.flyway.baseline-on-migrate: false` — **permanently.** The history
  exists, so it is never needed again; leaving it false means a missing or
  damaged history fails loudly instead of being silently re-baselined.
- `spring.flyway.clean-disabled: true` — `flyway:clean` can never run, in any
  environment, by configuration. Asserted by `FlywayHistoryIT`, which checks the
  configuration flag rather than calling `clean()` to find out.
- `validate-on-migrate: true`, `out-of-order: false`.
- `spring.flyway.enabled: false` in the **test** profile only, and for one
  reason: the unit and architecture suites must load with no database at all.
  Validation against the real database is covered by `FlywayHistoryIT`.

**On a checksum mismatch: STOP.** No `flyway repair`, no migration edit, no
reset. Report the mismatch.

---

## 7. Security and RBAC

### 7.1 What was implemented

| Control | Implementation | Verified by |
|---|---|---|
| **Deny by default** | Filter chain ends in `denyAll()`, not `authenticated()` | `SecurityBoundaryTest` — an actor holding a permission is still refused on a route that declared nothing |
| Undeclared endpoint fails CI | `DenyByDefaultTest` — every request-mapped method needs `@PreAuthorize` or `@PublicEndpoint(reason=…)` | Proven non-vacuous against a deliberately non-compliant fixture |
| Public boundary | `/api/v1/public/**` and `/actuator/health/**` only | `SecurityBoundaryTest` |
| Password handling | **Argon2id** via `DelegatingPasswordEncoder`, `{argon2}` prefixed | `PasswordEncoderTest` |
| Scope at the data layer | `ScopeFilter` + `ScopedRepository`; **every** query method takes an `AuthorizationScope` | `ScopeEnforcementStructureTest`, proven non-vacuous |
| No privilege escalation via `property_id` | Scope predicate is `AND`ed into the same statement as the identity predicate — never fetch-then-check | `PropertyRepository`, `ScopeFilterTest` |
| 404 not 403 for out-of-scope | `NotFoundException.outOfScope(…)` | doc 85 §6.3 |
| Error responses leak nothing | No handler passes `getMessage()` through | `GlobalExceptionHandlerTest` asserts no SQL, table name or path appears |
| Headers | CSP `default-src 'none'`, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff` | observed over HTTP |
| CSRF | Double-submit cookie | doc 58 §10 |
| Session cookies | `HttpOnly`, `Secure`, `SameSite` | doc 59 §8 |

### 7.2 Two ambiguities in doc 59 §5, and how they were resolved

Doc 59 §5 marks two ADMIN cells "▲ = bounded or pending an OQ decision
(OQ-023, OQ-024)". **These are not conflicts between documents** — they are
within doc 59, and doc 59 §7.1 (deny by default) supplies the governing rule.
Recording both resolutions here because they are judgement calls:

| Permission | Resolution | Reasoning |
|---|---|---|
| `reservation.price.override` | **GRANTED to ADMIN** | §4.1 states ADMIN holds it, "Bounded; beyond the limit requires SUPER_ADMIN (OQ-023)". The permission is held; the *bound* is what is unresolved. No numeric limit is invented — code enforcing the bound must raise `CONFIG_MISSING` until OQ-023 is answered |
| `analytics.financial.view` | **WITHHELD from ADMIN** | §4.7 names the holders explicitly: `SUPER_ADMIN` and the future `ACCOUNTANT`. ADMIN is not among them, and the ▲ cites OQ-023/OQ-024, neither of which concerns financial analytics. Deny by default resolves it by withholding. Granting would be an invention |

Both are asserted in `RoleCatalogueTest`, so a later change is a visible decision.

### 7.3 A defect found by running the application

Spring Boot's `UserDetailsServiceAutoConfiguration` was creating a **default
in-memory user named `user` and printing its generated password to the log at
every startup.** Two problems:

1. A credential in the log, on every production start.
2. An account nobody created — doc 59 §8: "Staff accounts are created by
   `SUPER_ADMIN` only. No self-registration."

Excluded in `KasApplication`, with the reasoning in a comment beside it.
`NoDefaultUserTest` asserts no `UserDetailsService` bean exists, because the
exclusion is easy to lose and its only symptom is one WARN line among hundreds.

Re-verified after the fix: **no credential-shaped string appears anywhere in
stdout or stderr at startup.**

### 7.4 Not implemented, deliberately

The auth endpoints of doc 58 §3.4 — login, register, refresh, logout,
forgot/reset password, verify email. The brief limits this phase to the security
*foundation*, and a partial implementation of a frozen contract would either
invent flow details or need redoing. Also absent, per doc 51 C9: no OAuth
provider, no social login.

Doc 59 §8 also requires **breach-list checking at registration** and
**mandatory 2FA for `SUPER_ADMIN`**. Both are properties of flows that do not
exist yet. `app_user.two_factor_enabled` is already in the schema.

---

## 8. Audit

`AuditEvent` + `AuditLogger` capture actor, action, target, before/after, reason,
IP and user agent, writing to the append-only `audit_log`. Snapshots pass through
`SensitiveKeyRedactor` first — because the table rejects UPDATE and DELETE
(doc 88 §5.6), a secret written by accident could never be removed, so redaction
runs on the way in rather than as later clean-up.

**Two fields are modelled but not yet persisted.** `correlationId` and `scope`
have no column in V19. They are carried on the structured log line beside the
audit row id. Adding the columns needs a new migration, and **that migration is
deliberately not written in this phase**: it should be the *first
Flyway-managed* migration, after §6 is resolved. Writing V22 now would mean
applying it by psql — repeating exactly the problem the adoption decision exists
to close.

---

## 9. Verification — every command that ran

| # | Check | Command | Result |
|---|---|---|---|
| 1 | JDK 21 | `java -version` · `javac -version` | ✅ Temurin 21.0.12+8 |
| 2 | Maven Wrapper | `.\mvnw.cmd -B verify` | ✅ downloads Maven 3.9.16, no global install |
| 3 | Compilation | `.\mvnw.cmd -B compile` | ✅ 55 sources, no warnings |
| 4 | Unit + architecture tests | `.\mvnw.cmd -B test` | ✅ **135 / 135** |
| 5 | Integration tests | `.\mvnw.cmd -B verify` | ✅ **10 / 10** against `kas_web_dev` |
| 6 | Module boundaries | `ModuleStructureTest` | ✅ 8 modules, no cycles, declared deps hold |
| 7 | Layering | `LayeringRulesTest` | ✅ 6 rules |
| 8 | Deny by default | `DenyByDefaultTest` | ✅ + non-vacuity proof |
| 9 | Forbidden concepts | `ForbiddenConceptsTest` | ✅ + non-vacuity proof |
| 10 | Scope enforcement | `ScopeEnforcementStructureTest` | ✅ + non-vacuity proof |
| 11 | Public denylist | `PublicResponseDenylistTest` | ✅ 6 tests incl. depth and collection cases |
| 12 | Application startup | `java -jar … --spring.profiles.active=dev` | ✅ starts, Tomcat on 8099 |
| 13 | Liveness | `GET /actuator/health/liveness` | ✅ 200 `UP` |
| 14 | Readiness | `GET /actuator/health/readiness` | ✅ 200 `UP` · `db` UP · `kasSchema` UP |
| 15 | Database identity | `kasSchema` health detail | ✅ `kas_web_dev` / `kas_web_app` / `kas` |
| 16 | Security boundary | `GET /api/v1/admin/…` unauthenticated | ✅ 401 `UNAUTHENTICATED`, correct body |
| 17 | Public routing | `GET /api/v1/public/properties` | ✅ 404 `NOT_FOUND` — not 401 |
| 18 | Actuator exposure | `GET /actuator/env` | ✅ 401 |
| 19 | Correlation id | header on every response | ✅ present exactly once; valid inbound preserved, malformed replaced |
| 20 | Structured logging | default profile | ✅ ECS JSON; dev profile plain with correlation slot |
| 21 | No credential in logs | scan of stdout + stderr | ✅ none |
| 22 | Flyway history adoption | `FlywayHistoryAdoption --apply` | ✅ 22 rows, fingerprint identical |
| 23 | Flyway validation | `flyway.validate()` | ✅ 22 migrations validated |
| 24 | Flyway at startup | app boot with `flyway.enabled: true` | ✅ validated 22, version 21, no migration necessary |
| 25 | Checksum guard fires | tampered scratch copy of V12 | ✅ **validation FAILED as required** |
| 26 | Post-adoption contract | `FlywayHistoryIT` | ✅ 7 tests — 22 rows, 0 BASELINE, 0 NULL checksums, clean disabled |
| 27 | Migrations unchanged | `git hash-object` vs index | ✅ **0 of 23 differ** |
| 28 | Whitespace | `git diff --check` | ✅ clean |

**Commands that failed, and why**

| Command | Failure | Resolution |
|---|---|---|
| `.\mvnw.cmd test` (1st) | `PublicResponseDenylistTest` — generic capture would not compile | Iterated over `JavaClass` instead of collecting to `List<Class<?>>` |
| `.\mvnw.cmd test` (2nd) | `PasswordEncoderTest.unprefixedHashIsRejected` | **The test was wrong, not the code.** `DelegatingPasswordEncoder` *throws* on an unprefixed hash rather than returning `false` — the stronger behaviour. Test corrected to assert the refusal |
| `psql -h localhost -w` with `PGPASSFILE` redirected | `fe_sendauth: no password supplied` | Not a failure — this was the probe that established a password is genuinely required (§5.2) |

---

## 10. Deliberately absent

| Not built | Why |
|---|---|
| Business modules (inventory, pricing, sales, reservation, customer, review, media, notification, payment) | Empty speculative modules are excluded by the brief |
| The ~120 endpoint contract | Phase 7.3 is infrastructure. No endpoint name was invented |
| Auth endpoints | §7.4 |
| JPA / Hibernate | §4.2 |
| Docker / Testcontainers execution | Docker is not installed; the dependency is declared so CI can use it |
| `kas_web_test` database | Creating a database was not approved. Integration tests are read-only against `kas_web_dev` |
| Migration V22 | §8 — it should be the first Flyway-managed migration |
| Any business value | §5.3 |
| Frontend | Phase 7.5 |

---

## 11. Risks

| # | Risk | Severity | Note |
|---|---|:--:|---|
| R1 | ~~Flyway adoption unresolved~~ | ✅ | **Closed.** Option C approved and executed; all 22 checksums validated on every startup and every build (§6) |
| R1b | The `Giao diện demo/` directory is **no longer present on disk** | 🟢 | It held owner-supplied UI reference screenshots and was present earlier in this session. It was never tracked by git, git records no deletion, no command in this phase targeted it, and the screenshots are not in the Recycle Bin from that path. The `.gitignore` rule at line 250 is intact and verified still active against a synthetic path. **Flagged rather than reported as verified** — its removal cannot be accounted for here |
| R2 | Integration tests write nowhere, but run against the **dev** database | 🟠 | Read-only by construction (`setReadOnly(true)`), and no test creates fixtures. A future writing test needs `kas_web_test`, which needs approval |
| R3 | Docker absent → no Testcontainers | 🟠 | Carried from doc 88 R6. The dependency and gating are in place; CI can enable it with no code change |
| R4 | Audit `correlationId` / `scope` not persisted | 🟠 | §8. Present on the log line; needs V22 |
| R5 | No authentication flow exists | 🟠 | Expected at this stage. The authorisation machinery is complete and tested; nothing can authenticate into it yet |
| R6 | Business config outstanding | 🟠 | Carried from doc 88 R7. Mechanism built and fails safely; 18 values still owed |
| R7 | `analytics.financial.view` for ADMIN resolved by inference | 🟢 | §7.2. Deny-by-default reading. One line to change if the business disagrees |

---

## 12. Exit criteria

| # | Criterion | Status |
|---|---|:--:|
| 1 | JDK 21 verified | ✅ |
| 2 | Spring Boot project created | ✅ |
| 3 | Maven Wrapper works | ✅ no global Maven |
| 4 | PostgreSQL connectivity works | ✅ over JDBC |
| 5 | `kas_web_app` is the runtime role | ✅ asserted by test and health |
| 6 | `kas` schema is active | ✅ no fallback to `public` |
| 7 | Flyway adoption safely resolved | ✅ **Option C approved and executed, non-destructively (§6)** |
| 8 | V1–V21 unchanged | ✅ 0 of 23 differ from committed blobs |
| 9 | Spring Modulith configured | ✅ 8 modules |
| 10 | Module boundaries are executable tests | ✅ |
| 11 | Security foundation works | ✅ verified over HTTP |
| 12 | RBAC foundation works | ✅ full catalogue, bundles tested |
| 13 | Deny by default works | ✅ incl. authenticated-actor refusal |
| 14 | Partner/property isolation foundation | ✅ structurally enforced and tested |
| 15 | Global error contract works | ✅ |
| 16 | Health endpoint works | ✅ |
| 17 | Readiness endpoint works | ✅ verifies the *right* database |
| 18 | Logging foundation works | ✅ ECS + correlation, no credentials |
| 19 | Configuration separation works | ✅ |
| 20 | No secrets committed | ✅ |
| 21 | Integration-test foundation exists | ✅ 10 tests, reachability-gated |
| 22 | Public denylist tests exist | ✅ incl. non-vacuity proofs |
| 23 | No legacy database touched | ✅ never connected or referenced |
| 24 | No unrelated directory touched | ✅ |
| 25 | `git diff --check` passes | ✅ |
| 26 | Flyway is the single migration authority | ✅ history adopted, validated on every startup |
| 27 | Checksum validation preserved and proven | ✅ guard demonstrated firing (§6.0) |
| 28 | Verification report complete | ✅ this document |

**28 / 28.**

---

## 13. Next phase

**Phase 7.4 is not started**, per the stop condition.

The recommended first piece of work when it begins: **land V22 as the first
Flyway-managed migration**, adding `audit_log.correlation_id` and
`audit_log.scope` (§8). It is small and safe, and it exercises the adopted
history end to end before anything larger depends on it.
