'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { propertiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  lifecycleLabel,
  type PropertyAdminView,
  type PropertyCompleteness,
} from '@/lib/domain/property';
import { Badge, Button, Card, useToast } from '@/ui/primitives';
import { revalidateProperties } from './actions';
import styles from './Property.module.css';

const UNEXPECTED = 'Không thể đưa khách sạn vào hoạt động lúc này. Vui lòng thử lại.';

/** Manual hotel review (owner decision 153). Room stock is not stored or inferred. */
export function PublishPanel({
  property,
  completeness,
}: {
  readonly property: PropertyAdminView;
  /** Null when the completeness read failed — a different thing from "incomplete". */
  readonly completeness: PropertyCompleteness | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Readonly<Record<string, string>> | null>(null);

  const state = property.lifecycleState;

  if (state === 'OPEN') {
    return (
      <Card title="Hoạt động">
        <p className={styles.publishNote}>
          <Badge tone="success">Đang hoạt động</Badge>
        </p>
        <p className={styles.publishNote}>
          Khách có thể xem khách sạn và gửi yêu cầu đặt phòng. Khách sạn tự kiểm tra
          phòng và phản hồi thủ công. Hãy cập nhật{' '}
          <Link href={`/partner/properties/${property.id}/rates`} className={styles.publishLink}>Giá</Link>
          {' '}để khách tham khảo.

        </p>
      </Card>
    );
  }

  /*
    The two states this transition does not start from. `TEMPORARILY_CLOSED`
    and `CLOSED` are withdrawals, and reopening one is a different decision
    with no endpoint behind it — so the panel reports the state in words and
    offers nothing, rather than a button that answers 409.
  */
  if (state !== 'DRAFT' && state !== 'COMING_SOON') {
    return (
      <Card title="Hoạt động">
        <p className={styles.publishNote}>
          Khách sạn đang ở trạng thái <strong>{lifecycleLabel(state)}</strong> và hiện không thể
          đưa vào hoạt động từ màn hình này.
        </p>
      </Card>
    );
  }

  // The server's own list, not a second opinion computed here.
  const missing = completeness === null
    ? null
    : completeness.sections.flatMap((section) => section.missing);
  const ready = missing !== null && missing.length === 0;

  async function onPublish() {
    setBusy(true);
    setError(null);
    setBlockers(null);
    try {
      await propertiesApi.publish(property.id, { version: property.version });
      await revalidateProperties();
      toast.show('success', 'Khách sạn đã được đưa vào hoạt động.');
      // The server is authoritative for what happens next; nothing is simulated here.
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        // Keep the messages, not just the field names. The backend explains how
        // to clear each blocker, and discarding that leaves a checklist item
        // with no way to act on it.
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

  return (
    <Card title="Đưa vào hoạt động">
      <p className={styles.publishNote}>
        Khách sạn sẽ hiển thị trên website và khách có thể gửi yêu cầu đặt phòng. Bạn có thể tạm
        ngưng sau nếu cần.
      </p>

      {missing === null ? (
        <p className={styles.publishNote}>
          Không đọc được tiến độ hồ sơ, nên chưa thể biết khách sạn đã đủ điều kiện hay chưa. Bạn
          vẫn có thể thử — hệ thống sẽ cho biết còn thiếu gì.
        </p>
      ) : ready ? null : (
        <div className={styles.publishBlockers}>
          <p className={styles.publishNote}>Còn thiếu trước khi đưa vào hoạt động:</p>
          <ul>
            {missing.map((field) => (
              <li key={field}>
                {field}
                {fixLink(field, property.id)}
              </li>
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
                  {fixLink(field, property.id)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button onClick={onPublish} disabled={busy || missing !== null && !ready}>
        {busy ? 'Đang đưa vào hoạt động…' : 'Đưa vào hoạt động'}
      </Button>
    </Card>
  );
}

/**
 * A way to act on a blocker, using only screens that already exist.
 *
 * Keyed on the backend's own field labels — `PropertyCompletenessChecker`
 * writes them and a refused publish repeats them in `details[]`, so the two
 * always agree. An unrecognised label renders no link rather than a guess: the
 * checklist stays readable if the backend ever adds a section, and no rule is
 * re-derived here.
 */
function fixLink(field: string, propertyId: string) {
  const target = sectionFor(field);
  if (target === null) {
    return null;
  }
  return (
    <>
      {' '}
      <Link href={`/partner/properties/${propertyId}${target.href}`} className={styles.publishLink}>
        {target.label}
      </Link>
    </>
  );
}

function sectionFor(field: string): { readonly href: string; readonly label: string } | null {
  const name = field.toLowerCase();

  if (name.includes('room type')) {
    // Room types are published by this very transition now, so the link is to
    // where they are created and their status is already shown.
    return { href: '/rooms', label: 'Mở Loại phòng' };
  }
  if (name.includes('image')) {
    return { href: '/media', label: 'Mở Hình ảnh' };
  }
  if (
    name.includes('name')
    || name.includes('description')
    || name.includes('signature')
    || name.includes('city')
    || name.includes('district')
    || name.includes('ward')
  ) {
    return { href: '/information', label: 'Mở Thông tin khách sạn' };
  }
  return null;
}
