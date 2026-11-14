'use client';

import { useCallback, useMemo, useState } from 'react';
import { cancellationFeesApi } from '@/lib/api/endpoints/cancellationFees';
import {
  describeFee,
  previewFee,
  type CancellationFeeRule,
  type CancellationFeeRuleRequest,
  type CancellationFeeType,
} from '@/lib/domain/cancellationFee';
import { Badge, Button, ConfirmDialog, Dialog, PageHeader, Table, type Column } from '@/ui/primitives';
import { adminError, useAdminList } from '@/features/adminTools/useAdminList';
import { ListState } from '@/features/adminTools/ListState';
import adminStyles from '@/features/adminTools/AdminTools.module.css';
import styles from './CancellationFeeManager.module.css';

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
const DEFAULT_SAMPLE_TOTAL = 4_968_000;
const vnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(n)} ₫`;

/** Why the value cannot be saved, or null when it can. The backend validates again. */
export function feeValueError(feeType: CancellationFeeType, raw: string): string | null {
  const value = raw.trim();
  if (value === '') return 'Nhập mức phí.';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Mức phí phải là số.';
  if (n < 0) return 'Mức phí không được âm.';
  if (feeType === 'PERCENT_OF_TOTAL') {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'Phần trăm có tối đa 2 chữ số thập phân.';
    if (n <= 0 || n > 100) return 'Phần trăm phải lớn hơn 0 và không vượt quá 100%.';
  } else if (!Number.isInteger(n)) {
    return 'Số tiền là số nguyên (VND).';
  }
  return null;
}

function toRequest(d: Draft): CancellationFeeRuleRequest | null {
  if (feeValueError(d.feeType, d.value) !== null) return null;
  const n = Number(d.value.trim());
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

function fromRule(rule: CancellationFeeRule, status?: 'ACTIVE' | 'INACTIVE'): CancellationFeeRuleRequest {
  return {
    propertyId: rule.propertyId, feeType: rule.feeType, amountMinor: rule.amountMinor, percent: rule.percent,
    note: rule.note, status: status ?? rule.status, version: rule.version,
  };
}

/** The rule has no name column: it is named by its scope, as the backend resolves it. */
export function policyName(rule: Pick<CancellationFeeRule, 'propertyId' | 'propertyName' | 'propertySlug'>): string {
  return rule.propertyId === null ? 'Chính sách chung — tất cả khách sạn' : `Chính sách riêng — ${rule.propertyName ?? rule.propertySlug ?? 'khách sạn'}`;
}

function formatUpdated(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(at);
}

type StatusFilter = '' | 'ACTIVE' | 'INACTIVE';

/**
 * Console → Giá phòng → Phí huỷ phòng (redesigned 2026-11-12). The fee charged when a guest
 * cancels after the free window (member: until 12:00 on the check-in day; other guests: 24 hours
 * before check-in). A hotel's own rule replaces the all-hotels rule; with no active rule a late
 * cancellation goes to Super Admin. The backend computes and records every fee.
 */
export function CancellationFeeManager({ hotels }: { readonly hotels: readonly HotelOption[] }) {
  const loader = useCallback(() => cancellationFeesApi.list(), []);
  const { rows, loading, error, reload } = useAdminList(loader);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CancellationFeeRule | null>(null);
  const [confirmOff, setConfirmOff] = useState<CancellationFeeRule | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [sampleTotal, setSampleTotal] = useState(String(DEFAULT_SAMPLE_TOTAL));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const valueError = feeValueError(draft.feeType, draft.value);
  const request = toRequest(draft);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const globalActive = active.some((r) => r.propertyId === null);
    const ownHotels = new Set(active.filter((r) => r.propertyId !== null).map((r) => r.propertyId));
    return {
      total: rows.length,
      active: active.length,
      inactive: rows.length - active.length,
      /** Hotels a rule applies to now: every hotel under an active all-hotels rule, else those with their own. */
      hotels: globalActive ? hotels.length || null : ownHotels.size,
      globalActive,
    };
  }, [rows, hotels.length]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (statusFilter === '' || r.status === statusFilter)
      && (q === '' || [policyName(r), r.note ?? '', describeFee(r)].some((t) => t.toLowerCase().includes(q))));
  }, [rows, query, statusFilter]);

  function openNew() { setDraft(EMPTY); setTouched(false); setFormError(''); setNotice(''); setFormOpen(true); }
  function openEdit(rule: CancellationFeeRule) {
    setDraft({
      id: rule.id, version: rule.version, propertyId: rule.propertyId ?? '', feeType: rule.feeType,
      value: String(rule.feeType === 'FIXED_AMOUNT' ? rule.amountMinor ?? '' : rule.percent ?? ''),
      note: rule.note ?? '', active: rule.status === 'ACTIVE',
    });
    setTouched(false); setFormError(''); setNotice(''); setFormOpen(true);
  }

  async function save() {
    setTouched(true);
    if (!request) { setFormError(valueError ?? 'Kiểm tra lại mức phí.'); return; }
    setBusy(true); setFormError('');
    try {
      if (draft.id) await cancellationFeesApi.update(draft.id, request);
      else await cancellationFeesApi.create(request);
      setNotice(draft.id ? 'Đã lưu chính sách phí huỷ.' : 'Đã thêm chính sách phí huỷ.');
      setFormOpen(false); setDraft(EMPTY);
      await reload();
    } catch (caught) {
      setFormError(adminError(caught));
    } finally { setBusy(false); }
  }

  async function setStatus(rule: CancellationFeeRule, status: 'ACTIVE' | 'INACTIVE') {
    setBusy(true); setNotice('');
    try {
      await cancellationFeesApi.update(rule.id, fromRule(rule, status));
      setNotice(status === 'ACTIVE' ? 'Đã bật chính sách.' : 'Đã tạm ngưng chính sách.');
      setConfirmOff(null);
      await reload();
    } catch (caught) {
      setConfirmOff(null);
      setNotice(adminError(caught));
    } finally { setBusy(false); }
  }

  async function remove(rule: CancellationFeeRule) {
    setBusy(true);
    try {
      await cancellationFeesApi.remove(rule.id);
      setNotice('Đã xoá chính sách phí huỷ.');
      setConfirmDelete(null);
      await reload();
    } catch (caught) {
      setConfirmDelete(null);
      setNotice(adminError(caught));
    } finally { setBusy(false); }
  }

  const sampleMinor = Math.max(0, Math.round(Number(sampleTotal) || 0));
  const sampleFee = request ? previewFee({ feeType: request.feeType, amountMinor: request.amountMinor, percent: request.percent }, sampleMinor) : null;

  const columns: readonly Column<CancellationFeeRule>[] = [
    { key: 'name', header: 'Tên chính sách', cell: (r) => <span className={styles.name}>{policyName(r)}</span> },
    { key: 'scope', header: 'Phạm vi', cell: (r) => (r.propertyId === null ? 'Tất cả khách sạn' : (r.propertyName ?? r.propertySlug ?? '—')) },
    { key: 'type', header: 'Cách tính', cell: (r) => (r.feeType === 'PERCENT_OF_TOTAL' ? 'Phần trăm' : 'Số tiền cố định') },
    { key: 'value', header: 'Mức phí', cell: (r) => <strong>{r.feeType === 'PERCENT_OF_TOTAL' ? `${String(r.percent ?? 0).replace('.', ',')}%` : describeFee(r)}</strong> },
    { key: 'status', header: 'Trạng thái', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status === 'ACTIVE' ? 'Đang bật' : 'Tạm tắt'}</Badge> },
    { key: 'updated', header: 'Cập nhật', cell: (r) => formatUpdated(r.updatedAt) },
    {
      key: 'actions', header: <span className="srOnly">Thao tác</span>, isActions: true,
      cell: (r) => <div className={styles.rowActions}>
        <Button variant="secondary" disabled={busy} onClick={() => openEdit(r)}>Sửa</Button>
        {r.status === 'ACTIVE'
          ? <Button variant="secondary" disabled={busy} onClick={() => setConfirmOff(r)}>Tắt</Button>
          : <Button variant="secondary" disabled={busy} onClick={() => void setStatus(r, 'ACTIVE')}>Bật</Button>}
        <Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(r)}>Xoá</Button>
      </div>,
    },
  ];

  return <div className={adminStyles.page}>
    <PageHeader eyebrow="Giá phòng" title="Phí huỷ phòng"
      description="Quản lý điều kiện và mức phí huỷ áp dụng cho các yêu cầu đặt phòng tại hệ thống KAS."
      actions={<Button onClick={openNew}>Thêm chính sách</Button>} />

    <section className={styles.overview} aria-label="Tổng quan">
      <div className={styles.stat}><span>Tổng số chính sách</span><strong>{loading ? '—' : stats.total}</strong></div>
      <div className={styles.stat}><span>Đang hoạt động</span><strong>{loading ? '—' : stats.active}</strong></div>
      <div className={styles.stat}><span>Đang tắt</span><strong>{loading ? '—' : stats.inactive}</strong></div>
      <div className={styles.stat}><span>Khách sạn đang áp dụng</span>
        <strong>{loading ? '—' : stats.globalActive ? (stats.hotels === null ? 'Tất cả' : `Tất cả (${stats.hotels})`) : stats.hotels}</strong></div>
    </section>

    <p className={styles.rule}>
      Phí chỉ áp dụng khi khách huỷ <strong>sau thời hạn miễn phí</strong>: thành viên KAS đến 12:00 ngày nhận phòng, khách thường trước giờ nhận phòng 24 giờ.
      Chính sách riêng của khách sạn được ưu tiên hơn chính sách chung. Không có chính sách nào đang bật thì hệ thống <strong>không tự thu phí</strong> — yêu cầu huỷ trễ chuyển cho Super Admin xem xét.
    </p>

    {notice && <p role="status" className={styles.notice}>{notice}</p>}

    <div className={adminStyles.filters} role="search">
      <label>Tìm chính sách
        <input type="search" value={query} placeholder="Tên khách sạn, ghi chú, mức phí…" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>Trạng thái
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="">Tất cả</option><option value="ACTIVE">Đang bật</option><option value="INACTIVE">Tạm tắt</option>
        </select>
      </label>
    </div>

    {loading || error || rows.length === 0
      ? <ListState loading={loading} error={error} onRetry={() => void reload()} errorTitle="Chưa tải được phí huỷ"
          emptyTitle="Chưa cấu hình phí huỷ" emptyDescription="Huỷ sau thời hạn miễn phí đang được Super Admin xem xét thủ công." />
      : <Table caption="Chính sách phí huỷ" columns={columns} rows={visible} rowKey={(r) => r.id}
          emptyTitle="Không có chính sách phù hợp" emptyBody="Thử bỏ bớt điều kiện tìm kiếm." />}

    <Dialog open={formOpen} onClose={() => { if (!busy) setFormOpen(false); }} title={draft.id ? 'Sửa chính sách phí huỷ' : 'Thêm chính sách phí huỷ'}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={() => setFormOpen(false)}>Huỷ</Button>
        <Button type="submit" form="cancellationFeeForm" disabled={busy}>{draft.id ? 'Lưu thay đổi' : 'Thêm chính sách'}</Button>
      </>}>
      <form id="cancellationFeeForm" className={styles.formGrid} noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} className={styles.group}>
          <legend>1. Thông tin chính sách</legend>
          <p className={styles.help}>Tên chính sách theo phạm vi áp dụng: <strong>{policyName({ propertyId: draft.propertyId === '' ? null : draft.propertyId, propertyName: hotels.find((h) => h.id === draft.propertyId)?.label ?? null, propertySlug: null })}</strong>.</p>
          <label>Ghi chú nội bộ<textarea maxLength={1000} value={draft.note} placeholder="Chỉ nhân viên KAS thấy" onChange={(e) => set('note', e.target.value)} /></label>
        </fieldset>

        <fieldset disabled={busy} className={styles.group}>
          <legend>2. Phạm vi áp dụng</legend>
          <label>Áp dụng cho
            <select value={draft.propertyId} onChange={(e) => set('propertyId', e.target.value)}>
              <option value="">Tất cả khách sạn (chính sách chung)</option>
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.label}</option>)}
            </select>
          </label>
          <p className={styles.help}>Mỗi khách sạn có tối đa một chính sách riêng đang bật, và chỉ có một chính sách chung đang bật.</p>
        </fieldset>

        <fieldset disabled={busy} className={styles.group}>
          <legend>3. Điều kiện huỷ</legend>
          <ul className={styles.conditions}>
            <li>Thành viên KAS: huỷ miễn phí đến <strong>12:00 ngày nhận phòng</strong>.</li>
            <li>Khách thường: huỷ miễn phí đến <strong>24 giờ trước giờ nhận phòng</strong>.</li>
            <li>Sau mốc đó, mức phí dưới đây được tính và khách xác nhận trước khi huỷ.</li>
          </ul>
          <p className={styles.help}>Các mốc thời gian do hệ thống quy định, chưa cấu hình theo từng chính sách.</p>
        </fieldset>

        <fieldset disabled={busy} className={styles.group}>
          <legend>4. Cách tính phí</legend>
          <div className={styles.row2}>
            <label>Cách tính
              <select value={draft.feeType} onChange={(e) => { set('feeType', e.target.value as CancellationFeeType); set('value', ''); setTouched(false); }}>
                <option value="PERCENT_OF_TOTAL">Phần trăm tổng tiền đặt phòng (đã gồm thuế)</option>
                <option value="FIXED_AMOUNT">Số tiền cố định</option>
              </select>
            </label>
            <label>{draft.feeType === 'PERCENT_OF_TOTAL' ? 'Mức phí (%)' : 'Số tiền (VND)'}
              <input inputMode="decimal" value={draft.value} aria-invalid={touched && valueError !== null}
                onBlur={() => setTouched(true)} onChange={(e) => set('value', e.target.value)} />
            </label>
          </div>
          {touched && valueError && <p className={adminStyles.error} role="alert">{valueError}</p>}
          <div className={styles.preview} aria-live="polite">
            <label>Giá trị đặt phòng mẫu (VND)
              <input inputMode="numeric" value={sampleTotal} onChange={(e) => setSampleTotal(e.target.value.replace(/[^\d]/g, ''))} />
            </label>
            <p>Đơn {vnd(sampleMinor)}{request?.feeType === 'PERCENT_OF_TOTAL' ? `, phí huỷ ${String(request.percent).replace('.', ',')}%` : ''} = <strong>{sampleFee === null ? '—' : vnd(sampleFee)}</strong></p>
            <p className={styles.help}>Phí không vượt quá tổng tiền đặt phòng; số tiền hoàn = đã thanh toán − phí, không âm. Số liệu chính thức do hệ thống tính khi khách huỷ.</p>
          </div>
        </fieldset>

        <fieldset disabled={busy} className={styles.group}>
          <legend>5. Trạng thái</legend>
          <label className={styles.radio}><input type="radio" name="status" checked={draft.active} onChange={() => set('active', true)} /> Đang áp dụng</label>
          <label className={styles.radio}><input type="radio" name="status" checked={!draft.active} onChange={() => set('active', false)} /> Tạm ngưng</label>
        </fieldset>
        {formError && <p className={adminStyles.error} role="alert">{formError}</p>}
      </form>
    </Dialog>

    <ConfirmDialog open={confirmOff !== null} title="Tạm ngưng chính sách?" confirmLabel="Tạm ngưng" busy={busy}
      onCancel={() => { if (!busy) setConfirmOff(null); }} onConfirm={() => { if (confirmOff) void setStatus(confirmOff, 'INACTIVE'); }}>
      <p>{confirmOff ? `${policyName(confirmOff)} · ${describeFee(confirmOff)}` : ''}</p>
      <p>Các yêu cầu huỷ đã báo phí giữ nguyên số tiền đã báo.</p>
    </ConfirmDialog>

    <ConfirmDialog open={confirmDelete !== null} title="Xoá chính sách phí huỷ?" confirmLabel="Xoá" destructive busy={busy}
      onCancel={() => { if (!busy) setConfirmDelete(null); }} onConfirm={() => { if (confirmDelete) void remove(confirmDelete); }}>
      <p>{confirmDelete ? `${policyName(confirmDelete)} · ${describeFee(confirmDelete)}` : ''}</p>
      <p>Chính sách đã dùng cho yêu cầu huỷ không xoá được; khi đó hãy tạm ngưng.</p>
    </ConfirmDialog>
  </div>;
}
