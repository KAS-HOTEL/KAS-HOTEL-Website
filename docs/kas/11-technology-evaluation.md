# 11 — Technology Evaluation

**Status of this document:** Phase 1 evaluation for approval
**Last updated:** 2026-08-14
**Nothing has been installed or initialised. `C:\Kas-Web` was verified empty before writing.**

---

## 1. Evaluation criteria

**PROPOSED** — Each candidate is assessed against criteria derived from the confirmed requirements,
weighted by how much they matter to *this* project.

| # | Criterion | Weight | Why it matters to KAS |
|---|---|---|---|
| C1 | SEO / server rendering | High | Direct booking competes with OTAs for organic visibility ([08](08-information-architecture.md) §8) |
| C2 | Mobile performance | High | Primary surface; premium brand cannot ship a slow site |
| C3 | Editorial / design freedom | High | Must not look like a template ([02](02-brand-foundation.md) §7.2) |
| C4 | Transactional correctness | High | Zero oversell is a hard requirement ([15](15-inventory-rules.md)) |
| C5 | Domain modelling strength | High | Booking state machine, inventory, pricing, roles |
| C6 | Long-term maintainability | High | 5+ year asset; team continuity unknown |
| C7 | Hiring pool in Vietnam | High | KAS will need local maintainers |
| C8 | Developer experience / velocity | Medium | Affects delivery cost and iteration speed |
| C9 | Operational simplicity | Medium | Small team; no dedicated platform engineers assumed |
| C10 | Production readiness / maturity | High | This is a revenue system, not an experiment |
| C11 | i18n support | Medium | VI/EN bilingual |
| C12 | Vendor lock-in risk | Medium | Confirmed requirement for provider abstractions |
| C13 | Cost at KAS's scale | Medium | Small data, modest traffic |

**Assumption flagged:** team composition and existing skills are unknown (OQ-038). This is the single
largest input to a stack decision and the recommendation may change once answered.

---

## 2. Frontend evaluation

### 2.1 Next.js (React)

| Aspect | Assessment |
|---|---|
| **Fit for KAS** | Strong. Server rendering and static generation cover the SEO-critical marketing pages; the same framework handles the interactive booking flow and can host the admin console. Image optimisation, routing, and i18n routing are built in — three things this project needs on day one. |
| **Benefits** | Best-in-class SEO story for a React app; hybrid rendering per route (static property pages, dynamic availability); mature image pipeline directly serving the photography-led design; enormous ecosystem; largest hiring pool of any modern frontend framework, including in Vietnam; strong TypeScript support; incremental static regeneration suits content that changes rarely but must be fast. |
| **Risks** | The React Server Components model has a real learning curve and its server/client boundary is a common source of subtle bugs. Framework churn has been high historically. Deployment outside its first-party host requires more deliberate configuration. Bundle size discipline must be enforced or the performance budget slips. |
| **Complexity** | Medium. Higher than a pure SPA, lower than assembling SSR by hand. |
| **Maintainability** | Strong. Conventional structure; large body of shared knowledge; easy to onboard. |
| **DX** | Excellent. Fast refresh, file-based routing, first-class TypeScript. |
| **Production readiness** | Very high. Used by major hospitality, retail, and media brands at scale. |

### 2.2 Nuxt (Vue)

| Aspect | Assessment |
|---|---|
| **Fit** | Good. Feature parity with Next.js for this project's needs: SSR, file routing, image module, i18n module. |
| **Benefits** | Vue's template model is often faster to learn than JSX; excellent official i18n; strong DX; Vue is genuinely popular in the Vietnamese market. |
| **Risks** | Smaller ecosystem than React for niche needs (date-range pickers, rich text, map wrappers, admin table components); smaller global hiring pool; fewer engineers with deep Nuxt SSR experience. |
| **Complexity** | Medium, comparable to Next.js. |
| **Maintainability** | Good. |
| **DX** | Excellent. |
| **Production readiness** | High. |

### 2.3 Remix / React Router framework mode

| Aspect | Assessment |
|---|---|
| **Fit** | Good. Its web-standards approach to forms, loaders, and actions maps unusually cleanly to a booking flow, and progressive enhancement means the booking form works even if JavaScript fails. |
| **Benefits** | Excellent form and mutation model; strong nested-routing data loading; less client-side state to manage. |
| **Risks** | Smaller ecosystem and hiring pool; the framework has been through significant identity and API changes, which raises long-term stability risk for a 5-year asset; less mature image and content tooling. |
| **Complexity** | Medium. |
| **Maintainability** | Moderate — dependent on the project's continued direction. |
| **Production readiness** | High technically; moderate on ecosystem certainty. |

