/**
 * Property types, mirroring the backend records exactly.
 *
 * Hand-written and reviewed against the Java, because the repository publishes
 * no OpenAPI document (OQ-131). Every field below exists on the corresponding
 * record; nothing here is anticipated, derived from a database column, or
 * invented.
 *
 * <h2>The admin view carries exactly what the admin write accepts</h2>
 *
 * `onboarding.api.PropertyAdminView` used to return only id, slug, lifecycle,
 * flagship and sort order, while `PATCH` already accepted an address and
 * `POST` already accepted a name — so the contract could be written but not read
 * back (OQ-132). It now returns the same identity, location and contact fields
 * the write side takes, and nothing more: a field no endpoint can set would read
 * as a gap in the product rather than a gap in the API.
 *
 * The slug is still shown verbatim wherever a name is missing. It is never
 * prettified into one, because a slug is chosen for URLs and a name is chosen for
 * guests, and they coincide only by accident.
 *
 * `partnerId` is absent by design: it is on the doc 58 §9 public denylist, and
 * a caller only ever sees properties their own scope already reaches, so the
 * owning partner is implied.
 */

/**
 * Mirrors `property.PropertyLifecycleState` — the frozen doc 52 §3.1 lifecycle
 * `DRAFT → COMING_SOON → OPEN → TEMPORARILY_CLOSED → CLOSED`.
 *
 * These are the backend's own values and they travel unchanged. Any label a
 * screen shows is a presentation translation layered on top; the state itself
 * is never reinterpreted or collapsed.
 */
export const PROPERTY_LIFECYCLE_STATES = [
  'DRAFT',
  'COMING_SOON',
  'OPEN',
  'TEMPORARILY_CLOSED',
  'CLOSED',
] as const;

export type PropertyLifecycleState = (typeof PROPERTY_LIFECYCLE_STATES)[number];

/** Mirrors `onboarding.api.PropertyAdminView`. */
export interface PropertyAdminView {
  readonly id: string;
  readonly slug: string;
  /**
   * Display name per locale, e.g. `{ en: '…', vi: '…' }`.
   *
   * Always present, possibly empty — a property whose translations have not been
   * written yet genuinely has no name, and an empty map says so without a
   * placeholder standing in for one.
   */
  readonly names: Readonly<Record<string, string>>;
  /**
   * The one-line editorial hook per locale — doc 23 §3.2, ≤ 90 characters.
   *
   * Doc 52 §3.1 makes it a publish invariant. A locale appears here only when it
   * actually has one, so an empty map means "not written yet".
   */
  readonly signatureLines: Readonly<Record<string, string>>;
  /** Card and meta text per locale — doc 23 §3.2, ≤ 220 characters. */
  readonly shortDescriptions: Readonly<Record<string, string>>;
  /**
   * Assigned amenity codes, in the operator's own order.
   *
   * Codes, never names: the catalogue owns the words and `GET /admin/amenities`
   * already serves them, so a name rendered from here could disagree with the
   * catalogue the picker shows.
   */
  readonly amenityCodes: readonly string[];
  /** Find Your KAS groups assigned by a property manager. */
  readonly tripIntentCodes: readonly string[];
  /** Typed as `string` so a state added to the enum later cannot crash a page. */
  readonly lifecycleState: PropertyLifecycleState | string;
  readonly isFlagship: boolean;
  /**
   * Nullable in the schema, so Jackson's `non_null` inclusion **omits the key
   * entirely** rather than sending null. Optional here for that reason, not as a
   * defensive guess.
   */
  readonly district?: string;
  readonly ward?: string;
  /** `NOT NULL` in the schema, so always present. */
  readonly city: string;
  /** The hotel's own contact number. Omitted when unset — see `district`. */
  readonly phone?: string;
  /**
   * Doc 23 §3.3's coordinates, writable through the same `PATCH` since Step
   * 16A.45 and read back here for the same OQ-132 reason every other writable
   * field is. Omitted when the Partner has not supplied a point — never a city
   * centre standing in for one.
   */
  readonly latitude?: number;
  readonly longitude?: number;
  readonly sortOrder: number;
  /**
   * Doc 58 §2 concurrency token.
   *
   * Read it, edit, send it back on `PATCH`. A stale one is answered with 409
   * rather than overwriting whoever saved first, so this value is the only
   * reason two partners editing the same hotel do not silently erase each other.
   */
  readonly version: number;
}

