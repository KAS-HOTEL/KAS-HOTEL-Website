'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { submissionsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { lifecycleLabel, type PropertyAdminView, type PropertyCompleteness } from '@/lib/domain/property';
import { submissionStatusLabel, type SubmissionView } from '@/lib/domain/submission';
import { Badge, Button, Card, useToast } from '@/ui/primitives';
import { revalidateProperties } from './actions';
import { PropertyStatus } from './PropertyStatus';
import styles from './Property.module.css';

const UNEXPECTED = 'Không gửi duyệt được lúc này. Vui lòng thử lại.';

/**
 * Sending a property for review — `POST /admin/properties/{id}/submit`.
 *
 * <h2>The action the Partner console never had</h2>
 *
 * The backend has had the endpoint, the `property_submission` table and the
 * whole decision workflow since V22, and the Admin console reviews what arrives.
 * Nothing put anything into the queue: a Partner could complete a hotel and had
 * no way to say so. This is that missing half.
 *
 * <h2>What approval does, said before the click</h2>
 *
 * Approving moves the property `DRAFT → COMING_SOON` and publishes every room
 * type with it, in one transaction — a `COMING_SOON` hotel appears in the public
 * list. That is a consequence the Partner should read before submitting, not
 * discover afterwards, so the confirmation names it. It is still not bookable;
 * the separate publish step does that, and `PublishPanel` explains it there.
 *
 * <h2>Two steps, because it leaves the building</h2>
 *
 * Submission is visible to someone else and cannot be withdrawn — there is no
 * un-submit endpoint. So the button asks first. The confirmation is inline
 * rather than a dialog, matching the Admin decision panel.
 *
 * <h2>The blockers are the server's</h2>
 *
 * The checklist comes from `GET /completeness`, the same read the endpoint gates
 * on, rendered verbatim. Nothing is recomputed here, so this panel cannot
 * disagree with the endpoint it calls; when the server refuses anyway, its own
 * `details[]` are shown.
 */
export function SubmitForReviewPanel({
  property,
  completeness,
  history,
}: {
  readonly property: PropertyAdminView;
  /** Null when the completeness read failed — a different thing from "incomplete". */
  readonly completeness: PropertyCompleteness | null;
  /** Newest first. Null when the history read failed. */
  readonly history: readonly SubmissionView[] | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Readonly<Record<string, string>> | null>(null);

  const latest = history?.[0] ?? null;
  const awaitingReview = latest?.status === 'SUBMITTED';

  // The server's own list, not a second opinion computed here.
  const missing =
    completeness === null ? null : completeness.sections.flatMap((section) => section.missing);
  const ready = missing !== null && missing.length === 0;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    setBlockers(null);
    try {
      await submissionsApi.submit(property.id);
      await revalidateProperties();
      toast.show('success', 'Đã gửi hồ sơ. Khách sạn đang chờ duyệt.');
      setConfirming(false);
      // The server is authoritative for what happens next; nothing is simulated.
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = caught.fieldErrors();
        if (Object.keys(fields).length > 0) {
          setBlockers(fields);
        }
        setError(messageFor(caught));
      } else {
        setError(UNEXPECTED);
      }
    } finally {
      setBusy(false);
    }
  }

  if (awaitingReview) {
    return (
      <Card title="Gửi duyệt">
        <p className={styles.publishNote}>
          Hồ sơ đã được gửi và <strong>đang chờ duyệt</strong>. Không cần gửi lại — chỉ có một hồ
          sơ mở tại một thời điểm.
        </p>
        <p className={styles.publishNote}>
          <Badge tone="accent">{submissionStatusLabel(latest.status)}</Badge>
        </p>
        {/* No cancel button: there is no endpoint that withdraws a submission,
            and a control that cannot do what it says is worse than none. */}
      </Card>
    );
  }

  if (property.lifecycleState !== 'DRAFT') {
    return (
      <Card title="Gửi duyệt">
        {/* `PropertyStatus` rather than the bare enum: this line printed
            "Trạng thái hiện tại: OPEN" in the middle of a Vietnamese sentence,
            while the header two panels above showed the same state as "Đang
            hoạt động". One state, one name — and the badge still carries the raw
            value in its tooltip and data attribute. */}
        <p className={styles.publishNote}>
          Khách sạn đã được duyệt và không cần gửi lại. Trạng thái hiện tại:{' '}
          <PropertyStatus state={property.lifecycleState} />.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Gửi duyệt">
      {/* A previous decision is the first thing to read when there is one: it
          says what to fix before submitting again. */}
      {latest !== null && latest.decisionReason !== null && latest.decisionReason !== undefined ? (
        <div className={styles.publishBlockers}>
          <p className={styles.publishNote}>
            Lần gửi trước: <strong>{submissionStatusLabel(latest.status)}</strong>
          </p>
          <p className={styles.publishNote}>{latest.decisionReason}</p>
        </div>
      ) : null}

      <p className={styles.publishNote}>
        Gửi duyệt để quản trị viên KAS xem xét hồ sơ. Khi được duyệt, khách sạn chuyển sang{' '}
        <strong>{lifecycleLabel('COMING_SOON')}</strong> và xuất hiện trong danh sách công khai cùng
        các loại phòng.
      </p>

      {missing === null ? (
        <p className={styles.publishNote}>
          Không tải được tiến độ hồ sơ, nên chưa thể biết khách sạn đã đủ điều kiện hay chưa.
        </p>
      ) : ready ? null : (
        <div className={styles.publishBlockers}>
          <p className={styles.publishNote}>Còn thiếu trước khi gửi duyệt được:</p>
          <ul>
            {missing.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}

      {error === null ? null : (
        <div className={styles.publishError} role="alert">
          <p>{error}</p>
          {blockers === null ? null : (
            <ul>
              {Object.entries(blockers).map(([field, message]) => (
                <li key={field}>
                  <strong>{field}</strong>
                  {message === '' ? null : <> — {message}</>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {confirming ? (
        <div className={styles.publishConfirm}>
          <p className={styles.publishNote}>
            Gửi <strong>{property.slug}</strong> để duyệt? Hồ sơ sẽ hiển thị với quản trị viên và{' '}
            <strong>không thể thu hồi</strong>.
          </p>
          <div className={styles.publishActions}>
            <Button onClick={onSubmit} disabled={busy}>
              {busy ? 'Đang gửi…' : 'Gửi duyệt'}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Huỷ
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)} disabled={!ready}>
          Gửi duyệt
        </Button>
      )}

      <p className={styles.publishNote}>
        Chưa sẵn sàng?{' '}
        <Link href={`/partner/properties/${property.id}/information`} className={styles.publishLink}>
          Hoàn thiện thông tin khách sạn
        </Link>
      </p>
    </Card>
  );
}
