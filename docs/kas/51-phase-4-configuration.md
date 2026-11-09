# 51 — Business Configuration Freeze

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative configuration inventory
**Last updated:** 2026-08-14

> **No values are invented in this document.** Every entry is either supplied by KAS and documented, or
> marked `REQUIRED` / `OPEN` / `BLOCKED` with an owner.

---

## 1. Purpose

A single authoritative inventory of every value the platform needs but cannot derive. Each record
carries: **name · purpose · owner · scope · required stage · status · source · dependency**.

**Required stages:**

| Stage | Meaning |
|---|---|
| **A — Before development** | Implementation cannot start, or will be built wrong, without this |
| **B — Before production** | Can be built with the mechanism in place; the value must exist before launch |
| **C — Future** | Not needed for V1; the architecture must not preclude it |

**Statuses:** `SUPPLIED` · `OPEN` · `BLOCKED` (waiting on another input) · `CONFIG REQUIRED`
(mechanism built, value outstanding).

---

## 2. Category A — Required before development

These change what gets built, not just how it is configured.

| # | Name | Purpose | Owner | Scope | Status | Source | Dependency |
|---|---|---|---|---|---|---|---|
| A1 | **Room types per property** | Names, bed configuration, area, occupancy, count. Blocks the domain model freeze, content, pricing and inventory setup | Operations | Per property | `OPEN` | OQ-010 | — |
| A2 | **Room quantities (`total`) per room type** | The base of every availability calculation | Operations | Per property, room type | `OPEN` | OQ-010 | A1 |
| A3 | **Hosting region** | Determines infrastructure, latency and data residency posture | Engineering + Legal | Global | `BLOCKED` | OQ-039 | L1 |
| A4 | **Cancellation policy** | Must be displayed before the request is submitted. **The booking flow cannot publish without it** | Commercial + Legal | Global, per-property override | `OPEN` | OQ-045, OQ-055 | — |
| A5 | **No-show policy** | Drives the `NO_SHOW` transition, charge and inventory release | Commercial | Global, per-property override | `PARTIALLY RESOLVED` — operator cutoff is 23:59 Asia/Ho_Chi_Minh; charge and inventory-release terms remain open | OQ-045 | — |
| A6 | **"Within the day" SLA definition** | Cutoff hour, weekends, public holidays, escalation threshold. One value drives on-screen text, email, timer and escalation | Sales | Global | `OPEN` | OQ-051 | — |
| A7 | **VAT / service charge / invoice rules** | Rate, inclusive vs exclusive display, VAT invoice fields to collect | Finance + Legal | Global | `OPEN` | OQ-022 | — |
| A8 | **Brand assets** | Vector logo, colours, typefaces with Vietnamese diacritic support | Marketing | Global | `OPEN` | OQ-004 | — |
| A9 | **Amenity taxonomy + per-property assignment** | Filtering, comparison, property and room pages | Operations | Global taxonomy, per-property assignment | `OPEN` | OQ-031 | A1 |
| A10 | **Property districts and addresses** | Location IA, district pages, map, distance filters | Operations | Per property | `OPEN` | OQ-060 | — |
| A11 | **Default locale** | Which locale serves a visitor with no signal | Marketing | Global | `OPEN` | OQ-065 | — |
| A12 | **Admin console language** | One language in V1 | Operations | Global | `OPEN` | OQ-057 | — |

---

## 3. Category B — Required before production

The mechanism is built; the value must exist before launch.