### 2.4 Astro

| Aspect | Assessment |
|---|---|
| **Fit** | Excellent for the marketing half, weak for the application half. Astro would produce an outstanding, extremely fast editorial site for the 8 properties, but the booking flow, guest account, and admin console are genuinely application-shaped work that Astro is not designed to own. |
| **Benefits** | Best-in-class static performance; minimal JavaScript by default; excellent content tooling. |
| **Risks** | Splitting the site into Astro (marketing) + something else (app) means two codebases, two design system implementations, and a seam right where the guest crosses from browsing to booking — the highest-value moment in the funnel. |
| **Complexity** | Low alone; high in the split architecture it forces. |
| **Verdict** | Rejected as the primary framework for this reason. Reconsider only if the marketing and booking experiences are deliberately decoupled. |

### 2.5 SvelteKit

| Aspect | Assessment |
|---|---|
| **Fit** | Good technically. Smallest bundles, excellent performance, very pleasant DX. |
| **Risks** | Materially smaller ecosystem and hiring pool, especially in Vietnam; fewer production-grade admin/table/date-picker components, which matters because this project needs a heavy admin console; higher key-person risk for KAS. |
| **Verdict** | Technically credible, commercially risky for a client who must be able to hire maintainers. |

### 2.6 Angular

| Aspect | Assessment |
|---|---|
| **Fit** | Reasonable for the admin console, poor for the editorial site. Its SSR story has improved but remains less suited to marketing-page performance and design freedom. |
| **Risks** | Heavier bundles; more ceremony for a mostly content-driven site; slower iteration on editorial layout work. |
| **Verdict** | Not recommended for the public site. |

### 2.7 Frontend comparison

| | Next.js | Nuxt | Remix | Astro | SvelteKit | Angular |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| SEO / SSR (C1) | ●●●●● | ●●●●● | ●●●●● | ●●●●● | ●●●●○ | ●●●○○ |
| Mobile performance (C2) | ●●●●○ | ●●●●○ | ●●●●○ | ●●●●● | ●●●●● | ●●●○○ |
| Design freedom (C3) | ●●●●● | ●●●●● | ●●●●● | ●●●●● | ●●●●● | ●●●○○ |
| Admin app suitability | ●●●●● | ●●●●○ | ●●●●○ | ●●○○○ | ●●●○○ | ●●●●● |
| Ecosystem | ●●●●● | ●●●●○ | ●●●○○ | ●●●○○ | ●●●○○ | ●●●●○ |
| Hiring pool, Vietnam (C7) | ●●●●● | ●●●●○ | ●●○○○ | ●●○○○ | ●●○○○ | ●●●●○ |
| Maturity (C10) | ●●●●● | ●●●●● | ●●●●○ | ●●●●○ | ●●●●○ | ●●●●● |
| i18n (C11) | ●●●●○ | ●●●●● | ●●●○○ | ●●●●○ | ●●●○○ | ●●●●○ |

**Recommendation: Next.js.** It is the only candidate that scores highly on *both* halves of this
product — the editorial marketing site and the transactional application — while offering the largest
hiring pool in the local market.

---

## 3. Backend evaluation

### 3.1 Spring Boot (Java / Kotlin)

| Aspect | Assessment |
|---|---|
| **Fit for KAS** | Very strong on correctness. The booking domain has real invariants — inventory that must never go negative, a state machine with guarded transitions, money arithmetic, concurrent access to the last room. Spring's transaction management, JPA locking support, and mature validation are excellent tools for exactly this. |
| **Benefits** | Outstanding transactional integrity and concurrency primitives; a deep, stable ecosystem (Security, Data, Validation, Batch, Modulith); strong static typing that scales to a large domain model; very long-lived, with excellent backwards compatibility; `spring-modulith` gives enforceable module boundaries for a modular monolith; very large enterprise hiring pool in Vietnam. |
| **Risks** | Verbose relative to alternatives; slower iteration on simple CRUD; higher memory footprint and slower cold start (irrelevant on a persistent server, relevant if serverless is ever considered); two languages in the project (TypeScript + Java/Kotlin) means context switching and no shared types without codegen; JPA misuse is a classic source of performance problems. |
| **Complexity** | Medium-high. More upfront structure; more configuration. |
| **Maintainability** | Excellent — arguably the best of the candidates for a system expected to live 5–10 years with changing maintainers. |
| **DX** | Good, not delightful. Slower feedback loop than a Node backend. |
| **Production readiness** | Exceptional. |

