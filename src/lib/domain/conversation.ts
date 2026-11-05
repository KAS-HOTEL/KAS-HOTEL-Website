import { present } from './reservation';

/**
 * The Partner messaging workspace — doc 58 §5's guest-visible messages, read
 * through the all-channel `/ops` namespace.
 *
 * <h2>A conversation is a reservation</h2>
 *
 * There is no conversation id anywhere in these types. `reservation_message`
 * ties every message to a reservation, so one reservation is one thread by
 * construction, and `reference` addresses it — the identifier doc 85 §11 row 7
 * already makes addressable.
 *
 * <h2>One participant, so no direction and no unread</h2>
 *
 * Every message was written by the partner's own staff. There is no
 * `senderType`, no `direction`, no inbound message and no unread flag, because
 * **no customer surface can reach this thread**: customer sign-in and stays
 * exist, but there is still no customer messaging endpoint. The guest's receipt
 * page is deliberately content-free so a guessable reference discloses nothing.
 * Modelling inbound messages or an unread badge would describe a conversation
 * this product cannot yet have — and would count the partner's own words back
 * at them.
 */

/** One inbox row. */
export interface ConversationSummary {
  readonly reference: string;
  readonly guestName: string | null;
  /** Null unless the session holds `customer.view` — doc 59:148. */
  readonly guestPhone: string | null;
  /** Null unless the session holds `customer.view` — doc 59:148. */
  readonly guestEmail: string | null;
  readonly propertySlug: string;
  readonly propertyName: string | null;
  readonly channelType: string;
  readonly checkIn: string;
  readonly checkOut: string;
  /** The newest message, truncated server-side so every width shows the same sentence. */
  readonly lastMessagePreview: string | null;
  readonly lastMessageAt: string;
  readonly lastMessageAutomated: boolean;
  readonly messageCount: number;
}

