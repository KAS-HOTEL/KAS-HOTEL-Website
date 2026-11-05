import Link from 'next/link';
import {
  messageStamp,
  present,
  stayRange,
  type ConversationThread,
  type MessageTemplate,
} from '@/lib/domain/conversation';
import { COMPOSER_COPY, MessageComposer } from './MessageComposer';
import styles from './Messaging.module.css';

/**
 * One conversation, opened — its reservation context, its history and the
 * composer.
 *
 * <h2>A chat with one participant</h2>
 *
 * It is laid out as a conversation — bubbles, right-aligned, the composer
 * attached under the thread — because that is what an operator is doing here.
 * But every bubble is on the right and none is on the left: there is no second
 * participant. `ConversationMessage` has no `direction` and no `senderType`,
 * and a left-hand column would draw an empty promise of guest replies this
 * product cannot receive. Nothing is invented to fill it.
 *
 * <h2>Status is what the record can prove</h2>
 *
 * Each message shows when it was **recorded**. There is no delivered tick, no
 * read receipt and no "sent" state, because `sent_at` is null on every row and
 * no transport exists to write it (OQ-162). One muted line under the composer
 * says so, where the operator is about to write — rather than each message
 * carrying a symbol that would have to mean nothing.
 */
export function ConversationView({
  thread,
  templates,
  backHref,
  copy,
}: {
  readonly thread: ConversationThread;
  /** Enabled manual templates, offered in the composer. */
  readonly templates: readonly MessageTemplate[];
  /** Where the mobile back link goes — the inbox, with its filters intact. */
  readonly backHref: string;
  readonly copy: ConversationViewCopy;
}) {
  const { subject, messages } = thread;

  return (
    <section className={styles.conversation} aria-label={copy.label}>
      <header className={styles.conversationHeader}>
        {/* Visible only below the split breakpoint, where the list is not on screen. */}
        <Link href={backHref} className={styles.backLink}>
          ← {copy.back}
        </Link>

        <div className={styles.conversationTitleRow}>
          <h2 className={styles.conversationGuest}>{subject.guestName ?? '—'}</h2>
        </div>

        {/*
          Booking, then stay — two muted lines, no labels.

          These were six labelled definition rows; then one long dotted
          sentence that ran reference, hotel, dates, nights and rooms together
          and competed with the guest's name for the eye. Two short lines give
          it a shape instead: which booking, then when. "Đặt phòng",
          "Khách sạn" and "Kỳ nghỉ" are gone — position and weight say which
          is which, and the values never needed naming.
        */}
        <p className={styles.conversationContext}>
          <Link
            href={`/partner/reservations/${subject.reference}`}
            className={styles.contextLink}
          >
            {subject.reference}
          </Link>
          {' · '}
          {subject.propertyName ?? subject.propertySlug}
        </p>
        <p className={`${styles.conversationContext} ${styles.conversationStay}`}>
          {stayRange(subject)}
          {' · '}
          {subject.nights} đêm
          {' · '}
          {subject.rooms} phòng
        </p>

        {/* Present only when the session holds customer.view — doc 59:148. */}
        {present(subject.guestPhone) || present(subject.guestEmail) ? (
          <p className={styles.conversationContacts}>
            {present(subject.guestPhone) ? (
              <a href={`tel:${subject.guestPhone}`} className={styles.contactChip}>
                {subject.guestPhone}
              </a>
            ) : null}
            {present(subject.guestEmail) ? (
              <a href={`mailto:${subject.guestEmail}`} className={styles.contactChip}>
                {subject.guestEmail}
              </a>
            ) : null}
          </p>
        ) : null}

      </header>

      {/*
        The thread, as a chat.

        Every bubble is on the right, because every message here was written by
        this side: the model has no `direction`, no `senderType` and no inbound
        row. A left column would be an empty promise of guest replies the
        product cannot receive, so there is not one — and no placeholder
        stands in for it.

        Staff and automation are both outbound and are told apart by the bubble
        rather than by a word: automation is the quieter of the two and names
        the template that produced it.
      */}
      <div className={styles.threadScroll}>
        {messages.length === 0 ? (
          <p className={styles.threadEmpty}>{copy.noMessages}</p>
        ) : (
          <ol className={styles.thread}>
            {messages.map((message) => (
              <li
                key={message.id}
                className={styles.message}
                data-author={message.automated ? 'automation' : 'staff'}
              >
                <div className={styles.bubble}>
                  {/* pre-wrap: the operator's own line breaks are part of the message. */}
                  <p className={styles.messageBody}>{message.body}</p>
                  <div className={styles.messageMeta}>
                    {message.automated ? (
                      <span className={styles.messageAuthor}>
                        {message.templateName === null
                          ? copy.byAutomation
                          : `${copy.byAutomation} · ${message.templateName}`}
                      </span>
                    ) : (
                      <span className={styles.messageAuthor}>{copy.byStaff}</span>
                    )}
                    {/* A clock, not the wire value: `2026-09-09T10:42:00Z`
                        was both unreadable at a glance and in the wrong zone
                        for the desk reading it. The instant stays in
                        `dateTime`. */}
                    <time dateTime={message.createdAt} className={styles.messageTime}>
                      {messageStamp(message.createdAt)}
                    </time>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/*
        The composer is the foot of the same surface, not a card below it.

        The delivery position moved here from the header: it is a caption on
        the act of writing — this is a record, the guest will not receive it —
        and it is read at the moment the operator is about to type, not at the
        top of a page they have already scrolled past. One muted line rather
        than the ruled notice block it used to be.
      */}
      <div className={styles.composerBar}>
        <MessageComposer
          reference={subject.reference}
          templates={templates}
          copy={COMPOSER_COPY}
        />
        <p className={styles.composerNote}>{copy.composerNote}</p>
      </div>
    </section>
  );
}

/*
  Six keys shorter. `reservation`, `property`, `stay`, `phone` and `email` were
  labels for the definition list the context line replaced, and `composerTitle`
  titled the card the composer no longer sits in.
*/
export interface ConversationViewCopy {
  readonly label: string;
  readonly back: string;
  readonly noMessages: string;
  readonly byStaff: string;
  readonly byAutomation: string;
  readonly composerNote: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const CONVERSATION_VIEW_COPY: ConversationViewCopy = {
  label: 'Cuộc trò chuyện',
  back: 'Hộp thư',
  noMessages: 'Chưa có tin nhắn nào trong cuộc trò chuyện này.',
  byStaff: 'Nhân viên',
  byAutomation: 'Tự động',
  /*
    One line, and it still refuses to imply delivery.

    This was a three-clause paragraph naming the delivery channel and listing
    the transports the system does not have — "hệ thống chưa có kênh gửi email,
    SMS hay ứng dụng cho khách". The operator needs one fact before they type:
    this is filed, not sent. The channel is dropped because "lưu vào hồ sơ đặt
    phòng" already says where it goes.
  */
  composerNote: 'Được lưu vào hồ sơ đặt phòng; chưa gửi tới khách.',
};
