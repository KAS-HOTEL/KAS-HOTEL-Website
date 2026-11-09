import type { PropertyAdminView } from '@/lib/domain/property';

/**
 * The address, as one line.
 *
 * Joins only the parts the backend actually sent. `district` and `ward` are
 * nullable in the schema and Jackson omits absent keys entirely, so a property
 * mid-onboarding arrives with `city` alone — and *"Ho Chi Minh City"* is the
 * honest answer for it. Nothing is substituted for a missing part, and no
 * placeholder comma is left behind where one would have gone.
 *
 * Ordered ward → district → city, which is how a Vietnamese address is written.
 * `country` is not in the response (it is not writable through the doc 58 §8
 * contract), so it is not in the line either.
 */
export function formatAddress(property: PropertyAdminView): string {
  return [property.ward, property.district, property.city]
    .filter((part): part is string => part !== undefined && part.trim() !== '')
    .join(', ');
}
