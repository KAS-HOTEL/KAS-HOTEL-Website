import Link from 'next/link';
import { notFound } from 'next/navigation';
import { propertyDetail } from '@/features/property/server';
import { TripRatingEditor } from '@/features/adminTools/TripRatingEditor';
import { ErrorState } from '@/ui/primitives';
import styles from '@/features/adminTools/AdminTools.module.css';

export const metadata = { title: 'Chi tiết khách sạn — KAS Admin' };
export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const result = await propertyDetail(propertyId);
  if (result.status === 'notFound') notFound();
  if (result.status === 'error') return <ErrorState error={result.error} />;
  const property = result.property;
  return <div className={styles.page}><header><h1>{property.names.vi ?? property.names.en ?? property.slug}</h1><Link href="/admin/properties">← Danh sách khách sạn</Link></header>
    <div className={styles.actions}><Link href={`/partner/properties/${property.id}`}>Hồ sơ vận hành</Link><Link href={`/partner/properties/${property.id}/media`}>Quản lý ảnh</Link></div>
    <TripRatingEditor propertyId={property.id} />
  </div>;
}
