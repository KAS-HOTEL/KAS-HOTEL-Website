'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageFor } from '@/features/auth/messages';
import { opsReservationsApi, type StayAction } from '@/lib/api/endpoints/opsReservations';
import { ApiError } from '@/lib/api/errors';
import { Button, ConfirmDialog } from '@/ui/primitives';
import styles from './Reservation.module.css';

// Check-out only after check-in (owner 2026-11-14). A stay nobody checks out is checked out
// automatically at check-out time + 2 h; one never checked in by check-out time becomes NO_SHOW
// and is put right only with the real times (CompleteStayForm below).
const ACTIONS_BY_STATUS: Readonly<Record<string, readonly StayAction[]>> = {
  CONFIRMED: ['check-in', 'no-show'],
  CHECK_IN_READY: ['check-in', 'no-show'],
  CHECKED_IN: ['check-out'],
  // A check-out confirmed by mistake (V59): the booking stops counting towards the member tier.
  CHECKED_OUT: ['undo-check-out'],
};

const COPY: Readonly<Record<StayAction, { label: string; question: string; detail: string }>> = {
  'check-in': {
    label: 'Nhận phòng',
    question: 'Xác nhận khách đã nhận phòng?',
    detail: 'Chỉ thực hiện từ ngày nhận phòng trở đi. Nếu tới giờ trả phòng vẫn chưa nhận phòng, đơn tự chuyển thành "Khách không đến".',
  },
  'check-out': {
    label: 'Trả phòng',
    question: 'Xác nhận khách đã trả phòng?',
    detail: 'Chỉ thực hiện từ ngày trả phòng trở đi. Nếu không bấm, hệ thống tự trả phòng lúc giờ trả phòng + 2 tiếng.',
  },
  'undo-check-out': {
    label: 'Huỷ xác nhận trả phòng',
    question: 'Huỷ xác nhận trả phòng của đơn này?',
    detail: 'Đơn trở về "Đã nhận phòng" và không còn được tính vào số đơn xét hạng thành viên. Nếu số đơn trong quý rơi dưới ngưỡng, hạng của khách bị hạ ngay.',
  },
  'no-show': {
    label: 'Khách không đến',
    question: 'Ghi nhận khách không đến?',
    detail: 'Chỉ thực hiện sau giờ chốt của ngày nhận phòng. Đơn kết thúc, không hoàn tiền.',
  },
};

/** A datetime-local value without seconds. */
const MINUTES = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/;

/** `2026-11-10T14:30` typed in hotel time → `2026-11-10T14:30:00+07:00`. */
export function hotelTime(local: string): string {
  return `${MINUTES.test(local) ? `${local}:00` : local}+07:00`;
}

/** The stay transitions of doc 58 §6. The backend decides whether each is allowed today. */
export function StayActions({
  reference,
  stayStatus,
  checkIn,
  checkOut,
}: {
  readonly reference: string;
  readonly stayStatus: string | null | undefined;
  /** Booked dates (yyyy-mm-dd), to prefill the real-times form. */
  readonly checkIn?: string | undefined;
  readonly checkOut?: string | undefined;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<StayAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (stayStatus === 'NO_SHOW') {
    return <CompleteStayForm reference={reference} checkIn={checkIn} checkOut={checkOut} />;
  }
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
        <Button key={action} variant={action === 'no-show' || action === 'undo-check-out' ? 'secondary' : 'primary'} disabled={busy}
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

/**
 * A NO_SHOW stay (never checked in by check-out time, or marked by staff). Red, because the
 * booking ended without a stay and nothing is refunded; if the guest did stay, the real
 * check-in and check-out times finish it as CHECKED_OUT (owner 2026-11-14).
 */
function CompleteStayForm({ reference, checkIn, checkOut }: {
  readonly reference: string;
  readonly checkIn?: string | undefined;
  readonly checkOut?: string | undefined;
}) {
  const router = useRouter();
  const [inAt, setInAt] = useState(checkIn ? `${checkIn}T14:00` : '');
  const [outAt, setOutAt] = useState(checkOut ? `${checkOut}T12:00` : '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await opsReservationsApi.completeStay(reference, hotelTime(inAt), hotelTime(outAt));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError
        ? caught.details.length > 0 ? caught.details.map((detail) => detail.message).join(' ') : messageFor(caught)
        : 'Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setConfirming(false);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.noShowAlert} aria-labelledby={`no-show-${reference}`}>
      <h3 id={`no-show-${reference}`}>Khách không đến: đơn đã kết thúc</h3>
      <p>Đơn chưa được nhận phòng (check-in) khi đã qua giờ trả phòng nên đã chuyển thành <strong>Khách không đến</strong>, không hoàn tiền.
        Nếu khách thực tế đã ở, nhập giờ check-in và check-out thực tế để hoàn thành đơn.</p>
      <form className={styles.noShowForm} onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (!inAt || !outAt) { setError('Nhập đủ giờ check-in và check-out thực tế.'); return; }
        if (outAt <= inAt) { setError('Giờ check-out phải sau giờ check-in.'); return; }
        setError(''); setConfirming(true);
      }}>
        <label>Giờ check-in thực tế<input type="datetime-local" required disabled={busy} value={inAt}
          onChange={(event) => setInAt(event.target.value)} /></label>
        <label>Giờ check-out thực tế<input type="datetime-local" required disabled={busy} value={outAt}
          onChange={(event) => setOutAt(event.target.value)} /></label>
        <Button type="submit" disabled={busy}>Hoàn thành đơn</Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <ConfirmDialog open={confirming} title="Xác nhận khách đã ở và hoàn thành đơn?" confirmLabel="Xác nhận" busy={busy}
        onCancel={() => { if (!busy) setConfirming(false); }}
        onConfirm={() => { void submit(); }}>
        {`Check-in ${inAt.replace('T', ' ')} · check-out ${outAt.replace('T', ' ')} (giờ khách sạn). Đơn chuyển sang "Đã trả phòng" và được tính điểm, hạng thành viên như một lần trả phòng.`}
      </ConfirmDialog>
    </section>
  );
}
