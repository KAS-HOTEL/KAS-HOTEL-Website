# Phase 7.5F — Step 6: Partner Property Information & Optimistic Locking

**Date:** 2026-08-19
**Status:** ✅ COMPLETE — the first write path in the frontend, and the doc 58 §2 optimistic lock is
now real rather than documented.

---

## 1. The gap that had to close first

Doc 58 §2 has required `If-Match` / `version` on MASTER updates since Phase 4, and
`ConflictException.versionConflict(...)` has existed unused since Phase 7.3. But
`UpdatePropertyRequest` carried **no version**, and `PropertyRepository.updateDetails` was a blind
`UPDATE … SET version = version + 1 WHERE id = ?`.

The consequence was not theoretical. Two partners editing the same hotel both succeeded, and the
second silently erased the first — the column that was supposed to prevent exactly that was being
incremented by the very statement that ignored it.

Building an editor on top of that would have shipped the data-loss bug to a real screen, so the lock
was closed before any form was written.

## 2. Minimum change to make `version` enforce concurrency

**No migration.** `property.version` already exists — `integer NOT NULL DEFAULT 0` — so the schema
change required was zero. What was missing was contract and query, not storage.

| Change | Why it is the minimum |
| --- | --- |
| `UpdatePropertyRequest.version` — **`@NotNull`** | Doc 58 §2 names `If-Match` **or** `version`. An *optional* version is one a caller forgets, and a caller who forgets gets exactly the blind write the field exists to prevent |
| `updateDetails(…, int expectedVersion, …)` — compare-and-set | The version predicate joins the identity **and** scope predicates in one statement. PostgreSQL holds a row lock for the duration of the `UPDATE`, so the loser matches zero rows instead of overwriting |
| `PropertyAdminView.version` | A concurrency token the caller cannot read is a check nobody can pass. Step 5.1 deliberately deferred this field until there was a writer for it |
| `PropertyInformationService` — `@Transactional` | One edit can touch `property` and `property_translation`; committing half of it would advance the version for a change that did not happen |

### 2.1 Why the body and not an `If-Match` header

Doc 58 §2 permits either. `version` is already the domain's own token and already on the wire; a
header would additionally require an `ETag` on every `GET` — a larger contract change for the same
guarantee, and one more place for the two representations to drift apart.

### 2.2 Order of checks is the security-critical part

```
1. findById(id, scope)      → absent or another partner's ⇒ 404   (doc 85 §6.3)
2. compare-and-set version  → zero rows ⇒ 409 VERSION_CONFLICT
3. names, same transaction
```

Reversed, a cross-partner `PATCH` carrying a guessed version would answer `409` — and a `409` on
another partner's property confirms that the property exists. Worse, a *correct-version* 409 versus a
*wrong-version* 409 would leak its version too. `PropertyInformationIT` asserts both a right and a
wrong guess produce the identical `404`, and that the other partner's name never appears in the body.

The compare-and-set still carries the scope in its own statement, so the repository refuses a foreign
id even when called directly, past every controller and filter.

### 2.3 A rename advances the version

Names live in `property_translation`, so a rename touches no column on `property`. Without an explicit
bump, another editor's copy would still look current and the next writer would overwrite the rename
without ever seeing a conflict. One edit is one version, whichever tables it touched.

## 3. Names became editable

`CreatePropertyRequest` accepted a `name` and wrote it to both locales. **Nothing could change it
afterwards** — `setName` existed on the repository and was called only from `create`. Yet
`PropertyCompletenessChecker` blocks submission on `name (both locales)`, so a Partner could be told
what was missing and had no way to supply it.

`UpdatePropertyRequest.names` closes that on the **existing** `PATCH /admin/properties/{id}` route —
doc 58 §8 freezes the route, not the field list, and `name` was already a property field the caller
may write. No new endpoint.

The map is keyed by locale, mirroring the response exactly, so a client can read, edit and send back
without reshaping. An absent key means "leave it", never "delete it". Unsupported locales are refused
as a field error (`names.fr`) rather than reaching `property_tr_locale_valid` and surfacing as a 500 —
and **every** bad locale is reported at once, the same courtesy `submit` extends when a property is
incomplete.

## 4. The frontend

`/partner/properties/{id}/information` — the route doc 100 §6 already reserved.

**Server-rendered, client-submitted.** Current values and the current `version` load on the server,
where the `HttpOnly` session cookies can be read. The save goes from the browser, because that is
where the CSRF cookie lives and where `lib/api` pairs it with `X-XSRF-TOKEN`. A Server Action would
post from the Next server, which holds neither — so the guard would have to be re-implemented, or far
more likely quietly skipped. Same reasoning as sign-in in Step 3.

| Concern | Treatment |
| --- | --- |
| Fields | name vi, name en, ward, district, city, phone — **exactly** what the API accepts |
| Not editable | lifecycle, flagship, sort order. A Partner publishing their own hotel by PATCHing a state is what approval exists to prevent, and the request record has no field for it |
| Version | loaded, held, sent, and **replaced from each response** — keeping the old one would make our own next save fail |
| 409 | the message plus a **reload button**: a conflict is the one error retyping cannot fix, so the action is offered rather than described |
| 404 | identical wording to absent, and **no** reload button — reloading will not make it appear |
| 400 / 422 | `ApiError.fieldErrors()` attached to the owning input, with both backend shapes (`names[vi]` from bean validation, `names.fr` from the service) folded onto the right one |
| After save | `revalidatePath('/partner', 'layout')` + `router.refresh()` — without it the list, the switcher and the overview keep serving the pre-edit copy, and the stale version they carry breaks the next save |

