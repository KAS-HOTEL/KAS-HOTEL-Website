import { api } from '../client';
import type {
  AutomationLogEntry,
  ConversationPage,
  ConversationThread,
  MessageTemplate,
} from '@/lib/domain/conversation';

/**
 * The Partner messaging workspace — doc 58 §5's guest-visible messages, served
 * from the all-channel `/ops` namespace.
 *
 * <h2>`/ops`, not `/sales`</h2>
 *
 * Doc 58 §5 freezes `POST /sales/requests/{reference}/messages` and its
 * permission, `sales.request.manage` — which the backend honours verbatim. What
 * is not reused is the **path**: the sales API is DIRECT-only at the data layer,
 * so a messages route there could never carry a conversation with an OTA guest.
 * One implementation on the wider namespace, rather than two that would drift.
 *
 * <h2>Nothing here sends anything</h2>
 *
 * `record` persists a message against the reservation. There is no mail sender,
 * no SMS provider and no push transport in this application (OQ-162), so the
 * thread reports `deliveryChannel: 'IN_KAS'` and every `sentAt` is absent. The
 * function is not called `send`, because it does not.
 */

export interface ConversationFilters {
  /** Matched against reference and guest name — and, with `customer.view`, phone and email. */
  readonly q?: string;
  /** A property slug, never an id. */
  readonly property?: string;
  readonly channelType?: string;
  readonly page?: number;
  readonly size?: number;
}

function definedOnly(filters: ConversationFilters): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export const conversationsApi = {
  /**
   * `GET /api/v1/admin/ops/conversations` — permission `reservation.view`.
   *
   * Reservations in scope that have at least one message, most recently written
   * first. A reservation nobody has messaged is not a conversation and is not
   * listed; a thread starts from the reservation itself.
   */
  inbox: (locale: string, filters: ConversationFilters = {}, cookieHeader?: string) =>
    api.get<ConversationPage>('/api/v1/admin/ops/conversations', {
      query: { locale, ...definedOnly(filters) },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /**
   * `GET /api/v1/admin/ops/reservations/{reference}/messages` — the thread.
   *
   * Oldest first, the order a conversation is read in — the opposite of the
   * inbox, which is ordered by recency because that is how a queue is worked.
   */
  thread: (reference: string, locale: string, cookieHeader?: string) =>
    api.get<ConversationThread>(
      `/api/v1/admin/ops/reservations/${encodeURIComponent(reference)}/messages`,
      { query: { locale }, ...(cookieHeader === undefined ? {} : { cookieHeader }) },
    ),

  /**
   * `POST …/messages/preview` — doc 58 §5's mandatory preview.
   *
   * A POST because it carries a body, not because it changes anything: nothing
   * is written. It resolves `{{variables}}` against the real reservation, which
   * the browser cannot do because it does not hold the data — a preview computed
   * client-side would show a different sentence from the one about to be stored.
   *
   * Refuses **400** for a variable the server cannot fill.
   */
  preview: (reference: string, body: string) =>
    api.post<{ readonly body: string; readonly variables: readonly string[] }>(
      `/api/v1/admin/ops/reservations/${encodeURIComponent(reference)}/messages/preview`,
      { body },
    ),

  /**
   * `POST …/messages` — records one guest-visible message.
   *
   * Sends the **previewed** text, not the template: doc 58 §5 makes preview
   * mandatory so that what the operator approved and what is stored are one
   * string. `templateId` is provenance only — the server does not re-expand it.
   *
   * Returns the whole thread, so the composer renders the server's own record
   * rather than an optimistic copy of what it hoped was written.
   *
   * Refuses **400** for an empty body or one still containing `{{variables}}` ·
   * **404** for a reference that is absent or another partner's.
   */
  record: (reference: string, body: string, templateId?: string) =>
    api.post<ConversationThread>(
      `/api/v1/admin/ops/reservations/${encodeURIComponent(reference)}/messages`,
      { body, ...(templateId === undefined ? {} : { templateId }) },
    ),

  /** `GET /api/v1/admin/ops/message-automation/log` — what automation produced. */
  automationLog: (cookieHeader?: string) =>
    api.get<AutomationLogEntry[]>(
      '/api/v1/admin/ops/message-automation/log',
      cookieHeader === undefined ? {} : { cookieHeader },
    ),
} as const;

/** The body a template create/update accepts. */
export interface MessageTemplateInput {
  readonly name: string;
  readonly body: string;
  readonly locale: string;
  readonly trigger: string;
  readonly leadDays?: number;
  /** Only honoured on create — a template never moves between properties. */
  readonly property?: string;
}

/**
 * Message templates — `/api/v1/admin/message-templates`, permission
 * `sales.request.manage` throughout.
 *
 * A template is guest-facing prose, so reading the shelf takes the same
 * permission as writing to it: there is no read-only audience for it that is not
 * also allowed to send.
 */
export const messageTemplatesApi = {
  /**
   * The variables a body may use.
   *
   * Fetched rather than hardcoded so the editor offers exactly what the
   * validator accepts — two copies would eventually disagree, and the UI would
   * suggest a placeholder the server then refuses.
   */
  variables: (cookieHeader?: string) =>
    api.get<string[]>(
      '/api/v1/admin/message-templates/variables',
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  list: (locale: string, cookieHeader?: string) =>
    api.get<MessageTemplate[]>('/api/v1/admin/message-templates', {
      query: { locale },
      ...(cookieHeader === undefined ? {} : { cookieHeader }),
    }),

  /** Always created disabled: automation is never switched on by writing a body. */
  create: (input: MessageTemplateInput) =>
    api.post<MessageTemplate>('/api/v1/admin/message-templates', input),

  update: (id: string, input: MessageTemplateInput) =>
    api.put<MessageTemplate>(`/api/v1/admin/message-templates/${encodeURIComponent(id)}`, input),

  /**
   * `PUT /{id}/enabled` — its own route, because a toggle is not an edit.
   *
   * Switching a `BEFORE_CHECK_IN` template on is the moment its body starts
   * being written to real reservations on a schedule; that decision should not
   * be reachable as a side effect of fixing a typo.
   */
  setEnabled: (id: string, enabled: boolean) =>
    api.put<MessageTemplate>(
      `/api/v1/admin/message-templates/${encodeURIComponent(id)}/enabled`,
      { enabled },
    ),

  /**
   * Removes a body from the shelf. Messages already written from it survive —
   * `reservation_message.template_id` is `ON DELETE SET NULL`.
   */
  remove: (id: string) =>
    api.delete<void>(`/api/v1/admin/message-templates/${encodeURIComponent(id)}`),
} as const;
