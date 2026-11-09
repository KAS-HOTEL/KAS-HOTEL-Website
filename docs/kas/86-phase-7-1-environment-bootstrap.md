# 86 — Phase 7.1: Repository & Environment Bootstrap

**Phase:** 7.1 — Repository & Environment Bootstrap
**Status:** Inspection complete. **Nothing installed, nothing initialised, nothing modified.**
**Inspected:** 2026-08-14
**Last updated:** 2026-08-14

> This phase is verification only. No business implementation, no framework initialisation, no
> dependency installation.

---

## 1. Repository state

| Property | Value |
|---|---|
| Root | `C:\Kas-Web` |
| Total size | **1.4 MB** |
| Directories | `docs/` · `docs/kas/` — **two only** |
| Files | **66**, all `.md` |
| Non-markdown files | **0** |
| Hidden files / directories at root | **None** |
| Existing source code | **None** |
| Existing configuration | **None** |
| Existing build files | **None** |
| Existing environment files | **None** |

```
C:\Kas-Web
└── docs
    └── kas
        ├── 00-README.md
        ├── 01-product-foundation.md … 29-direct-sales-crm-architecture.md   (30 files)
        ├── 50-phase-3-amendments.md … 63-phase-4-validation.md              (14 files)
        ├── 64-phase-5-ux-principles.md … 73-phase-5-validation.md           (10 files)
        ├── 74-phase-6-visual-foundation.md … 84-phase-6-visual-validation.md (11 files)
        └── 85-partner-property-model-amendment.md                            (1 file)
```

**CONFIRMED** — The repository contains **documentation only**. It is a clean greenfield for
implementation. **Nothing was deleted, overwritten or modified during this inspection.**

---

## 2. Git state

| Property | Value |
|---|---|
| `.git` directory | **ABSENT** |
| Is a git repository | **No** |
| Parent directory is a repo | No — `fatal: not a git repository` up the tree |
| Current branch | n/a |
| Remote | n/a |
| Recent commits | n/a |
| Uncommitted work | n/a — **nothing is tracked** |
| `git` binary | **Present**, version 2.55.0.windows.3 |
| Global `user.name` | **NOT SET** |
| Global `user.email` | **NOT SET** |
| Global `init.defaultBranch` | **NOT SET** |

**Assessment — no risk of damaging existing work.** There is no repository, no branch, no remote and no
history. **No destructive git operation was performed or is required.**

> ⚠ **Finding G1 — git identity is not configured.** `user.name` and `user.email` are unset globally.
> The first commit will fail or be attributed incorrectly. **This is the product owner's decision to
> make** (which identity, which email) and has not been set by this phase.

> ⚠ **Finding G2 — the 66 documentation files are unversioned.** 1.4 MB of approved architecture, worth
> six phases of work, exists with **no version control and no backup**. This is the single highest
> operational risk found. See §12.

---

## 3. Environment versions

### 3.1 Present

| Tool | Version | Location | Assessment |
|---|---|---|---|
| **git** | 2.55.0.windows.3 | PATH | ✔ Current |
| **node** | **v24.18.1** | `C:\Program Files\nodejs\node.exe` | ✔ Suitable for Next.js |
| **npm** | **11.16.0** | `C:\Program Files\nodejs\npm.ps1` | ✔ |
| **npx** | 11.16.0 | PATH | ✔ |
| **psql** | **17.10** | PATH | ✔ Client |
| **pg_dump** | 17.10 | PATH | ✔ |
| **PostgreSQL server** | **17** — service `postgresql-x64-17`, **Running**, StartMode `Auto` | `C:\Program Files\PostgreSQL\17` | ✔ **Listening on 5432** |
| **winget** | Present | PATH | Available for provisioning |

### 3.2 Absent

| Tool | Status | Impact |
|---|---|---|
| **java (JDK)** | **NOT FOUND** — no JDK directories, `JAVA_HOME` unset | 🔴 **BLOCKS the Spring Boot backend** |
| **javac** | NOT FOUND | 🔴 Same |
| **mvn** | NOT FOUND | 🔴 **BLOCKS the backend build** |
| **gradle** | NOT FOUND | 🔴 Same (alternative to Maven) |
| **docker** | **NOT FOUND** — not in PATH, not in standard install locations | 🟠 Reduced impact — see §3.4 |
| **docker compose** | NOT FOUND | 🟠 Same |
| **redis-cli** | NOT FOUND — port 6379 not listening | 🟠 Cache/queue unavailable |
| **pnpm** | NOT FOUND | 🟢 Optional — npm is present |
| **yarn** | NOT FOUND | 🟢 Optional |
| **choco / scoop** | NOT FOUND | 🟢 `winget` is available |

