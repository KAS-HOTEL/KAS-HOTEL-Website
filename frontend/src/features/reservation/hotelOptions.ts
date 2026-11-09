import { cache } from 'react';
import { publicHotelsApi } from '@/lib/api/endpoints/publicHotels';

export interface HotelOption {
  readonly slug: string;
  readonly label: string;
}

/**
 * The hotels operations filters by, from the public catalogue.
 *
 * Super Admin runs bookings and does not hold `property.manage`, so these screens
 * read what any guest can read. A filter that fails to load is an empty list: the
 * page still shows its bookings.
 */
export const hotelOptions = cache(async (): Promise<readonly HotelOption[]> => {
  try {
    const hotels = await publicHotelsApi.properties('vi');
    return hotels.map((hotel) => ({ slug: hotel.slug, label: hotel.name ?? hotel.slug }));
  } catch {
    return [];
  }
});

/** The published room types of one hotel, for the room filter and alternative offers. */
export async function roomOptions(slug: string): Promise<readonly HotelOption[]> {
  try {
    const rooms = await publicHotelsApi.roomTypes(slug, 'vi');
    return rooms.map((room) => ({ slug: room.slug, label: room.name ?? room.slug }));
  } catch {
    return [];
  }
}
