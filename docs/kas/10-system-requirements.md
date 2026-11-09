# 10 — System Requirements

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. Functional requirements summary

**CONFIRMED** unless marked. Detail lives in the referenced documents.

| ID | Requirement | Reference |
|---|---|---|
| FR-01 | Guests can discover the KAS brand and history | [08](08-information-architecture.md) |
| FR-02 | Guests can explore all 8 properties, each with individual identity | [03](03-property-map.md) |
| FR-03 | Guests can compare property locations | [03](03-property-map.md) §7 |
| FR-04 | Guests can view property images, room types, amenities, prices, availability | [04](04-room-architecture.md) |
| FR-05 | Guests **never** see physical room numbers or internal inventory states | [04](04-room-architecture.md) §2 |
| FR-06 | Guests can select multiple rooms and multiple room types in one booking | [04](04-room-architecture.md) §5 |
| FR-07 | The system prevents requesting more rooms than available inventory | [15](15-inventory-rules.md) |
| FR-08 | Guests can submit a booking request; no online payment is taken | [05](05-booking-sales-model.md) |
| FR-09 | Guests can register, log in, and manage a profile | [06](06-user-roles.md) |
| FR-10 | Guests receive booking emails, notifications, check-in reminders, post-stay thank-you emails | [05](05-booking-sales-model.md) §7 |
| FR-11 | Only guests with a completed stay can submit a review | [06](06-user-roles.md) |
| FR-12 | Reviews support multi-dimension ratings, text, optional photos, Verified Stay, moderation, admin reply | [09](09-admin-scope.md) §3.6 |
| FR-13 | Admin can manage 8 properties, content, galleries, amenities | [09](09-admin-scope.md) |
| FR-14 | Admin can manage room types, inventory, and pricing | [09](09-admin-scope.md) §3.3 |
| FR-15 | Admin can process booking requests through the full lifecycle | [14](14-booking-state-machine.md) |
| FR-16 | Admin can manage customers, reviews, vouchers, notifications, emails | [09](09-admin-scope.md) |
| FR-17 | Admin can view analytics | [09](09-admin-scope.md) §3.10 |
| FR-18 | `SUPER_ADMIN` can manage users, roles, and global settings | [06](06-user-roles.md) |
| FR-19 | Bilingual Vietnamese/English content — **NEEDS CONFIRMATION** | [08](08-information-architecture.md) §7 |
| FR-20 | Payment gateway integration can be added without redesigning the booking domain | [05](05-booking-sales-model.md) §5.1 |

## 2. Performance

**PROPOSED** — Measured on a mid-range Android device over a throttled 4G connection, at p75 of real
user traffic, in Vietnam.

| Metric | Target | Rationale |
|---|---|---|
| Largest Contentful Paint (mobile) | ≤ 2.5s | Core Web Vitals "good"; also an SEO ranking input |
| Interaction to Next Paint | ≤ 200ms | Date picker and quantity steppers must feel instant |
| Cumulative Layout Shift | ≤ 0.1 | Image-heavy pages are the main risk; explicit dimensions required |
| Time to First Byte | ≤ 600ms | Requires edge caching or in-region hosting |
| Availability search response | ≤ 500ms p95 | The core interaction of the funnel |
| Booking request submission | ≤ 1.5s p95 | The highest-stakes action |
| Admin list views | ≤ 1s p95 at 10,000+ records | Operator productivity |
| Inventory calendar (8 properties × 90 days) | ≤ 2s | Bulk operations must remain usable |
| JS bundle, initial route | ≤ 200KB gzipped | Enforced in CI, not aspirational |
| Image payload, homepage | ≤ 1.2MB total, lazily loaded below fold | Photography-led design's central tension |

**PROPOSED** — Approach: server-rendered public pages, aggressive caching of property/room content
(which changes rarely), a separate uncached path for availability (which changes constantly),
responsive images in modern formats via a CDN, and a performance budget enforced by CI with a
failing build on regression.

## 3. Availability & reliability

**PROPOSED**

