import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HotelFilters, districtsOf } from '@/features/hotel/HotelFilters';
import { HotelList } from '@/features/hotel/HotelList';
import { FindYourKasWays } from '@/features/hotel/FindYourKasWays';
import { propertiesForTripIntent } from '@/features/hotel/findYourKas';
import { amenityCopy } from '@/features/hotel/HotelAmenities';
import { searchCopy } from '@/features/hotel/requestMessages';
import { staySearchCopy } from '@/features/hotel/bookingMessages';
import { StaySearchBar } from '@/features/hotel/StaySearchBar';
import { publicAmenityTaxonomy, publicTripIntents, publishedProperties,
  publicPropertyCovers,
} from '@/features/hotel/server';
import { isSupportedLocale } from '@/config/env';
import { stayProblem } from '@/lib/domain/availability';
import { hasDates, parseStayQuery, stayQueryString } from '@/lib/domain/stay';
import { EmptyState, ErrorState } from '@/ui/primitives';
import styles from '@/features/hotel/Hotel.module.css';

type Params = { readonly locale: string };
type Query = {
  readonly district?: string;
  readonly amenity?: string;
  /** The stay the guest is searching for, carried through to each hotel. */
  readonly destination?: string;
  readonly checkIn?: string;
  readonly checkOut?: string;
  readonly adults?: string;
  readonly rooms?: string;
  readonly intent?: string;
};

/**
 * Locale-aware, unlike the constant this replaced.
 *
 * The title was hardcoded Vietnamese and `canonical` pointed at `/vi/hotels`
 * from every locale, which told a crawler the English page was a duplicate of
 * the Vietnamese one. Doc 22 §3 gives each locale its own prefix; the canonical
 * has to follow it.
 */
export async function generateMetadata({
  params,
}: {
  readonly params: Promise<Params>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    return { title: 'KAS' };
  }
  const copy = searchCopy(locale);
  return {
    title: `${copy.portfolioTitle} — KAS`,
    alternates: { canonical: `/${locale}/hotels` },
  };
}

/**
 * The published portfolio — doc 58 §3.1, `GET /public/properties`.
 *
 * Server-rendered, like the rest of the guest tree: the list is indexable, works
 * without JavaScript, and paints once rather than flashing an empty page first.
 * No client component, no cookie forwarded — the route is `@PublicEndpoint` and
 * takes no session, so the response cannot vary by who is signed in.
 *
 * <h2>Filtering happens on the server</h2>
 *
 * Doc 58 §3.1 gives the route `district` and `amenity` filters, so what is in the
 * URL is passed to the backend rather than applied to an already-fetched array. A
 * filtered portfolio is therefore a real URL: linkable, shareable and reloadable.
 *
 * The **unfiltered** portfolio is fetched as well, and only to build the district
 * options — otherwise narrowing to District 1 would leave a dropdown that could
 * only ever offer District 1. `cache()` makes the unfiltered call once per render
 * even though two code paths ask for it, and when nothing is selected the two
 * calls are the same request.
 *
 * The amenity options come from the **taxonomy** rather than from the portfolio:
 * a filter offering only amenities the visible hotels already have would narrow
 * to nothing on its first use. It is empty today — the wording is config A9 /
 * OQ-031 — and the control is simply absent until words exist.
 *
 * <h2>What this is not</h2>
 *
 * It is not the availability search. `GET /public/availability/search` is
 * **OQ-122** and its facets and response envelope are still undefined; nothing
 * on this page depends on it, and nothing here approximates it.
 *
 * <h2>An empty list is the correct answer today</h2>
 *
 * The publication predicate is `lifecycle_state IN ('OPEN','COMING_SOON',
 * 'TEMPORARILY_CLOSED')` inside the repository's SQL, and all eight seed
 * properties are `DRAFT`. So the page renders its empty state — which is a
 * success, not an error, and says why. "No hotel matched your filter" is a
 * different sentence, and gets one.
 */
