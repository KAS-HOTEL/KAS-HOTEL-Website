import { formatMoney } from '@/lib/domain/availability';
import type { Money } from '@/lib/domain/availability';
import { present } from '@/lib/domain/reservation';
import styles from './ReservationLines.module.css';

/**
 * The room types on a reservation — shared by both reservation workspaces.
 *
 * <h2>Why this is one component and not two</h2>
 *
 * A reservation line means the same thing whether the booking came through the
 * direct sales flow or from an OTA: one row per room type, the quantity being
 * how many of that room, with the name and price frozen at booking. The sales
 * workspace and the operations workspace differ in their *status* vocabulary and
 * their *actions*, not here — so this section is written once and both render
 * it. Two copies would eventually disagree about how a multi-room booking looks.
 *
 * <h2>Never collapsed</h2>
 *
 * Two Deluxe rooms and one Double is **two lines**, quantities 2 and 1. Merging
 * them into a single "3 rooms" would misreport what the guest booked and what
 * the property has to provide.
 *
 * <h2>A null price is not a zero</h2>
 *
 * `nightly` is null when the stay's nights carry different rates (doc 125 §9).
 * The line says so in words; printing `0` would read as "free", which is the one
 * thing it never means.
 *
 * <p>Tested with {@link present} rather than `=== null`: the backend omits null
 * fields from its JSON entirely, so such a line arrives with no `nightly` key at
 * all and a `=== null` check would miss it and hand `undefined` to
 * `formatMoney`. That was latent in the sales workspace before this section was
 * shared — its seeded data happens to price every line.
 */
export function ReservationLinesCard({
  lines,
  copy,
}: {
  readonly lines: readonly ReservationLineLike[];
  readonly copy: ReservationLinesCopy;
}) {
  return (
    <ul className={styles.lines}>
      {lines.map((line) => (
        <li key={line.roomTypeName} className={styles.line}>
          <span className={styles.lineName}>
            {line.roomTypeName} × {line.quantity}
          </span>
          <span className={styles.lineDetail}>
            {present(line.nightly) ? `${formatMoney(line.nightly)} / đêm` : copy.varyingNightly}
          </span>
          <span className={styles.lineAmount}>
            {present(line.lineTotal) ? formatMoney(line.lineTotal) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The shape both workspaces' line types already have.
 *
 * Structural rather than a shared nominal type, so neither domain module has to
 * import the other's just to render a list.
 */
export interface ReservationLineLike {
  readonly roomTypeName: string;
  readonly quantity: number;
  readonly nightly: Money | null;
  readonly lineTotal: Money | null;
}

export interface ReservationLinesCopy {
  readonly varyingNightly: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const RESERVATION_LINES_COPY: ReservationLinesCopy = {
  varyingNightly: 'Giá theo từng đêm',
};
