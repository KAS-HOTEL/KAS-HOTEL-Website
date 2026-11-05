import {
  conversationsApi,
  messageTemplatesApi,
  type ConversationFilters,
} from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type {
  AutomationLogEntry,
  ConversationPage,
  ConversationThread,
  MessageTemplate,
} from '@/lib/domain/conversation';

/**
 * Turns the messaging reads into states a page can render.
 *
 * Pure and transport-only, so every branch is testable without a running server.
 * Nothing here decides what a partner may see — the backend's scope filter does,
 * inside the SQL, including the count behind the inbox total.
 */

export type InboxResult =
  | { readonly status: 'ok'; readonly page: ConversationPage }
  | { readonly status: 'error'; readonly error: ApiError };

export type ThreadResult =
  | { readonly status: 'ok'; readonly thread: ConversationThread }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

export type TemplatesResult =
  | {
      readonly status: 'ok';
      readonly templates: readonly MessageTemplate[];
      readonly variables: readonly string[];
    }
  | { readonly status: 'error'; readonly error: ApiError };

export type AutomationLogResult =
  | { readonly status: 'ok'; readonly entries: readonly AutomationLogEntry[] }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * One page of conversations.
 *
 * **An empty page is a success.** "Nobody has been messaged yet" and "the inbox
 * failed to load" are different facts, and rendering the first when the second
 * is true hides a broken screen behind a plausible answer.
 */
export async function loadInbox(
  filters: ConversationFilters = {},
  cookieHeader?: string,
  locale = 'en',
): Promise<InboxResult> {
  try {
    return { status: 'ok', page: await conversationsApi.inbox(locale, filters, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * One conversation.
 *
 * **404 is the ownership boundary.** A reference belonging to another partner
 * and one that never existed are the same answer, because the predicate lives in
 * the backend's SQL. Nothing here may re-describe it as "not permitted".
 */
export async function loadThread(
  reference: string,
  cookieHeader?: string,
  locale = 'en',
): Promise<ThreadResult> {
  try {
    return { status: 'ok', thread: await conversationsApi.thread(reference, locale, cookieHeader) };
  } catch (error) {
    const failure = asApiError(error);
    return failure.isNotFound ? { status: 'notFound' } : { status: 'error', error: failure };
  }
}

/**
 * The template shelf, with the variables the server will accept.
 *
 * Both in one result because the editor is unusable without the second: it needs
 * to offer exactly what the validator allows, and a screen that loaded the
 * templates but not the variable list would invite bodies the server refuses.
 */
export async function loadTemplates(
  cookieHeader?: string,
  locale = 'en',
): Promise<TemplatesResult> {
  try {
    const [templates, variables] = await Promise.all([
      messageTemplatesApi.list(locale, cookieHeader),
      messageTemplatesApi.variables(cookieHeader),
    ]);
    return { status: 'ok', templates, variables };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

export async function loadAutomationLog(cookieHeader?: string): Promise<AutomationLogResult> {
  try {
    return { status: 'ok', entries: await conversationsApi.automationLog(cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError(0, {
        code: 'AVAILABILITY_UNAVAILABLE',
        message: 'Không thể kết nối tới hệ thống. Vui lòng thử lại.',
        details: [],
        correlationId: null,
      });
}
