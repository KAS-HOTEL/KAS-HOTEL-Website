# 28 — Phase 1.5 Decision Log & Open Questions

**Phase:** 1.5 — Information Architecture
**Status:** Live register
**Last updated:** 2026-08-14

---

## 1. Purpose

This document records: what was **decided** in Phase 1.5, what those decisions **supersede** in Phase 1,
what **conflicts or gaps** surfaced while designing the IA, and what remains **open**.

**Governing rule (CONFIRMED):** on discovering a conflict with the Phase 1 business model, stop and
document it as NEEDS CONFIRMATION. **Nothing below has been silently resolved.**

---

## 2. Decision log

**CONFIRMED (Phase 1.5)**

| # | Decision | Value | Supersedes / resolves | Affected documents |
|---|---|---|---|---|
| D-01 | Backend | **Spring Boot** | Resolves **OQ-038**. [11](11-technology-evaluation.md)/[12](12-recommended-stack.md) recommended NestJS *conditional on team skills*, with Spring Boot as the stated contingency | 11, 12 |
| D-02 | Frontend | **Next.js + React + TypeScript** | Confirms the Phase 1 recommendation | 12 |
| D-03 | Database | **PostgreSQL** | Confirms | 12, 13 |
| D-04 | Architecture | **Modular monolith** | Confirms | 12 |
| D-05 | Languages | **Vietnamese + English** | Resolves the language half of **OQ-020** | 23, 24, 25 |
| D-06 | Currency display | **VND + USD** | **Changes** [10](10-system-requirements.md) NFR-14 (was *Could / FUTURE*) | 25 |
| D-07 | Base currency | **VND** | Confirms | 13, 25 |
| D-08 | Pricing basis | **Per room, per night** | Resolves the *basis* half of **OQ-005**. Actual rates still unknown | 13, 21, 26 |
| D-09 | Inventory source of truth | **Admin** | Resolves **OQ-011** in principle. Reconciliation risk **not** resolved (§4.6) | 15, 21 |
| D-10 | Customer room model | **Property → Room Type → Available Quantity** | Confirms | 4, 18 |
| D-11 | Room numbers | **Never customer-facing** | Confirms | 4, 18, 27 |
| D-12 | Payment | **No gateway in V1** | Confirms | 5, 26 |
| D-13 | Primary CTA | **REQUEST THIS STAY** | Confirms | 20, 26 |
| D-14 | Sales response promise | **Within the day** | Resolves **OQ-013** in spirit; boundary rules undefined (§4.4) | 21, 26, 27 |
| D-15 | Cancellation / no-show | **NOT YET DEFINED** | **OQ-045 stays open.** Has a direct IA consequence (§4.1) | 23, 26, 27 |
| D-16 | Roles | CUSTOMER · ADMIN · SUPER_ADMIN; future HOTEL_MANAGER · RECEPTIONIST · ACCOUNTANT | Confirms | 6, 21 |
| D-17 | UI direction | **Classic Luxury × Modern Hospitality** | New | 18, 20 |
| D-18 | Brand concept | *"KAS — Where Hospitality Feels Personal."* — **concept, not approved slogan** | Confirms Phase 1 treatment. **OQ-050 stays open** | 2 |
| D-19 | Flagship | Milestone, **additive** treatment | Confirms | 3, 18, 23 |
| D-20 | Sales scope | **KAS Sales manages DIRECT customers and DIRECT leads only** | **Corrects** the unqualified "sales workflow" in [05](05-booking-sales-model.md) §4 | 5, 9, 21, 29 |
| D-21 | Three concepts | **DISTRIBUTION CHANNEL · LEAD SOURCE · SALES OWNER** — three independent fields, never one | **Corrects** the single generic `source` field in [13](13-database-domain-overview.md) §3.4 | 13, 15, 21, 29 |
| D-22 | Distribution channels | `DIRECT` · `BOOKING_COM` · `AGODA` · `CTRIP` · `TRAVELOKA` | New. Partially answers OQ-033 (channels named; volume still open) | 13, 15, 29 |
| D-23 | Lead sources | `WEBSITE` · `FACEBOOK` · `ZALO` · `TIKTOK` · `INSTAGRAM` · `PHONE` · `WALK_IN` · `REFERRAL` · `RETURNING_CUSTOMER` · `OTHER` | New | 13, 21, 29 |
| D-24 | OTA routing | OTA reservations **never** enter the sales queue, sales assignment, or the direct lead workflow | **Corrects** [15](15-inventory-rules.md) §7 and [21](21-admin-navigation.md) §3.2/§5.1 | 15, 21, 29 |
| D-25 | Central inventory | Direct + OTA + operational changes feed one availability model | Extends [15](15-inventory-rules.md) with `ota_allotment` / `ota_reserved` | 13, 15, 29 |
| D-26 | OTA integration | **No OTA integrations in V1. No assumed OTA APIs.** A future channel manager owns synchronisation | Confirms the Phase 1 FUTURE position | 15, 29 |
| D-27 | Admin analytics | **Direct Sales Performance and OTA Distribution Performance are separate domains**, never one generic source dimension | **Corrects** [09](09-admin-scope.md) §3.10 and [21](21-admin-navigation.md) §3.16 | 9, 21, 29 |

