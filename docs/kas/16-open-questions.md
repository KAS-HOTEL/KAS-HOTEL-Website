# 16 — Open Questions

**Status of this document:** Live register. Updated as answers arrive.
**Last updated:** 2026-08-27
**Total open (Part I):** 48
**Scope:** Part I is the Phase 1 register, OQ-001 → OQ-050. **Part II** (added 2026-08-27) consolidates **OQ-084 → OQ-174** from the phase documents that raised them. OQ-051 → OQ-083 continue to live in [28-phase-2-decisions.md](28-phase-2-decisions.md) §5 and [50-phase-3-amendments.md](50-phase-3-amendments.md) §12, as recorded below.

---

## How to use this register

Each entry carries: **ID · Category · Issue · Current information · Impact · Recommendation · Status**.

| Status | Meaning |
|---|---|
| `OPEN` | Awaiting the product owner |
| `BLOCKING` | Phase 2 cannot start, or a major decision cannot be made, without an answer |
| `ANSWERED` | Resolved — record the answer and date, and update the affected documents |
| `DEFERRED` | Consciously postponed to a later phase |

**Nothing in this register should be resolved by assumption.** If work must proceed before an answer
arrives, the assumption is stated explicitly in the affected document and the entry stays `OPEN`.

---

> **Phase 3 final decision lock.** OQ-079 (`sales_inquiry` is V1), OQ-082 (`salesStatus` terminates at
> **`WON`**, not `CONFIRMED`) and OQ-083 (alternative offer holds with mandatory expiry) are
> **RESOLVED**. Registers for OQ-051 onward live in
> [28-phase-2-decisions.md](28-phase-2-decisions.md) §5 and
> [50-phase-3-amendments.md](50-phase-3-amendments.md) §12.

> ✅ **OQ-051 — RULED 2026-08-27, Step 16A.2** ([122](122-phase-7-5f-step-16a-2-oq051-oq083-reconciliation.md)). **OQ-051 is `CLOSED`.** It was the owner
> decision for **config A6** and nothing else; doc [117](117-phase-7-5f-step-16a-contract-amendment.md)
> §2 closes it by name — `SALES_FIRST_CONTACT_SLA` = **`PT24H`** from `requested_at` — while
> deferring cutoff hours, weekend and holiday calendars and escalation thresholds to **OQ-161**.
> **OQ-083 is `RESOLVED`**, and has been since **Phase 3**: doc
> [50](50-phase-3-amendments.md) §13.3 Decision 3 answered it (alternative offers *may* be held, with
> mandatory expiry), and doc [28](28-phase-2-decisions.md):347 records that its residual value
> `DIRECT_ALTERNATIVE_HOLD_DURATION` (**B1**) is *"business configuration required before production
> launch … **not** an open question."* **OQ-173's closure did not decide OQ-083** — S1's guest-facing
> `alternatives` and S7's sales-mediated `ALTERNATIVE_OFFER` hold are different actors on different
> surfaces ([122](122-phase-7-5f-step-16a-2-oq051-oq083-reconciliation.md) §8).
>
> ⚠️ **Historical records left as found — not rewritten.** **OQ-051**
> (*"precise definition of 'within the day'"*) is still recorded as `BLOCKING` in
> [28-phase-2-decisions.md](28-phase-2-decisions.md) §5 and is still listed as an unanswered blocking
> item in [50-phase-3-amendments.md](50-phase-3-amendments.md):778. It was **closed by owner decision 1
> on 2026-08-27**, as ruled above. Doc [51](51-phase-4-configuration.md):41 likewise still shows
> config **A6** as `OPEN`. Per the append-only convention these historical documents are **not**
> edited; this register carries the current status and [122](122-phase-7-5f-step-16a-2-oq051-oq083-reconciliation.md) carries the reasoning.

## Blocking items — answer these first

| ID | Category | One-line question |
|---|---|---|
| **OQ-005** | Pricing | What is the pricing basis per room type per property? |
| **OQ-010** | Rooms | What are the actual room type names and configurations at each property? |
| **OQ-011** | Inventory | Where does inventory truth live today, and who owns it? |
| **OQ-013** | Sales | What response time will KAS commit to publicly? |
| **OQ-020** | Content | Which languages, which default, and how is currency displayed? |
| **OQ-030** | Content | Does professional photography exist for all 8 properties? |
| **OQ-038** | Technology | What are the delivery team's existing skills? |
| **OQ-039** | Infrastructure | Are there data-residency requirements for Vietnamese personal data? |
| **OQ-045** | Policy | What are the cancellation and no-show policies? |

---

## Brand & identity

### OQ-001 · Brand
**Issue:** What does "KAS" stand for, and is there an origin story?
**Current information:** Brand founded 2019; first property KAS Passion Boutique Hotel. No meaning supplied.
**Impact:** The About and Story pages are core brand surfaces and cannot be written credibly without it.
**Recommendation:** Provide the origin. If there is no story, that is also a valid answer — we write around it rather than inventing one.
**Status:** `OPEN`

### OQ-002 · Portfolio
**Issue:** What is "KAS No. 9"? Name, location, opening date, and whether it is public knowledge.
**Current information:** Appears in the approved homepage structure as a Coming Soon section.
**Impact:** Homepage section 12; property lifecycle model; whether interest registration is wanted.
**Recommendation:** Confirm details, or confirm that only a teaser is intended.
**Status:** `OPEN`

### OQ-003 · Content governance
**Issue:** Confirm that the positive-framing rule governs *marketing framing* and does not extend to concealing material facts (accessibility limitations, no lift, construction nearby, restrictive terms).
**Current information:** Prohibited terms: small, limited, lacking, inferior, weaker.
**Impact:** Legal and trust exposure if material facts are suppressed; guest complaints on arrival.
**Recommendation:** Adopt the position in [02](02-brand-foundation.md) §4.2 — positive framing for storytelling, plain factual disclosure in Amenities, Policies, and Good to Know.
**Status:** `OPEN`

### OQ-004 · Brand assets
**Issue:** Do logo, colours, typefaces, and any brand guidelines exist in usable form?
**Current information:** None supplied.
**Impact:** Blocks design system work in Phase 2.
**Recommendation:** Supply vector logo, colour values, font licences. If none exist, add brand identity design to Phase 2 scope.
**Status:** `BLOCKING` for design

### OQ-050 · Brand
**Issue:** Approve, amend, or reject the slogan *"KAS — Where Hospitality Feels Personal."*
**Current information:** Explicitly a proposal, not a finalised decision.
**Impact:** Appears in hero, metadata, emails, and footer once approved.
**Recommendation:** Decide before design begins; until then it is placeholder text and marked as such.
**Status:** `OPEN`

### OQ-009 · Portfolio structure
**Issue:** Should the 8 properties be grouped, and if so how? The names imply Luxury > Premium > Boutique, which conflicts with the positive-framing rule.
**Current information:** Milestone is flagship. No other structure confirmed.
**Impact:** Navigation, filtering, comparison, and how properties are positioned relative to each other.
**Recommendation:** Adopt non-hierarchical **collections** (The Landmark / The Houses / The Retreats) rather than tiers. See [03](03-property-map.md) §2.
**Status:** `OPEN`

---

## Rooms, inventory & availability

### OQ-010 · Room types
**Issue:** Actual room type names, counts, areas, bed configurations, occupancy limits, and amenities at each of the 8 properties.
**Current information:** "Deluxe Room" and "Suite Balcony" appear as examples only.
**Impact:** Blocks content, pricing, inventory setup, and search. The single largest data gap after photography.
**Recommendation:** Collect via a structured template per property. Adopt the naming convention in [04](04-room-architecture.md) §3.4 for consistency.
**Status:** `BLOCKING`

### OQ-011 · Inventory source of truth
**Issue:** Where is room availability recorded today — a PMS, spreadsheets, a channel manager, the front desk? Who updates it and how often?
**Current information:** Admin will manage inventory in the platform.
**Impact:** If the platform is not authoritative, it will oversell. Determines whether reconciliation or integration is needed.
**Recommendation:** Establish the platform as authoritative for online availability, with all non-web bookings entered manually and a daily reconciliation report. See [15](15-inventory-rules.md) §7.
**Status:** `BLOCKING`

### OQ-012 · Overbooking
**Issue:** Does KAS deliberately overbook, and should the platform support an overbooking allowance?
**Current information:** The confirmed requirement is to prevent requesting more than available.
**Impact:** Inventory model and the availability guarantee.
**Recommendation:** **No overbooking in v1.** Incompatible with a request model where sales confirms availability by hand.
**Status:** `OPEN`