**Verification note:** Java and Docker were checked **twice** — first on `PATH`, then by scanning
standard Windows install locations (`Program Files\Java`, `Eclipse Adoptium`, `Microsoft\jdk`,
`Amazon Corretto`, `Zulu`, `Docker`). Both are **genuinely absent**, not merely unlinked.

### 3.3 Machine

| Property | Value |
|---|---|
| OS | Microsoft Windows 10 Pro, build 19045 |
| Architecture | AMD64 |
| Logical cores | 24 |
| Disk free (C:) | **174.1 GB** |

Ample for the full stack.

### 3.4 The PostgreSQL finding changes the Docker calculus

**PROPOSED** — A PostgreSQL 17 **server is already installed and running natively** on port 5432.

Phase 4 ([12](12-recommended-stack.md) §7) assumed containerised local dependencies. With Postgres
native, Docker becomes **optional for V1 development** rather than essential:

| Dependency | Containerised plan | Actual availability |
|---|---|---|
| PostgreSQL | Docker | ✔ **Native, running** |
| Redis | Docker | ✖ Absent — needed for cache, queue and holds sweep |

**Recommendation:** Docker remains **recommended but not blocking**. Redis can be run natively or via
Docker; the decision can wait until Phase 7.4 (cache/queue), and the schema and backend work in
Phases 7.2–7.3 do not need it.

> ⚠ **Finding E1 — the existing PostgreSQL instance is not KAS's.** It is a pre-existing system service
> with `StartMode = Auto`, and its data directory (`C:\Program Files\PostgreSQL\17\data`) may contain
> **other projects' databases**. Credentials were **not** tested and **nothing was connected to**. See
> §11 and §12.

---

## 4. Documentation vs implementation gap

| Artefact | Exists | Required by | Phase |
|---|:--:|---|---|
| Frontend application | ✖ | [12](12-recommended-stack.md) | 7.5 |
| Backend application | ✖ | [12](12-recommended-stack.md) | 7.3 |
| Database project / migrations | ✖ | [53](53-phase-4-database-erd.md) | 7.2 |
| Environment configuration | ✖ | §9 | 7.1→7.2 |
| CI configuration | ✖ | [63](63-phase-4-validation.md) §6 | 7.3 |
| Test infrastructure | ✖ | [63](63-phase-4-validation.md) §6 | 7.3 |
| Linting / formatting | ✖ | [12](12-recommended-stack.md) §8 | 7.3 |
| API contract artifacts | ✖ | [58](58-phase-4-api-contract.md) | 7.4 |
| OpenAPI artifacts | ✖ | [58](58-phase-4-api-contract.md) §2 | 7.4 |
| Design tokens | ✖ | [74](74-phase-6-visual-foundation.md)–[77](77-phase-6-layout-grid.md) | 7.5 |

**Gap: total.** Every implementation artefact is absent. This is expected and correct — Phases 1–6 were
documentation-only by design.

---

## 5. Stack confirmation

The repository contains **no existing implementation stack**, so nothing is preserved. The stack below
is **already frozen** in Phase 1.5 / Phase 4 and is restated, not re-decided.

### 5.1 Frozen decisions

| Layer | Decision | Source |
|---|---|---|
| **Backend** | **Spring Boot** | D-01, [28](28-phase-2-decisions.md) §2 |
| **Frontend** | **Next.js + React + TypeScript** | D-02 |
| **Database** | **PostgreSQL** | D-03 |
| **Architecture** | **Modular monolith** | D-04 |
| Languages | Vietnamese + English | D-05 |
| Currency | VND base + USD display | D-06/D-07 |

**CONFIRMED — these are not reopened.**

### 5.2 Recommended concrete versions

**PROPOSED** — Consistent with the frozen stack and the verified environment. **Nothing is installed.**