### 2.2 Phase 3 amendments — D-28 to D-38

Full detail in [50-phase-3-amendments.md](50-phase-3-amendments.md).

| # | Decision | Value | Effect | Documents |
|---|---|---|---|---|
| D-28 | Operational hub | **KAS Admin is the operational hub for all reservations across all 8 properties** | **CHANGES.** Answers OQ-070. OTA reservations must be recorded | 15, 21, 29, 50 |
| D-29 | Three concepts | Distribution channel · lead source · sales owner, structurally separated | Confirms D-21 | 13, 29 |
| D-30 | One reservation entity | OTA enters at `CONFIRMED`; no `DirectReservation`/`OTAReservation` split | Confirms | 13, 14, 50 |
| D-31 | Direct lead = booking request | No parallel Lead entity for the request itself | Confirms | 29, 50 |
| D-32 | State machine split | **`NEW` is not a reservation state.** `salesStatus` + `stayStatus`, plus a lightweight `sales_inquiry` | **CHANGES.** Supersedes [29](29-direct-sales-crm-architecture.md) §5.2, restructures [14](14-booking-state-machine.md) | 13, 14, 29, 50 |
| D-33 | Central rate management | Base pricing in V1; channel scope, rate plans and restrictions as nullable hooks | **CHANGES.** Rate management is newly first-class and sits in Commercial, not Direct Sales | 13, 21, 50 |
| D-34 | Hybrid transitional OTA model | Shrinking allotment **plus** recording, retiring on evidence | **CHANGES.** Answers OQ-067. Supersedes "allotment first" | 13, 15, 29, 50 |
| D-35 | Future channel manager | Clean integration boundary only; **no OTA APIs assumed or built in V1** | Confirms | 29, 50 |
| D-36 | OTA guest lifecycle | Eligible for completed-stay lifecycle and verified reviews; **marketing separated from transactional** | **CHANGES.** Answers OQ-069 | 29, 50 |
| D-37 | Customer 360 | One customer across channels; confidence-tiered matching, never auto-merge on weak signal | **NEW** | 13, 21, 50 |
| D-38 | Admin IA | Three areas: **Direct Sales · Operations · Distribution** | **CHANGES.** [21](21-admin-navigation.md) had two | 19, 21, 22, 50 |

### 2.3 Phase 3.5 — final transitional decisions

| # | Decision | Value | Documents |
|---|---|---|---|
| D-39 | **OTA safety buffer is configurable** | Admin-configurable by **property + room type + date range/season**. **No universal percentage or room count hard-coded. Initial values are a business configuration required before production launch** | 13, 15, 50 |
| D-40 | **OTA recording is operational, not Sales** | Property Admin · Reservation Staff · Front Desk, via permission `reservation.ota.record`. **Never a sales owner.** Channel recorded explicitly. **Record as soon as operationally possible — no invented SLA** | 06, 15, 21, 50 |
| D-41 | **Document 14 rewritten** against the split lifecycle | Sales Inquiry (`NEW → QUALIFIED → LOST`) · `salesStatus` · `stayStatus`. **All arrivals, occupancy, check-in and check-out logic uses `stayStatus`** | 14 |
| D-42 | Invented SLA thresholds removed | Recording lag, observation periods and reconciliation tolerances are **measurements with business-supplied thresholds**, not architecture-invented numbers | 15, 50 |

