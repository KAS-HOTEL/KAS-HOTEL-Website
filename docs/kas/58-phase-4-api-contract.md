# 58 — API Contract (V1)

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Frozen contract. **No implementation in this phase.**
**Last updated:** 2026-10-20 (§2.1 duplicate customer registration response)

---

## 1. Surfaces

**CONFIRMED** — Five surfaces with separate route trees, separate authorisation, separate rate limits
and **separate response types**. There is no shared controller and no "include internal fields if
admin" flag.

| Surface | Base path | Auth | Indexed |
|---|---|---|---|
| **Public Customer** | `/api/v1/public/**` | None | — |
| **Authenticated Customer** | `/api/v1/me/**` | Session, **own records only** | — |
| **Sales** | `/api/v1/admin/sales/**` | Staff + `sales.*` | `noindex` |
| **Operations** | `/api/v1/admin/ops/**` | Staff + `reservation.*` / `inventory.*` | `noindex` |
| **Admin / Platform** | `/api/v1/admin/**` | Staff + module permission | `noindex` |

**PROPOSED — why Sales and Operations are separate trees, not one admin tree with filters:** the
distinction is the whole architecture. Operations must see every channel; Sales must see only DIRECT.
Separate trees make the OTA-in-sales-queue defect a routing impossibility rather than a filter to
remember.

---

## 2. Conventions

| Concern | Rule |
|---|---|
| Format | JSON. `Content-Type: application/json; charset=utf-8` |
| Versioning | `/api/v1/…`. Breaking changes bump the version |
| Errors | `{ code, message, details[], correlationId }` — stable machine codes |
| Pagination | Cursor: `?cursor=&limit=` (max 100). Response `{ items[], nextCursor, total? }` |
| Filtering | Explicit named parameters only. No arbitrary query passthrough |
| Sorting | `?sort=field:asc\|desc`, from a documented allowlist |
| Idempotency | `Idempotency-Key` header on all state-changing POSTs |
| Concurrency | `If-Match` / `version` on MASTER updates → `409` on conflict |
| Localisation | `Accept-Language` or explicit `?locale=vi\|en` |
| Currency | Amounts always **minor units + explicit currency**. USD is display-only and never returned in a commitment response |
| Rate limits | Per surface and per endpoint class (§10) |
| Money shape | `{ "amountMinor": 1850000, "currency": "VND", "exponent": 0 }` |

### 2.1 Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Field-level detail in `details[]` |
| 401 | `UNAUTHENTICATED` | |
| 403 | `FORBIDDEN` | Permission or property scope |
| 404 | `NOT_FOUND` | Also returned instead of 403 for records the caller may not know exist |
| 409 | `VERSION_CONFLICT` · `DUPLICATE_REFERENCE` · `ILLEGAL_TRANSITION` · `ACCOUNT_ALREADY_EXISTS` | Customer registration email is already registered |
| 410 | `PROPERTY_CLOSED` | |
| 422 | `NO_AVAILABILITY` · `OCCUPANCY_EXCEEDED` · `HORIZON_EXCEEDED` · `CONFIG_MISSING` | Domain errors, with actionable guidance |
| 429 | `RATE_LIMITED` | |
| 503 | `AVAILABILITY_UNAVAILABLE` | **Never a guessed number** |

**PROPOSED** — `CONFIG_MISSING` is a first-class error. Placing an alternative hold with
`DIRECT_ALTERNATIVE_HOLD_DURATION` unset returns it, naming the setting — the system never invents a
value.

---

## 3. Public Customer API

Unauthenticated. **Cacheable except availability.**

