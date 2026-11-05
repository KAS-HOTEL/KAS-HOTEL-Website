import { api } from '../client';
import type { CreatePolicyRequest, PolicyStatus, PolicyTranslationRequest, PolicyView } from '@/lib/domain/policy';
const BASE = '/api/v1/admin/policies';
export const sharedPoliciesApi = {
  list: (contextPropertyId: string, cookieHeader?: string) => api.get<(PolicyView & { scope: string })[]>(BASE, { query: { contextPropertyId }, ...(cookieHeader ? { cookieHeader } : {}) }),
  create: (contextPropertyId: string, body: CreatePolicyRequest) => api.post<PolicyView>(BASE, body, { query: { contextPropertyId } }),
  setTranslation: (contextPropertyId: string, id: string, body: PolicyTranslationRequest) => api.patch<PolicyView>(`${BASE}/${encodeURIComponent(id)}/translations`, body, { query: { contextPropertyId } }),
  setStatus: (contextPropertyId: string, id: string, status: PolicyStatus) => api.patch<PolicyView>(`${BASE}/${encodeURIComponent(id)}/status`, undefined, { query: { contextPropertyId, status } }),
};
