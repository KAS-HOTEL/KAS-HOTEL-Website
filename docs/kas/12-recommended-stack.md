# 12 — Recommended Stack

**Status of this document:** Phase 1 recommendation, awaiting approval
**Last updated:** 2026-08-14
**Nothing has been installed or initialised.**

---

## 1. The recommendation

| Layer | Choice |
|---|---|
| **Frontend** | Next.js (App Router) · React · TypeScript |
| **Styling** | Tailwind CSS + a KAS design-token layer; headless accessible primitives (Radix or equivalent) |
| **Backend** | NestJS · TypeScript · modular monolith |
| **Database** | PostgreSQL |
| **Data access** | Prisma or Drizzle (Phase 2 decision) |
| **Cache & queue** | Redis + BullMQ |
| **Object storage** | S3-compatible (Cloudflare R2) + image CDN |
| **Email** | Resend or Amazon SES, behind `EmailProvider` |
| **Maps** | Google Maps Platform, behind `MapProvider` |
| **Payment** | `ManualPaymentAdapter` only in v1, behind `PaymentProvider` |
| **Auth** | Self-hosted, cookie-based sessions with rotating refresh tokens |
| **Hosting** | Managed containers, Singapore region (pending data-residency review) |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Sentry + uptime probing + real user monitoring |

### 1.1 The one conditional

**This recommendation assumes the delivery team is TypeScript-primary or stack-agnostic.**

If KAS's engineering team is **Java-primary**, substitute **Spring Boot (Java 21+ or Kotlin) with
`spring-modulith`, JPA/Hibernate, Spring Security, and Flyway**. Everything else in this document —
the module boundaries, the domain model, the ports and adapters, the database design, the deployment
shape — is unchanged. Only the backend runtime differs.

This is a genuine fork in the road and it is blocked on OQ-038. It should be answered before Phase 2
begins.

## 2. Why this stack

### 2.1 Why Next.js

- **It is the only frontend candidate that serves both halves of this product well.** KAS needs an
  editorial, SEO-critical marketing site *and* a transactional booking flow *and* a dense admin
  console. Astro wins the first and loses the others; Angular wins the third and loses the first.
- **Server rendering is a commercial requirement, not a technical preference.** Direct booking
  competes with OTAs for organic search. Client-only rendering forfeits that competition.
- **Per-route rendering strategy** matches the data exactly: property and room content is static and
  cacheable (it changes weekly); availability is dynamic and must never be cached long.
- **The image pipeline directly serves the photography-led design.** Responsive sizes, modern formats,
  and explicit dimensions are the difference between a premium site and a slow one.
- **Largest hiring pool of any modern frontend framework, including in Vietnam** — KAS must be able
  to hire maintainers, which is a five-year risk, not a launch risk.

### 2.2 Why NestJS

- **One language across a large surface area.** This project's scope is wide: 8 property content
  models, bilingual content, a booking flow, a guest account, ~14 admin modules, email, notifications,
  reviews, vouchers, analytics. A single language means shared validation schemas, shared types
  between API and UI, one toolchain, and one hiring profile.
- **Its module system directly implements the confirmed modular-monolith requirement.** Modules,
  providers, and dependency injection make the required vendor abstractions natural rather than
  bolted on.
- **The correctness-critical slice is small and is protected by the database.** Oversell prevention
  lives in PostgreSQL constraints and row locks, not in the framework — see §5.
- **Velocity matters here.** Most of the remaining work is content modelling, admin UI, forms, and
  i18n, where a heavier framework buys guarantees this project does not need and costs time it does.

**Honest statement of the trade-off:** Spring Boot would give stronger built-in transactional
guarantees and a more rigid structure that resists erosion over years. That is a real advantage. It
is outweighed here by the breadth-of-scope argument — but only just, and only if the team is not
already Java-primary.

### 2.3 Why PostgreSQL

- The domain is relational; correctness depends on transactions and constraints.
- `daterange` + GiST exclusion constraints are an unusually direct fit for date-range booking logic.
- Check constraints enforce `available >= 0` **in storage**, so no application bug can oversell.
- Row-level locking (`SELECT … FOR UPDATE`) resolves the last-room race deterministically.
- JSONB handles flexible content blocks without abandoning relational integrity elsewhere.
- Built-in full-text search is more than sufficient for a catalogue of 8 properties.
- Managed everywhere; permissive licence; no lock-in.

### 2.4 Why a modular monolith

**CONFIRMED** as the preference, and the evaluation supports it:

- Booking and inventory must be updated in **one transaction**. Splitting them across services would
  introduce eventual consistency exactly where oversells are born.
- Traffic is measured in hundreds of concurrent sessions, not millions.
- One deployable unit means one thing to monitor, secure, back up, and debug.
- Module boundaries give most of the organisational benefit of services with none of the distributed
  failure modes. If a module ever genuinely needs independent scaling, a clean boundary is what makes
  extraction possible.

## 3. Module boundaries

