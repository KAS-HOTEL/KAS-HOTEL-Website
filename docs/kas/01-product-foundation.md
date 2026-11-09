# 01 — Product Foundation

**Status of this document:** Phase 1 draft for approval
**Owner:** Product Architecture
**Last updated:** 2026-08-14

---

## 1. What KAS is

**CONFIRMED** — KAS is a hotel group founded in **2019**, operating **8 hotels in Ho Chi Minh City,
Vietnam**. The first property was **KAS Passion Boutique Hotel**. The group positions itself as
**premium / high-end hospitality**, serving a **broad audience**, with **customer service and
hospitality as its primary brand value**.

## 2. What we are building

**CONFIRMED** — A premium multi-property hotel website and **direct booking platform**, consisting of
two connected products sharing one domain core:

| Product | Audience | Purpose |
|---|---|---|
| **KAS Public Website** | Guests, prospective guests, search engines | Brand discovery, property storytelling, room exploration, booking request submission, guest account |
| **KAS Admin Console** | KAS staff (Admin, Super Admin) | Property/content management, room and inventory management, pricing, booking request handling, customer and review management, communications, analytics |

These are **two front-end applications over one backend domain**, not two systems. See
[12-recommended-stack.md](12-recommended-stack.md).

## 3. The defining product decision

**CONFIRMED — This is a booking *request* platform, not an instant-payment booking engine.**

```
Customer searches
  → selects hotel
  → selects room type(s)
  → selects quantity
  → reviews "Your Stay"
  → enters customer information
  → submits BOOKING REQUEST
      ↓
Sales / Admin receives the request
  → Sales contacts the customer
  → Availability is confirmed
  → Payment is arranged outside the website
  → Booking becomes CONFIRMED
```

**CONFIRMED** — This must **not** be converted into a Booking.com-style instant online payment flow.

**PROPOSED** — Product consequence: the platform's job is to make the *request* feel as credible,
premium, and reassuring as an instant confirmation would. Every design decision downstream of the
submit action exists to close the trust gap that a request model naturally opens: clear expectation
setting, a stated response time, an immediate acknowledgement email, a visible request status in the
guest account, and a human name attached to the follow-up.

This is not a limitation to be apologised for. Handled well, it is consistent with the brand value of
personal hospitality. See [02-brand-foundation.md](02-brand-foundation.md) and
[05-booking-sales-model.md](05-booking-sales-model.md).

## 4. Product principles

**PROPOSED** — The following principles govern all design and engineering decisions. They are ranked;
where two conflict, the higher-numbered principle yields.

1. **The guest never sees operational internals.** Room numbers, staff notes, inventory states,
   internal statuses, and sales workflow detail are invisible to guests. Guests see room *types* and
   *availability counts* only. (**CONFIRMED** as a hard rule.)
2. **Every property has an identity.** The eight hotels are not eight rows in a table rendered as
   eight identical cards. Each has its own story, imagery, and character. (**CONFIRMED** as a
   direction.)
3. **Positive framing is a product rule, not a style preference.** No property is described using
   diminishing language. Enforced at content-model level and in editorial review. See
   [02-brand-foundation.md](02-brand-foundation.md).
4. **The domain layer owns the truth; vendors are replaceable.** Payment, email, storage, maps, SMS
   and analytics are all behind provider abstractions. No vendor SDK type appears in domain code.
   (**CONFIRMED** as a requirement.)
5. **Availability is never overstated.** The system must make it structurally impossible to request
   more rooms than the recorded available inventory. (**CONFIRMED**.)
6. **Modular monolith until proven otherwise.** Clear internal module boundaries; a single deployable
   backend. Microservices require a documented, specific justification. (**CONFIRMED** as a
   preference.)
7. **Mobile is the primary surface.** Vietnamese travel research and booking behaviour is
   mobile-dominant; the design must be authored mobile-first, not adapted down.
8. **Slow is broken.** A premium brand cannot ship a slow site. Performance budgets are requirements,
   not aspirations. See [10-system-requirements.md](10-system-requirements.md).

## 5. Scope

### 5.1 In scope for the platform (across phases)

**CONFIRMED** — Guest capabilities:

- Discover the KAS brand and history
- Explore all 8 hotels; compare locations
- View hotel imagery, room types, amenities, prices, available quantities
- Select multiple rooms and multiple room types in a single booking
- Create a booking request
- Manage an account
- Receive booking emails, notifications, check-in reminders, post-stay thank-you emails
- Submit verified reviews after a completed stay

**CONFIRMED** — Staff capabilities:

- Manage 8 hotels, hotel content, galleries, amenities
- Manage room types, room inventory, pricing
- Manage booking requests, customers, reviews, vouchers
- Manage notifications and emails
- View analytics; manage system settings

### 5.2 Explicitly out of scope now

| Item | Status | Note |
|---|---|---|
| Online payment gateway (VNPay, MoMo, ZaloPay, card) | **FUTURE** | Architecture must accommodate without redesigning the booking domain |
| Channel manager / OTA rate & inventory sync | **FUTURE** | Likely required eventually; see [16-open-questions.md](16-open-questions.md) |
| PMS integration (property management system) | **FUTURE** | Physical room assignment lives here, not in the guest platform |
| Physical room-number assignment module | **FUTURE** | Internal operational module only; never guest-facing |
| Receptionist and Hotel Manager roles | **FUTURE** | Not required initially (**CONFIRMED**) |
| Accountant role | **FUTURE** | (**CONFIRMED** as future) |
| Loyalty / membership programme | **NEEDS CONFIRMATION** | Not mentioned; common for premium groups. Raised as OQ-041 |
| Native mobile apps | **FUTURE** | Responsive web first |
| Restaurant / spa / event booking | **NEEDS CONFIRMATION** | Milestone has a large restaurant and rooftop bar; is F&B booking in scope? OQ-042 |

