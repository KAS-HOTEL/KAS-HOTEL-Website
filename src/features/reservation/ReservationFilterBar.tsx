import Link from 'next/link';
import type { ReservationSearchFilters } from '@/lib/api/endpoints';
import {
  isStayStatusGroup,
  stayStatusesForGroup,
  STAY_STATUS_GROUP_LABEL,
  STAY_STATUS_GROUP_ORDER,
  type StayStatusGroup,
} from '@/lib/domain/reservation';
import styles from './Reservation.module.css';

/**
 * Search and filters for the reservation workspace.
 *
 * <h2>A plain GET form, and no JavaScript</h2>
 *
 * Submitting navigates to this page with the chosen values as search
 * parameters, and the server renders the matching page. That is the convention
 * the sales queue and the guest availability search already use, and it settles
 * several of this screen's requirements at once:
 *
 * <ul>
 *   <li>**The URL is the state.** A refresh, a bookmark, a shared link and the
 *       browser's back button all reproduce the same results, because there is
 *       no client state that could disagree with the address bar.</li>
 *   <li>**Enter submits**, because a single-input form always has.</li>
 *   <li>**No duplicate requests and no debounce to tune.** One navigation per
 *       submit; there is no keystroke-triggered fetch to cancel, and therefore
 *       no stale response that can arrive after a newer one.</li>
 * </ul>
 *
 * <h2>Five controls, not eleven</h2>
 *
 * This bar used to offer keyword, property, stay status, channel, room type and
 * three separate date ranges — eleven inputs, which is a database query form
 * with a hotel's name on it. What survives is what a front desk actually
 * narrows by: who or which booking, which hotel, which room type, what state,
 * and when the booking was taken.
 *
 * <p>Room type is the one that came back. It was dropped with the rest in the
 * simplification and that was the wrong call: unlike channel and the two stay
 * ranges, it answers a question an operator genuinely asks — "which of my rooms
 * is this about" — and it already had a considered design (see below).
 *
 * <p>**Nothing was removed from the API.** `channelType`, `checkIn*` and
 * `checkOut*` are still accepted by `GET /admin/ops/reservations`, still parsed
 * out of the URL by {@link filtersFromSearchParams}, and still applied — so an
 * existing bookmark keeps working and "Xóa bộ lọc" still appears to clear it.
 * They simply have no control here any more.
 *
 * <p>There is **no `salesStatus` control**, and there never was. It is
 * DIRECT-only, NULL for every OTA reservation, and belongs to the sales queue at
 * `/partner/requests`. Offering it here would merge two lifecycles doc 53 keeps
 * apart.
 *
 * <h2>Status is a group, not an enum</h2>
 *
 * The select offers the four questions in `STAY_STATUS_GROUPS` and puts a token
 * — `booked`, `arrived` — in the URL. The enum values travel only in the request
 * this page makes to the API, so neither the operator nor the address bar ever
 * meets `CHECK_IN_READY`.
 */
