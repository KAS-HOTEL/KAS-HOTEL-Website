'use client';

import { useCallback, useState } from 'react';
import { surchargesApi } from '@/lib/api/endpoints/surcharges';
import {
  CALCULATION_LABEL,
  CATEGORY_LABEL,
  DAY_LABEL,
  SURCHARGE_CALCULATIONS,
  SURCHARGE_CATEGORIES,
  describeConditions,
  formatSurchargeValue,
  hhmm,
  type Surcharge,
  type SurchargeCalculation,
  type SurchargeCategory,
  type SurchargeRequest,
  type SurchargeStatus,
} from '@/lib/domain/surcharge';
import { Badge, Button, Dialog, PageHeader, Table, type Column } from '@/ui/primitives';
import { adminError, useAdminList } from '@/features/adminTools/useAdminList';
import { ListState } from '@/features/adminTools/ListState';
import styles from '@/features/adminTools/AdminTools.module.css';

export interface HotelChoice {
  readonly id: string;
  readonly label: string;
}

/** The form's own state: every field as the inputs hold it (strings for numbers and times). */
interface Draft {
  propertyId: string;
  code: string;
  name: string;
  description: string;
  category: SurchargeCategory;
  calculation: SurchargeCalculation;
  value: string;
  currency: string;
  checkInFrom: string;
  checkInTo: string;
  checkOutFrom: string;
  checkOutTo: string;
  minAge: string;
  maxAge: string;
  aboveStandardOccupancy: boolean;
  stayFrom: string;
  stayTo: string;
  daysOfWeek: number[];
  minNights: string;
  conditionNote: string;
  status: SurchargeStatus;
  sortOrder: string;
}

const EMPTY: Draft = {
  propertyId: '',
  code: '',
  name: '',
  description: '',
  category: 'OTHER',
  calculation: 'PER_STAY',
  value: '',
  currency: 'VND',
  checkInFrom: '',
  checkInTo: '',
  checkOutFrom: '',
  checkOutTo: '',
  minAge: '',
  maxAge: '',
  aboveStandardOccupancy: false,
  stayFrom: '',
  stayTo: '',
  daysOfWeek: [],
  minNights: '',
  conditionNote: '',
  status: 'ACTIVE',
  sortOrder: '100',
};

function draftOf(row: Surcharge): Draft {
  const str = (value: number | null) => (value === null ? '' : String(value));
  return {
    propertyId: row.propertyId ?? '',
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    calculation: row.calculation,
    value: row.calculation === 'PERCENT_OF_ROOM_RATE' ? str(row.percent) : str(row.amountMinor),
    currency: row.currency,
    checkInFrom: hhmm(row.checkInFrom),
    checkInTo: hhmm(row.checkInTo),
    checkOutFrom: hhmm(row.checkOutFrom),
    checkOutTo: hhmm(row.checkOutTo),
    minAge: str(row.minAge),
    maxAge: str(row.maxAge),
    aboveStandardOccupancy: row.aboveStandardOccupancy,
    stayFrom: row.stayFrom ?? '',
    stayTo: row.stayTo ?? '',
    daysOfWeek: [...row.daysOfWeek],
    minNights: str(row.minNights),
    conditionNote: row.conditionNote ?? '',
    status: row.status,
    sortOrder: String(row.sortOrder),
  };
}

/** A code from a name: "Phụ thu thú cưng" → "PHU_THU_THU_CUNG". */
export function codeFromName(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return /^[A-Z]/.test(ascii) ? ascii : `PT_${ascii}`.slice(0, 64);
}

/** Checks the form the way the backend will, so the message is in Vietnamese and immediate. */
export function draftProblem(draft: Draft): string | null {
  if (draft.name.trim() === '') return 'Nhập tên khoản phụ thu.';
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(draft.code)) {
    return 'Mã chỉ gồm chữ in hoa không dấu, số và dấu gạch dưới, bắt đầu bằng chữ (ví dụ LATE_CHECK_OUT).';
  }
  const value = Number(draft.value);
  if (draft.value.trim() === '' || Number.isNaN(value)) return 'Nhập mức phí.';
  if (draft.calculation === 'PERCENT_OF_ROOM_RATE' && (value <= 0 || value > 100)) {
    return 'Phần trăm phải lớn hơn 0 và không quá 100.';
  }
  if (draft.calculation !== 'PERCENT_OF_ROOM_RATE' && (value < 0 || !Number.isInteger(value))) {
    return 'Số tiền phải là số nguyên không âm.';
  }
  if (draft.checkInFrom && draft.checkInTo && draft.checkInFrom >= draft.checkInTo) {
    return 'Giờ nhận phòng: "từ" phải trước "đến".';
  }
  if (draft.checkOutFrom && draft.checkOutTo && draft.checkOutFrom >= draft.checkOutTo) {
    return 'Giờ trả phòng: "từ" phải trước "đến".';
  }
  if (draft.minAge && draft.maxAge && Number(draft.minAge) > Number(draft.maxAge)) {
    return 'Tuổi tối thiểu đang lớn hơn tuổi tối đa.';
  }
  if (draft.stayFrom && draft.stayTo && draft.stayFrom > draft.stayTo) {
    return 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.';
  }
  return null;
}

