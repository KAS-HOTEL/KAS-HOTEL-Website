'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { submissionsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { DECISIONS, type DecisionKey, type SubmissionView } from '@/lib/domain/submission';
import { Button, Textarea, useToast } from '@/ui/primitives';
import { revalidateReview } from './actions';
import styles from './Review.module.css';

/**
 * The three decisions an Admin can take on an open submission.
 *
 * <h2>Approving publishes</h2>
 *
 * `approve` is not a status change in isolation: in one transaction it moves the
 * property `DRAFT → COMING_SOON` and publishes every one of its room types, and
 * a `COMING_SOON` property is publicly listed. So the confirmation says that
 * plainly rather than asking "are you sure?" — the thing worth confirming is the
 * consequence, not the click.
 *
 * <h2>A reason is required, and required here for the same reason it is required there</h2>
 *
 * `reject` and `request-changes` both carry `@NotBlank`, and `property_submission`
 * has a CHECK enforcing it again in SQL. This blocks the submit while the box is
 * empty so the Admin is not told by a 400 what the form could have told them —
 * but the server remains the authority, and a refusal from it is shown as one.
 *
 * <h2>Two decisions cannot both land</h2>
 *
 * The decision write is a compare-and-set on `status = 'SUBMITTED'`, so a second
 * Admin acting on the same submission gets **409**. That is surfaced as its own
 * message with a reload, because it is the one error retyping cannot fix.
 */
export function DecisionPanel({ submission }: { readonly submission: SubmissionView }) {
  const router = useRouter();
  const toast = useToast();

  const [choice, setChoice] = useState<DecisionKey | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const selected = DECISIONS.find((decision) => decision.key === choice) ?? null;
  const reasonMissing = selected?.needsReason === true && reason.trim() === '';

  async function submit(): Promise<void> {
    if (selected === null || reasonMissing) {
      return;
    }

    setBusy(true);
    setError(null);
    setConflict(false);

    try {
      const trimmed = reason.trim();
      if (selected.key === 'approve') {
        await submissionsApi.approve(submission.id);
      } else if (selected.key === 'reject') {
        await submissionsApi.reject(submission.id, trimmed);
      } else {
        await submissionsApi.requestChanges(submission.id, trimmed);
      }

      await revalidateReview(submission.propertyId);
      router.refresh();
      toast.show('success', `${selected.label} — đã ghi nhận.`);
      setChoice(null);
      setReason('');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(messageFor(caught));
        setConflict(caught.isConflict);
      } else {
        // Never the raw exception: it can carry a URL or an internal hostname.
        setError('Không thể kết nối tới hệ thống. Vui lòng thử lại.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.decision} aria-labelledby="decision-heading">
      <h2 className={styles.decisionTitle} id="decision-heading">
        Quyết định
      </h2>

      {error === null ? null : (
        <div className={styles.decisionAlert} role="alert">
          <p className={styles.decisionAlertText}>{error}</p>
          {conflict ? (
            <Button variant="secondary" onClick={() => router.refresh()}>
              Tải lại trạng thái mới nhất
            </Button>
          ) : null}
        </div>
      )}

      <div className={styles.decisionChoices} role="group" aria-label="Chọn quyết định">
        {DECISIONS.map((decision) => (
          <Button
            key={decision.key}
            variant={choice === decision.key ? 'primary' : 'secondary'}
            aria-pressed={choice === decision.key}
            disabled={busy}
            onClick={() => {
              setChoice(decision.key);
              setError(null);
            }}
          >
            {decision.label}
          </Button>
        ))}
      </div>

      {selected === null ? (
        <p className={styles.decisionHint}>Chọn một quyết định để tiếp tục.</p>
      ) : (
        <>
          <p className={styles.decisionHint}>
            {selected.key === 'approve'
              ? 'Duyệt sẽ chuyển khách sạn sang COMING_SOON và công bố toàn bộ loại phòng. Khách sẽ thấy khách sạn này trong danh sách công khai.'
              : selected.key === 'reject'
                ? 'Từ chối hồ sơ này. Lý do sẽ được gửi tới đối tác.'
                : 'Gửi lại cho đối tác chỉnh sửa. Đối tác sẽ nộp một hồ sơ mới.'}
          </p>

          {selected.needsReason ? (
            <Textarea
              id="decision-reason"
              label="Lý do"
              required
              rows={4}
              maxLength={2000}
              description="Bắt buộc. Nội dung này được gửi tới đối tác, không hiển thị cho khách."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            />
          ) : null}

          <div className={styles.decisionActions}>
            <Button
              variant={selected.key === 'reject' ? 'danger' : 'primary'}
              loading={busy}
              disabled={busy || reasonMissing}
              onClick={submit}
            >
              {selected.label}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setChoice(null);
                setReason('');
                setError(null);
              }}
            >
              Huỷ
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
