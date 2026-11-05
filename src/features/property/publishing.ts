import { propertiesApi, submissionsApi } from '@/lib/api/endpoints';
import type { ApiError } from '@/lib/api/errors';
import { loadCovers } from '@/features/media/load';
import type { MediaCoverView } from '@/lib/domain/media';
import type { PropertyAdminView, PropertyCompleteness } from '@/lib/domain/property';
import { loadPropertyList } from './load';

/**
 * Everything the Admin publishing board needs, in one read.
 *
 * <h2>Why a loader rather than four calls in the page</h2>
 *
 * The same reason `load.ts` exists beside `server.ts`: nothing here touches
 * `next/headers`, so every branch — including the two that decide whether an
 * action is offered — is testable without a running server.
 *
 * <h2>Four sources, one fatal</h2>
 *
 * The property list is the board. Covers, the review queue and each property's
 * completeness are context: a hotel with no readable cover still needs to be
 * approvable, and a failed queue read must not make eight properties look as
 * though nobody has submitted them. So only the list can take the screen down,
 * and the other three degrade to a stated absence rather than to a wrong fact.
 */

export interface PublishingRow {
  readonly property: PropertyAdminView;
  /** `null` when this hotel has no cover, or when covers could not be read. */
  readonly cover: MediaCoverView | null;
  /**
   * The backend's own checklist, or `null` — either because the call failed or
   * because this state has no action for it to gate. Never computed here: the
   * board must not be able to disagree with the endpoint it calls.
   */
  readonly completeness: PropertyCompleteness | null;
  /** The submission awaiting a decision, if one is open. */
  readonly openSubmissionId: string | null;
}

export type PublishingBoardResult =
  | {
      readonly status: 'ok';
      readonly rows: readonly PublishingRow[];
      /** Distinguishes "no hotel has a cover" from "covers could not be read". */
      readonly coversUnavailable: boolean;
      /** True when the queue read failed, so "not submitted" cannot be claimed. */
      readonly queueUnavailable: boolean;
    }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * The two states in which an admin has something to do, and therefore the two
 * for which a readiness checklist is worth a round trip.
 *
 * `DRAFT` is approved and `COMING_SOON` is published; `OPEN`,
 * `TEMPORARILY_CLOSED` and `CLOSED` have no transition on this screen, so
 * fetching a checklist that gates nothing would be eight requests to render a
 * fact nobody can act on.
 */
const ACTIONABLE = new Set(['DRAFT', 'COMING_SOON']);

export async function loadPublishingBoard(
  cookieHeader?: string,
): Promise<PublishingBoardResult> {
  const list = await loadPropertyList(cookieHeader);
  if (list.status === 'error') {
    return list;
  }

  // Independent of one another, so they go together rather than in sequence.
  const [covers, queue, checklists] = await Promise.all([
    loadCovers('PROPERTY', cookieHeader),
    submissionsApi.queue(cookieHeader).catch(() => null),
    Promise.all(
      list.properties.map((property) =>
        ACTIONABLE.has(property.lifecycleState)
          ? propertiesApi.completeness(property.id, cookieHeader).catch(() => null)
          : Promise.resolve(null),
      ),
    ),
  ]);

  /*
    At most one submission per property can be open — the V22 partial unique
    index guarantees it — so a plain map is the right shape and cannot lose a
    row. The queue is already filtered to SUBMITTED by the backend.
  */
  const open = new Map<string, string>();
  for (const submission of queue ?? []) {
    open.set(submission.propertyId, submission.id);
  }

  return {
    status: 'ok',
    coversUnavailable: covers.status === 'error',
    queueUnavailable: queue === null,
    rows: list.properties.map((property, index) => ({
      property,
      cover: covers.status === 'ok' ? covers.covers.get(property.id) ?? null : null,
      completeness: checklists[index] ?? null,
      openSubmissionId: open.get(property.id) ?? null,
    })),
  };
}
