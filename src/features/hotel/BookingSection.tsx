'use client';

import { useEffect, useMemo, useState } from 'react';
import { publicHotelsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  formatMoney,
  type PublishedRoomType,
  type RequestRoomOption,
} from '@/lib/domain/availability';
import type { PublicMediaView } from '@/lib/domain/media';
import { quoteLines, type Quote } from '@/lib/domain/quote';
import {
  fitsParty,
  reconcileSelection,
  selectedRooms,
  selectionParams,
  type RoomSelection,
  type SelectionChange,
} from '@/lib/domain/stay';
import { ReservationRequestForm } from './ReservationRequestForm';
import { RoomOffer } from './RoomOffer';
import { StaySummary, StickyStayBar, type SummaryLine } from './StaySummary';
import { roomSelectionCopy, staySummaryCopy } from './bookingMessages';
import { guestMessageFor } from './load';
import styles from './StaySearch.module.css';

/**
 * The booking surface — choose rooms for the dates you searched, see what they
 * cost, then request them.
 *
 * <h2>What is server-rendered and what is not</h2>
 *
 * The **availability itself** is fetched on the server and arrives as a prop, so
 * the room list, its prices and its counts are in the first HTML response:
 * indexable, visible without JavaScript, and painted once rather than flashing
 * empty. What needs JavaScript is only what genuinely cannot be a `GET` — the
 * quote is a `POST` carrying `X-XSRF-TOKEN`, exactly like every other mutating
 * call in this application, and CSRF is not weakened for a read-only endpoint's
 * convenience.
 *
 * So: without JavaScript a guest can still search, see every available room, its
 * photographs, its facts and its nightly rate. What they lose is the priced
 * total and the request form.
 *
 * <h2>The selection lives in the URL</h2>
 *
 * Each chosen room is written back as `room=slug:quantity` with
 * `history.replaceState`, so a guest can send someone the exact stay they are
 * looking at, and a reload does not lose the choice. `replaceState` rather than
 * `push` deliberately: a stepper press is not a navigation, and filling the back
 * button with quantity changes would trap the guest in their own selection.
 *
 * <h2>A selection goes stale, and is not silently repaired</h2>
 *
 * New dates mean new availability, and a room selected under the old dates may
 * no longer be sellable — or sellable in a smaller quantity. The selection is
 * reconciled against the availability that just arrived, and every reduction is
 * **shown to the guest** rather than quietly applied. Sending the stale
 * selection instead would collect a `422`; applying it quietly would price a
 * stay they did not choose.
 *
 * <h2>Nothing here prices anything</h2>
 *
 * No subtotal, no total, no nightly × nights arithmetic and no capacity rule.
 * `RateResolver` prices the stay, the frozen `available_direct()` function bounds
 * it, and doc 56 §3.2's `Σ over nights × quantity` is the backend's. This
 * component sends a selection and renders what came back.
 */
