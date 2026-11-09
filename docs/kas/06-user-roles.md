# 06 — User Roles & Authorisation

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. Initial roles

**CONFIRMED**

| Role | In scope now | Description |
|---|---|---|
| `CUSTOMER` | Yes | A guest with an account |
| `ADMIN` | Yes | KAS staff operating the platform |
| `SUPER_ADMIN` | Yes | Full system administration |
| `RECEPTIONIST` | **Not required initially** | Property-level front desk |
| `HOTEL_MANAGER` | **Not required initially** | Property-level management |
| `ACCOUNTANT` | **FUTURE** | Finance and reconciliation |

## 2. Role definitions

### 2.1 CUSTOMER — **CONFIRMED**

- Register and log in
- Manage profile
- Submit booking requests
- View their bookings
- Receive notifications
- Review completed stays

**PROPOSED** — additionally: manage saved guest details, view and redeem their vouchers, save
favourite properties, manage communication preferences, download booking summaries, and request
account deletion.

**PROPOSED** — A **guest (unauthenticated) requester** is not a role but a state. An unauthenticated
visitor may submit a booking request (pending OQ-016) and is later linked to a `CUSTOMER` account by
verified email address. Until verified, they can access their request only through a signed,
expiring link sent by email — never through a guessable reference code alone.

### 2.2 ADMIN — **CONFIRMED**

Manage hotels, rooms, inventory, pricing, bookings, customers, reviews, vouchers, content,
notifications, and analytics.

### 2.3 SUPER_ADMIN — **CONFIRMED**

Full system administration, user and role management, global settings, access to all properties.

### 2.4 Future roles — **FUTURE**

Recorded now only so the authorisation model does not need restructuring later.

| Role | Anticipated scope |
|---|---|
| `HOTEL_MANAGER` | Full management of assigned properties only; no global settings, no user management. *(≈ "Property Admin")* |
| `RECEPTIONIST` | Assigned property; view reservations, log arrivals, update occupancy, **record OTA reservations**; no pricing, no content. *(≈ "Front Desk")* |
| `RESERVATIONS_STAFF` | Assigned properties; **record and reconcile OTA reservations**, manage arrivals and departures; no direct sales ownership, no pricing, no content |
| `ACCOUNTANT` | Read-only reservations and payments; record payments; financial exports; no content, no inventory |

### 2.5 OTA reservation recording — OQ-075

**CONFIRMED (Phase 3.5)** — Recording OTA reservations is an **operational** task, **not** a KAS Sales
task. Suitable holders: **Property Admin · Reservation Staff · Front Desk**.

**PROPOSED** — Delivered as a **permission**, not a hard-coded role, so it moves cleanly as roles are
introduced:

```
reservation.ota.record        create and edit OTA reservations, property-scoped
reservation.ota.cancel        record an OTA cancellation
reservation.ota.reconcile     reconcile against the extranet
```

| Phase | Holder |
|---|---|
| **V1** | `ADMIN` (property-scoped) and `SUPER_ADMIN` |
| **Future** | `HOTEL_MANAGER`, `RECEPTIONIST`, `RESERVATIONS_STAFF` — additive, no restructuring |

**CONFIRMED** — Recording an OTA reservation **never** creates a sales owner and **never** places it in
the Direct Sales Queue. Enforced by the database CHECK constraint
([13](13-database-domain-overview.md) §3.4), not by UI filtering.

## 3. Authorisation model

**PROPOSED** — Roles alone are too coarse for a platform where future roles are property-scoped. The
recommended model is **RBAC with permissions, plus a property scope**.

```
User ─→ has many ─→ RoleAssignment { role, propertyScope }
Role ─→ grants ─→ Permission[]
```

- **Permission** — a fine-grained capability string: `hotel.edit`, `inventory.update`,
  `booking.transition.confirm`, `user.manage`, `settings.global.edit`.
- **Role** — a named bundle of permissions. Editable by `SUPER_ADMIN` only.
- **Property scope** — `ALL` or a specific set of property IDs.

**PROPOSED — Why build the scope now rather than later.** In v1, `ADMIN` is granted scope `ALL`, so
scoping has no visible effect. But retrofitting property scoping into an authorisation layer that
never had it means auditing every query and endpoint in the system. Modelling `propertyScope` from
day one costs little now and makes `HOTEL_MANAGER` and `RECEPTIONIST` an additive change later.

