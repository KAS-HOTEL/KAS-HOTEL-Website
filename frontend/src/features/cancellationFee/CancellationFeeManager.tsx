'use client';

import { useCallback, useState } from 'react';
import { cancellationFeesApi } from '@/lib/api/endpoints/cancellationFees';
import {
  describeFee,
  previewFee,
  type CancellationFeeRule,
  type CancellationFeeRuleRequest,
  type CancellationFeeType,
} from '@/lib/domain/cancellationFee';
import { Badge, Button, Card, ConfirmDialog } from '@/ui/primitives';
import { adminError, useAdminList } from '@/features/adminTools/useAdminList';
import { ListState } from '@/features/adminTools/ListState';
import styles from '@/features/adminTools/AdminTools.module.css';

export interface HotelOption { readonly id: string; readonly label: string }

interface Draft {
  id: string | null;
  version: number | undefined;
  propertyId: string;
  feeType: CancellationFeeType;
  value: string;
  note: string;
  active: boolean;
}

const EMPTY: Draft = { id: null, version: undefined, propertyId: '', feeType: 'PERCENT_OF_TOTAL', value: '', note: '', active: true };
const SAMPLE_TOTAL = 4_968_000;

function toRequest(d: Draft): CancellationFeeRuleRequest | null {
  const n = Number(d.value);
  if (d.value.trim() === '' || !Number.isFinite(n) || n < 0) return null;
  if (d.feeType === 'PERCENT_OF_TOTAL' && (n <= 0 || n > 100 || !/^\d+(\.\d{1,2})?$/.test(d.value.trim()))) return null;
  if (d.feeType === 'FIXED_AMOUNT' && !Number.isInteger(n)) return null;
  return {
    propertyId: d.propertyId === '' ? null : d.propertyId,
    feeType: d.feeType,
    amountMinor: d.feeType === 'FIXED_AMOUNT' ? n : null,
    percent: d.feeType === 'PERCENT_OF_TOTAL' ? n : null,
    note: d.note.trim() === '' ? null : d.note.trim(),
    status: d.active ? 'ACTIVE' : 'INACTIVE',
    ...(d.version === undefined ? {} : { version: d.version }),
  };
}

/**
 * Console → Giá phòng → Phí huỷ phòng. The fee charged when a guest cancels after the free
 * window (member: until 12:00 on the check-in day; other guests: 24 hours before check-in).
 */
