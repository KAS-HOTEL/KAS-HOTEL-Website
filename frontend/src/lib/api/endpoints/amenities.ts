import { api } from '../client';
import type { AmenityCatalogEntry } from '@/lib/domain/roomType';

/**
 * The amenity catalogue — doc 58 §8 `/admin/amenities`, permission
 * `amenity.manage` (which the Partner's ADMIN role holds).
 *
 * <h2>Why this is fetched rather than listed in the frontend</h2>
 *
 * `RoomTypeService` refuses any code that is not in the catalogue, so a
 * hand-maintained list here would drift the moment the owner adds an amenity —
 * and the drift would show up as a Partner's save being refused for a code the
 * form itself offered. The catalogue has one home, and it is the database.
 *
 * Read-only: doc 58 §8 pairs the path with `amenity.manage`, but managing the
 * catalogue is a platform capability nothing has asked for.
 */
export const amenitiesApi = {
  /** `GET /api/v1/admin/amenities` — 56 rows today, ordered by category. */
  list: (cookieHeader?: string) =>
    api.get<AmenityCatalogEntry[]>(
      '/api/v1/admin/amenities',
      cookieHeader === undefined ? {} : { cookieHeader },
    ),
} as const;
