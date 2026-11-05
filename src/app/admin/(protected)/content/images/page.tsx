import type { Metadata } from 'next';
import { SiteImageSlots } from '@/features/siteContent/SiteImageSlots';

export const metadata: Metadata = { title: 'Ảnh website — KAS Admin' };

export default function AdminSiteImagesPage() {
  return <SiteImageSlots />;
}