### 3.1 Properties & content

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/public/properties` | The 8 properties | Filters: `district`, `character`, `amenity`, `collection`. Excludes `DRAFT`/`CLOSED` |
| GET | `/public/properties/{slug}` | Property detail | Includes facilities, amenities, landmarks, gallery, policies |
| GET | `/public/properties/{slug}/room-types` | Room types | Optional `checkIn`/`checkOut` adds availability |
| GET | `/public/properties/{slug}/room-types/{rtSlug}` | Room type detail | |
| GET | `/public/properties/{slug}/gallery` | Full gallery | |
| GET | `/public/properties/{slug}/reviews` | Published reviews | Paginated, sortable |
| GET | `/public/properties/{slug}/facilities` | Facilities with galleries | |
| GET | `/public/locations` | Map data — all properties | |
| GET | `/public/amenities` | Amenity taxonomy | |
| GET | `/public/trip-intents` | Find Your KAS groups and visible property slugs | `locale` (default `en`); additive owner-approved extension |
| GET | `/public/offers` · `/public/offers/{slug}` | Public offers | |
| GET | `/public/reviews` | Portfolio-wide reviews | |
| GET | `/public/content/pages/{key}` | Composed page blocks | Home, About, Story, FAQ, Policies |
| GET | `/public/policies/{type}` | Current published policy | Returns `version` for `termsVersion` |

### 3.2 Availability & search

| Method | Path | Purpose |
|---|---|---|
| GET | `/public/availability/search` | Portfolio search. `checkIn, checkOut, adults, children, childAges[], rooms, district?, amenity[]?, sort?` |
| GET | `/public/availability/properties/{slug}` | Per-property availability for a date range |
| POST | `/public/availability/quote` | Price + availability for a specific line set. Body: `{ propertySlug, checkIn, checkOut, adults, children, childAges[], lines:[{roomTypeSlug, quantity}], offerCode? }` |

**Response — availability, exactly:**

```jsonc
{
  "roomTypeSlug": "deluxe-room",
  "name": "Deluxe Room",
  "availableQuantity": 6,               // the ONLY inventory figure exposed
  "maxQuantitySelectable": 5,           // min(available, config B15)
  "nightlyFrom": { "amountMinor": 1850000, "currency": "VND", "exponent": 0 },
  "availableForWholeStay": true
}
```

**CONFIRMED** — No `total`, no `maintenance`, no buffer, no commitments, no holds, no room numbers.

**PROPOSED** — `POST` for `/quote` despite being read-only: the line set exceeds practical query-string
length and must not be cached. It is explicitly non-idempotent-key-bearing and creates nothing.

### 3.3 Request submission

| Method | Path | Purpose | Idempotency |
|---|---|---|---|
| POST | `/public/reservations/requests` | **Submit a booking request** | **Required** |
| GET | `/public/reservations/requests/{reference}/sent` | Confirmation screen data | — |
| GET | `/public/track/{signedToken}` | Guest request tracking | — |
| POST | `/public/track/{reference}/resend-link` | Re-issue a tracking link to the recorded email | Rate limited |

**Request body:**

```jsonc
{
  "propertySlug": "kas-milestone-premium-hotel",
  "checkIn": "2026-09-12", "checkOut": "2026-09-14",
  "adults": 3, "children": 1, "childAges": [6],
  "lines": [ { "roomTypeSlug": "deluxe-room", "quantity": 2 },
             { "roomTypeSlug": "suite-balcony", "quantity": 1 } ],
  "guest": { "fullName": "…", "email": "…", "phone": "+84…", "country": "VN",
             "preferredChannel": "ZALO", "bestTimeToContact": "EVENING" },
  "specialRequests": "…",
  "discoveryChannel": "TIKTOK",          // optional self-reported; NOT leadSource
  "offerCode": null,
  "acceptedTermsVersion": "booking-terms-v3",
  "marketingConsent": false,             // must default false
  "locale": "en"
}
```

**Response `201`:**

```jsonc
{
  "reference": "KAS-260912-4F7A",
  "status": "REQUEST_RECEIVED",          // guest vocabulary, never salesStatus
  "responsePromise": "within the day",   // from config A6 — single source
  "trackingUrlIssued": true,
  "estimatedTotal": { "amountMinor": 12450000, "currency": "VND", "exponent": 0 },
  "estimateDisclaimer": "Final amount is confirmed by the KAS team."
}
```

**PROPOSED** — The server sets `leadSource = WEBSITE`. A client **cannot** supply `leadSource`; the
optional `discoveryChannel` is self-reported marketing attribution and is stored separately
([29](29-direct-sales-crm-architecture.md) §10). This prevents a client from forging lead attribution.

**Errors:** `422 NO_AVAILABILITY` returns alternatives:

```jsonc
{ "code": "NO_AVAILABILITY",
  "details": [{ "roomTypeSlug": "suite-balcony", "requested": 1, "availableForStay": 0 }],
  "alternatives": { "nearestDates": [...], "otherProperties": [...] },
  "correlationId": "…" }