| Requirement | Target |
|---|---|
| Public site availability | ≥ 99.9% monthly |
| Booking request submission availability | ≥ 99.9% monthly |
| Admin console availability | ≥ 99.5% monthly |
| RPO (recoverable data loss) | ≤ 15 minutes |
| RTO (recovery time) | ≤ 4 hours |
| Backup retention | 30 days point-in-time; 12 monthly snapshots |
| Restore drill | Tested quarterly — an untested backup is not a backup |

**PROPOSED** — Degraded-mode behaviour: if the availability service is unhealthy, the public site
must still render property and room content, and must state that availability is temporarily
unavailable with a contact route — rather than showing wrong availability or a blank page. **The
system must never fabricate availability.**

## 4. Scale assumptions

**PROPOSED** — Sizing for architecture decisions. Real figures needed (OQ-037).

| Dimension | Assumption |
|---|---|
| Properties | 8, growing to ~15 within 3 years |
| Room types per property | 4–8 |
| Total physical rooms | Low hundreds |
| Inventory rows | ~15 room types × 8 properties × 730 days ≈ 90k rows — trivial for a relational database |
| Booking requests | 50–500 per month initially |
| Registered customers | Low tens of thousands within 3 years |
| Concurrent public sessions | Peak in the low hundreds |
| Media assets | 500–2,000 images |

**PROPOSED — conclusion:** this is a **small-data, high-polish** system. The engineering difficulty is
in correctness, content quality, and user experience — not in scale. This directly justifies a
modular monolith and argues strongly against distributed architecture.

## 5. Security

**PROPOSED** — Baseline: OWASP ASVS Level 2. The platform holds guest personal data, so a breach is a
brand-level event, not merely a technical one.

### 5.1 Application security

