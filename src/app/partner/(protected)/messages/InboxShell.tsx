import Link from 'next/link';
import type { ConversationFilters } from '@/lib/api/endpoints';
import {
  conversationPageCount,
  isPastEnd,
  type ConversationPage,
} from '@/lib/domain/conversation';
import {
  CONVERSATION_FILTER_COPY,
  ConversationFilterBar,
  inboxHref,
} from '@/features/messaging/ConversationFilterBar';
import {
  CONVERSATION_LIST_COPY,
  ConversationList,
} from '@/features/messaging/ConversationList';
import styles from '@/features/messaging/Messaging.module.css';

/**
 * The inbox chrome both messaging pages render: title, tabs, filters, the
 * conversation list and its pager.
 *
 * <h2>Why a shared component and not a route `layout.tsx`</h2>
 *
 * A layout would be the obvious home for this, and it cannot be: App Router
 * layouts do not receive `searchParams`, and every part of this chrome is driven
 * by them — the search box's value, the filter selects, the pager's links and
 * the list itself. A layout would have to render an inbox that ignored the
 * query string it is standing next to.
 *
 * <p>So both pages render this, and both pass the same filters they used to
 * fetch. The list is shared markup rather than a shared subtree, which costs one
 * extra render and keeps the URL as the single source of state.
 */
export function InboxShell({
  page,
  filters,
  properties,
  activeReference,
  children,
}: {
  readonly page: ConversationPage;
  readonly filters: ConversationFilters;
  readonly properties: readonly { readonly slug: string; readonly label: string }[];
  /** Set when a conversation is open, so the list marks it and mobile hides the list. */
  readonly activeReference?: string;
  readonly children?: React.ReactNode;
}) {
  const pages = conversationPageCount(page);
  const current = page.page;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Tin nhắn</h1>

      {/*
        One line of orientation.

        This was a three-clause paragraph that also explained the delivery
        position — stored in KAS, no email/SMS/app channel, the guest has not
        received it. That claim is made once, as a caption under the composer,
        which is where an operator is about to act on it. Stating it here as
        well meant the screen opened by explaining what it could not do.
      */}
      <p className={styles.pageIntro}>
        Tin nhắn gắn với từng đặt phòng trong phạm vi tài khoản của bạn.
      </p>

      <nav className={styles.tabs} aria-label="Khu vực tin nhắn">
        <Link href="/partner/messages" className={styles.tab} data-active>
          Hộp thư
        </Link>
        <Link href="/partner/messages/templates" className={styles.tab}>
          Tin nhắn mẫu
        </Link>
      </nav>

      <ConversationFilterBar
        active={filters}
        properties={properties}
        copy={CONVERSATION_FILTER_COPY}
      />

      <div className={styles.split} data-open={activeReference === undefined ? undefined : true}>
        <div className={styles.listPane}>
          <ConversationList
            conversations={page.items}
            // Spread rather than passed: `exactOptionalPropertyTypes` treats an
            // explicit `undefined` as different from an absent property, and the
            // prop is genuinely absent when no conversation is open.
            {...(activeReference === undefined ? {} : { activeReference })}
            hrefFor={(reference) => inboxHref(filters, reference)}
            pastEnd={isPastEnd(page)}
            copy={CONVERSATION_LIST_COPY}
          />

          {page.total === 0 ? null : (
            <nav className={styles.pager} aria-label="Phân trang hộp thư">
              <p className={styles.pagerSummary} role="status">
                {`${page.total} cuộc trò chuyện`}
              </p>
              {pages <= 1 && current === 0 ? null : (
                <div className={styles.pagerControls}>
                  <PageLink
                    filters={filters}
                    page={current - 1}
                    disabled={current <= 0}
                    label="Trang trước"
                  />
                  <span className={styles.pagerSummary}>
                    {`Trang ${Math.min(current + 1, pages)} / ${pages}`}
                  </span>
                  <PageLink
                    filters={filters}
                    page={current + 1}
                    disabled={current + 1 >= pages}
                    label="Trang sau"
                  />
                </div>
              )}
            </nav>
          )}
        </div>

        {/*
          The pane always has something in it.

          On the inbox route no conversation is open, and this column rendered
          nothing at all — two thirds of a desktop screen of empty ivory beside
          a narrow list. A prompt holds the shape the conversation will take,
          so choosing one swaps the contents of the pane instead of rebuilding
          the page. It is hidden below 1024, where the panes stack and the list
          is the whole screen.
        */}
        <div className={styles.conversationPane}>
          {children ?? (
            <div className={styles.conversationEmpty}>
              <p className={styles.conversationEmptyTitle}>Chọn một cuộc trò chuyện</p>
              <p className={styles.conversationEmptyBody}>
                Chọn một đặt phòng ở danh sách bên trái để đọc và soạn tin nhắn.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One page link, or an inert span at the ends.
 *
 * A disabled anchor is not a thing HTML has: an `<a>` without an `href` is still
 * announced as a link by some screen readers. A `span` with `aria-disabled` says
 * what it is and cannot be followed.
 */
function PageLink({
  filters,
  page,
  disabled,
  label,
}: {
  readonly filters: ConversationFilters;
  readonly page: number;
  readonly disabled: boolean;
  readonly label: string;
}) {
  if (disabled) {
    return (
      <span className={styles.pagerDisabled} aria-disabled="true">
        {label}
      </span>
    );
  }
  return (
    <Link className={styles.pagerLink} href={inboxHref({ ...filters, page })}>
      {label}
    </Link>
  );
}
