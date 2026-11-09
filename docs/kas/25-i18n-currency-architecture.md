# 25 — Internationalisation & Currency Architecture

**Phase:** 1.5 — Information Architecture
**Status:** Draft for approval
**Last updated:** 2026-08-14

---

## 1. Confirmed decisions

| Decision | Value |
|---|---|
| Public site languages | **Vietnamese + English** (**CONFIRMED**) |
| Currency display | **VND + USD** (**CONFIRMED**) |
| Base booking / pricing currency | **VND** (**CONFIRMED**) |
| Room pricing basis | **Per room, per night** (**CONFIRMED**) |

**PROPOSED** — Language and currency are **orthogonal**. A Vietnamese guest may want USD (comparing
against an OTA quote); an English-speaking resident may want VND. Never couple them.

---

## 2. URL strategy — evaluation and recommendation

**CONFIRMED direction** — Evaluate `/vi/…` and `/en/…` against locale negotiation, and make a
recommendation.

### 2.1 Options assessed

| Option | Example | Assessment |
|---|---|---|
| **A · Path prefix** | `/vi/hotels/…`<br>`/en/hotels/…` | Explicit and indexable; each locale has a real URL; shareable and unambiguous; simple `hreflang`; caches cleanly at the CDN. Cost: every URL carries a prefix, and a default must be chosen |
| **B · Locale negotiation only** | `/hotels/…`, content varies by `Accept-Language` or cookie | Clean URLs. **Fatal for SEO** — one URL cannot rank in two languages, `hreflang` has nothing to point at, and a shared link may show the recipient a different language than the sender saw. Also breaks CDN caching without `Vary` gymnastics |
| **C · Subdomain** | `vi.kas…`, `en.kas…` | Indexable and cleanly separated. Cost: cookie and session complexity across subdomains, separate certificates, and search engines treat them as more distinct than they are |
| **D · ccTLD** | `kas.vn`, `kas.com` | Strongest geo-signal. Disproportionate cost: multiple domains, certificates, and infrastructure for one company in one city |
| **E · Query parameter** | `/hotels?lang=vi` | Poor indexing, poor sharing, poor caching. Not seriously considered |

### 2.2 Recommendation

**PROPOSED — Option A: path prefix, with negotiation used only for the first visit.**

```
/vi/hotels/kas-milestone-premium-hotel      Vietnamese
/en/hotels/kas-milestone-premium-hotel      English
/hotels/kas-milestone-premium-hotel          → 302 to the negotiated locale
```

Rationale:

1. **SEO is a commercial requirement here.** KAS must outrank OTAs for its own property names in two
   languages. Only distinct URLs can do that.
2. **Sharing must be deterministic.** A Vietnamese guest sending a property link to an international
   colleague should not have the page silently change language.
3. **Negotiation still helps** — just not as the addressing mechanism. First-visit language detection
   is a good default; it is a bad identity.
4. **Caching.** Path-prefixed pages cache cleanly at the edge. Header-varied content does not.

**Negotiation rules (**PROPOSED**):**

```
1  Explicit choice (account preference, or cookie set by the switcher)   → always wins, permanently
2  Locale prefix already present in the URL                              → use it, and record it
3  Accept-Language header on a prefix-less URL                           → 302 to that locale
4  No signal                                                             → default locale (§3)
```

An explicit choice is **never** overridden by a header. This is the single most common i18n
frustration and it is entirely avoidable.

---

## 3. Default locale

**NEEDS CONFIRMATION — OQ-065.** Which locale serves a visitor with no signal?

| Option | Argument |
|---|---|
| **Vietnamese** | The market is Ho Chi Minh City; a large share of guests are domestic; it signals a local brand |
| **English** | The confirmed audience is "broad"; premium city hotels in HCMC serve substantial international demand; English is the safe fallback for a visitor whose language matches neither |

**PROPOSED recommendation: Vietnamese as the site default, English as `x-default`.**

The reasoning: a Vietnamese visitor with a Vietnamese browser gets Vietnamese via negotiation
regardless. The default only matters for visitors with *no* usable signal — and those are
disproportionately international, which is exactly what `x-default: en` handles. Setting the site
default to Vietnamese reinforces that KAS is a Vietnamese brand, while the `x-default` protects
international discoverability.

This is genuinely a business call, not a technical one. Documented for decision, not assumed.

---

## 4. Content localisation model

**PROPOSED** — Detail in [23-content-architecture.md](23-content-architecture.md) §8. Summary:

| Concern | Rule |
|---|---|
| Model | Locale is a **dimension** — side-table translations, never duplicated entities |
| Slugs | **Locale-independent.** One slug, both locales ([22](22-url-architecture.md) §4) |
| Path segments | English (`/hotels`, `/rooms`) as stable identifiers; all *visible* content localised |
| Media | Files shared; **alt text and captions localised** |
| Fallback | Missing translation falls back to the default and is flagged as untranslated in admin. Never an empty section |
| Publish gate | Core fields required in **both** locales before a property or room type can publish |
| Visibility | A portfolio-wide "untranslated content" report, or gaps stay invisible until a guest finds one |

