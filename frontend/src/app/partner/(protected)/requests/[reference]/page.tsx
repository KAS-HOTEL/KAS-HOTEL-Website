import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SalesRequestDetailView } from '@/features/salesRequest/SalesRequestDetailView';
import { salesEmailDeliveries, salesNotes, salesRequest, serverNow } from '@/features/salesRequest/server';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/salesRequest/SalesRequest.module.css';

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
 * One direct request — doc 58 §5's "full workspace".
 *
 * <h2>404 is the ownership boundary, and it is not re-described</h2>
 *
 * Another partner's reference, an OTA reservation and a reference that never
 * existed are one answer, decided by the backend's SQL. This page renders the
 * application's ordinary not-found screen for all three; calling it a permission
 * problem would leak exactly what doc 85 §6.3 uses 404 to hide.
 *
 * <h2>The reference is in the URL; nothing else is</h2>
 *
 * Doc 85 §11 row 7 makes the reference the addressable identifier — non-sequential
 * and never a credential, because ownership is checked server-side on every read.
 * No guest name, email or phone appears in the path or the query.
 */
export default async function PartnerRequestPage({
  params,
}: {
  readonly params: Promise<Params>;
}) {
  const { reference } = await params;
  const result = await salesRequest(reference);

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

  // A second scoped read: doc 58 §5 gives the notes their own route, and they
  // are a different concern from the workspace rather than a field of it.
  const notes = await salesNotes(reference);
  const emailDeliveries = await salesEmailDeliveries(reference);

  // Server-supplied, so a wrong client clock cannot move the SLA banding.
  return (
    <SalesRequestDetailView
      request={result.request}
      now={await serverNow()}
      notes={notes.status === 'ok' ? notes.notes : []}
      notesFailed={notes.status === 'error'}
      emailDeliveries={emailDeliveries.status === 'ok' ? emailDeliveries.deliveries : []}
      emailDeliveriesFailed={emailDeliveries.status === 'error'}
    />
  );
}