### 3.2 NestJS (Node / TypeScript)

| Aspect | Assessment |
|---|---|
| **Fit for KAS** | Strong on velocity and coherence. Sharing TypeScript with the frontend means one language, shared validation schemas, and shared types between API and UI — a real, ongoing productivity gain on a project with a large surface area and a small team. Its module/provider architecture maps well to the modular monolith requirement. |
| **Benefits** | One language across the stack; excellent DX and fast iteration; opinionated modular structure; first-class dependency injection making the required provider abstractions natural; strong validation and OpenAPI tooling; Prisma or Drizzle give excellent type-safe database access; very large and growing hiring pool in Vietnam; easy deployment anywhere. |
| **Risks** | Transactional and concurrency discipline is a matter of developer care rather than framework enforcement — the oversell-prevention path must be written and tested deliberately (though the actual protection lives in the database, not the framework, so this is manageable). Node's ecosystem churn is higher. Long-running CPU work needs care. Prisma's advanced locking support is more limited than JPA's, which pushes some concurrency control into explicit SQL. |
| **Complexity** | Medium. Less ceremony than Spring; more than a bare Express app. |
| **Maintainability** | Good to very good, provided module boundaries are enforced in review and by lint rules. |
| **DX** | Excellent. |
| **Production readiness** | High. Widely used for commercial systems of this size and larger. |

### 3.3 ASP.NET Core (C#)

| Aspect | Assessment |
|---|---|
| **Fit** | Technically excellent — comparable to Spring Boot on correctness, with better ergonomics and performance in several respects. EF Core is a strong ORM; C# is an excellent language for domain modelling. |
| **Risks** | Smaller hiring pool in the Vietnamese web/startup market than Java or Node; historically more Windows-associated (no longer true technically, but it still shapes local hiring and tooling familiarity). |
| **Verdict** | A perfectly defensible choice, and would be the recommendation if the KAS team already has .NET skills. Not recommended blind. |

### 3.4 Django (Python)

| Aspect | Assessment |
|---|---|
| **Fit** | Good for content-heavy CRUD. The admin is famously fast to stand up. |
| **Risks** | The built-in Django admin is a developer tool, not an operator tool — building the queue, inventory calendar, and sales workflow described in [09](09-admin-scope.md) means largely replacing it, so its main advantage evaporates. Dynamic typing is a liability on a domain model this size over years. Async story is workable but less natural. |
| **Verdict** | Not recommended. |

### 3.5 Laravel (PHP)

| Aspect | Assessment |
|---|---|
| **Fit** | Genuinely capable and very widely used in Vietnam — the largest hiring pool of any candidate here. Excellent velocity for CRUD, queues, and mail. |
| **Risks** | Weaker static typing for a complex domain; the ecosystem's conventions pull toward an active-record, framework-centric design that resists the clean domain/vendor separation KAS explicitly requires; a second language alongside the TypeScript frontend without the enterprise-grade domain tooling Spring offers in exchange. |
| **Verdict** | Viable, particularly on hiring grounds, but a weaker fit for the confirmed architectural principles. |

### 3.6 Go

| Aspect | Assessment |
|---|---|
| **Fit** | Excellent performance and operational simplicity; a single static binary is very easy to run. |
| **Risks** | Substantially more code for the CRUD, content, and admin surface that dominates this project; a thinner ecosystem for the "boring" needs here (localised content, rich validation, admin scaffolding, email templating); smaller local hiring pool for web application work. |
| **Verdict** | Optimises for a constraint (raw throughput) this project does not have. Not recommended. |

### 3.7 Backend comparison