#### Backend

| Item | Recommendation | Rationale |
|---|---|---|
| **JDK** | **Eclipse Temurin 21 (LTS)** | Spring Boot 3.x requires 17+; 21 is the current LTS with the longest support runway. Phase 4 specified "Java 21+ or Kotlin" |
| Language | **Java 21** | [28](28-phase-2-decisions.md) §2.1 |
| Framework | **Spring Boot 3.x** (latest stable at install time) | Frozen |
| **Build tool** | **Maven** | **Recommended over Gradle.** Neither is installed, so the incumbency argument is absent. Maven's declarative POM is easier for a rotating team to read, and Spring Initializr's Maven output is the more conventional baseline. Gradle's build-speed advantage is immaterial at this project's size |
| Maven distribution | **Maven Wrapper (`mvnw`)** committed to the repo | No system Maven install needed; version is pinned in-repo and identical in CI |
| Module boundaries | **`spring-modulith`** | [28](28-phase-2-decisions.md) §2.1 — enforces the modular monolith |
| Security | Spring Security | [59](59-phase-4-rbac.md) |
| Persistence | Spring Data JPA / Hibernate, **explicit pessimistic locking on inventory** | [53](53-phase-4-database-erd.md) §8 |
| Migrations | **Flyway**, forward-only | [28](28-phase-2-decisions.md) §2.1 |
| Validation | Bean Validation at every boundary | [58](58-phase-4-api-contract.md) |

#### Frontend

| Item | Recommendation | Rationale |
|---|---|---|
| Framework | **Next.js (App Router)** | Frozen |
| Language | **TypeScript, `strict` mode** | [12](12-recommended-stack.md) §8 |
| Runtime | **Node 24.18.1** ✔ already present | Verified |
| **Package manager** | **npm 11.16.0** ✔ already present | **Recommended over pnpm.** pnpm is not installed; npm is. npm workspaces are sufficient for two packages, and avoiding a second package manager removes a CI variable. Revisit only if install time becomes a real problem |
| **Styling** | **Tailwind CSS + a KAS design-token layer** | [12](12-recommended-stack.md) §1. Tokens from [74](74-phase-6-visual-foundation.md) §13 map to Tailwind theme values; components reference **semantic tokens only**, so the brand swap is one file ([76](76-phase-6-color.md) §8) |
| Component primitives | **Headless, accessible** (Radix or equivalent) | Required by the [82](82-phase-6-responsive-accessibility.md) keyboard and focus contract |
| Accessibility | WCAG 2.2 AA, `eslint-plugin-jsx-a11y`, axe in CI | [82](82-phase-6-responsive-accessibility.md) §7 |
| Responsive | Mobile-first; breakpoints 768 / 1024 / 1440 | [77](77-phase-6-layout-grid.md) §2 |

#### Database

| Item | Recommendation | Status |
|---|---|---|
| Engine | **PostgreSQL 17** | ✔ **Already running natively** |
| Dev database | **A dedicated `kas_dev` database + a dedicated role** — never the `postgres` superuser | See §11 |
| Client | psql 17.10 | ✔ Present |

#### Infrastructure

| Item | Recommendation | Priority |
|---|---|---|
| **Docker Desktop** | Recommended for Redis and for CI parity | 🟠 **Not blocking** — Postgres is native |
| Redis | Needed for cache, queue and the hold-expiry sweep | 🟠 Deferrable to Phase 7.4 |
| CI | **GitHub Actions** | Requires a remote (§12) |

#### Testing

| Level | Tooling | Blocking CI gate |
|---|---|---|
| **Unit** (backend) | JUnit 5 + AssertJ + Mockito | Domain logic |
| **Integration** (backend) | Spring Boot Test + **Testcontainers** *(needs Docker)* — or a dedicated local `kas_test` database as a fallback | **Real database, not mocks** |
| **Concurrency** | JUnit + parallel execution | **Exactly one of N simultaneous requests for the last room succeeds** |
| **Contract** | Public-response **denylist** + allowlist assertions | **Blocking** — [58](58-phase-4-api-contract.md) §9 |
| **Channel completeness** | Direct + OTA reservation both appear in every operational endpoint | **Blocking** — [54](54-phase-4-state-machines.md) §6 |
| **Cross-partner isolation** | Partner A admin gets `404` on Partner B records | **Blocking** — [85](85-partner-property-model-amendment.md) §6.3 |
| **Unit** (frontend) | Vitest + Testing Library | — |
| **E2E** | Playwright | Search → request → admin confirm |
| **Accessibility** | axe-core in CI + manual keyboard/SR pass | **Blocking** |
| **Performance** | Lighthouse CI budgets | **Blocking** |
| **Security** | Dependency scanning, SAST, secret scanning | **Blocking** |

