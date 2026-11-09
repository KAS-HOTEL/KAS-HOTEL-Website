# PHASE 7.5F — STEP 16A — OQ-171 SNAPSHOT IMPLEMENTATION

**Date:** 2026-08-27
**Status:** ✅ **COMPLETE.** The four snapshot obligations frozen by doc
[125](125-phase-7-5f-step-16a-4-oq171-contract-amendment.md) §12 are implemented, tested and verified.

**Gates:** backend **155 unit + 359 integration = 514**, `BUILD SUCCESS`, 0 failures, 0 errors,
0 skipped · **no migration** (28, latest V26) · database unpolluted · `git diff --check` clean.

**Scope:** obligations 1–4 only. **Obligation 5 — writing `reservation_change.before_state` — belongs
to the modification flow and was deliberately not touched.**

---

## 1. What was implemented

| # | Doc 125 | Change |
|---|---|---|
| 1 | §4–§6 | `"version": 1` — the snapshot's **revision number** |
| 2 | §7.2 | `propertyId` + `propertyName`, the name in the **request's locale** |
| 3 | §8 | `appliedRuleIds` — ordered distinct union, `[]` when no rule applied |
| 4 | §9 | `reservation_line.nightly_price_minor` written **only** when a line's nights share one rate |

The emitted field order matches doc 125 §11 exactly, top level and line level.

### 1.1 `version` — and how it is kept apart from `reservation.version`

```java
private static final int SNAPSHOT_VERSION = 1;
...
root.put("version", SNAPSHOT_VERSION);
```

A private constant, not a column read. **`reservation.version` is neither read nor written by the
reservation module** — a grep over the whole module returns nothing, and the test asserts the snapshot
says `"version":1` while `reservation.version` is still `0`. Had the two been the same field, that
assertion could not pass.

### 1.2 `propertyId` and `propertyName`

`propertyId` was already in hand — S1 resolves it through `bookablePropertyId(slug)`. The **name** was
not: `PricedRequest` does not carry it, and `property` has **no name column**; names live in
`property_translation`, one row per locale.

New: `PublicAllocationRepository.bookablePropertyName(slug, locale)` — an **inner join** at the
requested locale, the same mechanism `PublishedRateRepository.names` already uses for the room-type
name that becomes `room_type_name_snapshot`. **No `COALESCE`, no fallback**, so a Vietnamese request
cannot silently receive the English name. The `BOOKABLE` predicate is repeated deliberately: S1 must
not acquire the name through a second, subtly different visibility rule than the one that admitted the
property.

**Call order matters, and is deliberate.** The name is read **after** `priceRequest`, not before. An
unsupported locale (`locale=fr`) is already refused by `priceRequest`, because no room type has a name
in it; reading the property name first would have converted that existing **422** into a new **404**.
Placing it after preserves every existing status code.

### 1.3 `appliedRuleIds`

```java
return priced.lines().stream()
        .flatMap(line -> line.nights().stream())
        .map(ResolvedRate::ruleId)
        .filter(Objects::nonNull)      // a base-rate night contributes nothing
        .map(UUID::toString)           // canonical lowercase
        .distinct()
        .sorted()                      // ascending by that string
        .toList();
```

**Ordering is the owner's confirmed rule** — ascending by the canonical lowercase UUID string. It is
deliberately **not** `UUID.compareTo`, which orders by signed 64-bit halves and disagrees with text
order whenever the high bit differs. Sorting the strings makes the two impossible to confuse.

The array is written unconditionally, so a base-rate-only stay stores `"appliedRuleIds":[]` — present
and explicit. A reader can tell *"no rule applied"* from *"this snapshot predates the field"*.

### 1.4 `nightly_price_minor`

```java
long first = nights.get(0).amountMinor();
return nights.stream().allMatch(rate -> rate.amountMinor() == first) ? first : null;
```

`allMatch`, not `findFirst`, not `min`, not an average. One differing night makes the whole line NULL.
The value is the **per-room** nightly rate — `quantity` is deliberately not applied, matching what the
column means. `insertLine(...)` gained one parameter and now writes the column; nothing else about the
insert changed.

---

## 2. Tests — +8, all green

`ReservationRequestIT` **39 → 47**.

| Test | Proves |
|---|---|
| `snapshotCarriesRevisionAndPropertyIdentity` | `"version":1`; `reservation.version` still `0`; `propertyId`; `propertyName` |
| `snapshotPropertyNameFollowsRequestLocale` | Distinct `en`/`vi` names; `?locale=vi` stores the Vietnamese one and **not** the English one, and vice versa |
| `appliedRuleIdsAreDistinct` | One rule pricing both nights appears **twice** in `nights[]` and **once** in `appliedRuleIds` |
| `appliedRuleIdsAreOrderedByUuidString` | Two rules, two ids, sorted by canonical lowercase string |
| `appliedRuleIdsAreEmptyWhenNoRuleApplied` | `"appliedRuleIds":[]`, and no `ruleId` anywhere |
| `uniformNightsPopulateTheNightlyScalar` | Uniform nights → the rate is stored |
| `varyingNightsLeaveTheNightlyScalarNull` | Varying nights → **NULL**, while `nights[]` still records both rates and `line_total_minor` is their sum |
| `ruleIdentityStaysOutOfThePublicResponse` | The 201 body carries no `appliedRuleIds`, `ruleId`, rule name, `priceSnapshot` or `propertyId` |

`priceSnapshotIsWritten` was updated: its three assertions that the OQ-171 fields must be **absent**
now contradicted the frozen contract. `propertySlug` is still asserted absent — doc 125 §7.2 admits
`propertyId` and `propertyName` and nothing further.

