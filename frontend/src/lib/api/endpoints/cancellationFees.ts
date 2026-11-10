import { api } from '../client';
import type { CancellationFeeRule, CancellationFeeRuleRequest } from '@/lib/domain/cancellationFee';

const BASE = '/api/v1/admin/cancellation-fees';

/** Late-cancellation fee rules — `AdminCancellationFeeController`, permission `rate.manage`. */
export const cancellationFeesApi = {
  list: () => api.get<CancellationFeeRule[]>(BASE),
  create: (body: CancellationFeeRuleRequest) => api.post<CancellationFeeRule>(BASE, body),
  /** 409 `VERSION_CONFLICT` when someone else changed it first. */
  update: (id: string, body: CancellationFeeRuleRequest) =>
    api.put<CancellationFeeRule>(`${BASE}/${encodeURIComponent(id)}`, body),
  /** Refused (400) once a cancellation request used the rule: turn it off instead. */
  remove: (id: string) => api.delete<void>(`${BASE}/${encodeURIComponent(id)}`),
};