| Area | Requirement |
|---|---|
| Transport | TLS 1.3, HSTS with preload, no mixed content |
| Authentication | Argon2id password hashing; breach-list checking; progressive lockout; secure reset tokens (single-use, short-lived, hashed at rest) |
| Sessions | `HttpOnly`, `Secure`, `SameSite` cookies; rotating refresh tokens; server-side revocation; **never** `localStorage` |
| Authorisation | Deny by default; server-side enforcement on every request; explicit object-level checks |
| IDOR prevention | A booking reference is an identifier, **not** an access control. Every access checks ownership or permission |
| Input validation | Schema validation at every boundary, server-side; allowlist, not denylist |
| Output encoding | Context-aware escaping; rich text sanitised server-side against an allowlist |
| SQL injection | Parameterised queries only; no dynamic SQL string construction |
| CSRF | Anti-CSRF tokens on state-changing requests; `SameSite` cookies as defence in depth |
| Headers | Strict CSP (no `unsafe-inline`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Rate limiting | On login, registration, password reset, booking submission, review submission, and search |
| File upload | Type and magic-byte validation, size limits, malware scanning, stripped EXIF, served from a separate origin, never executable |
| Secrets | In a secret manager; never in the repository; rotated; write-only in admin UI |
| Dependencies | Automated vulnerability scanning in CI; a documented patching SLA |
| Logging | Structured, no personal data, no secrets, no tokens; security events retained separately |
| Admin hardening | Separate route, shorter sessions, full audit logging, step-up auth for destructive actions; 2FA is not required in V1 per owner decision [150](150-owner-decision-no-2fa.md) |

### 5.2 Specific threats for this platform

**PROPOSED**

| Threat | Mitigation |
|---|---|
| Internal data leak (room numbers, inventory states) via a public endpoint | Separate API surfaces, separate DTO types, explicit mappers, CI denylist contract test — [04](04-room-architecture.md) §2.1 |
| Booking enumeration via reference codes | Non-sequential references + mandatory ownership check + signed expiring links for guest access |
| Inventory manipulation via client-supplied quantities | All availability and pricing recomputed server-side; client values never trusted |
| Price manipulation via tampered payloads | Price computed server-side from a snapshot; client-supplied prices ignored entirely |
| Spam and speculative booking requests | Rate limiting, bot mitigation, duplicate detection, optional verification for large requests |
| Review fraud | Reviews structurally require a linked `COMPLETED` booking; one review per booking; moderation |
| Staff account compromise | Session revocation, audit log, least privilege, offboarding process; 2FA is not required in V1 per owner decision [150](150-owner-decision-no-2fa.md) |
| Mass personal-data export | `SUPER_ADMIN` only, audited, alerted |
| Voucher abuse | Server-side validation, per-customer usage limits, re-validation at confirmation |

### 5.3 Compliance

**NEEDS CONFIRMATION** — Legal review required (OQ-027, OQ-022, OQ-021).

- Vietnam's personal data protection regime imposes obligations on collection, consent, cross-border
  transfer, and retention. Data residency and transfer implications must be reviewed by counsel
  before a hosting region is finalised — this can materially constrain the infrastructure choice, so
  it is a **blocking** question for Phase 2, not a launch-time item.
- International guests may fall under GDPR; consent, access, and erasure mechanisms should be built
  to the stricter standard once and applied universally.
- **PCI-DSS is out of scope by design** — the platform never handles card data. This must remain true.
- Vietnamese VAT invoicing requirements affect what data is collected (OQ-022).

## 6. Authentication & authorisation

Covered in [06-user-roles.md](06-user-roles.md). Summary of requirements:

- Email + password with verification; recovery flow
- Role-based access control with permissions and property scope
- Deny-by-default endpoint authorisation with a CI check for undeclared endpoints
- Object-level ownership checks
- Session revocation and device management
- No 2FA requirement for staff in V1 — owner decision [150](150-owner-decision-no-2fa.md)
- Complete audit trail for privileged actions

## 7. Email architecture

**PROPOSED**

| Concern | Requirement |
|---|---|
| Abstraction | `EmailProvider` port; vendor adapters. Domain code never imports a vendor SDK |
| Delivery | Asynchronous via a queue; sending never blocks a user-facing request |
| Reliability | Retry with exponential backoff; dead-letter queue; admin-visible failures |
| Idempotency | A unique key per (event, booking, recipient) so a retry cannot double-send |
| Templates | Versioned, localised, previewable, test-sendable; content editable without deployment |
| Rendering | Table-based responsive HTML with a plain-text alternative; tested against major clients |
| Deliverability | SPF, DKIM, DMARC configured on the sending domain; **transactional and marketing sent from separate subdomains** so a marketing complaint rate can never suppress a booking confirmation |
| Bounce handling | Bounces and complaints processed; suppression list enforced |
| Consent | Marketing requires explicit opt-in and one-click unsubscribe; transactional email is exempt but must genuinely be transactional |
| Logging | Every send recorded with status, timestamp, template version, and recipient reference |

## 8. Notification architecture

**PROPOSED**

- A single domain-event stream drives all notifications; business logic publishes events and knows
  nothing about channels
- Channels: in-app (persisted, read/unread), email, and **FUTURE** SMS/Zalo/push
- Per-event recipient rules and per-user preferences
- Quiet hours for non-urgent staff notifications
- Escalation on SLA breach
- Delivery log with retry
- Preference changes take effect immediately

**PROPOSED — Zalo is worth explicit consideration** for guest communication in the Vietnamese market,
where it is the dominant messaging channel. Treated as **FUTURE** behind the same channel abstraction
(OQ-032).

## 9. Media storage

**PROPOSED**

| Concern | Requirement |
|---|---|
| Abstraction | `StorageProvider` port; S3-compatible object storage as the default adapter |
| Upload | Direct-to-storage with pre-signed URLs; the application server never proxies image bytes |
| Validation | MIME and magic-byte checks, dimension and size limits, malware scan |
| Derivatives | Multiple sizes and modern formats generated on upload or on demand via an image CDN |
| Delivery | CDN with long cache lifetimes and content-hashed URLs |
| Metadata | Alt text and caption (localised), category, property association, usage tracking |
| Originals | Retained; derivatives regenerable |
| Access | Public read for published media; private for internal documents such as payment evidence |
| Deletion | Blocked or warned where an asset is in use; soft delete with a grace period |

## 10. Error handling & validation

**PROPOSED**

- Consistent error contract across the API: stable machine-readable code, human-readable message,
  field-level detail, and a correlation ID
- Validation on the client for responsiveness and on the server as the authority — never client only
- **Domain errors** (no availability, invalid transition, voucher expired) are first-class, carry
  actionable guidance, and are distinguished from **system errors**
- Internal details, stack traces, and vendor error text are never exposed to clients
- Every user-facing error names the next action the guest can take
- Correlation IDs are surfaced in support-facing messages so an issue can be traced

## 11. Observability

**PROPOSED**

- Structured JSON logging with correlation IDs propagated across all layers
- Error tracking with alerting and release association
- Application metrics: request rate, latency percentiles, error rate, queue depth, email delivery
  rate, availability-search latency
- Business metrics: requests submitted, requests confirmed, SLA breaches, holds expiring
- Real user monitoring for Core Web Vitals from actual Vietnamese traffic
- Uptime monitoring on the homepage, search, and booking submission endpoints
- Alerting with defined severity, ownership, and escalation
- Health endpoints for the application and each critical dependency

## 12. Testing strategy

**PROPOSED**

| Level | Scope | Gate |
|---|---|---|
| Unit | Domain logic: availability, pricing, state machine, validation | Required for all domain code; the state machine and inventory rules require exhaustive transition coverage |
| Integration | Repositories, transactions, concurrency, provider adapters | Real database in CI, not mocks |
| Contract | API request/response schemas; **the public-response denylist test** | Blocking in CI |
| End-to-end | Search → select → Your Stay → request → admin processes → confirmed | Blocking before release |
| Concurrency | Simultaneous requests for the last available room | Must prove zero oversell |
| Accessibility | Automated axe checks plus manual keyboard and screen-reader passes on the booking flow | Blocking before launch |
| Performance | Lighthouse CI budgets; load test on search and submission | Blocking before launch |
| Security | Dependency scanning, SAST, and a pre-launch penetration test | Blocking before launch |
| Visual regression | Key pages across breakpoints | Advisory |

**PROPOSED** — Three areas warrant unusually high test investment because a defect there is a business
incident rather than a bug: **the inventory/oversell path**, **the booking state machine**, and **the
public/internal data boundary**.

## 13. Deployment & environments

**PROPOSED**

| Environment | Purpose |
|---|---|
| Local | Developer machines; containerised dependencies |
| Preview | Ephemeral per pull request; seeded data |
| Staging | Production-like; used for UAT and content rehearsal |
| Production | Live |

- Trunk-based development with short-lived branches; every merge to `main` deploys to staging
  automatically; production deploys are promoted deliberately
- Database migrations are versioned, forward-only, and reviewed; expand/contract for breaking changes
- Zero-downtime deployments; documented rollback
- Feature flags for incomplete work
- No manual changes to production data outside audited tooling
- Infrastructure as code
- Secrets in a managed secret store, distinct per environment

## 14. Non-functional requirement register

**PROPOSED**

| ID | Requirement | Priority |
|---|---|---|
| NFR-01 | Mobile LCP ≤ 2.5s p75 | Must |
| NFR-02 | Zero oversell — structurally prevented | Must |
| NFR-03 | Zero exposure of room numbers or internal inventory on public surfaces | Must |
| NFR-04 | WCAG 2.2 AA on all public pages | Must |
| NFR-05 | OWASP ASVS L2 | Must |
| NFR-06 | Bilingual VI/EN content model (**pending OQ-020**) | Must |
| NFR-07 | Server-rendered public pages for SEO | Must |
| NFR-08 | Full audit trail on privileged actions | Must |
| NFR-09 | Vendor abstractions for payment, email, storage, maps | Must |
| NFR-10 | RPO ≤ 15 min, RTO ≤ 4h | Must |
| NFR-11 | Admin usable at 10,000+ bookings | Should |
| NFR-12 | Preview environment per pull request | Should |
| NFR-13 | Real user monitoring from Vietnamese traffic | Should |
| NFR-14 | Multi-currency display | Could / **FUTURE** |