/**
 * Mirrors `onboarding.api.CreatePropertyRequest`.
 *
 * Two fields, and no `partnerId`: the server takes the owner from the caller's
 * scope, so this shape cannot express "create under another partner".
 *
 * `slug` is bound by the `property_slug_format` CHECK — lower-case letters,
 * digits and hyphens, starting with a letter or digit. The console derives it
 * from the name rather than asking for it; see `slugFromName`.
 */
export interface CreatePropertyRequest {
  readonly slug: string;
  readonly name: string;
}

/**
 * Mirrors `onboarding.api.UpdatePropertyRequest`.
 *
 * Every field except `version` is optional, and an omitted one leaves the stored
 * value alone — that is what lets a Partner fill a draft in over several
 * sessions. An absent `names` locale is "leave it", never "delete it".
 */
export interface UpdatePropertyRequest {
  readonly version: number;
  readonly names?: Readonly<Record<string, string>>;
  /**
   * Blank clears, absent leaves alone — unlike `names`, which may not be blank.
   * The column is nullable and the completeness checker counts blank as missing,
   * so the two agree about what the property has.
   */
  readonly signatureLines?: Readonly<Record<string, string>>;
  readonly shortDescriptions?: Readonly<Record<string, string>>;
  readonly district?: string;
  readonly ward?: string;
  readonly city?: string;
  readonly phone?: string;
  /**
   * Bounds are the schema's own — {@code property_lat_range} / {@code _lng_range}.
   * Absent leaves the stored point alone; like every field on this route, an
   * explicit null cannot clear it.
   */
  readonly latitude?: number;
  readonly longitude?: number;
}

/**
 * Mirrors `onboarding.api.PublishPropertyRequest`.
 *
 * One field. Doc 58 §2 puts `version` on every MASTER update, and publishing is
 * the most consequential one a property has — it is what makes the hotel
 * bookable. There is no lifecycle field: publishing means `OPEN` and nothing
 * else, so the target is not the caller's to choose.
 */
export interface PublishPropertyRequest {
  readonly version: number;
}

/** Mirrors `onboarding.CompletenessResult.Section`. */
export interface CompletenessSection {
  readonly name: string;
  readonly complete: boolean;
  /** Field names, never values — the backend is explicit about that. */
  readonly missing: readonly string[];
}

/**
 * Mirrors `onboarding.CompletenessResult`.
 *
 * `complete` is not a record component: it comes from the public `isComplete()`
 * accessor, which Jackson serialises alongside the components. Confirmed by the
 * backend's own `OnboardingWorkflowIT`, which asserts `$.complete` on this
 * response — not assumed from reading the record.
 */
export interface PropertyCompleteness {
  readonly sections: readonly CompletenessSection[];
  readonly complete: boolean;
}

/**
 * Which locale's name the operator consoles prefer.
 *
 * Vietnamese first, because the console's own copy is Vietnamese and an operator
 * reading a Vietnamese screen expects the Vietnamese name. English is the
 * fallback, and doc 25 freezes those two — but the lookup below tolerates a
 * third arriving without needing this constant updated first.
 *
 * The *detail* page shows every locale explicitly, so this preference decides
 * only what a compact surface shows, never what the operator can find out.
 */
export const CONSOLE_LOCALE_PREFERENCE = ['vi', 'en'] as const;

/**
 * The two frozen locales (doc 25), labelled for an authoring surface.
 *
 * Ordered as the console prefers them, so the detail page lists Vietnamese
 * first without needing its own ordering rule.
 */