### 2.4 Phase 3 — final decision lock

| # | Decision | Value | Documents |
|---|---|---|---|
| D-43 | **`sales_inquiry` is V1** | KAS has an active direct/social sales workflow. `NEW → QUALIFIED → creates Reservation`; `NEW`/`QUALIFIED → LOST`. **Holds no inventory.** Not a parallel booking entity — it continues into the reservation workflow. **OQ-079 closed** | 13, 14, 19, 21, 29, 50 |
| D-44 | **`salesStatus` terminates at `WON`** | **Not `CONFIRMED`.** Terminal outcomes: `WON` · `DECLINED` · `CANCELLED` · `EXPIRED`. `CONFIRMED` belongs to `stayStatus` alone. Direct confirmed = `WON` + `CONFIRMED`; OTA confirmed = `NULL` + `CONFIRMED`. **Removes the semantic collision. OQ-082 resolved** | 13, 14, 21, 29, 50 |
| D-45 | **Alternative offer holds** | Temporary inventory holds on offered alternatives, with `createdAt`, `expiresAt`, `createdBy`, reservation/inquiry reference, property, room type, quantity, status. **Auto-released at expiry. Never permanently consumes inventory. OQ-083 resolved** | 13, 14, 15, 21, 50 |
| D-46 | **`DIRECT_ALTERNATIVE_HOLD_DURATION`** | A **business configuration required before production launch**. No default invented; with none configured, placing an alternative hold fails with an error naming the missing setting | 13, 14, 50 |
| D-47 | **No generic status field** | Operational queries use `stayStatus`; sales analytics use `salesStatus`. A generic `status` field is prohibited on the reservation entity | 14, 21 |

### 2.1 Documents needing amendment as a result

**PROPOSED** — Phase 1 documents that now contain a superseded statement. Recommended handling: leave
the Phase 1 text intact as a historical record and add a status banner pointing here, rather than
rewriting history.

| Document | What is now superseded |
|---|---|
| [11-technology-evaluation.md](11-technology-evaluation.md) | The NestJS recommendation. Spring Boot is decided (D-01). The evaluation itself remains valid and correctly documented Spring Boot as the contingency |
| [12-recommended-stack.md](12-recommended-stack.md) | §1 stack table and §2.2 rationale. §1.1 already anticipated this exact outcome. **Module boundaries, ports and adapters, oversell enforcement, API design and deployment are unchanged** |
| [10-system-requirements.md](10-system-requirements.md) | NFR-14 — multi-currency moves from *Could/FUTURE* to V1 (D-06) |
| [14-booking-state-machine.md](14-booking-state-machine.md) | Transition order and state list — **pending OQ-053, OQ-054, OQ-066**. Do not amend until answered |
| [08-information-architecture.md](08-information-architecture.md) | Superseded by [18](18-information-architecture-v2.md), which now governs |
| [16-open-questions.md](16-open-questions.md) | OQ-011, OQ-013, OQ-020, OQ-038 move to `ANSWERED`; new entries OQ-051…OQ-066 added here |

**PROPOSED** — Spring Boot specifics to carry into Phase 2 when D-01 is applied to docs 11/12: Java 21+
or Kotlin, `spring-modulith` for enforceable module boundaries, Spring Security, JPA/Hibernate with
explicit pessimistic locking on inventory rows, Flyway for forward-only migrations, and Bean Validation
at every boundary. The oversell guarantee is unchanged — it lives in PostgreSQL constraints and row
locks, not in the framework ([12](12-recommended-stack.md) §5).

---

## 3. Phase 1 questions now answered

| ID | Question | Answer | New status |
|---|---|---|---|
| OQ-011 | Inventory source of truth | **Admin** | `ANSWERED` — but see OQ-033, still open |
| OQ-013 | Response SLA | **Within the day** | `ANSWERED` in principle — precision needed, see OQ-051 |
| OQ-020 | Languages and currency | **VI + EN; VND base + USD display** | `ANSWERED` — mechanics open, see OQ-052, OQ-065 |
| OQ-038 | Team skills / backend choice | **Spring Boot** | `ANSWERED` |
| OQ-005 | Pricing basis | **Per room, per night** | **Partially answered.** Actual rates still `BLOCKING` |

