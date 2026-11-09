import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PolicyManager } from '@/features/policy/PolicyManager';
import { policyList } from '@/features/policy/server';
import { PropertyPageHeader } from '@/features/property/PropertyPageHeader';
import { propertyTabs } from '@/features/property/tabs';
import { propertyDetail } from '@/features/property/server';
import { displayName } from '@/lib/domain/property';
import { ErrorState, Tabs } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  // Constant, like every property screen: a title built from the record would
  // differ between "absent" and "someone else's hotel" the moment either resolved.
  title: 'Chính sách — KAS Partner',
};

/**
 * Property policies.
 *
 * The property is resolved first, so a foreign or absent id renders the same
 * not-found page as the overview, information and rooms screens. The policy list
 * is scope-filtered again by the backend regardless — the frontend never treats a
 * `propertyId` in the URL as proof of ownership.
 *
 * `today` is computed here rather than in the browser: whether an `ACTIVE`
 * version is *currently* applying depends on a date comparison, and a client
 * clock could shift it.
 */
export default async function PropertyPoliciesPage({
  params,
}: {
  readonly params: Promise<{ readonly propertyId: string }>;
}) {
  const { propertyId } = await params;
  const property = await propertyDetail(propertyId);

  if (property.status === 'notFound') {
    notFound();
  }

  if (property.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Chính sách</h1>
        <ErrorState error={property.error} />
      </div>
    );
  }

  const policies = await policyList(propertyId);
  const name = displayName(property.property.names);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.page}>
      <PropertyPageHeader
        propertyId={propertyId}
        slug={property.property.slug}
        name={name}
        section="Chính sách"
        lifecycleState={property.property.lifecycleState}
      />

      <Tabs label="Khu vực quản lý khách sạn" items={propertyTabs(propertyId)} activeId="policies" />

      {policies.status === 'error' ? (
        <ErrorState error={policies.error} />
      ) : (
        <PolicyManager propertyId={propertyId} policies={policies.policies} today={today} />
      )}
    </div>
  );
}