**PROPOSED** — Backend modules. Cross-module access is through published interfaces and domain events
only; direct imports of another module's internals are prohibited and enforced by lint rules and
architecture tests.

```
kas-backend/
├── platform/                 cross-cutting foundations
│   ├── auth/                 authentication, sessions, tokens
│   ├── authz/                permissions, role assignment, property scope
│   ├── i18n/                 localised content resolution
│   ├── audit/                audit log
│   ├── events/               domain event bus
│   └── config/               settings, feature flags
│
├── domain/                   business modules
│   ├── property/             hotels, content, galleries, amenities, locations, policies
│   ├── roomtype/             room type definitions, images, attributes
│   ├── inventory/            counts, availability computation, holds
│   ├── pricing/              base rates, rules, price calculation, price snapshots
│   ├── booking/              booking requests, lines, state machine, sales workflow
│   ├── customer/             profiles, preferences, consent
│   ├── review/               verified reviews, moderation, replies
│   ├── voucher/              offers, validation, usage
│   ├── notification/         event → channel routing, delivery log
│   └── analytics/            read models and reporting
│
├── integration/              adapters — the ONLY place vendor SDKs may appear
│   ├── email/                EmailProvider  → Resend | SES | …
│   ├── storage/              StorageProvider→ R2 | S3 | …
│   ├── maps/                 MapProvider    → Google | Mapbox | …
│   ├── payment/              PaymentProvider→ ManualPaymentAdapter (v1)
│   └── messaging/            MessagingProvider → FUTURE Zalo | SMS
│
└── api/
    ├── public/               /api/public/**  — guest surface
    └── admin/                /api/admin/**   — staff surface
```

### 3.1 Dependency rules

**PROPOSED** — Enforced by architecture tests in CI:

1. `domain/*` **must not** import from `integration/*` concrete adapters — only from port interfaces.
   This is the confirmed vendor-independence requirement made mechanical.
2. `domain/*` **must not** import from `api/*`.
3. Domain modules communicate **through published interfaces or domain events**, never by reaching
   into another module's repositories or entities.
4. `api/public/*` **must not** import admin DTOs, admin services, or any type carrying internal
   fields.
5. `integration/*` **must not** contain business rules.

Rule 4 is what makes the room-number boundary structural rather than a matter of vigilance.

### 3.2 Frontend structure

```
kas-web/
├── app/
│   ├── (marketing)/          home, hotels, hotel detail, locations, about, story, offers, contact, faq, policies
│   ├── (booking)/            search, your-stay, details, review, sent
│   ├── (account)/            login, register, dashboard, bookings, reviews, profile
│   └── admin/                admin console (separate layout, separate auth boundary)
├── components/
│   ├── brand/                editorial components — hero, story, property tile, gallery
│   ├── booking/              date range picker, guest selector, room selector, your-stay
│   ├── ui/                   design system primitives
│   └── admin/                tables, filters, inventory calendar, queue
├── lib/                      api client, i18n, formatting (VND, dates), validation schemas
└── styles/                   design tokens
```

**PROPOSED** — The admin console lives in the same Next.js application under `/admin`, sharing the
API client, types, and design tokens while using a separate layout and auth boundary. A separate
admin application would duplicate all of that for no benefit at this scale.

## 4. Ports and adapters

**CONFIRMED** — Payment, email, storage, maps, and other external services must use provider
abstractions.

**PROPOSED** — Port definitions (conceptual, not code):

| Port | Responsibility | v1 adapter |
|---|---|---|
| `EmailProvider` | `send(message) → deliveryId`; delivery status callbacks | Resend or SES |
| `StorageProvider` | Pre-signed upload URLs, delete, public URL resolution | Cloudflare R2 (S3 API) |
| `MapProvider` | Geocode, static map, place search | Google Maps |
| `PaymentProvider` | Record a payment, query status, (**FUTURE**) initiate a payment | `ManualPaymentAdapter` |
| `MessagingProvider` | **FUTURE** — SMS/Zalo | — |
| `AnalyticsSink` | Emit domain analytics events | Internal store |

Each port has a documented contract, a fake implementation for tests, and at least one real adapter.
Swapping a vendor changes one adapter and one configuration value.

## 5. How the oversell guarantee is actually enforced

**PROPOSED** — This is the system's most important correctness property, so its enforcement is stated
explicitly and is defence-in-depth. It does not depend on the backend framework choice.

| Layer | Mechanism |
|---|---|
| **Database constraint** | `CHECK (total - reserved - occupied - maintenance >= 0)` on each inventory day row. The database will refuse an oversell even if every layer above it is wrong. |
| **Row locking** | The request transaction takes `SELECT … FOR UPDATE` on every affected inventory day row, in a deterministic order (by room type, then date) to prevent deadlock. |
| **Single transaction** | Booking creation and inventory hold commit atomically. Either both happen or neither does. |
| **Server-side recomputation** | Requested quantities and prices are always recomputed server-side. Client-supplied values are never trusted. |
| **Idempotency** | Submission carries an idempotency key so a retried request cannot create a second booking. |
| **Tests** | A concurrency test fires N simultaneous requests for the last available room and asserts exactly one succeeds. Blocking in CI. |