---

## 4. Conflicts and gaps found during IA design

Five items surfaced. **None has been resolved by assumption.**

### 4.1 The cancellation policy is undefined, but the IA requires it before submission

**Severity: HIGH — blocks the booking flow going live.**

Phase 1 ([05](05-booking-sales-model.md) §3.1, [07](07-customer-journey.md) §5.3) requires
cancellation terms to be visible **before** the *Request This Stay* action, as a trust and legal
requirement. Phase 1.5 confirms the policy is **not yet defined** (D-15).

The IA reserves a Policies block immediately above the submit action
([26](26-booking-ux-information-architecture.md) §7.4) and treats it as a **publish blocker**. No
placeholder terms have been written.

**Options:** (a) define the policy · (b) launch with an explicit "cancellation terms will be confirmed
when our team contacts you" statement — honest but weaker · (c) delay the booking flow.
**Recommendation: (a).** → **OQ-055**

### 4.2 The sales workflow order differs from the Phase 1 state machine

**Severity: MEDIUM — blocks amending the state machine.**

Phase 1.5 specifies `REQUESTED → ASSIGNED → AVAILABILITY CHECK → CONTACT CUSTOMER → …`.
[14-booking-state-machine.md](14-booking-state-machine.md) has `SALES_CONTACTED` **before**
`AVAILABILITY_CONFIRMED` (T2), and treats assignment as an attribute, not a state.

The Phase 1.5 order is arguably better — an agent who has checked availability has an answer when
they call. But it is a change, and three sub-questions follow: is `ASSIGNED` a state or an attribute?
Is `AVAILABILITY_CHECK` a state? May an agent contact a guest *before* checking availability (e.g. to
clarify dates)?

The IA supports both readings. The state machine must be told which is canonical. → **OQ-053**

### 4.3 "DECLINE" is a new outcome

**Severity: MEDIUM.**

Phase 1.5 introduces DECLINE as a sales outcome. Phase 1 models this as `CANCELLED` with a reason
code. Distinct terminal state, or reason code? Affects the guest label set, the messaging, and
reporting (a declined request and a guest-cancelled request are commercially very different).
→ **OQ-054**

### 4.4 "Within the day" needs an operational definition

**Severity: MEDIUM — affects guest-facing copy at the most trust-sensitive moment.**

Unanswered: a request at 23:40 — same day or next? Weekends? Vietnamese public holidays? Calendar day
or business day? What is the escalation threshold?

This drives the SLA timer, the queue's breach highlighting, the escalation rule, and the wording shown
to the guest. The IA uses a **single settings-driven string** everywhere so one change updates all
surfaces ([21](21-admin-navigation.md) §4). → **OQ-051**

### 4.5 USD display was FUTURE and is now V1

**Severity: LOW — expansion, not conflict.**

Unanswered mechanics: FX rate source, refresh frequency, rounding, disclaimer wording, and behaviour
when the rate is stale. Recommendations in
[25-i18n-currency-architecture.md](25-i18n-currency-architecture.md) §6.4. → **OQ-052**

### 4.6 "Inventory source of truth: Admin" and the OTA channels

**Severity: HIGH if OTA volume is material — volume still unknown.**

**Reframed after the Phase 1.5 business model correction.** An earlier draft of this section stated
that the platform's correctness depends on **every** OTA booking being entered manually. That framing
conflated two separate things — OTA reservations and direct phone/walk-in leads — and presented manual
entry as the only option. Neither is right.

Corrected position:

- Phone and walk-in customers are **direct leads** with lead sources `PHONE` and `WALK_IN`. They enter
  through the direct sales workflow and consume inventory normally. There is no risk here.
- OTA reservations from Booking.com, Agoda, Ctrip and Traveloka are a **different class entirely**.
  They are not sales leads and must never enter the sales queue.
- The OTA oversell risk has **two** possible V1 answers, not one: an **allotment** that holds back a
  block of rooms from direct availability (structurally cannot oversell, no manual entry required), or
  **manual register entry** of each OTA reservation (maximises sellable inventory, but correctness
  depends entirely on a manual process).