### 4.1 Clearing a value is not expressible — OQ-136

`PATCH` treats a null field as "leave unchanged" (`coalesce`), so the contract has no way to say
"make this empty". Rather than send `""` and quietly store a blank string where NULL is meant, the
form refuses to submit a cleared field and says so. Silently dropping the edit would be worse than
either — the Partner would watch their change disappear on reload.

The owner decision this needs: either `UpdatePropertyRequest` gains an explicit clear (a sentinel, or
`Optional<String>` semantics), or blank-means-null is adopted deliberately.

## 5. Tests

| Suite | Count | Change |
| --- | --- | --- |
| Frontend | **145** | +13 (`PropertyInformationForm.test.tsx`, plus fixture and tab updates) |
| Backend integration | **224** | +15 (`PropertyInformationIT`) |
| Backend unit | 146 | unchanged |
| **Backend total** | **370** | was 355 |

No existing test was weakened. Three existing `PATCH` call sites gained a `version` — including
`NinthPropertyE2EIT`'s cross-partner hijack attempt, which now sends a **valid** version so its 404
still proves the scope filter refused it rather than bean validation.

`PropertyInformationIT` covers: both fields and names in one request · omitted fields surviving · one
locale at a time · a rename advancing the version · stale version → 409 · a refused edit rolling back
its names too · two editors holding the same version (exactly one wins) · missing version → 400 with
`field: version` · **cross-partner 404 for both a right and a wrong version guess, with no name leak
and nothing written** · absent property → 404 · repository-level scope on the compare-and-set ·
unsupported locale → field error · every bad locale at once · blank name refused · and a rename
clearing the completeness blocker it exists to clear.

## 6. Verification

| Gate | Result |
| --- | --- |
| Frontend typecheck | **pass** — strict, no `any` |
| Frontend lint | **pass**, 0 warnings |
| Frontend tests | **145 pass** across 15 files |
| Frontend build | **pass**, 12 routes |
| `npm audit` | **0 vulnerabilities**, no dependency added |
| Backend | **370 tests**, `BUILD SUCCESS` |
| Flyway | **v23, 25 migrations validated — no new migration** |
| `git diff --check` | clean |

### 6.1 Live verification through the proxy

Run against the running backend through the Next.js proxy, authenticated as the dev Partner account.
The body was deliberately a **no-op** (`city` resent unchanged) so that verifying a write path would
not put an invented address on a real seed hotel.

| Request | Result |
| --- | --- |
| `PATCH` with no `version` | **400** · `field: version` · *"must be supplied so a concurrent edit cannot be overwritten"* |
| `PATCH` with the current version | **200** · `version` 0 → **1**; names, city, lifecycle, flagship and sort order all unchanged |
| the same (now stale) version again | **409 `VERSION_CONFLICT`** · *"Property was modified by someone else. Reload and reapply your change."* |
| `PATCH names: {"fr": …}` | **400** · `field: names.fr` · *"Supported locales are vi and en."* |
| `PATCH` an absent property id | **404** |
| `PATCH` with no `X-XSRF-TOKEN` | **403** |

The one lasting effect on the database is that this property's `version` is now 1 rather than 0. No
business field changed.

The editor page itself was loaded in the browser and rendered correctly — the six inputs seeded from
the real record (both names populated, ward/district/phone empty, city filled), and the tab strip
showing *Tổng quan* and *Thông tin* as links with the remaining five as disabled spans.

**What could not be exercised in the browser:** the form's own submit handler. This harness's browser
pane never composites, so React's client runtime stays starved and the client component never
hydrates — the same limitation recorded in doc 101 §5.2, but blocking behaviour rather than only
paint. The submit path is covered instead by 13 component tests driving a real React tree with
`user-event` (version sent and re-adopted, 409 offering a reload, 404 not offering one, field errors
attached, a cleared field refused, nothing written to storage) and by the 15 integration tests above
running against the real database.

## 7. Security

Unchanged and re-proven: cross-partner is still **404, never 403 or 409** · scope still enforced in
SQL at the repository boundary · CSRF still required on the mutation (`lib/api` attaches
`X-XSRF-TOKEN`; the browser holds the cookie) · no CORS, no `SameSite` change · no token in UI state
or web storage · no `fetch` outside `lib/api` · `partnerId` still absent from every response.

The one new capability is a write, and it is the narrowest one the contract allows: six fields, one
route, one permission (`property.manage`), and a concurrency token that must be presented.

## 8. Open questions

| # | Question | Status |
| --- | --- | --- |
| **OQ-136** | `PATCH` cannot express "clear this field" (§4.1) | **new** |
| OQ-133 | `CompletenessResult` labels are English-only | open |
| OQ-135 | `CONFIG_MISSING` reached an unauthenticated login page | open |
| carried | OQ-106 media upload · OQ-122 search · OQ-123 quote · booking API · `/me` profile · SUPER_ADMIN 2FA | open |

## 9. Recommended Step 7

> **Room types — list and detail, read-only first.**

`/admin/properties/{id}/room-types` is implemented, tested and scope-enforced (Phase 7.5B, 225 tests),
and *"at least one room type"* is the next completeness blocker after the name and address this step
just made editable. It reuses the property context, the tab shell and the table primitive that now
exist, and it is the prerequisite for inventory (Step 10) and rates (Step 11), which both address
rooms rather than properties.

Read-only first, for the same reason Step 5 preceded Step 6: room types carry a lifecycle a Partner
may never publish (doc 94), so the write path needs its own careful pass rather than being bolted on
to the read.