export function CancellationFeeManager({ hotels }: { readonly hotels: readonly HotelOption[] }) {
  const loader = useCallback(() => cancellationFeesApi.list(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CancellationFeeRule | null>(null);
  const request = toRequest(draft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function edit(rule: CancellationFeeRule) {
    setDraft({
      id: rule.id, version: rule.version, propertyId: rule.propertyId ?? '', feeType: rule.feeType,
      value: String(rule.feeType === 'FIXED_AMOUNT' ? rule.amountMinor ?? '' : rule.percent ?? ''),
      note: rule.note ?? '', active: rule.status === 'ACTIVE',
    });
    setFormError(''); setNotice('');
  }

  async function save() {
    if (!request) { setFormError('Kiểm tra mức phí: số tiền là số nguyên ≥ 0, phần trăm từ 0,01 đến 100.'); return; }
    setBusy(true); setFormError('');
    try {
      if (draft.id) await cancellationFeesApi.update(draft.id, request);
      else await cancellationFeesApi.create(request);
      setNotice(draft.id ? 'Đã lưu phí huỷ.' : 'Đã thêm phí huỷ.');
      setDraft(EMPTY);
      await reload();
    } catch (caught) {
      setFormError(adminError(caught));
    } finally { setBusy(false); }
  }

  async function remove(rule: CancellationFeeRule) {
    setBusy(true);
    try {
      await cancellationFeesApi.remove(rule.id);
      setNotice('Đã xoá phí huỷ.');
      setConfirmDelete(null);
      await reload();
    } catch (caught) {
      setConfirmDelete(null);
      setNotice(adminError(caught));
    } finally { setBusy(false); }
  }

  const sample = request ? previewFee({ feeType: request.feeType, amountMinor: request.amountMinor, percent: request.percent }, SAMPLE_TOTAL) : null;

  return <div className={styles.page}>
    <header className={styles.pageHeader}><div>
      <p className={styles.eyebrow}>Giá phòng</p>
      <h1>Phí huỷ phòng</h1>
      <p>Áp dụng khi khách huỷ sau thời hạn miễn phí: thành viên KAS đến 12:00 ngày nhận phòng, khách thường trước giờ nhận phòng 24 giờ.
        Phí của từng khách sạn thay cho phí chung. Nếu chưa có phí nào đang bật, yêu cầu huỷ trễ sẽ chuyển cho Super Admin xem xét thủ công.</p>
    </div>
      <Button variant="secondary" disabled={loading} onClick={() => void reload()}>Tải lại</Button>
    </header>
    {notice && <p role="status">{notice}</p>}

    {loading || error || rows.length === 0
      ? <ListState loading={loading} error={error} onRetry={() => void reload()} errorTitle="Chưa tải được phí huỷ"
          emptyTitle="Chưa cấu hình phí huỷ" emptyDescription="Huỷ sau thời hạn miễn phí đang được Super Admin xem xét thủ công." />
      : rows.map((rule) => <Card key={rule.id} title={rule.propertyId === null ? 'Tất cả khách sạn' : (rule.propertyName ?? rule.propertySlug ?? '')}>
          <p><strong>{describeFee(rule)}</strong> <Badge tone={rule.status === 'ACTIVE' ? 'success' : 'neutral'}>{rule.status === 'ACTIVE' ? 'Đang bật' : 'Đang tắt'}</Badge></p>
          {rule.note && <p className={styles.muted}>{rule.note}</p>}
          <Button variant="secondary" onClick={() => edit(rule)}>Sửa</Button>{' '}
          <Button variant="secondary" onClick={() => setConfirmDelete(rule)}>Xoá</Button>
        </Card>)}

    <Card title={draft.id ? 'Sửa phí huỷ' : 'Thêm phí huỷ'}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} className={styles.form}>
          <label>Phạm vi
            <select value={draft.propertyId} onChange={(event) => set('propertyId', event.target.value)}>
              <option value="">Tất cả khách sạn (mặc định)</option>
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.label}</option>)}
            </select>
          </label>
          <label>Cách tính
            <select value={draft.feeType} onChange={(event) => { set('feeType', event.target.value as CancellationFeeType); set('value', ''); }}>
              <option value="PERCENT_OF_TOTAL">Phần trăm tổng tiền đặt phòng (đã gồm thuế)</option>
              <option value="FIXED_AMOUNT">Số tiền cố định</option>
            </select>
          </label>
          <label>{draft.feeType === 'PERCENT_OF_TOTAL' ? 'Mức phí (%)' : 'Số tiền (VND)'}
            <input required type="number" inputMode="decimal" min={draft.feeType === 'PERCENT_OF_TOTAL' ? 0.01 : 0}
              max={draft.feeType === 'PERCENT_OF_TOTAL' ? 100 : undefined} step={draft.feeType === 'PERCENT_OF_TOTAL' ? '0.01' : '1000'}
              value={draft.value} onChange={(event) => set('value', event.target.value)} />
          </label>
          <p className={styles.muted} aria-live="polite">
            Ví dụ với đơn {new Intl.NumberFormat('vi-VN').format(SAMPLE_TOTAL)} ₫: phí huỷ {sample === null ? '—' : `${new Intl.NumberFormat('vi-VN').format(sample)} ₫`}.
            Phí không vượt quá tổng tiền; số tiền hoàn = đã thanh toán − phí, không âm.
          </p>
          <label>Ghi chú nội bộ<textarea maxLength={1000} value={draft.note} onChange={(event) => set('note', event.target.value)} /></label>
          <label><input type="checkbox" checked={draft.active} onChange={(event) => set('active', event.target.checked)} /> Đang bật</label>
        </fieldset>
        {formError && <p className={styles.error} role="alert">{formError}</p>}
        <Button type="submit" disabled={busy}>{draft.id ? 'Lưu thay đổi' : 'Thêm phí huỷ'}</Button>
        {draft.id && <>{' '}<Button type="button" variant="secondary" disabled={busy} onClick={() => setDraft(EMPTY)}>Huỷ sửa</Button></>}
      </form>
    </Card>

    <ConfirmDialog open={confirmDelete !== null} title="Xoá phí huỷ?" confirmLabel="Xoá" busy={busy}
      onCancel={() => { if (!busy) setConfirmDelete(null); }} onConfirm={() => { if (confirmDelete) void remove(confirmDelete); }}>
      <p>{confirmDelete ? describeFee(confirmDelete) : ''}</p>
      <p>Phí đã dùng cho yêu cầu huỷ không xoá được; khi đó hãy tắt.</p>
    </ConfirmDialog>
  </div>;
}
