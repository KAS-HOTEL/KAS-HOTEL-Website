'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { cancellationsApi } from '@/lib/api/endpoints/cancellations';
import { useAdminList, adminError } from '@/features/adminTools/useAdminList';
import { ListState } from '@/features/adminTools/ListState';
import type { PendingCancellation } from '@/lib/domain/manualBooking';
import { formatMoney } from '@/lib/domain/availability';
import { Button, Card, ConfirmDialog } from '@/ui/primitives';
import styles from '@/features/adminTools/AdminTools.module.css';

const REFUND_STATUS: Record<string, string> = {
  REFUND_PENDING: 'Chờ hoàn tiền',
  REFUNDED: 'Đã hoàn tiền',
  REFUND_REJECTED: 'Không hoàn tiền',
};

/**
 * One cancelled, paid booking waiting for SUPER_ADMIN: refund outside KAS, then record the
 * amount actually refunded, when, and the bank reference — or record why not. Only that record
 * moves the request on and emails the guest; KAS never refunds through SePay.
 */
export function RefundCard({ row, onDone }: {
  readonly row: PendingCancellation;
  readonly onDone: (message: string) => Promise<void>;
}) {
  const exponent = row.currency === 'VND' ? 0 : 2;
  const money = (amountMinor: number | null | undefined) =>
    amountMinor === null || amountMinor === undefined ? '—' : formatMoney({ amountMinor, currency: row.currency, exponent });
  const [amount, setAmount] = useState(String(row.refundDueMinor ?? ''));
  const [refundedAt, setRefundedAt] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<'record' | 'reject' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = row.status === 'REFUND_PENDING';
  const amountMinor = /^\d+$/.test(amount) ? Number(amount) : null;
  const overPaid = amountMinor !== null && row.paidMinor !== null && row.paidMinor !== undefined && amountMinor > row.paidMinor;

  async function send() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (confirm === 'record' && amountMinor !== null) {
        await cancellationsApi.recordRefund(row.requestId, {
          refundAmountMinor: amountMinor,
          refundedAt: refundedAt === '' ? null : new Date(refundedAt).toISOString(),
          reference: reference.trim() === '' ? null : reference.trim(),
          note: note.trim() === '' ? null : note.trim(),
        });
        setConfirm(null);
        await onDone(`Đã ghi nhận hoàn tiền cho ${row.reference}. Khách đã được gửi email.`);
      } else if (confirm === 'reject') {
        await cancellationsApi.rejectRefund(row.requestId, reason.trim());
        setConfirm(null);
        await onDone(`Đã ghi nhận không hoàn tiền cho ${row.reference}.`);
      }
    } catch (caught) {
      setConfirm(null);
      setError(adminError(caught));
    } finally { setBusy(false); }
  }

  const status = REFUND_STATUS[row.status ?? ''] ?? row.status ?? '';
  return <Card title={`${row.reference} · ${row.propertyName || row.propertySlug} · ${status}`}>
    <p>{row.guestName} · {row.checkIn} → {row.checkOut}</p>
    <p>Đã thanh toán: {money(row.paidMinor)}</p>
    <p>Phí huỷ: {money(row.feeMinor ?? 0)}{row.feeSource === 'FREE_WINDOW' ? ' (huỷ trong hạn miễn phí)' : ''}</p>
    <p>Cần hoàn: <strong>{money(row.refundDueMinor)}</strong></p>
    <p>Mã giao dịch thanh toán: {row.paymentReference ?? '—'}</p>
    {row.status === 'REFUNDED' && <p>Đã hoàn: {money(row.refundAmountMinor)}{row.refundReference ? ` · ${row.refundReference}` : ''}</p>}
    {row.status === 'REFUND_REJECTED' && <p>Lý do không hoàn: {row.refundNote}</p>}
    <Link href={`/partner/reservations/${encodeURIComponent(row.reference)}`}>Xem đặt phòng</Link>
    {pending && <>
      <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        if (amountMinor === null) { setError('Nhập số tiền thực hoàn (số nguyên).'); return; }
        if (overPaid) { setError('Số tiền hoàn không được lớn hơn số đã thanh toán.'); return; }
        setError(''); setConfirm('record');
      }}>
        <fieldset disabled={busy} className={styles.form}>
          <legend>Ghi nhận đã hoàn tiền (sau khi đã chuyển khoản cho khách)</legend>
          <label>{`Số tiền thực hoàn (${row.currency})`}
            <input required type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label>Thời điểm hoàn<input type="datetime-local" value={refundedAt} onChange={(event) => setRefundedAt(event.target.value)} /></label>
          <label>Mã tham chiếu / chứng từ<input maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
          <label>Ghi chú<textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </fieldset>
        <Button type="submit" disabled={busy}>Xem lại và ghi nhận</Button>
      </form>
      <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim() === '') { setError('Nhập lý do không hoàn tiền.'); return; }
        setError(''); setConfirm('reject');
      }}>
        <fieldset disabled={busy} className={styles.form}>
          <legend>Không thể hoàn tiền</legend>
          <label>Lý do (gửi cho khách)<textarea maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </fieldset>
        <Button type="submit" variant="secondary" disabled={busy}>Ghi nhận không hoàn</Button>
      </form>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <ConfirmDialog open={confirm !== null} busy={busy}
      title={confirm === 'record' ? 'Xác nhận đã hoàn tiền?' : 'Xác nhận không hoàn tiền?'}
      confirmLabel={confirm === 'record' ? 'Đã hoàn tiền' : 'Không hoàn tiền'}
      onCancel={() => { if (!busy) setConfirm(null); }} onConfirm={() => void send()}>
      <p>Đặt phòng {row.reference}</p>
      {confirm === 'record'
        ? <p>Đã hoàn <strong>{amountMinor === null ? '—' : money(amountMinor)}</strong>{reference.trim() ? ` · ${reference.trim()}` : ''}. Khách sẽ nhận email “đã hoàn tiền”. Chỉ xác nhận khi tiền đã thực sự được chuyển.</p>
        : <p>Lý do: {reason.trim()}. Khách sẽ nhận email kèm lý do này.</p>}
    </ConfirmDialog>
  </Card>;
}

/** SUPER_ADMIN's manual refund queue, under the fee-quote queue on Yêu cầu hủy. */
export function RefundQueue() {
  const loader = useCallback(() => cancellationsApi.refunds(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const [notice, setNotice] = useState('');
  return <section className={styles.page} aria-label="Hoàn tiền thủ công">
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Thanh toán</p><h2>Hoàn tiền thủ công</h2>
      <p>Đặt phòng đã huỷ và đã thanh toán. Hoàn tiền ngoài hệ thống rồi ghi nhận tại đây; KAS không tự hoàn qua SePay.</p></div>
      <Button variant="secondary" disabled={loading} onClick={() => void reload()}>Tải lại</Button>
    </header>
    {notice && <p role="status">{notice}</p>}
    {loading || error || rows.length === 0
      ? <ListState loading={loading} error={error} onRetry={() => void reload()} errorTitle="Chưa tải được danh sách hoàn tiền"
          emptyTitle="Không có yêu cầu hoàn tiền" emptyDescription="Đặt phòng đã thanh toán bị huỷ sẽ xuất hiện tại đây." />
      : rows.map((row) => <RefundCard key={row.requestId} row={row} onDone={async (message) => { setNotice(message); await reload(); }} />)}
  </section>;
}