| # | Name | Purpose | Owner | Scope | Status | Source | Dependency |
|---|---|---|---|---|---|---|---|
| B1 | **`DIRECT_ALTERNATIVE_HOLD_DURATION`** | How long an alternative-offer inventory hold survives before automatic release | Sales / Revenue | Global, optional per-property override | `CONFIG REQUIRED` | D-46, [14](14-booking-state-machine.md) §6.2 | — |
| B2 | **`DIRECT_REQUEST_HOLD_DURATION`** | How long a submitted direct request holds inventory before expiry | Sales | Global, optional per-property override | `CONFIG REQUIRED` | OQ-018 | — |
| B3 | **OTA safety buffer values** | Rooms held back from direct availability per property, room type and season | Revenue / Operations | Property + room type + date range | `BLOCKED` | OQ-074, [13](13-database-domain-overview.md) §3.4c | B7 |
| B4 | **OTA recording lag threshold** | The acceptable delay between an OTA reservation being received and recorded. Measured, not enforced by the system | Operations | Global | `CONFIG REQUIRED` | OQ-081 | — |
| B5 | **Reconciliation variance tolerance** | Acceptable daily variance between KAS and the OTA extranets before an alert | Operations | Global, per channel | `CONFIG REQUIRED` | [15](15-inventory-rules.md) §7.1b | — |
| B6 | **Rates per room type per property** | Base nightly rate, per room per night, in VND | Revenue | Property + room type | `OPEN` | OQ-005 | A1 |
| B7 | **Channel volume data** | 12 months of room-nights and revenue per distribution channel, per property. Needed to size B3 | Revenue | Per property, per channel | `OPEN` | OQ-033 | — |
| B8 | **Photography** | 12–30 images per property plus room-type sets, captioned, alt-texted, in both locales | Marketing | Per property | `OPEN` | OQ-030 | A8 |
| B9 | **Weekend / seasonal rate rules** | Day-of-week and seasonal rate variation, plus the peak calendar (Tết, holidays) | Revenue | Property + room type + dates | `OPEN` | OQ-006 | B6 |
| B10 | **Child pricing and age bands** | What counts as a child, free/reduced/full, bedding dependency | Revenue | Global | `OPEN` | OQ-007 | B6 |
| B11 | **Extra bed / extra adult pricing** | Availability and charge per room type | Revenue | Property + room type | `OPEN` | OQ-008 | B6 |
| B12 | **Deposit rule** | Whether a deposit is required to confirm, percentage, deadline | Finance | Global, per-property override | `OPEN` | OQ-017 | — |
| B13 | **Legal entity details** | Registered name, business registration number, tax code, address for the footer and policies | Legal | Global | `OPEN` | OQ-021 | — |
| B14 | **Early check-in / late check-out** | Offered? Charge? Requestable at booking? | Operations | Per property | `OPEN` | OQ-046 | — |
| B15 | **Maximum rooms per request / group threshold** | Above which a request routes to a group enquiry | Sales | Global | `OPEN` | OQ-015 | — |
| B16 | **Review window** | How long after checkout a guest may review | Marketing | Global | `OPEN` | OQ-040 | — |
| B17 | **Lifecycle communication timings** | Check-in reminders, post-stay, review invitation | Marketing | Global | `OPEN` | OQ-019 | — |
| B18 | **Inquiry follow-up attempt limit** | Attempts before an inquiry auto-transitions to `LOST` | Sales | Global | `OPEN` | OQ-080 | — |
| B19 | **Alternative offer response expiry** | How long the *offer* stands, distinct from the inventory hold (B1) | Sales | Global | `OPEN` | OQ-066 | — |
| B20 | **Same-day booking cutoff** | Latest hour a same-day request is accepted | Operations | Per property | `OPEN` | OQ-047 | — |
| B21 | **Maximum stay length** | Validation ceiling | Operations | Global | `OPEN` | OQ-035 | — |
| B22 | **USD FX rate source and refresh** | Provider, refresh cadence, rounding, disclaimer text | Finance | Global | `OPEN` | OQ-052 | — |
| B23 | **Voucher rules** | Types, stackability, applicability, usage limits | Marketing | Global | `OPEN` | OQ-029 | — |
| B24 | **Sales team structure** | Central vs per-property, headcount, hours, channels monitored | Sales | Global | `OPEN` | OQ-048, OQ-071 | — |
| B25 | **OTA recording process owner** | Who records, from where, at what cadence. **The operational hub decision depends on this process existing** | Operations | Per property | `OPEN` | OQ-075 | B24 |
| B26 | **Data retention periods** | Customer, reservation, audit log, financial records | Legal | Global | `BLOCKED` | OQ-027 | L1 |
| B27 | **Vietnamese label set** | Native copywriter review of navigation, status and email strings | Marketing | Global | `OPEN` | OQ-061 | — |

---

## 4. Category C — Future configuration

Not needed for V1. The architecture must not preclude them.