| | Spring Boot | NestJS | ASP.NET Core | Django | Laravel | Go |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Transactional correctness (C4) | ●●●●● | ●●●●○ | ●●●●● | ●●●●○ | ●●●●○ | ●●●●○ |
| Domain modelling (C5) | ●●●●● | ●●●●○ | ●●●●● | ●●●○○ | ●●●○○ | ●●●○○ |
| Maintainability (C6) | ●●●●● | ●●●●○ | ●●●●● | ●●●○○ | ●●●○○ | ●●●●○ |
| Hiring in Vietnam (C7) | ●●●●● | ●●●●● | ●●●○○ | ●●●○○ | ●●●●● | ●●○○○ |
| DX / velocity (C8) | ●●●○○ | ●●●●● | ●●●●○ | ●●●●○ | ●●●●● | ●●●○○ |
| Operational simplicity (C9) | ●●●○○ | ●●●●○ | ●●●●○ | ●●●●○ | ●●●●○ | ●●●●● |
| Maturity (C10) | ●●●●● | ●●●●○ | ●●●●● | ●●●●● | ●●●●○ | ●●●●○ |
| Shared language with frontend | ○○○○○ | ●●●●● | ○○○○○ | ○○○○○ | ○○○○○ | ○○○○○ |

### 3.8 The real decision

**PROPOSED** — This narrows to **Spring Boot vs. NestJS**, and the honest summary is:

> **Spring Boot** buys the strongest possible guarantees on the parts of this system where a mistake
> costs money and trust (inventory, transactions, state transitions), at the cost of velocity and a
> second language.
>
> **NestJS** buys velocity, a single language across a large surface area, and shared types — at the
> cost of requiring more engineering discipline to get the concurrency-critical paths right.

Two observations tip the balance:

1. **The oversell guarantee is enforced by the database, not the framework.** A unique constraint, a
   check constraint (`available >= 0`), and `SELECT … FOR UPDATE` on the inventory rows work
   identically from either runtime. Spring makes it *easier*; PostgreSQL makes it *true*. This
   significantly reduces Spring's decisive advantage.
2. **The volume of work in this project is overwhelmingly content, CMS-like admin, forms, i18n, and
   editorial UI — not deep transactional logic.** The booking core is a small, well-understood slice
   of the whole. Optimising the entire stack for that slice, at the cost of velocity across the other
   90%, is the wrong trade.

**Recommendation: NestJS** — conditional on the team-skills answer (OQ-038). If KAS's engineering team
is Java-primary, **Spring Boot is the correct choice instead**, and this recommendation should be
reversed without hesitation. Both are documented as acceptable.

---

## 4. Database evaluation

### 4.1 PostgreSQL

| Aspect | Assessment |
|---|---|
| **Fit for KAS** | Excellent, and clearly the best fit. The domain is highly relational (properties → room types → inventory → bookings → booking lines), and correctness depends on transactions and constraints. |
| **Benefits** | Full ACID with strong isolation; `SELECT … FOR UPDATE` and advisory locks for the last-room race; **`daterange` with GiST exclusion constraints**, which is an unusually good fit for date-range booking logic; check constraints to enforce `available >= 0` at the storage layer; JSONB for flexible content blocks alongside strict relational data; excellent full-text search — sufficient for this catalogue size without adding a search engine; mature migrations and tooling; available managed on every cloud; permissive licence, no vendor lock-in. |
| **Risks** | Requires some operational knowledge (connection pooling, vacuum, index maintenance) — largely mitigated by using a managed service. |
| **Complexity** | Low with a managed provider. |
| **Maintainability** | Excellent. |
| **Production readiness** | Exceptional. |

### 4.2 MySQL / MariaDB

| Aspect | Assessment |
|---|---|
| **Fit** | Adequate. Would work. |
| **Risks** | No native range types or exclusion constraints, so date-overlap logic must be implemented and tested manually; weaker JSON support; historically looser default behaviours. |
| **Verdict** | No advantage over PostgreSQL for this workload. |

### 4.3 MongoDB

| Aspect | Assessment |
|---|---|
| **Fit** | Poor. The data is deeply relational and the correctness requirements are transactional. |
| **Risks** | Multi-document transactions exist but are not the model's strength; enforcing `available >= 0` across concurrent writers is markedly harder; referential integrity becomes application code. **This is precisely the shape of system where a document database causes oversells.** |
| **Verdict** | Rejected. |

### 4.4 SQL Server

Technically excellent; higher licensing cost; primarily a fit alongside a .NET stack. Not recommended
absent that context.

**Recommendation: PostgreSQL.** This is the least contentious decision in the document.

---

## 5. Supporting infrastructure

### 5.1 Object storage (media)

