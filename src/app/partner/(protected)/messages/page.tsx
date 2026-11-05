import type { Metadata } from 'next';
import { filtersFromSearchParams } from '@/features/messaging/ConversationFilterBar';
import { inbox } from '@/features/messaging/server';
import { hotelOptions } from '@/features/reservation/hotelOptions';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/messaging/Messaging.module.css';
import { InboxShell } from './InboxShell';

export const metadata: Metadata = {
  title: 'Tin nhắn — KAS Partner',
};

/**
 * The Partner inbox — doc 58 §5's guest-visible messages, listed per reservation.
 *
 * <h2>Server-rendered, and scoped by the server</h2>
 *
 * The page is whatever `GET /admin/ops/conversations` returns for this session.
 * No conversation from another partner ever arrives: the ownership predicate
 * (`reservation → property → partner`) lives inside the backend's SQL, and so
 * does the count behind `total`.
 *
 * <h2>The URL is the state</h2>
 *
 * Search, filters and the page are a plain GET form and plain links, so a
 * refresh, a bookmark, a shared link and the browser's back button all reproduce
 * the same inbox.
 */
export default async function PartnerMessagesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = filtersFromSearchParams(await searchParams);
  const result = await inbox(filters);

  // Already loaded by the partner layout and request-memoised, so naming the
  // partner's own properties costs nothing and shows names rather than slugs.
  const list = await hotelOptions();
  const properties = list;

  if (result.status === 'error') {
    // A failed request and an empty inbox are different facts and never share a
    // screen: showing "chưa có cuộc trò chuyện" for a failure would hide a
    // broken console behind a plausible answer.
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Tin nhắn</h1>
        <ErrorState error={result.error} />
      </div>
    );
  }

  return <InboxShell page={result.page} filters={filters} properties={properties} />;
}
