import type { AmenityTaxonomyEntry } from '@/lib/domain/availability';
import type { AmenityCopy } from './HotelAmenities';
import type { SearchCopy } from './requestMessages';
import styles from './Hotel.module.css';

/**
 * The portfolio's district filter — doc 58 §3.1's `district`.
 *
 * <h2>A plain GET form</h2>
 *
 * No client component and no JavaScript: submitting puts `?district=` in the URL,
 * so a filtered portfolio is linkable, shareable, indexable and survives a
 * reload. The same reasoning as `StaySearchBar`, and the reason the whole guest
 * tree is server-rendered.
 *
 * <h2>Only the districts that exist</h2>
 *
 * The options come from the **unfiltered** portfolio, so the list never shrinks
 * as the guest narrows it and never offers a district with nothing in it. There
 * is no district catalogue to read from — `property.district` is free text a
 * Partner types — so the published portfolio is the only honest source.
 *
 * <h2>Two of doc 58 §3.1's four filters</h2>
 *
 * `district` and `amenity` are here. `collection` and `character` are not
 * implemented at all — see `publicHotelsApi.properties`.
 *
 * <h2>The amenity control appears only once the words exist</h2>
 *
 * Its options come from `GET /public/amenities`, the taxonomy Step 16A.43
 * implemented. That endpoint omits any entry with no approved word in the
 * reader's locale, so the control is absent while the amenity wording is still
 * config **A9 / OQ-031** — a dropdown of `wifi-free` would be a database view,
 * not a guest control, and the guest surface never shows a raw code.
 *
 * The value submitted is the **code**; the label is the word. So the URL and the
 * API request keep using the stable identifier while the guest reads language.
 */
export function HotelFilters({
  action,
  districts,
  amenities,
  selected,
  selectedAmenity,
  copy,
  amenityCopy,
  intent,
}: {
  readonly action: string;
  readonly districts: readonly string[];
  readonly amenities: readonly AmenityTaxonomyEntry[];
  readonly selected?: string | undefined;
  readonly selectedAmenity?: string | undefined;
  readonly copy: SearchCopy;
  readonly amenityCopy: AmenityCopy;
  readonly intent?: string | undefined;
}) {
  if (districts.length === 0 && amenities.length === 0) {
    // Nothing to narrow. A dropdown with one entry is a control that cannot do
    // anything, and an empty portfolio has no districts at all.
    return null;
  }

  const anyFilterApplied = selected !== undefined || selectedAmenity !== undefined;

  return (
    <form method="get" action={action} className={styles.filters} aria-labelledby="hotel-filters-title">
      {intent === undefined ? null : <input type="hidden" name="intent" value={intent} />}
      <h2 id="hotel-filters-title" className={styles.filtersTitle}>{copy.filterTitle}</h2>

      <div className={styles.filterRow}>
        {districts.length === 0 ? null : (
          <div className={styles.filterField}>
            <label htmlFor="district" className={styles.filterLabel}>{copy.filterDistrict}</label>
            <select
              id="district"
              name="district"
              defaultValue={selected ?? ''}
              className={styles.filterSelect}
            >
              <option value="">{copy.filterAnyDistrict}</option>
              {districts.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
          </div>
        )}

        {amenities.length === 0 ? null : (
          <div className={styles.filterField}>
            <label htmlFor="amenity" className={styles.filterLabel}>{copy.filterAmenity}</label>
            <select
              id="amenity"
              name="amenity"
              defaultValue={selectedAmenity ?? ''}
              className={styles.filterSelect}
            >
              <option value="">{copy.filterAnyAmenity}</option>
              {groupByCategory(amenities).map(([category, entries]) => (
                // Grouped by doc 03 §6's own categories, using the labels the
                // hotel page already renders in both locales — one vocabulary,
                // one set of words, on every guest surface.
                <optgroup key={category} label={amenityCopy.categories[category] ?? category}>
                  {entries.map((entry) => (
                    // The value is the code the API takes; the label is the
                    // word the guest reads.
                    <option key={entry.code} value={entry.code}>{entry.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        <div className={styles.filterActions}>
          <button type="submit" className={styles.filterSubmit}>{copy.filterSubmit}</button>
          {anyFilterApplied ? (
            // A link rather than a reset button: clearing is a navigation back
            // to the unfiltered page, and it works without JavaScript.
            <a href={intent === undefined ? action : `${action}?intent=${intent}`} className={styles.filterClear}>{copy.filterClear}</a>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/**
 * The districts present in the portfolio, in the order the hotels arrive.
 *
 * The backend orders by `sort_order`, which is the operator's own arrangement,
 * so the first district a guest sees is the one KAS puts first. Deduplicated
 * without re-sorting: alphabetising would override that.
 */
export function districtsOf(
  properties: readonly { readonly district?: string | null }[],
): readonly string[] {
  const seen: string[] = [];
  for (const property of properties) {
    const district = property.district;
    if (district !== undefined && district !== null && district.trim() !== ''
        && !seen.includes(district)) {
      seen.push(district);
    }
  }
  return seen;
}

/**
 * The taxonomy grouped by doc 03 §6's categories, in the order the server sent.
 *
 * The backend orders `category, sort_order, code`, so a `Map` keyed in arrival
 * order reproduces the catalogue's own arrangement — an operator and a guest see
 * the vocabulary the same way round. Nothing is re-sorted here.
 */
function groupByCategory(
  entries: readonly AmenityTaxonomyEntry[],
): readonly (readonly [string, readonly AmenityTaxonomyEntry[]])[] {
  const groups = new Map<string, AmenityTaxonomyEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.category) ?? [];
    bucket.push(entry);
    groups.set(entry.category, bucket);
  }
  return [...groups.entries()];
}