```

### 3.4 Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/public/auth/register` · `/login` · `/logout` · `/refresh` | Cookies: `HttpOnly`, `Secure`, `SameSite`. **Never `localStorage`** |
| POST | `/public/auth/forgot-password` · `/reset-password` | Single-use, short-lived, hashed tokens |
| POST | `/public/auth/verify-email` · `/resend-verification` | |

---

## 4. Authenticated Customer API — `/me`

**Ownership is checked on every record.** A reference identifies; the session authorises.

| Method | Path | Purpose |
|---|---|---|
| GET | `/me/profile` · PATCH | Profile |
| GET | `/me/preferences` · PATCH | Language, currency, communication preferences |
| GET | `/me/consent` · PATCH | **Per purpose** — transactional vs marketing |
| GET | `/me/stays` | My Stays. `?tab=upcoming\|requests\|past` |
| GET | `/me/stays/{reference}` | Stay detail + status timeline |
| POST | `/me/stays/{reference}/cancel` | Pre-`WON`: permitted. Post-`WON`: **blocked on config A4** |
| POST | `/me/stays/{reference}/accept-alternative` | Body `{ alternativeId }`; re-checks availability |
| GET | `/me/reviews` | My reviews |
| GET | `/me/reviews/eligible` | Reservations with `stayStatus = COMPLETED` and no review |
| POST | `/me/reviews` | Submit. Guard: eligibility (§[54](54-phase-4-state-machines.md)) |
| POST | `/me/reviews/{id}/photos` | Pre-signed upload |
| GET | `/me/notifications` · POST `/{id}/read` | |
| GET | `/me/offers` | Targeted offers |
| GET | `/me/sessions` · DELETE `/{id}` · DELETE `/me/sessions` | Sign out everywhere |
| POST | `/me/link-request` | Link a guest-submitted request by verified email |
| POST | `/me/data-export` · `/me/delete-request` | Privacy rights (**blocked on legal L1**) |

**Stay detail response — the filtered shape:**

```jsonc
{
  "reference": "KAS-260912-4F7A",
  "property": { "slug": "…", "name": "…", "district": "…", "phone": "…" },
  "checkIn": "2026-09-12", "checkOut": "2026-09-14", "nights": 2,
  "guests": { "adults": 3, "children": 1 },
  "rooms": [ { "roomTypeName": "Deluxe Room", "quantity": 2 } ],
  "status": { "code": "ROOMS_CONFIRMED", "label": "Your requested room is available",
              "guidance": "Next: we'll arrange payment together." },
  "timeline": [ { "code": "REQUEST_RECEIVED", "at": "…", "note": "…" } ],
  "total": { "amountMinor": 12450000, "currency": "VND", "exponent": 0 },
  "contact": { "agentFirstName": "Linh", "phone": "+84…", "zalo": "…" }
}
```

**CONFIRMED absent:** `salesStatus`, `stayStatus` raw values, `salesOwnerId`, `leadSource`,
`distributionChannel`, `otaReference`, holds, internal notes, SLA fields, room numbers.

**PROPOSED** — Only the agent's **first name** is returned. Enough to be personal; not enough to be a
staff directory.

---

## 5. Sales API — `/admin/sales`

