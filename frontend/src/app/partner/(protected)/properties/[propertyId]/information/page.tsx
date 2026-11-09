import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompletenessPanel } from '@/features/property/CompletenessPanel';
import { PropertyAmenitiesPanel } from '@/features/property/PropertyAmenitiesPanel';
import { PropertyFacilitiesPanel } from '@/features/facility/PropertyFacilitiesPanel';
import { propertyFacilities } from '@/features/facility/server';
import { PropertyLandmarksPanel } from '@/features/landmark/PropertyLandmarksPanel';
import { propertyLandmarks } from '@/features/landmark/server';
import { PropertyExperiencesPanel } from '@/features/experience/PropertyExperiencesPanel';
import { propertyExperiences } from '@/features/experience/server';
import { PropertyInformationForm } from '@/features/property/PropertyInformationForm';
import { amenityCatalog } from '@/features/roomType/server';
import { messageFor } from '@/features/auth/messages';
import { PropertyPageHeader } from '@/features/property/PropertyPageHeader';
import { propertyTabs } from '@/features/property/tabs';
import { propertyDetail } from '@/features/property/server';
import { displayName } from '@/lib/domain/property';
import { ErrorState, Tabs } from '@/ui/primitives';
import styles from '@/features/property/Property.module.css';

export const metadata: Metadata = {
  // Constant, like the overview: a title built from the property would differ
  // between "absent" and "someone else's hotel" the moment either resolved.
  title: 'Thông tin khách sạn — KAS Partner',
};

/**
 * Editing a property's information.
 *
 * <h2>Server-rendered, client-submitted</h2>
 *
 * The current values and — crucially — the current `version` are loaded on the
 * server, where the `HttpOnly` session cookies can be read. The save goes from
 * the browser, because that is where the CSRF cookie lives and where
 * `lib/api` pairs it with the `X-XSRF-TOKEN` header.
 *
 * <h2>Same not-found as everywhere else</h2>
 *
 * A malformed id, an absent one and another partner's all reach the same
 * `notFound()` — `loadPropertyDetail` collapses them before this component sees
 * them, so an editor URL cannot become the one place that leaks which properties
 * exist.
 */
export default async function PropertyInformationPage({
  params,
}: {
  readonly params: Promise<{ readonly propertyId: string }>;
}) {
  const { propertyId } = await params;
  const result = await propertyDetail(propertyId);

  if (result.status === 'notFound') {
    notFound();
  }

  if (result.status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Thông tin khách sạn</h1>
        <ErrorState error={result.error} />
      </div>
    );
  }

  const { property, completeness } = result;
  const name = displayName(property.names);

  // Loaded on the server rather than in each client panel, for the reason the
  // room-type form loads the catalogue here: it is a controlled vocabulary, and
  // a picker that fetched it itself would render empty for a moment on every
  // visit.
  //
  // In parallel, not in sequence. The four share no data and none feeds the
  // next, so awaiting them one at a time made the page wait out four round trips
  // end to end where one round trip's latency was enough.
  const [catalog, facilities, landmarks, experiences] = await Promise.all([
    amenityCatalog(),
    propertyFacilities(propertyId),
    propertyLandmarks(propertyId),
    propertyExperiences(propertyId),
  ]);

  return (
    <div className={styles.page}>
      <PropertyPageHeader
        propertyId={propertyId}
        slug={property.slug}
        name={name}
        section="Thông tin"
        lifecycleState={property.lifecycleState}
      />

      <Tabs
        label="Khu vực quản lý khách sạn"
        items={propertyTabs(property.id)}
        activeId="information"
      />

      {/*
        Already fetched: propertyDetail returns the checklist alongside the
        property, and this page was destructuring only half of it. Showing it
        here costs no request and answers the one question an operator opens the
        editor with — what still has to be filled in before this hotel can be
        submitted. The overview shows the same panel; this is the screen where
        the answer is actionable.
      */}
      <CompletenessPanel completeness={completeness} />

      <PropertyInformationForm property={property} />

      {/*
        Its own panel rather than a section of the form above: the amenity route
        replaces rows in `property_amenity` and carries no `version`, while the
        form is a version-guarded PATCH of the property row. One Save button for
        two different concurrency contracts would be a lie about what it does.
      */}
      <PropertyAmenitiesPanel
        propertyId={property.id}
        assigned={property.amenityCodes}
        catalog={catalog.status === 'ok' ? catalog.amenities : []}
        catalogError={catalog.status === 'error' ? messageFor(catalog.error) : undefined}
      />

      {/*
        Doc 23 §5's typed content blocks, beside the amenities and separate from
        them on purpose: an amenity is a tick in a shared vocabulary, a facility
        is a place this hotel wrote a paragraph about.
      */}
      {facilities.status === 'ok' ? (
        <PropertyFacilitiesPanel propertyId={property.id} facilities={facilities.facilities} />
      ) : (
        <ErrorState error={facilities.error} />
      )}

      {/*
        Doc 67 §1's section 5 — placed above the landmarks, and directly after
        the hotel's own facilities, because this is the one content panel a
        property cannot be published without (doc 52 §3.1). What the hotel is
        comes before what is around it, and the publish blocker comes first of
        those.
      */}
      {experiences.status === 'ok' ? (
        <PropertyExperiencesPanel propertyId={property.id} experiences={experiences.experiences} />
      ) : (
        <ErrorState error={experiences.error} />
      )}

      {/*
        Doc 23 §3.3's nearby landmarks, which doc 58 §3.1 carries on the guest
        property detail. Last of the content panels: what the hotel is comes
        before what is around it.
      */}
      {landmarks.status === 'ok' ? (
        <PropertyLandmarksPanel propertyId={property.id} landmarks={landmarks.landmarks} />
      ) : (
        <ErrorState error={landmarks.error} />
      )}
    </div>
  );
}
