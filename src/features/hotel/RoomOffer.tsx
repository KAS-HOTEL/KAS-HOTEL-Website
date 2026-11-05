'use client';

import { formatMoney, roomLabel, type PublishedRoomType, type RequestRoomOption } from '@/lib/domain/availability';
import { fitsParty, roomsNeededFor, STEPPER_CEILING } from '@/lib/domain/stay';
import type { PublicMediaView } from '@/lib/domain/media';
import { RoomGallery } from './RoomGallery';
import type { RoomSelectionCopy } from './bookingMessages';
import styles from './StaySearch.module.css';

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export function RoomOffer({
  room,
  description,
  images,
  quantity,
  nightCount,
  adults,
  rooms,
  copy,
  onChoose,
}: {
  readonly room: RequestRoomOption;
  /** The published description, matched by slug. Absent renders the facts it has. */
  readonly description?: PublishedRoomType | undefined;
  readonly images: readonly PublicMediaView[];
  readonly quantity: number;
  readonly nightCount: number;
  readonly adults: number;
  readonly rooms: number;
  readonly copy: RoomSelectionCopy;
  readonly onChoose: (roomTypeSlug: string, quantity: number) => void;
}) {
  const fits = fitsParty(description, adults, rooms);
  const needed = roomsNeededFor(description, adults);

  /** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
  const suggested = Math.min(
    Math.max(needed ?? 1, 1),
    STEPPER_CEILING,
  );

  return (
    <li
      className={styles.offer}
      data-selected={quantity > 0 || undefined}
      aria-label={roomLabel(room, nightCount, copy)}
    >
      {/* The photographs first — a guest chooses a room by looking at it. */}
      <div className={styles.offerMedia}>
        <RoomGallery images={images} roomName={room.name} />
      </div>

      <div className={styles.offerBody}>
        <h3 className={styles.offerName}>{room.name}</h3>

        {description?.shortDescription === undefined
          || description.shortDescription === null
          || description.shortDescription === '' ? null : (
          <p className={styles.offerLead}>{description.shortDescription}</p>
        )}

        <dl className={styles.offerFacts}>
          {description === undefined ? null : (
            <div className={styles.offerFact}>
              <dt>{copy.occupancy}</dt>
              <dd>{occupancyLabel(description, copy)}</dd>
            </div>
          )}

          {/* Nullable in the schema: omitted, never shown as 0 m². */}
          {description?.areaSqm === undefined || description.areaSqm === null ? null : (
            <div className={styles.offerFact}>
              <dt>{copy.area}</dt>
              <dd>{description.areaSqm} m²</dd>
            </div>
          )}

          {/* The Partner's own bed wording, counted. Absent when none recorded. */}
          {description?.beds === undefined || description.beds.length === 0 ? null : (
            <div className={styles.offerFact}>
              <dt>{copy.beds}</dt>
              <dd>
                {description.beds.map((bed, index) => (
                  <span key={`${bed.bedType}-${index}`} className={styles.offerBed}>
                    {copy.bed(bed.bedCount, bed.bedType)}
                  </span>
                ))}
              </dd>
            </div>
          )}

          {/* `smoking` is NOT NULL, so both states are facts and both are stated. */}
          {description?.smoking === undefined ? null : (
            <div className={styles.offerFact}>
              <dt>{copy.smoking}</dt>
              <dd>{description.smoking ? copy.smokingAllowed : copy.smokingNotAllowed}</dd>
            </div>
          )}
        </dl>

        {/*
          Read off the published `maxAdults`, so it is a restatement of the room
          description rather than a rule. It never removes a room from the list.
        */}
        {description === undefined ? null : (
          <p className={styles.offerFit} data-fits={fits || undefined}>
            {fits ? copy.fitsParty(adults) : copy.tooSmall}
          </p>
        )}

        {/* Words as well as tint — doc 82 forbids state carried by colour alone. */}
        <p className={styles.offerNote}>{copy.manualReview}</p>
      </div>

      <div className={styles.offerAside}>
        <p className={styles.offerPrice}>
          <span className={styles.offerPriceLabel}>{copy.from}</span>
          <span className={styles.offerPriceValue}>{formatMoney(room.nightlyFrom)}</span>
          <span className={styles.offerPriceUnit}>{copy.perNight}</span>
        </p>

        {quantity > 0 ? (
          <div className={styles.offerChosen}>
            <p className={styles.offerChosenCount} role="status">
              {copy.chosen(quantity)}
            </p>
            <label className={styles.offerQuantity} htmlFor={`quantity-${room.roomTypeSlug}`}>
              <span className={styles.offerQuantityLabel}>{copy.quantity(room.name)}</span>
              <select
                id={`quantity-${room.roomTypeSlug}`}
                className={styles.offerSelect}
                value={String(quantity)}
                onChange={(event) => onChoose(room.roomTypeSlug, Number(event.target.value))}
              >
                {quantityOptions(STEPPER_CEILING).map((value) => (
                  <option key={value} value={String(value)}>
                    {value === 0 ? copy.none : copy.roomCount(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <button
            type="button"
            className={styles.offerChoose}
            onClick={() => onChoose(room.roomTypeSlug, suggested)}
          >
            {copy.choose}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * `2 adults · 1 child` — and the total only when it says something the two
 * counts do not.
 *
 * The schema's `room_type_occupancy_fit` allows `maxOccupancy` to be lower than
 * adults plus children, so printing all three unconditionally would usually be
 * noise and occasionally a contradiction a guest has to resolve.
 */
function occupancyLabel(room: PublishedRoomType, copy: RoomSelectionCopy): string {
  const parts = [copy.adults(room.maxAdults)];
  if (room.maxChildren > 0) {
    parts.push(copy.children(room.maxChildren));
  }
  const label = parts.join(' · ');
  return room.maxOccupancy === room.maxAdults + room.maxChildren
    ? label
    : `${label} · ${copy.sleeps(room.maxOccupancy)}`;
}

/** Request quantity and published room capacity are independent of room stock. */
function quantityOptions(max: number): readonly number[] {
  const ceiling = Math.min(Math.max(max, 0), STEPPER_CEILING);
  return Array.from({ length: ceiling + 1 }, (_, quantity) => quantity);
}
