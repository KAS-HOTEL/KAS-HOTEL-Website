import Link from 'next/link';
import {
  conversationPropertyLabel,
  messageStamp,
  stayRange,
  type ConversationSummary,
} from '@/lib/domain/conversation';
import { EmptyState } from '@/ui/primitives';
import styles from './Messaging.module.css';

/**
 * The inbox list.
 *
 * <h2>A list, not a table</h2>
 *
 * Every other operational screen in this console uses `Table`, and this one
 * deliberately does not: an inbox row is a person and a sentence, read as a
 * block, and it sits in a narrow column beside the open conversation at desktop
 * width. A table would give it column headers it has no use for and a horizontal
 * scroll it cannot afford.
 *
 * <h2>No unread state</h2>
 *
 * There is nothing to be unread. Every message in this product was written by
 * the partner's own staff — no customer surface can reach the thread — so a
 * badge would be counting their own words back at them. When a customer
 * messaging surface exists, unread arrives with it and means something.
 *
 * <h2>Preview text is the server's</h2>
 *
 * Truncated backend-side, so every width shows the same sentence and a long
 * message is not shipped in full to be hidden by CSS.
 */
export function ConversationList({
  conversations,
  activeReference,
  hrefFor,
  pastEnd = false,
  copy,
}: {
  readonly conversations: readonly ConversationSummary[];
  /** The conversation currently open, so the list can mark it. */
  readonly activeReference?: string;
  /** Builds each row's link, so the list keeps the caller's filters in the URL. */
  readonly hrefFor: (reference: string) => string;
  readonly pastEnd?: boolean;
  readonly copy: ConversationListCopy;
}) {
  if (conversations.length === 0) {
    // Three empty screens, not one: a failed request renders an ErrorState on
    // the page instead, and "past the last page" is not "nothing matched".
    return pastEnd ? (
      <EmptyState title={copy.pastEndTitle}>{copy.pastEndBody}</EmptyState>
    ) : (
      <EmptyState title={copy.emptyTitle}>{copy.emptyBody}</EmptyState>
    );
  }

  return (
    <ul className={styles.list} aria-label={copy.label}>
      {conversations.map((conversation) => {
        const active = conversation.reference === activeReference;
        return (
          <li key={conversation.reference}>
            <Link
              href={hrefFor(conversation.reference)}
              className={styles.listItem}
              data-active={active || undefined}
              // Words as well as tint — doc 82 forbids state carried by colour
              // alone, and a screen reader needs to know which one is open.
              aria-current={active ? 'true' : undefined}
            >
              {/*
                Four tiers: who, which booking, when they stay, and what was
                last said.

                It was nine — name, reference, hotel, stay, preview, time,
                channel badge, an automation badge, a message count and the
                guest's phone number — stacked in a 300px column. Every row
                was true and almost none of it was being read: an inbox is
                scanned to find a conversation, and the rest of the record is
                one click away in the header of the conversation itself.

                The phone number is gone from here in particular. It is a
                contact action, it belongs where you would act on it, and it
                was repeated once per row down the whole column.

                Nothing is labelled. A reference looks like a reference and a
                date range looks like a date range, so "Đặt phòng:",
                "Khách sạn:" and "Ngày:" were spending the scarce width in a
                300px rail to name what the value already was.
              */}
              <span className={styles.listGuest}>{conversation.guestName ?? '—'}</span>

              <span className={styles.listContext}>
                <span className={styles.listReference}>{conversation.reference}</span>
                {' · '}
                {conversationPropertyLabel(conversation)}
              </span>

              <span className={styles.listStay}>{stayRange(conversation)}</span>

              <span className={styles.listPreviewRow}>
                <span className={styles.listPreview}>
                  {/* Who wrote the newest message, where a sender's name goes
                      in any inbox — instead of a badge on its own row. */}
                  {conversation.lastMessageAutomated ? `${copy.automated}: ` : ''}
                  {conversation.lastMessagePreview ?? '—'}
                </span>
                <time className={styles.listTime} dateTime={conversation.lastMessageAt}>
                  {messageStamp(conversation.lastMessageAt)}
                </time>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export interface ConversationListCopy {
  readonly label: string;
  readonly automated: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly pastEndTitle: string;
  readonly pastEndBody: string;
  readonly messageCount: (count: number) => string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const CONVERSATION_LIST_COPY: ConversationListCopy = {
  label: 'Danh sách cuộc trò chuyện',
  automated: 'Tự động',
  emptyTitle: 'Chưa có cuộc trò chuyện nào',
  emptyBody:
    'Cuộc trò chuyện bắt đầu khi bạn gửi tin nhắn đầu tiên từ một đặt phòng. '
    + 'Mở "Đặt phòng & khách lưu trú", chọn một đặt phòng rồi soạn tin nhắn.',
  pastEndTitle: 'Trang này không có cuộc trò chuyện nào',
  pastEndBody: 'Kết quả có ít trang hơn. Dùng nút Trang trước để quay lại.',
  messageCount: (count) => `${count} tin nhắn`,
};
