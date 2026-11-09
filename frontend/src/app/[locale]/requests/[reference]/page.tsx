import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RequestConfirmation } from '@/features/hotel/RequestConfirmation';
import { guestMessageFor } from '@/features/hotel/load';
import { requestCopy } from '@/features/hotel/requestMessages';
import { publicReceipt } from '@/features/hotel/server';
import { isSupportedLocale } from '@/config/env';
import { EmptyState } from '@/ui/primitives';
import styles from '@/features/hotel/Hotel.module.css';

export const metadata: Metadata = {
  // Deliberately constant. A title built from the reference would put it in the
  // browser tab, the history and any screenshot the guest ever shares.
  title: 'KAS',
};

/**
 * A guest's receipt, reopened — doc 58 §3's
 * `GET /public/reservations/requests/{reference}/sent`.
 *
 * <h2>The gap this closes</h2>
 *
 * Until now the receipt existed only in the browser that submitted the request:
 * a reload lost the reference, and with it the only thing the guest had to quote
 * when contacting the hotel. It was already persisted — S1 stores the exact 201
 * body — but nothing served it back.
 *
 * <h2>Why this is safe on a bare reference</h2>
 *
 * The receipt carries no guest detail: reference, the status literal doc 58 §3.3
 * freezes, the response promise and the estimate the guest already saw. It
 * reports nothing about how the request is progressing, so a guessable reference
 * cannot become a way to learn whether a booking was won or declined.
 *
 * <h2>Not found is not an error</h2>
 *
 * A reference that was never issued a receipt and a mistyped one reach the same
 * `notFound()`, which is what keeps a reference an identifier rather than a
 * credential (doc 85 §6.3). Only a genuine backend failure renders an error.
 */
export default async function GuestRequestReceiptPage({
  params,
}: {
  readonly params: Promise<{ readonly locale: string; readonly reference: string }>;
}) {
  const { locale, reference } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const result = await publicReceipt(reference);

  if (result.status === 'notFound') {
    notFound();
  }

  const copy = requestCopy(locale);

  return (
    <div className={styles.page}>
      {result.status === 'error' ? (
        // The guest mapping, not the console's: backend words only for 400 and 422.
        <EmptyState title={copy.receiptErrorTitle}>
          {guestMessageFor(result.error)}
        </EmptyState>
      ) : (
        // The identical component the submission renders, so a reopened receipt
        // and a fresh one cannot drift apart.
        <RequestConfirmation receipt={result.receipt} copy={copy} locale={locale} />
      )}
    </div>
  );
}