export const SUPPORTED_LOCALE_LABELS: Readonly<Record<string, string>> = {
  vi: 'Tiếng Việt (vi)',
  en: 'English (en)',
};

/**
 * The best available display name, or `null` when the property has none.
 *
 * Returning `null` matters more than it looks. `GET /admin/properties` reports
 * the names that exist, and for a property mid-onboarding that can be neither,
 * one, or both. Falling back to the slug *here* would make an unnamed property
 * indistinguishable from a named one at every call site; callers decide how to
 * present the gap, and `PropertyCompletenessChecker` is what tells the Partner
 * to fix it.
 */
export function displayName(names: Readonly<Record<string, string>>): string | null {
  for (const locale of CONSOLE_LOCALE_PREFERENCE) {
    const candidate = names[locale];
    if (candidate !== undefined && candidate.trim() !== '') {
      return candidate;
    }
  }
  // A locale outside the two frozen ones still beats showing nothing.
  const remaining = Object.values(names).find((value) => value.trim() !== '');
  return remaining ?? null;
}

/** Shown where a property has no name in any locale. */
export const UNNAMED_PROPERTY = 'Chưa đặt tên';

/**
 * The URL segment a property will be addressed by, derived from its name.
 *
 * <h2>Why the operator is not asked for it</h2>
 *
 * `POST /admin/properties` requires a slug, and it is bound by the
 * `property_slug_format` CHECK. Asking a hotelier to compose one would put the
 * console's most technical field in front of the person least served by it —
 * and this pass is removing the slug from the screens that merely *display* it,
 * so introducing a form that demands one would undo that in the same breath.
 *
 * <h2>What it does to a Vietnamese name</h2>
 *
 * Diacritics are folded by {@link searchable} — the same transform the portfolio
 * search already uses, so "Khách sạn Kas Hoà Bình" and its slug agree about what
 * the letters are. Anything left that the CHECK would reject becomes a hyphen,
 * runs of hyphens collapse, and the ends are trimmed. The leading character must
 * be a letter or digit, so a name starting with punctuation loses it.
 *
 * <p>Returns `''` for a name with nothing usable in it — a name of only
 * punctuation, say. Callers treat that as "cannot derive", not as a valid slug.
 */
export function slugFromName(name: string): string {
  return searchable(name)
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120)
    .replace(/-+$/gu, '');
}

/**
 * The same slug with a numeric suffix, for the second hotel of the same name.
 *
 * <p>`property.slug` is unique **across every partner**, not per partner, so a
 * name another organisation already used is refused by the database. The console
 * cannot see other partners' slugs — nor should it — so this only resolves
 * collisions within the caller's own estate, which is the common case. Anything
 * it misses comes back from the server as a field error on the form.
 */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (base === '' || !taken.includes(base)) {
    return base;
  }
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.includes(candidate)) {
      return candidate;
    }
  }
  return base;
}

/**
 * The label for a property in a switcher, a filter or a heading.
 *
 * <h2>Why not fall back to the slug</h2>
 *
 * Every one of these call sites used to end `?? property.slug`, so an unnamed
 * hotel appeared to the operator as `kas-passion-boutique-hotel`. The slug is a
 * routing key: it is in the URL, it addresses the public page, and it is the
 * right thing for a link — but it is not a name, and a console that prints one
 * where a name belongs teaches the operator to think in identifiers.
 *
 * <p>The fallback is a stated absence instead. Nothing can create a nameless
 * property any more — `POST /admin/properties` requires a name and writes it to
 * both locales — so this reads as "somebody has not finished this record yet",
 * which is exactly what it means.
 */
export function propertyLabel(names: Readonly<Record<string, string>>): string {
  return displayName(names) ?? UNNAMED_PROPERTY;
}

export function isKnownLifecycleState(value: string): value is PropertyLifecycleState {
  return (PROPERTY_LIFECYCLE_STATES as readonly string[]).includes(value);
}

