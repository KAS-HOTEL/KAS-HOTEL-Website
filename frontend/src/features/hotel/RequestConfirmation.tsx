import Link from 'next/link';
import { formatMoney } from '@/lib/domain/availability';
import type { RequestReceipt } from '@/lib/domain/reservationRequest';
import type { RequestCopy } from './requestMessages';
import styles from './Hotel.module.css';

/**
 * The 201, and only the 201.
 *
 * Every value rendered is one of the six public keys. There is no property
 * echo, no guest echo, no reservation id and no date restatement, because the
 * response carries none of them and inventing one would show the guest something
 * the server never confirmed.
 *
 * **Nothing here claims a message was sent.** Notification delivery is OQ-162
 * and no mail sender exists; `trackingUrlIssued` is the backend's own flag and
 * this reads it rather than assuming.
 */
export function RequestConfirmation({
  receipt,
  copy,
  locale,
}: {
  readonly receipt: RequestReceipt;
  readonly copy: RequestCopy;
  /** Needed only for the link back to this receipt — doc 22 §3 prefixes routes. */
  readonly locale: string;
}) {
  return (
    <section className={styles.confirmation} aria-labelledby="confirmation-title" role="status">
      <h3 className={styles.confirmationTitle} id="confirmation-title">
        {copy.successTitle}
      </h3>

      <p className={styles.confirmationReference}>
        <span className={styles.priceLabel}>{copy.successReference}</span>
        <strong className={styles.referenceValue}>{receipt.reference}</strong>
      </p>

      <dl className={styles.requestSummary}>
        <div className={styles.summaryRow}>
          <dt>{copy.successStatus}</dt>
          <dd>{receipt.status}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>{copy.successPromise}</dt>
          <dd>{receipt.responsePromise}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>{copy.successTotal}</dt>
          <dd>
            <strong>{formatMoney(receipt.estimatedTotal)}</strong>
          </dd>
        </div>
      </dl>

      <p className={styles.quoteNote}>{receipt.estimateDisclaimer}</p>
      <p className={styles.quoteNote}>{copy.successNext}</p>
      <p className={styles.quoteNote}>{copy.successKeepReference}</p>

      {/*
        The receipt is recoverable from the server (Step 16A.34), so give the
        guest the address rather than asking them to reconstruct it. A real link:
        bookmarkable, shareable, and openable after the tab is closed.
      */}
      <p className={styles.quoteNote}>
        <Link
          className={styles.receiptLink}
          href={`/${locale}/requests/${encodeURIComponent(receipt.reference)}`}
        >
          {copy.successOpenReceipt}
        </Link>
      </p>
      {receipt.trackingUrlIssued ? null : (
        <p className={styles.quoteNote}>{copy.successNoTracking}</p>
      )}
    </section>
  );
}
