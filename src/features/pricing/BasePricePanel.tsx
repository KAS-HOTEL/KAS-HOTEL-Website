'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminError } from '@/features/adminTools/useAdminList';
import { ratesApi } from '@/lib/api/endpoints';
import type { BaseRateView } from '@/lib/domain/rate';
import { useToast } from '@/ui/primitives';
import { formatVnd, parseVnd } from './pricing';
import type { PricingRoom } from './PricingWorkspace';
import styles from './Pricing.module.css';

/**
 * "Giá cơ bản": the price of every night with no special rule or calendar price. Saved when
 * a field loses focus or Enter is pressed; clearing a field removes the base price.
 */
export function BasePricePanel({ rooms, baseRates }: {
  readonly rooms: readonly PricingRoom[];
  readonly baseRates: readonly BaseRateView[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const byRoom = new Map(baseRates.map((rate) => [rate.roomTypeId, rate]));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    baseRates.map((rate) => [rate.roomTypeId, rate.amountMinor === null || rate.amountMinor === undefined ? '' : formatVnd(rate.amountMinor)]),
  ));
  const [saving, setSaving] = useState<string | null>(null);

  async function save(roomTypeId: string) {
    const rate = byRoom.get(roomTypeId);
    if (!rate) return;
    const next = parseVnd(values[roomTypeId] ?? '');
    if (next === (rate.amountMinor ?? null)) return;
    setSaving(roomTypeId);
    try {
      await ratesApi.setBaseRate(roomTypeId, { amountMinor: next, version: rate.version });
      show('success', next === null ? 'Đã bỏ giá cơ bản.' : `Đã lưu giá cơ bản: ${formatVnd(next)} đ.`);
      router.refresh();
    } catch (caught) {
      show('error', adminError(caught));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="base-prices">
      <h2 id="base-prices">Giá cơ bản</h2>
      <p>
        Giá cho mọi đêm không có quy tắc đặc biệt hay giá áp trên lịch. Hạng phòng chưa có giá cơ
        bản sẽ không đặt được vào những đêm đó.
      </p>
      <div className={styles.list}>
        {rooms.map((room) => {
          const rate = byRoom.get(room.id);
          return (
            <div key={room.id} className={styles.item}>
              <span>
                <strong>{room.name}</strong>
                {rate?.amountMinor === null || rate?.amountMinor === undefined ? (
                  <span className={styles.tags}><span className={`${styles.badge} ${styles.badgeWarn}`}>Chưa có giá cơ bản</span></span>
                ) : null}
              </span>
              <span className={styles.money}>
                <input type="text" inputMode="numeric" placeholder="Nhập giá" aria-label={`Giá cơ bản ${room.name}`}
                  disabled={!rate || saving === room.id}
                  value={values[room.id] ?? ''}
                  onChange={(event) => {
                    const v = parseVnd(event.target.value);
                    setValues((current) => ({ ...current, [room.id]: v === null ? '' : formatVnd(v) }));
                  }}
                  onBlur={() => void save(room.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                <em>đ</em>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