/**
 * Vietnamese labels for the frozen states.
 *
 * Presentation only. Each is a direct translation of the backend value, not a
 * reinterpretation: `DRAFT` is "bản nháp", never "chưa kích hoạt" or "đang chờ
 * duyệt", both of which would mean something the state does not say. Every
 * surface that renders one of these also carries the raw backend value, so the
 * translation can never become the only record of what the backend said.
 */
export const LIFECYCLE_LABELS: Record<PropertyLifecycleState, string> = {
  DRAFT: 'Bản nháp',
  COMING_SOON: 'Sắp khai trương',
  OPEN: 'Đang hoạt động',
  TEMPORARILY_CLOSED: 'Tạm ngưng',
  CLOSED: 'Đã đóng',
};

/** The label for a state, falling back to the raw value for anything unknown. */
export function lifecycleLabel(state: string): string {
  return isKnownLifecycleState(state) ? LIFECYCLE_LABELS[state] : state;
}

/**
 * Badge tone per state. The text always carries the meaning; the tint only
 * corroborates it, so every badge still reads correctly in greyscale.
 */
const LIFECYCLE_TONES: Record<PropertyLifecycleState, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  COMING_SOON: 'info',
  OPEN: 'success',
  TEMPORARILY_CLOSED: 'warning',
  CLOSED: 'danger',
};

export function lifecycleTone(state: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  return isKnownLifecycleState(state) ? LIFECYCLE_TONES[state] : 'neutral';
}

/**
 * Whether guests can see the property — mirrors
 * `PropertyLifecycleState.isPubliclyVisible()`.
 *
 * Doc 52 §3.1: public when `OPEN`, `COMING_SOON` or `TEMPORARILY_CLOSED`; doc 58
 * §3.1 excludes `DRAFT` and `CLOSED` from `GET /public/properties`.
 *
 * This decides **nothing**. It adds one explanatory line to a status, so a
 * partner looking at a DRAFT hotel understands why it is not on the website.
 * Every actual visibility decision stays in the backend, which is why the
 * accompanying test pins all five states to the doc — if the enum ever changes,
 * that test fails rather than the UI quietly telling someone the wrong thing.
 */
export function isPubliclyVisible(state: string): boolean {
  return state === 'OPEN' || state === 'COMING_SOON' || state === 'TEMPORARILY_CLOSED';
}

// ----------------------------------------------------------------- portfolio

/**
 * Text made comparable: lower case, diacritics stripped.
 *
 * Vietnamese property names carry diacritics that an operator will not always
 * type — "Kas Passion" should find "KAS Passión" and "khach san" should find
 * "Khách sạn". `NFD` splits a letter from its combining marks so the marks can
 * be removed without a lookup table.
 *
 * This is text handling, not a business rule. Nothing here decides which
 * properties exist or who may see them.
 */
export function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase();
}

/** The portfolio filter state, as it travels in the URL. */
export interface PortfolioFilter {
  /** Free text over name, slug and address. Empty means no text filter. */
  readonly q: string;
  /** A frozen lifecycle state, or `'all'`. */
  readonly state: PropertyLifecycleState | 'all';
}

/**
 * Reads the filter out of a query string, discarding anything unrecognised.
 *
 * An unknown `state` falls back to `'all'` rather than showing nothing: a
 * hand-edited or stale URL should show the portfolio, not an empty screen the
 * operator cannot explain.
 */
export function readPortfolioFilter(query: {
  readonly q?: string | undefined;
  readonly state?: string | undefined;
}): PortfolioFilter {
  const state = query.state;
  return {
    q: (query.q ?? '').trim(),
    state: state !== undefined && isKnownLifecycleState(state) ? state : 'all',
  };
}

/** Whether a filter would narrow anything — used to tell two empty states apart. */
export function isPortfolioFiltered(filter: PortfolioFilter): boolean {
  return filter.q !== '' || filter.state !== 'all';
}

