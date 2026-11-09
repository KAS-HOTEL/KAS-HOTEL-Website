import { notFound } from 'next/navigation';
import { PricingWorkspace } from '@/features/pricing/PricingWorkspace';
import { datesFrom, readSpan, todayInVietnam } from '@/features/pricing/pricing';
import { propertyDetail, propertyList } from '@/features/property/server';
import { baseRates, rateGrid, specialRates } from '@/features/rate/server';
import { roomTypeList } from '@/features/roomType/server';
import { isIsoDate } from '@/lib/domain/availability';
import { displayName, propertyLabel } from '@/lib/domain/property';
import { roomTypeName } from '@/lib/domain/roomType';
import { ErrorState } from '@/ui/primitives';

export const metadata = { title: 'Giá phòng — KAS Super Admin' };

/**
 * One hotel's prices (SUPER_ADMIN): the rooms × nights calendar, bulk prices on selected
 * cells, base prices and special rules — one page instead of "Lịch giá" + "Giá nâng cao".
 */
export default async function PricingWorkspacePage({ params, searchParams }: {
  readonly params: Promise<{ readonly propertyId: string }>;
  readonly searchParams: Promise<{ readonly from?: string; readonly span?: string }>;
}) {
  const { propertyId } = await params;
  const query = await searchParams;
  const today = todayInVietnam();
  const from = isIsoDate(query.from) ? query.from : today;
  const span = readSpan(query.span);
  const dates = datesFrom(from, span);
  const to = dates[dates.length - 1] ?? from;

  const [property, hotels, rooms, grid, base, specials] = await Promise.all([
    propertyDetail(propertyId),
    propertyList(),
    roomTypeList(propertyId),
    rateGrid(propertyId, from, to),
    baseRates(propertyId),
    specialRates(propertyId),
  ]);
  if (property.status === 'notFound') notFound();
  if (property.status === 'error') return <ErrorState error={property.error} />;
  for (const result of [rooms, grid, base, specials]) {
    if (result.status === 'error') return <ErrorState error={result.error} />;
  }
  if (rooms.status !== 'ok' || grid.status !== 'ok' || base.status !== 'ok' || specials.status !== 'ok') return null;

  return (
    <PricingWorkspace
      // A new hotel or date range starts with nothing selected and no half-typed price.
      key={`${propertyId}|${from}|${span}`}
      propertyId={propertyId}
      name={displayName(property.property.names) ?? property.property.slug}
      lifecycleState={property.property.lifecycleState}
      hotels={hotels.status === 'ok'
        ? hotels.properties.map((hotel) => ({ id: hotel.id, name: propertyLabel(hotel.names) }))
        : [{ id: propertyId, name: displayName(property.property.names) ?? property.property.slug }]}
      rooms={rooms.roomTypes.map((room) => ({ id: room.id, name: roomTypeName(room.translations) ?? room.slug }))}
      today={today}
      from={from}
      span={span}
      dates={dates}
      grid={grid.grid}
      baseRates={base.baseRates}
      specialRates={specials.specialRates}
    />
  );
}