| Option | Assessment |
|---|---|
| **Cloudflare R2** *(recommended)* | S3-compatible, **zero egress fees** — significant for an image-heavy hospitality site; integrated CDN; simple pricing |
| **AWS S3 + CloudFront** | The most mature option, deepest ecosystem; egress costs add up on image-heavy delivery; more configuration |
| **Google Cloud Storage** | Comparable to S3; sensible if other Google services are used |
| **Self-hosted MinIO** | Full control, no egress cost, but KAS then owns durability, backup, and availability — not advisable for a small team |

All are S3-API compatible, so behind the `StorageProvider` port the choice is reversible. **Media CDN
and transformation:** an image CDN (Cloudflare Images, imgix, or the framework's own optimiser) is
strongly recommended — image delivery is the main determinant of this site's performance.

### 5.2 Email provider

| Option | Assessment |
|---|---|
| **Resend** | Excellent DX, modern API, good deliverability; younger company — a moderate longevity consideration |
| **Amazon SES** *(recommended for scale/cost)* | Very low cost, very reliable, excellent deliverability once warmed; more setup, minimal tooling, requires production-access approval |
| **Postmark** | Best-in-class transactional deliverability and analytics; higher cost; strict separation of transactional and marketing (which matches the recommended architecture) |
| **SendGrid / Mailgun** | Mature, full-featured; shared-IP reputation can be variable |

**PROPOSED** — Behind an `EmailProvider` port, start with whichever has the fastest setup, and treat
the decision as reversible. Regardless of provider: SPF, DKIM, and DMARC on the sending domain, and
**separate subdomains for transactional and marketing** so a marketing complaint rate can never
suppress a booking confirmation.

### 5.3 Maps

| Option | Assessment |
|---|---|
| **Google Maps Platform** *(recommended)* | Best coverage, POI data, and local search quality in Vietnam by a clear margin; guests recognise it; Places API supports the "what's around you" feature well; usage-based cost needs monitoring and key restriction |
| **Mapbox** | Superior styling control — attractive for a premium brand — but weaker Vietnamese POI data |
| **OpenStreetMap / MapLibre** | Free and open, no vendor lock-in, but Vietnamese POI coverage is inconsistent and there is no equivalent Places search |

**PROPOSED** — Google Maps behind a `MapProvider` port. For static property location displays,
consider a **pre-rendered static map image** to avoid loading a heavy interactive map SDK on every
property page — this is both a performance and a cost decision.

### 5.4 Cache

| Option | Assessment |
|---|---|
| **Redis (managed)** *(recommended)* | Session data, availability query caching, rate limiting, soft-hold coordination, and queue backing — one dependency covering several needs; universally understood |
| **In-memory / application cache** | Zero infrastructure, but does not survive restarts or work across instances |
| **CDN caching only** | Essential regardless, but cannot serve the dynamic availability path |

**PROPOSED** — Layered: CDN for static assets and cacheable pages; HTTP caching with revalidation for
property/room content; Redis for availability queries (short TTL, invalidated on inventory change),
rate limiting, and sessions. **Availability responses must have a short TTL and be invalidated
eagerly** — stale availability is worse than slow availability.

### 5.5 Queue / background jobs

| Option | Assessment |
|---|---|
| **BullMQ on Redis** *(recommended with NestJS)* | Reuses the existing Redis; good DX; retries, delayed jobs, and repeatable jobs cover every need here — emails, soft-hold expiry, reminder scheduling, review invitations |
| **Database-backed queue** | Fewest moving parts, transactional with business data; adequate at KAS's volume |
| **Cloud managed (SQS, Pub/Sub)** | Highly reliable, more operational surface than needed at this scale |
| **Kafka** | Substantially over-engineered for this workload |

**PROPOSED** — Delayed and scheduled jobs are essential to this product: check-in reminders,
post-stay emails, review invitations, soft-hold expiry, and request expiry all depend on them. Jobs
must be **idempotent** — a retried reminder must not send twice.

### 5.6 Authentication

| Option | Assessment |
|---|---|
| **Self-hosted in the application** *(recommended)* | Full control of the customer data model, no per-MAU cost, no vendor dependency on the login path, and the booking domain already needs a first-class customer entity. Cost: session, token, and password-reset security must be implemented correctly — well-trodden ground with mature libraries |
| **Auth0 / Clerk** | Fast to implement, good security defaults, but per-user pricing grows with the customer base, adds a hard external dependency on the login path, and splits customer identity across two systems |
| **Keycloak (self-hosted)** | Powerful and free, but a heavy operational component for a team of this size |
| **Supabase Auth** | Good value if Supabase is used for the database as well; otherwise an odd coupling |

**PROPOSED** — Self-hosted authentication in the platform, behind a thin internal abstraction so a
future migration to a provider remains possible. Social/Zalo login can be added as additional
identity providers without changing the customer model.

### 5.7 Deployment

| Option | Assessment |
|---|---|
| **Managed container platform** (Fly.io, Railway, Render, AWS App Runner, Google Cloud Run) *(recommended)* | Container-based so there is no lock-in; low operational burden; scales adequately; several offer Singapore regions with good latency to Vietnam |
| **VPS + Docker Compose** | Cheapest and simplest to reason about; KAS owns uptime, patching, and backups; viable given real scale, but single-point-of-failure risk |
| **Kubernetes** | Rejected — vastly disproportionate to 8 hotels and a few hundred bookings a month |
| **Serverless functions** | Attractive pricing; poor fit for a stateful connection-pooled backend with background jobs; cold starts hurt the availability-search path |
| **Vercel (frontend)** | Best-in-class Next.js hosting and DX; some lock-in to platform-specific features if used carelessly; edge presence matters for Vietnamese latency |

**PROPOSED** — **Region matters more than platform.** Hosting in Singapore (or, if the data-residency
review requires it, in Vietnam) is important for TTFB from Vietnamese users. A US-region deployment
would add 200ms+ of latency to every request and jeopardise the performance targets. This must be
settled alongside the data-residency question (OQ-039).

### 5.8 Other supporting choices

| Concern | Recommendation |
|---|---|
| Error tracking | Sentry — mature, good source-map support |
| Analytics | Privacy-respecting (Plausible/Umami) plus server-side funnel events; GA4 only if marketing requires it |
| Uptime monitoring | Any external prober on homepage, search, and booking submission |
| CI/CD | GitHub Actions — ubiquitous, sufficient |
| Secrets | Platform secret manager, or a dedicated store; never in the repository |
| Search | PostgreSQL full-text search. **No Elasticsearch** — the catalogue is 8 properties |
| Rich text | A structured editor producing sanitised, structured content, not raw HTML |
| Feature flags | Simple database-backed flags; no external service needed at this scale |

---

## 6. Architecture style

**CONFIRMED** — Modular monolith preferred; avoid premature microservices; clear domain boundaries;
the business/domain layer must not depend directly on external vendors.

**PROPOSED** — The evaluation confirms this is correct for KAS. The system is small-data,
single-tenant, and correctness-critical. A monolith gives ACID transactions across the booking and
inventory boundary — which is exactly where distributed architecture would introduce the eventual
consistency that causes oversells. Microservices would add operational cost and failure modes in
exchange for scaling properties this system does not need.

Module boundaries proposed in [12-recommended-stack.md](12-recommended-stack.md) §3.

---

## 7. Summary of recommendations

| Layer | Recommendation | Confidence | Contingency |
|---|---|:--:|---|
| Frontend | **Next.js (React, TypeScript)** | High | Nuxt if the team is Vue-primary |
| Backend | **NestJS (TypeScript)** | Medium-high | **Spring Boot if the team is Java-primary** (OQ-038) |
| Database | **PostgreSQL** | Very high | — |
| ORM / data access | **Prisma or Drizzle** (Phase 2 decision) | Medium | — |
| Object storage | **Cloudflare R2** (S3-compatible) | High | Any S3-compatible provider |
| Email | **Resend or Amazon SES** behind a port | High | Interchangeable |
| Maps | **Google Maps Platform** behind a port | High | Mapbox if styling outweighs POI data |
| Cache | **Redis (managed)** | High | — |
| Queue | **BullMQ on Redis** | High | Database queue if simplicity is preferred |
| Auth | **Self-hosted in-platform** | Medium-high | Managed provider if speed outweighs cost |
| Deployment | **Managed containers, Singapore region** | Medium | Pending data residency (OQ-039) |
| Architecture | **Modular monolith** | Very high | — |

Full rationale and the resulting architecture: [12-recommended-stack.md](12-recommended-stack.md).

**Nothing in this document has been installed, initialised, or committed.**