### 3.1 Enforcement rules

**PROPOSED** — Non-negotiable engineering rules:

1. **Deny by default.** Every endpoint declares its required permission explicitly. An endpoint with
   no declaration fails closed and fails a CI check.
2. **Server-side is the only authority.** Client-side role checks control *presentation only*. Every
   guarded action is re-verified on the server.
3. **Scope is applied in the data layer**, not only in controllers — property-scoped queries filter
   at the repository boundary, so a forgotten controller check cannot leak another property's data.
4. **Object-level authorisation is checked explicitly.** A customer may only read *their own* booking.
   Never rely on an unguessable identifier as an access control (this is the most common serious
   vulnerability in booking systems — insecure direct object reference).
5. **Sensitive transitions require permission, not just role** — e.g. `booking.transition.confirm`,
   `booking.price.override`, `review.publish`, `inventory.total.edit`.
6. **All privileged actions are audit-logged**: actor, action, target, before/after, timestamp, IP.

## 4. Permission matrix

**PROPOSED** — `✔` allowed · `—` not allowed · `▲` allowed with restrictions · `○` future role

| Capability | CUSTOMER | ADMIN | SUPER_ADMIN | ○ HOTEL_MANAGER | ○ RECEPTIONIST | ○ ACCOUNTANT |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Public site** |
| Browse properties, rooms, prices | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Submit booking request | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Own account** |
| Manage own profile | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| View own bookings | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Cancel own request (pre-confirmation) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Review a completed own stay | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Hotels & content** |
| View hotel admin records | — | ✔ | ✔ | ▲ scope | ▲ scope, read | — |
| Create / edit hotel | — | ✔ | ✔ | ▲ scope | — | — |
| Delete / archive hotel | — | — | ✔ | — | — | — |
| Manage gallery & amenities | — | ✔ | ✔ | ▲ scope | — | — |
| Publish content | — | ✔ | ✔ | ▲ scope | — | — |
| **Rooms & inventory** |
| Manage room types | — | ✔ | ✔ | ▲ scope | — | — |
| Edit `total` inventory | — | ✔ | ✔ | ▲ scope | — | — |
| Edit `maintenance` inventory | — | ✔ | ✔ | ▲ scope | ▲ scope | — |
| Update `occupied` / arrivals | — | ✔ | ✔ | ▲ scope | ▲ scope | — |
| Manage pricing | — | ✔ | ✔ | ▲ scope | — | — |
| Override price on a booking | — | ▲ limit | ✔ | ▲ limit | — | — |
| **Bookings** |
| View all booking requests | — | ✔ | ✔ | ▲ scope | ▲ scope | ✔ read |
| Assign / reassign | — | ✔ | ✔ | ▲ scope | — | — |
| Log contact, add internal notes | — | ✔ | ✔ | ▲ scope | ▲ scope | — |
| Modify booking details | — | ✔ | ✔ | ▲ scope | — | — |
| Transition to `AVAILABILITY_CONFIRMED` | — | ✔ | ✔ | ▲ scope | — | — |
| Record payment | — | ✔ | ✔ | ▲ scope | — | ✔ |
| Transition to `CONFIRMED` | — | ✔ | ✔ | ▲ scope | — | — |
| **Record an OTA reservation** | — | ✔ | ✔ | ▲ scope | ▲ scope | — |
| **Reconcile OTA against extranet** | — | ✔ | ✔ | ▲ scope | ▲ scope | — |
| **Be assigned as sales owner of an OTA reservation** | **—** | **—** | **—** | **—** | **—** | **—** |
| Mark checked-in / checked-out | — | ✔ | ✔ | ▲ scope | ▲ scope | — |
| Cancel a booking | — | ✔ | ✔ | ▲ scope | — | — |
| **Customers** |
| View customer records | — | ✔ | ✔ | ▲ scope | ▲ limited | ▲ limited |
| Edit customer data | — | ▲ | ✔ | ▲ scope | — | — |
| Delete / anonymise customer | — | — | ✔ | — | — | — |
| Export customer data | — | ▲ audited | ✔ | — | — | — |
| **Reviews** |
| Moderate (approve / reject) | — | ✔ | ✔ | ▲ scope | — | — |
| Reply publicly | — | ✔ | ✔ | ▲ scope | — | — |
| Delete a review | — | — | ✔ | — | — | — |
| **Vouchers** |
| Create / edit vouchers | — | ✔ | ✔ | — | — | — |
| Apply voucher to a booking | — | ✔ | ✔ | ▲ scope | — | — |
| **Communications** |
| Manage templates | — | ✔ | ✔ | — | — | — |
| Send manual communication | — | ✔ | ✔ | ▲ scope | — | — |
| Send bulk / campaign | — | — | ✔ | — | — | — |
| **Analytics** |
| Operational dashboards | — | ✔ | ✔ | ▲ scope | ▲ scope | ✔ |
| Financial reports | — | ▲ | ✔ | ▲ scope | — | ✔ |
| **System** |
| Manage users & roles | — | — | ✔ | — | — | — |
| Global settings | — | — | ✔ | — | — | — |
| View audit log | — | ▲ own | ✔ | — | — | — |
| Integration credentials | — | — | ✔ | — | — | — |

