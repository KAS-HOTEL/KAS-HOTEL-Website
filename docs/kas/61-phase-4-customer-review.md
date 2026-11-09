# 61 — Customer 360 & Review Model

**Phase:** 4 — Detailed Design & Contract Freeze
**Status:** Authoritative
**Last updated:** 2026-08-14

---

## 1. Customer 360

**CONFIRMED** — One customer may hold OTA reservations **and** direct reservations, across multiple
properties and multiple stays. These belong to **one** customer profile where identity matching is
sufficiently reliable.

```
Nguyen Van A
  #001  BOOKING_COM         KAS Milestone    Mar 2026   COMPLETED
  #002  DIRECT / WEBSITE    KAS Sonata       Jun 2026   COMPLETED
  #003  DIRECT / FACEBOOK   KAS Milestone    Sep 2026   CONFIRMED
  firstDistributionChannel: BOOKING_COM   ← write-once; makes OTA→direct conversion measurable
```

**CONFIRMED** — Distribution channel **never** creates a separate customer identity.

### 1.1 Profile composition

| Group | Contents |
|---|---|
| **Identity** | `id`, verified email (primary), phone (E.164), full name, country |
| **Attribution** | `firstDistributionChannel`, `firstLeadSource` — **write-once, never overwritten** |
| **History** | All reservations, all channels, all properties · direct inquiries with source and outcome |
| **Communication** | Email deliveries, contact log entries, notification history |
| **Consent** | **Per purpose**, timestamped, revocable (§3) |
| **Preferences** | Language, display currency, preferred contact channel and time |
| **Review history** | Submitted reviews and their moderation state |
| **Internal** | Staff notes, merge history, identity-match confidence — **never guest-visible** |

---

## 2. Identity matching

**CONFIRMED** — Confidence tiers. **Never automatically merge a weak match.**

| Signal | Confidence | Action |
|---|---|---|
| Verified email exact match | **HIGH** | Auto-link |
| Phone exact (normalised E.164) **+** name similarity above threshold | **MEDIUM** | Auto-link, **flagged for review** |
| Name + partial contact, or unverified email | **LOW** | **Surface as a merge candidate. Never auto-merge** |
| OTA masked alias as the only signal | **NONE** | Do not match (§2.2) |

**PROPOSED — why the line is drawn here.** A wrong merge exposes one guest's stay history, contact
details and review history to another person. That is a **privacy incident**, not a data-quality
issue. The asymmetry justifies conservatism: a missed link costs a marketing opportunity; a wrong link
costs trust and may be reportable.

### 2.1 Merge mechanics

| Rule | Detail |
|---|---|
| Review required | Below HIGH, a human confirms via **Customers → Merge candidates** |
| Permission | `customer.merge`, GLOBAL scope |
| Reversible | `merged_into_id` retained; merges are undoable |
| Audited | Actor, both records, confidence, timestamp, reason |
| Attribution | The **earliest** `firstDistributionChannel` / `firstLeadSource` survives |
| Consent | **The most restrictive consent wins.** Merging never grants a permission neither record held |

**PROPOSED** — That last rule matters: merging an OTA guest with no marketing consent into a direct
customer who opted in must **not** produce a marketable record for the OTA-sourced contact details.

### 2.2 The OTA identity constraint

**PROPOSED — a real limit that must not be assumed away.**