**Recommendation: allotment first, hybrid later.** Allotment fails safe; manual entry fails loud, in a
hotel lobby. Full analysis in [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md)
§7.2. → **OQ-067** (strategy and split), **OQ-033** (channel volume, needed to size it),
**OQ-070** (whether OTA reservations must be recorded at all).

### 4.7 A single generic `source` field was specified and is prohibited

**Severity: HIGH — corrected.**

[13-database-domain-overview.md](13-database-domain-overview.md) §3.4 carried
`booking.source enum — WEB | PHONE | WALK_IN | EMAIL`, and documents 09, 15 and 21 built queue filters
and analytics dimensions on it. That single field conflated three independent facts: **where the
reservation was sold**, **how a direct customer reached KAS**, and **who owns the lead**.

Corrected to three separate fields — `distributionChannel`, `leadSource`, `salesOwner` — with a
database CHECK constraint making it structurally impossible for an OTA reservation to carry a lead
source or a sales owner. All affected documents have been amended; the full list is in
[29](29-direct-sales-crm-architecture.md) §12. → **No open question; this is resolved.**

---

## 5. New open questions — OQ-051 to OQ-066

Format matches [16-open-questions.md](16-open-questions.md).

### OQ-051 · Sales / SLA — `BLOCKING`
**Issue:** Precise definition of "within the day".
**Current information:** "Within the day" is confirmed as the public promise.
**Impact:** SLA timer, queue breach highlighting, escalation rules, and the guest-facing promise text on screen and in email.
**Recommendation:** Define as: requests before 20:00 ICT answered the same calendar day; after 20:00, by 12:00 the next day; weekends and public holidays included, or explicitly excluded in the published wording. Commit publicly only to what the team can deliver.

### OQ-052 · Currency — `OPEN`
**Issue:** USD conversion mechanics — rate source, refresh frequency, rounding, disclaimer, stale-rate behaviour.
**Current information:** VND base, USD display confirmed. No mechanics defined.
**Impact:** Every displayed price; guest trust if a figure moves.
**Recommendation:** Single reputable published reference rate, fetched server-side, refreshed daily; round to the whole dollar with `≈`; persistent disclaimer; **show VND only if the rate is stale or unavailable** — never a hard-coded fallback.

### OQ-053 · Booking workflow — `BLOCKING`
**Issue:** Is `ASSIGNED` a state or an attribute? Is `AVAILABILITY_CHECK` a state? Must availability be checked before customer contact?
**Current information:** Phase 1.5 workflow vs. [14](14-booking-state-machine.md) T2 — see §4.2.
**Impact:** State machine, guest status labels, admin workflow, analytics.
**Recommendation:** Adopt the Phase 1.5 order as canonical; make `ASSIGNED` an attribute (it does not change what the guest can do) and `AVAILABILITY_CHECK` a real state (it does change what the guest is told). Permit contact before availability check as an allowed but non-default path.

### OQ-054 · Booking workflow — `OPEN`
**Issue:** Is `DECLINED` a terminal state or a `CANCELLED` reason code?
**Impact:** Guest labels, messaging tone, reporting.
**Recommendation:** A distinct terminal state. "We cancelled your request" and "we couldn't accommodate this request" are different messages, and conflating them costs both clarity and reporting accuracy.

### OQ-055 · Policy — `BLOCKING`
**Issue:** What is displayed in the pre-submit policies block before a cancellation policy exists?
**Impact:** **The booking flow cannot publish with this block empty.**
**Recommendation:** Define the policy (OQ-045). Failing that, an explicit interim statement — but this should not survive launch.

### OQ-056 · Account — `OPEN`
**Issue:** Is "Saved Hotels" justified with an eight-property portfolio?
**Current information:** Listed as "if justified" in the Phase 1.5 brief.
**Impact:** Account IA, a small amount of build.
**Recommendation:** **Defer.** With eight properties a guest can hold the whole portfolio in their head; saving is a marketplace affordance. Revisit at 15+ properties. Instead, offer "Recently viewed" on the account home, which costs less and helps more.

