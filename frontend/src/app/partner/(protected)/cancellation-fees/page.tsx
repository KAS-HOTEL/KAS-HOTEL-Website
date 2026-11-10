import { propertyList } from '@/features/property/server';
import { CancellationFeeManager } from '@/features/cancellationFee/CancellationFeeManager';
import { propertyLabel } from '@/lib/domain/property';

export const metadata = { title: 'Phí huỷ phòng — KAS Super Admin' };

/** Late-cancellation fees (SUPER_ADMIN, `rate.manage`), under Giá phòng. */
export default async function CancellationFeesPage() {
  const list = await propertyList();
  const hotels = list.status === 'ok'
    ? list.properties.map((property) => ({ id: property.id, label: propertyLabel(property.names) }))
    : [];
  return <CancellationFeeManager hotels={hotels} />;
}
