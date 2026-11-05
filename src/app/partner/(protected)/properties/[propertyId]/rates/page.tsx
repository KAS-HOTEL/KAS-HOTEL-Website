import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PropertyPageHeader } from '@/features/property/PropertyPageHeader';
import { propertyTabs } from '@/features/property/tabs';
import { propertyDetail } from '@/features/property/server';
import { AdvancedPricing } from '@/features/rate/AdvancedPricing';
import { baseRates, rateRules } from '@/features/rate/server';
import { roomTypeList } from '@/features/roomType/server';
import { addDays } from '@/lib/domain/availability';
import { displayName } from '@/lib/domain/property';
import { ErrorState, Tabs } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  title: 'Giá nâng cao — KAS Partner',
};

/** The range a bulk apply defaults to, when the operator arrived without one. */
const DEFAULT_SPAN_DAYS = 14;

/**
 * Advanced pricing — the machinery behind the daily calendar.
 *
 * <h2>What moved off this page</h2>
 *
 * The price grid. Room counts and prices are one screen now, at `/calendar`, and
 * the daily act of repricing a night happens there. What is left here is what is
 * genuinely not daily: the base rate a night falls back to, the seasonal rules
 * that override it across a range, and the bulk apply that writes them.
 *
 * <p>The URL is unchanged so existing links still work, and the tab strip no
 * longer points at it — the calendar does, through one link. Nothing about the
 * rule engine was removed: `RateResolver` still resolves every price a guest is
 * quoted through it.
 *
 * <p>The grid read (`GET /admin/rates/grid`) is no longer issued here, because
 * nothing on this page renders a cell. Rules and base rates are both
 * range-independent, so this screen makes two calls where it used to make three.
 */
export default async function PropertyRatesPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly propertyId: string }>;
  readonly searchParams: Promise<{ readonly from?: string; readonly to?: string }>;
}) {
  const { propertyId } = await params;
  const property = await propertyDetail(propertyId);

  if (property.status === 'notFound') {
    notFound();
  }

  if (property.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Giá nâng cao</h1>
        <ErrorState error={property.error} />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const query = await searchParams;
  const from = isIsoDate(query.from) ? query.from : today;
  const to = isIsoDate(query.to) ? query.to : addDays(from, DEFAULT_SPAN_DAYS - 1);

  const name = displayName(property.property.names);

  // Both range-independent, so they run together and neither waits on the other.
  const [rooms, ruleList, bases] = await Promise.all([
    roomTypeList(propertyId),
    rateRules(propertyId),
    baseRates(propertyId),
  ]);

  return (
    <div className={styles.page}>
      <PropertyPageHeader
        propertyId={propertyId}
        slug={property.property.slug}
        name={name}
        section="Giá nâng cao"
        lifecycleState={property.property.lifecycleState}
      />

      <Tabs label="Khu vực quản lý khách sạn" items={propertyTabs(propertyId)} activeId="calendar" />

      {rooms.status === 'error' ? (
        <ErrorState error={rooms.error} />
      ) : ruleList.status === 'error' ? (
        <ErrorState error={ruleList.error} />
      ) : bases.status === 'error' ? (
        <ErrorState error={bases.error} />
      ) : (
        <AdvancedPricing
          propertyId={propertyId}
          propertyName={name ?? property.property.slug}
          roomTypes={rooms.roomTypes}
          rules={ruleList.rules}
          baseRates={bases.baseRates}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}

function isIsoDate(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
