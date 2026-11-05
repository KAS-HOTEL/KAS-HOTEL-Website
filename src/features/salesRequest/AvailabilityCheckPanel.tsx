'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { salesRequestsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, useToast } from '@/ui/primitives';
import styles from './SalesRequest.module.css';

/**
 * S3 / S4 — the live availability re-check. Doc 54 §4 S3/S4, doc 58 §5
 * {@code POST /admin/sales/requests/{reference}/availability-check}.
 *
 * <h2>One click, not two — and the difference is deliberate</h2>
 *
 * {@link DeclineRequestPanel} takes two deliberate clicks because a decline is
 * terminal and hands back inventory. A re-check is the ordinary next step: it
 * moves no rooms, releases nothing, and creates nothing a guest can see. Making
 * the routine action as heavy as the destructive one would teach agents to click
 * through confirmations.
 *
 * <h2>The server owns the outcome</h2>
 *
 * A 204 means the transition happened; it does not say what the check found, and
 * this endpoint returns no result document. So nothing here renders an
 * availability figure — {@code router.refresh()} re-reads the detail and the
 * status badge shows whatever the server now holds. A locally-flipped badge
 * could claim a state the record does not have.
 *
 * <h2>Which states offer it</h2>
 *
 * {@code REQUESTED} and {@code ASSIGNED} only — the two source states
 * {@code SalesRequestService.CHECKABLE_FROM} accepts. Doc 54 has no
 * {@code AVAILABILITY_CHECK → AVAILABILITY_CHECK} row, so a request that has
 * already been checked is offered nothing rather than a button the server would
 * answer 409. The gate here is a convenience, never the boundary: the backend
 * refuses every other state on its own, and a 409 is handled below.
 */
export function AvailabilityCheckPanel({
  reference,
  copy,
}: {
  readonly reference: string;
  readonly copy: AvailabilityCheckCopy;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(): Promise<void> {
    // The guard is the state, not the button's disabled attribute: a second
    // click that lands between the event and the re-render must still be a
    // no-op, or one agent produces two availability checks.
    if (busy) {
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await salesRequestsApi.availabilityCheck(reference);
      // Re-read rather than patch. The 204 carries no state, and the status this
      // moved to is the server's to report.
      router.refresh();
      toast.show('success', copy.success);
    } catch (caught) {
      setProblem(describe(caught, copy));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={copy.title}>
      <div className={styles.declinePanel}>
        <p className={styles.note}>{copy.intro}</p>

        <div className={styles.declineActions}>
          <Button
            variant="primary"
            loading={busy}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? copy.submitting : copy.action}
          </Button>
        </div>

        {/* One live region, so a failure is announced once. */}
        <div aria-live="polite" aria-atomic="true">
          {problem === null ? null : (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Maps a refusal onto something an agent can act on.
 *
 * The shared doc 58 §2.1 mapping does the general work — a 404 stays "not
 * found" and never becomes "forbidden", which is what doc 85 §6.3 uses 404 to
 * hide. Two cases get wording of their own because the generic text would be
 * misleading here:
 *
 * <ul>
 *   <li><strong>409</strong> — "the information changed, reload" is right for an
 *       optimistic-locking conflict but not for this: the request is in a state
 *       this transition does not leave, which is usually because someone else
 *       already checked it.</li>
 *   <li><strong>422 {@code NO_AVAILABILITY}</strong> — the check ran and the
 *       rooms are gone. That is the answer the agent came for, not a validation
 *       problem, and the transition rolled back with it.</li>
 * </ul>
 */
function describe(caught: unknown, copy: AvailabilityCheckCopy): string {
  if (!(caught instanceof ApiError)) {
    return copy.errorNetwork;
  }
  if (caught.isConflict) {
    return copy.errorAlreadyMoved;
  }
  if (caught.code === 'NO_AVAILABILITY') {
    return copy.errorNoAvailability;
  }
  return messageFor(caught);
}

export interface AvailabilityCheckCopy {
  readonly title: string;
  readonly intro: string;
  readonly action: string;
  readonly submitting: string;
  readonly success: string;
  readonly errorAlreadyMoved: string;
  readonly errorNoAvailability: string;
  readonly errorNetwork: string;
}

/**
 * Vietnamese only — doc 69 §325, <em>"One console language in V1 (config A12)."</em>
 * The guest surface is bilingual; the console is not, and this is the console.
 */
export const AVAILABILITY_CHECK_COPY: AvailabilityCheckCopy = {
  title: 'Kiểm tra phòng trống',
  intro:
    'Kiểm tra lại số phòng còn trống cho đúng ngày và hạng phòng khách đã yêu cầu, ngay tại thời điểm này. Thao tác này không giữ thêm phòng và không gửi gì cho khách.',
  action: 'Kiểm tra phòng trống',
  submitting: 'Đang kiểm tra…',
  success: 'Đã kiểm tra phòng trống. Yêu cầu chuyển sang trạng thái AVAILABILITY_CHECK.',
  errorAlreadyMoved:
    'Yêu cầu này đã được xử lý bởi người khác. Vui lòng tải lại để xem trạng thái mới nhất.',
  errorNoAvailability:
    'Không còn đủ phòng trống cho yêu cầu này. Trạng thái yêu cầu được giữ nguyên.',
  errorNetwork: 'Không kết nối được tới hệ thống. Vui lòng thử lại.',
};