OTAs commonly supply **masked or aliased contact details** rather than the guest's real address
(Booking.com's `@guest.booking.com` virtual addresses are the common case), and those aliases often
**stop routing after the stay window closes**. Phone numbers may be similarly masked.

Consequences:

- Identity matching on OTA-supplied email will frequently **fail**, so an OTA guest may not link to an
  existing customer even when they are the same person.
- A post-stay review invitation to a masked alias **may never arrive**.
- The reliable capture point for a real address is **at check-in, at the property, with consent** — an
  operational process, not a system feature.

**PROPOSED** — The system stores `contactIsProxy: boolean` on reservations where the address matches a
known OTA alias pattern, so downstream logic can distinguish "not contacted" from "uncontactable".
→ **OQ-077**

---

## 3. Consent

**CONFIRMED** — Transactional and marketing communication are separate. **OTA-supplied contact data is
not automatically usable for marketing.**

```
customer_consent (customer_id, purpose, granted, granted_at, source, revoked_at)
purpose ∈ { TRANSACTIONAL, MARKETING }
```

| | **Transactional / Stay** | **Marketing** |
|---|---|---|
| Purpose | Operating the stay the guest has | Promoting future stays |
| Examples | Confirmation, pre-arrival, check-in, check-out, invoice, service messages, **review invitation** | Offers, campaigns, newsletters, "book direct next time" |
| Legal basis | Performance of the stay | **Consent** |
| Direct guest | Permitted — operationally necessary | **Explicit opt-in, unticked by default** |
| **OTA guest** | Permitted **where contact details work** (§2.2) | **Never assumed.** Requires explicit consent **and** OTA-contract review (legal L3) |
| Revocable | Unsubscribe does not stop transactional mail | One-click unsubscribe |

**PROPOSED — three rules:**

1. **Consent is per purpose, never a single boolean.** A guest who accepts booking emails has not
   accepted marketing.
2. **Consent records its source** — web form, check-in, phone — so its basis is auditable.
3. **A reservation never implies marketing consent**, on any channel.

---

## 4. Privacy controls

| Control | Implementation | Status |
|---|---|---|
| Access audit | Every staff read of a customer record is logged | ✔ |
| Bulk export | `SUPER_ADMIN` only, audited **and alerted** | ✔ |
| Data export (guest) | `POST /me/data-export` | **Blocked on legal L1** |
| Erasure | Anonymise personal fields; **retain the commercial record** | **Blocked on legal L1** |
| Retention periods | Customer, reservation, audit, financial | **Blocked on OQ-027** |
| No personal data in URLs, logs, analytics | Enforced by convention + review | ✔ |
| Identity documents | **Not collected.** Recommendation stands (OQ-028) | ✔ |
| Payment credentials | **Never stored.** Keeps KAS out of PCI-DSS scope | ✔ |

---

## 5. Review model

### 5.1 Eligibility

**CONFIRMED** — Eligibility depends on a **completed stay**, not on the channel.

```
canReview(reservation) =
      reservation.stayStatus == COMPLETED       ← stayStatus, never salesStatus
  AND reservation.customerId == currentUser.id
  AND no existing review for this reservation
  AND now() <= checkOut + reviewWindow          (config B16)
```

`distributionChannel` and `salesStatus` do not appear. **An OTA guest is eligible on identical terms.**

**Three enforcement layers:** the `UNIQUE` foreign key on `review.reservation_id` (a review cannot
exist without a reservation) · a service guard checking `stayStatus` and ownership · the UI offering
the action only where eligible.

**PROPOSED** — A guest who submitted a request without an account becomes eligible once they create an
account verified with the same email. An OTA guest becomes eligible if their reservation was recorded
and their identity matched (§2.2 constrains how often that succeeds).

### 5.2 Content

| Field | Rule |
|---|---|
| Overall rating | 1–5, required |
| Sub-scores | Cleanliness · Service · Location · Room · Value — optional |
| Title, body | Body required; length bounds per config |
| Photos | Optional, moderated separately |
| Language | Stored with the review; displayed labelled. **No machine translation in V1** — a mistranslated review is a credibility risk |
| Display name | First name + last initial |
| Stay date | **Month only**, never exact dates — a privacy measure |
| **Verified Stay** | Implicit: a review cannot exist without a completed reservation |

### 5.3 Moderation

```
PENDING → APPROVED → (published)
        → REJECTED  (reason recorded, guest informed)
        → HIDDEN    (post-publication, reason recorded)
```

| Action | Permission | Rule |
|---|---|---|
| Approve | `review.moderate` | Publishes; recomputes the property aggregate |
| Reject | `review.moderate` | **Reason from a fixed list**: abusive · off-topic · contains personal data · spam · not about this stay |
| Reply | `review.reply` | Public, attributed, with its own approval step |
| Hide | `review.moderate` | Post-publication, reason recorded |
| Delete | `review.delete` | **`SUPER_ADMIN` only** (OQ-024) |
| **Edit review text** | **— does not exist** | **Staff may never rewrite a guest's words** |

**PROPOSED** — A rating ≤ 2 raises an internal alert to the property team **before publication**, so
service recovery can happen. It does not delay or gate publication — that would make the review system
a marketing filter and destroy its value.

**PROPOSED** — Rejection grounds are a fixed list precisely so "unfavourable" cannot become a reason.
Over-permissive rejection turns verified reviews into marketing copy.

### 5.4 Reports and abuse

`review_report (review_id, reporter, reason, status)`. Reports queue for moderation; a review is not
auto-hidden on report count alone — that would allow brigading.

### 5.5 Aggregation

Property score recomputed on publish, hide and delete. **`aggregateRating` is emitted in structured
data only when real published reviews exist** ([24](24-seo-architecture.md) §4) — never fabricated or
padded.

### 5.6 The OTA review invitation caveat

> ⚠ **Legal L3 / OQ-078.** A review invitation to an OTA guest is, in our reading, **service
> communication** rather than marketing — it solicits feedback, not a purchase. On that basis OTA
> guests receive it.
>
> However, OTA agreements commonly restrict using channel-obtained guest data for solicitation, and the
> boundary between "please review your stay" and "book direct next time" is exactly where those
> restrictions bite. **The invitation to an OTA guest must contain no direct-booking solicitation**, or
> it converts into marketing.
>
> Contract review required before launch.

---

## 6. Customer lifecycle

| Event | Behaviour |
|---|---|
| Guest request submitted without an account | Customer record created `UNVERIFIED`, linked by email on later registration |
| Registration | `UNVERIFIED` → verification email → `ACTIVE` |
| OTA reservation recorded | Customer matched or created; `firstDistributionChannel` set if new |
| Password change | All other sessions invalidated; owner notified |
| Email change | New address verified before it takes effect; old address notified |
| Merge | Reviewed, reversible, audited; most-restrictive consent wins |
| Deletion request | Personal fields anonymised; commercial and financial records retained per **OQ-027** |

---

## 7. What the customer sees of themselves

| Visible in `/me` | Never visible |
|---|---|
| Profile, preferences, consent state | Identity-match confidence, merge history |
| Own reservations across all channels, filtered | `salesStatus`, `salesOwnerId`, `leadSource`, `distributionChannel`, `otaReference` |
| Plain-language stay status + timeline | Internal notes, contact log, SLA fields, holds |
| Own reviews and moderation state | Other customers' data, rejection deliberations |
| Payment summary (amount, date, method) | Internal reconciliation fields |
| Sales agent **first name** only | Staff directory, workload, assignment history |

---

## 8. Open items

| ID | Item | Status |
|---|---|---|
| **OQ-027 / L1** | Data protection: retention, erasure, cross-border transfer | **BLOCKING for launch** |
| **OQ-078 / L3** | OTA review-invitation permissibility | `OPEN` |
| OQ-077 | Masked OTA contact handling; real-address capture at check-in | `OPEN` |
| OQ-024 | Review moderation authority and rejection grounds | `OPEN` |
| Config B16 | Review window | `OPEN` |
| Config B17 | Review invitation timing | `OPEN` |
| OQ-040 | Guest edit window, anonymity, minimum length | `OPEN` |
| OQ-028 | Identity documents — recommendation: keep out of scope | `OPEN` |
