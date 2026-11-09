import { cache } from 'react';
import { siteImageSlotsApi } from '@/lib/api/endpoints/siteImageSlots';
import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';

/** Public image references are editorial content; no session cookie is forwarded. */
export const publicSiteImages = cache(async (): Promise<readonly SiteImageSlot[]> => {
  try {
    return await siteImageSlotsApi.publicList();
  } catch {
    // The guide remains readable when the CMS/API is temporarily unavailable.
    return [];
  }
});
