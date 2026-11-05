'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { PropertySwitcher, type SwitchableProperty } from './PropertySwitcher';

/**
 * The property sections that mean the same thing under any property.
 *
 * <p>Each is one segment below `/partner/properties/{id}` and takes no further
 * identifier, so carrying it across a switch lands on the same screen for the
 * new hotel. Anything deeper —
 * `/rooms/{roomTypeId}/media`, say — is addressed by an id belonging to the
 * hotel being left, and following it across would produce a not-found page. That
 * case goes to the new property's overview instead, which is the honest answer.
 */
const CARRIED_SECTIONS: ReadonlySet<string> = new Set([
  'information',
  'rooms',
  'media',
  'calendar',
  'rates',
  'policies',
]);

/**
 * Where a switch should land, given where the switcher was used.
 *
 * Exported for its own test: the interesting cases are the ones a click cannot
 * easily reach — a deep room-media URL, and a path that is not under a property
 * at all.
 */
export function destinationFor(pathname: string | null, propertyId: string): string {
  const root = `/partner/properties/${propertyId}`;
  if (pathname === null) {
    return root;
  }

  // ['partner', 'properties', '{id}', '{section}', ...anything deeper]
  const [area, group, , section, ...deeper] = pathname
    .split('/')
    .filter((segment) => segment !== '');

  const carries =
    area === 'partner' &&
    group === 'properties' &&
    // Nothing below the section: `deeper` non-empty means a room-type id or
    // similar, which belongs to the property being left.
    deeper.length === 0 &&
    section !== undefined &&
    CARRIED_SECTIONS.has(section);

  return carries ? `${root}/${section}` : root;
}

/**
 * Connects the switcher to the router.
 *
 * <h2>The URL is the property context</h2>
 *
 * Choosing a property navigates and nothing else happens. No global state is
 * mutated, no preference is written, and no request tells the backend "I am now
 * looking at this hotel" — there is no such endpoint and there should not be,
 * because scope is decided per request from the session.
 *
 * <h2>The section survives the switch</h2>
 *
 * It used to always land on `/partner/properties/{id}`, which meant an operator
 * pricing eight hotels went Giá & Tồn → switch → overview → Giá & Tồn, eight
 * times over. The switcher now keeps the section it was used from, which is what
 * "switch hotel" means to someone doing the same job across a portfolio. See
 * {@link destinationFor} for the one case it deliberately does not carry.
 *
 * That makes the context shareable, bookmarkable, restorable on reload and
 * correct in two browser tabs at once. It also means the active property is read
 * from the route rather than remembered, so it cannot drift out of step with
 * what the page is actually showing.
 *
 * <h2>Nothing is stored</h2>
 *
 * No `localStorage`, no `sessionStorage`, no cookie of our own. A remembered
 * property id would be a second, stale copy of something the URL already says,
 * and a remembered property *object* would be a copy of data the backend
 * re-authorises on every request.
 *
 * <h2>A 404 stays a 404</h2>
 *
 * If the chosen property cannot be read, the detail route renders not-found. The
 * switcher does not fall back to another property: silently redirecting would
 * hide the answer, and — where the id belonged to another partner — would turn a
 * deliberate 404 into an observable difference between "absent" and "someone
 * else's".
 */
export function PropertySwitcherControl({
  properties,
  error,
}: {
  readonly properties: readonly SwitchableProperty[];
  readonly error?: string | undefined;
}) {
  const router = useRouter();
  const params = useParams<{ propertyId?: string | string[] }>();
  const pathname = usePathname();

  const raw = params?.propertyId;
  const activeId = typeof raw === 'string' ? raw : null;

  return (
    <PropertySwitcher
      properties={properties}
      activeId={activeId}
      error={error}
      onChange={(propertyId) => router.push(destinationFor(pathname, propertyId))}
    />
  );
}
