import Link from 'next/link';
import { notFound } from 'next/navigation';
import { propertyDetail } from '@/features/property/server';
import { PropertyPageHeader } from '@/features/property/PropertyPageHeader';
import { propertyTabs } from '@/features/property/tabs';
import { roomTypeList } from '@/features/roomType/server';
import { rateGrid } from '@/features/rate/server';
import { RateCalendar } from '@/features/rate/RateCalendar';
import { rateRangeProblem } from '@/features/rate/load';
import { addDays, isIsoDate } from '@/lib/domain/availability';
import { displayName } from '@/lib/domain/property';
import { ErrorState, Tabs } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';
export const metadata = { title: 'Lịch giá — KAS Partner' };
export default async function PricingCalendar({ params, searchParams }: {
  readonly params: Promise<{ readonly propertyId: string }>;
  readonly searchParams: Promise<{ readonly from?: string; readonly to?: string }>;
}) {
  const { propertyId } = await params;
  const property = await propertyDetail(propertyId);
  if (property.status === 'notFound') notFound();
  if (property.status === 'error') return <ErrorState error={property.error} />;
  const query = await searchParams;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const from = isIsoDate(query.from) ? query.from : today;
  const to = isIsoDate(query.to) ? query.to : addDays(from, 13);
  const rangeError = rateRangeProblem(from, to);
  const [rooms, prices] = await Promise.all([roomTypeList(propertyId),
    rangeError ? Promise.resolve(null) : rateGrid(propertyId, from, to)]);
  return <div className={styles.page}>
    <PropertyPageHeader propertyId={propertyId} slug={property.property.slug}
      name={displayName(property.property.names)} section="Lịch giá" lifecycleState={property.property.lifecycleState} />
    <Tabs label="Khu vực quản lý khách sạn" items={propertyTabs(propertyId)} activeId="calendar" />
    <p>Khách sạn tự kiểm tra phòng và phản hồi yêu cầu thủ công.</p>
    <form method="get">
      <label>Từ ngày <input type="date" name="from" defaultValue={from} required /></label>{' '}
      <label>Đến ngày <input type="date" name="to" defaultValue={to} required /></label>{' '}
      <button type="submit">Xem giá</button>
    </form>
    <p><Link href={`/partner/properties/${propertyId}/rates?from=${from}&to=${to}`}>Giá cơ bản, quy tắc giá và áp giá hàng loạt</Link></p>
    {rangeError ? <p role="alert">{rangeError}</p> : rooms.status === 'error' ? <ErrorState error={rooms.error} />
      : prices?.status === 'error' ? <ErrorState error={prices.error} />
        : prices?.status === 'ok' ? <RateCalendar propertyId={propertyId} rooms={rooms.roomTypes} grid={prices.grid} /> : null}
  </div>;
}
