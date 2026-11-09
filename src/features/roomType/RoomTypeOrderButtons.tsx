'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { roomTypesApi } from '@/lib/api/endpoints/roomTypes';
import { adminError } from '@/features/adminTools/useAdminList';
import styles from './RoomType.module.css';

/**
 * Moves a room type one place up or down within its hotel.
 *
 * `order` is the hotel's room types as listed (by `sortOrder`). A move renumbers
 * the list 0, 1, 2 … in its new order and writes only the positions that change —
 * seeded room types often all share `sortOrder` 0, and swapping two equal numbers
 * would change nothing.
 */
export function RoomTypeOrderButtons({
  propertyId,
  order,
  index,
  name,
}: {
  readonly propertyId: string;
  readonly order: readonly { readonly id: string; readonly sortOrder: number }[];
  readonly index: number;
  readonly name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function move(delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const ids = order.map((row) => row.id);
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    setBusy(true);
    setError('');
    try {
      for (let position = 0; position < ids.length; position += 1) {
        const id = ids[position] as string;
        if (order.find((row) => row.id === id)?.sortOrder !== position) {
          await roomTypesApi.setOrder(propertyId, id, position);
        }
      }
      router.refresh();
    } catch (caught) {
      setError(adminError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.orderButtons}>
      <button type="button" className={styles.orderButton} disabled={busy || index === 0}
        onClick={() => void move(-1)} aria-label={`Đưa ${name} lên trước`}>↑</button>
      <button type="button" className={styles.orderButton} disabled={busy || index === order.length - 1}
        onClick={() => void move(1)} aria-label={`Đưa ${name} xuống sau`}>↓</button>
      {error ? <span role="alert" className={styles.orderError}>{error}</span> : null}
    </span>
  );
}