> ⚠ **Testcontainers requires Docker.** Without it, integration tests must use a dedicated local
> `kas_test` database. **Recommendation: install Docker Desktop** — otherwise CI and local integration
> testing diverge, which is exactly how "works on my machine" defects reach production.

---

## 6. Required tools

| Tool | Required for | Status |
|---|---|---|
| git 2.x | Version control | ✔ Present |
| Node 20+ | Frontend | ✔ **24.18.1** |
| npm 10+ | Frontend packages | ✔ **11.16.0** |
| PostgreSQL 15+ | Database | ✔ **17, running** |
| psql | DB administration | ✔ 17.10 |
| **JDK 21** | **Backend** | 🔴 **MISSING** |
| **Maven** *(or the wrapper)* | **Backend build** | 🔴 **MISSING** |
| Docker Desktop | Redis, Testcontainers, CI parity | 🟠 **MISSING** |
| Redis 7+ | Cache, queue, hold sweep | 🟠 **MISSING** |

---

## 7. Missing tools — installation plan

**NOT INSTALLED. Requires product owner authorisation.**

| # | Tool | Method | Blocking |
|---|---|---|---|
| 1 | **Eclipse Temurin JDK 21 (LTS)** | `winget install EclipseAdoptium.Temurin.21.JDK` | 🔴 **Yes — Phase 7.3** |
| 2 | **Maven Wrapper** | Generated with the Spring Initializr project; **no system install** | 🔴 Yes |
| 3 | Docker Desktop | `winget install Docker.DockerDesktop` — **requires a reboot and WSL2** | 🟠 No, but strongly recommended |
| 4 | Redis | Via Docker, or WSL2 | 🟠 Deferrable to 7.4 |

**PROPOSED — JDK 21 and the Maven wrapper are the only hard blockers**, and only from Phase 7.3 onward.
**Phase 7.2 (database foundation) can proceed with what is already installed.**

---

## 8. Environment variables required

**PROPOSED** — Names and purposes only. **No values are set, no `.env` file was created.**

| Variable | Purpose | Phase |
|---|---|---|
| `KAS_DB_HOST` · `KAS_DB_PORT` · `KAS_DB_NAME` | PostgreSQL connection | 7.2 |
| `KAS_DB_USER` · `KAS_DB_PASSWORD` | **Dedicated app role — never `postgres`** | 7.2 |
| `SPRING_PROFILES_ACTIVE` | `local` \| `test` \| `staging` \| `prod` | 7.3 |
| `KAS_JWT_SECRET` / signing key | Session tokens | 7.4 |
| `KAS_REDIS_HOST` · `KAS_REDIS_PORT` | Cache, queue | 7.4 |
| `KAS_STORAGE_*` | S3-compatible media storage | 7.6 |
| `KAS_EMAIL_*` | Email provider | 7.6 |
| `KAS_MAPS_API_KEY` | Maps provider | 7.6 |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend → backend | 7.5 |

**Rules:**
- `.env` files are **git-ignored from the first commit**.
- A committed **`.env.example`** carries names and placeholder values only.
- **No real secret is ever committed**, in any branch, at any time.
- Production secrets live in a secret manager, never in the repository
  ([10](10-system-requirements.md) §5.1).

---

## 9. Recommended repository layout

**PROPOSED** — Aligned with the modular monolith in [12](12-recommended-stack.md) §3.

