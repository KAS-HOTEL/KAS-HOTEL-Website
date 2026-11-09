import type { Metadata } from 'next';
import { SiteImagePage } from '@/features/siteContent/SiteImagePage';

export const metadata: Metadata = { title: 'Trang chủ — KAS Admin' };

export default function Page() {
  return <SiteImagePage page="home" />;
}
