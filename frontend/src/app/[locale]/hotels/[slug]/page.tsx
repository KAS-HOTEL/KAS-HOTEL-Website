import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AvailabilityPanel } from '@/features/hotel/AvailabilityPanel';
import { HotelAmenities, amenityCopy } from '@/features/hotel/HotelAmenities';
import { HotelFacilities, facilityCopy } from '@/features/hotel/HotelFacilities';
import { HotelLandmarks, landmarkCopy } from '@/features/hotel/HotelLandmarks';
import { HotelExperiences, experienceCopy } from '@/features/hotel/HotelExperiences';
import { HotelPolicies, policyCopy } from '@/features/hotel/HotelPolicies';
import { HotelRoomTypes, roomTypeCopy } from '@/features/hotel/HotelRoomTypes';
import { PropertyGallery } from '@/features/hotel/PropertyGallery';
import { searchCopy } from '@/features/hotel/requestMessages';
import { roomSelectionCopy, staySearchCopy } from '@/features/hotel/bookingMessages';
import { StaySearchBar } from '@/features/hotel/StaySearchBar';
import { guestMessageFor } from '@/features/hotel/load';
import {
  publicAvailability,
  publicFacilities,
  publicPolicies,
  publicProperty,
  publicPropertyGallery,
  publicRoomGalleries,
  publicRoomTypes,
} from '@/features/hotel/server';
import { isSupportedLocale } from '@/config/env';
import {
  isBookable,
  locationLabel,
  notBookableReason,
  stayProblem,
} from '@/lib/domain/availability';
import { hasDates, parseSelection, parseStayQuery, stayQueryString } from '@/lib/domain/stay';
import { Badge, Breadcrumb, EmptyState, ErrorState } from '@/ui/primitives';
import styles from '@/features/hotel/Hotel.module.css';

type Params = { readonly locale: string; readonly slug: string };

/**
 * Everything the booking journey keeps in the URL — doc 26 §7's entry point,
 * made linkable.
 *
 * `room` repeats (`room=deluxe:2&room=suite:1`), which is why it is typed as
 * either one value or many: that is how Next hands a repeated key over.
 */
type Query = {
  readonly checkIn?: string;
  readonly checkOut?: string;
  readonly adults?: string;
  readonly rooms?: string;
  readonly room?: string | string[];
};

/**
 * Page metadata from the **published** property only.
 *
 * The name is used in the title exactly when the public endpoint returned one —
 * a `DRAFT` property is a 404 here, so its name can never reach a `<title>`, a
 * crawler or a share preview. Nothing is noindexed: this is a public page, and
 * only the two login routes carry `robots: { index: false }`.
 */
export async function generateMetadata({
  params,
}: {
  readonly params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    return { title: 'KAS' };
  }
  const property = await publicProperty(slug, locale);
  if (property.status !== 'ok') {
    return { title: 'KAS' };
  }
  const name = property.property.name ?? property.property.slug;
  const where = locationLabel(property.property);
  // Doc 23 §3.2 names shortDescription the meta description; the composed
  // name-and-location line stays as the fallback it already was.
  const description = property.property.shortDescription ?? (where === null ? null : `${name}, ${where}.`);
  return {
    title: `${name} — KAS`,
    ...(description === null ? {} : { description }),
    alternates: { canonical: `/${locale}/hotels/${slug}` },
  };
}

/**
 * One hotel, and what is bookable there.
 *
 * <h2>Two endpoints, two jobs</h2>
 *
 * Identity comes from `GET /public/properties/{slug}`, which **404s for anything
 * not published** — that is the existence gate, and it is also the privacy
 * boundary: a `DRAFT` property, another partner's property and a slug that was
 * never used are one answer. Availability comes from
 * `GET /public/availability/properties/{slug}`, which returns `200 []` for a
 * property that is not `OPEN` and so discloses nothing on its own.
 *
 * <h2>Server-rendered, the whole search in the URL</h2>
 *
 * The search bar is a plain `GET` form, so dates, party and the chosen rooms all
 * live in the query string: every search is linkable, shareable and
 * back-button-correct, and the room list, its prices and its counts are in the
 * first HTML response. Only the quote — a `POST` carrying CSRF — needs
 * JavaScript, and only the priced total is lost without it.
 *
 * <h2>Nothing is computed here</h2>
 *
 * Availability is the frozen `available_direct()` function; the price is
 * `RateResolver`'s. A room type the backend cannot price is omitted upstream, so
 * there is no unpriced state to render and none is invented.
 */
