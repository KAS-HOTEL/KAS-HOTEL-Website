import { cookies } from 'next/headers';
import { cache } from 'react';
import type { ConversationFilters } from '@/lib/api/endpoints';
import { loadAutomationLog, loadInbox, loadTemplates, loadThread } from './load';
import type {
  AutomationLogResult,
  InboxResult,
  TemplatesResult,
  ThreadResult,
} from './load';

/**
 * Server-side reads for the messaging workspace.
 *
 * A Server Component has no browser to attach cookies, so the incoming `Cookie`
 * header is forwarded explicitly — the same seam every other authenticated read
 * in this application uses. `cache` deduplicates within one render pass, which
 * matters here because the inbox page renders the list and the open conversation
 * side by side.
 */

export const inbox = cache(
  async (filters: ConversationFilters = {}): Promise<InboxResult> =>
    loadInbox(filters, (await cookies()).toString()),
);

export const thread = cache(
  async (reference: string): Promise<ThreadResult> =>
    loadThread(reference, (await cookies()).toString()),
);

export const templates = cache(
  async (): Promise<TemplatesResult> => loadTemplates((await cookies()).toString()),
);

export const automationLog = cache(
  async (): Promise<AutomationLogResult> => loadAutomationLog((await cookies()).toString()),
);
