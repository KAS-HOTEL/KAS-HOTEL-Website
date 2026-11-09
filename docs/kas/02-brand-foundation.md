# 02 — Brand Foundation

**Status of this document:** Phase 1 draft for approval
**Last updated:** 2026-08-14

---

## 1. Brand facts

| Attribute | Value | Status |
|---|---|---|
| Brand name | **KAS** | **CONFIRMED** |
| Founded | **2019** | **CONFIRMED** |
| First property | **KAS Passion Boutique Hotel** | **CONFIRMED** |
| Portfolio | **8 hotels** | **CONFIRMED** |
| Market | **Ho Chi Minh City, Vietnam** | **CONFIRMED** |
| Positioning | **Premium / high-end hospitality** | **CONFIRMED** |
| Target audience | **Broad / all customers** | **CONFIRMED** |
| Primary brand value | **Customer service / hospitality** | **CONFIRMED** |
| Candidate slogan | *"KAS — Where Hospitality Feels Personal."* | **PROPOSED — NOT APPROVED** |
| Meaning / origin of "KAS" | — | **NEEDS CONFIRMATION** (OQ-001) |
| Ninth property ("KAS No. 9") | Referenced as a "Coming Soon" homepage section | **NEEDS CONFIRMATION** (OQ-002) |

> **Slogan governance.** *"KAS — Where Hospitality Feels Personal."* is a **proposal**. It must not
> appear in designs, code, metadata, email templates, or any deliverable presented as final until the
> product owner approves it in writing. Where a tagline is needed in Phase 2 mock-ups, it must be
> visibly marked as placeholder copy.

## 2. Positioning

**PROPOSED** — Positioning statement for approval:

> For travellers to Ho Chi Minh City who want a stay that feels considered rather than processed,
> KAS is a group of eight individually-characterful hotels where the defining quality is the people.
> Unlike international chains that deliver consistency through standardisation, KAS delivers it
> through attention.

### 2.1 What "premium" means for KAS

**PROPOSED** — Premium here is not luxury-by-price-tag. It is:

| Premium means | Premium does not mean |
|---|---|
| Considered detail and finish | Gold, marble, and ornament as shorthand |
| Staff who remember you | A concierge desk nobody uses |
| Photography that shows real rooms honestly | Wide-angle distortion and stock imagery |
| Clear, calm, uncluttered digital experience | Dense promotional urgency banners |
| A response you can rely on | An instant confirmation with no human behind it |

### 2.2 Competitive frame

**PROPOSED** — KAS competes on three fronts simultaneously, and the website must answer each:

1. **Against OTAs (Booking.com, Agoda, Expedia).** They win on inventory breadth and instant
   confirmation. KAS wins on story, direct relationship, and service. The site must give a guest a
   reason to leave the OTA tab open and book here anyway.
2. **Against international chains (Marriott, Accor, Hyatt properties in HCMC).** They win on loyalty
   programmes and brand recognition. KAS wins on individuality and personal service.
3. **Against local boutique independents.** They win on charm. KAS wins on portfolio breadth,
   consistency of service standard, and a choice of eight neighbourhoods.

## 3. Brand pillars

**PROPOSED** — Four pillars. Every page of the site should express at least one; the homepage should
express all four.

1. **Hospitality as the product.** The people are the differentiator. Service is not a section on the
   about page; it is the thesis.
2. **Eight characters, one standard.** A portfolio of distinct properties held to a common standard
   of care.
3. **Rooted in Ho Chi Minh City.** Not a generic hotel that happens to be in Vietnam. Neighbourhood,
   proximity, and local knowledge are part of the offer.
4. **Considered, not loud.** Restraint, whitespace, calm. The brand does not shout.

## 4. The positive framing rule (hard requirement)

**CONFIRMED** — Hotel-facing descriptions emphasise positive strengths. The following framings are
**prohibited** anywhere in guest-facing content:

- small
- limited
- lacking
- inferior
- weaker