export default async function HotelsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<Params>;
  readonly searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const query = await searchParams;
  const tripIntents = await publicTripIntents(locale);
  const selectedIntent = tripIntents.status === 'ok'
    ? tripIntents.intents.find((item) => item.code === query.intent)
    : undefined;
  const stay = parseStayQuery(query);
  /*
    The search bar's own "Area" and the filter panel's "District" are the same
    facet, and either may set it. The search bar wins when it carries one,
    because it is the control the guest just used.
  */
  // A submitted-but-empty dropdown arrives as `?district=`, which means "not
  // filtering" rather than "match the empty string".
  const district =
    stay.destination ??
    (query.district !== undefined && query.district.trim() !== '' ? query.district : undefined);
  const amenity =
    query.amenity !== undefined && query.amenity.trim() !== '' ? query.amenity : undefined;

  // Server-supplied, so a wrong client clock cannot move the floor.
  const today = new Date().toISOString().slice(0, 10);
  const asked = query.checkIn !== undefined || query.checkOut !== undefined;
  const stayCopy = staySearchCopy(locale);
  const problem =
    asked && !hasDates(stay)
      ? searchCopy(locale).bothDatesRequired
      : hasDates(stay)
        ? stayProblem(stay.checkIn, stay.checkOut, today, searchCopy(locale))
        : null;

  const copy = searchCopy(locale);
  const all = await publishedProperties(locale);
  const filtered = district !== undefined || amenity !== undefined || selectedIntent !== undefined;
  const fetched = district !== undefined || amenity !== undefined
    ? await publishedProperties(locale, district, amenity)
    : all;
  const result = fetched.status === 'ok' && selectedIntent !== undefined
    ? { ...fetched, properties: propertiesForTripIntent(fetched.properties, selectedIntent) }
    : fetched;
  // Cover photographs for exactly the hotels this page lists — one gallery read
  // each, in parallel, against the contract that already serves them.
  const covers =
    result.status === 'ok'
      ? await publicPropertyCovers(result.properties.map((p) => p.slug), locale)
      : {};

  // The vocabulary, not this portfolio's assignments: the filter has to offer
  // every word a guest could narrow by, and the backend answers 404-free with an
  // empty list while the wording is still config A9 / OQ-031.
  const taxonomy = await publicAmenityTaxonomy(locale);

  const districts = all.status === 'ok' ? districtsOf(all.properties) : [];
  const amenities = taxonomy.status === 'ok' ? taxonomy.amenities : [];

  return (
    <div className={styles.page}>
      <header className={styles.identity}>
        <h1 className={styles.name}>{copy.portfolioTitle}</h1>
        <p className={styles.location}>{copy.portfolioIntro}</p>
      </header>

      {tripIntents.status === 'ok' ? (
        <FindYourKasWays locale={locale} basePath={`/${locale}/hotels`}
          selectedIntent={selectedIntent?.code} intents={tripIntents.intents} />
      ) : <ErrorState error={tripIntents.error} />}

      {/*
        The booking entry point — doc 26 §7. It collects a stay and hands it to
        whichever hotel the guest opens; it does **not** narrow this list by
        availability, because the endpoint that could do that is OQ-122 and does
        not exist. The one thing it does narrow is the district, which is a real
        wired facet of `GET /public/properties`.
      */}
      <StaySearchBar
        action={`/${locale}/hotels`}
        today={today}
        stay={stay}
        districts={all.status === 'ok' ? districtsOf(all.properties) : []}
        problem={problem ?? undefined}
        copy={stayCopy}
        intent={selectedIntent?.code}
      />

      {result.status === 'error' ? (
        // The established guest error treatment. It names no host, no query and
        // no internal identifier.
        <ErrorState error={result.error} />
      ) : (
        <>
          <HotelFilters
            action={`/${locale}/hotels`}
            districts={districts}
            amenities={amenities}
            selected={district}
            selectedAmenity={amenity}
            intent={selectedIntent?.code}
            copy={copy}
            amenityCopy={amenityCopy(locale)}
          />

          {result.properties.length === 0 ? (
            // Not an alert: the request succeeded. Which sentence depends on
            // whether the guest narrowed it — "none published yet" and "none
            // matched" are different facts and only one of them is fixable by
            // the reader.
            <EmptyState
              title={filtered ? copy.portfolioNoMatchTitle : copy.portfolioEmptyTitle}
            >
              {filtered ? copy.portfolioNoMatchBody : copy.portfolioEmptyBody}
            </EmptyState>
          ) : (
            <>
              <p className={styles.resultCount}>{copy.resultCount(result.properties.length)}</p>
              {/*
                The stay rides along on each link, so a guest who chose dates
                here does not choose them again on the hotel page. The list
                itself is unchanged by them — see the note on HotelList.
              */}
              <HotelList
                properties={result.properties}
                locale={locale}
                covers={covers}
                {...(hasDates(stay) ? { stayQuery: stayQueryString(stay) } : {})}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
