'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageFor } from '@/features/auth/messages';
import { opsReservationsApi, type StayAction } from '@/lib/api/endpoints/opsReservations';
import { ApiError } from '@/lib/api/errors';
import { Button, ConfirmDialog } from '@/ui/primitives';
import styles from './Reservation.module.css';

const ACTIONS_BY_STATUS: Readonly<Record<string, readonly StayAction[]>> = {
  CONFIRMED: ['check-in', 'no-show'],
  CHECK_IN_READY: ['check-in', 'no-show'],
  CHECKED_IN: ['check-out'],
};

const COPY: Readonly<Record<StayAction, { label: string; question: string; detail: string }>> = {
  'check-in': {
    label: 'Nhận phòng',
    question: 'Xác nhận khách đã nhận phòng?',
    detail: 'Chỉ thực hiện từ ngày nhận phòng trở đi.',
  },
  'check-out': {
    label: 'Trả phòng',
    question: 'Xác nhận khách đã trả phòng?',
    detail: 'Chỉ thực hiện từ ngày trả phòng trở đi.',
  },
  'no-show': {
    label: 'Khách không đến',
    question: 'Ghi nhận khách không đến?',
    detail: 'Chỉ thực hiện sau giờ chốt của ngày nhận phòng. Thao tác này không tự thu phí.',
  },
};

/** The stay transitions of doc 58 §6. The backend decides whether each is allowed today. */
export function StayActions({
  reference,
  stayStatus,
}: {
  readonly reference: string;
  readonly stayStatus: string | null | undefined;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<StayAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const actions = ACTIONS_BY_STATUS[stayStatus ?? ''] ?? [];
  if (actions.length === 0) return null;

  async function run(action: StayAction) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await opsReservationsApi.transition(reference, action);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? messageFor(caught) : 'Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setConfirm(null);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.detailActions}>
      {actions.map((action) => (
        <Button key={action} variant={action === 'no-show' ? 'secondary' : 'primary'} disabled={busy}
          onClick={() => setConfirm(action)}>
          {COPY[action].label}
        </Button>
      ))}
      {error ? <p role="alert">{error}</p> : null}
      <ConfirmDialog open={confirm !== null} title={confirm ? COPY[confirm].question : ''}
        confirmLabel="Xác nhận" busy={busy}
        onCancel={() => { if (!busy) setConfirm(null); }}
        onConfirm={() => { if (confirm) void run(confirm); }}>
        {confirm ? COPY[confirm].detail : ''}
      </ConfirmDialog>
    </div>
  );
}