/**
 * The properties a filter admits.
 *
 * <h2>Why this runs in the frontend</h2>
 *
 * `GET /api/v1/admin/properties` **takes no parameters at all** — no `q`, no
 * `status`, no `page`, no `sort` — and doc 58 §8's Properties row names none
 * either. Adding one would be inventing a contract, so the filter runs over the
 * list the backend already returned.
 *
 * That is safe here for a specific reason, not a general one: the endpoint
 * returns the **complete** set the caller's scope reaches, and there is no
 * pagination, so there is no unseen remainder a client-side filter could hide.
 * Scope is enforced in SQL; narrowing a list that is already scope-filtered
 * cannot widen it. When the portfolio outgrows one response, this belongs on the
 * server — recorded as OQ-158.
 *
 * Matching is over fields the DTO actually returns: every locale's display name,
 * the slug, and the three address parts. Nothing here derives state the backend
 * owns.
 */
export function filterProperties(
  properties: readonly PropertyAdminView[],
  filter: PortfolioFilter,
): readonly PropertyAdminView[] {
  const needle = searchable(filter.q);

  return properties.filter((property) => {
    if (filter.state !== 'all' && property.lifecycleState !== filter.state) {
      return false;
    }
    if (needle === '') {
      return true;
    }
    return propertyHaystack(property).includes(needle);
  });
}

/** Everything about a property that is legitimately searchable, as one string. */
function propertyHaystack(property: PropertyAdminView): string {
  const parts: string[] = [property.slug, ...Object.values(property.names)];
  for (const part of [property.district, property.ward, property.city]) {
    if (typeof part === 'string' && part.trim() !== '') {
      parts.push(part);
    }
  }
  return searchable(parts.join(' '));
}

/**
 * The information-screen fields this record has not been given yet.
 *
 * <h2>What this is, and what it deliberately is not</h2>
 *
 * This reads the record `GET /admin/properties` already returned and reports
 * which of its own fields are still blank. It costs no request, and it exists
 * because the operator's real job right now is deciding which of eight draft
 * hotels to work on next — a decision the list could not previously inform
 * without opening all eight.
 *
 * It is **not** the publish gate. `GET /{id}/completeness` is, and it is the
 * only thing allowed to say whether a property can be submitted: it also weighs
 * room types, hero media and signature experiences, none of which appear on
 * this record at all. Re-deriving that check here would put a second, quieter
 * answer next to the authoritative one and let the two drift. So this is scoped
 * to, and labelled as, the fields of the Information screen — the screen the
 * link beside it opens.
 *
 * Both locales are required for names and short descriptions because doc 23 §3.2
 * carries them per locale and doc 52 §3.1 makes the pair an invariant; a
 * signature line is reported missing only when no locale has one, which is the
 * shape `signatureLines` itself uses.
 */
export function missingInformation(property: PropertyAdminView): readonly string[] {
  const blank = (value: string | undefined): boolean =>
    value === undefined || value.trim() === '';
  const missing: string[] = [];

  for (const locale of Object.keys(SUPPORTED_LOCALE_LABELS)) {
    if (blank(property.names[locale])) {
      missing.push(`Tên (${SUPPORTED_LOCALE_LABELS[locale]})`);
    }
  }
  if (Object.keys(SUPPORTED_LOCALE_LABELS).every((locale) => blank(property.signatureLines[locale]))) {
    missing.push('Câu giới thiệu');
  }
  for (const locale of Object.keys(SUPPORTED_LOCALE_LABELS)) {
    if (blank(property.shortDescriptions[locale])) {
      missing.push(`Mô tả ngắn (${SUPPORTED_LOCALE_LABELS[locale]})`);
    }
  }
  // `city` is NOT NULL in the schema, so it is never reported.
  if (blank(property.ward)) missing.push('Phường/Xã');
  if (blank(property.district)) missing.push('Quận/Huyện');
  // A lone coordinate is not a location, so the pair is judged together.
  if (property.latitude === undefined || property.longitude === undefined) {
    missing.push('Toạ độ');
  }
  if (blank(property.phone)) missing.push('Điện thoại');
  if (property.amenityCodes.length === 0) missing.push('Tiện nghi');

  return missing;
}
