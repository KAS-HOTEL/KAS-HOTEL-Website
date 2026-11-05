import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { filtersFromSearchParams, inboxHref } from '@/features/messaging/ConversationFilterBar';
import {
  CONVERSATION_VIEW_COPY,
  ConversationView,
} from '@/features/messaging/ConversationView';
import { inbox, templates, thread } from '@/features/messaging/server';
import { hotelOptions } from '@/features/reservation/hotelOptions';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/messaging/Messaging.module.css';
import { InboxShell } from '../InboxShell';

type Params = { readonly reference: string };

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<Params>;
}): Promise<Metadata> {
  const { reference } = await params;
  // The reference only. A guest's name in a browser title would follow them into
  // history, a screenshot and a shared tab.
  return { title: `${reference} — Tin nhắn — KAS Partner` };
}

/**
 * One conversation, beside the inbox on a wide screen and instead of it below
 * 1024px.
 *
 * <h2>404 is the ownership boundary, and it is not re-described</h2>
 *
 * Another partner's reference and one that never existed are the same answer,
 * decided by the backend's SQL. Calling it a permission problem would leak
 * exactly what doc 85 §6.3 uses 404 to hide.
 *
 * <h2>Only enabled manual templates reach the composer</h2>
 *
 * A disabled template is one the partner has taken out of use, and an automated
 * one is written by the sweep rather than picked by hand. Offering either would
 * put a body in front of an operator that the product does not intend them to
 * send from here.
 */
export default async function PartnerConversationPage({
  params,
  searchParams,
}: {
  readonly params: Promise<Params>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reference } = await params;
  const filters = filtersFromSearchParams(await searchParams);

  const conversation = await thread(reference);
  if (conversation.status === 'notFound') {
    notFound();
  }

  const [list, page, shelf] = await Promise.all([hotelOptions(), inbox(filters), templates()]);

  const properties = list;

  if (conversation.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Tin nhắn</h1>
        <ErrorState error={conversation.error} />
      </div>
    );
  }

  const manualTemplates = shelf.status === 'ok'
    ? shelf.templates.filter((template) => template.enabled && template.trigger === 'MANUAL')
    : [];

  const view = (
    <ConversationView
      thread={conversation.thread}
      templates={manualTemplates}
      backHref={inboxHref(filters)}
      copy={CONVERSATION_VIEW_COPY}
    />
  );

  if (page.status === 'error') {
    // The conversation loaded and the list did not. Render the conversation
    // rather than nothing: the operator came here to read this thread.
    return (
      <div className={styles.page}>
        <ErrorState error={page.error} />
        {view}
      </div>
    );
  }

  return (
    <InboxShell
      page={page.page}
      filters={filters}
      properties={properties}
      activeReference={reference}
    >
      {view}
    </InboxShell>
  );
}
