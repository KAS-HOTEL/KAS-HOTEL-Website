# 59 — RBAC & Permissions

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative
**Last updated:** 2026-08-14

---

## 1. Model

**CONFIRMED** — RBAC with **permissions** plus a **property scope**. Permission checks, never
hard-coded role checks, wherever a future role might need the same capability.

```
User ──has many──► RoleAssignment { role, propertyScope }
Role ──grants───► Permission[]
```

| Concept | Definition |
|---|---|
| **Permission** | A fine-grained capability string: `reservation.ota.record`, `rate.manage` |
| **Role** | A named bundle of permissions. Editable by `SUPER_ADMIN` |
| **Property scope** | `ALL` or an explicit set of property IDs |

---

## 2. Scopes

**PROPOSED** — Three scope kinds. Every permission declares which apply.

| Scope | Meaning | Resolution | Example |
|---|---|---|---|
| **GLOBAL** | Across the whole platform | All properties | `user.manage`, `settings.manage` |
| **PARTNER** ← **added by [85](85-partner-property-model-amendment.md)** | One partner's properties | `properties WHERE partner_id = assignment.partner_id` | `ADMIN` in V1 |
| **PROPERTY** | Only assigned properties | `properties WHERE id = ANY(assignment.property_ids)` | `inventory.adjust`, `reservation.view` |
| **OWN** | Only the actor's own records | — | `me.profile.edit`, `review.create` |

**CONFIRMED** — `PARTNER` is a **scope kind, not a role**. No role is added, renamed or removed. The
role catalogue in §3 is unchanged.

**PROPOSED — scope is enforced at the data layer**, not only in controllers. A property-scoped query
filters at the repository boundary, so a forgotten controller check cannot leak another property's
data. This is what makes future property-scoped roles safe to introduce.

---

## 3. Roles

**CONFIRMED direction** — Do not assume every role must exist in V1.

| Role | V1 | Scope | Purpose |
|---|:--:|---|---|
| `CUSTOMER` | ✔ | OWN | Guest with an account |
| `ADMIN` | ✔ | PROPERTY (`ALL` in V1) | KAS staff operating the platform |
| `SUPER_ADMIN` | ✔ | GLOBAL | Full administration, users, settings, audit |
| `SALES` | **Deferred** | PROPERTY | Direct sales only. In V1 its permissions sit inside `ADMIN` |
| `RESERVATIONS_STAFF` | **Deferred** | PROPERTY | OTA recording, arrivals, reconciliation |
| `HOTEL_MANAGER` | **Future** | PROPERTY | Property Admin — full management of assigned properties |
| `RECEPTIONIST` | **Future** | PROPERTY | Front Desk — arrivals, check-in/out, OTA recording |
| `CONTENT_MANAGER` | **Deferred** | PROPERTY | Content, media, publishing |
| `ACCOUNTANT` | **Future** | GLOBAL read | Payments, financial export |

**PROPOSED — why `SALES`, `RESERVATIONS_STAFF` and `CONTENT_MANAGER` are deferred rather than built.**
KAS has not yet supplied its team structure (config B24, B25). Creating roles before knowing who fills
them produces roles nobody holds. **The permissions exist now**; the bundles are trivial to create once
B24/B25 arrive. That is the point of permission-based design.

**AMENDED ([85](85-partner-property-model-amendment.md) §5.2)** — In V1, `ADMIN` holds
**`scope_kind = PARTNER`** resolving to the single KAS partner and therefore all eight properties.
This **supersedes** the earlier `propertyScope = ALL`.

In V1 the two resolve to an identical set, so behaviour is unchanged — but the semantics are now
correct, and when a second partner appears nothing structural changes. `SUPER_ADMIN` retains `GLOBAL`.

| Role | V1 scope | Reaches |
|---|---|---|
| `SUPER_ADMIN` | **GLOBAL** | Platform: users, roles, settings, audit, all partners |
| `ADMIN` | **PARTNER** → the KAS partner | All 8 properties |
| *(future)* `HOTEL_MANAGER` · `RECEPTIONIST` · `RESERVATIONS_STAFF` | **PROPERTY** | Assigned properties only |
| `CUSTOMER` | **OWN** | Own records only |

The scope is modelled now because retrofitting it later means auditing every query in the system —
the same argument that justified property scoping in [06](06-user-roles.md) §3.

---

## 4. Permission catalogue

### 4.1 Direct Sales