**Scoped to `channelType = DIRECT` at the data layer.** An OTA reservation is not addressable here.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/sales/inquiries` | `sales.inquiry.manage` | Queue. `?status,leadSource,owner,followUpDue` |
| POST | `/sales/inquiries` | `sales.inquiry.manage` | Create. `leadSource` **required** |
| GET/PATCH | `/sales/inquiries/{id}` | `sales.inquiry.manage` | |
| POST | `/sales/inquiries/{id}/assign` · `/contact` · `/follow-up` | `sales.followup.manage` | |
| POST | `/sales/inquiries/{id}/qualify` | `sales.inquiry.manage` | **Creates a reservation.** Body carries property, dates, lines |
| POST | `/sales/inquiries/{id}/lose` | `sales.inquiry.manage` | Reason required; releases holds |
| GET | `/sales/requests` | `sales.request.view` | **The direct sales queue.** `?salesStatus,leadSource,owner,slaState,property` |
| POST | `/sales/requests` | `sales.request.create` | Create on the customer's behalf. `leadSource` required |
| GET | `/sales/requests/{reference}` | `sales.request.view` | Full workspace |
| POST | `/sales/requests/{reference}/assign` | `sales.request.assign` | |
| POST | `/sales/requests/{reference}/availability-check` | `sales.request.manage` | Live re-check |
| POST | `/sales/requests/{reference}/contact` | `sales.request.manage` | Log a contact |
| POST | `/sales/requests/{reference}/alternatives` | `sales.request.manage` | Offer alternatives; **`hold: true\|false` per alternative** |
| DELETE | `/sales/requests/{reference}/alternatives/{id}/hold` | `sales.request.manage` | Release an alternative hold |
| POST | `/sales/requests/{reference}/win` | `reservation.win` | → `salesStatus = WON` + `stayStatus = CONFIRMED`, one transaction |
| POST | `/sales/requests/{reference}/decline` · `/cancel` | `reservation.cancel` | Reason required |
| POST | `/sales/requests/{reference}/modify` | `reservation.modify` | Re-checks, re-prices, re-versions snapshot |
| POST | `/sales/requests/{reference}/payments` | `payment.record` | Record a payment |
| GET/POST | `/sales/requests/{reference}/notes` | `sales.request.manage` | **Internal. No guest surface exists** |
| POST | `/sales/requests/{reference}/messages` | `sales.request.manage` | Guest-visible; **preview required before send** |
| GET | `/sales/analytics/*` | `analytics.sales.view` | Conversion by lead source, SLA, owner performance |

**PROPOSED** — `/win` is deliberately named for the sales outcome, not `/confirm`. The route vocabulary
mirrors the field vocabulary, so `salesStatus = WON` and `POST /win` cannot drift apart.

---

## 6. Operations API — `/admin/ops`

**All channels.** Queries use `stayStatus`.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/ops/reservations` | `reservation.view` | `?stayStatus,channelType,property,checkIn,checkOut` |
| GET | `/ops/reservations/{reference}` | `reservation.view` | Full detail, any channel |
| GET | `/ops/arrivals?date=` | `reservation.view` | **`stayStatus = CHECK_IN_READY \| CONFIRMED`. Direct AND OTA** |
| GET | `/ops/departures?date=` | `reservation.view` | `stayStatus = CHECKED_IN` + check-out date |
| GET | `/ops/in-house` | `reservation.view` | `stayStatus = CHECKED_IN` |
| GET | `/ops/occupancy` | `reservation.view` | Derived from `stayStatus` |
| POST | `/ops/reservations/{reference}/check-in` · `/check-out` · `/no-show` | `reservation.checkin` | |
| POST | `/ops/reservations/{reference}/cancel` | `reservation.cancel` | |
| GET | `/ops/inventory` | `inventory.view` | Calendar: property × room type × date |
| PATCH | `/ops/inventory/{roomTypeId}/{date}` | `inventory.adjust` | `total`, `maintenance`, `otherBlocks`. **`available` is not writable** |
| POST | `/ops/inventory/bulk` | `inventory.adjust` | **Preview before commit is mandatory** |
| GET | `/ops/availability/lookup` | `inventory.view` | "What can I sell?" across properties |
| GET | `/ops/holds` · DELETE `/ops/holds/{id}` | `inventory.adjust` | Visibility and manual release |

**PROPOSED — the arrivals contract, stated explicitly because it is the highest-risk query in the
system:** `GET /ops/arrivals` **must not reference `salesStatus`**. It is covered by a blocking CI test
that seeds one direct and one OTA reservation on the same date and asserts both appear.

---

## 7. Distribution API — `/admin/ops/distribution`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/distribution/ota-reservations` | `reservation.ota.record` | **Record an OTA reservation.** Creates at `stayStatus = CONFIRMED`, `salesStatus = NULL` |
| GET | `/distribution/ota-reservations` | `reservation.view` | The register |
| PATCH/POST | `/distribution/ota-reservations/{id}` · `/cancel` | `reservation.ota.record` · `.cancel` | |
| GET | `/distribution/channels` | `inventory.view` | Channel status, buffer utilisation, recording lag |
| GET/PUT | `/distribution/buffer-rules` | `inventory.adjust` | Buffer configuration by property + room type + dates |
| GET | `/distribution/reconciliation` | `inventory.view` | Daily variance report |

**Recording request:**

```jsonc
{ "distributionChannelCode": "BOOKING_COM",     // required, explicit
  "otaReference": "1234567890",                 // required, unique per channel
  "propertyId": "…", "checkIn": "…", "checkOut": "…",
  "lines": [ { "roomTypeId": "…", "quantity": 2 } ],
  "guest": { "fullName": "…", "email": "…", "phone": "…" },
  "rate": { "amountMinor": 3600000, "currency": "VND", "exponent": 0 },
  "receivedAt": "2026-08-14T09:00:00Z" }        // for recording-lag measurement
```

**CONFIRMED** — The schema has **no `leadSource` and no `salesOwnerId` field**. They cannot be supplied
even by a malformed client. `409 DUPLICATE_REFERENCE` on a repeated `(channel, otaReference)`.
**Recording never fails on buffer overflow** — it auto-expands and alerts ([55](55-phase-4-inventory.md) §6.3).

---

## 8. Admin / Platform API — `/admin`

| Area | Endpoints | Permission |
|---|---|---|
| Properties | `GET/POST/PATCH /admin/properties[/{id}]`, `/publish`, `/preview` | `property.manage` |
| Property trip-intent assignments | `PATCH /admin/properties/{id}/trip-intents` | `property.manage`; additive owner-approved extension |
| Room types | `/admin/properties/{id}/room-types[/{rtId}]` | `roomtype.manage` |
| Facilities | `/admin/properties/{id}/facilities` | `property.manage` |
| Amenities | `/admin/amenities` | `amenity.manage` |
| **Rates** | `GET /admin/rates/grid`, `GET/PUT /admin/rates/base[/{roomTypeId}]`, `GET/POST /admin/rate-rules`, `PATCH /admin/rate-rules/{id}[/status]`, `POST /admin/rates/bulk-preview`, `/bulk-apply` | `rate.view` · `rate.manage` |
| Tax rules | `/admin/tax-rules` | `rate.tax.manage` |
| Customers | `/admin/customers[/{id}]`, `/merge-candidates`, `/merge`, `/anonymise` | `customer.view` · `customer.merge` · `customer.anonymise` |
| Reviews | `/admin/reviews`, `/approve`, `/reject`, `/reply` | `review.moderate` |
| Vouchers | `/admin/vouchers` | `voucher.manage` |
| Media | `/admin/media`, `/upload-url`, `/{id}/links`, `/{id}/usages` | `media.upload` · `media.publish` |
| Content | `/admin/content/pages/{key}` | `content.manage` |
| Notifications | `/admin/notification-rules`, `/deliveries` | `notification.manage` |
| Emails | `/admin/email-templates`, `/deliveries`, `/test-send` | `email.manage` |
| Analytics | `/admin/analytics/{sales\|distribution\|operations}` | `analytics.*.view` |
| **Users & roles** | `/admin/users`, `/roles`, `/{id}/role-assignments`, `/sessions` | `user.manage` — `SUPER_ADMIN` |
| **Settings** | `/admin/settings`, `/admin/settings/{key}` | `settings.manage` — `SUPER_ADMIN` |
| **Audit** | `GET /admin/audit` | `audit.view` — `SUPER_ADMIN` |

---

## 9. Public response denylist

**CONFIRMED** — Never exposed through Public or `/me`.

```
PHYSICAL          roomNumber · floor · unitId · buildingSection · assignedRoom
INVENTORY         total · reserved · occupied · maintenance · otherBlocks
                  otaAllotment · bufferTarget · directCommitted · otaCommitted
                  inventoryDayId · holdId · expiresAt · holdType · holdStatus
SALES             salesStatus · salesOwnerId · salesOwner (beyond first name)
                  leadSource · leadSourceDetail · inquiryId · slaDueAt · slaBreached
                  escalationLevel · assignmentHistory · followUpAt · attemptCount
DISTRIBUTION      distributionChannel · distributionChannelId · channelType
                  otaReference · recordingLag · commissionBasis · bufferUtilisation
PARTNER           partnerId · partnerCode · partnerName · partner · legalName
                  (a guest has no reason to learn which organisation owns a hotel)
INTERNAL          internalNote · reservationNote · contactLog · auditLog
                  priceOverrideReason · appliedRuleIds · ruleId · margin
CUSTOMER          identityMatchConfidence · mergeHistory · mergedIntoId
                  internalCustomerNote · otherCustomerData
MEDIA             storageKey · bucket · originalPath · checksum
SECURITY          passwordHash · refreshTokenHash · permissions[] · roleAssignments
```

**PROPOSED — four-layer enforcement:**

1. **Separate route trees** — public and admin share no controller.
2. **Separate response types** — `RoomTypePublicView` **has no field** capable of carrying a room
   number. Leaking is not a matter of forgetting to filter; the field does not exist.
3. **Explicit mappers, never object spread.** Adding a field to a domain entity cannot silently surface
   it publicly.
4. **Blocking CI contract test** — every Public and `/me` endpoint response, across all fixtures, is
   asserted against this denylist by key name at any nesting depth. A second test asserts the public
   room-type response matches an approved allowlist **exactly**.

---

## 10. Security controls

| Endpoint class | Rate limit (**PROPOSED**) | Notes |
|---|---|---|
| Login / register / reset | Strict per IP **and** per account | Progressive lockout |
| Request submission | Strict per IP and per email | Holds make spam costly |
| Review submission | Per account | |
| Availability search | Moderate per IP | Cacheable |
| Public content | Generous | CDN-fronted |
| Admin | Per user | |

**Cross-cutting:** TLS 1.3 + HSTS · strict CSP · anti-CSRF on state-changing requests · schema
validation at every boundary, allowlist not denylist · parameterised queries only · **object-level
ownership checked on every `/me` and admin record — a reference is an identifier, never a credential**
· **partner and property scope applied at the data layer**, not only in controllers · no personal data
in URLs, logs or analytics · correlation ID on every response.

**Cross-partner isolation test — blocking in CI**
([85](85-partner-property-model-amendment.md) §6.3): seed two partners; authenticate as Partner A's
admin; assert **every** admin endpoint returns **`404` (not `403`)** for Partner B's property, room
type, reservation, media asset, rate rule and review — **including when `property_id` is supplied
directly in the path or body**. `404` so the existence of another partner's records is not disclosed.

---

## 11. Idempotency

| Operation | Key | Behaviour on repeat |
|---|---|---|
| Submit request | `Idempotency-Key` header | Returns the original reservation |
| Record OTA reservation | `(channel, otaReference)` | `409` + the existing record |
| Record payment | `Idempotency-Key` | Returns the original payment |
| Win / decline / cancel | State machine guard | `409 ILLEGAL_TRANSITION` |
| Media upload | Content checksum | Returns the existing asset |
| Email send | `(event, reservation, recipient)` | Suppressed |

---

## 11.1 Amendment — the rate surface (2026-08-20)

**CONFIRMED — this amends §8's Rates row only.** Every route below implements a capability §7 of
[56](56-phase-4-pricing.md) already froze; none adds a capability, and none opens a new namespace.
The permission column now carries both permissions because doc 56 §7 separates them — reading the
grid is `rate.view`, changing anything is `rate.manage` — and the implementation follows doc 56 §7
rather than the single `rate.manage` this table previously showed.

| Method | Path | Permission | Frozen source | Was named in §8 |
|---|---|---|---|---|
| GET | `/admin/rates/grid` | `rate.view` | 56 §7 "View resolved rate grid" | yes (as `rate.manage`) |
| GET | `/admin/rates/base?propertyId=` | `rate.view` | 56 §7 "Set base rate — per room type" | **no — OQ-147** |
| PUT | `/admin/rates/base/{roomTypeId}` | `rate.manage` | 56 §7 "Set base rate — per room type" | **no — OQ-147** |
| GET | `/admin/rate-rules?propertyId=` | `rate.view` | 56 §7 "Create / edit rate rule" | **no — OQ-128** |
| POST | `/admin/rate-rules` | `rate.manage` | 56 §7 "Create / edit rate rule" | yes |
| PATCH | `/admin/rate-rules/{id}` | `rate.manage` | 56 §7 "**edit** rate rule" | **no — OQ-128** |
| PATCH | `/admin/rate-rules/{id}/status` | `rate.manage` | 56 §5.3 "Archive a rule — never delete" | **no — OQ-128** |
| POST | `/admin/rates/bulk-preview` | `rate.manage` | 56 §7 "**Preview grid before commit is mandatory**" | yes |
| POST | `/admin/rates/bulk-apply` | `rate.manage` | 56 §7 "Bulk apply across a range" | yes |

**There is no `DELETE` on any rate path**, by frozen rule: doc 56 §5.3 — "Rate rules are **never
deleted**, only `status = ARCHIVED`, so a snapshot's `ruleId` always resolves."

**`/admin/rates/base` stores nothing new.** `room_type.base_price_minor` has existed since migration
V5 and its column comment reads "Layer 0 of the pricing model (doc 56 §3)"; what was missing was any
route that could write it. Concurrency follows `room_type`, which carries `version` — `409
VERSION_CONFLICT` on a stale token, exactly as §2 requires for MASTER updates. `rate_rule` has no
`version` column and none was invented for it; bulk rate writes are serialised by pessimistic row
locks instead.

**Config B6 is untouched.** Doc 56 §9 still records base rates as `OPEN`. This amendment supplies the
mechanism; the numbers remain an owner input and none is seeded.

---

## 11.2 Amendment — the guest quote response (2026-08-20)

**CONFIRMED — owner decision.** §3.2 froze the quote's **request** body and stated no response shape;
that gap was OQ-123 and it is now closed. This amendment freezes the response and the three V1
restrictions that go with it. The request body in §3.2 is **unchanged**.

### 11.2.1 Response — quote, exactly

```jsonc
{
  "propertySlug": "kas-milestone-premium-hotel",
  "checkIn": "2026-09-12", "checkOut": "2026-09-14",
  "nights": 2,
  "lines": [
    {
      "roomTypeSlug": "deluxe-room",
      "roomTypeName": "Deluxe Room",
      "quantity": 2,
      "nightlyFrom": { "amountMinor": 1850000, "currency": "VND", "exponent": 0 },
      "subtotal":    { "amountMinor": 7400000, "currency": "VND", "exponent": 0 }
    }
  ],
  "roomsSubtotal": { "amountMinor": 12450000, "currency": "VND", "exponent": 0 },
  "total":         { "amountMinor": 12450000, "currency": "VND", "exponent": 0 },
  "currency": "VND",
  "estimate": true
}
```

**CONFIRMED** — This is a **guest** shape. It is explicitly **not** derived from doc
[56](56-phase-4-pricing.md) §5.2's `price_snapshot`, which is an internal persisted structure and
carries `ruleId` and `appliedRuleIds` — both on the §9 INTERNAL denylist. No rate rule, no rate
identifier, no priority, no specificity, no inventory column, no database id and no partner reference
appears here. `PublicResponseDenylistTest` scans the response type and proves it.

**Money** follows §2's shape — `{ amountMinor, currency, exponent }` — everywhere an amount appears.
The stay-level `currency` is carried in addition, so the currency of the stay is legible without
reading into a line.

**`estimate` is always `true`.** A quote is a calculation taken **before** submission; the amount a
guest owes is settled by the KAS team. See §11.2.4.

**`nightlyFrom` is the lowest nightly rate for that room type across the stay** — the same meaning
`RateResolutionIT."nightlyFrom is the lowest night of the stay"` already pins for §3.2. It is a
*display* price: when a rule varies the rate across nights, `subtotal` is **not**
`nightlyFrom × nights × quantity`, because `subtotal` is the real arithmetic of doc 56 §3.2 —
`Σ over nights (resolved rate) × quantity` — and that formula is CONFIRMED.

### 11.2.2 The quote creates nothing

**CONFIRMED.** Restating §3.2's PROPOSED note as a frozen guarantee: the quote **creates nothing**.
No reservation, no request, no `price_snapshot`, no inventory hold, no payment, no booking.

The persisted price snapshot remains the responsibility of `POST /public/reservations/requests` at
`salesStatus = REQUESTED` (S1), exactly as doc 56 §5.1 and doc
[14](14-booking-state-machine.md) §4.1 already freeze it.

### 11.2.3 V1 restrictions — children, occupancy, offers

**CONFIRMED — owner decision.** Three inputs the frozen request accepts have no frozen pricing rule.
V1 **refuses** each rather than guessing, with **422** and an actionable `details[]`:

| Input | V1 behaviour | Why |
|---|---|---|
| `children > 0` | **refused** | Config B10 (child pricing and age bands) is `OPEN` — [16](16-open-questions.md) OQ-007. Pricing a child as an adult would be wrong; pricing one free would invent a policy |
| `childAges[]` non-empty | **refused** | same rule, same reason |
| party exceeds capacity | **refused** | Config B11 (extra bed / extra adult) is `OPEN` — OQ-008. The request is never silently clamped or downgraded |
| `offerCode` supplied | **refused** | Config B23 (voucher rules) is `OPEN` — OQ-029. A supplied code is never silently ignored |

`children = 0` with `childAges: []` is fully supported and is the V1 path.

**Capacity** is the sum over the requested lines of `maxOccupancy × quantity`, compared against
`adults + children`. Aggregate rather than per-room, because assigning particular guests to
particular rooms is an allocation rule the corpus does not state — see OQ-154.

### 11.2.4 Estimate

**CONFIRMED.** `estimate` is `true` on every quote. Doc 56 §9's rule — *"every displayed price is an
estimate and is labelled as one"* — was written against configs B6 and A7; **A7 was retired rather
than supplied** when tax left V1 scope (doc [99](99-phase-7-5e-owner-decisions-applied.md) §12), so
that condition can no longer be met by supplying A7. The label is kept for a different and simpler
reason: **a quote precedes the snapshot**, and only the snapshot is a price the guest can hold KAS to.

**There is no tax field, no service-charge field and no zero-tax line.** Tax is out of V1 scope by
owner decision and `TaxIsOutOfScopeForV1Test` enforces its absence.

---

---

## 11.3 Amendment — the reservation-request idempotency conflict (2026-08-27)

**CONFIRMED — owner decision.** This amends **§2.1's `409` row only**, and adds nothing else. Every
other row of §2.1, and §11's Idempotency table, stand unchanged.

§2.1's 409 row becomes:

| HTTP | Code | Meaning |
|---|---|---|
| 409 | `VERSION_CONFLICT` · `DUPLICATE_REFERENCE` · `ILLEGAL_TRANSITION` · **`IDEMPOTENCY_KEY_REUSED`** | |

**`IDEMPOTENCY_KEY_REUSED`** — the same `Idempotency-Key` was replayed on
`POST /public/reservations/requests` with a **different canonical request body**. The server
fingerprints the whole body; a client neither supplies nor influences that value. Nothing is created
and nothing is mutated.

**This does not qualify §11's "Returns the original reservation".** That row governs a genuine retry
— same key, same body — which still returns the original result and is **never** a 409. The new code
covers the other case, which §11 never addressed.

**`DUPLICATE_REFERENCE` is untouched and stays OTA-only**, keyed `(channel, otaReference)` as §11's
*Record OTA reservation* row defines it. `POST /public/reservations/requests` never returns it.

Full reasoning: doc [117](117-phase-7-5f-step-16a-contract-amendment.md) §24.1, which closed OQ-170.
Implemented in Phase 7.5F Step 16A E4 — doc
[118](118-phase-7-5f-step-16a-e4-reservation-request-implementation.md).

---

## 12. Not in the V1 contract

Payment gateway endpoints · OTA/channel-manager sync endpoints · physical room assignment · rate plan
and restriction endpoints · loyalty · public availability-calendar endpoint (encourages date-shopping
and exposes inventory patterns) · any endpoint returning `distributionChannel` publicly · GraphQL.