…and, by extension of the same intent, any comparative construction that positions one KAS property
as *less than* another (e.g. "unlike our larger properties", "a more basic option", "budget
alternative", "if Milestone is full").

### 4.1 How to describe honestly without negative framing

**PROPOSED** — Replacement patterns. Reframe on *what the property is for*, not on what it lacks.

| Instead of | Write |
|---|---|
| "Small rooms" | "Intimately scaled rooms designed around rest" |
| "A smaller property" | "An intimate house of *N* rooms" |
| "Limited amenities" | "Focused on the essentials, done properly" |
| "No restaurant on site" | "Steps from *[named neighbourhood dining]*" |
| "Basic room" | "Essential Room — the calm, uncomplicated stay" |
| "Older building" | "A heritage address with original character" |
| "Budget option" | "Excellent value for a central stay" |

### 4.2 Enforcement

**PROPOSED** — This is enforced in three places, not just in a style guide:

1. **Editorial** — a content checklist in the admin publishing flow.
2. **System** — a configurable banned-phrase lint on guest-facing rich-text fields in the admin
   console, producing a **warning** (not a hard block — human judgement must win). Banned terms are
   editable in Settings, in both Vietnamese and English.
3. **Review** — every property description is reviewed against the rule before publish.

> **Important qualifier.** This rule governs *marketing framing*. It must never be used to conceal
> **material facts** a guest needs — accessibility limitations, absence of a lift, construction
> nearby, non-refundable terms, or genuine constraints on occupancy. Factual disclosures are stated
> plainly in the appropriate factual section (Amenities, Policies, Good to Know). Positive framing
> applies to storytelling; it does not license misleading a guest. Flagged as OQ-003 for product
> owner sign-off.

## 5. Flagship strategy

**CONFIRMED** — **KAS Milestone Premium Hotel** is the flagship property and receives strong emphasis.

**CONFIRMED** — Milestone's stated strengths:

- Large restaurant
- Rooftop bar
- Gym
- Premium rooms
- Rooftop experience
- High-end hospitality

**PROPOSED** — Flagship treatment across the site:

| Surface | Treatment |
|---|---|
| Homepage | A dedicated full-bleed editorial section (section 5 of the homepage structure), not a card in a grid |
| Hotels index | Featured position with a larger tile and distinct visual weight |
| Hotel detail | Extended template with rooftop, restaurant, and gym as first-class experience blocks |
| Imagery | Highest photography budget priority; rooftop at dusk is the signature image |
| Search results | Eligible for a "Flagship" badge (**PROPOSED**, needs approval — must not read as a paid ad) |

**PROPOSED** — Critically: flagship emphasis is additive. Milestone gets *more*; the other seven get
*their own* — never *less*. The seven non-flagship properties must each have a genuine editorial
angle, not a truncated version of the Milestone template. See
[03-property-map.md](03-property-map.md).

## 6. Voice and tone

**PROPOSED**

**Voice** (constant): warm, precise, unhurried, quietly confident, human.
**Tone** (varies by context):

| Context | Tone |
|---|---|
| Homepage / storytelling | Editorial, evocative, generous with whitespace and short paragraphs |
| Property and room descriptions | Concrete and sensory. Name real things: the street, the light, the bed |
| Booking flow | Plain, calm, reassuring. Short sentences. No urgency pressure |
| Booking request confirmation | Warm and explicit about what happens next and when |
| Policies and factual content | Direct and unambiguous. Clarity is a form of respect |
| Error states | Apologise once, explain plainly, give the next action |
| Sales and lifecycle email | Signed by a person, not by "The KAS Team" where possible |

### 6.1 Writing rules

**PROPOSED**

- Write to one guest, as "you". Never "our valued customers".
- No false urgency. No countdown timers, no "3 people are looking at this room", no invented scarcity.
  Real scarcity ("2 rooms available at this rate") may be stated **only when it is literally true from
  inventory**.
- No exclamation marks in body copy.
- No untranslated marketing English inside Vietnamese copy where a natural Vietnamese phrase exists.
- Numbers are specific: "eight hotels", "a 4-minute walk to Ben Thanh Market" — not "several" and
  "close to everything". (Actual distances **NEED CONFIRMATION**.)
- Never describe the booking request as a "reservation" or "confirmed booking" before it is confirmed.
  Language precision here is a legal and trust matter.

### 6.2 Terminology standard

**PROPOSED** — Guest-facing vocabulary. Engineering must use the same words in UI strings.

| Concept | Guest-facing term (EN) | Guest-facing term (VI) | Never use |
|---|---|---|---|
| Selected rooms container | **Your Stay** | *Kỳ nghỉ của bạn* (**NEEDS CONFIRMATION** — copywriter) | Cart, Basket, Trolley |
| Submitting the request | **Request This Stay** | *(TBC)* | Buy, Checkout, Pay Now |
| The submitted record | **Booking request** | *(TBC)* | Order, Reservation (before confirmation) |
| A category of room | **Room type** | *(TBC)* | SKU, Product |
| Count of rooms available | **Rooms available** | *(TBC)* | Stock, Inventory |
| Confirmed stay | **Booking** / **Reservation** | *(TBC)* | Order |
| Discount code | **Offer** / **Voucher** | *(TBC)* | Coupon code, Promo |

**CONFIRMED** — "Your Stay" replaces "Shopping Cart" as the customer-facing concept.

## 7. Visual direction

**PROPOSED** — Direction only. Final visual identity is a Phase 2 design deliverable and requires
the product owner's existing brand assets (OQ-004).

### 7.1 Principles

- **Photography leads.** Layouts are built around large, real, well-lit photography of the actual
  properties. Imagery is not decoration; it is the primary content.
- **Editorial layout.** Asymmetry, generous margins, and large type. Full-bleed image sections
  alternating with quiet text sections. Think hospitality magazine, not booking portal.
- **Restrained palette.** A neutral, warm base (off-white, warm stone, deep charcoal) with a single
  accent drawn from KAS's existing identity. Colour is used sparingly and deliberately.
- **Two-tier typography.** A refined display face for headlines and editorial moments; a highly
  legible sans for UI, forms, tables, and dense data. Both must fully support **Vietnamese
  diacritics** — this eliminates a large share of otherwise attractive display faces and must be
  tested with strings such as *"Nghỉ dưỡng tại Thành phố Hồ Chí Minh"* before selection.
- **Motion is subtle.** Slow fades, gentle parallax at most. Respect `prefers-reduced-motion`.
- **Whitespace is not wasted space.** Density is the visual signature of budget travel sites.

### 7.2 What the site must not look like

**CONFIRMED** — Explicitly rejected:

- A generic Bootstrap template
- A cheap hotel booking website
- A Booking.com clone
- A dashboard-first application

**PROPOSED** — Practical translation of that rejection: no default component-library look, no
promotional ribbon banners, no red urgency badges, no card grid where every property looks identical,
no star-rating-and-review-count chip as the primary property identity, no "Deal of the day" module.

### 7.3 Admin console visual direction

**PROPOSED** — The admin console is a different design problem and should not be forced into the
editorial brand. It should be efficient, dense, keyboard-friendly, and legible — sharing the brand's
colour and type tokens but optimised for operator speed. Operators will use it for hours a day.

## 8. Trust signals

**PROPOSED** — In a request-based model, trust signals do heavier work than on an instant-payment
site. The following are the approved trust devices:

| Signal | Where | Note |
|---|---|---|
| Verified Stay reviews | Property pages, homepage, room cards | Only from guests with a completed stay (**CONFIRMED**) |
| Explicit response promise | Booking flow, request confirmation, acknowledgement email | Requires an agreed SLA (OQ-013) |
| Real photography with captions | Everywhere | Honest representation of actual rooms |
| Named human contact | Request confirmation and sales email | Reinforces the personal-hospitality thesis |
| Clear policy summary at request time | Before the submit action | Cancellation, check-in/out, children, deposit |
| Precise availability count | Room type cards | Only when true |
| Physical address, phone, and map per property | Property pages, contact, footer | Local credibility |
| Business registration / tax details | Footer, policies | **NEEDS CONFIRMATION** — legal entity details (OQ-021) |

**PROPOSED** — Anti-patterns explicitly banned: fake scarcity, fabricated "X people booked today"
counters, unverifiable review scores, and best-price guarantees the group cannot honour.

## 9. Brand assets required

**NEEDS CONFIRMATION** — Blocking items for design work (OQ-004, OQ-030):

- KAS logo in vector form, plus lock-ups and clear-space rules
- Approved brand colours (hex/Pantone)
- Existing typefaces and licences
- Per-property logos or sub-marks, if any exist
- Professional photography for all 8 properties: exterior, lobby, each room type, amenities,
  Milestone rooftop/restaurant/gym, neighbourhood
- Any existing brand guideline document
- Approved Vietnamese and English brand copy, if any exists