export function ReservationFilterBar({
  active,
  activeGroup,
  properties,
  roomTypes,
  copy,
}: {
  readonly active: ReservationSearchFilters;
  /** The chosen status group, read from the URL rather than from `active`. */
  readonly activeGroup: StayStatusGroup | undefined;
  /** The partner's own properties, from the list the console already loads. */
  readonly properties: readonly { readonly slug: string; readonly label: string }[];
  /** The chosen property's room types, or empty when no property is chosen. */
  readonly roomTypes: readonly { readonly slug: string; readonly label: string }[];
  readonly copy: ReservationFilterCopy;
}) {
  const hasFilters = Object.entries(active).some(
    ([key, value]) => key !== 'page' && key !== 'size' && value !== undefined && value !== '',
  );

  return (
    // Keyed on the active filters for the reason the sales bar is: every control
    // below is UNCONTROLLED, so `defaultValue` is read once at mount. A
    // client-side navigation re-renders this component with new props while React
    // reuses the same DOM nodes, and the bar would go on showing the previous
    // page's filters. That is not cosmetic on a GET form — "Tìm kiếm" submits
    // whatever the controls hold, so a stale control silently discards the filter
    // the operator just chose.
    <form
      key={filterKey(active, activeGroup)}
      method="get"
      className={styles.toolbar}
      aria-label={copy.legend}
    >
      {/*
        One row that wraps, not a grid of equal cells. The keyword box grows and
        the rest stay at their natural size, so the field an operator uses most
        is the one with the most room — and at narrow widths they stack in the
        order they are read rather than reflowing into columns.
      */}
      <div className={styles.toolbarSearch}>
        <label htmlFor="reservation-q">{copy.search}</label>
        <input
          id="reservation-q"
          name="q"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder={copy.searchPlaceholder}
          defaultValue={active.q ?? ''}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.toolbarField}>
        <label htmlFor="filter-property">{copy.property}</label>
        <select
          id="filter-property"
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
        Only once a property is chosen, which is not a simplification but a
        correctness constraint: room-type slugs are unique *within* a property,
        not across the portfolio, so a portfolio-wide picker would list the same
        name several times meaning different rooms.
      */}
      {roomTypes.length === 0 ? null : (
        <div className={styles.toolbarField}>
          <label htmlFor="filter-room-type">{copy.roomType}</label>
          <select
            id="filter-room-type"
            name="roomType"
            defaultValue={active.roomType ?? ''}
            className={styles.control}
          >
            <option value="">{copy.any}</option>
            {roomTypes.map((roomType) => (
              <option key={roomType.slug} value={roomType.slug}>
                {roomType.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.toolbarField}>
        <label htmlFor="filter-status">{copy.status}</label>
        <select
          id="filter-status"
          name="status"
          defaultValue={activeGroup ?? ''}
          className={styles.control}
        >
          <option value="">{copy.any}</option>
          {STAY_STATUS_GROUP_ORDER.map((group) => (
            <option key={group} value={group}>
              {STAY_STATUS_GROUP_LABEL[group]}
            </option>
          ))}
        </select>
      </div>

      {/*
        The one date range that survived, and the compact shape says so: two
        inputs sharing a legend, sized to a date rather than stretched to match
        the keyword box.
      */}
      <fieldset className={styles.toolbarDates}>
        <legend className={styles.dateLegend}>{copy.booked}</legend>
        <div className={styles.dateInputs}>
          <div className={styles.dateField}>
            <label htmlFor="bookedFrom">{copy.from}</label>
            <input
              id="bookedFrom"
              name="bookedFrom"
              type="date"
              defaultValue={active.bookedFrom ?? ''}
              className={styles.control}
            />
          </div>
          <div className={styles.dateField}>
            <label htmlFor="bookedTo">{copy.to}</label>
            <input
              id="bookedTo"
              name="bookedTo"
              type="date"
              defaultValue={active.bookedTo ?? ''}
              className={styles.control}
            />
          </div>
        </div>
      </fieldset>

      <div className={styles.toolbarActions}>
        <button type="submit" className={styles.submit}>
          {copy.apply}
        </button>
        {/*
          A link, not a reset button: clearing means navigating to the unfiltered
          URL, so the address bar and the rendered list stay the same thing. A
          form reset would restore the controls and leave the results filtered.
        */}
        {hasFilters ? (
          <Link href="/partner/reservations" className={styles.clear}>
            {copy.clear}
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export interface ReservationFilterCopy {
  readonly legend: string;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly property: string;
  readonly roomType: string;
  readonly status: string;
  readonly booked: string;
  readonly from: string;
  readonly to: string;
  readonly any: string;
  readonly apply: string;
  readonly clear: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const RESERVATION_FILTER_COPY: ReservationFilterCopy = {
  legend: 'Tìm kiếm và lọc đặt phòng',
  search: 'Tìm kiếm',
  searchPlaceholder: 'Mã đặt phòng, tên khách, SĐT, email',
  property: 'Khách sạn',
  roomType: 'Loại phòng',
  status: 'Trạng thái',
  booked: 'Ngày đặt',
  from: 'Từ ngày',
  to: 'Đến ngày',
  any: 'Tất cả',
  apply: 'Tìm kiếm',
  clear: 'Xóa bộ lọc',
};

/**
 * The status group the URL asks for, if it names one.
 *
 * <p>An unrecognised token is treated as no filter rather than refused: a stale
 * link should show the workspace, not an error page. The four tokens are the
 * console's own vocabulary, so there is no server round trip to validate them
 * against.
 */
export function stayStatusGroupFromParams(
  params: Record<string, string | string[] | undefined>,
): StayStatusGroup | undefined {
  const value = first(params.status);
  return isStayStatusGroup(value) ? value : undefined;
}

/**
 * Reads the filters back out of the URL, in the shape the API takes.
 *
 * <p>`status` is translated here: the URL carries a group token and the request
 * carries the enum values it stands for. That is the one place the two
 * vocabularies meet, which is why the address bar never shows `CHECK_IN_READY`
 * and the API never sees `arrived`.
 *
 * <p>Values are otherwise passed through rather than validated: the backend
 * refuses an unknown enum with a 400 naming the parameter, and swallowing one
 * would show the operator an unfiltered list while the address bar claimed
 * otherwise.
 *
 * <p>`channelType`, `roomType` and the check-in/check-out bounds are still read.
 * They have no control on this screen any more, but the API still accepts them
 * and a bookmark that carries one must keep working.
 *
 * <p>`page` and `size` are parsed to numbers rather than passed through: they are
 * the two parameters this module also *writes*, and `page=abc` would otherwise
 * reach the query string unchanged.
 *
 * <p>**`size` must be read here even though no control sets it.** It reached the
 * backend as a default while `page` was read from the URL, so `?size=2&page=1`
 * asked the server for the second page of twenty — an empty one — while the
 * screen believed there was a single page and drew no pager. A URL that carries
 * one half of a page coordinate and silently drops the other is a dead end.
 */
export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ReservationSearchFilters {
  const page = Number.parseInt(first(params.page) ?? '', 10);
  const size = Number.parseInt(first(params.size) ?? '', 10);
  const group = stayStatusGroupFromParams(params);

  return {
    ...pick(params, 'q'),
    ...pick(params, 'property'),
    ...(group === undefined ? {} : { stayStatus: stayStatusesForGroup(group) }),
    ...pick(params, 'channelType'),
    ...pick(params, 'roomType'),
    ...pick(params, 'checkInFrom'),
    ...pick(params, 'checkInTo'),
    ...pick(params, 'checkOutFrom'),
    ...pick(params, 'checkOutTo'),
    ...pick(params, 'bookedFrom'),
    ...pick(params, 'bookedTo'),
    ...(Number.isFinite(page) && page > 0 ? { page } : {}),
    // The backend clamps to the same bounds; matching them here keeps the
    // rendered pager and the served page describing the same thing.
    ...(Number.isFinite(size) && size > 0 ? { size: Math.min(size, 100) } : {}),
  };
}

/**
 * Identifies one set of active filters, so the bar remounts when they change.
 *
 * Uncontrolled controls read their defaults once. This string changes exactly
 * when those defaults would differ, and never when they would not.
 */
function filterKey(
  active: ReservationSearchFilters,
  activeGroup: StayStatusGroup | undefined,
): string {
  return [
    active.q,
    active.property,
    active.roomType,
    activeGroup,
    active.bookedFrom,
    active.bookedTo,
  ]
    .map((value) => value ?? '')
    .join('|');
}

type TextFilter =
  | 'q'
  | 'property'
  | 'channelType'
  | 'roomType'
  | 'checkInFrom'
  | 'checkInTo'
  | 'checkOutFrom'
  | 'checkOutTo'
  | 'bookedFrom'
  | 'bookedTo';

function pick(
  params: Record<string, string | string[] | undefined>,
  key: TextFilter,
): ReservationSearchFilters {
  const value = first(params[key]);
  return value === undefined || value === '' ? {} : { [key]: value };
}

/** A repeated parameter takes its first value; the form only ever sends one. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
