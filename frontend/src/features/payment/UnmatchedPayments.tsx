'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { unmatchedPaymentsApi, type UnmatchedPayment, type UnmatchedResolution } from '@/lib/api/endpoints/unmatchedPayments';
import { useAdminList, adminError } from '@/features/adminTools/useAdminList';
import { ListState } from '@/features/adminTools/ListState';
import { formatMoney } from '@/lib/domain/availability';
import { Button, Card, ConfirmDialog } from '@/ui/primitives';
import styles from '@/features/adminTools/AdminTools.module.css';

/** Why SePay's money could not confirm the booking, in the words staff act on. */
export const UNMATCHED_REASON: Record<string, string> = {
  NOT_PENDING: 'Đặt phòng không còn chờ thanh toán (đã quá hạn hoặc đã huỷ)',
  AMOUNT_MISMATCH: 'Số tiền không khớp tổng tiền đặt phòng',
  ALREADY_PAID: 'Đặt phòng đã thanh toán trước đó — khách trả lần hai',
  NO_BOOKING: 'Không tìm thấy đặt phòng tương ứng',
};

const RESOLUTION: Record<string, string> = { REFUNDED: 'Đã hoàn tiền', HANDLED: 'Đã xử lý cách khác' };

function dateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}

/** One unmatched payment: what arrived, for which booking, and how SUPER_ADMIN settled it. */
export function UnmatchedPaymentCard({ row, onDone }: {
  readonly row: UnmatchedPayment;
  readonly onDone: (message: string) => Promise<void>;
}) {
  const currency = row.currency ?? 'VND';
  const exponent = currency === 'VND' ? 0 : 2;
  const money = (amountMinor: number | null) =>
    amountMinor === null ? '—' : formatMoney({ amountMinor, currency, exponent });
  const [resolution, setResolution] = useState<UnmatchedResolution>('REFUNDED');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = row.resolvedAt === null;

  async function send() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await unmatchedPaymentsApi.resolve(row.id, resolution, note.trim());
      setConfirm(false);
      await onDone(`Đã ghi nhận xử lý khoản ${money(row.amountMinor)}${row.reference ? ` của ${row.reference}` : ''}.`);
    } catch (caught) {
      setConfirm(false);
      setError(adminError(caught));
    } finally { setBusy(false); }
  }

  const title = `${row.reference ?? row.invoiceNumber ?? 'Không rõ mã đơn'} · ${money(row.amountMinor)} · ${open ? 'Chưa xử lý' : RESOLUTION[row.resolution ?? ''] ?? row.resolution}`;
  return <Card title={title}>
    <p><strong>{UNMATCHED_REASON[row.matchStatus] ?? row.matchStatus}</strong></p>
    <p>Nhận lúc: {dateTime(row.receivedAt)} · Mã giao dịch SePay: {row.transactionId ?? '—'}{row.paymentMethod ? ` · ${row.paymentMethod}` : ''}</p>
    {row.reference && <>
      <p>{row.guestName}{row.guestEmail ? ` · ${row.guestEmail}` : ''} · {row.propertyName}</p>
      <p>Tổng tiền đặt phòng: {money(row.bookingTotalMinor)} · Hạn thanh toán: {dateTime(row.paymentDueAt)}</p>
      <Link href={`/partner/requests/${encodeURIComponent(row.reference)}`}>Xem yêu cầu đặt phòng</Link>
    </>}
    {!open && <p>Ghi chú: {row.resolutionNote} · {row.resolvedByEmail ?? ''} · {dateTime(row.resolvedAt)}</p>}
    {open && <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (note.trim() === '') { setError('Ghi lại đã làm gì (ví dụ: đã hoàn qua ngân hàng, mã FT…).'); return; }
      setError(''); setConfirm(true);
    }}>
      <fieldset disabled={busy} className={styles.form}>
        <legend>Ghi nhận đã xử lý (sau khi đã liên hệ khách và hoàn tiền hoặc xử lý ngoài hệ thống)</legend>
        <label>Cách xử lý
          <select value={resolution} onChange={(event) => setResolution(event.target.value as UnmatchedResolution)}>
            <option value="REFUNDED">Đã hoàn tiền cho khách</option>
            <option value="HANDLED">Đã xử lý cách khác (ví dụ: tạo đặt phòng mới cho khách)</option>
          </select>
        </label>
        <label>Ghi chú<textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      </fieldset>
      <Button type="submit" disabled={busy}>Xem lại và ghi nhận</Button>
    </form>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <ConfirmDialog open={confirm} busy={busy} title="Xác nhận đã xử lý khoản tiền này?"
      confirmLabel="Ghi nhận" onCancel={() => { if (!busy) setConfirm(false); }} onConfirm={() => void send()}>
      <p>{RESOLUTION[resolution]}: {money(row.amountMinor)}{row.reference ? ` · ${row.reference}` : ''}</p>
      <p>Ghi chú: {note.trim()}</p>
      <p>Hệ thống chỉ ghi nhận, không tự chuyển tiền hay thay đổi đặt phòng.</p>
    </ConfirmDialog>
  </Card>;
}

/** SUPER_ADMIN: SePay payments that arrived for bookings that could not take them (V66). */
export function UnmatchedPayments() {
  const loader = useCallback(() => unmatchedPaymentsApi.list(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const [notice, setNotice] = useState('');
  return <section className={styles.page} aria-label="Tiền chưa khớp đơn">
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Thanh toán</p><h2>Tiền chưa khớp đơn</h2>
      <p>Tiền SePay đã nhận nhưng không xác nhận được đặt phòng: khách trả sau hạn, đơn đã huỷ, sai số tiền, trả hai lần hoặc không rõ mã đơn. Liên hệ khách, hoàn tiền hoặc xử lý ngoài hệ thống rồi ghi nhận tại đây.</p></div>
      <Button variant="secondary" disabled={loading} onClick={() => void reload()}>Tải lại</Button>
    </header>
    {notice && <p role="status">{notice}</p>}
    {loading || error || rows.length === 0
      ? <ListState loading={loading} error={error} onRetry={() => void reload()} errorTitle="Chưa tải được danh sách"
          emptyTitle="Không có khoản tiền chưa khớp" emptyDescription="Khi SePay báo tiền về cho một đặt phòng không còn nhận thanh toán, khoản đó sẽ xuất hiện tại đây." />
      : rows.map((row) => <UnmatchedPaymentCard key={row.id} row={row} onDone={async (message) => { setNotice(message); await reload(); }} />)}
  </section>;
}
