import { api } from '../client';
import type { GuestReview, ReviewAction, Voucher, CreateVoucher, Customer, UpdateCustomer, VoucherCustomer, VoucherTier } from '@/lib/domain/adminTools';

export const ADMIN_LIST_PAGE_SIZE = 50;

export const reviewsApi = {
  list: (hotelKey: string, includeHidden: boolean, page: number) => api.get<GuestReview[]>('/api/v1/admin/reviews', { query: { hotelKey, includeHidden, page, size: ADMIN_LIST_PAGE_SIZE } }),
  moderate: (id: string, action: ReviewAction, reason: string) => api.patch<GuestReview>(`/api/v1/admin/reviews/${encodeURIComponent(id)}/moderation`, { action, reason }),
};
export const vouchersApi = {
  list: (q: string, status: string) => api.get<Voucher[]>('/api/v1/admin/vouchers', { query: { q, status } }),
  create: (body: CreateVoucher) => api.post<Voucher>('/api/v1/admin/vouchers', body),
  setStatus: (id: string, status: string) => api.patch<Voucher>(`/api/v1/admin/vouchers/${encodeURIComponent(id)}/status`, { status }),
  /** Active member tiers, for a voucher meant for some tiers. */
  tiers: () => api.get<VoucherTier[]>('/api/v1/admin/vouchers/tiers'),
  /** Customers by customer code, email or name (at least 2 characters), at most 10. */
  searchCustomers: (q: string) => api.get<VoucherCustomer[]>('/api/v1/admin/vouchers/customers', { query: { q } }),
};
/** Customer list filters; dates are YYYY-MM-DD in the business time zone, inclusive. */
export interface CustomerFilter {
  readonly q: string;
  readonly tier: string;
  readonly page: number;
  readonly registeredFrom?: string;
  readonly registeredTo?: string;
  /** Account status as shown (ACTIVE, UNVERIFIED, SUSPENDED, DISABLED, NO_ACCOUNT); absent = all. */
  readonly status?: string;
}

export const customersApi = {
  list: (q: string, tier: string, page: number) => api.get<Customer[]>('/api/v1/admin/customers', { query: { q, tier, page, size: ADMIN_LIST_PAGE_SIZE } }),
  /** One page plus the total match count (X-Total-Count), filtered on the server. */
  search: (filter: CustomerFilter, onTotal?: (total: number | null) => void) =>
    api.get<Customer[]>('/api/v1/admin/customers', {
      query: {
        q: filter.q, tier: filter.tier, page: filter.page, size: ADMIN_LIST_PAGE_SIZE,
        registeredFrom: filter.registeredFrom || undefined, registeredTo: filter.registeredTo || undefined,
        status: filter.status || undefined,
      },
      onHeaders: (headers) => {
        const raw = headers.get('X-Total-Count');
        const total = raw === null ? Number.NaN : Number(raw);
        onTotal?.(Number.isFinite(total) ? total : null);
      },
    }),
  get: (id: string) => api.get<Customer>(`/api/v1/admin/customers/${encodeURIComponent(id)}`),
  update: (id: string, body: UpdateCustomer) => api.patch<Customer>(`/api/v1/admin/customers/${encodeURIComponent(id)}`, body),
};