function requestOf(draft: Draft, version?: number): SurchargeRequest {
  const num = (value: string) => (value.trim() === '' ? null : Number(value));
  const time = (value: string) => (value === '' ? null : value);
  const percentBased = draft.calculation === 'PERCENT_OF_ROOM_RATE';
  return {
    propertyId: draft.propertyId === '' ? null : draft.propertyId,
    code: draft.code,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    category: draft.category,
    calculation: draft.calculation,
    amountMinor: percentBased ? null : num(draft.value),
    percent: percentBased ? num(draft.value) : null,
    currency: draft.currency,
    checkInFrom: time(draft.checkInFrom),
    checkInTo: time(draft.checkInTo),
    checkOutFrom: time(draft.checkOutFrom),
    checkOutTo: time(draft.checkOutTo),
    minAge: num(draft.minAge),
    maxAge: num(draft.maxAge),
    aboveStandardOccupancy: draft.aboveStandardOccupancy,
    stayFrom: draft.stayFrom || null,
    stayTo: draft.stayTo || null,
    daysOfWeek: draft.daysOfWeek,
    minNights: num(draft.minNights),
    conditionNote: draft.conditionNote.trim() || null,
    status: draft.status,
    sortOrder: num(draft.sortOrder) ?? 100,
    ...(version === undefined ? {} : { version }),
  };
}

/**
 * Surcharges (phụ thu): the common ones are seeded and can be edited or switched off;
 * SUPER_ADMIN adds any other surcharge with its own conditions, for every hotel or for one.
 */