**NEEDS CONFIRMATION** — Several `▲` entries need product owner decisions: whether `ADMIN` may
override prices and to what limit; whether `ADMIN` may export customer data; whether `ADMIN` may
delete reviews. See OQ-023, OQ-024.

## 5. Authentication model

**PROPOSED** — Detail in [10-system-requirements.md](10-system-requirements.md) §6.

### 5.1 Customer authentication

- Email + password, with a strong password policy and breach-list checking
- **Email verification required before**: leaving a review, and viewing booking history. Whether it
  is required before *submitting* a request is OQ-025 — **PROPOSED**: not required, to protect
  conversion, but the request is flagged unverified for sales
- Password reset via single-use, short-lived, signed token
- **PROPOSED / FUTURE** — Social login (Google, Facebook) and Zalo login. Zalo is the dominant
  messaging platform in Vietnam and would meaningfully reduce friction. OQ-026
- **FUTURE** — Phone/OTP login, which suits the Vietnamese market well
- Optional 2FA — **FUTURE**

### 5.2 Staff authentication

- Separate login route from the customer site
- **2FA is not required for any staff role in V1**, per the owner decision in
  [150](150-owner-decision-no-2fa.md). Staff accounts remain protected by password
  authentication, session controls, permissions, audit logging and offboarding.
- No self-registration — staff accounts are created by `SUPER_ADMIN` only
- Shorter session lifetime than customer sessions; step-up re-authentication for destructive actions
- IP allowlisting for admin — **FUTURE**, evaluate operational feasibility

### 5.3 Sessions

**PROPOSED**

- Short-lived access token + rotating refresh token
- Tokens transported in `HttpOnly`, `Secure`, `SameSite` cookies — never `localStorage`
- Server-side revocation (a logout must actually invalidate)
- Session list with device/last-seen, and "sign out everywhere"
- **PROPOSED** lifetimes: customer access 15 min / refresh 30 days; staff access 15 min / refresh 12 h

## 6. Account lifecycle

**PROPOSED**

| Event | Behaviour |
|---|---|
| Registration | Account created `UNVERIFIED`; verification email sent |
| Email verified | → `ACTIVE` |
| Failed logins | Progressive delay, then temporary lock; alert the account owner by email |
| Password change | Invalidate all other sessions; notify by email |
| Email change | Verify the new address before it takes effect; notify the old address |
| Staff offboarding | `SUPER_ADMIN` disables the account; sessions revoked immediately; assigned bookings reassigned |
| Customer deletion request | Anonymise personal data; retain booking and financial records as required by law (OQ-027) |

## 7. Privacy

**PROPOSED**

- Customer personal data is accessible to staff **only** where an operational need exists; access to
  customer records is audit-logged.
- Bulk export requires `SUPER_ADMIN` and is audited.
- Guest passport/ID data is **not** collected by the platform in v1. Vietnamese properties are
  required to register foreign guests with local authorities, but that is a property-level process
  and putting identity documents into a web platform materially raises the security and compliance
  burden. Recommendation: keep it out of scope. OQ-028.
- Personal data must never appear in URLs, logs, or analytics events.
- Data retention periods require legal input. OQ-027.