```
C:\Kas-Web
├── .gitignore
├── .gitattributes                    LF normalisation — critical on Windows
├── README.md
├── .env.example                      names + placeholders only
├── docs/kas/                         ← 66 approved documents, UNTOUCHED
├── backend/                          Spring Boot (Phase 7.3)
│   ├── mvnw · mvnw.cmd · .mvn/
│   ├── pom.xml
│   └── src/main/java/vn/kas/…        platform · domain · integration · api
├── frontend/                         Next.js (Phase 7.5)
│   ├── package.json
│   └── src/{app,components,lib,styles}
├── db/                               (Phase 7.2)
│   ├── migrations/                   Flyway, forward-only
│   └── seed/
├── ops/
│   └── docker-compose.yml            Redis (+ optional Postgres)
└── .github/workflows/                CI (Phase 7.3)
```

**`docs/kas/` is never modified by implementation work.**

---

## 10. Development setup sequence

**PROPOSED** — Nothing below has been executed.

```
0.  AUTHORISE           product owner approves §7 installations
1.  git init            + .gitignore, .gitattributes, git identity   ← Phase 7.1b
2.  Remote + first commit                                            ← protects 1.4 MB of work
3.  Install JDK 21                                                   ← unblocks 7.3
4.  Create kas_dev database + dedicated role                         ← Phase 7.2
5.  Flyway migrations from doc 53                                    ← Phase 7.2
6.  Spring Initializr → backend/, with mvnw                          ← Phase 7.3
7.  npx create-next-app → frontend/                                  ← Phase 7.5
8.  Docker Desktop + Redis                                           ← Phase 7.4
9.  CI workflows + blocking test gates                               ← Phase 7.3
```

---

## 11. Security precautions

**Observed during this inspection:**

| Precaution | Status |
|---|---|
| No secrets exposed | ✔ No credential was read, written or logged |
| No production credentials created | ✔ None created |
| **No database connection attempted** | ✔ **Server presence confirmed by service and port only. No authentication attempted** |
| No `.env` file created | ✔ |
| No system configuration modified | ✔ Read-only checks throughout |
| No repository deleted | ✔ Nothing deleted |
| No user files touched | ✔ 66 documents unchanged |
| No unrelated project affected | ✔ |

**Precautions for Phase 7.2 onward:**

1. **Do not use the existing PostgreSQL `postgres` superuser.** Create a dedicated `kas_app` role with
   rights limited to the `kas_dev` database.
2. **The existing PostgreSQL instance may host other projects.** Its data directory is
   `C:\Program Files\PostgreSQL\17\data` and it predates KAS. **Never run a cluster-wide destructive
   command** (`DROP DATABASE`, `pg_resetwal`, cluster reinit). Confine every operation to `kas_dev`.
3. `.gitignore` must exclude `.env`, `*.env`, `**/target/`, `**/node_modules/`, `**/.next/`, IDE
   directories and any key material **before the first commit**.
4. Secret scanning in CI from the first workflow.
5. No real guest data in any development or test database — seed data only.
6. Local development runs over `localhost`; **no production database is ever connected to from a
   developer machine**.

---

## 12. Risks and blockers

| # | Item | Severity | Detail | Action |
|---|---|:--:|---|---|
| **R1** | **66 documents are unversioned and unbacked-up** | 🔴 **CRITICAL** | 1.4 MB representing six approved phases exists with no git, no remote, no backup. A single mishap loses all of it | **`git init` + remote + first commit before any other work** |
| **R2** | **JDK 21 absent** | 🔴 **BLOCKING 7.3** | No JDK anywhere on the machine; `JAVA_HOME` unset. Spring Boot cannot build | Install Temurin 21 (§7) |
| **R3** | **Maven absent** | 🔴 **BLOCKING 7.3** | Mitigated by committing `mvnw` with the generated project | Use the Maven Wrapper |
| **R4** | **Git identity not configured** | 🟠 Medium | First commit fails or is misattributed | Product owner supplies name/email |
| **R5** | **Docker absent** | 🟠 Medium | Blocks Testcontainers and Redis. **Does not block 7.2** because Postgres is native | Install, or accept a local `kas_test` database with divergence from CI |
| **R6** | **Redis absent** | 🟠 Medium | Cache, queue and hold-expiry sweep unavailable | Deferrable to 7.4 |
| **R7** | **Shared PostgreSQL instance** | 🟠 Medium | Pre-existing service may host other projects' data | Dedicated database + role; no cluster-wide operations |
| **R8** | No remote repository | 🟠 Medium | No off-machine backup, no CI possible | Product owner provisions a remote |
| **R9** | Windows line endings | 🟢 Low | CRLF/LF churn across a mixed toolchain | `.gitattributes` with LF normalisation from the first commit |
| **R10** | Business inputs still outstanding | 🟠 Medium | A4/A5 cancellation, A8 brand, A1/A2 room types, B6 rates, A7 VAT, B8 photography — see [84](84-phase-6-visual-validation.md) §10 | **Do not block 7.2–7.3.** Schema, auth and inventory need none of them |