export interface ConversationPage {
  readonly items: readonly ConversationSummary[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface ConversationThread {
  readonly subject: ConversationSubject;
  readonly messages: readonly ConversationMessage[];
  /** `IN_KAS` — recorded against the reservation, not transmitted. */
  readonly deliveryChannel: string;
}

export interface ConversationSubject {
  readonly reference: string;
  readonly guestName: string | null;
  readonly guestPhone: string | null;
  readonly guestEmail: string | null;
  readonly propertySlug: string;
  readonly propertyName: string | null;
  readonly channelType: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: number;
  readonly adults: number;
  readonly children: number;
  readonly rooms: number;
}

export interface ConversationMessage {
  readonly id: string;
  readonly body: string;
  readonly locale: string;
  readonly createdAt: string;
  /**
   * When it left KAS for the guest.
   *
   * **Absent on every message this application writes**, because no transport
   * exists. Rendering a tick for it would claim a delivery nobody performed.
   */
  readonly sentAt: string | null;
  readonly automated: boolean;
  readonly templateName: string | null;
}

/** One reusable template. */
export interface MessageTemplate {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly locale: string;
  readonly trigger: string;
  readonly leadDays: number | null;
  readonly enabled: boolean;
  readonly propertySlug: string | null;
  readonly propertyName: string | null;
  readonly variables: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One automated message that was actually produced. */
export interface AutomationLogEntry {
  readonly reference: string;
  readonly templateName: string;
  readonly trigger: string;
  readonly propertySlug: string;
  readonly recordedAt: string;
  readonly sentAt: string | null;
  readonly status: string;
}

/**
 * The two triggers the backend accepts.
 *
 * The stay lifecycle's other transitions are deliberately absent: doc 58 §6's
 * `/check-in`, `/check-out` and `/no-show` routes are unimplemented and there is
 * no domain-event pipeline, so nothing could observe them. Offering one would be
 * a switch that never fires.
 */
export const MESSAGE_TRIGGERS = ['MANUAL', 'BEFORE_CHECK_IN'] as const;

export const TRIGGER_LABEL: Readonly<Record<string, string>> = {
  MANUAL: 'Chèn thủ công',
  BEFORE_CHECK_IN: 'Trước ngày nhận phòng',
};

export function triggerLabel(trigger: string): string {
  return TRIGGER_LABEL[trigger] ?? trigger;
}

/**
 * How the delivery channel reads to an operator.
 *
 * `IN_KAS` is the only value this application can honestly return, and the
 * label says what it means rather than implying a send: the message is saved
 * against the booking and has not been transmitted to the guest.
 */
export const DELIVERY_LABEL: Readonly<Record<string, string>> = {
  IN_KAS: 'Lưu trong KAS',
};

export function deliveryLabel(channel: string): string {
  return DELIVERY_LABEL[channel] ?? channel;
}

/**
 * When a message was recorded, as an operator reads a clock: `09/09 · 17:42`.
 *
 * <h2>Why not the raw instant</h2>
 *
 * Both the inbox and the thread printed `2026-09-09T10:42:00Z` — the wire
 * value. It is precise, unreadable at a glance, and in the wrong zone: a
 * Vietnamese front desk reading "10:42" for a message sent at 17:42 is being
 * actively misled.
 *
 * <h2>Asia/Ho_Chi_Minh, named explicitly</h2>
 *
 * Not the runtime's zone. These render in a server component, so the machine's
 * zone would decide what the operator sees and the same message would carry
 * different times in development and in production. The console is
 * Vietnamese-only (doc 69 §325) and its operators are in one country, so the
 * property's own zone is the honest constant — and naming it keeps the server
 * and the client agreeing, which is what stops a hydration mismatch.
 *
 * <p>The date is kept alongside the time: a thread spans days, and "17:42"
 * alone cannot say which one. The full instant stays in the element's
 * `dateTime` attribute for anything that needs it exactly.
 *
 * <p>An unparseable value is returned untouched rather than rendered as
 * "Invalid Date".
 */
export function messageStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const of = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${of('day')}/${of('month')} · ${of('hour')}:${of('minute')}`;
}

export const AUTOMATION_STATUS_LABEL: Readonly<Record<string, string>> = {
  RECORDED: 'Đã ghi nhận',
  SENT: 'Đã gửi',
};

export function automationStatusLabel(status: string): string {
  return AUTOMATION_STATUS_LABEL[status] ?? status;
}

/** The display name, falling back to the slug the backend addressed it by. */
export function conversationPropertyLabel(
  conversation: Pick<ConversationSummary, 'propertyName' | 'propertySlug'>,
): string {
  return conversation.propertyName ?? conversation.propertySlug;
}

/**
 * One stay date, as a Vietnamese operator writes one: `20/09/2026`.
 *
 * Rearranged from the wire form rather than parsed. `new Date('2026-09-20')`
 * is midnight UTC, so any formatter that then applies a zone can move the day
 * — west of Greenwich it becomes the 19th. A date with no time has no instant
 * to convert, so this reorders the three fields and touches nothing else.
 *
 * <p>Anything that is not `YYYY-MM-DD` is returned untouched: the value came
 * from the server and showing it verbatim is better than showing a guess.
 */
export function stayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match === null ? iso : `${match[3]}/${match[2]}/${match[1]}`;
}

/** `20/09/2026 → 22/09/2026`, from the server's own dates. */
export function stayRange(
  conversation: Pick<ConversationSummary, 'checkIn' | 'checkOut'>,
): string {
  return `${stayDate(conversation.checkIn)} → ${stayDate(conversation.checkOut)}`;
}

/**
 * The placeholders in a body, in the order they appear.
 *
 * Mirrors the server's pattern so the editor can highlight what it is about to
 * send. It is a **display aid only** — the authoritative check is the backend's,
 * which refuses an unknown variable with a 400 naming it. Duplicating the
 * decision here would create two rules that could disagree.
 */
export function variablesIn(body: string): readonly string[] {
  return Array.from(body.matchAll(/\{\{\s*([^{}]*?)\s*}}/g)).map((match) => match[1] ?? '');
}

/** Placeholders the server does not support, for an inline warning while typing. */
export function unsupportedVariables(
  body: string,
  supported: readonly string[],
): readonly string[] {
  const known = new Set(supported);
  return Array.from(new Set(variablesIn(body).filter((name) => !known.has(name))));
}

/**
 * Whether a body is ready to record.
 *
 * A message must be non-empty and carry no placeholder: the backend refuses
 * both, and a composer that let either through would be inviting a failure it
 * could have prevented.
 */
export function canSend(body: string): boolean {
  return body.trim() !== '' && variablesIn(body).length === 0;
}

/** Which page numbers a pager should offer. Derived from the server's own total. */
export function conversationPageCount(page: Pick<ConversationPage, 'total' | 'size'>): number {
  if (page.size < 1) {
    return 1;
  }
  return Math.max(1, Math.ceil(page.total / page.size));
}

/** True when the page is empty but the search matched something — a dead end. */
export function isPastEnd(page: Pick<ConversationPage, 'items' | 'total'>): boolean {
  return page.items.length === 0 && page.total > 0;
}

/** Re-exported so the messaging components have one nullish helper, not two. */
export { present };
