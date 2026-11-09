import { api } from '../client';
import type { Surcharge, SurchargeRequest, SurchargeStatus } from '@/lib/domain/surcharge';

/** Surcharge endpoints — `pricing.api.AdminSurchargeController`, permission `surcharge.manage`. */
export const surchargesApi = {
  /** All surcharges, or the all-hotels ones plus one hotel's own. */
  list: (propertyId?: string) =>
    api.get<Surcharge[]>('/api/v1/admin/surcharges', {
      query: propertyId ? { propertyId } : {},
    }),
  create: (body: SurchargeRequest) => api.post<Surcharge>('/api/v1/admin/surcharges', body),
  /** 409 `VERSION_CONFLICT` when someone else changed it first. */
  update: (id: string, body: SurchargeRequest) =>
    api.put<Surcharge>(`/api/v1/admin/surcharges/${encodeURIComponent(id)}`, body),
  setStatus: (id: string, status: SurchargeStatus) =>
    api.patch<Surcharge>(`/api/v1/admin/surcharges/${encodeURIComponent(id)}/status`, { status }),
  /** Refused (400) for a preset. */
  remove: (id: string) => api.delete<void>(`/api/v1/admin/surcharges/${encodeURIComponent(id)}`),
};