export function SurchargeManager({ hotels }: { readonly hotels: readonly HotelChoice[] }) {
  const [hotelFilter, setHotelFilter] = useState('');
  const loader = useCallback(() => surchargesApi.list(hotelFilter || undefined), [hotelFilter]);
  const { rows, loading, error, setError, reload } = useAdminList(loader);
  const [editing, setEditing] = useState<Surcharge | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [codeTouched, setCodeTouched] = useState(false);
  const [deleting, setDeleting] = useState<Surcharge | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const openNew = () => {
    setDraft({ ...EMPTY, propertyId: hotelFilter });
    setCodeTouched(false);
    setFormError('');
    setEditing('new');
  };
  const openEdit = (row: Surcharge) => {
    setDraft(draftOf(row));
    setCodeTouched(true);
    setFormError('');
    setEditing(row);
  };

  const toggle = (row: Surcharge) => {
    setBusy(true);
    setError('');
    void surchargesApi
      .setStatus(row.id, row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
      .then((updated) => {
        setNotice(`${updated.name}: ${updated.status === 'ACTIVE' ? 'đã bật' : 'đã tắt'}.`);
        return reload();
      })
      .catch((caught: unknown) => setError(adminError(caught)))
      .finally(() => setBusy(false));
  };

  const columns: readonly Column<Surcharge>[] = [
    {
      key: 'name',
      header: 'Khoản phụ thu',
      cell: (row) => (
        <span className={styles.stackCell}>
          <strong>{row.name}</strong>
          <span className={styles.muted}>
            {row.code} · {CATEGORY_LABEL[row.category] ?? row.category}
            {row.preset ? ' · Mặc định' : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Áp dụng',
      cell: (row) => (row.propertyId === null
        ? <span className={styles.muted}>Tất cả khách sạn</span>
        : row.propertyName ?? row.propertySlug),
    },
    { key: 'value', header: 'Mức phí', cell: (row) => formatSurchargeValue(row) },
    {
      key: 'conditions',
      header: 'Điều kiện',
      cell: (row) => {
        const conditions = describeConditions(row);
        return (
          <span className={styles.stackCell}>
            <span>{conditions.length === 0 ? 'Luôn áp dụng' : conditions.join(' · ')}</span>
            {row.conditionNote ? <span className={styles.muted}>{row.conditionNote}</span> : null}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {row.status === 'ACTIVE' ? 'Đang áp dụng' : 'Đã tắt'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="srOnly">Thao tác</span>,
      isActions: true,
      cell: (row) => (
        <span className={styles.actions}>
          <Button variant="secondary" onClick={() => openEdit(row)} disabled={busy}>Sửa</Button>
          <Button variant="ghost" onClick={() => toggle(row)} disabled={busy}>
            {row.status === 'ACTIVE' ? 'Tắt' : 'Bật'}
          </Button>
          {row.preset ? null : (
            <Button variant="danger" onClick={() => setDeleting(row)} disabled={busy}>Xóa</Button>
          )}
        </span>
      ),
    },
  ];

  const percentBased = draft.calculation === 'PERCENT_OF_ROOM_RATE';
  const isPreset = editing !== null && editing !== 'new' && editing.preset;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Giá & phụ thu"
        title="Phụ thu"
        description="Các khoản phụ thu ngoài giá phòng và điều kiện áp dụng. Khoản cho một khách sạn cùng mã sẽ thay khoản áp dụng cho tất cả khách sạn."
        actions={<Button onClick={openNew} disabled={busy}>Thêm phụ thu</Button>}
      />

      <div className={styles.filters}>
        <label>
          Khách sạn
          <select value={hotelFilter} onChange={(event) => setHotelFilter(event.target.value)}>
            <option value="">Tất cả khoản phụ thu</option>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>{hotel.label}</option>
            ))}
          </select>
        </label>
      </div>

      {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}

      <div className={styles.resultHeader}>
        <h2>Danh sách phụ thu</h2>
        {!loading && !error && <span>{rows.length} khoản</span>}
      </div>
      {loading || error || rows.length === 0 ? (
        <ListState
          loading={loading}
          error={error}
          onRetry={() => void reload()}
          errorTitle="Chưa tải được phụ thu"
          emptyTitle="Chưa có khoản phụ thu"
          emptyDescription="Bấm “Thêm phụ thu” để tạo khoản đầu tiên."
        />
      ) : (
        <Table caption="Danh sách phụ thu" columns={columns} rows={rows} rowKey={(row) => row.id} />
      )}

      <Dialog
        open={editing !== null}
        title={editing === 'new' ? 'Thêm phụ thu' : 'Sửa phụ thu'}
        onClose={() => { if (!busy) setEditing(null); }}
      >
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            const problem = draftProblem(draft);
            if (problem) {
              setFormError(problem);
              return;
            }
            setBusy(true);
            setFormError('');
            const save = editing === 'new' || editing === null
              ? surchargesApi.create(requestOf(draft))
              : surchargesApi.update(editing.id, requestOf(draft, editing.version));
            void save
              .then(async (saved) => {
                setNotice(`Đã lưu “${saved.name}”.`);
                setEditing(null);
                await reload();
              })
              .catch((caught: unknown) => setFormError(adminError(caught)))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Tên khoản phụ thu
            <input
              required
              maxLength={200}
              value={draft.name}
              onChange={(event) => {
                const name = event.target.value;
                setDraft((current) => ({
                  ...current,
                  name,
                  code: codeTouched ? current.code : codeFromName(name),
                }));
              }}
            />
          </label>
          <label>
            Mã
            <input
              required
              maxLength={64}
              value={draft.code}
              disabled={isPreset}
              onChange={(event) => {
                setCodeTouched(true);
                set('code', event.target.value.toUpperCase());
              }}
            />
          </label>
          <label>
            Loại
            <select value={draft.category} onChange={(event) => set('category', event.target.value as SurchargeCategory)}>
              {SURCHARGE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>
              ))}
            </select>
          </label>
          <label>
            Khách sạn áp dụng
            <select value={draft.propertyId} onChange={(event) => set('propertyId', event.target.value)}>
              <option value="">Tất cả khách sạn</option>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>{hotel.label}</option>
              ))}
            </select>
          </label>
          <label>
            Cách tính
            <select
              value={draft.calculation}
              onChange={(event) => set('calculation', event.target.value as SurchargeCalculation)}
            >
              {SURCHARGE_CALCULATIONS.map((calculation) => (
                <option key={calculation} value={calculation}>{CALCULATION_LABEL[calculation]}</option>
              ))}
            </select>
          </label>
          <label>
            {percentBased ? 'Mức phí (% giá 1 đêm)' : 'Mức phí'}
            <input
              required
              type="number"
              min={percentBased ? 0.01 : 0}
              max={percentBased ? 100 : undefined}
              step={percentBased ? 0.01 : 1000}
              value={draft.value}
              onChange={(event) => set('value', event.target.value)}
            />
          </label>
          {percentBased ? null : (
            <label>
              Tiền tệ
              <select value={draft.currency} onChange={(event) => set('currency', event.target.value)}>
                <option>VND</option>
                <option>USD</option>
              </select>
            </label>
          )}
          <label>
            Trạng thái
            <select value={draft.status} onChange={(event) => set('status', event.target.value as SurchargeStatus)}>
              <option value="ACTIVE">Đang áp dụng</option>
              <option value="INACTIVE">Tắt</option>
            </select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Mô tả
            <input maxLength={2000} value={draft.description} onChange={(event) => set('description', event.target.value)} />
          </label>

          <fieldset className={styles.hotelScope} style={{ gridColumn: '1 / -1' }}>
            <legend>Điều kiện áp dụng (để trống = luôn áp dụng; nhiều điều kiện thì phải thỏa tất cả)</legend>
            <div className={styles.form}>
              <label>
                Nhận phòng từ
                <input type="time" value={draft.checkInFrom} onChange={(event) => set('checkInFrom', event.target.value)} />
              </label>
              <label>
                Nhận phòng đến
                <input type="time" value={draft.checkInTo} onChange={(event) => set('checkInTo', event.target.value)} />
              </label>
              <label>
                Trả phòng từ
                <input type="time" value={draft.checkOutFrom} onChange={(event) => set('checkOutFrom', event.target.value)} />
              </label>
              <label>
                Trả phòng đến
                <input type="time" value={draft.checkOutTo} onChange={(event) => set('checkOutTo', event.target.value)} />
              </label>
              <label>
                Tuổi từ
                <input type="number" min={0} max={120} value={draft.minAge} onChange={(event) => set('minAge', event.target.value)} />
              </label>
              <label>
                Tuổi đến
                <input type="number" min={0} max={120} value={draft.maxAge} onChange={(event) => set('maxAge', event.target.value)} />
              </label>
              <label>
                Ngày lưu trú từ
                <input type="date" value={draft.stayFrom} onChange={(event) => set('stayFrom', event.target.value)} />
              </label>
              <label>
                Ngày lưu trú đến
                <input type="date" value={draft.stayTo} onChange={(event) => set('stayTo', event.target.value)} />
              </label>
              <label>
                Số đêm tối thiểu
                <input type="number" min={1} max={365} value={draft.minNights} onChange={(event) => set('minNights', event.target.value)} />
              </label>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={draft.aboveStandardOccupancy}
                  onChange={(event) => set('aboveStandardOccupancy', event.target.checked)}
                />
                Chỉ tính cho khách vượt số người tiêu chuẩn của phòng
              </label>
            </div>
            <div className={styles.hotelChoices} role="group" aria-label="Ngày trong tuần">
              <span className={styles.muted}>Ngày trong tuần (để trống = mọi ngày):</span>
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <label key={day} className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={draft.daysOfWeek.includes(day)}
                    onChange={(event) => set('daysOfWeek', event.target.checked
                      ? [...draft.daysOfWeek, day].sort()
                      : draft.daysOfWeek.filter((value) => value !== day))}
                  />
                  {DAY_LABEL[day]}
                </label>
              ))}
            </div>
            <label className={styles.filterField} style={{ maxWidth: 'none' }}>
              Ghi chú điều kiện (hiện cho nhân viên và khách)
              <input maxLength={1000} value={draft.conditionNote} onChange={(event) => set('conditionNote', event.target.value)} />
            </label>
          </fieldset>

          <label>
            Thứ tự hiển thị
            <input type="number" min={0} max={10000} value={draft.sortOrder} onChange={(event) => set('sortOrder', event.target.value)} />
          </label>
          {isPreset ? (
            <p className={styles.formNote} style={{ gridColumn: '1 / -1' }}>
              Đây là khoản phụ thu mặc định: có thể sửa hoặc tắt, không xóa được.
            </p>
          ) : null}
          {formError ? <p role="alert" style={{ gridColumn: '1 / -1' }}>{formError}</p> : null}
          <Button type="submit" loading={busy} disabled={busy}>
            Lưu
          </Button>
        </form>
      </Dialog>

      <Dialog open={deleting !== null} title="Xóa khoản phụ thu" onClose={() => { if (!busy) setDeleting(null); }}>
        <p>
          Xóa “{deleting?.name}”? Không thể hoàn tác. Nếu chỉ muốn tạm ngừng, hãy dùng “Tắt”.
        </p>
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>Hủy</Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={busy}
            onClick={() => {
              if (deleting === null) return;
              const target = deleting;
              setBusy(true);
              setError('');
              void surchargesApi
                .remove(target.id)
                .then(async () => {
                  setNotice(`Đã xóa “${target.name}”.`);
                  setDeleting(null);
                  await reload();
                })
                .catch((caught: unknown) => {
                  setDeleting(null);
                  setError(adminError(caught));
                })
                .finally(() => setBusy(false));
            }}
          >
            Xóa
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
