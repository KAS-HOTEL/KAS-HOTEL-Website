'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { salesRequestsApi, type SalesRequestNote } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { formatBusinessDateTime } from '@/lib/domain/salesRequest';
import { Button, Card, Textarea, useToast } from '@/ui/primitives';
import styles from './SalesRequest.module.css';

/**
 * Internal notes — doc 58 §5,
 * {@code GET/POST /admin/sales/requests/{reference}/notes}, permission
 * {@code sales.request.manage}: *"Internal. No guest surface exists."*
 *
 * <h2>The lock is a frozen requirement, not decoration</h2>
 *
 * Doc 21 §592 specifies it exactly: *"🔒 Distinct colour, lock icon, explicit
 * 'Internal — never shown to the guest' label."* Doc 21 §604 states the rule it
 * protects, **CONFIRMED**: *"The public customer must never see internal
 * notes."* So the label is not reassurance — it is what stops an agent writing
 * something here believing the guest will read it.
 *
 * The boundary is structural underneath: V14 keeps internal notes and
 * guest-visible messages in **two separate tables**, deliberately *"not one
 * table with a visibility flag"*, so there is nothing here that could be
 * toggled.
 *
 * <h2>No author is shown, because none is sent</h2>
 *
 * Every note records an `admin_id`, and the API returns none of it —
 * `app_user` has no name column and staff-identity disclosure is unresolved
 * (doc 134 §5). The status timeline withholds the same field for the same
 * reason.
 *
 * <h2>No editing, no deleting</h2>
 *
 * Doc 58 §5 gives this route `GET` and `POST` and nothing else. A note is a
 * record of what someone knew at a moment; the contract offers no way to revise
 * it, and this panel invents none.
 */
export function InternalNotesPanel({
  reference,
  notes,
  failed,
  copy,
}: {
  readonly reference: string;
  readonly notes: readonly SalesRequestNote[];
  /** True when the list could not be loaded — different from "there are none". */
  readonly failed: boolean;
  readonly copy: NotesCopy;
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ready = body.trim() !== '';

  async function submit(): Promise<void> {
    // The guard is the state, not the button's disabled attribute: a repeated
    // Enter landing between the click and the re-render must still be a no-op.
    if (busy || !ready) {
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await salesRequestsApi.addNote(reference, body.trim());
      setBody('');
      // The server owns the list. Re-read rather than appending locally, so the
      // panel can never show a note the record does not have.
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
        {/*
          Doc 21 §592's frozen affordance: lock, distinct treatment, and the
          explicit sentence. Said before the agent types, not after.
        */}
        <p className={styles.internalBanner}>
          <span aria-hidden="true">🔒</span> {copy.internalOnly}
        </p>

        <Textarea
          id="internal-note"
          label={copy.label}
          description={copy.hint}
          rows={3}
          value={body}
          disabled={busy}
          onChange={(event) => setBody(event.target.value)}
        />

        <div className={styles.declineActions}>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ready || busy}
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

        {failed ? (
          // "Nobody has written anything" and "the notes could not be loaded"
          // are different facts, and the second must not look like the first.
          <p className={styles.problem} role="status">
            {copy.loadFailed}
          </p>
        ) : notes.length === 0 ? (
          <p className={styles.note}>{copy.empty}</p>
        ) : (
          <ul className={styles.notes}>
            {notes.map((entry) => (
              <li key={`${entry.createdAt}-${entry.body}`} className={styles.noteEntry}>
                <p className={styles.noteBody}>{entry.body}</p>
                <time dateTime={entry.createdAt} className={styles.noteAt}>
                  {formatBusinessDateTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/**
 * Maps a refusal onto something an agent can act on, through the shared doc 58
 * §2.1 mapping — so a 404 stays "not found" and never becomes "forbidden".
 *
 * A 400 shows the backend's own field message, which for this route is about the
 * note body and is written for the caller.
 */
function describe(caught: unknown, copy: NotesCopy): string {
  if (!(caught instanceof ApiError)) {
    return copy.errorNetwork;
  }
  if (caught.status === 400) {
    return caught.details[0]?.message ?? caught.message;
  }
  return messageFor(caught);
}

export interface NotesCopy {
  readonly title: string;
  readonly internalOnly: string;
  readonly label: string;
  readonly hint: string;
  readonly action: string;
  readonly submitting: string;
  readonly success: string;
  readonly empty: string;
  readonly loadFailed: string;
  readonly errorNetwork: string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const NOTES_COPY: NotesCopy = {
  title: 'Ghi chú nội bộ',
  internalOnly: 'Nội bộ — khách không bao giờ nhìn thấy nội dung này.',
  label: 'Thêm ghi chú',
  hint: 'Ghi lại thông tin cần thiết cho đồng nghiệp. Không thể sửa hoặc xoá sau khi lưu.',
  action: 'Lưu ghi chú',
  submitting: 'Đang lưu…',
  success: 'Đã lưu ghi chú nội bộ.',
  empty: 'Chưa có ghi chú nào cho yêu cầu này.',
  loadFailed: 'Không tải được ghi chú nội bộ. Vui lòng tải lại trang.',
  errorNetwork: 'Không kết nối được tới hệ thống. Vui lòng thử lại.',
};