### OQ-057 · Admin — `OPEN`
**Issue:** Which language does the admin console operate in?
**Impact:** Translation and QA scope for the console.
**Recommendation:** One language in V1 — Vietnamese if the operating team is Vietnamese-speaking, English if mixed. Guest-facing content and email templates remain bilingual regardless.

### OQ-058 · Discovery — `OPEN`
**Issue:** **OQ-009 (collections vs. tiers) is still unanswered** and now blocks a concrete IA element.
**Impact:** The character filter, the Hotels index grouping, and the comparison table's grouping row.
**Recommendation:** Adopt non-hierarchical collections (The Landmark / The Houses / The Retreats). If rejected, fall back to `characterTags` with no grouping — the IA works either way, but the decision cannot stay open through Phase 2 design.

### OQ-059 · Discovery — `OPEN`
**Issue:** Guest rating as a sort option has a cold-start problem at launch.
**Impact:** Sorting by rating with no reviews produces a meaningless order.
**Recommendation:** Hide the rating sort until a minimum review threshold is met per property (**PROPOSED**: 5 published reviews). Never show a rating badge on a property with fewer.

### OQ-060 · Location — `OPEN`
**Issue:** Which districts do the 8 properties occupy?
**Impact:** Whether district landing pages are worth building, whether the district filter meaningfully divides the portfolio, and a significant local-SEO opportunity.
**Recommendation:** Supply the district for each property. If all eight sit in one or two districts, drop the district filter and build landing pages only where volume justifies them.

### OQ-061 · Content — `OPEN`
**Issue:** All Vietnamese labels and status strings in documents 20 and 27 are **proposed translations**, not native copy.
**Impact:** Tone and credibility with Vietnamese guests — the primary market.
**Recommendation:** A native Vietnamese hospitality copywriter reviews the full label set before implementation. *"Kỳ nghỉ của bạn"* and *"Gửi yêu cầu đặt phòng"* in particular are brand-defining phrases, not translations.

### OQ-062 · SEO / i18n — `DEFERRED`
**Issue:** Should URL path segments be translated (`/vi/khach-san/…`)?
**Recommendation:** No, for V1 — one slug, English path segments ([22](22-url-architecture.md) §4). Revisit only if Vietnamese organic performance materially underperforms after launch, as a measured change.

### OQ-063 · SEO — `BLOCKING` for launch
**Issue:** Does a KAS website exist today, and what is its URL inventory?
**Impact:** If one exists and its URLs are not mapped to 301s before cutover, all accumulated organic equity is lost at launch. This is irreversible.
**Recommendation:** Capture the full URL inventory and current search performance **now**, before any build begins.

### OQ-064 · SEO — `OPEN`
**Issue:** Which locale should `x-default` point to?
**Recommendation:** English — `x-default` serves users whose language matches neither, who are typically international.

### OQ-065 · i18n — `OPEN`
**Issue:** Which locale is the site default when no signal is present?
**Recommendation:** Vietnamese as the site default, English as `x-default`. A Vietnamese visitor gets Vietnamese via negotiation regardless; the default mainly affects signal-less visitors, who skew international and are handled by `x-default`. This is a business call, not a technical one.

### OQ-066 · Booking workflow — `OPEN`
**Issue:** Is `ALTERNATIVE_OFFERED` a distinct state with its own expiry and reminder?
**Impact:** Status vocabulary, hold behaviour on the alternatives, notification scheduling.
**Recommendation:** Yes. A guest holding an unanswered offer is in a genuinely different state from one awaiting contact, and the offered alternatives need their own hold and expiry.

---

## 6. Updated blocking register

**Carried forward from Phase 1 and still blocking:**

| ID | Question |
|---|---|
| OQ-005 | Actual rates per room type per property *(basis now answered)* |
| OQ-010 | Actual room type names and configurations |
| OQ-030 | Professional photography for all 8 properties |
| OQ-039 | Data residency / hosting region |
| OQ-045 | Cancellation and no-show policy |
| OQ-027 | Vietnamese data protection review *(launch-blocking)* |
| OQ-004 | Brand assets *(blocks design)* |

**New in Phase 1.5:**

