import { addDays } from '@/lib/domain/availability';
import { MIN_ADULTS, MIN_ROOMS, STEPPER_CEILING, type StayQuery } from '@/lib/domain/stay';
import type { StaySearchCopy } from './bookingMessages';
import styles from './StaySearch.module.css';

/** Request descriptions and price estimates only; hotel staff checks rooms manually (decision 153). */
export function StaySearchBar({
  action,
  today,
  stay,
  districts,
  problem,
  copy,
  variant = 'full',
  intent,
}: {
  /** The page the search submits back to. */
  readonly action: string;
  /** Server-supplied, so a wrong client clock cannot move the floor. */
  readonly today: string;
  readonly stay: StayQuery;
  /**
   * The districts the published portfolio contains. Empty renders no
   * destination control at all rather than an empty dropdown.
   */
  readonly districts?: readonly string[];
  /** A refusal to render against the fields — from the backend or the mirror. */
  readonly problem?: string | undefined;
  readonly copy: StaySearchCopy;
  /**
   * `full` carries the destination; `stay` is the hotel page, where the
   * destination is already decided by which page the guest is on.
   */
  readonly variant?: 'full' | 'stay';
  /** Editorial trip grouping selected on Find Your KAS. */
  readonly intent?: string | undefined;
}) {
  const from = stay.checkIn ?? '';
  const minCheckOut = from === '' ? addDays(today, 1) : addDays(from, 1);
  const options = districts ?? [];
  const withDestination = variant === 'full' && options.length > 0;

  return (
    <form
      method="get"
      action={action}
      className={styles.bar}
      data-variant={variant}
      aria-labelledby="stay-search-title"
    >
      {intent === undefined ? null : <input type="hidden" name="intent" value={intent} />}
      <h2 className={styles.title} id="stay-search-title">
        {copy.title}
      </h2>

      <div className={styles.fields} data-destination={withDestination || undefined}>
        {withDestination ? (
          <label className={styles.field} htmlFor="destination">
            <span className={styles.fieldLabel}>{copy.destination}</span>
            <select
              id="destination"
              name="destination"
              className={styles.control}
              defaultValue={stay.destination ?? ''}
            >
              <option value="">{copy.anyDestination}</option>
              {options.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={styles.field} htmlFor="checkIn">
          <span className={styles.fieldLabel}>{copy.checkIn}</span>
          <input
            id="checkIn"
            name="checkIn"
            type="date"
            className={styles.control}
            required
            min={today}
            defaultValue={from}
            {...(problem === undefined ? {} : { 'aria-describedby': 'stay-problem' })}
          />
        </label>

        {/*
          The note is a description, not part of the field's name, so it sits
          outside the label and is attached with `aria-describedby`. Inside the
          label a screen reader would announce the whole sentence every time the
          field took focus, as though the field were called "Check-out, the
          check-out night is not charged".
        */}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="checkOut">
            {copy.checkOut}
          </label>
          <input
            id="checkOut"
            name="checkOut"
            type="date"
            className={styles.control}
            required
            min={minCheckOut}
            defaultValue={stay.checkOut ?? ''}
            aria-describedby={
              problem === undefined ? 'checkout-note' : 'checkout-note stay-problem'
            }
          />
          <span className={styles.fieldNote} id="checkout-note">
            {copy.checkOutNote}
          </span>
        </div>

        {/*
          Native number inputs rather than +/- buttons: they carry the browser's
          own steppers, they are reachable by keyboard and screen reader without
          any script, and — like the rest of this form — they work with
          JavaScript switched off.
        */}
        <label className={styles.field} htmlFor="adults">
          <span className={styles.fieldLabel}>{copy.adults}</span>
          <input
            id="adults"
            name="adults"
            type="number"
            inputMode="numeric"
            className={styles.control}
            min={MIN_ADULTS}
            max={STEPPER_CEILING}
            step={1}
            defaultValue={stay.adults}
          />
        </label>

        <label className={styles.field} htmlFor="rooms">
          <span className={styles.fieldLabel}>{copy.rooms}</span>
          <input
            id="rooms"
            name="rooms"
            type="number"
            inputMode="numeric"
            className={styles.control}
            min={MIN_ROOMS}
            max={STEPPER_CEILING}
            step={1}
            defaultValue={stay.rooms}
          />
        </label>

        <div className={styles.action}>
          <button type="submit" className={styles.submit}>
            {copy.submit}
          </button>
        </div>
      </div>

      {/*
        Doc 26 §7.4 — no child count in V1, because config B10 is OPEN and the
        backend refuses one. Said here rather than discovered at the quote.
      */}
      <p className={styles.note}>{copy.childrenNote}</p>

      {problem === undefined ? null : (
        // Associated with both date fields, and announced — never colour alone.
        <p className={styles.problem} id="stay-problem" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}