### OQ-033 · Distribution — `BLOCKING` *(updated Phase 1.5)*
**Issue:** What proportion of room-nights comes through each distribution channel, and are rates/inventory managed by a channel manager today?
**Current information:** The channels are now confirmed — **Booking.com, Agoda, Ctrip/Trip.com, Traveloka**. Volume and mix per channel are still not supplied. **No OTA integration is being built in V1** (**CONFIRMED**).
**Impact:** Now blocks a concrete decision. The V1 OTA inventory strategy (OQ-067) — allotment vs manual register entry — cannot be sized without knowing how many room-nights each channel actually sells. Too small an allotment starves the OTAs; too large starves direct.
**Recommendation:** Supply 12 months of room-nights and revenue by channel, per property. Then set allotments per property and season. See [29-direct-sales-crm-architecture.md](29-direct-sales-crm-architecture.md) §7.
**Phase 3 update:** The V1 strategy is now decided — **hybrid transitional** (D-34). This data is still required to size the stage-1 allotment (**OQ-074**).
**Status:** `BLOCKING`
**Status:** `OPEN`

### OQ-034 · Rate plans — ✅ `ANSWERED` *(Phase 3, D-33)*
**Issue:** Does KAS sell the same room at different terms (breakfast included, non-refundable, advance purchase)?
**Answer:** **Central Rate Management is confirmed.** The domain must be *capable* of rate plans, direct vs OTA rates, seasonal, weekend, promotional rates and restrictions — but the **V1 engine is base pricing only**. `rate_rule.channel_scope`, `rate_rule.rate_plan_id` and `rate_rule.restrictions` are nullable hooks, always `NULL` in V1. Adding channel-specific pricing later is data, not a re-architecture.
**Caveat:** whether KAS *may* publish different rates per channel is governed by OTA rate-parity contracts, not by this architecture — **OQ-076**.
**Status:** `ANSWERED` — see [50-phase-3-amendments.md](50-phase-3-amendments.md) §6

### OQ-035 · Stay length
**Issue:** Maximum and minimum stay length; any long-stay handling.
**Current information:** None.
**Impact:** Validation, inventory horizon, pricing.
**Recommendation:** Default max 30 nights, min 1 night, with per-rate-rule minimums.
**Status:** `OPEN`

### OQ-047 · Same-day booking
**Issue:** Are same-day requests accepted, and is there a daily cutoff?
**Current information:** None.
**Impact:** Search defaults and validation; sales workload late in the day.
**Recommendation:** Accept same-day requests up to a configurable per-property cutoff (default 18:00 ICT).
**Status:** `OPEN`

---

## Pricing

### OQ-005 · Pricing basis
**Issue:** What is the base nightly rate for each room type at each property? Is it per room or per person? Does it include breakfast, VAT, and service charge?
**Current information:** None supplied.
**Impact:** Blocks all price display. Without it the site cannot show a price at all.
**Recommendation:** Supply a rate sheet per property. Until then, display "from" estimates clearly labelled as estimated.
**Status:** `BLOCKING`

### OQ-006 · Weekend and seasonal pricing
**Issue:** Do rates vary by day of week or season? Which dates are peak (Tết, national holidays, high season)?
**Current information:** None.
**Impact:** Pricing engine rules, admin tooling, accuracy of displayed estimates.
**Recommendation:** Supply the rules and the peak calendar. The rate-rule layer in [13](13-database-domain-overview.md) §4 supports both.
**Status:** `OPEN`

### OQ-007 · Child pricing
**Issue:** What ages count as a child? Do children stay free, at a reduced rate, or at full rate? Does it depend on using an existing bed?
**Current information:** None. Guest selector separates adults and children and captures child ages.
**Impact:** Price calculation, occupancy validation, guest selector design.
**Recommendation:** Define age bands (e.g. 0–5 free in existing bedding, 6–11 reduced, 12+ adult rate) and confirm.
**V1 behaviour — FROZEN 2026-08-20:** the question stays open and V1 does not answer it. `POST /public/availability/quote` **refuses** any request with `children > 0` or a non-empty `childAges[]`, with **422** and an actionable message. No age band, bedding rule, table or configuration was created ([58](58-phase-4-api-contract.md) §11.2.3).
**Status:** `OPEN`

### OQ-008 · Extra beds and extra adults
**Issue:** Are extra beds available, at what price, and in which room types? Is there an extra-adult charge?
**Current information:** None.
**Impact:** Occupancy rules and pricing.
**Recommendation:** Supply per room type.
**V1 behaviour — FROZEN 2026-08-20:** the question stays open and V1 does not answer it. A quote whose party exceeds the capacity of the requested rooms is **refused** with **422**, never clamped, downgraded or split across extra beds ([58](58-phase-4-api-contract.md) §11.2.3).
**Status:** `OPEN`

### OQ-022 · Tax and service charge
**Issue:** What VAT rate applies, is a service charge levied, and are displayed prices inclusive or exclusive? What are the VAT invoice requirements?
**Current information:** None.
**Impact:** Every displayed price; legal compliance; whether company/tax fields are collected at request time.
**Recommendation:** Display **all-inclusive prices** — inclusive display consistently outperforms exclusive display on trust and reduces abandonment. Confirm the rates and invoicing obligations with an accountant.
**V1 behaviour — OUT OF SCOPE 2026-08-18:** tax is not part of KAS V1 ([99](99-phase-7-5e-owner-decisions-applied.md) §12). The question is **retired for V1, not answered** — it returns when tax becomes a business capability of its own. No V1 surface renders a tax line, including the one doc 26 §7.1 sketches.
**Status:** `OPEN` (out of V1 scope)

---

## Booking & sales workflow

### OQ-013 · Response SLA
**Issue:** What response time will KAS commit to publicly, and during which hours?
**Current information:** Sales contacts the customer after a request. No timing supplied.
**Impact:** The single most important trust signal in a request model. Drives on-screen copy, email text, SLA timers, and escalation.
**Recommendation:** 2 hours during 08:00–20:00 ICT; by 10:00 next morning otherwise; 24 hours absolute maximum. **Only commit publicly to what the team can actually deliver** — an unmet promise is worse than a modest one.
**V1 behaviour — FROZEN 2026-08-27:** the public commitment is **a response within 24 hours of `reservation.requested_at`** — a **rolling duration**, not a calendar day — rendered from config **A6 `SALES_FIRST_CONTACT_SLA` = `PT24H`** and from nothing else ([123](123-phase-7-5f-step-16a-3-oq174-contract-amendment.md)). Hours of operation, cutoff, weekends, holidays and escalation are **not** part of it and stay deferred under **OQ-161**. ⚠️ Doc [28](28-phase-2-decisions.md):118 records this question as `ANSWERED` *in principle* with the value *"Within the day"*, which **OQ-174's ruling supersedes for V1**. **Step 16A.3 ruled only on OQ-174**, so this entry's status word is left exactly as it was found; promoting it is a separate owner call.
**Status:** `BLOCKING`

### OQ-048 · Sales team structure
**Issue:** Who handles booking requests — a central team or per-property staff? How many people, what working hours, and what channels do they use?
**Current information:** "Sales/Admin receives request."
**Impact:** Assignment rules, notification routing, property scoping, escalation, and whether the future `HOTEL_MANAGER` role is needed sooner than expected.
**Recommendation:** Supply the team structure before admin console design begins.
**Status:** `OPEN`

### OQ-014 · Multi-property bookings
**Issue:** May a single booking request span more than one KAS property?
**Current information:** The flow implies one hotel per request.
**Impact:** Your Stay model, sales workflow, pricing, and confirmation.
**Recommendation:** **One property per request.** Offer to start a second stay for multi-property trips.
**Status:** `OPEN`

### OQ-015 · Request size limits
**Issue:** Maximum rooms per request before it becomes a group enquiry?
**Current information:** Multi-room and multi-type selection is confirmed; no ceiling stated.
**Impact:** Validation, inventory holds, and whether a separate group workflow is needed.
**Recommendation:** 5 rooms or 10 guests routes to a group enquiry with its own sales workflow.
**Status:** `OPEN`

### OQ-016 · Guest submission — ✅ `ANSWERED` *(Step 16A, owner decision 4)*
**Issue:** May an unauthenticated visitor submit a booking request, or is an account required?
**Current information:** Not specified.
**Impact:** Conversion rate vs. lead quality and account adoption.
**Recommendation:** **Allow guest submission**, offer one-click account creation on the confirmation screen. Requiring registration first will measurably reduce submissions.
**Answer — 2026-08-27:** **Anonymous guest plus contact details.** No account, no login, no registration; `customer_id` stays nullable. Doc [117](117-phase-7-5f-step-16a-contract-amendment.md):139 states *"OQ-016 is **CLOSED**"*. Per-field format rules were **not** specified and remain unaddressed.
**Status:** `ANSWERED` — see [117](117-phase-7-5f-step-16a-contract-amendment.md) §20, owner decision 4

