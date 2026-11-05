import { api } from '../client';
import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';

const ADMIN = '/api/v1/admin/site-image-slots';
const PUBLIC = '/api/v1/public/site-image-slots';

export const siteImageSlotsApi = {
  adminList: () => api.get<SiteImageSlot[]>(ADMIN),
  update: (key: string, imageReference: string | null, enabled: boolean) =>
    api.patch<SiteImageSlot>(`${ADMIN}/${encodeURIComponent(key)}`, { imageReference, enabled }),
  publicList: () => api.get<SiteImageSlot[]>(PUBLIC),
};
