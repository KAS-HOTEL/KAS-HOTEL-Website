'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ADMIN_LIST_PAGE_SIZE, customersApi } from '@/lib/api/endpoints/adminTools';
import type { Customer } from '@/lib/domain/adminTools';
import { Badge, Button, Table, type Column, PageHeader } from '@/ui/primitives';
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
  const [filter, setFilter] = useState({ q: '', tier: '', page: 0 });
  const loader = useCallback(() => customersApi.list(filter.q, filter.tier, filter.page), [filter]);
  const { rows, loading, error, reload } = useAdminList(loader);

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
          setFilter({ q: String(data.get('q') ?? ''), tier: String(data.get('tier') ?? ''), page: 0 });
        }}
      >
        <label>
          Tên, email hoặc điện thoại
          <input name="q" />
        </label>
        <label>
          Hạng thành viên
          <input name="tier" placeholder="Tất cả" />
        </label>
        <Button type="submit">Tìm kiếm</Button>
      </form>
      <section className={styles.results} aria-label="Danh sách khách hàng" aria-busy={loading}>
        <div className={styles.resultHeader}>
          <h2>Khách hàng</h2>
          {!loading && !error && <span>{rows.length} khách trên trang này</span>}
        </div>
        {loading || error || rows.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={() => void reload()}
            errorTitle="Chưa tải được khách hàng"
            emptyTitle="Không tìm thấy khách hàng"
            emptyDescription="Thử tìm theo tên, email hoặc số điện thoại khác."
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
            hasNext={rows.length === ADMIN_LIST_PAGE_SIZE}
            onPrevious={() => setFilter({ ...filter, page: filter.page - 1 })}
            onNext={() => setFilter({ ...filter, page: filter.page + 1 })}
          />
        )}
      </section>
    </div>
  );
}