### OQ-018 · Inventory holds and request expiry — ✅ `ANSWERED` *(Step 16A, owner decision 2)*
**Issue:** Should a submitted request hold inventory, for how long, and what happens on expiry?
**Current information:** The system must prevent overbooking.
**Impact:** Whether the same room can be requested by several guests simultaneously; guest experience on both sides.
**Recommendation:** **Soft hold, 24 hours, configurable per property**, with warning before expiry and automatic release. See [15](15-inventory-rules.md) §6.
**Answer — 2026-08-27:** **B2 `DIRECT_REQUEST_HOLD_DURATION` = `PT24H`, system-level only in V1** — the per-property half of the recommendation was **not** granted. Doc [117](117-phase-7-5f-step-16a-contract-amendment.md):283 states *"**OQ-018 CLOSED**"*. The rest of doc 15 §6 — expiry sweep, release triggers, admin visibility — is **not** covered by this answer.
**Status:** `ANSWERED` — see [117](117-phase-7-5f-step-16a-contract-amendment.md) §20, owner decision 2

### OQ-017 · Payment before confirmation
**Issue:** Does a booking require a deposit or full payment before reaching `CONFIRMED`, or can it be confirmed on a pay-at-hotel basis? If a deposit, what percentage and what deadline?
**Current information:** Payment is handled separately by sales; pay-at-hotel is listed among possible methods.
**Impact:** The `PAYMENT_PENDING` → `CONFIRMED` transition, payment deadline timers, and cancellation exposure.
**Recommendation:** Support both paths. Make "payment required to confirm" a per-property configuration.
**Answer — 2026-08-28:** **Pay-at-hotel is permitted in V1.** `DEPOSIT_REQUIRED_TO_CONFIRM = false`,
supplied at global scope through the existing `system_setting` mechanism — not in a migration, which
V20 forbids. S10 satisfies its "payment recorded **or** pay-at-hotel permitted" guard without a payment
record, and **no payment endpoint, transaction, status, provider or ledger was created**. The setting is
read fail-closed: unset is a 422, never a default; `true` refuses the win, because payment recording is
not implemented in V1. The per-property half of the recommendation was **not** granted.
`DEPOSIT_PERCENTAGE` stays unset.
**Status:** `CLOSED` — see [132](132-phase-7-5f-step-16a-9-s10-s2-s4-implementation.md) §4.1, owner decision 2

### OQ-045 · Cancellation and no-show
**Issue:** What are the cancellation terms (free window, charges, non-refundable cases), and what is the no-show policy and charge?
**Current information:** Product owner supplied cancellation windows: regular customers may cancel at least 24 hours before check-in; customers with a valid membership status at booking time may cancel until 12:00 on check-in day. Cancellation fees must be confirmed with the hotel. No-show terms remain unspecified; the cancellation wording is pending Commercial confirmation and Legal review.
**Impact:** Approved cancellation terms must be displayed before submission — this is a legal and trust requirement, not a nice-to-have. The still-undefined no-show terms also drive the `NO_SHOW` transition and inventory release.
**Recommendation:** Define per property. If terms differ by property, model them per property from the start rather than retrofitting.
**Status:** `BLOCKING`

### OQ-046 · Early check-in / late check-out
**Issue:** Are these offered, at what charge, and can they be requested at booking time?
**Current information:** None.
**Impact:** Booking request fields, pricing, and operational handling.
**Recommendation:** Capture as a request at booking time, subject to availability, priced per property policy.
**Status:** `OPEN`

---

## Customers, accounts & verification

### OQ-025 · Email verification
**Issue:** Must a customer verify their email before submitting a booking request?
**Current information:** Not specified.
**Impact:** Conversion vs. spam and lead quality.
**Recommendation:** **Not required to submit** — flag unverified requests for sales. **Required** before leaving a review and before viewing booking history.
**Status:** `OPEN`

### OQ-049 · Spam and speculative requests
**Issue:** What controls should limit automated or speculative requests?
**Current information:** None specified.
**Impact:** Soft holds make spam costly — a bot could block real inventory.
**Recommendation:** Rate limiting per IP and per email, duplicate detection, bot mitigation on submission, and optional email verification for requests above the group threshold.
**Status:** `OPEN`

### OQ-026 · Social and Zalo login
**Issue:** Should Google, Facebook, or Zalo login be offered?
**Current information:** Not mentioned.
**Impact:** Registration friction, especially for Vietnamese guests where Zalo is dominant.
**Recommendation:** Ship email/password in v1; add Google and Zalo in a later phase, designed for from the start.
**Status:** `DEFERRED`

### OQ-032 · Zalo as a communication channel
**Issue:** Does KAS use Zalo for guest communication, and should the platform support it as a contact channel and notification channel?
**Current information:** Not mentioned. Zalo is the dominant messaging platform in Vietnam.
**Impact:** Contact preference capture, sales workflow, and the notification abstraction.
**Recommendation:** Capture Zalo as a preferred contact channel in v1 (sales uses it manually); treat automated Zalo messaging as `FUTURE`.
**Status:** `OPEN`

### OQ-027 · Data retention and privacy compliance
**Issue:** How long is customer data retained? What are the obligations under Vietnamese personal data law? Is a DPO or registration required?
**Current information:** None.
**Impact:** Legal exposure; deletion and anonymisation design; audit log retention.
**Recommendation:** Obtain legal advice before launch. Build erasure and export capability to the stricter of Vietnamese law and GDPR.
**Status:** `BLOCKING` for launch

### OQ-028 · Identity documents
**Issue:** Should the platform collect passport or ID data for guest registration with local authorities?
**Current information:** Not mentioned.
**Impact:** Materially raises the security and compliance burden if included.
**Recommendation:** **Keep out of scope.** Handle at the property, as today.
**Status:** `OPEN`

### OQ-021 · Legal entity details
**Issue:** Registered company name, business registration number, tax code, and registered address for the footer and policy documents.
**Current information:** None.
**Impact:** Legal requirement for a commercial website; also a trust signal.
**Recommendation:** Supply before launch.
**Status:** `OPEN`

---

## Reviews

### OQ-040 · Review rules
**Issue:** Review window after checkout; minimum/maximum length; whether guests may edit or delete their own review; whether reviews may be anonymous; photo moderation standard; whether a low rating triggers an internal alert before publication.
**Current information:** Confirmed — only completed stays may review; ratings across overall, cleanliness, service, location, room, value; written review; optional photos; Verified Stay; admin moderation; admin reply.
**Impact:** Review module design and moderation workload.
**Recommendation:** 90-day window; guest may edit within 7 days of submission then not at all; display name as first name + last initial; photos moderated; ratings ≤ 2 alert the property team before publication so service recovery can happen.
**Status:** `OPEN`

### OQ-024 · Review moderation authority
**Issue:** May `ADMIN` reject and delete reviews, or only `SUPER_ADMIN`? What are the legitimate grounds for rejection?
**Current information:** Admin moderation is confirmed; authority levels are not.
**Impact:** Trust integrity. Over-permissive deletion turns verified reviews into marketing copy and destroys their value.
**Recommendation:** `ADMIN` may reject with a recorded reason from a fixed list (abusive, off-topic, personal data, spam, not about this stay). **Only `SUPER_ADMIN` may delete.** Editing a guest's review text is prohibited outright.
**Status:** `OPEN`

---

## Vouchers & offers

### OQ-029 · Voucher rules
**Issue:** What voucher types will KAS offer? Percentage, fixed amount, or value-add (free breakfast, upgrade, late checkout)? Stackable? Per-property or portfolio-wide? Usage limits? Public codes or targeted? How does a voucher interact with a request that sales may modify?
**Current information:** Voucher management is a confirmed admin module. No rules supplied.
**Impact:** Voucher model, pricing engine, and the booking flow.
**Recommendation:** Start with percentage and fixed-amount, non-stackable, with validity and stay-date windows and usage limits. Critically: in a request model a voucher is **applied to the estimate and re-validated at confirmation** — define what happens if it expires in between.
**Status:** `OPEN`

---

## Admin & permissions

### OQ-023 · Admin price override
**Issue:** May `ADMIN` override the price on a booking, and is there a discount limit requiring `SUPER_ADMIN` approval?
**Current information:** Not specified.
**Impact:** Revenue control and audit requirements.
**Recommendation:** Allow override up to a configurable percentage; beyond it requires `SUPER_ADMIN`. All overrides audit-logged with a reason.
**Status:** `OPEN`

