import { cookies } from 'next/headers';
import { propertyList } from '@/features/property/server';
import { PolicyManager } from '@/features/policy/PolicyManager';
import { sharedPoliciesApi } from '@/lib/api/endpoints/sharedPolicies';
import { ApiError } from '@/lib/api/errors';
import { Button, ErrorState, PageHeader } from '@/ui/primitives';
import styles from '@/features/adminTools/AdminTools.module.css';

export const metadata = { title: 'Chính sách dùng chung — KAS' };
export default async function Page({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  const list = await propertyList();
  if (list.status === 'error') return <ErrorState error={list.error} />;
  const query = await searchParams;
  const selected = list.properties.find((property) => property.id === query.propertyId) ?? list.properties[0];
  const frame = <form className={styles.actions}><label>Chọn khách sạn thuộc nhóm áp dụng <select name="propertyId" defaultValue={selected?.id}>{list.properties.map((property) => <option key={property.id} value={property.id}>{property.names.vi ?? property.slug}</option>)}</select></label><Button type="submit">Xem chính sách</Button></form>;
  if (!selected) return <div className={styles.page}><PageHeader eyebrow="Khách sạn" title="Chính sách dùng chung" description="Cần có khách sạn để chọn nhóm áp dụng chính sách." /></div>;
  let policies;
  let failure: unknown;
  try { policies = await sharedPoliciesApi.list(selected.id, (await cookies()).toString()); }
  catch (caught) { failure = caught; }
  return <div className={styles.page}>
    <PageHeader eyebrow="Khách sạn" title="Chính sách dùng chung" description="Áp dụng cho các khách sạn cùng đối tác. Chính sách riêng của từng khách sạn được ưu tiên khi có." />
    {frame}
    {policies ? <PolicyManager propertyId={selected.id} shared policies={policies.filter((policy) => policy.scope === 'SHARED')}
      today={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())} />
      : failure instanceof ApiError ? <ErrorState error={failure} /> : <p role="alert">Không tải được chính sách.</p>}
  </div>;
}