export default async function HotelPage({
  params,
  searchParams,
}: {
  readonly params: Promise<Params>;
  readonly searchParams: Promise<Query>;
}) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const property = await publicProperty(slug, locale);
  if (property.status === 'notFound') {
    notFound();
  }
  if (property.status === 'error') {
    return (
      <div className={styles.page}>
        <ErrorState error={property.error} />
      </div>
    );
  }

  const hotel = property.property;
  const name = hotel.name ?? hotel.slug;
  const where = locationLabel(hotel);
  const bookable = isBookable(hotel.lifecycleState);
  const search = searchCopy(locale);
  const selectionCopy = roomSelectionCopy(locale);
  const closedReason = notBookableReason(hotel.lifecycleState, search);

  // Server-supplied, so a wrong client clock cannot move the floor.
  const today = new Date().toISOString().slice(0, 10);
  const query = await searchParams;
  // Dates, party and the room selection, all read out of the URL — so a search
  // is linkable, shareable and survives a reload.
  const stay = parseStayQuery(query);
  const selection = parseSelection(query.room);
  const { checkIn, checkOut } = stay;

  const asked = query.checkIn !== undefined || query.checkOut !== undefined;
  const problem =
    asked && !hasDates(stay)
      ? search.bothDatesRequired
      : hasDates(stay)
        ? stayProblem(stay.checkIn, stay.checkOut, today, search)
        : null;

  const ready = bookable && hasDates(stay) && problem === null;

  /*
    Every independent read at once.

    These were awaited one after another, which made the page as slow as the sum
    of five round trips for no reason — none of them depends on another's
    answer. Availability is in the same batch when dates were given: it needs
    dates, not the room descriptions.
  */
  const [rooms, policies, facilities, gallery, availability] = await Promise.all([
    publicRoomTypes(slug, locale),
    publicPolicies(slug, locale),
    publicFacilities(slug, locale),
    // The hotel's own photographs — PROPERTY-owned media, distinct from the
    // ROOM_TYPE media each room card carries.
    publicPropertyGallery(slug, locale),
    ready ? publicAvailability(slug, stay.checkIn, stay.checkOut, locale) : null,
  ]);

  // This one genuinely depends on the room types: the gallery contract is per
  // room-type slug, so there is nothing to ask for until they have arrived.
  const roomGalleries =
    rooms.status === 'ok'
      ? await publicRoomGalleries(slug, rooms.roomTypes.map((room) => room.slug), locale)
      : {};

  return (
    <div className={styles.page}>
      {/* Where the guest is, and the way back to the list they came from. */}
      <Breadcrumb
        items={[
          { label: search.breadcrumbHome, href: `/${locale}` },
          { label: search.breadcrumbHotels, href: `/${locale}/hotels` },
          { label: name },
        ]}
      />

      <header className={styles.identity}>
        <h1 className={styles.name}>{name}</h1>
        {/*
          Doc 67 §1 puts the signature line directly under the name in the
          property hero, and doc 52 §3.1 makes it a publish invariant — so a
          hotel a guest can reach has one, unless it is unwritten in this
          locale. Nothing stands in for it when it is absent.
        */}
        {hotel.signatureLine === undefined ? null : (
          <p className={styles.signature}>{hotel.signatureLine}</p>
        )}
        {where === null ? null : <p className={styles.location}>{where}</p>}
        {hotel.shortDescription === undefined ? null : (
          <p className={styles.lead}>{hotel.shortDescription}</p>
        )}
        {hotel.isFlagship ? (
          <div className={styles.identityBadges}>
            <Badge tone="accent">{search.flagship}</Badge>
          </div>
        ) : null}
      </header>

      {/*
        The hotel's photographs, between its name and the booking form — where a
        guest looks before reading anything. Renders nothing when the hotel has
        published none; a placeholder would read as a fault.
      */}
      <PropertyGallery images={gallery} hotelName={name} viewAllLabel={search.viewAllPhotos} />

      {closedReason === null ? null : (
        // Doc 03 §8 — COMING_SOON and TEMPORARILY_CLOSED are listed and not
        // bookable. Saying which is more useful than an empty result.
        <p className={styles.notice}>{closedReason}</p>
      )}

      {bookable ? (
        <div id="stay-search" className={styles.searchAnchor}>
          <StaySearchBar
            action={`/${locale}/hotels/${slug}`}
            today={today}
            stay={stay}
            problem={problem ?? undefined}
            copy={staySearchCopy(locale)}
            variant="stay"
          />
        </div>
      ) : null}

      {availability === null ? (
        bookable && problem === null ? (
          <EmptyState title={selectionCopy.pickDatesTitle}>{selectionCopy.pickDatesBody}</EmptyState>
        ) : null
      ) : (
        <AvailabilityPanel
          slug={slug}
          name={name}
          locale={locale}
          availability={availability}
          checkIn={checkIn as string}
          checkOut={checkOut as string}
          adults={stay.adults}
          roomsWanted={stay.rooms}
          selection={selection}
          roomTypes={rooms.status === 'ok' ? rooms.roomTypes : []}
          galleries={roomGalleries}
          retryHref={`/${locale}/hotels/${slug}?${stayQueryString(stay)}`}
        />
      )}

      {/*
        Doc 67 §1's section 5, placed exactly where that page anatomy puts it —
        above the rooms. This is the block doc 67 §2 makes a condition of
        publishing at all, and doc 66 §7 the place a hotel's rooftop is a reason
        to book rather than a tick in a list, so it is read before the room
        prices rather than after them.
      */}
      <HotelExperiences experiences={hotel.experiences} copy={experienceCopy(locale)} />

      {/*
        Doc 58 §3.1's room types, shown before any date search. What a hotel
        offers is a fact about the hotel; whether a room is free on given nights
        is the availability endpoint's answer, and the section says so.
      */}
      {rooms.status === 'ok' ? (
        <HotelRoomTypes
          roomTypes={rooms.roomTypes}
          copy={roomTypeCopy(locale)}
          galleries={roomGalleries}
        />
      ) : (
        <EmptyState title={roomTypeCopy(locale).heading}>
          {guestMessageFor(rooms.error)}
        </EmptyState>
      )}

      {/*
        Doc 58 §3.1 — the property detail includes facilities. Above the
        amenities deliberately: doc 23 §5 makes a facility a typed content block
        with its own name and paragraph, while an amenity is a tick in a list.
        A hotel's rooftop bar is a reason to book it; "Bar" is not.

        The section renders nothing at all when a hotel has authored none, unlike
        the policies, where "none published" is itself something a guest must be
        told before agreeing to terms.
      */}
      {facilities.status === 'ok' ? (
        <HotelFacilities facilities={facilities.facilities} copy={facilityCopy(locale)} />
      ) : null}

      {/*
        Doc 58 §3.1 — the property detail includes amenities. What this hotel
        offers, never the shared catalogue, above the policies because it is part
        of deciding rather than part of agreeing.
      */}
      <HotelAmenities amenities={hotel.amenities} copy={amenityCopy(locale)} />

      {/*
        Doc 58 §3.1 — the property detail includes landmarks, and they arrive on
        the same response as the amenities. Below both: what a hotel offers comes
        before what is near it, and doc 03 §5.2 treats the neighbourhood as
        supporting evidence rather than the reason to book.
      */}
      <HotelLandmarks landmarks={hotel.landmarks} copy={landmarkCopy(locale)} />

      {/*
        Doc 58 §3.1 — the property detail includes policies. A guest about to
        send a booking request is agreeing to terms, and until now the page asked
        them to accept policies it never showed. Rendered last, after the rooms,
        because it is what you read before deciding rather than what you came for.
      */}
      {policies.status === 'ok' ? (
        <HotelPolicies policies={policies.policies} copy={policyCopy(locale)} />
      ) : null}
    </div>
  );
}