### OQ-031 · Amenity data
**Issue:** The actual amenity set for each property and each room type.
**Current information:** Only Milestone's facilities are known (large restaurant, rooftop bar, gym, premium rooms, rooftop experience).
**Impact:** Property and room pages; filtering; comparison.
**Recommendation:** Collect against the shared taxonomy in [03](03-property-map.md) §6.
**Status:** `OPEN`

---

## Content & localisation

### OQ-020 · Languages and currency
**Issue:** Which languages must the site support, which is the default, and how is currency displayed? Is multi-currency needed?
**Current information:** Not specified. The market is Vietnam; the audience is broad, implying international guests.
**Impact:** Content model, editorial workload, routing, SEO, and the entire content collection effort.
**Recommendation:** **Vietnamese and English, both first-class.** VND as the only transactional currency. Multi-currency display as `FUTURE`, indicative only.
**Status:** `BLOCKING`

### OQ-030 · Photography
**Issue:** Does professional photography exist for all 8 properties — exteriors, lobbies, every room type, amenities, and Milestone's rooftop, restaurant, and gym?
**Current information:** None supplied.
**Impact:** **The largest single dependency of a photography-led premium design.** No amount of engineering compensates for weak imagery, and uneven quality across properties creates an implicit ranking that contradicts the brand rules.
**Recommendation:** Audit existing assets immediately. Commission a consistent shoot across all 8 properties in parallel with Phase 2 — this has the longest lead time of any launch dependency.
**Status:** `BLOCKING`

### OQ-036 · Google Business Profiles
**Issue:** Are all 8 properties claimed and accurate on Google Business Profile?
**Current information:** Not supplied.
**Impact:** Local search visibility and map accuracy — a significant driver of direct bookings.
**Recommendation:** Audit and align with website content as a Phase 2 operations task.
**Status:** `OPEN`

### OQ-041 · Loyalty programme
**Issue:** Does KAS have or want a returning-guest or membership programme?
**Current information:** Not mentioned. Member rates are among the most effective direct-booking tools available to hotels.
**Impact:** Customer model, pricing, and marketing.
**Recommendation:** Out of scope for v1; revisit after launch. Note that a member-only rate would require a rate plan structure (OQ-034).
**Status:** `DEFERRED`

### OQ-042 · Restaurant, rooftop and facility bookings
**Issue:** Should the site support F&B or facility reservations, particularly at Milestone?
**Current information:** Milestone has a large restaurant and rooftop bar. Not mentioned as bookable.
**Impact:** Scope; a separate booking domain.
**Recommendation:** Out of scope for v1. Present as editorial content with a contact route.
**Status:** `DEFERRED`

---

## Technology & infrastructure

### OQ-038 · Team skills
**Issue:** What are the existing skills of the team who will build and maintain this? Is there an in-house team, an agency, or a mix?
**Current information:** Unknown.
**Impact:** **Determines NestJS vs. Spring Boot.** The largest single input to the stack decision.
**Recommendation:** Answer before Phase 2. If Java-primary, use Spring Boot; the rest of the architecture is unchanged.
**Status:** `BLOCKING`

### OQ-039 · Hosting region and data residency
**Issue:** Are there legal or policy requirements to host Vietnamese personal data within Vietnam?
**Current information:** Unknown.
**Impact:** Hosting choice, latency, cost, and provider availability. Could constrain the platform options materially.
**Recommendation:** Obtain legal advice. Default to a Singapore region for latency unless residency requires otherwise.
**Status:** `BLOCKING`

### OQ-037 · Scale figures
**Issue:** Actual current booking volume, website traffic, and total room count across the portfolio.
**Current information:** Estimated in [10](10-system-requirements.md) §4.
**Impact:** Validates the sizing assumptions behind the architecture. Unlikely to change the recommendation, but worth confirming.
**Recommendation:** Supply current figures from existing systems or OTA reports.
**Status:** `OPEN`

### OQ-043 · Success targets
**Issue:** What commercial targets should the platform be measured against?
**Current information:** Placeholders in [01](01-product-foundation.md) §7.
**Impact:** Prioritisation and post-launch measurement.
**Recommendation:** Set targets for request volume, request-to-confirmation rate, and direct share of total bookings.
**Status:** `OPEN`

### OQ-044 · User research
**Issue:** Should real guest research be conducted to validate the personas and journeys?
**Current information:** Personas are working assumptions, not validated.
**Impact:** Design confidence.
**Recommendation:** Interview 5–8 recent guests and 2–3 sales staff during Phase 2. Low cost, high value, and the sales interviews will surface workflow realities no document captures.
**Status:** `OPEN`

### OQ-019 · Communication timing
**Issue:** Confirm the timing of check-in reminders, post-stay emails, and review invitations.
**Current information:** These communications are confirmed; timings are not.
**Impact:** Notification scheduling.
**Recommendation:** Adopt the schedule in [05](05-booking-sales-model.md) §7.
**Status:** `OPEN`

---

## Register summary

| Category | Open | Blocking |
|---|:--:|:--:|
| Brand & identity | 5 | 1 |
| Rooms, inventory & availability | 6 | 2 |
| Pricing | 4 | 1 |
| Booking & sales workflow | 6 | 2 |
| Customers & accounts | 7 | 1 |
| Reviews | 2 | 0 |
| Vouchers | 1 | 0 |
| Admin & permissions | 2 | 0 |
| Content & localisation | 5 | 2 |
| Technology & infrastructure | 6 | 2 |
| **Total** | **48** | **9 (+2 launch-blocking)** |

*Two entries left this tally on 2026-08-27: **OQ-016** and **OQ-018**, both `ANSWERED` by explicit owner decision recorded in doc [117](117-phase-7-5f-step-16a-contract-amendment.md) §20. Nothing else in Part I changed.*


---

# Part II — OQ-084 → OQ-173

**Consolidated 2026-08-27.** Sources: the phase documents that raised each question. Nothing here is
resolved, reopened, merged, split or reworded into a decision it does not carry.

## Why Part II looks different from Part I

**OQ-166** — recorded below and deliberately left `OPEN` — states the problem this section addresses:

> No canonical register covers OQ-084 and above. Doc 16 stops at OQ-083; OQ-122 and its successors
> live only in phase-log tables in the format `ID · Question · Blocking`, not the register's
> `ID · Category · Issue · Current information · Impact · Recommendation · Status`.

Part I's per-entry format carries six fields. **The sources for OQ-084 and above carry one** — a
question sentence, sometimes a severity or blocking marker. Writing *Current information*, *Impact*
and *Recommendation* for eighty-nine entries would mean **inventing** three fields per question, which
is the failure mode this register exists to prevent. Part II therefore uses a table that records only
what the sources actually say, plus traceability back to the exact line. When the owner answers a
question, its entry can be promoted to Part I's full format with real content in every field.

**Question wording is verbatim from the defining source**, with only the leading identifier and
Markdown list marker removed. Where a question was defined in prose rather than a table, the note says so.

## Status vocabulary in Part II

Part I's legend (`OPEN` · `BLOCKING` · `ANSWERED` · `DEFERRED`) does not cover every word the
phase documents used. Part II preserves each source's own term rather than translating it:

