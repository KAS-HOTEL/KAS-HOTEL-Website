import type { Metadata } from 'next';
import { SiteImagePage } from '@/features/siteContent/SiteImagePage';

export const metadata: Metadata = { title: 'Guidebook — KAS Admin' };

export default function Page() {
  return <SiteImagePage page="guidebook" />;
}