Two fixture helpers were added: `reservationLineText(reference, roomTypeId, column)` and
`setPropertyName(propertyId, locale, name)` — the existing `setPropertyNames` writes the same name to
both locales, which cannot prove which locale was snapshotted.

### 2.1 Two test bugs of mine, and what they revealed

Both first runs failed, and **both were my tests, not the implementation.**

A rate rule's date range is **inclusive at both ends** — `date_from <= :on AND date_to >= :on`
(`PublishedRateRepository`:66-67). I had written `CHECK_IN → CHECK_IN.plusDays(1)` meaning *"the first
night only"*; it actually covered both charged nights. Consequences:

- `varyingNightsLeaveTheNightlyScalarNull` saw two **identical** nights, so the scalar was correctly
  populated with `1750000` and my `isNull()` assertion failed. **The implementation was right.**
- `appliedRuleIdsAreOrderedByUuidString` had two equal-priority rules overlapping on one night — a
  **`RATE_RULE_TIE`**, which is a configuration error, so the request was refused and no snapshot
  existed to parse. **The tie guard did exactly what Step 13 froze it to do.**

Both rules are now single-day ranges, and the comments record why.

---

## 3. Adversarial audit

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Could a UUID appear twice in `appliedRuleIds`? | **No** | `.distinct()` over canonical strings; `appliedRuleIdsAreDistinct` |
| 2 | Could ordering vary between executions? | **No** | `.sorted()` natural String order over a deterministic List→List stream |
| 3 | Could locale fallback change `propertyName`? | **No** | Inner join, no `COALESCE`, no `LEFT JOIN`; the vi/en test |
| 4 | Could varying prices populate the scalar? | **No** | `allMatch`; `varyingNightsLeaveTheNightlyScalarNull` |
| 5 | Could a base-rate night serialise as an id? | **No** | `.filter(Objects::nonNull)` precedes `.map`; the `[]` test |
| 6 | Could internal rule ids leak publicly? | **No** | `RequestReceiptView` has six fields, none of them these; `PublicResponseDenylistTest` green; `ruleIdentityStaysOutOfThePublicResponse` |
| 7 | Could `snapshot.version` use `reservation.version`? | **No** | Private constant; module-wide grep finds no read or write; the test pins `1` vs `0` |
| 8 | Could this affect idempotency? | **No** | `RequestFingerprint` and `IdempotencyRepository` untouched; `RequestReceiptView` unchanged, so the stored response is unchanged; the new read takes no row lock and precedes no lock it could reorder |
| 9 | Could this affect `direct_committed`? | **No** | `commitDirect` untouched |
| 10 | Could this affect hold uniqueness? | **No** | `placeRequestHolds` and V26's index untouched |
| 11 | Could this require a migration? | **No** | All new fields are `jsonb` content; `nightly_price_minor` exists, is nullable, and its CHECK admits NULL |
| 12 | Could an unrelated OQ have been resolved? | **No** — see §3.1 | |

### 3.1 One behaviour I introduced that the contract does not name

If `bookablePropertyName` finds no row, S1 throws the **same `404` `NotFoundException.outOfScope("Property")`**
it already throws for a property that is not bookable.

**This state should be unreachable.** `PropertyCompletenessChecker` requires *"name (both locales)"*
before a property may be submitted, all 8 properties carry both `vi` and `en`, and `priceRequest` has
already refused any locale the property's room types cannot be presented in. But `propertyName` is a
**required** field of the frozen shape, so silently omitting it was not an option, and the throw had to
be something.

404 was chosen because it is what S1 already answers when a property is not usable, and because doc 85
§6.3 makes an unusable property indistinguishable from one that does not exist. **It is not a new error
code and not a commercial rule** — but the contract does not name it, so it is recorded here rather
than buried. **No test enshrines it**, deliberately: writing one would freeze a choice the owner has
not made.

This does **not** resolve **OQ-159** (the public *list*'s inner join hiding a hotel). That endpoint was
not touched.

---

## 4. Verification

| | |
|---|---|
| Backend | **155 unit + 359 integration = 514** · `BUILD SUCCESS` · 0 failures, 0 errors, 0 skipped |
| Migrations | **28**, latest **V26**, 0 failed · **none added, none edited** |
| Database | `reservation` · `reservation_line` · `inventory_hold` · idempotency · `reservation_change` · `customer` · `room_type` all **0**; `property` **8**; `partner` **1** |
| `git diff --check` | clean |
| Architecture guards | all pass **unchanged** — none narrowed |

*(Note: summing the surefire XML files reads 156. `DevPartnerAccountProvisioning` is gated behind
`@EnabledIfEnvironmentVariable("KAS_DEV_PARTNER_PASSWORD")` and did not run; its report is from
2026-08-19. The run executed **155**.)*

## 5. Files changed

**Production — 4:** `S1Transaction` · `ReservationRepository` · `PublicAllocationRepository` ·
`reservation/package-info.java`
**Tests — 2:** `ReservationRequestIT` (+8) · `SecurityFixtures` (2 helpers)
**Migrations — 0 · Frontend — 0 · Seed — 0 · Endpoints — 0**

## 6. Not done, deliberately

Doc 125 §12 **obligation 5** — populating `reservation_change.before_state` — is the modification
flow's work and is **not owed by Step 16A**. No notification, no rate limiting, no B1, no S7, no S10,
no **OQ-172**. **OQ-172, OQ-162, OQ-163 and OQ-066 remain `OPEN`; OQ-161 remains `DEFERRED`.**
