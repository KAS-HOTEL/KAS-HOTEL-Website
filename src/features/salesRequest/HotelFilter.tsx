'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SalesQueueView } from '@/lib/api/endpoints';
import { queueHref, type QueueSearch } from './tabs';
import styles from './SalesRequest.module.css';

/**
 * The queue's one filter: which hotel.
 *
 * Choosing a hotel navigates straight away and keeps the current tab, so the list
 * and the tab counts update together. "Tất cả khách sạn" (or the clear link)
 * returns to every hotel, still on the same tab.
 */
export function HotelFilter({
  view,
  property,
  properties,
  search = {},
}: {
  readonly search?: QueueSearch;
  readonly view: 'all' | SalesQueueView;
  readonly property: string | undefined;
  readonly properties: readonly { readonly slug: string; readonly label: string }[];
}) {
  const router = useRouter();
  return (
    <div className={styles.hotelFilter}>
      <label htmlFor="queue-hotel">Khách sạn</label>
      <select
        id="queue-hotel"
        className={styles.filterControl}
        value={property ?? ''}
        onChange={(event) => router.push(queueHref(view, event.target.value || undefined, 1, search))}
      >
        <option value="">Tất cả khách sạn</option>
        {properties.map((hotel) => (
          <option key={hotel.slug} value={hotel.slug}>
            {hotel.label}
          </option>
        ))}
      </select>
      {property === undefined ? null : (
        <Link href={queueHref(view, undefined, 1, search)} className={styles.filterClear}>
          Bỏ chọn
        </Link>
      )}
    </div>
  );
}
