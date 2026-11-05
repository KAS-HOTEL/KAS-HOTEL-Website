import Link from 'next/link';
import type { ConversationFilters } from '@/lib/api/endpoints';
import styles from './Messaging.module.css';

/**
 * Search and filters for the inbox.
 *
 * <h2>A plain GET form, like every other search in this console</h2>
 *
 * Submitting navigates, and the server renders the matching page. The URL is the
 * state, so a refresh, a bookmark, a shared link and the browser's back button
 * all reproduce the same inbox — and Enter submits because a form always has.
 * There is no keystroke-triggered fetch, so no debounce to tune and no stale
 * response that can arrive after a newer one.
 *
 * <p>Only the filters the backend really has: `q`, `property` and `channelType`.
 * There is no unread filter, because there is no unread state to filter on.
 */
export function ConversationFilterBar({
  active,
  properties,
  copy,
}: {
  readonly active: ConversationFilters;
  readonly properties: readonly { readonly slug: string; readonly label: string }[];
  readonly copy: ConversationFilterCopy;
}) {
  const hasFilters = Object.entries(active).some(
    ([key, value]) => key !== 'page' && key !== 'size' && value !== undefined && value !== '',
  );

  return (
    // Keyed on the active filters: every control is uncontrolled, so
    // `defaultValue` is read once at mount. A client-side navigation re-renders
    // this with new props while React reuses the DOM nodes, and the bar would
    // go on showing the previous page's filters — which this GET form would then
    // submit, silently discarding the filter just chosen.
    <form key={filterKey(active)} method="get" className={styles.filters} aria-label={copy.legend}>
      <div className={styles.searchField}>
        <label htmlFor="conversation-q">{copy.search}</label>
        <input
          id="conversation-q"
          name="q"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder={copy.searchPlaceholder}
          defaultValue={active.q ?? ''}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.filterField}>
        <label htmlFor="conversation-property">{copy.property}</label>
        <select
          id="conversation-property"
          name="property"
          defaultValue={active.property ?? ''}
          className={styles.control}
        >
          <option value="">{copy.any}</option>
          {properties.map((property) => (
            <option key={property.slug} value={property.slug}>
              {property.label}
            </option>
          ))}
        </select>
      </div>

      {/*
        The channel control is not rendered.

        `channelType` is still read from the URL, still sent to the backend and
        still round-trips through `inboxHref` — the filter works, it simply has
        no widget on this screen. Two searching controls plus a submit is what
        an inbox needs; a third that sorts direct from OTA answers a question
        nobody asks while replying to a guest, and it was a third of the width
        of the filter row.

        Kept as a parameter rather than deleted because a link into the inbox
        can carry it, and because removing it from the contract would be a
        backend change this screen has no business making.
      */}

      {/*
        A hidden field, so the value survives a search.

        The bar is a GET form: without this, an operator who arrived at
        `?channelType=OTA` and then typed in the search box would submit a form
        that does not contain `channelType` and would silently lose the filter
        they were inside.
      */}
      {active.channelType === undefined ? null : (
        <input type="hidden" name="channelType" value={active.channelType} />
      )}

      <div className={styles.filterActions}>
        <button type="submit" className={styles.submit}>
          {copy.apply}
        </button>
        {/*
          A link, not a reset: clearing means navigating to the unfiltered URL,
          so the address bar and the rendered list stay the same thing.
        */}
        {hasFilters ? (
          <Link href="/partner/messages" className={styles.clear}>
            {copy.clear}
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function filterKey(active: ConversationFilters): string {
  return [active.q, active.property, active.channelType].map((value) => value ?? '').join('|');
}

export interface ConversationFilterCopy {
  readonly legend: string;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly property: string;
  readonly channel: string;
  readonly any: string;
  readonly apply: string;
  readonly clear: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const CONVERSATION_FILTER_COPY: ConversationFilterCopy = {
  legend: 'Tìm kiếm cuộc trò chuyện',
  search: 'Tìm kiếm',
  searchPlaceholder: 'Mã đặt phòng, tên khách, SĐT, email',
  property: 'Khách sạn',
  channel: 'Kênh đặt phòng',
  any: 'Tất cả',
  apply: 'Tìm kiếm',
  clear: 'Xóa bộ lọc',
};

/**
 * Reads the filters back out of the URL.
 *
 * `page` and `size` are parsed to numbers — they are the two parameters this
 * module also writes, and half a page coordinate is a URL you can reach and not
 * get back from.
 */
export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ConversationFilters {
  const page = Number.parseInt(first(params.page) ?? '', 10);
  const size = Number.parseInt(first(params.size) ?? '', 10);

  return {
    ...pick(params, 'q'),
    ...pick(params, 'property'),
    ...pick(params, 'channelType'),
    ...(Number.isFinite(page) && page > 0 ? { page } : {}),
    ...(Number.isFinite(size) && size > 0 ? { size: Math.min(size, 100) } : {}),
  };
}

function pick(
  params: Record<string, string | string[] | undefined>,
  key: 'q' | 'property' | 'channelType',
): ConversationFilters {
  const value = first(params[key]);
  return value === undefined || value === '' ? {} : { [key]: value };
}

/** A repeated parameter takes its first value; the form only ever sends one. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The inbox URL for one set of filters, optionally opening a conversation.
 *
 * Page 0 is written as no parameter, so the first page has one canonical URL
 * rather than two that differ only by `?page=0`.
 */
export function inboxHref(filters: ConversationFilters, reference?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key !== 'page' && value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  if (filters.page !== undefined && filters.page > 0) {
    params.set('page', String(filters.page));
  }
  const query = params.toString();
  const base = reference === undefined
    ? '/partner/messages'
    : `/partner/messages/${encodeURIComponent(reference)}`;
  return query === '' ? base : `${base}?${query}`;
}