| Permission | Scope | Notes |
|---|---|---|
| `sales.inquiry.manage` | PROPERTY | Create, qualify, lose inquiries |
| `sales.followup.manage` | PROPERTY | Schedule and log follow-ups |
| `sales.request.view` | PROPERTY | The direct queue |
| `sales.request.create` | PROPERTY | Create on the customer's behalf |
| `sales.request.assign` | PROPERTY | Assign a sales owner |
| `sales.request.manage` | PROPERTY | Contact, availability check, alternatives, notes, messages |
| `reservation.win` | PROPERTY | → `salesStatus = WON` |
| `reservation.price.override` | PROPERTY | Bounded; beyond the limit requires `SUPER_ADMIN` (OQ-023) |

**CONFIRMED** — Every permission here is **structurally inapplicable to OTA reservations**: the sales
routes are scoped to `channelType = DIRECT` at the data layer, and the CHECK constraint makes a sales
owner on an OTA row impossible.

### 4.2 Operations

| Permission | Scope | Notes |
|---|---|---|
| `reservation.view` | PROPERTY | **All channels** |
| `reservation.create` | PROPERTY | Manual direct reservation |
| `reservation.modify` | PROPERTY | Dates, lines, quantities |
| `reservation.cancel` | PROPERTY | Reason required |
| `reservation.checkin` | PROPERTY | Check-in, check-out, no-show |
| `inventory.view` | PROPERTY | Calendar, availability lookup |
| `inventory.adjust` | PROPERTY | `total`, `maintenance`, `otherBlocks`, hold release |
| `payment.record` | PROPERTY | Record a payment |

### 4.3 Distribution

| Permission | Scope | Notes |
|---|---|---|
| `reservation.ota.record` | PROPERTY | **Property Admin · Reservations Staff · Front Desk** |
| `reservation.ota.cancel` | PROPERTY | Record an OTA cancellation |
| `reservation.ota.reconcile` | PROPERTY | Reconcile against the extranet |
| `distribution.buffer.manage` | PROPERTY | Safety buffer rules |

### 4.4 Commercial

| Permission | Scope |
|---|---|
| `rate.view` · `rate.manage` | PROPERTY |
| `rate.tax.manage` | GLOBAL |
| `voucher.manage` | GLOBAL |

### 4.5 Content & media

| Permission | Scope |
|---|---|
| `property.manage` · `roomtype.manage` · `amenity.manage` | PROPERTY / GLOBAL (amenity) |
| `content.manage` · `content.publish` | PROPERTY / GLOBAL |
| `media.upload` · `media.publish` · `media.delete` | PROPERTY |

### 4.6 Customers & reviews

| Permission | Scope | Notes |
|---|---|---|
| `customer.view` | PROPERTY | **Audited** — staff access to guest data is logged |
| `customer.edit` | PROPERTY | |
| `customer.merge` | GLOBAL | Confirm a merge candidate |
| `customer.anonymise` | GLOBAL | `SUPER_ADMIN` |
| `customer.export` | GLOBAL | `SUPER_ADMIN`, audited **and alerted** |
| `review.moderate` | PROPERTY | Approve / reject with a reason |
| `review.reply` | PROPERTY | |
| `review.delete` | GLOBAL | `SUPER_ADMIN` only (OQ-024) |

**CONFIRMED** — **There is no `review.edit` permission.** Staff may never rewrite a guest's review.

### 4.7 Platform

| Permission | Scope | Holder |
|---|---|---|
| `analytics.sales.view` · `analytics.distribution.view` · `analytics.operations.view` | PROPERTY | `ADMIN` |
| `analytics.financial.view` | GLOBAL | `SUPER_ADMIN`, `ACCOUNTANT` (future) |
| `notification.manage` · `email.manage` | GLOBAL | `ADMIN` |
| `email.campaign.send` | GLOBAL | `SUPER_ADMIN` |
| `user.manage` · `role.manage` · `settings.manage` · `audit.view` · `integration.manage` | GLOBAL | `SUPER_ADMIN` |

### 4.8 Customer self-service

`me.profile.edit` · `me.preferences.edit` · `me.consent.edit` · `me.stay.view` · `me.stay.cancel` ·
`review.create` · `me.data.export` · `me.account.delete` — all **OWN** scope.

---

## 5. V1 role bundles

| Permission group | `CUSTOMER` | `ADMIN` | `SUPER_ADMIN` |
|---|:--:|:--:|:--:|
| Own account (`me.*`, `review.create`) | ✔ | ✔ | ✔ |
| Direct sales (`sales.*`, `reservation.win`) | — | ✔ | ✔ |
| Operations (`reservation.*`, `inventory.*`) | — | ✔ | ✔ |
| Distribution (`reservation.ota.*`, `distribution.*`) | — | ✔ | ✔ |
| Commercial (`rate.manage`, `voucher.manage`) | — | ✔ | ✔ |
| `rate.tax.manage` | — | — | ✔ |
| Content & media | — | ✔ | ✔ |
| `customer.view` / `.edit` | — | ✔ | ✔ |
| `customer.merge` / `.anonymise` / `.export` | — | — | ✔ |
| `review.moderate` / `.reply` | — | ✔ | ✔ |
| `review.delete` | — | — | ✔ |
| `reservation.price.override` | — | ▲ bounded | ✔ |
| Analytics (sales, distribution, operations) | — | ✔ | ✔ |
| `analytics.financial.view` | — | ▲ | ✔ |
| `user.manage` · `role.manage` · `settings.manage` · `audit.view` · `integration.manage` | — | — | ✔ |
| `email.campaign.send` | — | — | ✔ |