| Status | Meaning, as the sources use it |
|---|---|
| `OPEN` | Awaiting the product owner |
| `CLOSED` | Explicitly closed by a recorded owner decision |
| `RESOLVED` | Explicitly marked ✅ resolved by the document that fixed it |
| `DEFERRED` | Consciously postponed |
| `FUTURE` | Cannot arise in V1; belongs to a later capability (doc 85 §13's term) |
| `PARTIALLY RESOLVED` | Some parts settled, others not — doc 98 §8's term |
| `APPROVED FOR FORWARD FIX` | Owner approved a fix; no document marks the question itself closed |

`CLOSED` and `RESOLVED` are **not** normalised into one another: each row keeps the word its source
used. Neither is treated as equivalent to Part I's `ANSWERED`.

## Register — OQ-084 → OQ-173

*`Source` is the exact `doc:line` where the question is defined. `Governing` is the document that
currently governs it — the same document when nothing later changed it.*

| ID | Question (verbatim from source) | Status | Source | Governing | Notes |
|---|---|---|:--|:--|---|
| **OQ-084** | Nav label: "Hotels" vs "Stays" | `OPEN` | doc 65:211 | doc 65 §10 | Recommendation recorded; no owner decision. |
| **OQ-085** | In a multi-partner model, what may a partner see of a customer's stay history at another partner's properties? | `FUTURE` | doc 85:448 | doc 85 §13 | Source status verbatim: `FUTURE` — no cross-partner visibility exists in V1. |
| **OQ-086** | If a property is ever reassigned between partners, must `audit_log` and historical reservations freeze the partner at write time? | `FUTURE` | doc 85:449 | doc 85 §13 | Source status verbatim: `FUTURE` — blocks any property-reassignment capability. |
| **OQ-087** | Are any settings (SLA, hold durations, policies) partner-level rather than global? | `OPEN` | doc 85:450 | doc 85 §13 | V1 treats all settings as global; one partner makes them equivalent. |
| **OQ-088** | Should `voucher` become partner-scoped? It does not derive partner through property | `FUTURE` | doc 85:451 | doc 85 §13 | Source status verbatim: `FUTURE` — V1 has one partner. |
| **OQ-089** | Approve **TOTP** as the V1 second factor for `SUPER_ADMIN`? | `RESOLVED` | doc 91:506 | doc 150 | Owner decision: 2FA is not required in V1; TOTP will not be implemented for this policy. |
| **OQ-089a** | Accepted TOTP clock-drift window | `RESOLVED` | doc 91:507 | doc 150 | Not applicable: TOTP is not required or implemented in V1. |
| **OQ-090** | Number of recovery codes issued (**PROPOSED: 10**) | `RESOLVED` | doc 91:508 | doc 150 | Not applicable: recovery codes are not part of the V1 authentication policy. |
| **OQ-091** | Amend doc 58 §8 to add a staff authentication route? | `OPEN` | doc 91:509 | doc 91 §14 |  |
| **OQ-092** | Rate-limit thresholds and windows per event | `OPEN` | doc 91:510 | doc 91 §14 | Distinct from OQ-163, which was raised later for the anonymous request surface. |
| **OQ-093** | Progressive-delay curve and temporary-lock duration | `OPEN` | doc 91:511 | doc 91 §14 |  |
| **OQ-094** | Confirm or change the doc 06 §5.3 session lifetimes | `OPEN` | doc 91:512 | doc 91 §14 | Doc 06 §5.3 lifetimes are PROPOSED. |
| **OQ-095** | Which secret manager, and the key rotation procedure | `RESOLVED` | doc 91:513 | doc 150 | Not applicable to 2FA in V1; unrelated application secrets remain governed by doc 10 §5.1. |
| **OQ-096** | Emergency 2FA recovery runbook and named approver | `RESOLVED` | doc 91:514 | doc 150 | Not applicable: no 2FA recovery flow is shipped in V1. |
| **OQ-097** | Should `ADMIN` 2FA move from "strongly recommended" to mandatory? | `RESOLVED` | doc 91:515 | doc 150 | Owner decision: 2FA is not required for any staff role in V1. |
| **OQ-098** | A Partner editing a published property overwrites live data with no draft/published split. Doc 58 §2 anticipates `If-Match`/`version`; the split does not exist | `OPEN` | doc 93:269 | doc 97 §17 / §18 | Carried and re-narrowed in docs 94, 95, 96, 97. Doc 96 §15: *"narrows again but does not close."* Doc 99 §17 still lists it as remaining. |
| **OQ-099** | Separation of duties: in V1 KAS reviews its own submissions | `OPEN` | doc 93:270 | doc 93 §13 |  |
| **OQ-100** | Doc 58 §8 amendment for the seven review endpoints | `OPEN` | doc 93:271 | doc 93 §13 |  |
| **OQ-101** | Approval targets `COMING_SOON`; what moves a property to `OPEN`, and does it require inventory and rates? | `OPEN` | doc 93:272 | doc 97 §17 | Carried into doc 97 as 🟡; doc 99 §17 still lists it as remaining. |
| **OQ-102** | No controlled bed-type vocabulary exists — `bed_type` is free text. Should there be one? | `OPEN` | doc 94:234 | doc 103 §8 | Carried openly through docs 103, 104, 107–112. |
| **OQ-103** | Which amenity categories are room-eligible? Only `PROPERTY_FACILITY` is currently excluded | `OPEN` | doc 94:235 | doc 94 §14 |  |
| **OQ-104** | Brief §26 anticipates a room code; no column exists. Needed? | `OPEN` | doc 94:236 | doc 94 §14 |  |
| **OQ-105** | Should a Partner ever publish a room type directly, bypassing review? | `OPEN` | doc 94:237 | doc 94 §14 |  |
| **OQ-106** | Which object-storage provider? Blocks `upload-url`, pre-signed uploads, derivatives, malware scanning | `OPEN` | doc 95:276 | doc 105 §5 | The most-carried question in the corpus (36 mentions across 17 documents). Gates OQ-141 and OQ-142. |
| **OQ-107** | Size and dimension bounds per category (doc 62 §4 "bounded", no numbers) | `OPEN` | doc 95:277 | doc 95 §15 |  |
| **OQ-108** | Doc 58 §3.1 reconciliation for the room-type gallery path | `OPEN` | doc 95:278 | doc 95 §15 |  |
| **OQ-109** | `checksum` exists and doc 62 §4 specifies upload idempotency by it — unusable until uploads exist | `OPEN` | doc 95:279 | doc 95 §15 |  |
| **OQ-110** | Do `CHECK_IN`/`CHECK_OUT`/`EXTRA_BED`/`DEPOSIT` need policy types, or do the property columns and the rate model cover them? | `OPEN` | doc 96:357 | doc 96 §15 | Carried through docs 106–112. |
| **OQ-111** | Doc 58 §8 has no policies row. Approve the admin and public policy routes as a contract amendment. | `OPEN` | doc 96:358 | doc 106 §17 | Doc 58 §8 still has no policies row. |
| **OQ-112** | Which timezone governs `effective_from`? Currently the database server's `current_date`. | `OPEN` | doc 96:359 | doc 96 §15 |  |
| **OQ-113** | Confirm the both-locale body requirement for activation. Currently enforced; PROPOSED, not frozen. | `OPEN` | doc 96:360 | doc 106 §17 | Doc 106 §17: *"open, now evidenced"* — enforced in the backend but still PROPOSED, not frozen. |
| **OQ-114** | Should policy authoring be separable from `property.manage`? | `OPEN` | doc 96:361 | doc 96 §15 |  |
| **OQ-115** | **OTA buffer precedence** — priority direction, the specificity ladder, tie-breaking, and how channel-scoped rules materialise into one scalar `buffer_target`. | `CLOSED` | doc 97:485 | doc 99 §1–2 | Owner decision applied 2026-08-18: `priority DESC` → `specificity DESC` → tie = configuration error. Implemented as `BufferResolver`. |
| **OQ-115b** | channel-specific buffer | `DEFERRED` | doc 99:17 | doc 99 §3 | Channel-specific buffer deferred to V2; V1 rules carry `distribution_channel_id = NULL`. Sub-question first named in doc 99. |
| **OQ-116** | ✅ **CLOSED 2026-08-18 — tax is out of KAS V1 scope** (doc 99 §12). V1 pricing is room rate → voucher → customer payable. The discount-vs-tax contradiction is retired, not answered. | `CLOSED` | doc 97:486 | doc 99 §12 | Tax is **out of KAS V1 scope** (owner decision 2026-08-18). Doc 99 §4 is explicitly **superseded** by §12. Retired rather than answered. Struck through in doc 97 §17. |
| **OQ-117** | **Horizon generation seed** — docs 13 §3.3 / 15 §4.4 seed each date from "the room type's default `total`"; no such column exists. Add one, or make generation operator-driven? | `PARTIALLY RESOLVED` | doc 97:487 | doc 98 §8 | ⚠️ **Ambiguous — see §16.3.** Doc 98 §8 marks the parent 🟡 PARTIALLY RESOLVED; doc 99 closed the b and c halves; doc 97 §17 still lists OQ-117 as 🔴 blocking. |
| **OQ-117b** | Room quantity per room type · Số phòng mỗi loại phòng | `CLOSED` | doc 98:393 | doc 99 §5 | Room quantity is authoritative per `(room_type, date)`; no default column; never derived from `property.total_rooms`. Appears as **OQ-117-B** in doc 98 §7. |
| **OQ-117c** | Inventory generation · Cách tạo dữ liệu tồn phòng | `CLOSED` | doc 98:413 | doc 99 §5 | Operator applies quantity across the range; no scheduler; missing rows stay unavailable; horizon 24 months. Appears as **OQ-117-C** in doc 98 §7. |
| **OQ-118** | Hold creation and the 5-minute sweep need B1/B2 values *and* scheduler infrastructure. Which scheduler? | `OPEN` | doc 97:488 | doc 97 §17 | Doc 99 §17 still lists it as remaining. B2 was later supplied (doc 117); the scheduler question was not. |
| **OQ-119** | Rounding mode for `adjustment_percent` against zero-decimal VND. Currently HALF_UP, PROPOSED. | `OPEN` | doc 97:489 | doc 110 §16 | Rounding still PROPOSED (HALF_UP). Doc 109 §17: *"Not load-bearing for Step 12."* |
| **OQ-120** | `rate_rule.min_nights` / `max_nights` appear in no doc 56 §3.1 predicate. Stay-level restrictions for the booking path? | `OPEN` | doc 97:490 | doc 97 §17 | Carried through docs 109–112. |
| **OQ-121** | `shared.RuleStatus` duplicates `property.PolicyStatus` over one database enum. Consolidate? | `OPEN` | doc 97:491 | doc 97 §17 |  |
| **OQ-122** | `GET /public/availability/search` — facets and response envelope undefined. | `OPEN` | doc 97:492 | doc 115 §6 | **OQ-122 remains OPEN.** Re-asserted in doc 114 §13 and decomposed into six answerable parts in doc 115 §2E. Doc 113:201 folds the `children`/B10 refusal conflict into it. |
| **OQ-123** | `POST /public/availability/quote` — doc 58 gives a request body and no response shape. | `OPEN` | doc 97:493 | doc 111 §20 | Doc 58 §11.2 froze a quote response shape in Step 15, but no document marks OQ-123 closed. |
| **OQ-124** | Doc 58 §8 rate authoring routes not delivered this phase. | `OPEN` | doc 97:494 | doc 97 §17 |  |
| **OQ-125** | Should `INVENTORY_HORIZON_MONTHS` simply be set to the 24 that doc 55 §2 states? | `OPEN` | doc 97:495 | doc 97 §17 | ⚠️ `INVENTORY_HORIZON_MONTHS = 24` **was** applied (doc 99 §1). No document marks OQ-125 itself closed — see §16.3. |
| **OQ-126** | `/ops/inventory/bulk/preview` is an added route; doc 58 requires the preview without naming a path. | `OPEN` | doc 97:496 | doc 97 §17 | Doc 99 §17 still lists it as remaining. |
| **OQ-128** | `PATCH /rate-rules/{id}` and `/status` are additions; doc 58 §8 amendment still owed. **Consumed by this step** | `CLOSED` | doc 109:403 | doc 110 §16 | ✅ CLOSED by the doc 58 §11.1 amendment. Struck through in doc 110 §16. |
| **OQ-129** | Is the Partner Portal a separate `/partner/**` experience, contradicting doc 22 §8 and doc 85 §9? | `RESOLVED` | doc 100:400 | doc 100 §14.1 | ✅ Owner decision: separate Partner Portal frontend IA approved; creates no new role, permission, authentication model or API namespace. |
| **OQ-130** | Given `SUPER_ADMIN` cannot sign in until 2FA ships, what is the Admin Portal in V1? (§10.1) | `RESOLVED` | doc 100:401 | doc 150 | ✅ Admin Portal approved; the later owner decision removed the 2FA gate and allows standard sign-in. |
| **OQ-131** | Add springdoc/OpenAPI to the backend so the client is generated rather than hand-typed? | `OPEN` | doc 100:402 | doc 100 §13 |  |
| **OQ-132** | `PropertyAdminView` returns no name, address or phone, though `PATCH` writes address and contact and both locales' names exist. Should the admin read expose them? | `RESOLVED` | doc 100:1025 | doc 101 §10 | ✅ RESOLVED — doc 101 §2. |
| **OQ-133** | `CompletenessResult` section and field names are English-only, and are also what a refused submit puts in `details[]`. Bilingual labels belong in the backend, not a frontend lookup. | `OPEN` | doc 100:1026 | doc 101 §10 | Carried through docs 102–112. |
| **OQ-134** | No dev Partner account exists, so no frontend feature can be exercised end-to-end (§17.11). | `RESOLVED` | doc 100:1027 | doc 101 §10 | ✅ RESOLVED — doc 101 §1. |
| **OQ-135** | a `CONFIG_MISSING` message reached an unauthenticated login page verbatim (§1.4) | `OPEN` | doc 101:369 | doc 101 §10 | Raised as **new**, low severity. |
| **OQ-136** | `PATCH` cannot express "clear this field" (§4.1) | `OPEN` | doc 102:188 | doc 102 §8 |  |
| **OQ-137** | room-type `GET` returned no name though `POST`/`PATCH` write one | `RESOLVED` | doc 103:183 | doc 103 §8 | ✅ RESOLVED — doc 103 §2. |
| **OQ-138** | `PATCH /room-types/{id}` writes only the **`en`** translation, while `POST` writes both. A Partner editing a room can therefore not change its Vietnamese name at all | `RESOLVED` | doc 103:184 | doc 104 §8 | ✅ RESOLVED — doc 104 §1. |
| **OQ-139** | version in the body (property) vs query parameter (room type). Neither is required by doc 58 §2; left as-is pending an owner decision | `OPEN` | doc 104:171 | doc 104 §8 | Source: *"left as-is pending an owner decision."* |
| **OQ-140** | `amenity_translation` is empty, so the catalogue has 56 codes and no approved labels | `OPEN` | doc 104:172 | doc 104 §8 |  |
| **OQ-141** | **OQ-141 · An admin route to list an owner's media links.** | `OPEN` | doc 105:110 | doc 105 §5 | Defined in prose, not a table. Proposed route `GET /api/v1/admin/media/links` — *"for approval rather than assumed."* Gated by OQ-106. |
| **OQ-142** | **OQ-142 · An admin media view that can be rendered.** | `OPEN` | doc 105:123 | doc 105 §5 | Defined in prose, not a table. Blocked by OQ-106; must expose a derived URL, never `storage_key` (doc 58 §9 denylist). |
| **OQ-143** | policy `summary` is writable and never readable, so no screen can show or clear one | `OPEN` | doc 106:192 | doc 106 §17 |  |
| **OQ-144** | no policy-type catalogue endpoint, so the eleven values are mirrored in the frontend against a frozen CHECK | `OPEN` | doc 106:193 | doc 106 §17 |  |
| **OQ-145** | `INVENTORY_HORIZON_MONTHS` and `MAX_RANGE_DAYS` are mirrored in the frontend for navigation; no endpoint exposes them | `OPEN` | doc 107:162 | doc 107 §13 |  |
| **OQ-146** | the grid returns the winning rule but not the candidates it beat, so a Partner cannot see *why* it won | `OPEN` | doc 108:163 | doc 108 §13 |  |
| **OQ-147** | **No admin route sets `room_type.base_price_minor`.** Doc 56 §7 lists *"Set base rate · `rate.manage` · Per room type"* as a CONFIRMED capability, but no endpoint implements it, and `RoomTypeView` deliberately omits the field. A Partner can therefore price the dates a rule covers and can never price the ones it does not — those cells stay "chưa cấu hình giá" with no screen able to fix them | `CLOSED` | doc 109:398 | doc 110 §16 | ✅ CLOSED — doc 110 §1. Struck through in doc 110 §16. |
| **OQ-148** | **`bulk-preview` does not predict a tie the edit would create.** It resolves the range against rules that exist *now*. Two bulk applies at the same priority over overlapping ranges each succeed, and the grid then returns 422 for the overlapping dates because `RateResolver.requireNoTie` refuses them. The write-time guard `tiesWithExisting` covers rule creation and activation but is not consulted by `applyOne` | `CLOSED` | doc 109:399 | doc 110 §16 | ✅ CLOSED — doc 110 §8. Struck through in doc 110 §16. |
| **OQ-150** | **No bulk base-rate operation exists.** Setting a fallback across many room types is one request each. The contract defines no bulk shape and simulating one by looping would invent a workflow — worth an owner decision now that a property may have many room types | `OPEN` | doc 110:308 | doc 110 §16 | Raised as **new**; explicitly *"worth an owner decision."* |
| **OQ-151** | **Per-property availability accepts no occupancy.** Doc 58 §3.2 names `adults`/`children`/`childAges[]`/`rooms` for `/availability/search` but not for the per-property route, so a guest cannot say who is travelling and results cannot be filtered by party size | `OPEN` | doc 111:338 | doc 115 §6 |  |
| **OQ-152** | **The estimate label's condition may now be unsatisfiable.** Doc 56 §9 labels prices estimates "until B6 and A7 are supplied"; A7 was retired rather than supplied when tax left V1 scope. Should the label be retired with it, or is B6 alone still enough to require it? | `OPEN` | doc 111:339 | doc 111 §20 | Depends on B6; A7 was retired when tax left V1 scope. |
| **OQ-153** | **`nightlyFrom` is undefined in doc 58.** §3.2 shows it only as an example value; that it means the lowest nightly rate across the stay comes from the implementation. A guest-facing "from" price deserves a frozen definition | `OPEN` | doc 111:340 | doc 115 §6 |  |
| **OQ-154** | **Per-room guest allocation.** Capacity is checked in aggregate; the corpus states no rule for which guests occupy which room, which would matter for per-room extra-bed pricing | `OPEN` | doc 112:294 | doc 112 §22 |  |
| **OQ-158** | **Portfolio search is client-side because the list endpoint takes no parameters.** Correct while the response is the complete scoped set with no pagination; it stops being correct the moment a partner's portfolio outgrows one response. Needs a `q`/`status`/page contract on `GET /admin/properties`, which doc 58 §8 does not currently authorise | `OPEN` | doc 113:200 | doc 113 §13 |  |
| **OQ-159** | **The public list's `locale` is a join, not a preference.** `JOIN property_translation t ON … AND t.locale = :locale` means a property with no translation in the requested locale is **omitted from the portfolio entirely** — a missing translation silently hides a hotel rather than falling back. Both seed locales are complete today, so the effect is invisible; it will not stay invisible. Should the query fall back to a default locale, or is omission intended? | `OPEN` | doc 114:306 | doc 115 §6 |  |
| **OQ-160** | **Is S1's "not a duplicate" guard anything more than the `Idempotency-Key` check?** The outcome (return the original) and the client mechanism (header, "Required") are frozen. If the guard *is* only the header check, semantics are settled and only storage is missing. If it is an additional business check, its key — guest? property? dates? line set? which statuses count as active? — is defined nowhere | `CLOSED` | doc 116:170 | doc 117 §20 | 🟢 CLOSED by owner decision 3, corroborated by doc 54:65. |
| **OQ-161** | **A6's declared type cannot hold A6's definition.** `SettingKey` declares `SALES_FIRST_CONTACT_SLA` a single ISO-8601 `Duration`; doc 51 §2 defines A6 as *"Cutoff hour, weekends, public holidays, escalation threshold"*. Either three components are deferred, or more setting keys are needed — which would require a migration | `DEFERRED` | doc 116:171 | doc 117 §20 | 🟡 DEFERRED — the owner deferred three components (cutoff hour, weekends/holidays, escalation threshold). `SALES_FIRST_CONTACT_SLA` = `PT24H` is live. |
| **OQ-162** | **S1 freezes "acknowledgement email; sales notified" and no notification infrastructure exists.** V18 created `email_log` and friends, but there is no `JavaMailSender`, no mail starter, no notification service. Is Step 16A's scope the persisted request + hold + snapshot only, with delivery explicitly deferred? | `OPEN` | doc 116:172 | doc 117 §8.1 | 🔴 **OPEN.** Effect frozen, delivery deferred. Re-confirmed open in docs 118, 119, 120 and 121. |
| **OQ-163** | **Request-submission rate limiting is specified but has no thresholds and no implementation.** Doc 58 §10 names the strategy — "Strict per IP **and** per email" — under a **PROPOSED** heading, with no numbers. `ApiErrorCode.RATE_LIMITED(429)` is declared and unused. This would be the first anonymous, inventory-consuming write endpoint; doc 05 risk B6 names rate limiting a required mitigation | `OPEN` | doc 116:173 | doc 117 §18 | 🔴 **OPEN.** Doc 58 §10 names the strategy under a PROPOSED heading, with no numbers. Re-confirmed open in docs 118–121. |
| **OQ-164** | **`rooms` is named once and defined nowhere.** It appears only inside the §3.2 Purpose cell. Is it the number of rooms requested? A per-room-type quantity? A cap? Nothing else in the corpus, the schema or the code uses it | `OPEN` | doc 115:191 | doc 115 §6 | Raised as **new**. |
| **OQ-165** | **`character` names a concept that does not exist.** Doc 58 §3.1 lists it as a filter for `GET /public/properties`. There is no `character` column, table, enum or reference anywhere in V1–V23 or in the Java. Either a schema concept is missing, or the word should be struck from §3.1 | `OPEN` | doc 115:192 | doc 115 §6 | Raised as **new**. |
| **OQ-166** | **No canonical register covers OQ-084 and above.** Doc 16 stops at OQ-083; OQ-122 and its successors live only in phase-log tables in the format `ID · Question · Blocking`, not the register's `ID · Category · Issue · Current information · Impact · Recommendation · Status`. This is why OQ-122 reads `Blocking = no` while in fact blocking Step 18A | `OPEN` | doc 115:193 | doc 115 §6 | ⚠️ **This is the question the present consolidation answers in substance.** It stays **OPEN** — only the owner may close it. See §16.5. |
| **OQ-167** | **What does one `terms_version` pin, when policies are versioned `int` per `(property_id, policy_type)` across eleven types?** Plus: no rule for a stale `acceptedTermsVersion`, no derivation of the string form, the contracted `GET /public/policies/{type}` unimplemented, and 0 policy rows | `CLOSED` | doc 116:174 | doc 117 §24.2 | 🟢 CLOSED 2026-08-27 — the owner chose to store the client string opaquely in `reservation.terms_version`, with **no validation in V1**. |
| **OQ-168** | **Does the V1 price snapshot carry `taxes[]` and `serviceChargeMinor`?** Doc 56 §5.2 includes both, written when A7 was still expected; A7 was retired when tax left V1 scope, and doc 58 §11.2.4 forbids tax and service-charge fields on the quote. `TaxIsOutOfScopeForV1Test` constrains **class names and the availability response only** — it does not constrain the snapshot either way | `CLOSED` | doc 116:175 | doc 117 §14.2 | 🟢 CLOSED — no `taxes[]` and no `serviceChargeMinor` in the V1 snapshot. |
| **OQ-169** | **`hold_unique` can never fire — verified.** Its XOR sibling forces a NULL into every candidate key, and PostgreSQL's `NULLS DISTINCT` makes identical holds coexist. Same defect class as V21. Should the snapshot shape (§5.2) also be frozen as a typed contract while this is being fixed forward? | `APPROVED FOR FORWARD FIX` | doc 116:176 | doc 117 §20 | 🔵 Owner decision 6; migration delivered in Phase E as **V25**, corrected by **V26**. ⚠️ No document explicitly marks it CLOSED — see §16.3. |
| **OQ-170** | same key, different body | `CLOSED` | doc 117:556 | doc 117 §24.1 | 🟢 CLOSED 2026-08-27 — same key + different canonical fingerprint → **409 `IDEMPOTENCY_KEY_REUSED`**. Raised in prose at doc 117 §5.5 / §10:132; §5.5 is marked **superseded** by §24.1. |
| **OQ-171** | snapshot typed shape | `CLOSED` | doc 117:557 | [125](125-phase-7-5f-step-16a-4-oq171-contract-amendment.md) | 🟢 **CLOSED 2026-08-27 by owner ruling — Step 16A.4** ([125](125-phase-7-5f-step-16a-4-oq171-contract-amendment.md)), completing doc 117 §14.3. **`version`** is the snapshot **revision number**, starting at **1** at S1 and taking the next integer on each re-version; it is **not** a JSON schema version and is independent of `reservation.version`, the optimistic-lock column that starts at 0. The **prior version** is retained in the existing `reservation_change.before_state` `jsonb` — **no new table, no migration** — though **no code writes it yet**. The snapshot persists **`propertyId` and `propertyName`**, the name taken in the request’s locale exactly as `room_type_name_snapshot` already is. **`appliedRuleIds`** is the **distinct union** of `nights[].ruleId`, deterministically ordered, `[]` when no night had a rule; base-rate nights contribute nothing; it stays **INTERNAL** under doc 58 §9. **`reservation_line.nightly_price_minor`** is populated **only when every night in the line shares one rate** — never a first/lowest/highest/average stand-in — and `price_snapshot.nights[].rateMinor` remains authoritative. ⚠️ One editorial reconciliation is flagged for the owner: the ruling said *"ascending numeric `ruleId`"*, but `rate_rule.id` is a **`uuid`**, so the stated requirement — stable deterministic ordering — is frozen as ascending canonical UUID string ([125](125-phase-7-5f-step-16a-4-oq171-contract-amendment.md) §8.3). ****Implemented and verified 2026-08-27** — [126](126-phase-7-5f-step-16a-oq171-snapshot-implementation.md): `"version":1`, `propertyId` + request-locale `propertyName`, the ordered distinct `appliedRuleIds` (`[]` when no rule applied), and `nightly_price_minor` written only for uniform lines. **No migration** (28, latest V26); backend **514** tests green.** |
| **OQ-172** | `expiresAt` cleared at S10 vs `NOT NULL` | `CLOSED` | doc 118:345 | doc 118 §18 | 🟢 **CLOSED 2026-08-28** — owner ruling, Step 16A.9 decision 1, **option B**: `expires_at` stays `NOT NULL` and a firm hold is `status = 'CONVERTED'`. No migration made the column nullable. Implemented and tested — [132](132-phase-7-5f-step-16a-9-s10-s2-s4-implementation.md) §4.2. |
| **OQ-173** | **The `422 NO_AVAILABILITY` `alternatives` object is undefined.** Doc 58 §3.3 shows `{ "nearestDates": [...], "otherProperties": [...] }` with both arrays elided, and the terms appear nowhere else; doc 113 refers to "the `otherProperties` half of OQ-156", which is itself never defined. The owner must supply **the item shape of each array** and **the selection rule** — how near, how many, which properties, in what order — before it can be emitted. The rest of the 422 envelope is implemented and tested | `CLOSED` | doc 119:133 | doc 120 §8 | 🟢 CLOSED — `alternatives` is **out of V1 scope** by owner decision. On no availability the property is absent rather than emitting empty arrays. |
| **OQ-174** | Sales / content — the public promise wording no longer matches the SLA. Six-plus guest surfaces promise *"within the day"*; the API returns **`"Within 24 hours"`**, rendered from A6 because doc 117 §9 requires the promise to derive from A6 *"and from nothing else"*. They are **different commercial promises** — a request at 23:00 satisfies `PT24H` by replying at 22:00 the next day, which is not within the day | `CLOSED` | doc 122:252 | [123](123-phase-7-5f-step-16a-3-oq174-contract-amendment.md) | 🟢 **CLOSED 2026-08-27 by owner ruling — Step 16A.3.** V1 promises a response **within 24 hours of `reservation.requested_at`** — a **rolling duration**, not a calendar day. **A6 `SALES_FIRST_CONTACT_SLA` = `PT24H` is the sole source of truth** for both `sla_due_at` and `responsePromise`; *"within the day"* is **not a valid synonym** for the V1 API promise. Calendar, cutoff, weekend, holiday and escalation semantics stay outside A6 — **OQ-161 remains `DEFERRED`**. **No new setting key, A6 unchanged, and no code was written**: the shipped S1 endpoint already computes `requestedAt.plus(sla)` and renders the promise from the same `Duration`, with `ReservationRequestIT` pinning both halves. Supersedes **D-14** (doc 28 §3) and doc 58 §3.3’s example string as V1 wording — historical documents left unrewritten ([123](123-phase-7-5f-step-16a-3-oq174-contract-amendment.md) §14) |

## Identifiers with no formal record

These are **not** questions. They are recorded so that a future reader does not mistake a gap for a
lost entry, and **no question text was manufactured for any of them**.

| ID | Finding |
|---|---|
| **OQ-127** | **NO FORMAL RECORD LOCATED.** Zero occurrences anywhere in `docs/`. Never defined, never referenced. |
| **OQ-149** | **NO FORMAL RECORD LOCATED.** Zero occurrences anywhere in `docs/`. Never defined, never referenced. |
| **OQ-155** | **REFERENCED, NEVER DEFINED.** Appears once, inside the shorthand `OQ-155/156/157 (Step 16A)` in doc 113:202's carried-forward list. No definition exists. |
| **OQ-156** | **REFERENCED, NEVER DEFINED.** Doc 113:227 refers to *"the `otherProperties` half of OQ-156"*. Docs [119](119-phase-7-5f-step-16a-e5-s1-end-to-end.md):41 and [120](120-phase-7-5f-step-16a-oq173-contract-amendment.md):27 both state it is *"never defined anywhere"*. **OQ-173** was raised in its place and is `CLOSED`. |
| **OQ-157** | **REFERENCED, NEVER DEFINED.** Appears only inside the same `OQ-155/156/157` shorthand at doc 113:202 — never as a standalone identifier. |

## Ambiguities — recorded, not decided

Each of these needs an owner ruling. **None was resolved during consolidation.**

**OQ-117 — parent status contradicts its parts.** Doc 98 §8 marks the parent 🟡 `PARTIALLY RESOLVED`.
Doc 99 §5 closed the **b** (room quantity) and **c** (generation) halves, and doc 99 §1 applied
`INVENTORY_HORIZON_MONTHS = 24`, which is what the **A** (horizon length) half asked for. But doc 97
§17 — a document that *was* updated after doc 99, since it carries OQ-116's closure — still lists
**OQ-117 as 🔴 blocking**. No document states that OQ-117-A is closed under that identifier, and no
document closes the parent. Recorded as `PARTIALLY RESOLVED`; **the owner must say whether OQ-117 is
now fully closed.**

**OQ-125 — the value was supplied, the question was never closed.** OQ-125 asks whether
`INVENTORY_HORIZON_MONTHS` should simply be set to the 24 that doc 55 §2 states. Doc 99 §1 applied
exactly that, and the setting is live in the database. **No document marks OQ-125 closed.** Closure is
not inferred from implementation, so it stays `OPEN`.

**OQ-169 — fixed forward, never marked closed.** Doc 117 §20 records 🔵 `APPROVED FOR FORWARD FIX`
(owner decision 6). The migration shipped as **V25** and was corrected by **V26**
([121](121-phase-7-5f-step-16a-e6-hardening.md)). No document marks the question itself closed, so the
source's own status is preserved verbatim.

## Identifier naming variants

Recorded rather than normalised, because renaming an owner's identifier would break traceability.

| Canonical here | Also written as | Where |
|---|---|---|
| **OQ-089a** | — | doc 91 §14 — the only sub-identifier using a bare letter suffix |
| **OQ-115b** | — | first named in doc 99 §1; no earlier definition |
| **OQ-117b** | **OQ-117-B** | doc 99 uses `OQ-117b`; doc 98 §7 uses `OQ-117-B` |
| **OQ-117c** | **OQ-117-C** | doc 99 uses `OQ-117c`; doc 98 §7 uses `OQ-117-C` |
| *(no lowercase form)* | **OQ-117-A** | doc 98 §7 only — see the OQ-117 ambiguity above |

## What this consolidation did and did not do

**Did:** discover every `OQ-` identifier at 084 or above across all **102** documents in `docs/kas/` — **36** mention one, **30** define one;
extract each question verbatim from its defining line; reconcile status from explicit evidence only;
record source and governing document for every entry; and record the five identifiers that have no
formal record.

**Did not:** resolve, close, reopen, merge, split or reword any question; decide any of the three
ambiguities above; touch any source file, migration, test or contract; or rewrite any historical
document to agree with this register. Where a historical document has old wording, that wording
stands and the relationship is recorded here instead.

**OQ-166 is left `OPEN`.** This section is the work OQ-166 asks for, but only the owner may judge it
sufficient and close it.

## Part II summary

| Status | Count |
|---|--:|
| `OPEN` | 63 |
| `CLOSED` | 14 |
| `RESOLVED` | 6 |
| `FUTURE` | 3 |
| `DEFERRED` | 2 |
| `PARTIALLY RESOLVED` | 1 |
| `APPROVED FOR FORWARD FIX` | 1 |
| **Total entries** | **90** |
| *Identifiers with no formal record* | *5 (OQ-127 · OQ-149 · OQ-155 · OQ-156 · OQ-157)* |

**66 of the 90 entries are not settled** — 61 `OPEN`, 3 `FUTURE`, 1 `PARTIALLY RESOLVED`,
1 `APPROVED FOR FORWARD FIX`. Twenty-two are `CLOSED` or `RESOLVED`; two are `DEFERRED`.

*Step 16A.9 ([132](132-phase-7-5f-step-16a-9-s10-s2-s4-implementation.md)) closed exactly two entries —
**OQ-172** and **OQ-017** — each by an explicit owner ruling that was then implemented and tested, and
changed no other status. **OQ-162, OQ-163 and OQ-066 remain `OPEN`; OQ-161 remains `DEFERRED`.**
Nothing is sent by any of the four transitions it implemented, so OQ-162 is untouched by design.*

*Step 16A.4 ([125](125-phase-7-5f-step-16a-4-oq171-contract-amendment.md)) closed exactly one entry — **OQ-171** — by owner ruling, and changed no other status.
**OQ-172 stays `OPEN`**, as do OQ-162, OQ-163 and OQ-066; **OQ-161 stays `DEFERRED`**.*

*Step 16A.3 ([123](123-phase-7-5f-step-16a-3-oq174-contract-amendment.md)) closed exactly one entry — **OQ-174** — by owner ruling, and changed no other status.
**OQ-161 remains `DEFERRED`**; OQ-171, OQ-172, OQ-162, OQ-163 and OQ-066 remain `OPEN`.*

*Step 16A.2 ([122](122-phase-7-5f-step-16a-2-oq051-oq083-reconciliation.md)) added one entry — **OQ-174** — and resolved none. It ruled on **OQ-051**
(`CLOSED`) and **OQ-083** (`RESOLVED`), both of which sit in the OQ-051 → OQ-083 range that lives in
docs 28 and 50, not in Part II. It also recorded a contradiction on **OQ-066**, which stays `OPEN`.*
