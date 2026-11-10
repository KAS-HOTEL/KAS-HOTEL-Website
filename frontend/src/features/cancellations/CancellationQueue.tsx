'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { cancellationsApi } from '@/lib/api/endpoints/cancellations';
import { useAdminList, adminError } from '@/features/adminTools/useAdminList';
import { ListState } from '@/features/adminTools/ListState';
import { cancellationFeePreview, type PendingCancellation, type CancellationFeeQuote } from '@/lib/domain/manualBooking';
import { formatMoney } from '@/lib/domain/availability';
import { Button, Card, ConfirmDialog } from '@/ui/primitives';
import styles from '@/features/adminTools/AdminTools.module.css';
import { RefundQueue } from './RefundQueue';

function CancellationQuote({ row, onQuoted }: { readonly row: PendingCancellation; readonly onQuoted: () => Promise<void> }) {
  const [mode, setMode] = useState<'AMOUNT' | 'PERCENTAGE'>('AMOUNT');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const exponent = row.currency === 'VND' ? 0 : 2;
  const feeMinor = cancellationFeePreview(mode, value, row.totalMinor, exponent);
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: row.currency, exponent });

  async function sendQuote() {
    if (inFlight.current || feeMinor === null) return;
    inFlight.current = true; setBusy(true); setError('');
    const quote: CancellationFeeQuote = mode === 'PERCENTAGE'
      ? { percentage: Number(value), note: note.trim() }
      : { feeMinor, note: note.trim() };
    try {
      await cancellationsApi.quote(row.reference, row.requestId, quote);
      setConfirm(false);
      await onQuoted();
    } catch (caught) {
      setConfirm(false);
      setError(adminError(caught));
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <Card title={`${row.reference} · ${row.propertyName || row.propertySlug}`}>
    <p>{row.guestName} · {row.checkIn} → {row.checkOut}</p>
    <p>Giá trị đặt phòng: {row.totalMinor === null ? 'Chưa có tổng giá' : money(row.totalMinor)}</p>
    <Link href={`/partner/reservations/${encodeURIComponent(row.reference)}`}>Xem đặt phòng</Link>
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (feeMinor === null) { setError('Kiểm tra mức phí và giá trị đặt phòng.'); return; }
      setError(''); setConfirm(true);
    }}>
      <fieldset disabled={busy} className={styles.form}>
        <legend>Cách tính phí hủy</legend>
        <label>Loại phí<select value={mode} onChange={(event) => { setMode(event.target.value as 'AMOUNT' | 'PERCENTAGE'); setValue(''); setError(''); }}>
          <option value="AMOUNT">Số tiền cụ thể</option><option value="PERCENTAGE">Phần trăm giá trị đặt phòng</option>
        </select></label>
        <label>{mode === 'PERCENTAGE' ? 'Mức phí (%)' : `Số tiền (${row.currency})`}
          <input required type="number" inputMode="decimal" min={0} max={mode === 'PERCENTAGE' ? 100 : undefined}
            step={mode === 'PERCENTAGE' ? '0.01' : 10 ** -exponent} value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        {mode === 'PERCENTAGE' && <p className={styles.muted}>Tính trên tổng giá trị đặt phòng; làm tròn đến đơn vị tiền nhỏ nhất.</p>}
        {mode === 'PERCENTAGE' && row.totalMinor === null && <p role="alert">Chưa có tổng giá để tính phần trăm. Hãy chọn số tiền cụ thể.</p>}
        <p aria-live="polite">Phí hủy dự kiến: <strong>{feeMinor === null ? '—' : money(feeMinor)}</strong></p>
        <label>Ghi chú cho khách<textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button type="submit" disabled={busy || feeMinor === null}>Xem lại phí hủy</Button>
    </form>
    <ConfirmDialog open={confirm} title="Gửi mức phí hủy cho khách?" confirmLabel="Gửi phí hủy" busy={busy}
      onCancel={() => { if (!busy) setConfirm(false); }} onConfirm={() => void sendQuote()}>
      <p>Đặt phòng {row.reference}</p>
      <p>{mode === 'PERCENTAGE' ? `${value}% của ${row.totalMinor === null ? '—' : money(row.totalMinor)}` : 'Số tiền cụ thể'}: <strong>{feeMinor === null ? '—' : money(feeMinor)}</strong></p>
      {note.trim() && <p>{note.trim()}</p>}
      <p>Khách sẽ quyết định sau khi nhận mức phí. Đặt phòng chưa bị hủy ở bước này.</p>
    </ConfirmDialog>
  </Card>;
}

export function CancellationQueue() {
  const loader = useCallback(() => cancellationsApi.list(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const [notice, setNotice] = useState('');
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Vận hành</p><h1>Yêu cầu hủy</h1><p>Huỷ sau thời hạn miễn phí khi chưa cấu hình phí (Giá phòng → Phí huỷ phòng): chọn phí theo phần trăm hoặc số tiền cụ thể, xem lại rồi gửi khách quyết định.</p></div>
      <Button variant="secondary" disabled={loading} onClick={() => void reload()}>Tải lại danh sách</Button>
    </header>
    {notice && <p role="status">{notice}</p>}
    {loading || error || rows.length === 0 ? <ListState loading={loading} error={error} onRetry={() => void reload()}
      errorTitle="Chưa tải được yêu cầu hủy" emptyTitle="Không có yêu cầu chờ báo phí" emptyDescription="Các yêu cầu cần báo phí sẽ xuất hiện tại đây." />
      : rows.map((row) => <CancellationQuote key={row.requestId} row={row} onQuoted={async () => { setNotice(`Đã báo phí cho ${row.reference}.`); await reload(); }} />)}
    <RefundQueue />
  </div>;
}