| ID | Question |
|---|---|
| OQ-051 | Precise definition of "within the day" |
| OQ-053 | State machine: `ASSIGNED`, `AVAILABILITY_CHECK`, workflow order |
| OQ-055 | Pre-submit policies block before the cancellation policy exists |
| OQ-063 | Existing site URL inventory before cutover |
| OQ-033 | *(updated)* Room-nights and revenue per distribution channel — needed to size the OTA allotment |

*(OQ-074 and OQ-075 were resolved in Phase 3.5 — see D-39 and D-40. Their residual numeric values are
now tracked as **business configuration required before production launch**, in
[50](50-phase-3-amendments.md) §12.5, not as open questions.)*

**Total: 83 raised · 14 answered · 69 open · 11 blocking.**
(50 Phase 1 · 16 IA phase · 7 business model correction · 6 Phase 3 · 4 Phase 3.5.)

*Phase 3 final decision lock closed OQ-079, OQ-082 and OQ-083. Residual values —
`DIRECT_ALTERNATIVE_HOLD_DURATION`, OTA safety buffer values, OTA recording lag threshold — are tracked
as **business configuration required before production launch** in
[50](50-phase-3-amendments.md) §12.5, not as open questions.*

### 6.1 Business model correction — OQ-067 to OQ-073

Raised in [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md) §14 and summarised
here so the register stays in one place.

| ID | Category | Question | Status |
|---|---|---|---|
| **OQ-067** | Inventory | OTA inventory strategy for V1 | ✅ **ANSWERED (D-34)** — hybrid transitional |
| **OQ-068** | Attribution | Lead source when a customer touches several channels before contacting KAS | `OPEN` |
| **OQ-069** | Guest lifecycle | OTA guest lifecycle emails and verified review eligibility | ✅ **ANSWERED (D-36)** — eligible; marketing separated |
| **OQ-070** | Scope | Operational hub or direct sales platform? | ✅ **ANSWERED (D-28)** — operational hub |
| **OQ-071** | Sales | Who monitors the Facebook, Zalo, TikTok and Instagram inboxes, and during what hours? Extends OQ-048 | `OPEN` |
| **OQ-072** | Reporting | Is OTA commission or net-rate data available for distribution performance reporting? | `OPEN` |
| **OQ-073** | Workflow | Is an unqualified `NEW` lead state wanted? | ✅ **ANSWERED (D-32)** — not a reservation state; a separate lightweight inquiry |

### 5.1 Phase 3 amendment questions — OQ-074 to OQ-079

| ID | Category | Question | Status |
|---|---|---|---|
| **OQ-074** | Inventory | Stage-1 allotment sizing per property, room type and season | `BLOCKING` |
| **OQ-075** | Operations | Who records OTA reservations, how often, and what recording lag is acceptable? The operational hub decision depends on this process existing | `BLOCKING` |
| **OQ-076** | Commercial / legal | Do KAS's OTA contracts permit differential channel pricing, and under what parity terms? | `OPEN` |
| **OQ-077** | Customer data | How are masked OTA contact details handled for identity matching and post-stay contact? Is real-address capture at check-in feasible? | `OPEN` |
| **OQ-078** | Legal | Does a post-stay review invitation to an OTA guest fall within OTA contract terms? | `OPEN` |
| **OQ-079** | Workflow | Is the lightweight `sales_inquiry` entity in V1 scope? | ✅ **RESOLVED (D-43)** — **yes, V1.** Closed |
| **OQ-082** | Engineering | `CONFIRMED` on both status fields, or rename the sales terminal? | ✅ **RESOLVED (D-44)** — `salesStatus` terminates at **`WON`** |
| **OQ-083** | Inventory | Are alternative offers held in inventory, and for how long? | ✅ **RESOLVED (D-45/D-46)** — yes, with mandatory expiry; duration is business configuration |

---

## 7. V1 vs. Future boundary

**PROPOSED** — Consolidated from all Phase 1.5 documents.

### In V1

Brand and discovery for 8 properties · property detail with flagship extension · room types with
availability and per-room-per-night pricing · search with a justified filter set · map and locations ·
comparison of up to 3 · Your Stay with multi-type and multi-quantity · booking request flow · request
status tracking (account + signed link) · guest account with My Stays, reviews, profile, preferences,
security · verified reviews with moderation and reply · notifications and transactional email ·
Vietnamese + English · VND + USD display · full admin console · sales queue · inventory and pricing
management · offers and vouchers (basic) · Users, Roles, Audit, Settings · property scoping in the IA.

