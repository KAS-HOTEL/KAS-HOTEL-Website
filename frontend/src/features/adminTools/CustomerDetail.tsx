'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { customersApi } from '@/lib/api/endpoints/adminTools';
import type { Customer } from '@/lib/domain/adminTools';
import { Badge, Button, Card, Dialog } from '@/ui/primitives';
import { adminError, useAdminList } from './useAdminList';
import { ListState } from './ListState';
import { ACCOUNT_STATUS_LABEL, accountStatusTone, CustomerAvatar, formatRegistered, TierBadge } from './customerDisplay';
import styles from './AdminTools.module.css';

/**
 * One customer, inside the admin layout: profile, contact details and membership,
 * with the existing edit form. Bookings are not copied here — the reservations
 * screen is searched by the customer's email, which it already supports.
 */
export function CustomerDetail({ customerId }: { readonly customerId: string }) {
  // One record through the same loader hook the lists use; an edit replaces it locally.
  const loader = useCallback(() => customersApi.get(customerId).then((found) => [found]), [customerId]);
  const { rows, loading, error, reload } = useAdminList<Customer>(loader);
  const [edited, setEdited] = useState<Customer | null>(null);
  const customer = edited !== null && edited.id === customerId ? edited : (rows[0] ?? null);
  const setCustomer = setEdited;
  const load = reload;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn">
        <Link href="/admin/customers">Danh sách khách hàng</Link>
        <span aria-hidden="true">/</span>
        <span>{customer?.fullName || 'Khách hàng'}</span>
      </nav>

      {loading || error || customer === null ? (
        <ListState
          loading={loading}
          error={error}
          onRetry={() => void load()}
          errorTitle="Chưa tải được khách hàng"
          emptyTitle="Không tìm thấy khách hàng"
          emptyDescription="Khách hàng này không tồn tại hoặc đã được gộp."
        />
      ) : (
        <>
          <header className={styles.profileHeader}>
            <CustomerAvatar customer={customer} size={64} />
            <div>
              <p className={styles.eyebrow}>{customer.customerCode ?? 'Khách hàng'}</p>
              <h1>{customer.fullName || 'Chưa có tên'}</h1>
              <Badge tone={accountStatusTone(customer.accountStatus)}>
                {ACCOUNT_STATUS_LABEL[customer.accountStatus ?? ''] ?? customer.accountStatus ?? '—'}
              </Badge>
            </div>
            <Button variant="secondary" onClick={() => { setEditing(true); setActionError(''); }}>
              Chỉnh sửa
            </Button>
          </header>

          <div className={styles.detailGrid}>
            <Card title="Liên hệ">
              <dl className={styles.facts}>
                <dt>Email</dt><dd>{customer.email || '—'}</dd>
                <dt>Số điện thoại</dt><dd>{customer.phone ?? '—'}</dd>
                <dt>Quốc gia</dt><dd>{customer.country ?? '—'}</dd>
                <dt>Ngôn ngữ</dt><dd>{customer.locale === 'vi' ? 'Tiếng Việt' : 'English'}</dd>
              </dl>
            </Card>
            <Card title="Thành viên">
              <dl className={styles.facts}>
                <dt>Ngày đăng ký</dt><dd>{formatRegistered(customer.createdAt)}</dd>
                <dt>Hạng</dt><dd><TierBadge tier={customer.tier} /></dd>
                <dt>Điểm</dt><dd>{customer.points}</dd>
                <dt>Điểm đang giữ</dt><dd>{customer.reservedPoints}</dd>
              </dl>
            </Card>
            <Card title="Đặt phòng">
              <p className={styles.muted}>Tra cứu đặt phòng theo email của khách trong màn hình Đặt phòng.</p>
              {customer.email ? (
                <Link className={styles.rowLink} href={`/partner/reservations?q=${encodeURIComponent(customer.email)}`}>
                  Xem đặt phòng của khách
                </Link>
              ) : null}
            </Card>
          </div>

          <Dialog open={editing} title="Thông tin khách hàng" onClose={() => { if (!busy) setEditing(false); }}>
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setBusy(true);
                setActionError('');
                void customersApi
                  .update(customer.id, {
                    fullName: String(data.get('name')).trim(),
                    phone: String(data.get('phone') ?? '').trim() || null,
                    country: String(data.get('country') ?? '').trim().toUpperCase() || null,
                    locale: String(data.get('locale')),
                  })
                  .then((updated) => {
                    setCustomer(updated);
                    setEditing(false);
                  })
                  .catch((caught: unknown) => setActionError(adminError(caught)))
                  .finally(() => setBusy(false));
              }}
            >
              <label>Họ tên<input name="name" defaultValue={customer.fullName} required maxLength={200} /></label>
              <label>Điện thoại<input name="phone" defaultValue={customer.phone ?? ''} maxLength={32} /></label>
              <label>Mã quốc gia<input name="country" defaultValue={customer.country ?? ''} pattern="[A-Za-z]{2}" maxLength={2} /></label>
              <label>
                Ngôn ngữ
                <select name="locale" defaultValue={customer.locale}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </label>
              {actionError && <p role="alert">{actionError}</p>}
              <Button type="submit" loading={busy} disabled={busy}>Lưu thông tin</Button>
            </form>
          </Dialog>
        </>
      )}
    </div>
  );
}