**PROPOSED — R1 is the most urgent item in the entire project.** Six phases of approved architecture
sit on one disk with no version control. It should be resolved before any implementation begins, and it
is cheap to resolve.

---

## 13. Phase 7 implementation plan

**PROPOSED** — Order unchanged from [63](63-phase-4-validation.md) §7 and
[84](84-phase-6-visual-validation.md) §10.4.

| Stage | Content | Gate | Prerequisites |
|---|---|---|---|
| **7.1** ✔ | Environment inspection *(this document)* | Environment known | — |
| **7.1b** | `git init` · `.gitignore` · `.gitattributes` · identity · remote · **first commit** | Work is versioned and backed up | R1, R4, R8 |
| **7.2** | **Database foundation** — `kas_dev`, role, Flyway migrations from [53](53-phase-4-database-erd.md), constraints and indexes first | **OTA CHECK-constraint test passes** | None beyond 7.1b |
| **7.3** | Backend skeleton — Spring Boot, modulith boundaries, CI, lint, test harness | Architecture tests pass; no undeclared endpoint | **JDK 21 (R2)** |
| **7.4** | Auth + RBAC, then **Central Inventory** | **Concurrency and hold-expiry tests pass** | Redis (R6) |
| **7.5** | Rates → reservation → public API | Price-immutability and denylist tests pass | — |
| **7.6** | Admin (Operations → Sales → Distribution) | **Channel-completeness and cross-partner tests pass** | — |
| **7.7** | Media, reviews, notifications | Alt-text publish gate enforced | Storage, email providers |
| **7.8** | Frontend on the frozen contract and token system | Core Web Vitals budgets | — |
| **7.9** | Hardening — security review, load test, accessibility, content freeze | All blocking CI gates green | A4/A5, A8, B8 |

**Build inventory before the booking flow.** Everything above it depends on availability being correct,
and it is the only part where a defect costs a guest their room.

**PROPOSED** — The frontend can begin against the token system and component specifications **before**
brand assets arrive, using the provisional values. The swap is a one-file change by design
([76](76-phase-6-color.md) §8).

---

## 14. Exit criteria

| # | Criterion | Status |
|---|---|:--:|
| 1 | Repository state known | ✔ §1 — 66 docs, 0 code files |
| 2 | Git state known | ✔ §2 — not a repository, identity unset |
| 3 | Development environment known | ✔ §3 |
| 4 | Stack confirmed | ✔ §5 — frozen decisions restated, versions recommended |
| 5 | Required tools identified | ✔ §6–7 |
| 6 | Security risks identified | ✔ §11–12 |
| 7 | **No existing work damaged** | ✔ **Read-only throughout. 66 files unchanged** |
| 8 | Implementation order confirmed | ✔ §13 |
| 9 | Documentation updated | ✔ This document + [00](00-README.md) |
| 10 | Next step clearly defined | ✔ §15 |

---

## 15. Next step

**Recommended: Phase 7.2 — Database Foundation.**

**PROPOSED — one insertion first.** **Phase 7.1b** (`git init`, `.gitignore`, `.gitattributes`, git
identity, remote, first commit) should run **before** 7.2. It resolves R1, requires no installation, and
takes minutes. Committing 66 approved documents before writing the first migration is the correct
sequence.

**Product owner decisions required before 7.1b / 7.2:**

1. **Authorise `git init`** and supply the git identity (name, email) — R4
2. **Provide or authorise a remote repository** — R8
3. **Authorise JDK 21 installation** — R2, needed from 7.3
4. **Decide on Docker Desktop** — R5, affects integration-test parity
5. **Confirm** the existing PostgreSQL instance may host a new `kas_dev` database — R7

**Nothing was installed. Nothing was initialised. No file was created outside `docs/kas/`.**
