import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HotelList } from '@/features/hotel/HotelList';
import { FindYourKasWays } from '@/features/hotel/FindYourKasWays';
import { StaySearchBar } from '@/features/hotel/StaySearchBar';
import { staySearchCopy } from '@/features/hotel/bookingMessages';
import { searchCopy } from '@/features/hotel/requestMessages';
import { publishedProperties,
  publicTripIntents,
  publicPropertyCovers,
} from '@/features/hotel/server';
import { isSupportedLocale } from '@/config/env';
import { EmptyState, ErrorState } from '@/ui/primitives';
import styles from '@/features/hotel/Home.module.css';

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = searchCopy(isSupportedLocale(locale) ? locale : 'vi');
  return { title: `KAS — ${copy.homeCollectionTitle}` };
}

/**
 * The customer homepage.
 *
 * <h2>Every hotel on this page is one the backend published</h2>
 *
 * The collection below is `GET /api/v1/public/properties`, the same call the
 * `/hotels` page makes, rendered through the same `HotelList`. There is no
 * hard-coded card, no curated ordering and no count written into this file: the
 * page shows what the endpoint returns, in the order it returns it. The eight
 * seed properties are `DRAFT` today, so the endpoint returns an empty array and
 * this page says so plainly. It becomes a portfolio the moment a property is
 * opened — with no change here.
 *
 * <h2>What a hotel homepage would normally carry, and why it is absent</h2>
 *
 * The visual reference for this screen also shows a founding year, a guest
 * count, a satisfaction score, star ratings, guest testimonials, a featured
 * property with photography and a row of signature experiences. Not one of
 * those exists as data: `review` is empty, `property_experience` is empty,
 * exactly one `media_asset` has completed its upload, and no endpoint reports a
 * founding year or a guest total at all. Rendering them would mean writing
 * business claims into a React component, which is the one thing this page must
 * never do. They are listed as missing content in the slice report rather than
 * invented here.
 *
 * <h2>The search is real</h2>
 *
 * `StaySearchBar` is a plain GET form onto `/{locale}/hotels`, so a stay
 * enquiry from the homepage lands on the portfolio with its dates, party and
 * chosen area intact and no client-side state in between — and the portfolio
 * carries them on to whichever hotel the guest opens. The dates it validates
 * against come from the server, so a wrong clock on the guest's device cannot
 * move the floor.
 *
 * <p>The destination control is absent here because the homepage renders the
 * whole collection beneath the bar; there is nothing yet to narrow.
 */
export default async function CustomerHome({
  params,
}: {
  readonly params: Promise<{ readonly locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const copy = searchCopy(locale);
  const result = await publishedProperties(locale);
  const tripIntents = await publicTripIntents(locale);
  const covers =
    result.status === 'ok'
      ? await publicPropertyCovers(result.properties.map((p) => p.slug), locale)
      : {};
  // Server-supplied, for the reason StaySearchBar documents: the check-in floor
  // must not be movable by the guest's own clock.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <p className={styles.heroEyebrow}>{copy.homeEyebrow}</p>
        <h1 className={styles.heroTitle} id="home-title">
          {copy.homeTitle}
        </h1>
        <p className={styles.heroLead}>{copy.homeLead}</p>

        <div className={styles.heroSearch}>
          <StaySearchBar
            action={`/${locale}/hotels`}
            today={today}
            stay={{ adults: 1, rooms: 1 }}
            copy={staySearchCopy(locale)}
            variant="stay"
          />
        </div>
      </section>

      {tripIntents.status === 'ok' ? (
        <FindYourKasWays
          locale={locale}
          basePath={`/${locale}/hotels`}
          intents={tripIntents.intents}
        />
      ) : <ErrorState error={tripIntents.error} />}

      <section className={styles.collection} aria-labelledby="home-collection">
        <h2 className={styles.collectionTitle} id="home-collection">
          {copy.homeCollectionTitle}
        </h2>
        <p className={styles.collectionLead}>{copy.homeCollectionLead}</p>

        {result.status === 'error' ? (
          <ErrorState error={result.error} />
        ) : result.properties.length === 0 ? (
          // Not an error: the request succeeded and the answer is "none yet".
          <EmptyState title={copy.portfolioEmptyTitle}>{copy.portfolioEmptyBody}</EmptyState>
        ) : (
          <>
            <HotelList properties={result.properties} locale={locale} covers={covers} />
            <p className={styles.collectionMore}>
              <Link href={`/${locale}/hotels`} className={styles.collectionLink}>
                {copy.homeViewAll}
              </Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