Full algorithm in [15-inventory-rules.md](15-inventory-rules.md).

## 6. API design

**PROPOSED**

- REST with a consistent resource model and OpenAPI documentation generated from code
- **Two separate surfaces**: `/api/public/**` and `/api/admin/**`, with separate route trees,
  authorisation, rate limits, and response types
- Versioned (`/api/v1/…`) so a breaking change never breaks a deployed client
- Cursor pagination on collections; explicit filter and sort parameters
- Consistent error envelope: `{ code, message, details[], correlationId }`
- Idempotency keys on booking submission and payment recording
- **GraphQL rejected** — the client set is small and known, the caching story for a marketing site is
  worse, and it adds an authorisation surface (field-level access control) that would work directly
  against the room-number boundary requirement.

## 7. Deployment architecture

**PROPOSED**

```
                        Guests (mostly mobile, mostly Vietnam)
                                       │
                                    CDN / edge
                                       │
                    ┌──────────────────┴──────────────────┐
                    │   Next.js (SSR + static)            │
                    │   public site + admin console       │
                    └──────────────────┬──────────────────┘
                                       │  HTTPS
                    ┌──────────────────┴──────────────────┐
                    │   NestJS modular monolith           │
                    │   /api/public/**  /api/admin/**     │
                    └───┬───────────┬──────────┬──────────┘
                        │           │          │
                 PostgreSQL      Redis     Object storage
                 (managed)    cache+queue   (S3-compatible)
                        │           │          │
                        │      BullMQ workers  └─ image CDN
                        │      (same image,
                        │       worker mode)
                        │
                  automated backups, PITR
```

- **Region: Singapore** (or Vietnam if data residency requires it) — latency to Vietnamese users is a
  direct input to the performance targets. OQ-039.
- Workers run the same container image in worker mode — no separate codebase.
- Environments: local, preview-per-PR, staging, production.
- Forward-only versioned migrations; expand/contract for breaking schema changes.
- Zero-downtime deploys with a documented rollback.

## 8. Development standards

**PROPOSED**

| Area | Standard |
|---|---|
| Language | TypeScript in `strict` mode; `any` requires justification |
| Formatting / linting | Automated, enforced in CI, non-negotiable |
| Architecture tests | Dependency rules from §3.1 enforced in CI |
| Contract tests | Public-response denylist test from [04](04-room-architecture.md) §2.1, blocking |
| Commits | Conventional commits; PR review required |
| Branching | Trunk-based, short-lived branches |
| Migrations | Versioned, reviewed, never edited after merge |
| Documentation | Architecture decision records for every significant choice; this document set is the baseline |
| Accessibility | Automated checks in CI; manual pass before release |
| Performance | Lighthouse CI budgets, failing on regression |
| Security | Dependency scanning, SAST, secret scanning in CI |

## 9. Cost profile

**PROPOSED** — Indicative monthly infrastructure cost at KAS's scale. Excludes design, development,
photography, and content.

| Component | Indicative |
|---|---|
| Application hosting (frontend + backend + worker) | $50–150 |
| PostgreSQL (managed, with backups) | $30–100 |
| Redis (managed) | $15–50 |
| Object storage + CDN | $10–40 |
| Email (transactional volume) | $0–30 |
| Maps | $0–100, depending on usage and caching |
| Error tracking, monitoring, analytics | $0–60 |
| **Total** | **≈ $105–530 / month** |

Well within a rounding error of the OTA commission avoided on even a modest number of direct
bookings.

## 10. What is deliberately excluded

**PROPOSED** — Recorded so these are conscious decisions rather than oversights:

| Excluded | Reason |
|---|---|
| Microservices | Confirmed preference against; unjustified at this scale; would harm transactional correctness |
| Kubernetes | Operational cost far exceeds the benefit for 8 hotels |
| Elasticsearch | PostgreSQL full-text search is sufficient for 8 properties |
| GraphQL | Small known client set; worse caching; adds a field-level authorisation surface |
| Headless CMS | Would create a second source of truth alongside the admin console |
| Managed auth provider | Per-MAU cost, external dependency on login, split customer identity |
| Payment gateway | **CONFIRMED** out of scope; architecture is ready via `PaymentProvider` |
| Event sourcing | Disproportionate; an audit log and booking status history meet the actual need |
| Native mobile apps | Responsive web first |

## 11. Approval required

Before Phase 2 begins:

1. **Approve or amend this stack.**
2. **Answer OQ-038** (team skills) — this determines NestJS vs. Spring Boot.
3. **Answer OQ-039** (hosting region / data residency) — this may constrain hosting.
4. Confirm the modular monolith and the module boundaries in §3.
5. Confirm that no payment gateway is to be built in the initial phases.

**No packages have been installed. No project has been initialised. No repository has been created.**
