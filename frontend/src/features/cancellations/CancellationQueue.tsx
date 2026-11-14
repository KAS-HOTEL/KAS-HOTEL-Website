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

/** `2026-11-20` → `20/11/2026`; anything else is shown as it came. */
function isoDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—';
}

/** An instant in KAS business time. */
function dateTime(value: string) {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : at.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function CancellationQuote({ row, onQuoted }: { readonly row: PendingCancellation; readonly onQuoted: () => Promise<void> }) {
  const [mode, setMode] = useState<'AMOUNT' | 'PERCENTAGE'>('AMOUNT');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const exponent = row.currency === 'VND' ? 0 : 2;
  /*
    The fee follows the policy (owner, 2026-11-14): 0 for a booking cancelled inside its free
    window, the configured fee rule after it. The server decides and sends the figure; only when
    no policy applies does this card ask for a fee.
  */
  const policyFee = row.policyFeeBasis && typeof row.policyFeeMinor === 'number' ? row.policyFeeMinor : null;
  const free = policyFee !== null && row.policyFeeBasis === 'FREE_WINDOW';
  const feeMinor = policyFee !== null ? policyFee : cancellationFeePreview(mode, value, row.totalMinor, exponent);
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: row.currency, exponent });
  const paid = typeof row.paidMinor === 'number' && row.paidMinor > 0 ? row.paidMinor : null;
  const refund = paid !== null && feeMinor !== null ? Math.max(0, paid - feeMinor) : null;
  const ruleText = row.policyFeeType === 'PERCENT_OF_TOTAL' && row.policyFeePercent != null
    ? `${row.policyFeePercent}% giá trị đặt phòng` : 'số tiền cố định';

  async function sendQuote() {
    if (inFlight.current || feeMinor === null) return;
    inFlight.current = true; setBusy(true); setError('');
    const quote: CancellationFeeQuote = policyFee !== null ? { note: note.trim() }
      : mode === 'PERCENTAGE'
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

  return <Card title={`${row.reference} · ${row.propertyName || row.propertySlug}`}
    actions={<Link href={`/partner/reservations/${encodeURIComponent(row.reference)}`}>Xem đặt phòng →</Link>}>
    {/* The booking at a glance, then the one decision this card asks for: the fee. */}
    <dl className={styles.cancelFacts}>
      <div><dt>Khách</dt><dd>{row.guestName || '—'}</dd></div>
      <div><dt>Lưu trú</dt><dd>{isoDay(row.checkIn)} → {isoDay(row.checkOut)}</dd></div>
      <div><dt>Giá trị đặt phòng</dt><dd>{row.totalMinor === null ? 'Chưa có tổng giá' : money(row.totalMinor)}</dd></div>
      {paid !== null && <div><dt>Đã thanh toán</dt><dd>{money(paid)}</dd></div>}
      {row.requestedAt && <div><dt>Khách yêu cầu hủy lúc</dt><dd>{dateTime(row.requestedAt)}</dd></div>}
    </dl>
    <form className={styles.cancelForm} onSubmit={(event) => {
      event.preventDefault();
      if (feeMinor === null) { setError('Kiểm tra mức phí và giá trị đặt phòng.'); return; }
      setError(''); setConfirm(true);
    }}>
      <fieldset disabled={busy} className={styles.cancelFieldset}>
        <legend>{policyFee !== null ? 'Phí hủy' : 'Cách tính phí hủy'}</legend>
        {policyFee !== null ? <div className={styles.form}>
          <div className={`${free ? styles.cancelPolicyFree : styles.cancelPolicy} ${styles.cancelWide}`} role="status">
            <strong>{free ? 'Hủy trong thời hạn miễn phí — không tính phí hủy' : `Phí hủy theo chính sách: ${ruleText}`}</strong>
            <p>{free
              ? `Khách yêu cầu hủy trước hạn hủy miễn phí${row.freeUntil ? ` (${dateTime(row.freeUntil)})` : ''}. Đặt phòng đã thanh toán nên cần bạn xác nhận trước khi hủy và hoàn tiền.`
              : 'Mức phí lấy từ chính sách đã cấu hình tại Giá phòng → Phí huỷ phòng, không nhập tay.'}</p>
          </div>
          <label className={styles.cancelWide}>Ghi chú cho khách<textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </div> : <div className={styles.form}>
          <p className={`${styles.muted} ${styles.cancelWide}`}>Khách sạn này chưa có chính sách phí hủy (Giá phòng → Phí huỷ phòng), nên cần nhập mức phí cho riêng yêu cầu này.</p>
          <label>Loại phí<select value={mode} onChange={(event) => { setMode(event.target.value as 'AMOUNT' | 'PERCENTAGE'); setValue(''); setError(''); }}>
            <option value="AMOUNT">Số tiền cụ thể</option><option value="PERCENTAGE">Phần trăm giá trị đặt phòng</option>
          </select></label>
          <label>{mode === 'PERCENTAGE' ? 'Mức phí (%)' : `Số tiền (${row.currency})`}
            <input required type="number" inputMode="decimal" min={0} max={mode === 'PERCENTAGE' ? 100 : undefined}
              step={mode === 'PERCENTAGE' ? '0.01' : 10 ** -exponent} value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          {mode === 'PERCENTAGE' && <p className={`${styles.muted} ${styles.cancelWide}`}>Tính trên tổng giá trị đặt phòng; làm tròn đến đơn vị tiền nhỏ nhất.</p>}
          {mode === 'PERCENTAGE' && row.totalMinor === null && <p role="alert" className={`${styles.error} ${styles.cancelWide}`}>Chưa có tổng giá để tính phần trăm. Hãy chọn số tiền cụ thể.</p>}
          <label className={styles.cancelWide}>Ghi chú cho khách<textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </div>}
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.cancelFooter}>
        <p className={styles.cancelFee} aria-live="polite">{policyFee !== null ? 'Phí hủy' : 'Phí hủy dự kiến'} <strong>{feeMinor === null ? '—' : money(feeMinor)}</strong>
          {refund !== null && <span>Hoàn lại cho khách: {money(refund)}</span>}</p>
        <Button type="submit" disabled={busy || feeMinor === null}>{free ? 'Xác nhận hủy miễn phí' : 'Xem lại phí hủy'}</Button>
      </div>
    </form>
    <ConfirmDialog open={confirm} title={free ? 'Xác nhận hủy miễn phí cho khách?' : 'Gửi mức phí hủy cho khách?'}
      confirmLabel={free ? 'Xác nhận' : 'Gửi phí hủy'} busy={busy}
      onCancel={() => { if (!busy) setConfirm(false); }} onConfirm={() => void sendQuote()}>
      <p>Đặt phòng {row.reference}</p>
      <p>{free ? 'Trong thời hạn hủy miễn phí' : policyFee !== null ? `Theo chính sách (${ruleText})`
        : mode === 'PERCENTAGE' ? `${value}% của ${row.totalMinor === null ? '—' : money(row.totalMinor)}` : 'Số tiền cụ thể'}: <strong>{feeMinor === null ? '—' : money(feeMinor)}</strong></p>
      {refund !== null && <p>Hoàn lại cho khách: <strong>{money(refund)}</strong></p>}
      {note.trim() && <p>{note.trim()}</p>}
      <p>{free ? 'Khách sẽ nhận email để xác nhận hủy. Đặt phòng chưa bị hủy ở bước này.' : 'Khách sẽ quyết định sau khi nhận mức phí. Đặt phòng chưa bị hủy ở bước này.'}</p>
    </ConfirmDialog>
  </Card>;
}

export function CancellationQueue() {
  const loader = useCallback(() => cancellationsApi.list(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const [notice, setNotice] = useState('');
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Vận hành</p><h1>Yêu cầu hủy</h1><p>Các yêu cầu hủy cần bạn xác nhận. Phí hủy tính theo chính sách (Giá phòng → Phí huỷ phòng); hủy trong thời hạn miễn phí không tính phí. Chỉ khi khách sạn chưa có chính sách mới cần nhập mức phí.</p></div>
      <Button variant="secondary" disabled={loading} onClick={() => void reload()}>Tải lại danh sách</Button>
    </header>
    {notice && <p role="status">{notice}</p>}
    {loading || error || rows.length === 0 ? <ListState loading={loading} error={error} onRetry={() => void reload()}
      errorTitle="Chưa tải được yêu cầu hủy" emptyTitle="Không có yêu cầu chờ báo phí" emptyDescription="Các yêu cầu cần báo phí sẽ xuất hiện tại đây." />
      : rows.map((row) => <CancellationQuote key={row.requestId} row={row} onQuoted={async () => { setNotice(`Đã báo phí cho ${row.reference}.`); await reload(); }} />)}
    <RefundQueue />
  </div>;
}
