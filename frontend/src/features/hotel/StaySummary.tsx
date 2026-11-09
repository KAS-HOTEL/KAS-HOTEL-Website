'use client';

import { formatMoney } from '@/lib/domain/availability';
import type { Quote } from '@/lib/domain/quote';
import type { SelectionChange } from '@/lib/domain/stay';
import type { StaySummaryCopy } from './bookingMessages';
import styles from './StaySearch.module.css';

/** One selected room, as the summary needs to show it. */
export interface SummaryLine {
  readonly roomTypeSlug: string;
  readonly name: string;
  readonly quantity: number;
  /** The lowest nightly rate for this room across the stay, formatted. */
  readonly nightly: string;
}

/** Request descriptions and price estimates only; hotel staff checks rooms manually (decision 153). */
export function StaySummary({
  checkIn,
  checkOut,
  nightCount,
  adults,
  rooms,
  lines,
  quote,
  pricing,
  error,
  changes,
  copy,
  onPrice,
  children,
}: {
  readonly checkIn?: string | undefined;
  readonly checkOut?: string | undefined;
  readonly nightCount: number;
  readonly adults: number;
  readonly rooms: number;
  readonly lines: readonly SummaryLine[];
  readonly quote: Quote | null;
  readonly pricing: boolean;
  readonly error?: string | undefined;
  /** Rooms the arriving availability forced down or out, so the guest is told. */
  readonly changes: readonly SelectionChange[];
  readonly copy: StaySummaryCopy;
  readonly onPrice: () => void;
  /** The request form, once there is a priced quote to build it from. */
  readonly children?: React.ReactNode;
}) {
  const chosen = lines.reduce((sum, line) => sum + line.quantity, 0);
  const dated = checkIn !== undefined && checkOut !== undefined;

  return (
    <aside className={styles.summary} aria-label={copy.label}>
      <h2 className={styles.summaryTitle}>{copy.title}</h2>

      {dated ? (
        <p className={styles.summaryStay}>
          <span className={styles.summaryDates}>
            {checkIn} → {checkOut}
          </span>
          <span className={styles.summaryMeta}>
            {copy.nights(nightCount)} · {copy.party(adults, rooms)}
          </span>
        </p>
      ) : (
        <p className={styles.summaryEmpty}>{copy.noDates}</p>
      )}

      {/*
        Said out loud, because the guest did not do it. A selection silently
        reduced to match new availability is a selection they did not make.
      */}
      {changes.length === 0 ? null : (
        <div className={styles.summaryChanged} role="status">
          <p className={styles.summaryChangedTitle}>{copy.changed}</p>
          <ul className={styles.summaryChangedList}>
            {changes.map((change) => (
              <li key={change.roomTypeSlug}>
                {change.to === 0
                  ? copy.dropped(change.name)
                  : copy.changedLine(change.name, change.from, change.to)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {chosen === 0 ? (
        <p className={styles.summaryEmpty}>{copy.empty}</p>
      ) : (
        <ul className={styles.summaryLines}>
          {lines.map((line) => {
            // The priced line for this room, if the backend has priced it.
            const priced = quote?.lines.find((l) => l.roomTypeSlug === line.roomTypeSlug);
            return (
              <li key={line.roomTypeSlug} className={styles.summaryLine}>
                <span className={styles.summaryLineName}>
                  {line.name} × {line.quantity}
                </span>
                {priced === undefined ? null : (
                  <span className={styles.summaryLineAmount}>{formatMoney(priced.subtotal)}</span>
                )}
                <span className={styles.summaryLineDetail}>{copy.lineDetail(line.nightly)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {quote === null ? null : (
        <p className={styles.summaryTotal}>
          <span className={styles.summaryTotalLabel}>{copy.total}</span>
          <strong className={styles.summaryTotalValue}>{formatMoney(quote.total)}</strong>
        </p>
      )}

      {error === undefined ? null : (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}

      {chosen === 0 ? null : (
        <div className={styles.summaryAction}>
          <button
            type="button"
            className={styles.submit}
            onClick={onPrice}
            disabled={pricing}
            aria-busy={pricing || undefined}
          >
            {pricing ? copy.pricing : copy.priceIt}
          </button>
        </div>
      )}

      {/*
        Doc 58 §11.2.4 — always an estimate, because a quote precedes the price
        snapshot. No tax line: tax is out of KAS V1 scope entirely (doc 99 §12),
        and reserving a row for one would tell a guest a charge is coming.
      */}
      {quote === null ? null : (
        <p className={styles.summaryNote}>
          {copy.estimateNote[0]}
          <strong>{copy.estimateNote[1]}</strong>
          {copy.estimateNote[2]}
        </p>
      )}

      {children}
    </aside>
  );
}

/**
 * The phone's version of the summary — what is chosen and what it costs, at the
 * bottom of the viewport.
 *
 * Hidden from 1024px up, where the panel itself is sticky and always in view.
 * It renders nothing at all until something is selected: a permanent empty bar
 * would cover the last room card in exchange for saying nothing.
 */
export function StickyStayBar({
  chosen,
  quote,
  pricing,
  copy,
  onPrice,
}: {
  readonly chosen: number;
  readonly quote: Quote | null;
  readonly pricing: boolean;
  readonly copy: StaySummaryCopy;
  readonly onPrice: () => void;
}) {
  if (chosen === 0) {
    return null;
  }

  return (
    <div className={styles.stickyBar} role="region" aria-label={copy.label}>
      <div className={styles.stickyText}>
        <span className={styles.stickyCount}>{copy.stickyCount(chosen)}</span>
        {quote === null ? null : (
          <span className={styles.stickyTotal}>{formatMoney(quote.total)}</span>
        )}
      </div>
      <div className={styles.stickyAction}>
        <button
          type="button"
          className={styles.submit}
          onClick={onPrice}
          disabled={pricing}
          aria-busy={pricing || undefined}
        >
          {pricing ? copy.pricing : copy.priceIt}
        </button>
      </div>
    </div>
  );
}
