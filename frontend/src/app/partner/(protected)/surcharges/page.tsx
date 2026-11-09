import { propertyList } from '@/features/property/server';
import { SurchargeManager } from '@/features/surcharge/SurchargeManager';
import { propertyLabel } from '@/lib/domain/property';

export const metadata = { title: 'Phụ thu — KAS Super Admin' };

/** Surcharges and their conditions (SUPER_ADMIN, `surcharge.manage`). */
export default async function SurchargesPage() {
  const list = await propertyList();
  const hotels = list.status === 'ok'
    ? list.properties.map((property) => ({ id: property.id, label: propertyLabel(property.names) }))
    : [];
  return <SurchargeManager hotels={hotels} />;
}
