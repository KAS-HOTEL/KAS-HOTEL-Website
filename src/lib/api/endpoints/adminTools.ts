import { api } from '../client';
import type { GuestReview, ReviewAction, Voucher, CreateVoucher, Customer, UpdateCustomer, TripRating } from '@/lib/domain/adminTools';

export const ADMIN_LIST_PAGE_SIZE = 50;

export const reviewsApi = {
  list: (hotelKey: string, includeHidden: boolean, page: number) => api.get<GuestReview[]>('/api/v1/admin/reviews', { query: { hotelKey, includeHidden, page, size: ADMIN_LIST_PAGE_SIZE } }),
  moderate: (id: string, action: ReviewAction, reason: string) => api.patch<GuestReview>(`/api/v1/admin/reviews/${encodeURIComponent(id)}/moderation`, { action, reason }),
};
export const vouchersApi = {
  list: (q: string, status: string) => api.get<Voucher[]>('/api/v1/admin/vouchers', { query: { q, status } }),
  create: (body: CreateVoucher) => api.post<Voucher>('/api/v1/admin/vouchers', body),
  setStatus: (id: string, status: string) => api.patch<Voucher>(`/api/v1/admin/vouchers/${encodeURIComponent(id)}/status`, { status }),
};
export const customersApi = {
  list: (q: string, tier: string, page: number) => api.get<Customer[]>('/api/v1/admin/customers', { query: { q, tier, page, size: ADMIN_LIST_PAGE_SIZE } }),
  get: (id: string) => api.get<Customer>(`/api/v1/admin/customers/${encodeURIComponent(id)}`),
  update: (id: string, body: UpdateCustomer) => api.patch<Customer>(`/api/v1/admin/customers/${encodeURIComponent(id)}`, body),
};
export const tripRatingsApi = {
  save: (propertyId: string, body: TripRating) => api.put<TripRating>(`/api/v1/admin/properties/${encodeURIComponent(propertyId)}/trip-rating`, body),
};
