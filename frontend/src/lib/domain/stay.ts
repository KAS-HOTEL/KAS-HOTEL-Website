import { isIsoDate, type PublishedRoomType, type RequestRoomOption } from './availability';

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */

/** The stay, once parsed. Dates are absent until a guest has chosen them. */
export interface StayQuery {
  /** A district name, matching the portfolio's `district` facet. Absent = anywhere. */
  readonly destination?: string;
  readonly checkIn?: string;
  readonly checkOut?: string;
  readonly adults: number;
  readonly rooms: number;
}

/** What a page receives from Next before anything has been validated. */
export interface RawStayQuery {
  readonly destination?: string | undefined;
  readonly checkIn?: string | undefined;
  readonly checkOut?: string | undefined;
  readonly adults?: string | undefined;
  readonly rooms?: string | undefined;
  readonly room?: string | readonly string[] | undefined;
}

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export const MIN_ADULTS = 1;

/** The same reasoning for rooms: one at minimum, the ceiling is the backend's. */
export const MIN_ROOMS = 1;

/** Request quantity and published room capacity are independent of room stock. */
export const STEPPER_CEILING = 30;

/**
 * Read the stay out of a query string, keeping only what is usable.
 *
 * A malformed date is treated as absent rather than passed through: the page
 * would have to reject it anyway, and `?checkIn=yesterday` should show the empty
 * search rather than an error about a value the guest never typed. Counts are
 * clamped rather than rejected, because `?adults=0` has an obvious intended
 * meaning and refusing it would help nobody.
 */
export function parseStayQuery(raw: RawStayQuery): StayQuery {
  const destination =
    raw.destination !== undefined && raw.destination.trim() !== ''
      ? raw.destination.trim()
      : undefined;

  return {
    ...(destination === undefined ? {} : { destination }),
    ...(isIsoDate(raw.checkIn) ? { checkIn: raw.checkIn } : {}),
    ...(isIsoDate(raw.checkOut) ? { checkOut: raw.checkOut } : {}),
    adults: clampCount(raw.adults, MIN_ADULTS),
    rooms: clampCount(raw.rooms, MIN_ROOMS),
  };
}

function clampCount(value: string | undefined, floor: number): number {
  const parsed = Number(value);
  if (value === undefined || value.trim() === '' || !Number.isFinite(parsed)) {
    return floor;
  }
  return Math.min(Math.max(Math.trunc(parsed), floor), STEPPER_CEILING);
}

/**
 * The stay as a query string, for a link.
 *
 * Defaults are still written out. A shared link that silently drops "2 adults"
 * because two is the default would show the recipient a different search from
 * the one the sender was looking at, and the sender has no way to know.
 */
export function stayQueryString(
  stay: StayQuery,
  extra: Readonly<Record<string, string>> = {},
): string {
  const params = new URLSearchParams();
  if (stay.destination !== undefined) {
    params.set('destination', stay.destination);
  }
  if (stay.checkIn !== undefined) {
    params.set('checkIn', stay.checkIn);
  }
  if (stay.checkOut !== undefined) {
    params.set('checkOut', stay.checkOut);
  }
  params.set('adults', String(stay.adults));
  params.set('rooms', String(stay.rooms));
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }
  return params.toString();
}

/** Whether the guest has chosen both ends of a stay. */
export function hasDates(stay: StayQuery): stay is StayQuery & {
  readonly checkIn: string;
  readonly checkOut: string;
} {
  return stay.checkIn !== undefined && stay.checkOut !== undefined;
}

/* ---------------------------------------------------------------------------
 * The room selection
 * ------------------------------------------------------------------------ */

/** How many of each room type the guest wants, by room-type slug. */
export type RoomSelection = Readonly<Record<string, number>>;

/**
 * The selection, encoded for the URL as repeated `room=slug:quantity`.
 *
 * Repeated keys rather than one packed value, so a link stays readable and a
 * single malformed entry costs one room rather than the whole selection.
 */
export function parseSelection(raw: string | readonly string[] | undefined): RoomSelection {
  const entries = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  const selection: Record<string, number> = {};

  for (const entry of entries) {
    const separator = entry.lastIndexOf(':');
    if (separator <= 0) {
      continue;
    }
    const slug = entry.slice(0, separator);
    const quantity = Number(entry.slice(separator + 1));
    if (!Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }
    selection[slug] = Math.min(quantity, STEPPER_CEILING);
  }
  return selection;
}

/** The inverse. Zeroes are dropped — "none of this room" is said by absence. */
export function selectionParams(selection: RoomSelection): readonly string[] {
  return Object.entries(selection)
    .filter(([, quantity]) => quantity > 0)
    .map(([slug, quantity]) => `${slug}:${quantity}`);
}

/** Request quantity and published room capacity are independent of room stock. */
export function reconcileSelection(
  selection: RoomSelection,
  rooms: readonly RequestRoomOption[],
): { readonly selection: RoomSelection; readonly changed: readonly SelectionChange[] } {
  const bySlug = new Map(rooms.map((room) => [room.roomTypeSlug, room]));
  const next: Record<string, number> = {};
  const changed: SelectionChange[] = [];

  for (const [slug, quantity] of Object.entries(selection)) {
    if (quantity <= 0) {
      continue;
    }
    const room = bySlug.get(slug);

    // The room type is not in this date range's response at all — either sold
    // out, or unpriceable, in which case the backend omitted it entirely.
    if (room === undefined) {
      changed.push({ roomTypeSlug: slug, name: slug, from: quantity, to: 0 });
      continue;
    }

    const ceiling = STEPPER_CEILING; // Request-form control bound, not room stock.
    const allowed = Math.min(quantity, ceiling);
    if (allowed !== quantity) {
      changed.push({ roomTypeSlug: slug, name: room.name, from: quantity, to: allowed });
    }
    if (allowed > 0) {
      next[slug] = allowed;
    }
  }

  return { selection: next, changed };
}

/** One room the reconciliation had to reduce or drop, so the guest can be told. */
export interface SelectionChange {
  readonly roomTypeSlug: string;
  readonly name: string;
  readonly from: number;
  readonly to: number;
}

/** How many rooms are selected across every type. */
export function selectedRooms(selection: RoomSelection): number {
  return Object.values(selection).reduce((sum, quantity) => sum + quantity, 0);
}

/* ---------------------------------------------------------------------------
 * Published capacity — a fact about the room, never an inventory claim
 * ------------------------------------------------------------------------ */

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export function fitsParty(
  room: PublishedRoomType | undefined,
  adults: number,
  rooms: number,
): boolean {
  if (room === undefined) {
    // No published description arrived for this room type. Not knowing is not
    // the same as not fitting, so it is never marked as too small.
    return true;
  }
  return room.maxAdults * Math.max(rooms, 1) >= adults;
}

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export function roomsNeededFor(
  room: PublishedRoomType | undefined,
  adults: number,
): number | null {
  if (room === undefined || room.maxAdults <= 0) {
    return null;
  }
  return Math.ceil(adults / room.maxAdults);
}