export function BookingSection({
  propertySlug,
  propertyName,
  locale,
  rooms,
  roomTypes,
  galleries,
  checkIn,
  checkOut,
  nightCount,
  adults,
  roomsWanted,
  initialSelection,
}: {
  readonly propertySlug: string;
  readonly propertyName: string;
  readonly locale: string;
  /** Availability for these exact dates, from the server. */
  readonly rooms: readonly RequestRoomOption[];
  /** The published room descriptions, matched by slug. */
  readonly roomTypes: readonly PublishedRoomType[];
  /** Each room type's own `ROOM_TYPE` photographs, by slug. */
  readonly galleries: Readonly<Record<string, readonly PublicMediaView[]>>;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nightCount: number;
  readonly adults: number;
  readonly roomsWanted: number;
  /** Whatever the URL already carried, before it is reconciled. */
  readonly initialSelection: RoomSelection;
}) {
  const copy = roomSelectionCopy(locale);
  const summaryCopy = staySummaryCopy(locale);

  // The dates these results belong to. When it changes, the selection made
  // against the previous dates has to be re-checked before it can be trusted.
  const stayKey = `${checkIn}|${checkOut}`;

  const [state, setState] = useState(() => ({
    key: stayKey,
    ...reconcileSelection(initialSelection, rooms),
  }));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Adjusting state during render when the props it derives from change — the
  // documented React pattern, and correct here because the alternative (an
  // effect) would paint one frame of a selection the backend no longer offers.
  if (state.key !== stayKey) {
    setState({ key: stayKey, ...reconcileSelection(state.selection, rooms) });
    setQuote(null);
    setError(undefined);
  }

  const { selection, changed } = state;
  const chosen = selectedRooms(selection);

  /** Write the selection back into the URL, so the stay stays linkable. */
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    for (const param of selectionParams(selection)) {
      url.searchParams.append('room', param);
    }
    window.history.replaceState(window.history.state, '', url.toString());
  }, [selection]);

  /**
   * Any change discards the price calculated for the previous selection — a
   * total left on screen beside a different set of rooms is simply wrong.
   *
   * Not wrapped in `useCallback`: the React Compiler is enabled on this project
   * and memoizes it, and a hand-written dependency list here disagreed with the
   * one the compiler infers, which switches the optimisation off for the whole
   * component.
   */
  function choose(roomTypeSlug: string, quantity: number): void {
    setQuote(null);
    setError(undefined);
    setState((current) => {
      const next = { ...current.selection };
      if (quantity > 0) {
        next[roomTypeSlug] = quantity;
      } else {
        delete next[roomTypeSlug];
      }
      // The guest has now acted on the reconciliation, so the notice retires.
      return { key: current.key, selection: next, changed: [] as readonly SelectionChange[] };
    });
  }

  const bySlug = useMemo(
    () => new Map(roomTypes.map((type) => [type.slug, type])),
    [roomTypes],
  );

  /**
   * Rooms the party fits in first, then the backend's own order.
   *
   * The ordering key is the **published** `maxAdults`, a fact on the room
   * description — not availability and not price. Within each group the
   * backend's order (`sort_order`, then slug) is preserved exactly, and no room
   * is removed: a guest can always see and select everything the response
   * carried.
   */
  const ordered = useMemo(() => {
    return rooms
      .map((room, index) => ({ room, index }))
      .sort((a, b) => {
        const aFits = fitsParty(bySlug.get(a.room.roomTypeSlug), adults, roomsWanted);
        const bFits = fitsParty(bySlug.get(b.room.roomTypeSlug), adults, roomsWanted);
        if (aFits !== bFits) {
          return aFits ? -1 : 1;
        }
        return a.index - b.index;
      })
      .map((entry) => entry.room);
  }, [rooms, bySlug, adults, roomsWanted]);

  const lines: readonly SummaryLine[] = useMemo(
    () =>
      Object.entries(selection)
        .filter(([, quantity]) => quantity > 0)
        .map(([slug, quantity]) => {
          const room = rooms.find((r) => r.roomTypeSlug === slug);
          return {
            roomTypeSlug: slug,
            name: room?.name ?? slug,
            quantity,
            nightly: room === undefined ? '' : formatMoney(room.nightlyFrom),
          };
        }),
    [selection, rooms],
  );

  async function price(): Promise<void> {
    setPricing(true);
    setError(undefined);
    setQuote(null);
    try {
      setQuote(
        await publicHotelsApi.quote(
          {
            propertySlug,
            checkIn,
            checkOut,
            adults,
            // Always 0 and always empty — config B10 is OPEN and the backend
            // refuses anything else. Nothing here can send a child.
            children: 0,
            childAges: [],
            lines: quoteLines(selection),
          },
          locale,
        ),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? guestMessageFor(caught) : summaryCopy.failed);
    } finally {
      setPricing(false);
    }
  }

  return (
    <section className={styles.booking} aria-labelledby="booking-title">
      <div>
        <h2 className={styles.title} id="booking-title">
          {copy.title}
        </h2>

        {/* Announced when the results replace the previous ones. The counts are
            the backend's, not a rounded impression. */}
        <p className={styles.resultsSummary} role="status" aria-label={copy.resultsLabel}>
          {checkIn} → {checkOut} · {copy.nights(nightCount)} ·{' '}
          {copy.summary(rooms.length, rooms.length)}
        </p>

        <ul className={styles.offers}>
          {ordered.map((room) => (
            <RoomOffer
              key={room.roomTypeSlug}
              room={room}
              description={bySlug.get(room.roomTypeSlug)}
              images={galleries[room.roomTypeSlug] ?? []}
              quantity={selection[room.roomTypeSlug] ?? 0}
              nightCount={nightCount}
              adults={adults}
              rooms={roomsWanted}
              copy={copy}
              onChoose={choose}
            />
          ))}
        </ul>

        {/*
          Doc 56 §9: "Until B6 and A7 are supplied, every displayed price is an
          estimate and is labelled as one." The wording states what the number
          *is* — the lowest nightly rate across the chosen dates, per room —
          rather than implying a stay total, because `nightlyFrom` is a "from"
          price and doc 58 §3.2 never defines it as anything else.
        */}
        <p className={styles.estimateNote}>
          {copy.estimateNote[0]}
          <strong>{copy.estimateNote[1]}</strong>
          {copy.estimateNote[2]}
        </p>
      </div>

      <StaySummary
        checkIn={checkIn}
        checkOut={checkOut}
        nightCount={nightCount}
        adults={adults}
        rooms={roomsWanted}
        lines={lines}
        quote={quote}
        pricing={pricing}
        error={error}
        changes={changed}
        copy={summaryCopy}
        onPrice={price}
      >
        {quote === null ? null : (
          <ReservationRequestForm
            quote={quote}
            propertySlug={propertySlug}
            propertyName={propertyName}
            adults={adults}
            locale={locale}
            onReset={() => {
              setQuote(null);
              setError(undefined);
            }}
          />
        )}
      </StaySummary>

      <StickyStayBar
        chosen={chosen}
        quote={quote}
        pricing={pricing}
        copy={summaryCopy}
        onPrice={price}
      />
      {chosen === 0 ? null : <div className={styles.stickySpacer} aria-hidden="true" />}
    </section>
  );
}