| # | Name | Purpose | Owner | Source |
|---|---|---|---|---|
| C1 | Channel manager credentials and mapping | Automated OTA synchronisation | Engineering | [29](29-direct-sales-crm-architecture.md) §6.2 |
| C2 | Channel-specific rate rules | `rate_rule.channel_scope` values per OTA | Revenue | [13](13-database-domain-overview.md) §4 |
| C3 | Rate plan definitions | Breakfast included, non-refundable, advance purchase | Revenue | OQ-034 |
| C4 | Rate restrictions | Closed-to-arrival, closed-to-departure, stop-sell | Revenue | [13](13-database-domain-overview.md) §4 |
| C5 | OTA commission / net-rate data | Distribution net-revenue reporting | Finance | OQ-072 |
| C6 | Payment gateway credentials | VietQR, MoMo, ZaloPay, VNPay, cards | Finance | [05](05-booking-sales-model.md) §5 |
| C7 | Loyalty / member rate configuration | Direct-booking advantage | Marketing | OQ-041 |
| C8 | Zalo / SMS messaging credentials | Notification channels beyond email | Marketing | OQ-032 |
| C9 | Social login providers | Google, Zalo | Engineering | OQ-026 |
| C10 | Additional display currencies | Beyond VND + USD | Finance | [25](25-i18n-currency-architecture.md) §6.6 |
| C11 | Additional distribution channels | Expedia, Klook and others as reference rows | Revenue | [13](13-database-domain-overview.md) §3.4b |

---

## 5. Legal inputs

Tracked separately because they gate other configuration.

| # | Name | Purpose | Owner | Stage | Status | Source |
|---|---|---|---|---|---|---|
| L1 | **Vietnamese personal data law review** | Retention, consent, cross-border transfer, residency. Gates A3 and B26 | Legal | **A** | `OPEN` | OQ-027 |
| L2 | **OTA contract review — rate parity** | Whether differential channel pricing is permitted, and under what terms | Legal | B | `OPEN` | OQ-076 |
| L3 | **OTA contract review — guest contact** | Whether a post-stay review invitation to an OTA guest is permitted, and what it may contain | Legal | B | `OPEN` | OQ-078 |
| L4 | **VAT invoicing obligations** | Which fields must be collected and issued | Legal + Finance | **A** | `OPEN` | OQ-022 |
| L5 | **Identity document handling** | Whether guest passport/ID data enters the platform. **Recommendation: no** | Legal | B | `OPEN` | OQ-028 |

---

## 6. Configuration storage model

**PROPOSED** — How these values live in the system.

| Class | Storage | Editable by | Audited |
|---|---|---|---|
| **Global settings** (SLA, hold durations, currency, locale, thresholds) | `system_setting` key/value with typed schema | `SUPER_ADMIN` | ✔ |
| **Property overrides** (check-in times, policies, cutoffs) | Property columns / `property_policy` | `ADMIN` property-scoped | ✔ |
| **Buffer rules** | `ota_safety_buffer_rule` | `ADMIN` property-scoped | ✔ |
| **Rate rules** | `rate_rule` | `ADMIN` with `rate.manage` | ✔ |
| **Master data** (room types, amenities, media) | Domain tables | `ADMIN` | ✔ |
| **Secrets** (provider credentials) | Secret manager, never the database | `SUPER_ADMIN`, write-only | ✔ |

**PROPOSED — three rules:**

1. **No hard-coded business value in application code.** Any value in this document that appears as a
   literal in code is a defect.
2. **A missing required setting fails loudly at the point of use**, naming the setting — it never
   silently defaults. B1 is the worked example: with no duration configured, placing an alternative
   hold returns an error naming `DIRECT_ALTERNATIVE_HOLD_DURATION`.
3. **Settings that produce guest-visible text show a live preview** beside the field, so a change to
   the SLA wording cannot silently alter what guests read.

---

## 7. Readiness summary

| Category | Count | Supplied | Open / blocked |
|---|---:|---:|---:|
| A — Before development | 12 | 0 | **12** |
| B — Before production | 27 | 0 | **27** |
| C — Future | 11 | — | — |
| L — Legal | 5 | 0 | **5** |

**No configuration value has been supplied to date.** Every entry is outstanding.

**PROPOSED — the critical path.** Three items gate the most downstream work:

1. **A1/A2 (room types and quantities)** — blocks the domain freeze, content, pricing and inventory.
2. **A4/A5 (cancellation and no-show)** — blocks the booking flow from publishing at all.
3. **L1 (data protection)** — blocks A3 (hosting region) and B26 (retention).

**B8 (photography)** has the longest lead time of any item and should be commissioned in parallel
regardless of the others.
