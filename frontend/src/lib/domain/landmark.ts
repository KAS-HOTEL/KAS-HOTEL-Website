/**
 * A property's nearby landmarks — doc 23 §3.3's `nearbyLandmarks[]`,
 * `{ name (localised), type, distanceMetres, walkingMinutes }`, stored in
 * `property_landmark` since V3.
 *
 * `type` is free text: the column is bare `text` with no check constraint and
 * doc 23 §3.3 lists it as a plain field rather than an enum. Inventing a
 * vocabulary would exclude a real place for want of a category.
 */

import { present } from './reservation';

/** `LandmarkView` — the admin surface, text returned as well as accepted. */
export interface LandmarkView {
  readonly id: string;
  readonly type: string | null;
  /** Name per locale. Always present — a landmark cannot exist without one. */
  readonly names: Readonly<Record<string, string>>;
  /** Description per locale. A locale appears only when it has one. */
  readonly descriptions: Readonly<Record<string, string>>;
  /** Null when unmeasured. Doc 03 §5.2 wants verified distances, not guesses. */
  readonly distanceMetres: number | null;
  readonly walkingMinutes: number | null;
  readonly sortOrder: number;
}

export interface LandmarkTranslationRequest {
  readonly name: string;
  readonly description?: string;
}

export interface LandmarkWriteRequest {
  readonly type?: string | null;
  readonly translations: Readonly<Record<string, LandmarkTranslationRequest>>;
  readonly distanceMetres?: number | null;
  readonly walkingMinutes?: number | null;
  readonly sortOrder?: number;
}

/**
 * The name to show a Partner, preferring Vietnamese.
 *
 * Returns `null` rather than a placeholder when no locale has one — which the
 * backend makes impossible on create, so a null here means the row predates the
 * API, and saying "no name" beats inventing one.
 */
export function landmarkName(landmark: LandmarkView): string | null {
  for (const locale of ['vi', 'en']) {
    const candidate = landmark.names[locale];
    if (candidate !== undefined && candidate.trim() !== '') {
      return candidate;
    }
  }
  return null;
}

/**
 * The `sortOrder` a newly added landmark should take.
 *
 * One past the highest in use, so a new place lands at the end of the guest list
 * rather than silently displacing one already there.
 */
export function nextSortOrder(landmarks: readonly LandmarkView[]): number {
  return landmarks.reduce((max, landmark) => Math.max(max, landmark.sortOrder + 1), 0);
}

/**
 * How far away, for the console — the same rule the guest page uses: metres
 * below a kilometre, kilometres to one decimal above it.
 *
 * Returns `null` when the hotel has measured neither. Nothing is derived from
 * the other measure.
 */
export function landmarkDistanceLabel(landmark: LandmarkView): string | null {
  const parts: string[] = [];
  /*
    `present`, not `!== null`.

    The backend runs with `spring.jackson.default-property-inclusion: non_null`
    and both of these are nullable `Integer`s, so an unmeasured landmark does
    not arrive as `null` — the key is absent and the value is `undefined`. The
    declared type says `number | null`, so TypeScript never questioned it, and
    `undefined !== null` is true: an unmeasured landmark rendered
    "undefined phút đi bộ" and, because `undefined < 1000` is false,
    "NaN km" beside it.
  */
  if (present(landmark.walkingMinutes)) {
    parts.push(`${landmark.walkingMinutes} phút đi bộ`);
  }
  if (present(landmark.distanceMetres)) {
    parts.push(
      landmark.distanceMetres < 1000
        ? `${landmark.distanceMetres} m`
        : `${(landmark.distanceMetres / 1000).toFixed(1)} km`,
    );
  }
  return parts.length === 0 ? null : parts.join(' · ');
}