### 5.3 Deliberately *not* being built

**PROPOSED** — To keep scope honest, we are not building: an instant-payment checkout, a dynamic
revenue-management pricing engine, a review aggregation marketplace, or a multi-tenant SaaS product
for other hotel groups. KAS is the only tenant.

> **Clarified by [85](85-partner-property-model-amendment.md) (Pre-Phase 7).** The scope decision above
> is **unchanged**: V1 builds no marketplace, no partner onboarding, no billing and no commission, and
> KAS remains the only tenant. What is superseded is the implied *permanence* — a minimal `Partner`
> entity now sits above the eight properties, so a future multi-partner model is not structurally
> impossible. **V1 = 1 Partner → 8 Properties.**

## 6. Business model context

**CONFIRMED** — Revenue reaches KAS through a sales-assisted conversion, not through the website's
payment rail. The website's commercial job is therefore:

1. **Capture demand** that would otherwise flow to OTAs (which charge commission).
2. **Qualify** that demand with enough structured information that sales can act immediately.
3. **Build brand equity** so that repeat guests come direct by default.

**PROPOSED** — This makes *lead quality* and *request-to-confirmation rate* more important product
metrics than raw conversion rate. A request the sales team cannot fulfil is worse than no request.

Industry context (see [17-research-notes.md](17-research-notes.md)): direct hotel bookings carry
materially higher average booking value than OTA bookings, and well-optimised direct booking sites
convert in the 2–4% range against an industry average of 1–2%. These are external benchmarks, not
KAS targets.

## 7. Success measures

**PROPOSED** — Targets are placeholders until the product owner sets real numbers (OQ-043).

### 7.1 Guest-side

| Metric | Definition | Why it matters |
|---|---|---|
| Search → request rate | Sessions with a search that end in a submitted request | Core funnel health |
| Request completeness | % of requests with all fields sales needs, no follow-up required | Lead quality |
| Time to first sales contact | Request submitted → first outbound contact logged | The single biggest trust risk in a request model |
| Request → confirmed rate | Requests reaching `CONFIRMED` | Commercial conversion |
| Guest account adoption | % of requests from authenticated guests | Repeat-direct behaviour |
| Verified review rate | Completed stays that produce a review | Trust content supply |

### 7.2 Platform-side

| Metric | Target (**PROPOSED**) |
|---|---|
| Largest Contentful Paint, mobile, homepage | ≤ 2.5s at p75 |
| Interaction to Next Paint | ≤ 200ms at p75 |
| Availability of booking request submission | ≥ 99.9% monthly |
| Overbooked requests accepted by the system | **0** — structurally prevented |
| Admin action → guest-visible content update | ≤ 60s |

## 8. Constraints and risks

| # | Constraint / risk | Impact | Mitigation |
|---|---|---|---|
| C1 | Request model creates a trust gap vs. OTAs offering instant confirmation | Abandonment at submit | Explicit response-time promise, instant acknowledgement email, visible request status, named sales contact |
| C2 | Sales response time is a human process, not a system guarantee | Guest frustration; brand damage | SLA timers, escalation, admin dashboard ageing view, alerting (see [14-booking-state-machine.md](14-booking-state-machine.md)) |
| C3 | Real inventory truth may live in a PMS or spreadsheets today | Availability drift, oversell risk | Platform is authoritative for *published* availability; reconciliation process needed. OQ-011 |
| C4 | High-quality photography is the single largest dependency of a premium hospitality site | Site cannot feel premium without it | Photography audit and shot list must start in parallel with Phase 2. OQ-030 |
| C5 | Vietnamese + English content doubles editorial workload | Content debt, untranslated pages | i18n modelled from day one; language fallback rules defined. OQ-020 |
| C6 | Pricing rules (weekend, seasonal, child, length-of-stay) are undefined | Displayed price may mislead | Prices shown as "from" estimates until rules confirmed. OQ-005..008 |
| C7 | Eight properties × room types × galleries is a substantial content-entry effort | Launch delay | Admin content tooling and bulk import considered in Phase 2 scoping |

## 9. Delivery phases

**PROPOSED** — Phase boundaries for approval.

| Phase | Content | Exit criteria |
|---|---|---|
| **1 — Foundation** *(this phase)* | Product, brand, domain, architecture, technology evaluation, open questions | Product owner approval; blocking open questions answered |
| **2 — Design & Data Definition** | Design system, key screen designs, final domain/schema, API contract, content model, real property/room/inventory data collection | Approved designs and a frozen v1 API contract |
| **3 — Core Build** | Auth, hotels, room types, inventory, availability, search, booking request, admin console, email | Guest can submit a request; admin can process it end to end |
| **4 — Trust & Lifecycle** | Reviews, notifications, check-in reminders, post-stay emails, vouchers, analytics | Full lifecycle live |
| **5 — Launch Hardening** | Performance, SEO, accessibility, security review, load testing, content freeze, cutover | Production launch |
| **6 — FUTURE** | Payment gateway, channel manager, PMS integration, loyalty, extra roles | — |

## 10. Non-goals for Phase 1

No code. No dependencies. No framework initialisation. No database. No deployment.
Confirmed empty repository at `C:\Kas-Web` verified before writing this documentation.
