import { api } from '../client';

export type CustomerProfile = {
  fullName: string;
  email: string;
  phone: string;
  locale: string;
  tier: string | null;
  points: number;
};

export const customerProfileApi = {
  get: (cookieHeader?: string) => api.get<CustomerProfile>('/api/v1/me/profile', cookieHeader === undefined ? {} : { cookieHeader }),
  update: (profile: Pick<CustomerProfile, 'fullName' | 'phone' | 'locale'>) => api.put<CustomerProfile>('/api/v1/me/profile', profile),
} as const;