▲ = bounded or pending an OQ decision (OQ-023, OQ-024).

---

## 6. Future role bundles

**PROPOSED** — Recorded so introducing them is configuration, not engineering.

| Role | Permissions |
|---|---|
| `SALES` | `sales.*` · `reservation.win` · `reservation.modify` · `reservation.cancel` · `payment.record` · `customer.view` · `analytics.sales.view`. **No `inventory.adjust`, no `rate.manage`, no `reservation.ota.*`** |
| `RESERVATIONS_STAFF` | `reservation.view/.modify/.checkin` · **`reservation.ota.record/.cancel/.reconcile`** · `inventory.view` · `analytics.operations.view`. **No sales permissions** |
| `RECEPTIONIST` | `reservation.view/.checkin` · `reservation.ota.record` · `inventory.view` · limited `customer.view` |
| `HOTEL_MANAGER` | All PROPERTY-scoped permissions for assigned properties. **No GLOBAL permissions** |
| `CONTENT_MANAGER` | `property.manage` · `roomtype.manage` · `content.*` · `media.*` · `amenity.manage` |
| `ACCOUNTANT` | `reservation.view` (read) · `payment.record` · `analytics.financial.view` |

**PROPOSED — the structural separation, stated as a rule:** `SALES` never holds `reservation.ota.*`,
and `RESERVATIONS_STAFF` never holds `sales.*`. The role bundles encode the business separation, and
the CHECK constraint enforces it even if a bundle is misconfigured. Two independent layers.

---

## 7. Enforcement rules

**PROPOSED** — Non-negotiable.

1. **Deny by default.** Every endpoint declares its required permission explicitly. An endpoint with no
   declaration **fails closed and fails a CI check**.
2. **Server-side is the only authority.** Client-side checks control presentation only.
3. **Property scope is applied in the data layer**, at the repository boundary.
4. **Object-level ownership is checked explicitly** on every `/me` and admin record. A reference is an
   identifier, **not** an access control.
5. **Sensitive transitions require a permission, not a role** — `reservation.win`,
   `reservation.price.override`, `review.delete`, `inventory.adjust`, `reservation.ota.record`.
6. **All privileged actions are audit-logged**: actor, action, target, before/after, timestamp, IP.
7. **Customer data access is audited** even when read-only.
8. `403` is returned as `404` where revealing existence would itself leak information.

---

## 8. Authentication requirements

| Concern | Rule |
|---|---|
| Password hashing | Argon2id + breach-list checking |
| Sessions | Short access token + rotating refresh; `HttpOnly`, `Secure`, `SameSite` cookies. **Never `localStorage`** |
| Revocation | Server-side; logout genuinely invalidates; "sign out everywhere" |
| **Staff 2FA** | Not required for any role in V1 — owner decision [150](150-owner-decision-no-2fa.md) |
| Staff accounts | Created by `SUPER_ADMIN` only. **No self-registration** |
| Session lifetime | Staff shorter than customer; step-up re-auth for destructive actions |
| Offboarding | Disable → sessions revoked immediately → assigned reservations and inquiries reassigned |
| Separate routes | Staff login is a distinct route from the customer site |

---

## 9. Property scope in practice

```
GET /admin/ops/arrivals?date=2026-09-12

  scope = ALL              → every property
  scope = [p1, p2]         → only p1 and p2, filtered at the repository
  scope = [p1], ?property=p3 → 404 (not 403 — p3's existence is not disclosed)
```

**PROPOSED** — The active scope is displayed in the admin UI at all times and echoed in page headings,
so an operator can never misread a filtered list as the whole picture.

---

## 10. Open items

| ID | Question | Impact |
|---|---|---|
| OQ-023 | May `ADMIN` override price, and to what limit? | `reservation.price.override` bound |
| OQ-024 | May `ADMIN` reject reviews, or only `SUPER_ADMIN`? Grounds for rejection? | `review.moderate` scope |
| Config B24 | Sales team structure | Whether `SALES` ships in V1 |
| Config B25 | OTA recording process owner | Whether `RESERVATIONS_STAFF` ships in V1 |
| Config A12 | Admin console language | UI, not permissions |
| OQ-027 / L1 | Data protection | `customer.export`, retention, anonymisation |
