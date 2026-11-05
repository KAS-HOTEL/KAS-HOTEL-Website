/**
 * A property's signature experiences — `property_experience` since V3, reachable
 * through the product since Step 16A.47.
 *
 * This is the record the publish checklist has always required and nothing could
 * write: doc 52 §3.1 makes "≥1 signature experience" a CONFIRMED invariant, so
 * until this route existed no property could be published at all.
 *
 * **Three fields, deliberately.** Doc 23 §5 proposes five; the owner's 16A.47
 * ruling omits `timeOfDay` (the enum has no members in any document) and `image`
 * (`media_owner_type` has no `EXPERIENCE`, and OQ-106 leaves no bytes to link).
 * Neither is sent, and the backend rejects either outright rather than dropping
 * it silently.
 */

/** `ExperienceView` — the admin surface, text returned as well as accepted. */
export interface ExperienceView {
  readonly id: string;
  /** Title per locale. Always present — an experience cannot exist without one. */
  readonly titles: Readonly<Record<string, string>>;
  /** Description per locale. A locale appears only when it has one. */
  readonly descriptions: Readonly<Record<string, string>>;
  readonly sortOrder: number;
}

export interface ExperienceTranslationRequest {
  readonly title: string;
  readonly description?: string;
}

export interface ExperienceWriteRequest {
  readonly translations: Readonly<Record<string, ExperienceTranslationRequest>>;
  readonly sortOrder?: number;
}

/**
 * The title to show a Partner, preferring Vietnamese — the console's language.
 *
 * Returns `null` rather than a placeholder when no locale has one. The backend
 * makes that impossible on create, so a null here means the row predates the API
 * (the test fixtures wrote bare rows to satisfy the gate), and saying "no title"
 * beats inventing one.
 */
export function experienceTitle(experience: ExperienceView): string | null {
  for (const locale of ['vi', 'en']) {
    const candidate = experience.titles[locale];
    if (candidate !== undefined && candidate.trim() !== '') {
      return candidate;
    }
  }
  return null;
}

/**
 * The `sortOrder` a newly added experience should take.
 *
 * One past the highest in use, so a new one lands at the end of the guest list
 * rather than silently displacing the experience already leading it.
 */
export function nextSortOrder(experiences: readonly ExperienceView[]): number {
  return experiences.reduce((max, experience) => Math.max(max, experience.sortOrder + 1), 0);
}

/**
 * The two experiences a move would swap, or `null` when the item is already at
 * that end of the list.
 *
 * Reordering is expressed as a swap of two `sortOrder` values rather than a
 * renumbering of the whole list: it is two PATCHes instead of N, and it cannot
 * leave the list half-renumbered if the second one fails.
 *
 * The list is assumed to arrive in the backend's order (`sort_order`, then id),
 * which it always does.
 */
export function swapTargets(
  experiences: readonly ExperienceView[],
  id: string,
  direction: 'up' | 'down',
): { readonly moving: ExperienceView; readonly other: ExperienceView } | null {
  const index = experiences.findIndex((experience) => experience.id === id);
  if (index === -1) {
    return null;
  }
  const otherIndex = direction === 'up' ? index - 1 : index + 1;
  const moving = experiences[index];
  const other = experiences[otherIndex];
  if (moving === undefined || other === undefined) {
    return null;
  }
  return { moving, other };
}

/**
 * The two `sortOrder` values a swap should write.
 *
 * When both already share a value — which the schema allows, since `sort_order`
 * defaults to 0 and nothing makes it unique — swapping them would change
 * nothing, so the mover is nudged one either side instead. Without this, a list
 * of experiences all left at 0 would silently refuse to reorder.
 */
export function swappedOrders(
  moving: ExperienceView,
  other: ExperienceView,
  direction: 'up' | 'down',
): { readonly movingTo: number; readonly otherTo: number } {
  if (moving.sortOrder !== other.sortOrder) {
    return { movingTo: other.sortOrder, otherTo: moving.sortOrder };
  }
  return direction === 'up'
    ? { movingTo: other.sortOrder - 1, otherTo: other.sortOrder }
    : { movingTo: other.sortOrder + 1, otherTo: other.sortOrder };
}