### 4.1 Formatting by locale

**PROPOSED**

| Element | Vietnamese | English |
|---|---|---|
| Date | `12/09/2026` · `Thứ Sáu, 12 tháng 9` | `12 Sep 2026` · `Friday, 12 September` |
| Date range | `12/09 – 14/09/2026` | `12 – 14 Sep 2026` |
| Time | `14:00` (24h) | `14:00` (24h — kept consistent to avoid check-in/out ambiguity) |
| Number | `1.850.000` (period thousands) | `1,850,000` (comma thousands) |
| VND | `1.850.000 ₫` (symbol trailing) | `1,850,000 ₫` |
| USD | `73 $` *(pending §6.3)* | `$73` |
| Nights | `2 đêm` | `2 nights` |
| Guests | `2 người lớn, 1 trẻ em` | `2 adults, 1 child` |

**PROPOSED** — All timestamps stored in UTC; all *stay dates* are property-local calendar dates in
**Asia/Ho_Chi_Minh (UTC+7)** ([15](15-inventory-rules.md) §3). A guest booking from London must see
check-in dates in the hotel's calendar, never converted to their own timezone — this is a classic and
damaging booking bug.

### 4.2 Typography constraint

**PROPOSED** — Vietnamese uses stacked diacritics (ế, ộ, ữ, ằ) which increase line height needs and
break many display typefaces. Requirements:

- Every candidate typeface tested with real Vietnamese strings before selection
- Line height set for the Vietnamese ascender/descender range, then applied to both locales for
  consistency
- No ALL CAPS in navigation or headings — it degrades diacritic legibility
- Text must reflow gracefully: Vietnamese runs roughly 10–20% longer than English in UI labels, so no
  fixed-width buttons or single-line assumptions

---

## 5. Admin console language

**PROPOSED** — **One language in V1.**

| Consideration | Assessment |
|---|---|
| Audience | Perhaps 5–15 staff |
| String surface | Larger than the public site — forms, tables, validation, help, settings |
| Cost of localising | Doubles translation and QA effort for a small internal audience |
| Better use of that effort | Vietnamese quality on guest-facing content |

**Recommendation:** Vietnamese if the operating team is Vietnamese-speaking; English if mixed.
**NEEDS CONFIRMATION — OQ-057.**

**Two hard exceptions**, regardless of the console's language:

1. **Guest-facing content is always edited in both locales**, with an explicit untranslated indicator
   and side-by-side editing.
2. **Guest-facing email and notification templates are always bilingual**, with preview in both.

The console's *chrome* is single-language; the *content it produces* is always bilingual.

---

## 6. Currency architecture

### 6.1 The model

**CONFIRMED** — VND is the base booking and pricing currency. USD is a display currency.

**PROPOSED** — This is a **display-layer conversion**, not a second price list:

```
Stored          basePriceMinor = 1850000, currency = VND       ← the only price that exists
                ↓
Display (VND)   1.850.000 ₫                                     exact
Display (USD)   ≈ $73                                           indicative, converted at render
                ↓
Booking         price snapshot frozen in VND at request time    ← always VND
```

**PROPOSED — three rules that must never be broken:**

1. **Only one price exists per room type per night, and it is in VND.** There is no USD price list.
2. **USD is always marked as indicative** and never presented as an amount payable.
3. **The booking price snapshot, the estimate, the sales quote, and every email amount are in VND.**
   USD may appear alongside as a courtesy, never alone.

**CONFIRMED direction** — Do not create separate booking prices unless business rules later require it.
The architecture honours this: adding a genuine USD rate later would mean adding a currency-scoped
rate row, which the pricing layering already permits ([13](13-database-domain-overview.md) §4).

> **Phase 3 clarification (D-33).** Central Rate Management introduces a `channel_scope` dimension so
> the domain is *capable* of different rates per distribution channel. This does **not** change the
> currency model: **every rate, on every channel, is still stored and quoted in VND.** `channel_scope`
> varies the *amount*, never the *currency*. USD remains an indicative display conversion that
> disappears at the commitment boundary. See [50-phase-3-amendments.md](50-phase-3-amendments.md) §6.

### 6.2 Zero-decimal handling

**PROPOSED** — **VND is a zero-decimal currency.** 1 VND = 1 minor unit.

A generic "amount ÷ 100" assumption — the default in most payment and money libraries — produces
prices **100× wrong**. This must be handled by an explicit per-currency exponent from the first line
of code, and it must appear in the test suite:

```
VND  exponent 0     1850000 minor  →  1.850.000 ₫
USD  exponent 2         7300 minor  →  $73.00
```

### 6.3 Where currency appears

**PROPOSED**

| Surface | VND | USD |
|---|:--:|:--:|
| Room type price | ✔ primary | ≈ secondary, smaller |
| Property from-price | ✔ primary | ≈ secondary |
| Search results | ✔ primary | ≈ secondary |
| Your Stay line items | ✔ primary | ≈ total only |
| Your Stay estimated total | ✔ primary | ≈ with disclaimer |
| Booking request confirmation | ✔ **only** | ✖ |
| All emails | ✔ **only** | ✖ |
| Sales quote / admin | ✔ **only** | ≈ reference in admin only |
| Structured data / `Offer.price` | ✔ **only** | ✖ |
| Analytics and reporting | ✔ **only** | ✖ |

**PROPOSED** — USD disappears entirely once the guest crosses into commitment. Showing an indicative
USD figure on a confirmation would create a price the guest believes they agreed to but which KAS
never quoted. The conversion is a *browsing aid*, and it stops at the browsing boundary.

### 6.4 Conversion mechanics

**NEEDS CONFIRMATION — OQ-052.** Five unanswered mechanics:

| Question | Recommendation (**PROPOSED**) |
|---|---|
| **Rate source** | A single reputable published reference rate (e.g. Vietcombank or a central-bank-derived feed), fetched server-side. Never a client-side call — it would be inconsistent between guests and uncacheable |
| **Refresh frequency** | Once daily. A hotel rate does not need intraday FX, and a price that changes while a guest reads the page destroys trust |
| **Rounding** | Round to the nearest whole dollar and prefix `≈`. False precision (`$72.94`) implies a payable amount |
| **Disclaimer** | Persistent, adjacent to the figure: *"Approximate. All bookings are confirmed and settled in VND."* |
| **Failure behaviour** | If the rate is stale or unavailable, **show VND only**. Never fall back to a hard-coded rate — a stale hard-coded rate is worse than no conversion |

### 6.5 Currency selection UX

**PROPOSED**

- A switch in the header utility cluster and the mobile menu: `₫ VND` · `$ USD`
- Default: **VND** for all guests, regardless of language. VND is what KAS charges; showing it first
  is honest and matches the confirmed base currency
- Explicit choice persists in a cookie and, when signed in, on the account
- **Currency is never in the URL** ([22](22-url-architecture.md) §6)
- Switching currency never changes anything except the formatted numbers — no page reload, no
  navigation, no loss of Your Stay
- The switch is deliberately quiet, near the language switch, not a prominent control

**PROPOSED** — Deliberately **not** doing IP-based currency detection. Geolocation guessing is
frequently wrong (VPNs, travellers, expatriates), it surprises users, and the honest default for a
Vietnamese hotel group is its own currency.

### 6.6 Future currencies

**FUTURE** — The model extends without restructuring: additional display currencies are additional
exponent-aware conversions over the same VND base. If KAS ever needs to genuinely *quote* in another
currency, that is a different and much larger change — a currency-scoped rate table, currency on the
booking, and reconciliation rules. The architecture permits it; nothing in V1 assumes it.

---

## 7. Notification and email localisation

**PROPOSED**

| Rule | Detail |
|---|---|
| Language selection | The locale the guest used when submitting the request, stored on the booking. Their later account preference overrides it |
| Templates | Every template exists in both locales, versioned, previewable, test-sendable |
| Fallback | If a template is missing in the guest's locale, send the default locale and raise an **admin alert** — a silently untranslated confirmation email is a visible quality failure |
| Amounts | **VND only**, always |
| Dates | Formatted for the recipient's locale, in property-local time |
| Subject lines | Localised, and tested for length in both — Vietnamese subjects run longer |
| Sender name | Consistent across locales |

---

## 8. Search and discovery in two languages

**PROPOSED**

| Concern | Approach |
|---|---|
| Site search | PostgreSQL full-text with per-locale configuration, plus **unaccented matching** — a guest typing `khach san` without diacritics must match `khách sạn` |
| Landmark names | Stored in both locales (`Chợ Bến Thành` / `Ben Thanh Market`) and searchable in either |
| District names | Bilingual (`Quận 1` / `District 1`), with the slug in English |
| Property names | Identical in both locales — proper nouns |
| Reviews | Displayed in their original language with the language labelled. **No machine translation in V1** |

---

## 9. Open questions raised here

| ID | Question |
|---|---|
| **OQ-052** | USD conversion: rate source, refresh, rounding, disclaimer, failure behaviour |
| **OQ-057** | Admin console language |
| **OQ-061** | Vietnamese label set requires native copywriter review (see [20](20-customer-navigation.md) §7) |
| **OQ-064** | `x-default` locale target |
| **OQ-065** | Site default locale when no signal is present |
