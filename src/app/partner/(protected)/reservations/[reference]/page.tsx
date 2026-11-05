import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  RESERVATION_DETAIL_COPY,
  ReservationDetailView,
} from '@/features/reservation/ReservationDetailView';
import { reservation } from '@/features/reservation/server';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/reservation/Reservation.module.css';

type Params = { readonly reference: string };

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<Params>;
}): Promise<Metadata> {
  const { reference } = await params;
  // The reference only. A guest's name in a browser title would follow them into
  // history, a screenshot and a shared tab.
  return { title: `${reference} — KAS Partner` };
}

/**
 * One reservation — doc 58 §6, *"full detail, any channel"*.
 *
 * <h2>404 is the ownership boundary, and it is not re-described</h2>
 *
 * Another partner's reference and one that never existed are the same answer,
 * decided by the backend's SQL. This page renders the application's ordinary
 * not-found screen for both; calling it a permission problem would leak exactly
 * what doc 85 §6.3 uses 404 to hide.
 *
 * <p>Unlike `/partner/requests/{reference}`, an **OTA reservation is not a 404
 * here**: that route is DIRECT-only at the data layer, and this one is the
 * all-channel read.
 *
 * <h2>The reference is in the URL; nothing else is</h2>
 *
 * Doc 85 §11 row 7 makes the reference the addressable identifier —
 * non-sequential and never a credential, because ownership is checked
 * server-side on every read. No guest name, email or phone appears in the path
 * or the query, so a shared link discloses nothing a screenshot would not.
 */
export default async function PartnerReservationPage({
  params,
}: {
  readonly params: Promise<Params>;
}) {
  const { reference } = await params;
  const result = await reservation(reference);

  if (result.status === 'notFound') {
    notFound();
  }

  if (result.status === 'error') {
    return (
      <div className={styles.page}>
        <ErrorState error={result.error} />
      </div>
    );
  }

  return (
    <div>
      {/*
        A link rather than a history-based "back": arriving here from a bookmark
        or a shared URL leaves nothing to go back to, and a control that does
        nothing on some visits is worse than one that always goes somewhere. The
        browser's own back button still returns to the exact search, because the
        results page keeps its state in the URL.
      */}
      <div className={styles.page} style={{ paddingBottom: 0 }}>
        <Link className={styles.backLink} href="/partner/reservations">
          ← Đặt phòng &amp; khách lưu trú
        </Link>
      </div>
      <ReservationDetailView reservation={result.reservation} copy={RESERVATION_DETAIL_COPY} />
    </div>
  );
}
