'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ADMIN_LIST_PAGE_SIZE, customersApi, type CustomerFilter } from '@/lib/api/endpoints/adminTools';
import type { Customer } from '@/lib/domain/adminTools';
import { Badge, Button, DatePicker, DateRangePicker, Table, type Column, PageHeader } from '@/ui/primitives';
import { useAdminList } from './useAdminList';
import { ListState, ListPagination } from './ListState';
import { ACCOUNT_STATUS_LABEL, accountStatusTone, CustomerAvatar, formatRegistered } from './customerDisplay';
import styles from './AdminTools.module.css';

export const customerHref = (id: string) => `/admin/customers/${encodeURIComponent(id)}`;

/**
 * The customer list: one row per customer profile. Clicking a row opens the
 * customer's page inside the same admin layout.
 */
export function CustomerManager() {
  const router = useRouter();
  const [filter, setFilter] = useState<CustomerFilter>(EMPTY_FILTER);
  const [total, setTotal] = useState<number | null>(null);
  // Draft controls; the list only reloads on "Tìm kiếm" / "Xoá lọc".
  const [tier, setTier] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>('none');
  const [day, setDay] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [dateError, setDateError] = useState('');
  const loader = useCallback(() => customersApi.search(filter, setTotal), [filter]);
  const { rows, loading, error, reload } = useAdminList(loader);
  const filtered = filter.q !== '' || filter.tier !== '' || filter.registeredFrom !== undefined || filter.registeredTo !== undefined;

  function clearAll(form: HTMLFormElement | null) {
    form?.reset();
    setTier(''); setDateMode('none'); setDay(''); setRange({ from: '', to: '' }); setDateError('');
    setFilter(EMPTY_FILTER);
  }

  const columns: readonly Column<Customer>[] = [
    { key: 'code', header: 'Mã khách hàng', cell: (row) => <span className={styles.code}>{row.customerCode ?? '—'}</span> },
    { key: 'avatar', header: <span className="srOnly">Ảnh</span>, cell: (row) => <CustomerAvatar customer={row} /> },
    {
      key: 'name',
      header: 'Họ tên',
      cell: (row) => (
        <Link href={customerHref(row.id)} className={styles.rowLink} onClick={(event) => event.stopPropagation()}>
          {row.fullName || 'Chưa có tên'}
        </Link>
      ),
    },
    { key: 'email', header: 'Email', cell: (row) => row.email || '—' },
    { key: 'phone', header: 'Số điện thoại', cell: (row) => row.phone ?? '—' },
    { key: 'registered', header: 'Ngày đăng ký', cell: (row) => formatRegistered(row.createdAt) },
    {
      key: 'status',
      header: 'Trạng thái tài khoản',
      cell: (row) => (
        <Badge tone={accountStatusTone(row.accountStatus)}>
          {ACCOUNT_STATUS_LABEL[row.accountStatus ?? ''] ?? row.accountStatus ?? '—'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="srOnly">Thao tác</span>,
      isActions: true,
      cell: (row) => (
        <Link href={customerHref(row.id)} className={styles.rowLink} onClick={(event) => event.stopPropagation()}>
          Xem
        </Link>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Khách hàng" title="Danh sách khách hàng" description="Hồ sơ khách hàng và thông tin liên hệ." />
      <form
        className={styles.filters}
        aria-label="Tìm khách hàng"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const dates = registrationDates(dateMode, day, range);
          if ('error' in dates) { setDateError(dates.error); return; }
          setDateError('');
          setFilter({ q: String(data.get('q') ?? '').trim(), tier, page: 0, ...dates });
        }}
      >
        <label>
          Tên, email hoặc điện thoại
          <input name="q" />
        </label>
        <label>
          Hạng thành viên
          <select name="tier" value={tier} onChange={(event) => setTier(event.target.value)}>
            {TIER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Ngày đăng ký
          <select value={dateMode} onChange={(event) => { setDateMode(event.target.value as DateMode); setDateError(''); }}>
            <option value="none">Tất cả</option>
            <option value="day">Một ngày</option>
            <option value="range">Khoảng thời gian</option>
          </select>
        </label>
        {dateMode === 'day' ? (
          <DatePicker label="Chọn ngày" value={day} onChange={setDay} {...(dateError ? { error: dateError } : {})} />
        ) : null}
        {dateMode === 'range' ? (
          <DateRangePicker legend="Khoảng ngày đăng ký" from={range.from} to={range.to} onChange={setRange} error={dateError || undefined} />
        ) : null}
        <Button type="submit">Tìm kiếm</Button>
        {filtered || dateMode !== 'none' || tier !== '' ? (
          <Button type="button" variant="ghost" onClick={(event) => clearAll(event.currentTarget.form)}>Xoá lọc</Button>
        ) : null}
      </form>
      <section className={styles.results} aria-label="Danh sách khách hàng" aria-busy={loading}>
        <div className={styles.resultHeader}>
          <h2>Khách hàng</h2>
          {!loading && !error && (
            <span>{total === null ? `${rows.length} khách trên trang này` : `${total} khách hàng phù hợp`}</span>
          )}
        </div>
        {loading || error || rows.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={() => void reload()}
            errorTitle="Chưa tải được khách hàng"
            emptyTitle="Không tìm thấy khách hàng"
            emptyDescription={filtered ? 'Không có khách hàng nào khớp bộ lọc. Thử đổi hạng, ngày đăng ký hoặc từ khoá.' : 'Thử tìm theo tên, email hoặc số điện thoại khác.'}
          />
        ) : (
          <div className={styles.clickableRows}>
            <Table
              caption="Danh sách khách hàng"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              onRowSelect={(row) => router.push(customerHref(row.id))}
            />
          </div>
        )}
        {!loading && !error && (rows.length > 0 || filter.page > 0) && (
          <ListPagination
            page={filter.page}
            hasNext={total === null ? rows.length === ADMIN_LIST_PAGE_SIZE : (filter.page + 1) * ADMIN_LIST_PAGE_SIZE < total}
            onPrevious={() => setFilter({ ...filter, page: filter.page - 1 })}
            onNext={() => setFilter({ ...filter, page: filter.page + 1 })}
          />
        )}
      </section>
    </div>
  );
}

const EMPTY_FILTER: CustomerFilter = { q: '', tier: '', page: 0 };

/** Tier codes the backend stores (membership_tier.code); "" means every tier. */
export const TIER_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'CLASSIC', label: 'Classic' },
  { value: 'GOLD', label: 'Gold' },
  { value: 'PLATINUM', label: 'Platinum' },
];

type DateMode = 'none' | 'day' | 'range';

/**
 * The registration-date part of the filter. Days are sent as YYYY-MM-DD and the
 * backend reads them as whole days in Asia/Ho_Chi_Minh; one day = the same date twice.
 */
export function registrationDates(
  mode: DateMode,
  day: string,
  range: { readonly from: string; readonly to: string },
): { registeredFrom?: string; registeredTo?: string } | { error: string } {
  if (mode === 'day') {
    return day === '' ? { error: 'Chọn một ngày.' } : { registeredFrom: day, registeredTo: day };
  }
  if (mode === 'range') {
    if (range.from === '' && range.to === '') return { error: 'Chọn ít nhất một đầu của khoảng ngày.' };
    if (range.from !== '' && range.to !== '' && range.from > range.to) {
      return { error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' };
    }
    return {
      ...(range.from === '' ? {} : { registeredFrom: range.from }),
      ...(range.to === '' ? {} : { registeredTo: range.to }),
    };
  }
  return {};
}