**Added by the business model correction:** three-concept separation (distribution channel · lead
source · sales owner) with the CHECK constraint · **Direct Sales CRM** — manual lead creation from
social, phone, walk-in and referral, lead source capture, sales ownership, contact log, follow-up
tracking, alternatives, payment recording, conversion, lead history · **OTA reservation register**
(manual, read-mostly) · **channel-aware central inventory** with `ota_allotment` / `ota_reserved` ·
**Direct Sales Performance analytics** (conversion by lead source, SLA, owner performance) and
**OTA Distribution Performance analytics** (channel mix, allotment utilisation) as separate domains.

### Future

Payment gateway · rate plans · loyalty and member rates · **channel manager / OTA sync (no OTA
integrations and no assumed OTA APIs in V1)** · automated OTA reservation import · rate and availability
push to OTAs · commission and net-revenue reporting · social inbox integration (Facebook/Zalo/Instagram
APIs) · automated OTA-guest → direct conversion campaigns · per-channel dynamic allotment ·
PMS integration ·
physical room assignment · HOTEL_MANAGER, RECEPTIONIST, ACCOUNTANT roles · Zalo and SMS notifications ·
social and Zalo login · F&B and experience booking · group enquiry workflow · guest messaging inbox ·
campaign email · additional languages · additional display currencies · native apps · saved hotels
(OQ-056) · review machine translation · A/B testing.

---

## 8. Phase 3 recommendation

**PROPOSED** — Phase 3 should be **Design & Data Definition**, not build.

| # | Workstream | Detail | Depends on |
|---|---|---|---|
| 1 | **Answer the blocking questions** | OQ-051, OQ-053, OQ-055, OQ-063, and the carried-forward set | Product owner |
| 2 | **Photography audit and commission** | Longest lead time of any launch dependency. Must start first | OQ-030, OQ-004 |
| 3 | **Content collection** | Property identity, room types, amenities, landmarks, policies — in both locales | OQ-010, OQ-031, OQ-060 |
| 4 | **Design system** | Classic Luxury × Modern Hospitality; Vietnamese-capable typography; accessible colour | OQ-004 |
| 5 | **Key screen design** | Home, Hotels, Property, Rooms, Your Stay, request flow, request status, admin queue, inventory calendar | 4 + this IA |
| 6 | **Amend the state machine** | Update [14](14-booking-state-machine.md) once OQ-053, OQ-054, OQ-066 are answered | 1 |
| 7 | **Freeze the domain model and v1 API contract** | Public and admin surfaces separated; DTO denylist test specified | 1, 6 |
| 8 | **Vietnamese copy review** | Native copywriter on the full label and status set | OQ-061 |
| 9 | **Guest and sales interviews** | 5–8 guests, 2–3 sales staff. The real sales workflow exists only in people's heads | — |
| 10 | **Prototype and test the request flow** | Especially the submit moment and the wait stage | 5 |
| 11 | **Legal review** | Data protection, retention, VAT invoicing, entity details, cancellation terms | OQ-027, OQ-022, OQ-045 |
| 12 | **Existing-site URL capture** | Before any cutover planning | OQ-063 |

**PROPOSED — the two highest risks going into Phase 3**, neither of them technical:

1. **Photography.** A photography-led premium IA cannot be delivered without photography. Nothing in
   this documentation set compensates for its absence, and it has the longest lead time.
2. **Sales response capability.** The architecture can guarantee zero oversells. It cannot guarantee
   someone replies within the day. The "within the day" promise (D-14) is a commitment the business
   must be resourced to keep — and every trust mechanism in this IA is built on it.

---

## 9. Phase 1.5 rules honoured

- No production code written
- No dependencies installed
- No Next.js initialisation
- No Spring Boot initialisation
- No database tables created
- No UI components created
- All conflicts documented as NEEDS CONFIRMATION, none silently resolved

**Phase 3 does not begin until the product owner approves this IA and answers the blocking items in §6.**
